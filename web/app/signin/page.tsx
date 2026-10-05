import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/icons";
import { Notice } from "@/components/ui";
import { currentUser } from "@/lib/auth";

import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  AccessDenied: "This Google account is not allowed to use the app. Add it to ALLOWED_EMAILS to give it access.",
  OAuthCallback: "Google sign-in did not complete. Please try again.",
  Configuration: "Sign-in is not configured correctly on the server.",
};

export default async function SignInPage(props: PageProps<"/signin">) {
  if (await currentUser()) redirect("/");
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Kassenbon</h1>
          <p className="mt-2 text-sm text-muted">Snap your supermarket receipts. Gemini reads them, Google Sheets keeps them.</p>
        </div>
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          {message && <Notice tone="danger" title="Couldn't sign you in">{message}</Notice>}
          <SignInButton />
          <p className="text-center text-xs text-muted">Only approved Google accounts can sign in.</p>
        </div>
      </div>
    </main>
  );
}
