"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

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

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMarkdown(text: string): React.ReactNode {
  // Very light markdown: headers, bold, bullets
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h3 key={i} className="mt-3 mb-1 text-sm font-semibold">
          {line.slice(3)}
        </h3>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h2 key={i} className="mt-3 mb-1 text-base font-bold">
          {line.slice(2)}
        </h2>
      );
    }
    if (line.match(/^[-*] /)) {
      return (
        <div key={i} className="ml-3 flex gap-2">
          <span className="text-[var(--color-text-muted)]">•</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="mb-1 leading-relaxed">
        {formatInline(line)}
      </p>
    );
  });
}

function formatInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
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
}: {
  initialSession: Session | null;
  initialMessages: Message[];
  sessions: Session[];
  goals: GoalOption[];
}) {
  const router = useRouter();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialSession?.id ?? null
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
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
        // Roll back the user message on error
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

  async function deleteSession(id: string) {
    await fetch(`/api/coach/sessions/${id}`, { method: "DELETE" });
    if (currentSessionId === id) startNewChat();
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* Session sidebar */}
      <aside className="space-y-2">
        <button
          onClick={startNewChat}
          className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
        >
          + New Chat
        </button>
        <div className="space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group relative rounded-lg border px-3 py-2 text-xs transition-all ${
                currentSessionId === s.id
                  ? "border-white/30 bg-white/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]/30"
              }`}
            >
              <button
                onClick={() => {
                  setCurrentSessionId(s.id);
                  window.location.href = `/coach?session=${s.id}`;
                }}
                className="block w-full truncate text-left"
              >
                <span className="block truncate">{s.title ?? "Untitled"}</span>
                {s.updatedAt && (
                  <span className="block text-[10px] text-[var(--color-text-muted)] opacity-60">
                    {relativeDate(s.updatedAt)}
                  </span>
                )}
              </button>
              <button
                onClick={() => deleteSession(s.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex min-h-[70vh] flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Coaching focus pills */}
        {goals.length > 0 && (
          <div className="border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
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
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? "border-white/40 bg-white/15 text-white shadow-sm"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {g.isPrimary && <span className="mr-1 text-amber-400">★</span>}
                    {g.title.length > 20 ? g.title.slice(0, 20) + "…" : g.title}
                    {daysLeft !== null && daysLeft > 0 && (
                      <span className="ml-1.5 opacity-60">{daysLeft}d</span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={() => { setCoachMode("goal"); setFocusGoalId(null); }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  coachMode === "goal" && !focusGoalId
                    ? "border-white/40 bg-white/15 text-white"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white"
                }`}
              >
                Holistic
              </button>
              <button
                onClick={() => setCoachMode("today")}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  coachMode === "today"
                    ? "border-blue-400/40 bg-blue-500/15 text-blue-300"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white"
                }`}
              >
                Daily Brief
              </button>
            </div>
          </div>
        )}

        {/* Tradeoff alerts */}
        {tradeoffs.length > 0 && (
          <div className="border-b border-[var(--color-border)] px-5 py-2 space-y-1">
            {tradeoffs.map((t, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs ${
                  t.severity === "critical"
                    ? "bg-red-500/10 text-red-400"
                    : t.severity === "warning"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-blue-500/10 text-blue-300"
                }`}
              >
                <span className="font-semibold uppercase mr-1.5">
                  {t.severity === "critical" ? "\u26A0" : t.severity === "warning" ? "\u25B3" : "\u2139"}
                </span>
                {t.message}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <h3 className="mb-2 text-lg font-semibold">Baseline Coach</h3>
              <p className="max-w-md text-sm text-[var(--color-text-muted)]">
                Science-backed coaching with full access to your biometric, training,
                nutrition, cycle, and goal data.
              </p>
              <div className="mt-6 space-y-2 text-left">
                {getSuggestedPrompts().map((sp, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(sp.prompt)}
                    className="block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-xs hover:bg-white/5"
                  >
                    &ldquo;{sp.label}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[85%]">
                    {m.role === "assistant" && focusGoalId && (() => {
                      const g = goals.find((gl) => gl.id === focusGoalId);
                      return g ? (
                        <div className="mb-1 text-[10px] text-[var(--color-text-muted)]">
                          Responding through {g.type} lens — {g.title}
                        </div>
                      ) : null;
                    })()}
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        m.role === "user"
                          ? "bg-white/10 text-white"
                          : "bg-[var(--color-surface-2)] text-white"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <div className="prose-sm">{formatMarkdown(m.content)}</div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isPending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse [animation-delay:0.2s]">●</span>
                      <span className="animate-pulse [animation-delay:0.4s]">●</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <form
          onSubmit={sendMessage}
          className="border-t border-[var(--color-border)] p-4"
        >
          <div className="flex gap-2">
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
              className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isPending}
              className="rounded-xl bg-white/10 px-4 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
