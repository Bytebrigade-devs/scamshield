import { notFound } from "next/navigation";
import {
  Dashboard,
  Checklist,
  Confirmation,
  Updated,
  History,
  Guide,
  Sources,
} from "@/features/safety-score/screens";
const screens = {
  checklist: Checklist,
  confirm: Confirmation,
  updated: Updated,
  history: History,
  guide: Guide,
  sources: Sources,
};
export const dynamicParams = false;
export function generateStaticParams() {
  return [
    { segments: [] },
    ...Object.keys(screens).map((key) => ({ segments: [key] })),
  ];
}
export default async function SafetyScorePage({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  const { segments = [] } = await params;
  if (segments.length === 0) return <Dashboard />;
  if (segments.length !== 1 || !Object.hasOwn(screens, segments[0])) notFound();
  const Screen = screens[segments[0] as keyof typeof screens];
  return <Screen />;
}
