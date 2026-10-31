import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/icons";
import { Notice } from "@/components/ui";
import { currentUser } from "@/lib/auth";

import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = { title: "Anmelden" };

const ERRORS: Record<string, string> = {
  AccessDenied: "Dieses Google-Konto ist für die App nicht freigegeben.",
  OAuthCallback: "Die Anmeldung bei Google wurde nicht abgeschlossen. Bitte versuche es noch einmal.",
  Configuration: "Die Anmeldung ist gerade nicht möglich. Bitte versuche es später noch einmal.",
};

export default async function SignInPage(props: PageProps<"/signin">) {
  if (await currentUser()) redirect("/");
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.") : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Kassenbon</h1>
          <p className="mt-2 text-base text-muted">Fotografiere deine Kassenbons und sieh, wofür du dein Geld ausgibst.</p>
        </div>
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          {message && <Notice tone="danger" title="Anmeldung nicht möglich">{message}</Notice>}
          <SignInButton />
          <p className="text-center text-sm text-muted">Nur freigegebene Google-Konten können sich anmelden.</p>
        </div>
      </div>
    </main>
  );
}
