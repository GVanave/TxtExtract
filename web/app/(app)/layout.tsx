import { redirect } from "next/navigation";

import { BottomTabs, TopBar } from "@/components/nav";
import { authDisabled, currentUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const email = await currentUser();
  if (!email) redirect("/signin");

  return (
    <>
      <TopBar email={email} authEnabled={!authDisabled()} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:pb-12">{children}</main>
      <BottomTabs />
    </>
  );
}
