import Link from "next/link";
import { formatDate, formatTime } from "@/lib/format";
import { MEMBER_STATUS_LABEL, type GroupMemberStatus } from "@/lib/group";
import { IconChevronRight, IconPlus } from "../icons";
import { cx } from "../styles";

export type UpcomingGroup = { id: string; name: string; planned_for: string | null; status: GroupMemberStatus; isHost: boolean };

/** Train screen: group workouts you're in and haven't finished, plus a way to plan one. */
export function GroupWorkoutsSection({ groups, timeZone }: { groups: UpcomingGroup[]; timeZone: string }) {
  return (
    <section className="mt-8" aria-labelledby="together-title">
      <h2 id="together-title" className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">Train together</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        {groups.map((g) => (
          <li key={g.id}>
            <Link href={`/together/${g.id}`} className="flex min-h-15 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{g.name}</span>
                <span className="block truncate text-sm text-muted">
                  {g.planned_for ? `${formatDate(g.planned_for, timeZone, { weekday: "short", year: undefined })}, ${formatTime(g.planned_for, timeZone)} · ` : ""}
                  {g.isHost ? "You’re hosting" : "You’re invited"}
                </span>
              </span>
              {g.status !== "joined" ? (
                <span className={cx("shrink-0 rounded-full border border-accent-text/40 px-2.5 py-1 text-xs font-medium text-accent-text")}>{MEMBER_STATUS_LABEL[g.status]}</span>
              ) : null}
              <IconChevronRight className="shrink-0 text-faint" />
            </Link>
          </li>
        ))}
        <li>
          <Link href="/together/new" className="flex min-h-15 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text"><IconPlus size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Plan a group workout</span>
              <span className="block text-sm text-muted">Share a plan with friends; everyone logs their own sets</span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
