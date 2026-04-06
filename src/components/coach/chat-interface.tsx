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
}: {
  initialSession: Session | null;
  initialMessages: Message[];
  sessions: Session[];
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
                {s.title ?? "Untitled"}
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
        <div className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <h3 className="mb-2 text-lg font-semibold">Baseline Coach</h3>
              <p className="max-w-md text-sm text-[var(--color-text-muted)]">
                Science-backed coaching with full access to your biometric, training,
                nutrition, cycle, and goal data. Ask about training decisions,
                recovery, nutrition trade-offs, or competing priorities.
              </p>
              <div className="mt-6 space-y-2 text-left">
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  Try asking:
                </p>
                <button
                  onClick={() => setInput("Based on today's readiness and my cycle phase, should I train heavy or take it easy?")}
                  className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-white/5"
                >
                  &ldquo;Based on today&apos;s readiness and my cycle phase, should I train heavy or take it easy?&rdquo;
                </button>
                <button
                  onClick={() => setInput("Am I on track for my protein target? What should I eat next?")}
                  className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-white/5"
                >
                  &ldquo;Am I on track for my protein target? What should I eat next?&rdquo;
                </button>
                <button
                  onClick={() => setInput("I have competing priorities this week. Help me prioritize.")}
                  className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-white/5"
                >
                  &ldquo;I have competing priorities this week. Help me prioritize.&rdquo;
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
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
