import Link from "next/link";

/**
 * Privacy policy — public (exempt from the middleware gate) because the App
 * Store listing links to it. Keep it true to what the code does; update it
 * in the same commit as any change to what's collected or who processes it.
 */
export const metadata = { title: "Privacy · Baseline" };

const UPDATED = "September 25, 2026";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="ov mt-8">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[680px] px-5 pb-32 pt-8 text-[15px] leading-relaxed">
      <div className="disp text-[34px] tracking-[0.04em]">PRIVACY</div>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Last updated {UPDATED}</p>

      <p className="mt-6">
        Baseline learns your personal baseline from your own body data. This page says what we
        collect, where it goes, and how to delete it.
      </p>

      <H>What we collect</H>
      <ul className="mt-2 list-disc pl-5">
        <li>Your account: email and a hashed password.</li>
        <li>
          Apple Health data you allow: workouts (with routes and splits for runs), heart rate,
          heart rate variability, resting heart rate, sleep, activity and energy, blood oxygen,
          and menstrual cycle data.
        </li>
        <li>Oura data, if you connect your Oura account.</li>
        <li>What you enter: meals, tags, check-ins, strength sets, goals, experiments, and notes.</li>
        <li>Messages you send to the coach.</li>
      </ul>

      <H>How we use it</H>
      <p className="mt-2">
        Only to run Baseline for you: compute your baselines, scores, and experiment results, and
        answer your coach questions. Your data is never pooled with other users&apos; data, never
        sold, and never used for advertising. Apple Health data is not shared with third parties
        for advertising or marketing.
      </p>

      <H>Who processes it</H>
      <ul className="mt-2 list-disc pl-5">
        <li>Supabase stores the database. Vercel hosts the app.</li>
        <li>
          Anthropic generates coach replies, workout-note analysis, and meal estimates. When you
          use those features, the relevant data is sent to Anthropic to produce the answer.
        </li>
        <li>Oura sends us your Oura data when you connect it.</li>
      </ul>

      <H>Deleting your data</H>
      <p className="mt-2">
        Go to <Link href="/account" className="underline">Account</Link> → Delete account. Your
        account and all its data are deleted immediately. To stop Health syncing without deleting
        anything, sign out, or turn off Baseline&apos;s access in the iPhone Settings app under
        Health → Data Access &amp; Devices.
      </p>

      <H>Contact</H>
      <p className="mt-2">
        Questions or requests: <a href="mailto:kalysha@gmail.com" className="underline">kalysha@gmail.com</a>
      </p>
    </div>
  );
}
