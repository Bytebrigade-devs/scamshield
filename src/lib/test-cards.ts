import type { PaymentMethod } from "./payment-methods";

export const TEST_CARDS = {
  "4242": { name: "Lahiru", number: "4242 4242 4242 4242", method: "debit_card" },
  "4444": { name: "Sahan", number: "5555 5555 5555 4444", method: "credit_card" },
  "0002": { name: "Achintha", number: "4000 0000 0000 0002", method: "debit_card" },
} as const satisfies Record<string, { name: string; number: string; method: PaymentMethod }>;

export type TestCardId = keyof typeof TEST_CARDS;
export const TEST_CARD_IDS = ["4242", "4444", "0002"] as const satisfies readonly TestCardId[];
export const TEST_CARD_STARTING_BALANCES: Record<TestCardId, number> = {
  "4242": 20_000_000,
  "4444": 20_000_000,
  "0002": 400,
};

export function isTestCardId(value: unknown): value is TestCardId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TEST_CARDS, value);
}
