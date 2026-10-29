export const PROGRESS_KEY = "scamshield.m1.progress.v1";
export const HANDOFF_KEY = "scamshield.m1.handoff.v1";
export const REFERRAL_KEY = "scamshield.m1.referral.v1";
export const EXPERIMENT_KEY = "scamshield.m1.cta.v1";
export const TTL = 7 * 24 * 60 * 60 * 1000;
export const questions = [
  {
    id: "interest",
    title: "What would you like help with most?",
    hint: "Choose the concern that feels most relevant today.",
    options: [
      {
        value: "messages",
        label: "Suspicious messages",
        detail: "Make sense of unexpected links and requests.",
        icon: "message",
      },
      {
        value: "passwords",
        label: "Password habits",
        detail: "Build a clearer way to manage your passwords.",
        icon: "lock",
      },
      {
        value: "both",
        label: "Both",
        detail: "A little more clarity across my digital life.",
        icon: "shield",
      },
    ],
  },
  {
    id: "tool",
    title: "Where would you like to start?",
    hint: "We will introduce this tool first.",
    options: [
      {
        value: "checker",
        label: "AI scam checker",
        detail: "Understand red flags before you act.",
        icon: "message",
      },
      {
        value: "vault",
        label: "Password vault",
        detail: "Explore organisation and password health.",
        icon: "lock",
      },
      {
        value: "unsure",
        label: "I’m not sure yet",
        detail: "Help me find a useful starting point.",
        icon: "spark",
      },
    ],
  },
  {
    id: "experience",
    title: "How familiar are you with digital safety tools?",
    hint: "There’s no right answer. Choose what feels comfortable.",
    options: [
      {
        value: "new",
        label: "I’m new to these tools",
        detail: "Start with simple, step-by-step explanations.",
        icon: "leaf",
      },
      {
        value: "some",
        label: "I have some experience",
        detail: "A useful refresher would help.",
        icon: "spark",
      },
      {
        value: "comfortable",
        label: "I’m comfortable using them",
        detail: "Introduce the features and let me explore.",
        icon: "shield",
      },
    ],
  },
] as const;
export type AnswerKey = (typeof questions)[number]["id"];
export type Answers = Partial<Record<AnswerKey, string>>;
export interface Progress {
  version: 1;
  step: number;
  answers: Answers;
  completed: boolean;
  updatedAt: number;
  expiresAt: number;
}
export function newProgress(now = Date.now()): Progress {
  return {
    version: 1,
    step: 0,
    answers: {},
    completed: false,
    updatedAt: now,
    expiresAt: now + TTL,
  };
}
export function isComplete(a: Answers): boolean {
  return questions.every((q) => q.options.some((o) => o.value === a[q.id]));
}
export function decodeProgress(
  raw: string | null,
  now = Date.now(),
): { kind: "empty" | "invalid" | "expired" | "valid"; progress?: Progress } {
  if (raw === null) return { kind: "empty" };
  try {
    const p = JSON.parse(raw);
    if (
      !p ||
      p.version !== 1 ||
      !Number.isInteger(p.step) ||
      p.step < 0 ||
      p.step > 2 ||
      typeof p.completed !== "boolean" ||
      !p.answers ||
      typeof p.answers !== "object" ||
      Array.isArray(p.answers) ||
      !Number.isFinite(p.expiresAt) ||
      !Number.isFinite(p.updatedAt) ||
      p.updatedAt > now + 60000 ||
      p.expiresAt <= p.updatedAt ||
      p.expiresAt - p.updatedAt > TTL
    )
      return { kind: "invalid" };
    for (const key of Object.keys(p.answers)) {
      const q = questions.find((q) => q.id === key);
      if (!q || !q.options.some((o) => o.value === p.answers[key]))
        return { kind: "invalid" };
    }
    if (
      questions.slice(0, p.step).some((q) => !p.answers[q.id]) ||
      (p.completed && !isComplete(p.answers))
    )
      return { kind: "invalid" };
    if (p.expiresAt <= now) return { kind: "expired" };
    return { kind: "valid", progress: p };
  } catch {
    return { kind: "invalid" };
  }
}
export function safeReferral(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{3,32}$/.test(v) ? v : null;
}
export function preferredTool(a: Answers): "checker" | "vault" {
  return a.tool === "vault" ||
    (a.tool === "unsure" && a.interest === "passwords")
    ? "vault"
    : "checker";
}
export function makeHandoff(
  p: Progress,
  referral: string | null,
  now = Date.now(),
) {
  if (!p.completed || !isComplete(p.answers))
    throw new Error("Complete onboarding first.");
  return {
    version: 1,
    source: "module-01",
    onboardingCompleted: true,
    interest: p.answers.interest,
    referral: safeReferral(referral),
    createdAt: now,
    expiresAt: now + 30 * 60 * 1000,
  };
}
export function safeSignupPath(v: string | undefined): string {
  return v && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(v) && v !== "/" ? v : "/signup/";
}
