"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { formatDate, formatTarget, formatTime } from "@/lib/format";
import { MEMBER_STATUS_LABEL, groupExerciseLabel, type GroupDoc, type GroupMember } from "@/lib/group";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconCheck, IconCopy, IconShare, IconX } from "../icons";
import { buttonClass } from "../styles";
import { Button, ErrorNote, IconButton, PageHeader, SectionTitle, Sheet, cx } from "../ui";
import { GroupPlanEditor } from "./GroupPlanEditor";

export function GroupWorkoutView({ doc, timeZone, otherOpenSessionId }: { doc: GroupDoc; timeZone: string; otherOpenSessionId: string | null }) {
  const router = useRouter();
  const host = doc.members.find((m) => m.role === "host");
  const [confirm, setConfirm] = useState<"delete" | "leave" | { remove: GroupMember } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } =
      confirm === "delete"
        ? await supabase.from("group_workouts").delete().eq("id", doc.id)
        : confirm === "leave"
          ? await supabase.rpc("leave_group_workout", { p_group_id: doc.id })
          : await supabase.rpc("remove_group_member", { p_group_id: doc.id, p_member_key: confirm.remove.member_key });
    setBusy(false);
    if (error) return setError(friendlyError(error, "Something went wrong. Please try again."));
    const leaving = confirm !== "delete" && confirm !== "leave" ? false : true;
    setConfirm(null);
    if (leaving) router.replace("/train");
    else router.refresh();
  }

  return (
    <>
      <PageHeader eyebrow="Group workout" title={doc.name} back={{ href: "/train", label: "Train" }} />
      <p className="-mt-3 mb-5 text-muted">
        {doc.planned_for ? `${formatDate(doc.planned_for, timeZone, { weekday: "short", year: undefined })}, ${formatTime(doc.planned_for, timeZone)} · ` : ""}
        Hosted by {host?.is_me ? "you" : (host?.display_name ?? "a friend")}
      </p>

      <StartPanel doc={doc} otherOpenSessionId={otherOpenSessionId} />

      {doc.is_host && doc.invite_token ? <InviteCard token={doc.invite_token} name={doc.name} /> : null}

      <section className="mt-8" aria-labelledby="who-title">
        <SectionTitle>
          <span id="who-title">Who’s training ({doc.members.length})</span>
        </SectionTitle>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {doc.members.map((m) => (
            <li key={m.member_key} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold">
                {m.display_name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.display_name}
                  {m.is_me ? <span className="text-muted"> (you)</span> : null}
                </span>
                <span className="block text-sm text-muted">{m.role === "host" ? "Host" : "Joined"}</span>
              </span>
              <span
                className={cx(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  m.status === "completed" ? "bg-accent-soft text-accent-text" : m.status === "in_progress" ? "border border-accent-text/40 text-accent-text" : "bg-surface-2 text-muted",
                )}
              >
                {m.status === "completed" ? <IconCheck size={12} className="-mt-0.5 mr-1 inline" /> : null}
                {MEMBER_STATUS_LABEL[m.status]}
              </span>
              {doc.is_host && m.role === "member" ? (
                <IconButton label={`Remove ${m.display_name}`} onClick={() => setConfirm({ remove: m })} className="-mr-2">
                  <IconX size={18} />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-faint">Everyone logs their own sets. Partners see who has started and finished, never anyone’s weights or reps.</p>
      </section>

      <section className="mt-8" aria-labelledby="plan-title">
        <SectionTitle>
          <span id="plan-title">The plan</span>
        </SectionTitle>
        {doc.is_host ? (
          <GroupPlanEditor groupId={doc.id} initial={doc.exercises} />
        ) : doc.exercises.length ? (
          <ol className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {doc.exercises.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 font-medium">{groupExerciseLabel(e)}</span>
                <span className="shrink-0 text-sm text-muted tabular">{formatTarget(e.target_sets, e.rep_min, e.rep_max)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-muted">The host hasn’t added any exercises yet.</p>
        )}
        {!doc.is_host ? <p className="mt-2 text-sm text-faint">Only the host can change the plan. On the day you can still swap, skip or add exercises in your own workout.</p> : null}
      </section>

      <div className="mt-10 pb-6">
        {doc.is_host ? (
          <Button variant="danger" onClick={() => setConfirm("delete")}>Delete group workout</Button>
        ) : (
          <Button variant="danger" onClick={() => setConfirm("leave")}>Leave group workout</Button>
        )}
      </div>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "delete" ? "Delete this group workout?" : confirm === "leave" ? "Leave this group workout?" : confirm ? `Remove ${confirm.remove.display_name}?` : ""}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" size="lg" className="flex-1" busy={busy} onClick={act}>
              {confirm === "delete" ? "Delete" : confirm === "leave" ? "Leave" : "Remove"}
            </Button>
          </div>
        }
      >
        <p className="text-muted">
          {confirm === "delete"
            ? "The invite link stops working and the group is removed for everyone. Workouts people have already logged stay in their own history."
            : confirm === "leave"
              ? "You’ll need a new invite link to join again. Anything you’ve already logged stays in your history."
              : "They’ll lose access to this group. Anything they’ve already logged stays in their own history."}
        </p>
        <ErrorNote>{error}</ErrorNote>
      </Sheet>
    </>
  );
}

function StartPanel({ doc, otherOpenSessionId }: { doc: GroupDoc; otherOpenSessionId: string | null }) {
  const router = useRouter();
  const sessionId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (doc.my_session?.status === "in_progress") {
    return (
      <Link href={`/workout/${doc.my_session.id}`} className={buttonClass("primary", "lg", "w-full")}>Resume your workout</Link>
    );
  }
  if (doc.my_session?.status === "completed") {
    return (
      <div className="rounded-3xl border border-line bg-surface p-4">
        <p className="font-medium"><IconCheck size={16} className="-mt-0.5 mr-1.5 inline text-accent-text" />You’ve finished this one.</p>
        <Link href={`/sessions/${doc.my_session.id}`} className={buttonClass("secondary", "md", "mt-3 w-full")}>View your workout</Link>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    sessionId.current ??= crypto.randomUUID();
    const { error } = await supabaseBrowser().rpc("start_group_session", { p_session_id: sessionId.current, p_group_id: doc.id });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error, "Could not start the workout."));
    }
    router.push(`/workout/${sessionId.current}`);
  }

  return (
    <div>
      <Button variant="primary" size="lg" className="w-full" busy={busy} disabled={!doc.exercises.length || Boolean(otherOpenSessionId)} onClick={start}>
        Start my workout
      </Button>
      {otherOpenSessionId ? (
        <p className="mt-2 text-sm text-muted">
          You have another workout in progress. <Link href={`/workout/${otherOpenSessionId}`} className="text-accent-text underline underline-offset-4">Finish or discard it</Link> first.
        </p>
      ) : !doc.exercises.length ? (
        <p className="mt-2 text-sm text-muted">{doc.is_host ? "Add exercises to the plan below to start." : "The host hasn’t added any exercises yet."}</p>
      ) : (
        <p className="mt-2 text-sm text-faint">Start when you’re at the gym. Your last numbers for each exercise come from your own history.</p>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

function InviteCard({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noop, () => "share" in navigator, () => false);
  const url = `${origin}/join/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  }

  return (
    <section aria-labelledby="invite-title" className="mt-6 rounded-3xl border border-accent-text/30 bg-accent-soft p-5">
      <h2 id="invite-title" className="font-semibold">Invite your training partners</h2>
      <p className="mt-1 text-sm text-muted">Anyone with this link can see the plan and join (up to 10 people). New to NotchLift? They’ll create an account first.</p>
      <p className="mt-3 truncate rounded-2xl bg-surface px-3 py-2.5 font-mono text-sm text-muted" aria-label="Invite link">{url}</p>
      <div className="mt-3 flex gap-2">
        {canShare ? (
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => navigator.share({ title: name, text: `Train with me: ${name}`, url }).catch(() => undefined)}
          >
            <IconShare size={18} /> Share link
          </Button>
        ) : null}
        <Button variant="secondary" className="flex-1" onClick={copy}>
          {copied ? <><IconCheck size={18} /> Copied</> : <><IconCopy size={18} /> Copy link</>}
        </Button>
      </div>
    </section>
  );
}

const noop = () => () => {};
