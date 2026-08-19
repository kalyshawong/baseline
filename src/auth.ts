import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * Auth.js v5 — credentials (email + bcrypt password) with JWT sessions.
 *
 * Deliberately vendor-free for the solo/friends phase: no adapter tables, no
 * email provider. JWT strategy keeps the middleware session check edge-fast
 * (no DB hit per request). The session carries userId so server code can
 * resolve the tenant without a lookup.
 *
 * Swap path (documented in docs/roadmap-2026-08.md §5.2): when a custom
 * domain exists, add an email magic-link provider alongside this one —
 * Auth.js supports multiple providers on the same user pool keyed by email.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 }, // 90 days — it's her own phone
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        (session as unknown as { userId?: string }).userId = token.userId as string;
      }
      return session;
    },
  },
});
