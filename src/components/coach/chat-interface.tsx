"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Coach chat interface — "Focus" layout.
 * Design ref: Baseline Coach.html + baseline-coach.css
 */

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Session {
  id: string;
  title: string | null;
  updatedAt?: string;
}

interface GoalOption {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
  isPrimary: boolean;
  deadline: string | null;
}

function formatMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h3 key={i} className="text-[14px] font-bold mt-3 mb-[5px] text-[var(--color-text)]">
          {line.slice(3)}
        </h3>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h2 key={i} className="disp text-[24px] tracking-[0.01em] mt-[2px] mb-2 text-[var(--color-text)]">
          {line.slice(2)}
        </h2>
      );
    }
    if (line.match(/^[-*] /)) {
      return (
        <div key={i} className="flex gap-[10px] my-1 text-[var(--color-text-muted)]">
          <span
            className="mt-[8px] block h-[5px] w-[5px] shrink-0"
            style={{ background: "var(--color-gold)" }}
          />
          <span>{formatInline(line.slice(2))}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="mb-2 text-[var(--color-text-muted)] last:mb-0">
        {formatInline(line)}
      </p>
    );
  });
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-[var(--color-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ChatInterface({
  initialSession,
  initialMessages,
  sessions,
  goals,
  initialInput,
  dailyBrief,
}: {
  initialSession: Session | null;
  initialMessages: Message[];
  sessions: Session[];
  goals: GoalOption[];
  initialInput?: string | null;
  dailyBrief?: { title: string; body: string } | null;
}) {
  const router = useRouter();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialSession?.id ?? null
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState(initialInput ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const primaryGoal = goals.find((g) => g.isPrimary);
  const [focusGoalId, setFocusGoalId] = useState<string | null>(
    primaryGoal?.id ?? null
  );
  const [coachMode, setCoachMode] = useState<"goal" | "today">("goal");

  const [tradeoffs, setTradeoffs] = useState<
    Array<{ severity: "info" | "warning" | "critical"; message: string }>
  >([]);

  useEffect(() => {
    fetch("/api/coach/tradeoffs")
      .then((r) => r.json())
      .then((data) => setTradeoffs(data.tradeoffs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function getSuggestedPrompts(): Array<{ label: string; prompt: string }> {
    const focusGoal = goals.find((g) => g.id === focusGoalId);

    if (coachMode === "today") {
      return [
        { label: "What's my training tier today?", prompt: "What's my training tier today based on my readiness and recovery data?" },
        { label: "Any recovery flags?", prompt: "Are there any recovery flags I should know about before training today?" },
        { label: "Walk me through my numbers", prompt: "Walk me through today's readiness, sleep, and HRV numbers." },
      ];
    }

    if (focusGoal?.type === "race") {
      if (focusGoal.subtype === "hyrox") {
        return [
          { label: "How should I train tomorrow?", prompt: "Based on my data, how should I structure tomorrow's Hyrox training?" },
          { label: "Am I building enough base?", prompt: `Am I building enough aerobic base for my ${focusGoal.title} goal? What does my VO2max and running volume trend look like?` },
          { label: "Station practice plan", prompt: "Give me a Hyrox station practice session that fits my current recovery state." },
        ];
      }
      return [
        { label: "Am I on pace?", prompt: `Am I on pace for ${focusGoal.title}? What does my training volume and VO2max trend say?` },
        { label: "Long run guidance", prompt: "What should my long run look like this week given my current recovery?" },
        { label: "Race week plan", prompt: `Help me plan the final week before ${focusGoal.title}.` },
      ];
    }

    if (focusGoal?.type === "strength") {
      return [
        { label: "Should I deload?", prompt: "Based on my RPE trends and HRV, should I deload this week?" },
        { label: "Am I recovering enough?", prompt: "Am I recovering enough between sessions? What does my readiness and sleep data say?" },
        { label: "Protein check", prompt: "How's my protein intake relative to my training volume this week?" },
      ];
    }

    if (focusGoal?.type === "weight") {
      return [
        { label: "Am I on track?", prompt: "Am I on track with my weight goal? Show me the trend and weekly rate of change." },
        { label: "Energy availability check", prompt: "What's my current energy availability? Am I in a safe range?" },
        { label: "Nutrition vs training", prompt: "How should I adjust my nutrition for today's planned training?" },
      ];
    }

    return [
      { label: "Today's brief", prompt: "Give me today's brief — what should I focus on?" },
      { label: "Goal progress check", prompt: "Am I on track for my primary goal? What needs to change?" },
      { label: "Competing priorities", prompt: "I have competing priorities this week. Help me prioritize." },
    ];
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const messageText = input.trim();
    setInput("");
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message: messageText,
            focusGoalId: coachMode === "goal" ? focusGoalId : null,
            mode: coachMode === "today" ? "today" : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Coach failed to respond");
        }
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        if (!currentSessionId) {
          setCurrentSessionId(data.sessionId);
          window.history.replaceState(null, "", `/coach?session=${data.sessionId}`);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      }
    });
  }

  function startNewChat() {
    setCurrentSessionId(null);
    setMessages([]);
    setError(null);
    window.history.replaceState(null, "", "/coach");
  }

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--color-surface)",
        backgroundImage: "linear-gradient(160deg, oklch(1 0 0 / 0.025), transparent 40%)",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 12px 30px -16px #000",
        minHeight: "66vh",
      }}
    >
      {/* ── Lens bar ── */}
      {goals.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-5 py-[14px] border-b border-[var(--color-border)]">
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--color-faint)] mr-[2px]">
            Lens
          </span>
          {goals.map((g) => {
            const isActive = coachMode === "goal" && focusGoalId === g.id;
            const daysLeft = g.deadline
              ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)
              : null;
            return (
              <button
                key={g.id}
                onClick={() => { setCoachMode("goal"); setFocusGoalId(g.id); }}
                className="shrink-0 text-[12.5px] font-semibold px-[13px] py-[7px] inline-flex items-center gap-[6px] whitespace-nowrap cursor-pointer border border-transparent transition-all"
                style={{
                  background: isActive ? "var(--color-gold)" : "var(--color-surface-2)",
                  color: isActive ? "var(--color-bg)" : "var(--color-text-muted)",
                }}
              >
                {g.isPrimary && (
                  <span style={{ color: isActive ? "var(--color-bg)" : "var(--color-gold)" }}>&#9733;</span>
                )}
                {g.title.length > 20 ? g.title.slice(0, 20) + "\u2026" : g.title}
                {daysLeft !== null && daysLeft > 0 && (
                  <span className="text-[11px] opacity-60">{daysLeft}d</span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => { setCoachMode("goal"); setFocusGoalId(null); }}
            className="shrink-0 text-[12.5px] font-semibold px-[13px] py-[7px] cursor-pointer border border-transparent transition-all"
            style={{
              background: coachMode === "goal" && !focusGoalId ? "var(--color-gold)" : "var(--color-surface-2)",
              color: coachMode === "goal" && !focusGoalId ? "var(--color-bg)" : "var(--color-text-muted)",
            }}
          >
            Holistic
          </button>
          <button
            onClick={() => setCoachMode("today")}
            className="ml-auto shrink-0 text-[12.5px] font-semibold px-[13px] py-[7px] cursor-pointer border border-transparent transition-all"
            style={{
              background: coachMode === "today" ? "var(--color-blue)" : "var(--color-surface-2)",
              color: coachMode === "today" ? "var(--color-bg)" : "var(--color-text-muted)",
            }}
          >
            Daily Brief
          </button>
        </div>
      )}

      {/* ── Tradeoff alerts ── */}
      {tradeoffs.length > 0 && (
        <div className="border-b border-[var(--color-border)] px-5 py-3 flex flex-col gap-2">
          {tradeoffs.map((t, i) => {
            const sev = t.severity === "critical" ? "red" : t.severity === "warning" ? "yellow" : "blue";
            const varColor = `var(--color-${sev})`;
            return (
              <div
                key={i}
                className="flex gap-[9px] items-baseline text-[13px] px-[13px] py-[9px]"
                style={{
                  background: `color-mix(in oklch, ${varColor}, transparent 88%)`,
                  color: varColor,
                  borderLeft: `3px solid ${varColor}`,
                }}
              >
                <span className="font-extrabold flex-none">
                  {t.severity === "critical" ? "\u26A0" : t.severity === "warning" ? "\u25B3" : "\u2139"}
                </span>
                {t.message}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Thread ── */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-[18px]">
        {/* Daily Brief card — always pinned at top */}
        {dailyBrief && messages.length === 0 && (
          <div
            className="p-[18px_22px]"
            style={{
              background: "color-mix(in oklch, var(--color-blue), var(--color-surface) 88%)",
              border: "1px solid color-mix(in oklch, var(--color-blue), transparent 65%)",
              borderLeft: "4px solid var(--color-blue)",
            }}
          >
            <p
              className="text-[10.5px] font-extrabold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-blue)" }}
            >
              Daily Brief &middot; {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <h3 className="disp text-[24px] mt-[6px] mb-2">{dailyBrief.title}</h3>
            <p className="text-[13.5px] leading-[1.5] text-[var(--color-text-muted)]">
              {formatInline(dailyBrief.body)}
            </p>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
            <h3 className="disp text-[54px] leading-[0.9] tracking-[0.02em]">BASELINE COACH</h3>
            <p className="mt-2 max-w-[440px] text-[14px] text-[var(--color-text-muted)]">
              Science-backed coaching with full access to your biometric, training,
              nutrition, cycle, and goal data.
            </p>
            <div className="mt-[26px] w-full max-w-[440px] flex flex-col gap-[9px]">
              {getSuggestedPrompts().map((sp, i) => (
                <button
                  key={i}
                  onClick={() => setInput(sp.prompt)}
                  className="text-left text-[13.5px] text-[var(--color-text-muted)] px-4 py-[13px] cursor-pointer transition-colors hover:text-[var(--color-text)]"
                  style={{
                    background: "var(--color-surface-2)",
                    borderLeft: "3px solid var(--color-border)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = "var(--color-gold)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = "var(--color-border)")}
                >
                  &ldquo;{sp.label}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Daily Brief card — always pinned at top of thread */}
            {dailyBrief && (
              <div
                className="p-[18px_22px] mb-1"
                style={{
                  background: "color-mix(in oklch, var(--color-blue), var(--color-surface) 88%)",
                  border: "1px solid color-mix(in oklch, var(--color-blue), transparent 65%)",
                  borderLeft: "4px solid var(--color-blue)",
                }}
              >
                <p
                  className="text-[10.5px] font-extrabold uppercase tracking-[0.14em]"
                  style={{ color: "var(--color-blue)" }}
                >
                  Daily Brief &middot; {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <h3 className="disp text-[24px] mt-[6px] mb-2">{dailyBrief.title}</h3>
                <p className="text-[13.5px] leading-[1.5] text-[var(--color-text-muted)]">
                  {formatInline(dailyBrief.body)}
                </p>
              </div>
            )}

            {messages.map((m, idx) => {
              if (coachMode === "today" && idx === 0 && m.role === "assistant") return null;

              return (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[78%]">
                    {m.role === "assistant" && focusGoalId && (() => {
                      const g = goals.find((gl) => gl.id === focusGoalId);
                      return g ? (
                        <div className="mb-[6px] text-[10.5px] text-[var(--color-faint)] tracking-[0.02em]">
                          {coachMode === "today" ? "Daily Brief" : g.type} lens &mdash;{" "}
                          <b className="font-semibold" style={{ color: "var(--color-gold)" }}>
                            {coachMode === "today" ? "today's readiness" : g.title}
                          </b>
                        </div>
                      ) : null;
                    })()}
                    <div
                      className="px-5 py-4 text-[14px] leading-[1.55]"
                      style={
                        m.role === "user"
                          ? {
                              background: "var(--color-surface-2)",
                              color: "var(--color-text)",
                              borderRight: "3px solid var(--color-gold)",
                            }
                          : {
                              background: "var(--color-bg)",
                              border: "1px solid var(--color-border)",
                              borderLeft: "3px solid var(--color-gold)",
                            }
                      }
                    >
                      {m.role === "assistant" ? (
                        <div>{formatMarkdown(m.content)}</div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {isPending && (
              <div className="flex justify-start">
                <div
                  className="px-5 py-4 inline-flex gap-[5px]"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    borderLeft: "3px solid var(--color-gold)",
                  }}
                >
                  {[0, 1, 2].map((n) => (
                    <span
                      key={n}
                      className="block h-[7px] w-[7px] rounded-full"
                      style={{
                        background: "var(--color-faint)",
                        animation: "coach-typing 1s infinite",
                        animationDelay: `${n * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {error && (
        <div
          className="mx-5 mb-2 px-3 py-2 text-xs"
          style={{
            color: "var(--color-red)",
            background: "color-mix(in oklch, var(--color-red), transparent 88%)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Composer ── */}
      <form
        onSubmit={sendMessage}
        className="border-t border-[var(--color-border)] p-[16px_20px] flex gap-[10px]"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(e);
            }
          }}
          placeholder="Ask your coach..."
          rows={2}
          className="flex-1 resize-none text-[14px] leading-[1.45] px-[15px] py-[13px] outline-none"
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-gold)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
        />
        <button
          type="submit"
          disabled={!input.trim() || isPending}
          className="angled-clip px-[22px] text-[13px] font-bold uppercase tracking-[0.06em] cursor-pointer disabled:opacity-30"
          style={{
            background: "var(--color-gold)",
            color: "var(--color-bg)",
            border: "none",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
