import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kassenbon", template: "%s · Kassenbon" },
  description: "Scan supermarket receipts and track your spending in Google Sheets.",
  appleWebApp: { capable: true, title: "Kassenbon", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1211" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
