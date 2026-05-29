"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/mind", label: "Mind" },
  { href: "/body", label: "Body" },
  { href: "/coach", label: "Coach" },
  { href: "/goals", label: "Goals" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b-2 border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-9 py-5">
        {/* Brand mark: gold skewed square + Bebas "BASELINE" */}
        <Link href="/" className="disp flex items-center gap-2.5 text-[30px] tracking-[0.04em]">
          <span
            className="inline-block h-3.5 w-3.5 bg-[var(--color-gold)]"
            style={{ transform: "skewX(-12deg)" }}
            aria-hidden
          />
          BASELINE
        </Link>

        {/* Desktop nav */}
        <div className="hidden gap-1.5 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`angled-clip px-4 py-2 text-[13px] font-bold uppercase tracking-[0.06em] transition duration-150 ease-out-strong ${
                isActive(pathname, l.href)
                  ? "bg-[var(--color-gold)] text-[var(--color-bg)] accent-glow"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="flex h-8 w-8 items-center justify-center text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:bg-[var(--color-surface-2)] active:scale-[0.92] sm:hidden"
          aria-label="Toggle menu"
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 4h14M2 9h14M2 14h14" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="border-t-2 border-[var(--color-border)] px-9 py-2 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] transition duration-150 ease-out-strong ${
                isActive(pathname, l.href)
                  ? "bg-[var(--color-gold)] text-[var(--color-bg)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
