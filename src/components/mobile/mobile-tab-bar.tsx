"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom tab bar (mobile only — md:hidden). Mirrors the "Baseline iOS"
 * design's 5-tab nav, wired to the real routes. Active state from the
 * current pathname. Lives app-wide via the root layout.
 */
const TABS = [
  {
    href: "/",
    label: "Today",
    isActive: (p: string) => p === "/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/mind",
    label: "Mind",
    isActive: (p: string) => p.startsWith("/mind"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M9 3v5L5 17a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4L15 8V3" />
        <path d="M8 3h8" />
        <path d="M7.5 13h9" />
      </svg>
    ),
  },
  {
    href: "/body",
    label: "Body",
    isActive: (p: string) => p.startsWith("/body"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 12h4l2-6 4 13 2.5-7H21" />
      </svg>
    ),
  },
  {
    href: "/coach",
    label: "Coach",
    isActive: (p: string) => p.startsWith("/coach"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M4 5h16v11H9l-5 4z" />
        <path d="M8 9h8" />
        <path d="M8 12.5h5" />
      </svg>
    ),
  },
  {
    href: "/goals",
    label: "Goals",
    isActive: (p: string) => p.startsWith("/goals"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
];

export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="m-tabbar md:hidden" aria-label="Primary">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`m-tab${t.isActive(pathname) ? " on" : ""}`}
          aria-current={t.isActive(pathname) ? "page" : undefined}
        >
          {t.icon}
          <span className="lab">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
