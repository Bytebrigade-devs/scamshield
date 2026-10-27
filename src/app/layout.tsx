import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

// Font loaded once, centrally (docs/THEME-AND-TYPOGRAPHY.md §3). SIL Open Font License 1.1.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = { title: "ScamShield" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen bg-background font-sans text-text"><div className="border-b border-border-subtle bg-primary-subtle px-4 py-2 text-center text-sm text-primary">Interim frontend demo · Dummy data only · No real accounts or payments</div>{children}</body>
    </html>
  );
}
