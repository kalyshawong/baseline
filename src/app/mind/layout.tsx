export default function MindLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Mind Mode</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Structured self-experimentation
        </p>
      </div>
      {children}
    </div>
  );
}
