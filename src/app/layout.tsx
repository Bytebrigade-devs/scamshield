import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "ScamShield — accounts, plans and vault", description: "ScamShield frontend: signup, subscription paywall and the password vault demo. Payments are simulated and no card data is stored." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
