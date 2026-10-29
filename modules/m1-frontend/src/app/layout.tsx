import type { Metadata } from "next";
import { JourneyProvider } from "@/components/journey-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "ScamShield | A clearer starting point",
  description:
    "Pause. Check. Feel more confident. Discover explained scam checking and better password habits with a short, private introduction.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <JourneyProvider>{children}</JourneyProvider>
      </body>
    </html>
  );
}
