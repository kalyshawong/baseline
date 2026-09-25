"use server";

import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { DEMO_USER_ID, } from "@/lib/demo/constants";
import { SOLO_USER_ID } from "@/lib/current-user";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/**
 * Permanently deletes the signed-in account and everything it owns. Every
 * user-owned table cascades from User (prisma/schema.prisma), so one delete
 * removes all rows. Requires the password as confirmation. Required for App
 * Store review (guideline 5.1.1(v)).
 */
export async function deleteAccountAction(formData: FormData) {
  const session = (await auth()) as { userId?: string } | null;
  const userId = session?.userId;
  if (!userId) redirect("/login");
  if (userId === DEMO_USER_ID) redirect("/account?error=demo");
  // Kalysha's own tenant is the source for the public demo and years of
  // history — deleting it from a phone tap is never what she wants.
  if (userId === SOLO_USER_ID) redirect("/account?error=owner");

  const confirm = String(formData.get("confirm") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (confirm !== "DELETE") redirect("/account?error=confirm");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await compare(password, user.passwordHash))) {
    redirect("/account?error=password");
  }

  await prisma.user.delete({ where: { id: userId } });
  await signOut({ redirectTo: "/login?deleted=1" });
}
