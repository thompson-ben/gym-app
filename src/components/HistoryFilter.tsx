"use client";

import { usePathname, useRouter } from "next/navigation";
import { inputClass } from "./styles";

export function HistoryFilter({
  splits,
  periods,
  value,
}: {
  splits: { id: string; name: string }[];
  periods: { id: string; label: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div>
      <label htmlFor="history-filter" className="mb-1.5 block text-sm font-medium text-muted">Show</label>
      <select
        id="history-filter"
        className={inputClass}
        value={value}
        onChange={(e) => {
          const [kind, id] = e.target.value.split(":");
          router.replace(kind ? `${pathname}?${kind}=${id}` : pathname, { scroll: false });
        }}
      >
        <option value="">All history</option>
        {splits.length ? (
          <optgroup label="Logged in split">
            {splits.map((s) => <option key={s.id} value={`split:${s.id}`}>{s.name}</option>)}
          </optgroup>
        ) : null}
        {periods.length ? (
          <optgroup label="While a split was active">
            {periods.map((p) => <option key={p.id} value={`period:${p.id}`}>{p.label}</option>)}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
