"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Mobile Coach — faithful to the "Baseline iOS" Coach mock (coachhead, lens bar,
 * brief card, user/ai bubbles, pinned composer). Reuses the exact /api/coach
 * request/response + markdown behaviour from the desktop ChatInterface.
 */

interface Message { id: string; role: "user" | "assistant"; content: string; createdAt: string; }
interface Session { id: string; title: string | null; updatedAt?: string; }
interface GoalOption { id: string; title: string; type: string; subtype: string | null; isPrimary: boolean; deadline: string | null; }

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}
function md(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("## ")) return <h3 key={i}>{inline(line.slice(3))}</h3>;
    if (line.startsWith("# ")) return <h2 key={i}>{inline(line.slice(2))}</h2>;
    if (/^[-*] /.test(line)) return <div key={i} className="bul"><span>{inline(line.slice(2))}</span></div>;
    if (line.trim() === "") return null;
    return <p key={i}>{inline(line)}</p>;
  });
}

function daysTo(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

export function MobileCoach({
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSession?.id ?? null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState(initialInput ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const primaryGoal = goals.find((g) => g.isPrimary);
  const [focusGoalId, setFocusGoalId] = useState<string | null>(primaryGoal?.id ?? null);
  const [coachMode, setCoachMode] = useState<"goal" | "today">("goal");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeLensName = coachMode === "today" ? "Daily Brief" : (goals.find((g) => g.id === focusGoalId)?.title ?? "Coach");

  function send(text: string) {
    if (!text.trim() || isPending) return;
    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content: text.trim(), createdAt: new Date().toISOString() };
    setMessages((p) => [...p, userMessage]);
    setInput("");
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message: text.trim(),
            focusGoalId: coachMode === "goal" ? focusGoalId : null,
            mode: coachMode === "today" ? "today" : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Coach failed to respond");
        }
        const data = await res.json();
        setMessages((p) => [...p, data.message]);
        if (!currentSessionId) {
          setCurrentSessionId(data.sessionId);
          window.history.replaceState(null, "", `/coach?session=${data.sessionId}`);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setMessages((p) => p.filter((m) => m.id !== userMessage.id));
      }
    });
  }

  function newChat() {
    setCurrentSessionId(null);
    setMessages([]);
    setError(null);
    window.history.replaceState(null, "", "/coach");
  }

  const briefDate = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="bl-m coach-pad">
      <div className="coachhead">
        <h1>BASELINE COACH</h1>
        <div className="sub">Science-backed coaching with full access to your data.</div>
      </div>

      <div className="focusbar">
        <button className="newchat" onClick={newChat}>+ New Chat</button>
        <a className="hist" href="/coach?view=history">⏱ History {sessions.length > 0 && <b>{sessions.length}</b>}</a>
      </div>

      <div className="lensbar">
        <span className="lbl">Lens</span>
        {goals.map((g) => {
          const d = daysTo(g.deadline);
          const on = coachMode === "goal" && focusGoalId === g.id;
          return (
            <button
              key={g.id}
              className={`lens ${on ? "on" : ""}`}
              onClick={() => { setFocusGoalId(g.id); setCoachMode("goal"); }}
            >
              {g.isPrimary && <span className="star">★</span>}
              {g.title}
              {d != null && <span className="days">{d}d</span>}
            </button>
          );
        })}
        <button
          className={`lens brief ${coachMode === "today" ? "on" : ""}`}
          onClick={() => setCoachMode("today")}
        >
          Daily Brief
        </button>
      </div>

      <div className="thread">
        {dailyBrief && (
          <div className="briefcard">
            <div className="ey">Daily Brief · {briefDate}</div>
            <h3>{dailyBrief.title}</h3>
            <p>{inline(dailyBrief.body)}</p>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div className="msg user" key={m.id}><div className="bubble user">{m.content}</div></div>
          ) : (
            <div className="msg ai" key={m.id}>
              <div className="bubble ai">
                <div className="lenslabel">{activeLensName} lens</div>
                <div className="md">{md(m.content)}</div>
              </div>
            </div>
          )
        )}

        {isPending && (
          <div className="msg ai"><div className="typing"><i></i><i></i><i></i></div></div>
        )}

        {messages.length === 0 && !isPending && (
          <div className="stack" style={{ marginTop: 4 }}>
            {[
              "What's my training tier today?",
              "Any recovery flags I should know about?",
              "Am I on track for my primary goal?",
            ].map((p) => (
              <button key={p} className="tagchip" style={{ textAlign: "left", justifyContent: "flex-start" }} onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
        )}

        {error && <p style={{ color: "var(--red)", fontSize: 12, padding: "0 2px" }}>{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="m-composer"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <textarea
          rows={2}
          placeholder="Ask your coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <button className="send" type="submit" disabled={isPending || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
