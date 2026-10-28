import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS app: a native shell that loads the live site, so the web app stays the one place
 * features are built. Native extras (push, Sign in with Apple, in-app purchase) are called
 * from the site through Capacitor's bridge when it runs inside the app (see src/lib/native.ts).
 *
 * native-shell/ holds only the page shown when the site can't be reached on first launch.
 */
const config: CapacitorConfig = {
  appId: "com.notchlift.app",
  appName: "NotchLift",
  webDir: "native-shell",
  // The site checks for this to tell it's inside the app (src/lib/native.ts).
  appendUserAgent: "NotchLiftApp/1",
  backgroundColor: "#131416",
  server: {
    url: "https://www.notchlift.com/train",
    errorPath: "offline.html",
  },
  ios: {
    // Matches the app's dark background behind the status bar and while pages load.
    backgroundColor: "#131416",
    contentInset: "never",
    // With WKAppBoundDomains in Info.plist, the site's service worker (offline logging) works
    // inside the app; links to other sites open in Safari.
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#131416",
      showSpinner: false,
    },
  },
};

export default config;
