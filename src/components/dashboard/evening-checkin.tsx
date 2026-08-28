"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckinData } from "@/lib/evening-checkin";

/**
 * Evening check-in card (audit §1.4) — the ONE deliberate ritual moment
 * anchoring the zero-effort tags. Renders only in the evening (≥ 6pm device
 * time) of the current day, disappears once completed. Every answer is a
 * single tap against an existing API:
 *
 *   assignment done   → PATCH /api/experiments/[id] | POST /api/diagnose
 *   soreness cleared  → POST /api/soreness {clear:true}
 *   exposure happened → POST /api/tags
 *
 * Completion is stored per-day in localStorage — a ritual is personal
 * device state, not data.
 */

const EVENING_HOUR = 18;

type AnswerMap = Record<string, "yes" | "no" | "kept" | "cleared" | "logged">;

/** "Anything stressful today?" — always a QUESTION, never an assertion
 *  (oura-integration-plan §4). Yes logs a stress_event tag; the covariate
 *  stays clean because the question exists every day, ring or no ring. */
function StressRow({
  answered,
  answer,
  busy,
  onYes,
  onNo,
}: {
  answered: boolean;
  answer?: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="mt-3 bg-[var(--color-surface-2)] px-3 py-2">
      <p className="text-[12.5px]">Anything stressful today?</p>
      <div className="mt-2 flex gap-2">
        {answered ? (
          <span className="text-[11px] font-bold uppercase text-[var(--color-green)]">
            {answer === "no" ? "Noted — calm day" : "Logged ✓"}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onYes}
              className="cursor-pointer border-none bg-[var(--color-surface)] px-3 py-[6px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)] disabled:opacity-50"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={onNo}
              className="cursor-pointer border-none bg-[var(--color-surface)] px-3 py-[6px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)]"
            >
              No
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function EveningCheckin({ data }: { data: CheckinData }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [doneAll, setDoneAll] = useState(false);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Client-side gate: evening + the device's own "today" + not yet done.
  // Done in an effect so server HTML (nothing) matches first client paint.
  useEffect(() => {
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (localDate !== data.dateStr) return;
    if (now.getHours() < EVENING_HOUR) return;
    try {
      if (localStorage.getItem(`bl_checkin_${data.dateStr}`)) return;
    } catch { /* ignore */ }
    setVisible(true);
  }, [data.dateStr]);

  function finish() {
    try {
      localStorage.setItem(`bl_checkin_${data.dateStr}`, "1");
    } catch { /* ignore */ }
    setDoneAll(true);
    setTimeout(() => setVisible(false), 1200);
    router.refresh();
  }

  async function call(key: string, fn: () => Promise<Response>, answer: AnswerMap[string]) {
    setBusy(key);
    try {
      const res = await fn();
      if (res.ok) setAnswers((a) => ({ ...a, [key]: answer }));
    } finally {
      setBusy(null);
    }
  }

  if (!visible) return null;

  const total = data.assignments.length + data.soreness.length + data.suggestions.length;

  return (
    <div
      className="panel"
      style={{
        borderLeft: "4px solid var(--color-gold)",
        backgroundImage:
          "linear-gradient(150deg, color-mix(in oklch, var(--color-gold), transparent 90%), transparent 60%)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="ov">Evening check-in</p>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)]">
          ~10 seconds
        </span>
      </div>

      {doneAll ? (
        <p className="mt-3 text-[13px] font-semibold text-[var(--color-green)]">
          Done — good night. ✓
        </p>
      ) : (
        <>
          {/* Stress question (always asked; a high-arousal ring day only
              PROMOTES it to the top — never gates it, question-phrased). */}
          {data.stress.promote && (
            <StressRow
              answered={data.stress.answered || answers["stress"] != null}
              answer={answers["stress"]}
              busy={busy === "stress"}
              onYes={() =>
                call(
                  "stress",
                  () =>
                    fetch("/api/tags", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tag: "stress_event", category: "custom" }),
                    }),
                  "yes",
                )
              }
              onNo={() => setAnswers((x) => ({ ...x, stress: "no" }))}
            />
          )}

          {/* 1 · today's randomized assignment(s) — the highest-value answer */}
          {data.assignments.map((a) => {
            const key = `${a.kind}-${a.id}-${a.idx}`;
            const answered = answers[key];
            return (
              <div key={key} className="mt-3 bg-[var(--color-surface-2)] px-3 py-2">
                <p className="text-[12.5px]">
                  Today was <b>{a.armLabel}</b>
                  <span className="text-[var(--color-faint)]"> · {a.title}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  {answered ? (
                    <span className="text-[11px] font-bold uppercase text-[var(--color-green)]">
                      {answered === "yes" ? "Marked done ✓" : "Noted — left unmarked"}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy === key}
                        onClick={() =>
                          call(
                            key,
                            () =>
                              a.kind === "experiment"
                                ? fetch(`/api/experiments/${a.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ adherence: { idx: a.idx, done: true } }),
                                  })
                                : fetch("/api/diagnose", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "adherence", runId: a.id, idx: a.idx, done: true }),
                                  }),
                            "yes",
                          )
                        }
                        className="cursor-pointer border-none px-3 py-[6px] text-[11px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50"
                        style={{ background: "var(--color-green)", color: "var(--color-bg)" }}
                      >
                        Did it
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnswers((x) => ({ ...x, [key]: "no" }))}
                        className="cursor-pointer border-none bg-[var(--color-surface)] px-3 py-[6px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)]"
                      >
                        Didn&apos;t
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* 2 · open soreness episodes */}
          {data.soreness.map((s) => {
            const key = `sore-${s.bodyPart}`;
            const answered = answers[key];
            return (
              <div key={key} className="mt-3 bg-[var(--color-surface-2)] px-3 py-2">
                <p className="text-[12.5px]">
                  <b className="capitalize">{s.bodyPart}</b> — day {s.streak}, {s.severity}/10. Still sore?
                </p>
                <div className="mt-2 flex gap-2">
                  {answered ? (
                    <span className="text-[11px] font-bold uppercase text-[var(--color-green)]">
                      {answered === "cleared" ? "Cleared ✓" : "Carrying on"}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setAnswers((x) => ({ ...x, [key]: "kept" }))}
                        className="cursor-pointer border-none bg-[var(--color-surface)] px-3 py-[6px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--color-text-muted)]"
                      >
                        Still sore
                      </button>
                      <button
                        type="button"
                        disabled={busy === key}
                        onClick={() =>
                          call(
                            key,
                            () =>
                              fetch("/api/soreness", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ date: data.dateStr, bodyPart: s.bodyPart, clear: true }),
                              }),
                            "cleared",
                          )
                        }
                        className="cursor-pointer border-none px-3 py-[6px] text-[11px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50"
                        style={{ background: "var(--color-green)", color: "var(--color-bg)" }}
                      >
                        Cleared
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* 2b · stress in its usual slot when the ring didn't promote it */}
          {!data.stress.promote && (
            <StressRow
              answered={data.stress.answered || answers["stress"] != null}
              answer={answers["stress"]}
              busy={busy === "stress"}
              onYes={() =>
                call(
                  "stress",
                  () =>
                    fetch("/api/tags", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tag: "stress_event", category: "custom" }),
                    }),
                  "yes",
                )
              }
              onNo={() => setAnswers((x) => ({ ...x, stress: "no" }))}
            />
          )}

          {/* 3 · frequent exposures not logged today — tap = it happened */}
          {data.suggestions.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-faint)]">
                Happened today? Tap to log — skip what didn&apos;t.
              </p>
              <div className="mt-2 flex flex-wrap gap-[6px]">
                {data.suggestions.map((sug) => {
                  const key = `tag-${sug.tag}`;
                  const logged = answers[key] === "logged";
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={busy === key || logged}
                      onClick={() =>
                        call(
                          key,
                          () =>
                            fetch("/api/tags", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tag: sug.tag, category: sug.category }),
                            }),
                          "logged",
                        )
                      }
                      className="cursor-pointer border-none px-3 py-[7px] text-[12px] font-bold disabled:cursor-default"
                      style={
                        logged
                          ? { background: "var(--color-green)", color: "var(--color-bg)" }
                          : { background: "var(--color-surface-2)", color: "var(--color-text)" }
                      }
                    >
                      {logged ? `${sug.tag} ✓` : sug.tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {total === 0 && (
            <p className="mt-3 text-[12.5px] text-[var(--color-text-muted)]">
              Nothing open today — anything worth logging before it&apos;s forgotten?
            </p>
          )}

          <button
            type="button"
            onClick={finish}
            className="mt-4 w-full cursor-pointer border-none py-[10px] text-[12px] font-extrabold uppercase tracking-[0.08em] angled-clip"
            style={{ background: "var(--color-gold)", color: "var(--color-bg)" }}
          >
            Done — good night
          </button>
        </>
      )}
    </div>
  );
}
