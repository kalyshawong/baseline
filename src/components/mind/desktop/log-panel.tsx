"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Desktop Mind handoff (2026-09-23) — the one Log panel: Tag / Food / Context
 * tabs over the existing input components, then "Logged today" as a timeline.
 * Identical tags logged at the same minute collapse to "×N".
 */

export interface LoggedTag {
  id: string;
  tag: string;
  category: string;
  timestamp: string;
  timeUnknown: boolean;
  experimentTitle: string | null;
}

type Tab = "tag" | "food" | "ctx";

export function LogPanel({
  tag,
  food,
  ctx,
  tags,
  tz,
}: {
  tag: ReactNode;
  food: ReactNode;
  ctx: ReactNode;
  tags: LoggedTag[];
  tz: string;
}) {
  const [tab, setTab] = useState<Tab>("tag");
  const panes: [Tab, string, ReactNode][] = [
    ["tag", "Tag", tag],
    ["food", "Food", food],
    ["ctx", "Context", ctx],
  ];

  return (
    <div className="p">
      <div className="tabs" role="tablist">
        {panes.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {panes.map(([id, , node]) => (
        <div key={id} className={`pane${tab === id ? " on" : ""}`}>
          {node}
        </div>
      ))}
      <div className="sep" />
      <LoggedToday tags={tags} tz={tz} />
    </div>
  );
}

function LoggedToday({ tags, tz }: { tags: LoggedTag[]; tz: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

  // Collapse repeats: same tag + category at the same displayed time.
  const rows: { key: string; ids: string[]; t: LoggedTag; time: string }[] = [];
  for (const t of tags) {
    const time = t.timeUnknown ? "—" : fmt(t.timestamp);
    const key = `${t.category}|${t.tag}|${time}|${t.experimentTitle ?? ""}`;
    const hit = rows.find((r) => r.key === key);
    if (hit) hit.ids.push(t.id);
    else rows.push({ key, ids: [t.id], t, time });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
      else setError("Failed to delete tag");
    });
  }

  return (
    <>
      <div className="p-h">
        <span className="ov">Logged today</span>
        <span className="k">
          {tags.length} {tags.length === 1 ? "tag" : "tags"}
        </span>
      </div>
      {error && <p className="err">{error}</p>}
      {rows.length === 0 ? (
        <p className="empty">Nothing tagged yet.</p>
      ) : (
        <ul className="tl">
          {rows.map((r) => (
            <li key={r.key} className={r.t.category === "nutrition" ? "nut" : r.t.category === "caffeine" ? "caf" : undefined}>
              <span className="t">{r.time}</span>
              <span className="dot" />
              <span className="w">
                {r.t.tag}
                {r.ids.length > 1 && ` ×${r.ids.length}`}
                {r.t.experimentTitle && <span style={{ color: "var(--faint)" }}> — {r.t.experimentTitle}</span>}
              </span>
              <span className="cat">{r.t.category}</span>
              <button type="button" className="x" title="Delete tag" disabled={isPending} onClick={() => remove(r.ids[0])}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
