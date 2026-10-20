"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEMO_COOKIE, DEMO_STARTER, DEMO_STORAGE_KEY, buildDemo, demoStarter, parseSavedDemo } from "@/lib/demo";
import { addSet, completeSet, removeSet, summarize, uncompleteSet, updateSet } from "@/lib/session/doc";
import { trackDemo, trackDetail } from "@/lib/track";
import type { PreviousMap, SessionDoc } from "@/lib/types";
import { ExerciseCard } from "../logger/ExerciseCard";
import { buttonClass, cx } from "../styles";
import { Wordmark } from "../Wordmark";

const SIGN_UP = "/sign-in?mode=sign-up";

/** Remembers that this browser came from the demo, so the account starts with the same split. */
function markFromDemo() {
  document.cookie = `${DEMO_COOKIE}=${DEMO_STARTER}; path=/; max-age=${7 * 86400}; samesite=lax; secure`;
  trackDemo("demo_signup");
}

/**
 * The real set logger on example data, with no account: change a weight, enter reps, tick a
 * set. Saved on this phone only (so a refresh keeps it); nothing is sent anywhere.
 */
export function DemoWorkout({ cta }: { cta: string }) {
  const [state, setState] = useState<{ doc: SessionDoc; previous: PreviousMap } | null>(null);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const newId = () => crypto.randomUUID();

  useEffect(() => {
    const fresh = buildDemo(new Date(), () => crypto.randomUUID());
    let saved: SessionDoc | null = null;
    try {
      saved = parseSavedDemo(window.localStorage.getItem(DEMO_STORAGE_KEY));
    } catch {
      /* storage blocked: start fresh */
    }
    // Loaded after mount so the server render never depends on this phone's storage or clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ doc: saved ?? fresh.doc, previous: fresh.previous });
    trackDemo("demo_start");
  }, []);

  function edit(fn: (d: SessionDoc) => SessionDoc) {
    setState((s) => {
      if (!s) return s;
      const doc = fn(s.doc);
      try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(doc));
      } catch {
        /* storage full or blocked: the demo still works for this visit */
      }
      return { ...s, doc };
    });
  }

  function restart() {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setState(buildDemo(new Date(), () => crypto.randomUUID()));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const summary = state ? summarize(state.doc) : null;
  const done = summary?.completedSets ?? 0;
  const all = summary ? done > 0 && done >= summary.plannedSets : false;

  // How far the demo got (once each per tab session): three sets, then every set.
  useEffect(() => {
    if (done >= 3) trackDetail("demo_progress", "three_sets");
    if (all) trackDetail("demo_progress", "finished");
  }, [done, all]);
  const starter = demoStarter();

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-safe pb-40">
      <header className="flex h-14 items-center justify-between gap-2">
        <Link href="/" aria-label="NotchLift home"><Wordmark /></Link>
        <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold tracking-[0.14em] text-muted uppercase">Demo</span>
      </header>

      <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">{starter.name} · Workout</p>
      <h1 className="mt-1 text-[32px] leading-tight font-semibold tracking-[-0.02em]">{state?.doc.template_name ?? starter.workouts[0].name}</h1>
      <div className="mt-3 rounded-2xl border border-dashed border-accent-text/50 px-4 py-3 text-[15px]">
        <p className="font-medium">Try it: this is how a workout feels in NotchLift.</p>
        <p className="mt-1 text-muted">
          Tap ✓ to log a set. Change the weight or reps first if you like. “Last time” shows example numbers; in your account it’s your own. Nothing is saved to an account.
        </p>
      </div>

      {summary ? (
        <div className="mt-4 flex items-center gap-3" aria-live="polite">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${summary.plannedSets ? (done / summary.plannedSets) * 100 : 0}%` }} />
          </div>
          <span className="text-sm text-muted tabular">{done} / {summary.plannedSets} sets</span>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {state?.doc.exercises.map((entry) => (
          <ExerciseCard
            key={entry.id}
            demo
            entry={entry}
            previous={state.previous[entry.exercise_id]}
            timeZone={timeZone}
            unit="kg"
            onSetChange={(setId, patch) => edit((d) => updateSet(d, entry.id, setId, patch))}
            onComplete={(setId) => {
              edit((d) => {
                const r = completeSet(d, entry.id, setId, new Date());
                return "doc" in r ? r.doc : d;
              });
              trackDemo("demo_set");
            }}
            onUncomplete={(setId) => edit((d) => uncompleteSet(d, entry.id, setId))}
            onAddSet={(type) => edit((d) => addSet(d, entry.id, type, state.previous, newId))}
            onRemoveSet={(setId) => edit((d) => removeSet(d, entry.id, setId))}
            onOpenMenu={() => undefined}
            onOpenSetMenu={() => undefined}
            onUnskip={() => undefined}
            onHideTarget={() => undefined}
            onUseTarget={() => undefined}
            onSwap={() => undefined}
          />
        ))}
      </div>

      {all ? (
        <section aria-labelledby="demo-done" className="mt-6 rounded-3xl border border-accent-text/60 bg-surface p-5">
          <h2 id="demo-done" className="text-[22px] font-semibold tracking-[-0.01em]">Workout done 💪</h2>
          <p className="mt-2 text-muted">
            That’s NotchLift. In your account, today’s sets become “last time” for your next session, so you always know the number to beat, and it tells you when to go heavier.
          </p>
          <p className="mt-2 text-muted">Create an account and {starter.name} will be ready for your first real session.</p>
          <Link href={SIGN_UP} onClick={markFromDemo} className={buttonClass("primary", "lg", "mt-4 w-full")}>{cta}</Link>
          <button type="button" onClick={restart} className="mt-2 h-11 w-full text-sm text-muted underline-offset-4 hover:underline">Start the demo again</button>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <p className={cx("min-w-0 flex-1 text-sm", done ? "text-fg" : "text-muted")}>
            {done ? "Like it? Keep going for real." : "Tap ✓ on a set to see how it works."}
          </p>
          <Link href={SIGN_UP} onClick={markFromDemo} className={buttonClass(done ? "primary" : "secondary", "md", "shrink-0")}>
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
