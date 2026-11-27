import UIKit
import Capacitor
import HealthKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SetmodoViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The app's web view, plus Setmodo's own native plugins (kept in this file so the Xcode
/// project needs no new files).
class SetmodoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthWorkoutsPlugin())
    }
}

/// Saves finished workouts to Apple Health as Traditional Strength Training, with estimated active
/// calories when the app sends them (1.3+). Write-only: it asks to save workouts and active energy,
/// and never reads anything from Health. Used by src/lib/native-health.ts.
@objc(HealthWorkoutsPlugin)
public class HealthWorkoutsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthWorkoutsPlugin"
    public let jsName = "HealthWorkouts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!

    private func status(for type: HKObjectType) -> String {
        switch store.authorizationStatus(for: type) {
        case .sharingAuthorized: return "granted"
        case .sharingDenied: return "denied"
        default: return "unknown"
        }
    }

    private func shareStatus() -> String { status(for: HKObjectType.workoutType()) }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable(), "calories": true])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["status": "unavailable"])
            return
        }
        store.requestAuthorization(toShare: [HKObjectType.workoutType(), energyType], read: nil) { _, _ in
            call.resolve(["status": self.shareStatus(), "calories": self.status(for: self.energyType)])
        }
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), shareStatus() == "granted" else {
            call.resolve(["saved": false])
            return
        }
        guard let startMs = call.getDouble("start"), let endMs = call.getDouble("end"), endMs > startMs else {
            call.reject("invalid_range")
            return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        var metadata: [String: Any] = [HKMetadataKeyWorkoutBrandName: "Setmodo"]
        if let id = call.getString("id") { metadata[HKMetadataKeyExternalUUID] = id }
        let kcal = call.getDouble("kcal") ?? 0
        let energyType = self.energyType
        let addCalories = kcal > 0 && store.authorizationStatus(for: energyType) == .sharingAuthorized

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        builder.beginCollection(withStart: start) { began, _ in
            guard began else {
                call.resolve(["saved": false])
                return
            }
            builder.addMetadata(metadata) { _, _ in
                let finish = {
                    builder.endCollection(withEnd: end) { ended, _ in
                        guard ended else {
                            call.resolve(["saved": false])
                            return
                        }
                        builder.finishWorkout { workout, _ in
                            call.resolve(["saved": workout != nil])
                        }
                    }
                }
                guard addCalories else {
                    finish()
                    return
                }
                // One estimated active-energy sample spanning the workout; Health shows it as the
                // workout's calories (and counts it towards the Move ring).
                let energy = HKQuantitySample(
                    type: energyType,
                    quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                    start: start,
                    end: end,
                    metadata: [HKMetadataKeyWasUserEntered: false]
                )
                builder.add([energy]) { _, _ in finish() }
            }
        }
    }
}
