import type { Metadata } from "next";
import { JourneyProvider } from "@/features/landing/journey-provider";
import "./landing.css";

export const metadata: Metadata = {
  title: "ScamShield | A clearer starting point",
  description:
    "Discover explained scam checking and better password habits with a short, private introduction.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="m1-app">
      <JourneyProvider>{children}</JourneyProvider>
    </div>
  );
}
