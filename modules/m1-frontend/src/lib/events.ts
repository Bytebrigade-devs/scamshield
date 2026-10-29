export const eventNames = [
  "landing_view",
  "cta_click",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "signup_handoff_clicked",
  "referral_link_copied",
  "referral_visit",
  "experiment_exposure",
] as const;
export type EventName = (typeof eventNames)[number];
export function emitEvent(
  name: EventName,
  context: {
    step?: number;
    variant?: "A" | "B";
    placement?: "header" | "hero" | "footer";
    referral?: boolean;
  } = {},
) {
  if (
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true" ||
    typeof window === "undefined"
  )
    return;
  try {
    const detail = {
      version: 1,
      name,
      timestamp: new Date().toISOString(),
      context: {
        ...(typeof context.step === "number" && [1, 2, 3].includes(context.step)
          ? { step: context.step }
          : {}),
        ...(context.variant === "A" || context.variant === "B"
          ? { variant: context.variant }
          : {}),
        ...(["header", "hero", "footer"].includes(context.placement || "")
          ? { placement: context.placement }
          : {}),
        ...(typeof context.referral === "boolean"
          ? { referral: context.referral }
          : {}),
      },
    };
    window.dispatchEvent(new CustomEvent("scamshield:m1:event", { detail }));
  } catch {
    /* Analytics failures must never block onboarding. */
  }
}
