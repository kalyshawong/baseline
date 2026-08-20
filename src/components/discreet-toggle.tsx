"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Eye toggle for discreet mode (see lib/discreet.ts). Sets the bl_discreet
 * cookie and refreshes so the server re-renders without (or with) the
 * intimate cards. Deliberately unlabeled — a label like "hide private
 * cards" would itself announce there's something to hide.
 */
export function DiscreetToggle({ className }: { className?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.cookie.split("; ").some((c) => c === "bl_discreet=1"));
  }, []);

  function toggle() {
    const next = !on;
    // 12h max-age when enabling; expire immediately when disabling.
    document.cookie = next
      ? "bl_discreet=1; path=/; max-age=43200; samesite=lax"
      : "bl_discreet=; path=/; max-age=0; samesite=lax";
    setOn(next);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={on ? "Show all cards" : "Discreet mode"}
      style={on ? { color: "var(--gold, var(--color-gold))" } : undefined}
    >
      {on ? (
        /* eye-off */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
      ) : (
        /* eye */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
