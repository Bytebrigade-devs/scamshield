/** Method selection for the mock gateway only; never collect card credentials. */
export const PAYMENT_METHODS = {
  debit_card: { label: "Debit card", description: "Pay using a debit card" },
  credit_card: { label: "Credit card", description: "Pay using a credit card" },
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "debit_card" || value === "credit_card";
}
