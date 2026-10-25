"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { ChartIcon, Logo, LogoutIcon, ReceiptIcon, ScanIcon } from "./icons";

const TABS = [
  { href: "/", label: "Scan", Icon: ScanIcon },
  { href: "/receipts", label: "Receipts", Icon: ReceiptIcon },
  { href: "/spending", label: "Spending", Icon: ChartIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopBar({ email, authEnabled }: { email: string; authEnabled: boolean }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo size={28} />
          <span>Kassenbon</span>
        </Link>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {TABS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-strong"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden max-w-48 truncate text-sm text-muted md:inline" title={email}>
            {email}
          </span>
          {authEnabled && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <LogoutIcon size={18} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Bottom tab bar on phones, where thumbs are. */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="grid grid-cols-3">
        {TABS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted aria-[current=page]:text-brand"
          >
            <Icon size={22} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
