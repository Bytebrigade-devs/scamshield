import type { Metadata } from "next";
import { SafetyProvider } from "@/features/safety-score/safety-provider";
import "./safety-score.css";
export const metadata: Metadata = {
  title: "Digital Safety Score | ScamShield",
  description:
    "Module 6 frontend: illustrative checklist flow, history and transparent source coverage. No approved production score is calculated.",
};
export default function SafetyScoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="m6-app">
      <SafetyProvider>{children}</SafetyProvider>
    </div>
  );
}
