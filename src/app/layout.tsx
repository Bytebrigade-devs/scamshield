import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Password vault | ScamShield", description: "ScamShield password vault frontend demo. Synthetic data, no persistent storage." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
