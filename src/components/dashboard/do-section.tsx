import Link from "next/link";

/**
 * The "DO" section of the dashboard — three deep-link actions for the
 * mid-day use mode.
 *
 * Logging in Baseline happens on /mind (food, mood, symptoms), and
 * coach conversation happens on /coach. The dashboard's job for the
 * mid-day opens is *not* to host another logging surface — it's to
 * get you to /mind in one tap. No card chrome, no data display, just
 * three large tap targets that route.
 *
 * Per the brainstorm convergence: the dashboard exists to honor the
 * morning call. The only things that earn a place under the hero are
 * (a) context for the call, (b) actions you can take in response,
 * (c) tomorrow prep. This component is (b).
 */
export function DoSection() {
  return (
    <section className="mt-8 mb-8 grid grid-cols-3 gap-[14px]">
      <ActionLink href="/mind" label="Log food" />
      <ActionLink href="/mind" label="Log workout" />
      <ActionLink href="/coach" label="Open coach" />
    </section>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="panel group flex items-center justify-between border-l-4 border-[var(--color-gold)] px-5 py-4 transition duration-150 ease-out-strong hover:bg-[var(--color-surface-2)] active:scale-[0.98]"
    >
      <span className="disp text-[28px] tracking-[0.02em] text-[var(--color-text)]">
        {label}
      </span>
      <span className="text-[var(--color-gold)] text-xl" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
