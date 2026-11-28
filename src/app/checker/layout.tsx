import type { Metadata } from "next";

import { CheckerProvider } from "@/features/checker/provider";
import { CheckerShell } from "@/features/checker/shell";

/*
 * The checker keeps M4's own stylesheet rather than re-deriving it with Tailwind utilities: the
 * screen is covered by a large existing browser/visual evidence set that describes this exact
 * markup. `globals.css` declares `.btn`/`.card`/`.input` inside `@layer components`, and unlayered
 * declarations always beat layered ones, so M4's unlayered rules win inside this route without any
 * specificity hack. Next splits CSS per route segment, so none of it reaches another module's page.
 */
import "@/lib/scam-checker/ui/public/styles.css";

export const metadata: Metadata = {
  title: "ScamShield — Check a suspicious message",
  description:
    "Check a suspicious message against local scam patterns and reviewed organization records. Results are guidance, not a guarantee.",
  icons: { icon: "/checker/favicon.svg" },
};

export default function CheckerLayout({ children }: { children: React.ReactNode }) {
  return (
    <CheckerProvider>
      <CheckerShell>{children}</CheckerShell>
    </CheckerProvider>
  );
}
