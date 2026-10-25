import "server-only";

import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/** Comma-separated list of Google accounts allowed to use the app. Nobody is allowed when it is empty. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  return !!email && allowedEmails().includes(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Google proves who you are; this decides whether you may use the app.
    signIn: ({ user, profile }) => {
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified !== false;
      return verified && isAllowed(user.email);
    },
  },
};

/** Local development and automated tests only: never active in a production build. */
export function authDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DISABLED === "1";
}

/** The signed-in, allowed user's email, or null. */
export async function currentUser(): Promise<string | null> {
  if (authDisabled()) return "dev@localhost";
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return isAllowed(email) ? email! : null;
}

export async function unauthorized(): Promise<Response | null> {
  return (await currentUser()) ? null : Response.json({ error: "Please sign in." }, { status: 401 });
}
