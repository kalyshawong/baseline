export default function BodyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1320px] px-9 py-6">
      {children}
    </div>
  );
}
