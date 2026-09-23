"use client";

import Link from "next/link";
import { useState } from "react";
import { IconChevronRight, IconSearch } from "./icons";
import { Input } from "./ui";

type Item = { id: string; name: string; muscle: string; meta: string };

export function ExerciseSearchList({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.muscle.includes(q)) : items;
  return (
    <div className="space-y-3">
      {items.length > 6 ? (
        <div className="relative">
          <IconSearch size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
          <Input aria-label="Search your exercises" placeholder="Search your exercises" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-11" />
        </div>
      ) : null}
      <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
        {shown.map((i) => (
          <li key={i.id}>
            <Link href={`/progress/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                <span className="block truncate text-sm text-muted">{i.meta}</span>
              </span>
              <IconChevronRight className="shrink-0 text-faint" />
            </Link>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">No matches</li> : null}
      </ul>
    </div>
  );
}
