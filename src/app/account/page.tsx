import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { DeleteAccountForm, SignOutButton } from "./account-actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  confirm: "Type DELETE exactly to confirm.",
  password: "Wrong password — nothing was deleted.",
  demo: "The demo can't be deleted.",
  owner: "This is the owner account. It can't be deleted from the app.",
};

/**
 * Account — sign out, privacy policy, delete account. Plain on purpose
 * (same card/field/btn classes as /login); Kalysha restyles.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await auth()) as { userId?: string } | null;
  if (!session?.userId) redirect("/login");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const isDemo = session.userId === DEMO_USER_ID;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });

  return (
    <div className="mx-auto w-full max-w-[440px] px-5 pb-32 pt-8">
      <div className="disp text-[34px] tracking-[0.04em]">ACCOUNT</div>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {isDemo ? "You're viewing the sample demo." : `Signed in as ${user?.email ?? "—"}`}
      </p>

      <div className="panel mt-6 flex flex-col gap-3">
        {isDemo ? (
          <Link href="/login" className="btn w-full text-center">Sign in</Link>
        ) : (
          <SignOutButton />
        )}
        <Link href="/privacy" className="text-sm underline text-[var(--color-text-muted)]">
          Privacy policy
        </Link>
      </div>

      {!isDemo && (
        <div className="panel mt-6">
          <div className="ov">Delete account</div>
          <p className="mb-4 mt-2 text-sm text-[var(--color-text-muted)]">
            Permanently deletes your account and everything in it — synced Health and Oura data,
            logs, workouts, experiments, and coach history. This can&apos;t be undone.
          </p>
          {error && (
            <p className="mb-3 text-xs" style={{ color: "var(--color-red)" }}>{error}</p>
          )}
          <DeleteAccountForm />
        </div>
      )}
    </div>
  );
}
