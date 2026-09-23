"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addExercise,
  addSet,
  completeSet,
  moveExercise,
  removeExercise,
  removeSet,
  setExerciseNotes,
  setSetType,
  setSkipped,
  substituteExercise,
  summarize,
  uncompleteSet,
  updateSet,
} from "@/lib/session/doc";
import { hasUnsyncedChanges, removeRecord, type LocalRecord } from "@/lib/session/store";
import { adjustTimer, clockNow, startTimer } from "@/lib/timer";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import type { Exercise, PreviousPerformance, SessionSet } from "@/lib/types";
import { ExercisePicker } from "../ExercisePicker";
import { IconAlert, IconChevronLeft, IconMore, IconPlus, IconTimer } from "../icons";
import { cx } from "../styles";
import { Button, ErrorNote, IconButton, Sheet, Toggle } from "../ui";
import { Wordmark } from "../Wordmark";
import { ExerciseCard } from "./ExerciseCard";
import { RestTimerBar } from "./RestTimer";
import { SyncBadge } from "./SyncBadge";
import { useSessionRecord } from "./useSessionRecord";

type Picker = { mode: "add" } | { mode: "substitute"; entryId: string } | null;
type SetMenu = { entryId: string; set: SessionSet; ordinal: string } | null;

export default function Logger({ userId, initial, timeZone }: { userId: string; initial: LocalRecord; timeZone: string }) {
  const router = useRouter();
  const { record, recordRef, status, online, storageFailed, edit, patch, engine } = useSessionRecord(userId, initial);
  const doc = record.doc;
  const summary = useMemo(() => summarize(doc), [doc]);
  const [picker, setPicker] = useState<Picker>(null);
  const [exerciseMenu, setExerciseMenu] = useState<string | null>(null);
  const [setMenu, setSetMenu] = useState<SetMenu>(null);
  const [notesFor, setNotesFor] = useState<string | "session" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [lastRest, setLastRest] = useState(record.settings.defaultRestSeconds);
  const newId = () => crypto.randomUUID();

  // Hide the bottom action bar while typing so the keyboard never covers inputs behind it.
  useEffect(() => {
    const onIn = (e: FocusEvent) => setInputFocused(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement);
    const onOut = () => setInputFocused(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  async function fetchPrevious(exerciseId: string) {
    if (!navigator.onLine || recordRef.current.previous[exerciseId]) return;
    const { data } = await supabaseBrowser().rpc("previous_performance", { p_exercise_ids: [exerciseId] });
    const row = (data as PreviousPerformance[] | null)?.[0];
    if (row) patch({ previous: { ...recordRef.current.previous, [exerciseId]: row } });
    return row;
  }

  async function pickExercise(exercise: Exercise) {
    const current = picker;
    setPicker(null);
    const prev = (await fetchPrevious(exercise.id)) ?? recordRef.current.previous[exercise.id];
    const previousMap = { ...recordRef.current.previous, ...(prev ? { [exercise.id]: prev } : {}) };
    if (current?.mode === "substitute") {
      let failed = false;
      edit((d) => {
        const r = substituteExercise(d, current.entryId, exercise, previousMap, newId);
        if ("error" in r) {
          failed = true;
          return d;
        }
        return r.doc;
      });
      if (failed) setNotice("This exercise already has confirmed sets. Add the new exercise instead, or undo those sets first.");
    } else {
      edit((d) => addExercise(d, exercise, previousMap, newId));
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);
    }
  }

  function startRest(seconds: number) {
    setLastRest(seconds);
    patch({ rest: startTimer(seconds, clockNow()) });
  }

  function complete(entryId: string, setId: string) {
    const entry = doc.exercises.find((e) => e.id === entryId);
    edit((d) => {
      const r = completeSet(d, entryId, setId, new Date());
      return "doc" in r ? r.doc : d;
    });
    const rest = entry?.rest_seconds ?? record.settings.defaultRestSeconds;
    setLastRest(rest);
    if (record.settings.autoStartRest) startRest(rest);
  }

  async function setAutoRest(value: boolean) {
    patch({ settings: { ...recordRef.current.settings, autoStartRest: value } });
    if (navigator.onLine) await supabaseBrowser().from("profiles").update({ auto_start_rest: value }).eq("id", userId);
  }

  async function finish() {
    setBusy(true);
    setActionError(null);
    try {
      const sync = engine.current;
      await sync?.flush();
      if (hasUnsyncedChanges(recordRef.current)) {
        setActionError(
          recordRef.current.conflict
            ? "Resolve the sync conflict first."
            : "Your latest sets have not reached the server yet. Check your connection; everything is kept on this device.",
        );
        return;
      }
      const supabase = supabaseBrowser();
      let { error } = await supabase.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: recordRef.current.baseRevision });
      if (error?.message === "revision_mismatch") {
        await sync?.flush();
        ({ error } = await supabase.rpc("finish_session", { p_session_id: doc.id, p_expected_revision: recordRef.current.baseRevision }));
      }
      if (error) {
        setActionError(friendlyError(error, "Could not finish the workout. Your sets are safe; try again."));
        return;
      }
      sync?.stop();
      removeRecord(window.localStorage, userId, doc.id);
      router.replace(`/sessions/${doc.id}?finished=1`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    setActionError(null);
    const { error } = await supabaseBrowser().rpc("discard_session", { p_session_id: doc.id });
    setBusy(false);
    if (error) {
      setActionError(friendlyError(error, "Could not discard the workout. Check your connection."));
      return;
    }
    engine.current?.stop();
    removeRecord(window.localStorage, userId, doc.id);
    router.replace("/train");
    router.refresh();
  }

  const menuEntry = doc.exercises.find((e) => e.id === exerciseMenu);
  const notesEntry = notesFor && notesFor !== "session" ? doc.exercises.find((e) => e.id === notesFor) : null;
  const progress = summary.plannedSets ? summary.completedSets / summary.plannedSets : 0;
  const closed = status.kind === "closed";

  return (
    <div className={cx("mx-auto w-full max-w-xl px-4 sm:px-6", record.rest ? "pb-[calc(15rem+env(safe-area-inset-bottom))]" : "pb-[calc(8rem+env(safe-area-inset-bottom))]")}>
      <div className="sticky top-0 z-20 -mx-4 border-b border-line/60 bg-bg/90 px-4 backdrop-blur-lg pt-safe sm:-mx-6 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-2">
          <Link href="/train" className="-ml-2 inline-flex h-11 items-center gap-0.5 rounded-2xl pr-2 pl-1 text-sm text-muted hover:text-fg" aria-label="Leave workout (it stays in progress)">
            <IconChevronLeft size={18} />
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-1">
            <SyncBadge status={status} onRetry={() => engine.current?.flush()} />
            <IconButton label="Workout options" onClick={() => setMenuOpen(true)}>
              <IconMore />
            </IconButton>
          </div>
        </div>
      </div>

      <header className="pt-5 pb-4">
        {doc.split_name ? <p className="text-sm text-muted">{doc.split_name}</p> : null}
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">{doc.template_name}</h1>
        <div className="mt-3 flex items-center gap-3">
          <p className="shrink-0 text-sm text-muted tabular">
            <span className="font-semibold text-fg">{summary.completedSets}</span> of {summary.plannedSets} sets
          </p>
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Completed sets"
            aria-valuemin={0}
            aria-valuemax={summary.plannedSets}
            aria-valuenow={summary.completedSets}
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {storageFailed ? (
          <Banner>This browser is not keeping a local copy (private mode or storage full). Stay online while logging so nothing is lost.</Banner>
        ) : null}
        {!online && status.kind !== "offline" ? <Banner tone="muted">You are offline. You can keep logging; sets stay on this device until you reconnect.</Banner> : null}
        {record.conflict ? (
          <div className="rounded-3xl border border-danger/40 bg-danger-soft p-4" role="alert">
            <p className="font-medium text-danger">This workout was also changed on another device or tab.</p>
            <p className="mt-1 text-sm text-muted">Choose which version to keep. The other one will be replaced.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => engine.current?.keepLocal()}>Keep this device’s version</Button>
              <Button variant="secondary" size="sm" onClick={() => engine.current?.useRemote()}>Use the other version</Button>
            </div>
          </div>
        ) : null}
        {closed ? (
          <div className="rounded-3xl border border-line bg-surface p-4" role="alert">
            <p className="font-medium">This workout was finished or discarded elsewhere.</p>
            <Button className="mt-3" variant="secondary" size="sm" onClick={() => { removeRecord(window.localStorage, userId, doc.id); router.replace("/train"); }}>
              Back to Train
            </Button>
          </div>
        ) : null}
        {notice ? <Banner tone="muted" onDismiss={() => setNotice(null)}>{notice}</Banner> : null}

        {doc.exercises.map((entry) => (
          <ExerciseCard
            key={entry.id}
            entry={entry}
            previous={record.previous[entry.exercise_id]}
            timeZone={timeZone}
            onSetChange={(setId, p) => edit((d) => updateSet(d, entry.id, setId, p))}
            onComplete={(setId) => complete(entry.id, setId)}
            onUncomplete={(setId) => edit((d) => uncompleteSet(d, entry.id, setId))}
            onAddSet={(type) => edit((d) => addSet(d, entry.id, type, recordRef.current.previous, newId))}
            onOpenMenu={() => setExerciseMenu(entry.id)}
            onOpenSetMenu={(set, ordinal) => setSetMenu({ entryId: entry.id, set, ordinal })}
            onUnskip={() => edit((d) => addSet(setSkipped(d, entry.id, false), entry.id, "working", recordRef.current.previous, newId))}
          />
        ))}

        {doc.exercises.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center text-muted">This workout has no exercises yet. Add one to start logging.</div>
        ) : null}

        <Button variant="secondary" size="lg" className="w-full" onClick={() => setPicker({ mode: "add" })} disabled={closed}>
          <IconPlus size={18} /> Add exercise
        </Button>
        <p className="px-2 text-center text-xs text-faint">Changes here apply to this session only. Your workout template is not modified.</p>
      </div>

      {/* Bottom action area: rest timer and finish. Hidden while typing. */}
      <div className={cx("fixed inset-x-0 bottom-0 z-30 transition-transform duration-200", inputFocused && "translate-y-full")} aria-hidden={inputFocused || undefined}>
        <div className="mx-auto max-w-xl space-y-2 bg-gradient-to-t from-bg via-bg/95 to-transparent px-4 pt-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
          {record.rest ? (
            <RestTimerBar
              timer={record.rest}
              onStop={() => patch({ rest: null })}
              onAdjust={(delta) => patch({ rest: adjustTimer(recordRef.current.rest, delta, clockNow()) })}
              onRestart={() => startRest(record.rest?.duration ?? lastRest)}
            />
          ) : null}
          <div className="flex gap-2">
            {!record.rest ? (
              <Button variant="secondary" size="lg" onClick={() => startRest(lastRest)} aria-label={`Start rest timer, ${lastRest} seconds`} disabled={closed}>
                <IconTimer size={20} /> Rest
              </Button>
            ) : null}
            <Button variant="primary" size="lg" className="flex-1" onClick={() => { setActionError(null); setFinishOpen(true); }} disabled={closed}>
              Finish workout
            </Button>
          </div>
        </div>
      </div>

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={pickExercise}
        title={picker?.mode === "substitute" ? "Substitute for this session" : "Add exercise to this session"}
      />

      <Sheet open={menuEntry !== undefined} onClose={() => setExerciseMenu(null)} title={menuEntry?.exercise_name ?? ""}>
        {menuEntry ? (
          <MenuList
            items={[
              { label: "Add warm-up set", onClick: () => edit((d) => addSet(d, menuEntry.id, "warmup", recordRef.current.previous, newId)) },
              { label: menuEntry.notes ? "Edit note" : "Add note", onClick: () => setNotesFor(menuEntry.id) },
              { label: "Substitute exercise", hint: "For this session only", onClick: () => setPicker({ mode: "substitute", entryId: menuEntry.id }) },
              menuEntry.skipped
                ? { label: "Unskip exercise", onClick: () => edit((d) => setSkipped(d, menuEntry.id, false)) }
                : { label: "Skip exercise", hint: "Unconfirmed sets are cleared", onClick: () => edit((d) => setSkipped(d, menuEntry.id, true)) },
              { label: "Move up", onClick: () => edit((d) => moveExercise(d, menuEntry.id, -1)), disabled: doc.exercises[0]?.id === menuEntry.id },
              { label: "Move down", onClick: () => edit((d) => moveExercise(d, menuEntry.id, 1)), disabled: doc.exercises.at(-1)?.id === menuEntry.id },
              {
                label: "Remove from this session",
                danger: true,
                disabled: menuEntry.sets.some((s) => s.completed_at),
                hint: menuEntry.sets.some((s) => s.completed_at) ? "Has confirmed sets. Undo them first." : undefined,
                onClick: () => edit((d) => removeExercise(d, menuEntry.id)),
              },
            ]}
            onDone={() => setExerciseMenu(null)}
          />
        ) : null}
      </Sheet>

      <Sheet open={setMenu !== null} onClose={() => setSetMenu(null)} title={setMenu ? capitalise(setMenu.ordinal) : ""}>
        {setMenu ? (
          <MenuList
            items={[
              setMenu.set.set_type === "working"
                ? { label: "Mark as warm-up set", onClick: () => edit((d) => setSetType(d, setMenu.entryId, setMenu.set.id, "warmup")) }
                : { label: "Mark as working set", onClick: () => edit((d) => setSetType(d, setMenu.entryId, setMenu.set.id, "working")) },
              { label: "Remove set", danger: true, onClick: () => edit((d) => removeSet(d, setMenu.entryId, setMenu.set.id)) },
            ]}
            onDone={() => setSetMenu(null)}
          />
        ) : null}
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Workout">
        <div className="space-y-2">
          <Toggle
            label="Auto-start rest timer"
            description="Start the rest timer when you confirm a set."
            checked={record.settings.autoStartRest}
            onChange={setAutoRest}
          />
          <MenuList
            items={[
              { label: doc.notes ? "Edit workout note" : "Add workout note", onClick: () => setNotesFor("session") },
              { label: "Add exercise", onClick: () => setPicker({ mode: "add" }) },
              { label: "Discard workout", danger: true, onClick: () => setDiscardOpen(true) },
            ]}
            onDone={() => setMenuOpen(false)}
          />
        </div>
      </Sheet>

      <NotesSheet
        key={notesFor ?? "none"}
        open={notesFor !== null}
        title={notesFor === "session" ? "Workout note" : `Note · ${notesEntry?.exercise_name ?? ""}`}
        initial={(notesFor === "session" ? doc.notes : notesEntry?.notes) ?? ""}
        onClose={() => setNotesFor(null)}
        onSave={(text) => {
          if (notesFor === "session") edit((d) => ({ ...d, notes: text || null }));
          else if (notesFor) edit((d) => setExerciseNotes(d, notesFor, text));
          setNotesFor(null);
        }}
      />

      <Sheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title={summary.completedSets ? "Finish workout?" : "No sets confirmed yet"}
        footer={
          summary.completedSets ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" className="flex-1" onClick={() => setFinishOpen(false)}>Keep logging</Button>
              <Button variant="primary" size="lg" className="flex-1" busy={busy} disabled={!online} onClick={finish}>Finish & save</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="danger" size="lg" className="flex-1" onClick={() => { setFinishOpen(false); setDiscardOpen(true); }}>Discard</Button>
              <Button variant="primary" size="lg" className="flex-1" onClick={() => setFinishOpen(false)}>Continue</Button>
            </div>
          )
        }
      >
        {summary.completedSets ? (
          <div className="space-y-4">
            <ul className="divide-y divide-line">
              {summary.exercises.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className={cx("shrink-0 text-sm tabular", e.completed ? "text-accent-text" : "text-faint")}>
                    {e.completed ? `${e.completed} ${e.completed === 1 ? "set" : "sets"}` : e.skipped ? "Skipped" : "Not performed"}
                  </span>
                </li>
              ))}
            </ul>
            {summary.exercises.some((e) => e.unconfirmed && e.completed) || summary.exercises.some((e) => !e.completed && e.unconfirmed) ? (
              <p className="text-sm text-muted">
                Unconfirmed sets ({summary.exercises.reduce((n, e) => n + e.unconfirmed, 0)}) will not be saved. Only confirmed sets count as performed.
              </p>
            ) : null}
            {!online ? <p className="text-sm text-warn">You are offline. Everything is kept on this device; finish when you are back online.</p> : null}
            <ErrorNote>{actionError}</ErrorNote>
          </div>
        ) : (
          <p className="text-muted">
            A workout is saved only with at least one confirmed set. Prefilled weights do not count until you confirm them. Continue logging, or discard this workout.
          </p>
        )}
      </Sheet>

      <Sheet
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this workout?"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setDiscardOpen(false)}>Cancel</Button>
            <Button variant="danger" size="lg" className="flex-1" busy={busy} onClick={discard}>Discard workout</Button>
          </div>
        }
      >
        <p className="text-muted">All sets logged in this session will be deleted. Your templates and past workouts are not affected.</p>
        {!online ? <p className="mt-3 text-sm text-warn">Discarding needs a connection.</p> : null}
        <div className="mt-3"><ErrorNote>{actionError}</ErrorNote></div>
      </Sheet>
    </div>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Banner({ children, tone = "warn", onDismiss }: { children: React.ReactNode; tone?: "warn" | "muted"; onDismiss?: () => void }) {
  return (
    <div role="status" className={cx("flex items-start gap-3 rounded-2xl px-4 py-3 text-sm", tone === "warn" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
      <IconAlert size={18} className="mt-0.5 shrink-0" />
      <p className="flex-1">{children}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="font-medium text-fg">OK</button>
      ) : null}
    </div>
  );
}

type MenuItem = { label: string; hint?: string; danger?: boolean; disabled?: boolean; onClick: () => void };

function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              onDone();
              item.onClick();
            }}
            className={cx("flex min-h-13 w-full flex-col items-start justify-center py-2 text-left disabled:opacity-40", item.danger ? "text-danger" : "text-fg")}
          >
            <span className="font-medium">{item.label}</span>
            {item.hint ? <span className="text-sm text-muted">{item.hint}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function NotesSheet({ open, title, initial, onClose, onSave }: { open: boolean; title: string; initial: string; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={<Button variant="primary" size="lg" className="w-full" onClick={() => onSave(text.trim())}>Save note</Button>}
    >
      <textarea
        aria-label={title}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={4}
        className="w-full rounded-2xl border border-line bg-surface-2 p-4 text-fg outline-none focus:ring-2 focus:ring-[var(--ring)]"
        placeholder="e.g. Seat position 4, felt strong"
      />
    </Sheet>
  );
}
