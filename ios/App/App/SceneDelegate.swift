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

/// Saves finished workouts to Apple Health as Traditional Strength Training. Write-only: it asks
/// to save workouts and never reads anything from Health. Used by src/lib/native-health.ts.
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

    private func shareStatus() -> String {
        switch store.authorizationStatus(for: HKObjectType.workoutType()) {
        case .sharingAuthorized: return "granted"
        case .sharingDenied: return "denied"
        default: return "unknown"
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["status": "unavailable"])
            return
        }
        store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: nil) { _, _ in
            call.resolve(["status": self.shareStatus()])
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

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        builder.beginCollection(withStart: start) { began, _ in
            guard began else {
                call.resolve(["saved": false])
                return
            }
            builder.addMetadata(metadata) { _, _ in
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
        }
    }
}
