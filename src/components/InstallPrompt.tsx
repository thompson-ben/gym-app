"use client";

import { useState, useSyncExternalStore } from "react";
import { IconChevronRight, IconX } from "./icons";
import { Button, IconButton, Sheet } from "./ui";

type Platform = "ios" | "android" | "other";
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Not under the "splitmate:v1:" prefix, which is reserved for per-account workout data.
// (Storage keys keep the app's original name so existing devices keep their settings.)
const DISMISSED_KEY = "splitmate-install-hint-dismissed";

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function detect(): string {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const platform: Platform = ios ? "ios" : /Android/.test(ua) ? "android" : "other";
  const browser = /CriOS/.test(ua) ? "chrome" : /FxiOS/.test(ua) ? "firefox" : /EdgiOS/.test(ua) ? "edge" : "safari";
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    /* storage unavailable */
  }
  return [standalone ? "1" : "0", platform, browser, dismissed ? "1" : "0", deferred ? "1" : "0"].join("|");
}

function useInstallState() {
  const snapshot = useSyncExternalStore(subscribe, detect, () => "1|other|safari|1|0");
  const [standalone, platform, browser, dismissed, canPrompt] = snapshot.split("|");
  return { standalone: standalone === "1", platform: platform as Platform, browser, dismissed: dismissed === "1", canPrompt: canPrompt === "1" };
}

function Steps({ platform, browser, canPrompt, onInstall }: { platform: Platform; browser: string; canPrompt: boolean; onInstall: () => void }) {
  if (canPrompt) {
    return (
      <div className="space-y-3">
        <p className="text-muted">NotchLift installs like an app: its own icon, full screen, no browser bars.</p>
        <Button variant="primary" size="lg" className="w-full" onClick={onInstall}>Install NotchLift</Button>
      </div>
    );
  }
  if (platform === "ios") {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-muted">
        {browser === "safari" ? (
          <li>Tap the <strong className="text-fg">Share</strong> button (the square with an arrow) at the bottom of Safari.</li>
        ) : (
          <li>Tap the <strong className="text-fg">Share</strong> button (the square with an arrow) in the address bar.</li>
        )}
        <li>Scroll down and tap <strong className="text-fg">Add to Home Screen</strong>.</li>
        <li>Tap <strong className="text-fg">Add</strong>. Open NotchLift from the new icon from now on.</li>
      </ol>
    );
  }
  if (platform === "android") {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-muted">
        <li>Tap the browser menu <strong className="text-fg">⋮</strong> (top right).</li>
        <li>Tap <strong className="text-fg">Install app</strong> or <strong className="text-fg">Add to Home screen</strong>.</li>
        <li>Confirm. Open NotchLift from the new icon from now on.</li>
      </ol>
    );
  }
  return <p className="text-muted">Open this page on your phone, then add it to your Home Screen from the browser’s Share or menu button.</p>;
}

async function install() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => undefined);
  deferred = null;
  listeners.forEach((l) => l());
}

/** Dismissible card on Train for phone users who are still in the browser. */
export function InstallCard() {
  const s = useInstallState();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (s.standalone || s.dismissed || hidden || s.platform === "other") return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setHidden(true);
  };
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-accent-text/30 bg-accent-soft px-4 py-3">
      <button type="button" onClick={() => (s.canPrompt ? void install() : setOpen(true))} className="min-w-0 flex-1 text-left">
        <span className="block font-medium">Add NotchLift to your Home Screen</span>
        <span className="block text-sm text-muted">Opens full screen like an app. Takes 10 seconds.</span>
      </button>
      <IconButton label="Dismiss" onClick={dismiss} className="-mr-2"><IconX size={18} /></IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add to Home Screen">
        <div className="pb-2"><Steps platform={s.platform} browser={s.browser} canPrompt={s.canPrompt} onInstall={() => void install()} /></div>
      </Sheet>
    </div>
  );
}

/** Row in Profile, always available (shows "installed" when opened from the icon). */
export function InstallRow() {
  const s = useInstallState();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Add to Home Screen</span>
          <span className="block text-sm text-muted">{s.standalone ? "Installed: you’re using the app version." : "Use NotchLift like an app, full screen."}</span>
        </span>
        <IconChevronRight className="shrink-0 text-faint" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add to Home Screen">
        <div className="pb-2">
          {s.standalone ? (
            <p className="text-muted">You’re already using NotchLift from your Home Screen. Nothing else to do.</p>
          ) : (
            <Steps platform={s.platform} browser={s.browser} canPrompt={s.canPrompt} onInstall={() => void install()} />
          )}
        </div>
      </Sheet>
    </>
  );
}
