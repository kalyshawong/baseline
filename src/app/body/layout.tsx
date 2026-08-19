export default function BodyLayout({ children }: { children: React.ReactNode }) {
  return (
    // Container padding is desktop-only: the mobile design (.bl-m) manages
    // its own 16px gutters, so px-9/py-6 here was ADDING 36px sides + 24px
    // top on phones (the "too much space on the sides").
    <div className="mx-auto max-w-[1320px] md:px-9 md:py-6">
      {children}
    </div>
  );
}
