"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconCopy, IconShare } from "../icons";
import { SharedSplitView, type SharedSnapshot } from "../SharedSplitView";
import { Button, Card, ErrorNote, Field, Input, SectionTitle, Sheet, Spinner, Toggle } from "../ui";

type Share = { id: string; token: string; name: string; description: string | null; include_notes: boolean; snapshot_at: string };

export function ShareCard({
  splitId,
  splitName,
  splitDescription,
  share,
  timeZone,
}: {
  timeZone: string;
  splitId: string;
  splitName: string;
  splitDescription: string | null;
  share: Share | null;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [editing, setEditing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [name, setName] = useState(share?.name ?? splitName);
  const [description, setDescription] = useState(share?.description ?? splitDescription ?? "");
  const [includeNotes, setIncludeNotes] = useState(share?.include_notes ?? false);
  const [preview, setPreview] = useState<SharedSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const url = share ? `${origin}/s/${share.token}` : "";

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    supabase.rpc("build_split_snapshot", { p_split_id: splitId, p_include_notes: includeNotes }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(friendlyError(error));
      else setPreview(data as SharedSnapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [editing, includeNotes, splitId, supabase]);

  async function publish() {
    if (!name.trim()) return setError("Give the shared split a name.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("upsert_split_share", {
      p_split_id: splitId,
      p_name: name.trim(),
      p_description: description,
      p_include_notes: includeNotes,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setEditing(false);
    router.refresh();
  }

  async function revoke() {
    if (!share) return;
    setBusy(true);
    const { error } = await supabase.rpc("revoke_split_share", { p_share_id: share.id });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setRevoking(false);
    router.refresh();
  }

  async function copy() {
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) await navigator.share({ title: share?.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <section>
      <SectionTitle>Sharing</SectionTitle>
      <Card className="p-5">
        {share ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Anyone with this link can view and copy a snapshot of this split taken {formatDateTime(share.snapshot_at, timeZone)}. Later edits are not shared until you update the snapshot.
            </p>
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-4">
              <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
              <Button size="sm" variant="primary" onClick={copy}><IconCopy size={16} /> {copied ? "Copied" : "Copy"}</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setError(null); setEditing(true); }}>Update snapshot</Button>
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg">Open link</a>
              <Button size="sm" variant="danger" onClick={() => setRevoking(true)}>Revoke link</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Share this split with a friend. They get their own copy; your training history stays private.</p>
            <Button variant="secondary" onClick={() => { setError(null); setEditing(true); }}><IconShare size={16} /> Share split</Button>
          </div>
        )}
        {error && !editing ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
      </Card>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={share ? "Update shared snapshot" : "Share split"}
        footer={
          <Button variant="primary" size="lg" className="w-full" busy={busy} onClick={publish}>
            {share ? "Update snapshot" : "Create share link"}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Shared name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
          <Field label="Shared description (optional)">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
          <Toggle
            label="Include exercise notes"
            description="Notes written in your workout templates, such as cues or seat settings."
            checked={includeNotes}
            onChange={setIncludeNotes}
          />
          <div className="rounded-2xl bg-surface-2 p-4 text-sm">
            <p className="font-medium">Never shared</p>
            <p className="mt-1 text-muted">Your weights, reps and workout history, session notes, activation dates, email and profile.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted">Preview: exactly what the link will show</p>
            <div className="mb-3 rounded-2xl border border-line p-4">
              <p className="text-lg font-semibold">{name || "Untitled"}</p>
              {description ? <p className="text-sm text-muted">{description}</p> : null}
            </div>
            {preview ? <SharedSplitView snapshot={preview} /> : <div className="flex justify-center py-6 text-muted"><Spinner /></div>}
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Sheet>

      <Sheet
        open={revoking}
        onClose={() => setRevoking(false)}
        title="Revoke share link?"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setRevoking(false)}>Cancel</Button>
            <Button variant="danger" size="lg" className="flex-1" busy={busy} onClick={revoke}>Revoke</Button>
          </div>
        }
      >
        <p className="text-muted">The link stops working immediately. Copies people already made are theirs and are not affected.</p>
      </Sheet>
    </section>
  );
}

const noopSubscribe = () => () => {};
