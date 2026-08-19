import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { AuthError } from "next-auth";

/**
 * Login — credentials (email + password). Styled to the Baseline system;
 * single card, works at phone and desktop widths, and inside the native
 * shell's webview (plain form POST → server action, no client JS needed).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session) redirect("/");
  const params = await searchParams;
  const failed = params.error != null;

  async function doLogin(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      // signIn throws NEXT_REDIRECT on success — rethrow those.
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
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
          Your baseline. Your data. Sign in.
        </p>

        <form action={doLogin} className="panel mt-6 flex flex-col gap-3">
          <label className="ov" htmlFor="email">Email</label>
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
            autoComplete="current-password"
            className="field"
            placeholder="••••••••"
          />
          {failed && (
            <p className="text-xs" style={{ color: "var(--color-red)" }}>
              Wrong email or password.
            </p>
          )}
          <button type="submit" className="btn mt-3 w-full">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
