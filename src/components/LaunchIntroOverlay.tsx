import { NATIVE_APP_UA } from "@/lib/native";

const SEEN_KEY = "sm-intro-seen";

/**
 * Runs before the first paint: in the iOS app, once per launch, shows the intro so the page
 * never flashes between the native splash and the animation.
 */
export const LAUNCH_INTRO_SCRIPT = `try{if(new RegExp(${JSON.stringify(NATIVE_APP_UA.source)}).test(navigator.userAgent)&&!sessionStorage.getItem("${SEEN_KEY}")){sessionStorage.setItem("${SEEN_KEY}","1");document.getElementById("launch-intro").hidden=false}}catch(e){}`;

/** The intro itself (styles in globals.css). Hidden unless the script above shows it. */
export function LaunchIntroOverlay() {
  return (
    <div id="launch-intro" className="sm-intro" hidden aria-hidden="true" suppressHydrationWarning>
      <span className="sm-intro-word">
        <span className="sm-intro-letters">setmodo</span>
        <span className="sm-intro-dot">.</span>
      </span>
    </div>
  );
}
