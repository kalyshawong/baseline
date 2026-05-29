"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface LifeContextDef {
  id: string;
  label: string;
  category: string;
  emoji: string | null;
  color: string | null;
  groupKey: string | null;
  archived: boolean;
}

export interface LifeContextLog {
  id: string;
  defId: string;
  day: string; // ISO
}

interface Props {
  dateStr: string;
  defs: LifeContextDef[];
  todayLogs: LifeContextLog[];
}

const VALID_CATEGORIES = [
  { id: "relationship", label: "Relationship" },
  { id: "sleep", label: "Sleep context" },
  { id: "stressor", label: "Stressor" },
  { id: "effort", label: "Effort period" },
  { id: "milestone", label: "Milestone" },
  { id: "illness", label: "Illness" },
  { id: "travel", label: "Travel" },
  { id: "cycle", label: "Cycle" },
  { id: "custom", label: "Custom" },
] as const;

const colorToClasses: Record<string, { on: string; off: string }> = {
  rose: {
    on: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-rose-500/40",
  },
  pink: {
    on: "bg-pink-500/20 text-pink-300 border-pink-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-pink-500/40",
  },
  violet: {
    on: "bg-violet-500/20 text-violet-300 border-violet-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-violet-500/40",
  },
  indigo: {
    on: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-indigo-500/40",
  },
  cyan: {
    on: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-cyan-500/40",
  },
  emerald: {
    on: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-emerald-500/40",
  },
  amber: {
    on: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-amber-500/40",
  },
  blue: {
    on: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-blue-500/40",
  },
  neutral: {
    on: "bg-white/15 text-white border-white/30",
    off: "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/30",
  },
};

const COLOR_CHOICES = ["rose", "pink", "violet", "indigo", "cyan", "emerald", "amber", "blue"] as const;

function classesFor(color: string | null, on: boolean): string {
  const set = colorToClasses[color ?? "neutral"] ?? colorToClasses.neutral;
  return on ? set.on : set.off;
}

// --- Manage-mode row (per-def inline editor) ---

function ManageRow({
  def,
  isPending,
  groupSuggestions,
  onSaved,
  onArchived,
}: {
  def: LifeContextDef;
  isPending: boolean;
  groupSuggestions: string[];
  onSaved: () => void;
  onArchived: () => void;
}) {
  const [label, setLabel] = useState(def.label);
  const [emoji, setEmoji] = useState(def.emoji ?? "");
  const [category, setCategory] = useState(def.category);
  const [color, setColor] = useState(def.color ?? "neutral");
  const [groupKey, setGroupKey] = useState(def.groupKey ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    label.trim() !== def.label ||
    (emoji.trim() || null) !== (def.emoji ?? null) ||
    category !== def.category ||
    color !== (def.color ?? "neutral") ||
    (groupKey.trim() || null) !== (def.groupKey ?? null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/life-context/defs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: def.id,
          label: label.trim(),
          emoji: emoji.trim() || "",
          category,
          color: color === "neutral" ? "" : color,
          groupKey: groupKey.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch("/api/life-context/defs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: def.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Archive failed");
        return;
      }
      onArchived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-2 border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="emoji"
          maxLength={4}
          className="field !w-12 !py-1.5 !px-2 text-center !text-sm"
          aria-label={`Emoji for ${def.label}`}
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="field min-w-0 flex-1 !py-1.5 !text-xs"
          aria-label={`Label for ${def.label}`}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="field !w-auto !py-1.5 !px-2 !text-xs [color-scheme:dark]"
          aria-label={`Category for ${def.label}`}
        >
          {VALID_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`h-4 w-4 rounded-full border ${
                color === c ? "border-white" : "border-transparent"
              } ${colorToClasses[c].on}`}
            />
          ))}
          <button
            type="button"
            onClick={() => setColor("neutral")}
            aria-label="Color neutral"
            className={`h-4 w-4 rounded-full border ${
              color === "neutral" ? "border-white" : "border-transparent"
            } ${colorToClasses.neutral.on}`}
          />
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={archive}
            disabled={isPending || archiving}
            className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30"
          >
            {archiving ? "..." : "Archive"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || saving || !dirty || !label.trim()}
            className="btn !py-1 !px-3 !text-xs disabled:opacity-30"
          >
            {saving ? "..." : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`grp-${def.id}`}
          className="text-xs text-[var(--color-text-muted)]"
          title="Defs sharing a group are treated as mutually exclusive in insights."
        >
          Group:
        </label>
        <input
          id={`grp-${def.id}`}
          type="text"
          value={groupKey}
          onChange={(e) => setGroupKey(e.target.value)}
          list={`grp-suggestions-${def.id}`}
          placeholder="optional — e.g. sleep-context"
          maxLength={40}
          className="field min-w-0 flex-1 !py-1.5 !text-xs"
          aria-label={`Group for ${def.label}`}
        />
        <datalist id={`grp-suggestions-${def.id}`}>
          {groupSuggestions.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

// --- Main card ---

export function LifeContextCard({ dateStr, defs, todayLogs }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeIds, setActiveIds] = useState<Set<string>>(
    () => new Set(todayLogs.map((l) => l.defId))
  );
  const [error, setError] = useState<string | null>(null);

  const [defining, setDefining] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newCategory, setNewCategory] = useState<string>("custom");
  const [newColor, setNewColor] = useState<string>("violet");
  const [newGroupKey, setNewGroupKey] = useState<string>("");

  const groupSuggestions = Array.from(
    new Set(defs.map((d) => d.groupKey).filter((g): g is string => !!g))
  ).sort();

  function toggle(def: LifeContextDef) {
    const wasOn = activeIds.has(def.id);
    const next = new Set(activeIds);
    if (wasOn) next.delete(def.id);
    else next.add(def.id);
    setActiveIds(next);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/life-context/logs", {
          method: wasOn ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defId: def.id, day: dateStr }),
        });
        if (!res.ok) {
          setActiveIds(activeIds);
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Toggle failed");
        } else {
          router.refresh();
        }
      } catch (e) {
        setActiveIds(activeIds);
        setError(e instanceof Error ? e.message : "Toggle failed");
      }
    });
  }

  function submitNewDef(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/life-context/defs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: newLabel.trim(),
            category: newCategory,
            emoji: newEmoji.trim() || undefined,
            color: newColor,
            groupKey: newGroupKey.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to create flag");
          return;
        }
        setNewLabel("");
        setNewEmoji("");
        setNewGroupKey("");
        setDefining(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create flag");
      }
    });
  }

  function handleManageSaved() {
    router.refresh();
  }

  function handleManageArchived() {
    router.refresh();
    if (defs.length <= 1) setManaging(false);
  }

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between">
        <p className="ov" style={{ color: "var(--color-gold)" }}>Life Context</p>
        <div className="flex gap-3">
          {defs.length > 0 && (
            <button
              type="button"
              onClick={() => { setManaging((v) => !v); if (defining) setDefining(false); }}
              className="linklike"
            >
              {managing ? "Done" : "Manage"}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setDefining((v) => !v); if (managing) setManaging(false); }}
            className="linklike"
          >
            {defining ? "Cancel" : "+ New"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Toggle row */}
      {defs.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          No flags yet. Add one like &quot;with partner&quot;, &quot;sick&quot;, or &quot;exam day&quot; to start
          tracking how life context affects your biometrics.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {defs.map((def) => {
            const on = activeIds.has(def.id);
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => toggle(def)}
                disabled={isPending}
                className={`tagchip ${on ? "on" : ""} disabled:opacity-60`}
                title={on ? "Tap to remove for today" : "Tap to apply to today"}
              >
                {def.emoji && <span className="mr-1">{def.emoji}</span>}
                {def.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Manage panel */}
      {managing && defs.length > 0 && (
        <div className="mt-4 space-y-2">
          {defs.map((def) => (
            <ManageRow
              key={def.id}
              def={def}
              isPending={isPending}
              groupSuggestions={groupSuggestions}
              onSaved={handleManageSaved}
              onArchived={handleManageArchived}
            />
          ))}
        </div>
      )}

      {/* Define-new form */}
      {defining && (
        <form
          onSubmit={submitNewDef}
          className="mt-4 space-y-3 border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
        >
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              placeholder="emoji"
              maxLength={4}
              className="field !w-14 !py-2 !px-2 text-center !text-sm"
              aria-label="Emoji"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Flag label (e.g. with partner, sick, exam day)"
              className="field min-w-0 flex-1 !py-2 !text-xs"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--color-text-muted)]">Category:</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="field !w-auto !py-1.5 !px-2 !text-xs [color-scheme:dark]"
            >
              {VALID_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <label className="ml-2 text-xs text-[var(--color-text-muted)]">Color:</label>
            <div className="flex gap-1">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Color ${c}`}
                  className={`h-5 w-5 rounded-full border ${
                    newColor === c ? "border-white" : "border-transparent"
                  } ${colorToClasses[c].on}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="new-group-key"
              className="text-xs text-[var(--color-text-muted)]"
              title="Optional. Defs sharing a group are treated as mutually exclusive in insights."
            >
              Group:
            </label>
            <input
              id="new-group-key"
              type="text"
              value={newGroupKey}
              onChange={(e) => setNewGroupKey(e.target.value)}
              list="new-group-suggestions"
              placeholder="optional — e.g. sleep-context"
              maxLength={40}
              className="field min-w-0 flex-1 !py-1.5 !text-xs"
            />
            <datalist id="new-group-suggestions">
              {groupSuggestions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending || !newLabel.trim()}
              className="btn !py-1.5 !px-3 !text-xs disabled:opacity-30"
            >
              Create flag
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
