import Link from "next/link";

export default function MindLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mind Mode</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Structured self-experimentation
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
          >
            Dashboard
          </Link>
          <Link
            href="/mind/experiments/new"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
          >
            New Experiment
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
