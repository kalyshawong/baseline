import Link from "next/link";

export default function BodyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Body Mode</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Science-backed training intelligence
          </p>
        </div>
        <Link
          href="/body/workout/new"
          className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/30"
        >
          Start Workout
        </Link>
      </div>
      {children}
    </div>
  );
}
