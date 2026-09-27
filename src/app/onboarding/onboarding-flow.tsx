"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_INTAKE,
  type ContextFlag,
  type CycleStatus,
  type DeviceId,
  type GoalId,
  type IntakeState,
  type MedEffect,
  type QuestionTemplateId,
  type RecordsHabit,
  type RitualSlot,
  type ScheduleKind,
  type Sex,
  type WearHistory,
} from "@/lib/intake-config";
import { saveIntakeAction } from "./actions";

/**
 * The pilot app's IntakeFlow, on the web. Copy is the pilot's verbatim
 * (Claude Design "Baseline iOS" intake); layout is plain panel/btn classes
 * for Kalysha to restyle. Step order branches on answers: training
 * questions only for people who train.
 */

type StepId = "welcome" | "goals" | "device" | "about" | "cycle" | "meds" | "training" | "schedule" | "question" | "ritual" | "build";

function stepsFor(s: IntakeState): StepId[] {
  const trains = s.goals.includes("running") || s.goals.includes("strength");
  const askCycle = s.sex !== "male";
  return ["welcome", "goals", "device", "about", ...(askCycle ? (["cycle"] as StepId[]) : []), "meds", ...(trains ? (["training"] as StepId[]) : []), "schedule", "question", "ritual", "build"];
}

const GOALS: { id: GoalId; title: string; detail: string }[] = [
  { id: "heart_steady", title: "Keep an eye on my heart numbers", detail: "Watch resting HR and HRV stay steady against your own baseline" },
  { id: "sleep", title: "Sleep better", detail: "Find what actually changes your nights" },
  { id: "running", title: "Improve my running", detail: "Pace at the same effort, load, and what helps or hurts it" },
  { id: "strength", title: "Get stronger", detail: "Volume and estimated 1RM from your logged sessions" },
  { id: "food_gi", title: "Understand food & my gut", detail: "Tag meals and symptoms; patterns become questions to test" },
  { id: "general", title: "Just curious about my baseline", detail: "Learn your normal first, decide the rest later" },
];

const DEVICES: { id: DeviceId; title: string; detail: string }[] = [
  { id: "apple", title: "Apple Watch", detail: "Sleep, night heart data & workouts via Apple Health" },
  { id: "suunto", title: "Suunto", detail: "Race, Vertical, Ocean & friends — connected through Apple Health" },
  { id: "oura", title: "Oura Ring", detail: "Strong night data; workouts come from elsewhere" },
  { id: "garmin", title: "Garmin", detail: "Sleep, heart rate & workouts via Apple Health" },
  { id: "none", title: "No wearable yet", detail: "You can still run experiments on what you log yourself" },
];

const HISTORY: { id: WearHistory; label: string }[] = [
  { id: "new", label: "Just got it" },
  { id: "weeks", label: "A few weeks" },
  { id: "months", label: "2+ months" },
];

const SEX: { id: Sex; title: string; detail: string }[] = [
  { id: "female", title: "Female", detail: "We’ll ask about your cycle next — it shifts night heart rate and temperature" },
  { id: "male", title: "Male", detail: "No cycle questions; baselines and thresholds use male reference ranges" },
  { id: "other", title: "Prefer to describe it differently", detail: "We’ll still ask about a cycle so nothing is assumed" },
];

const CYCLE: { id: CycleStatus; title: string; detail: string }[] = [
  { id: "regular", title: "Yes, fairly regular", detail: "Every analysis gets phase-adjusted automatically" },
  { id: "irregular", title: "Yes, but irregular", detail: "We’ll lean on logged dates over predictions" },
  { id: "none", title: "No", detail: "Menopause, contraception, or any other reason — no details needed" },
  { id: "skip", title: "Prefer not to say", detail: "Treated the same as “no” — you can change this any time" },
];

const MEDS: { id: MedEffect; title: string; detail: string }[] = [
  { id: "heart", title: "Something that affects heart rate", detail: "Beta blockers, thyroid, stimulants, and the like" },
  { id: "sleep", title: "Something that affects sleep", detail: "Sleep aids, antihistamines, some antidepressants" },
  { id: "unsure", title: "Something, not sure what it affects", detail: "We’ll read heart numbers with extra care" },
];

const RECORDS: { id: RecordsHabit; label: string }[] = [
  { id: "most", label: "Most sessions" },
  { id: "some", label: "Sometimes" },
  { id: "rarely", label: "Rarely" },
];

const SCHEDULE: { id: ScheduleKind; title: string; detail: string }[] = [
  { id: "steady", title: "Pretty consistent", detail: "Similar bed and wake times most days" },
  { id: "drift", title: "Weekdays vs weekends differ", detail: "We’ll treat them separately where it matters" },
  { id: "shift", title: "Shift work / very irregular", detail: "Baseline windows adapt to your actual sleep episodes" },
];

const CONTEXT: { id: ContextFlag; label: string }[] = [
  { id: "travel", label: "Frequent travel" },
  { id: "altitude", label: "Living at altitude" },
];

const QUESTIONS: { id: QuestionTemplateId; title: string; detail: string }[] = [
  { id: "baseline_first", title: "Just establish my baseline", detail: "Watch. Learn your normal. Decide later." },
  { id: "sleep_change", title: "Does something change my sleep?", detail: "Magnesium, screens, late meals, bedroom temp…" },
  { id: "recovery_change", title: "Does something change my recovery?", detail: "Alcohol, late workouts, sauna — read in night HR & HRV" },
  { id: "performance_change", title: "Does something change my training?", detail: "Caffeine, carbs, sleep extension — read in pace & load" },
  { id: "food_watch", title: "What foods don’t agree with me?", detail: "Tag meals and how your gut felt — patterns become testable questions" },
];

const RITUAL: { id: RitualSlot; title: string; detail: string }[] = [
  { id: "evening", title: "Evening, before bed", detail: "A nudge around 21:30 — tap your day’s tags, done" },
  { id: "morning", title: "Morning, with coffee", detail: "Log yesterday while the night’s data syncs in" },
  { id: "none", title: "No reminders", detail: "Honest warning: untagged days can’t join an experiment" },
];

/* ---------------- primitives (plain; Kalysha restyles) ---------------- */

function OptionRow({ title, detail, selected, onClick }: { title: string; detail: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="w-full text-left px-4 py-3 border"
      style={{
        borderColor: selected ? "var(--color-gold)" : "var(--color-border)",
        background: selected ? "color-mix(in srgb, var(--color-gold) 10%, transparent)" : "transparent",
        marginTop: 8,
      }}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs mt-0.5 text-[var(--color-text-muted)]">{detail}</div>
    </button>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="text-xs px-3 py-2 border"
      style={{
        borderColor: selected ? "var(--color-gold)" : "var(--color-border)",
        color: selected ? "var(--color-gold)" : "var(--color-text)",
      }}
    >
      {label}
    </button>
  );
}

function Step({ ov, title, sub, children, footer }: { ov: string; title: string; sub: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div>
      <div className="ov">{ov}</div>
      <h1 className="disp text-[32px] leading-[34px] mt-2 whitespace-pre-line">{title}</h1>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">{sub}</p>
      <div className="mt-5">{children}</div>
      <div className="mt-6 flex flex-col gap-2">{footer}</div>
    </div>
  );
}

function Why({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <p className="mt-4 text-xs text-[var(--color-text-muted)]">
      <span className="font-semibold">{lead} </span>
      {children}
    </p>
  );
}

/* ---------------- flow ---------------- */

export function OnboardingFlow({ initial, editing }: { initial: IntakeState | null; editing: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<IntakeState>(initial ?? EMPTY_INTAKE);
  const [idx, setIdx] = useState(editing || initial ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const steps = useMemo(() => stepsFor(state), [state]);
  const step = steps[Math.min(idx, steps.length - 1)];
  const patch = (p: Partial<IntakeState>) => setState((s) => ({ ...s, ...p }));
  const next = () => setIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const trains = state.goals.includes("running") || state.goals.includes("strength");
  const hasReal = state.devices.some((d) => d !== "none");

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await saveIntakeAction(state);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.replace(state.goals.includes("strength") && !state.goals.includes("running") ? "/body" : "/");
      router.refresh();
    });
  };

  const Continue = ({ disabled, label = "Continue" }: { disabled?: boolean; label?: string }) => (
    <>
      <button type="button" className="btn w-full" disabled={disabled} onClick={next}>{label}</button>
      {idx > 1 ? <button type="button" className="btn-ghost text-sm" onClick={back}>Back</button> : null}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[440px] px-5 pb-32 pt-8">
      {step !== "welcome" && step !== "build" ? (
        <div className="flex gap-1 mb-6">
          {steps.slice(1, -1).map((s, i) => (
            <div key={s} className="h-[3px] flex-1" style={{ background: i < idx ? "var(--color-gold)" : "var(--color-border)" }} />
          ))}
        </div>
      ) : null}

      {step === "welcome" && (
        <Step
          ov="Baseline"
          title={"Your normal,\nmeasured."}
          sub="Baseline learns what your body does on an ordinary day, then tests what actually moves it. A few questions first, so the app is built around you and not an average."
          footer={<button type="button" className="btn w-full" onClick={next}>Let’s set you up</button>}
        >
          <div />
        </Step>
      )}

      {step === "goals" && (
        <Step
          ov="What brings you here"
          title={"What do you want\nfrom Baseline?"}
          sub="Pick everything that's true. Your dashboard leads with what you care about — someone watching their heart health and someone chasing a faster 10K get different apps."
          footer={<Continue disabled={state.goals.length === 0} />}
        >
          {GOALS.map((g) => (
            <OptionRow key={g.id} title={g.title} detail={g.detail} selected={state.goals.includes(g.id)} onClick={() => patch({ goals: toggleIn(state.goals, g.id) })} />
          ))}
          <Why lead="No wrong answers:">goals only change what leads the screen and which questions we bother asking you. You can add or drop goals from Account any time.</Why>
        </Step>
      )}

      {step === "device" && (
        <Step
          ov="Where your data comes from"
          title={"What’s on\nyour wrist?"}
          sub="Pick everything you wear — many people run a watch and a ring. Each device covers what it measures well; together they cover more."
          footer={<Continue disabled={!(state.devices.length > 0 && (!hasReal || state.history !== null))} />}
        >
          {DEVICES.map((d) => (
            <OptionRow
              key={d.id}
              title={d.title}
              detail={d.detail}
              selected={state.devices.includes(d.id)}
              onClick={() => {
                let devices: DeviceId[];
                if (state.devices.includes(d.id)) devices = state.devices.filter((x) => x !== d.id);
                else if (d.id === "none") devices = ["none"];
                else devices = [...state.devices.filter((x) => x !== "none"), d.id];
                patch({ devices });
              }}
            />
          ))}
          {hasReal ? (
            <>
              <div className="ov mt-5">How long have you worn it?</div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {HISTORY.map((h) => (
                  <Chip key={h.id} label={h.label} selected={state.history === h.id} onClick={() => patch({ history: h.id })} />
                ))}
              </div>
              <Why lead="Why it matters:">a device worn for 60+ nights may already hold your baseline — we’ll read that history from Apple Health instead of making you wait.</Why>
            </>
          ) : null}
        </Step>
      )}

      {step === "about" && (
        <Step
          ov="Your physiology, not an average"
          title={"A little\nabout you."}
          sub="Reference ranges for resting heart rate, HRV and recovery differ by sex. Baseline compares you to your own numbers first, but this sets the starting point."
          footer={<Continue disabled={state.sex === null} />}
        >
          {SEX.map((o) => (
            <OptionRow
              key={o.id}
              title={o.title}
              detail={o.detail}
              selected={state.sex === o.id}
              onClick={() => patch({ sex: o.id, ...(o.id === "male" ? { cycle: "none" as CycleStatus } : {}) })}
            />
          ))}
        </Step>
      )}

      {step === "cycle" && (
        <Step
          ov="Your physiology, not an average"
          title={"Do you have\na menstrual cycle?"}
          sub="Cycle phase shifts night heart rate, HRV and temperature enough to fake — or bury — a real result. We adjust for it, or we switch it off entirely."
          footer={<Continue disabled={state.cycle === null} />}
        >
          {CYCLE.map((o) => (
            <OptionRow key={o.id} title={o.title} detail={o.detail} selected={state.cycle === o.id} onClick={() => patch({ cycle: o.id })} />
          ))}
        </Step>
      )}

      {step === "meds" && (
        <Step
          ov="Context, not surveillance"
          title={"Any regular\nmedications?"}
          sub="Some medications shift heart rate or sleep. Knowing that yours do means Baseline compares you to your own numbers correctly — and never flags your normal as odd. We never ask for names."
          footer={<Continue label={state.meds.length ? "Continue" : "None that matter — continue"} />}
        >
          {MEDS.map((m) => (
            <OptionRow key={m.id} title={m.title} detail={m.detail} selected={state.meds.includes(m.id)} onClick={() => patch({ meds: toggleIn(state.meds, m.id) })} />
          ))}
        </Step>
      )}

      {step === "training" && trains && (
        <Step
          ov="Your training"
          title={"Do you record\nyour sessions?"}
          sub="Performance answers come from recorded workouts — pace against heart rate, load against effort. No recordings, no performance verdicts; everything else still works."
          footer={<Continue disabled={state.records === null} />}
        >
          <div className="flex gap-2 flex-wrap">
            {RECORDS.map((r) => (
              <Chip key={r.id} label={r.label} selected={state.records === r.id} onClick={() => patch({ records: r.id })} />
            ))}
          </div>
        </Step>
      )}

      {step === "schedule" && (
        <Step
          ov="Your rhythm"
          title={"How steady is\nyour schedule?"}
          sub="A baseline is only as good as the routine underneath it. Nothing here disqualifies you — it just changes how carefully we read your nights."
          footer={<Continue disabled={state.schedule === null} />}
        >
          {SCHEDULE.map((o) => (
            <OptionRow key={o.id} title={o.title} detail={o.detail} selected={state.schedule === o.id} onClick={() => patch({ schedule: o.id })} />
          ))}
          <div className="ov mt-5">Anything else?</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {CONTEXT.map((c) => (
              <Chip key={c.id} label={c.label} selected={state.context.includes(c.id)} onClick={() => patch({ context: toggleIn(state.context, c.id) })} />
            ))}
          </div>
        </Step>
      )}

      {step === "question" && (
        <Step
          ov="One question at a time"
          title={"What do you\nwant to know?"}
          sub="Baseline answers one testable question at a time. Pick the itch — or just watch your baseline settle first."
          footer={<Continue disabled={state.question === null} />}
        >
          {QUESTIONS.map((q) => (
            <OptionRow key={q.id} title={q.title} detail={q.detail} selected={state.question === q.id} onClick={() => patch({ question: q.id })} />
          ))}
        </Step>
      )}

      {step === "ritual" && (
        <Step
          ov="The one habit"
          title={"Ten seconds,\nevery day."}
          sub="Sensors can’t see your day — what you took, ate, felt. One short check-in anchors everything the watch can’t measure."
          footer={<Continue disabled={state.ritual === null} />}
        >
          {RITUAL.map((o) => (
            <OptionRow key={o.id} title={o.title} detail={o.detail} selected={state.ritual === o.id} onClick={() => patch({ ritual: o.id })} />
          ))}
        </Step>
      )}

      {step === "build" && (
        <Step
          ov="Your Baseline"
          title={"Here’s what\nyou’ll see."}
          sub="Built from your answers. Change any of them from Account later — the app rebuilds itself."
          footer={
            <>
              {error ? <p className="text-xs" style={{ color: "var(--color-red)" }}>{error}</p> : null}
              <button type="button" className="btn w-full" disabled={pending} onClick={submit}>{pending ? "Building…" : "Looks right — let’s go"}</button>
              <button type="button" className="btn-ghost text-sm" onClick={back}>Back</button>
            </>
          }
        >
          <Summary s={state} />
        </Step>
      )}
    </div>
  );
}

function Summary({ s }: { s: IntakeState }) {
  const has = (g: GoalId) => s.goals.includes(g);
  const dev = new Set(s.devices);
  const wearable = dev.has("apple") || dev.has("suunto") || dev.has("garmin");
  const lines: string[] = [];
  if (wearable || dev.has("oura")) lines.push("Sleep and night resting heart rate, against your own baseline band");
  if (dev.has("oura")) lines.push("Overnight HRV, stress, SpO₂ and resilience from your Oura");
  if (has("strength")) lines.push("Strength log first: sets, volume vs your landmarks, estimated 1RM, fatigue signal");
  if (has("running")) lines.push(`Running & cardio${dev.has("apple") ? " with run dynamics from your Watch" : ""}`);
  if (wearable && (has("running") || has("strength"))) lines.push("Training load recomputed from your recorded workouts");
  if (s.cycle === "regular" || s.cycle === "irregular") lines.push("Cycle phase, and every analysis adjusted for it");
  if (has("food_gi")) lines.push("Meals and how your gut felt, turned into questions you can test");
  lines.push("Your daily check-in — the tags every experiment runs on");
  const skipped: string[] = [];
  if (!has("running")) skipped.push("running & cardio");
  if (!dev.has("oura")) skipped.push("Oura-only recovery signals");
  if (!(s.cycle === "regular" || s.cycle === "irregular")) skipped.push("cycle");
  return (
    <div>
      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li key={l} className="text-sm border-l-2 pl-3" style={{ borderColor: "var(--color-gold)" }}>{l}</li>
        ))}
      </ul>
      {skipped.length ? (
        <Why lead="Left out on purpose:">{skipped.join(", ")} — nothing to fill them with, so they don’t appear. Add a device or goal later and they come back.</Why>
      ) : null}
    </div>
  );
}
