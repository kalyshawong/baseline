export default function MindLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] py-2">
      {children}
    </div>
  );
}
