export default function MindLayout({ children }: { children: React.ReactNode }) {
  return (
    // py desktop-only — .bl-m owns mobile spacing (see body/layout.tsx).
    <div className="mx-auto max-w-[1440px] md:py-2">
      {children}
    </div>
  );
}
