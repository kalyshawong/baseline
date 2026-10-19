"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/** Drops the saved coach version; the goal goes back to the calculated plan. */
export function RevertSaved({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const res = await fetch(`/api/goals/${goalId}/plan/saved`, { method: "DELETE" });
        if (res.ok) router.refresh();
      })}
      style={{ fontSize: 13, textDecoration: "underline", color: "var(--color-text-muted)", background: "none", border: 0, padding: 0, cursor: "pointer" }}
    >
      {pending ? "Reverting…" : "Revert to calculated"}
    </button>
  );
}
