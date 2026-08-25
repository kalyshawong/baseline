import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * Invite-gated signup (friends phase, 2026-08-26). A valid unused invite
 * code (usually arriving as /signup?code=bl-xxxx) + email + password creates
 * an account and signs it straight in. Same server-action pattern and
 * styling as /login — works in the native shell webview with no client JS.
 *
 * The invite is consumed atomically via updateMany(usedAt: null) so two
 * people racing the same code can't both get in.
 */

const ERRORS: Record<string, string> = {
  code: "That invite code isn't valid or was already used.",
  email: "That email already has an account — try signing in.",
  password: "Password needs at least 8 characters.",
  unknown: "Something went wrong — try again.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session) redirect("/");
  const params = await searchParams;
  const prefillCode = typeof params.code === "string" ? params.code : "";
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;

  async function doSignup(formData: FormData) {
    "use server";
    const code = String(formData.get("code") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const back = (e: string) =>
      redirect(`/signup?code=${encodeURIComponent(code)}&error=${e}`);

    if (password.length < 8) back("password");

    const invite = await prisma.invite.findUnique({ where: { code } });
    if (!invite || invite.usedAt) back("code");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) back("email");

    let userId: string;
    try {
      const passwordHash = await hash(password, 12);
      const user = await prisma.user.create({
        data: { email, passwordHash, baselineStartedAt: new Date() },
      });
      userId = user.id;
    } catch {
      back("unknown");
      return;
    }

    // Consume the invite atomically — claimed==0 means someone else won the
    // race after our check above; roll the account back and bounce.
    const claimed = await prisma.invite.updateMany({
      where: { code, usedAt: null },
      data: { usedAt: new Date(), usedById: userId },
    });
    if (claimed.count === 0) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      back("code");
    }

    try {
      await signIn("credentials", { email, password, redirectTo: "/" });
    } catch (err) {
      if (err instanceof AuthError) redirect("/login");
      throw err; // NEXT_REDIRECT on success
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5">
      <div className="w-full max-w-[400px]">
        <div className="disp flex items-center gap-2.5 text-[34px] tracking-[0.04em]">
          <span
            className="inline-block h-[13px] w-[13px]"
            style={{ background: "var(--color-gold)", transform: "skewX(-12deg)" }}
          />
          BASELINE
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          You&apos;re invited. Your body, your baseline.
        </p>

        <form action={doSignup} className="panel mt-6 flex flex-col gap-3">
          <label className="ov" htmlFor="code">Invite code</label>
          <input
            id="code"
            name="code"
            type="text"
            required
            defaultValue={prefillCode}
            className="field"
            placeholder="bl-xxxxxxxx"
          />
          <label className="ov mt-2" htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field"
            placeholder="you@example.com"
          />
          <label className="ov mt-2" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
            placeholder="8+ characters"
          />
          {error && (
            <p className="text-xs" style={{ color: "var(--color-red)" }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn mt-3 w-full">
            Create account
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">
            Already have one? <a href="/login" className="underline">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
