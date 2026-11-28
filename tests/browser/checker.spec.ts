import { expect, test } from "@playwright/test";

/**
 * M4 checker — mounted React screen.
 *
 * Drives the page the way a user does (roles and accessible names), and pins the two things that
 * are easy to break silently in a port: the stylesheet actually applies on this route, and a
 * result never renders a risk band it has not measured.
 *
 * The mounted `/api/check` is built with no provider, so every admitted check is honestly
 * `limited` / `rules_only`. A test expecting an AI verdict here would be asserting a state the
 * server cannot produce.
 */

const SCAM_MESSAGE =
  "Congratulations! You have won Rs. 1,000,000 in our lottery. Send your OTP and bank account number to claim your prize now.";

/**
 * The header nav and the form submit share the accessible name "Check message" — the same markup
 * the vanilla screen used — so every query here is scoped: `#view` for the form, the nav landmark
 * for the tabs.
 */
const view = (page: import("@playwright/test").Page) => page.locator("#view");
const submitButton = (page: import("@playwright/test").Page) =>
  view(page).getByRole("button", { name: "Check message" });
const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Scam checker" });

test("input screen renders and the submit button stays disabled until there is text", async ({ page }) => {
  await page.goto("/checker");

  await expect(view(page).getByRole("heading", { name: "Check a suspicious message", exact: true })).toBeVisible();
  await expect(view(page).getByRole("heading", { name: "Before you check", exact: true })).toBeVisible();

  await expect(submitButton(page)).toBeDisabled();

  await view(page).getByLabel("Message to check", { exact: true }).fill("hello");
  await expect(submitButton(page)).toBeEnabled();
});

test("the character counter tracks the message and blocks an over-long one", async ({ page }) => {
  await page.goto("/checker");
  const textarea = view(page).getByLabel("Message to check", { exact: true });

  await textarea.fill("abc");
  await expect(page.locator("#character-count")).toContainText("/ 2,000 characters");

  await textarea.fill("x".repeat(2001));
  await expect(page.locator("#count-hint")).toHaveText("Shorten the message to continue.");
  await expect(submitButton(page)).toBeDisabled();
});

test("submitting a scam message renders the rules-only verdict, evidence and the checked message", async ({ page }) => {
  await page.goto("/checker");
  await view(page).getByLabel("Message to check", { exact: true }).fill(SCAM_MESSAGE);
  await submitButton(page).click();

  // No provider is configured, so the honest heading is the rules-only one.
  await expect(page.getByRole("heading", { name: "Rules-only analysis", exact: true })).toBeVisible();

  // The meter must not claim a band it has no AI assessment for.
  const meter = page.locator(".risk-meter");
  await expect(meter).toHaveAttribute("data-risk", "undetermined");
  await expect(meter).toContainText("Undetermined — no risk band selected.");

  // The message that was checked is shown, with at least one highlighted pattern span.
  const messageCard = page
    .locator("section.card")
    .filter({ has: page.getByRole("heading", { name: "Your message", exact: true }) });
  await expect(messageCard).toContainText(SCAM_MESSAGE);
  await expect(messageCard.locator("mark.evidence").first()).toBeVisible();

  // Local evidence is present and counted in its own card.
  await expect(page.getByRole("heading", { name: /Patterns in your message/ })).toBeVisible();

  // The verdict heading is the page's only h1.
  await expect(page.locator("h1")).toHaveCount(1);
});

test("secondary evidence is collapsed into disclosures and the export payload is ready", async ({ page }) => {
  await page.goto("/checker");
  await view(page).getByLabel("Message to check", { exact: true }).fill(SCAM_MESSAGE);
  await submitButton(page).click();
  await expect(page.getByRole("heading", { name: "Rules-only analysis", exact: true })).toBeVisible();

  await expect(page.getByText("Sender, organization and link checks", { exact: true })).toBeVisible();
  await expect(page.getByText("Export this check", { exact: true })).toBeVisible();
  await expect(page.getByText("Official support and reporting", { exact: true })).toBeVisible();

  // Ctrl+P works before the user touches anything, so the print node must already be populated.
  const printPayload = await page.locator("#print-summary").textContent();
  expect((printPayload ?? "").length).toBeGreaterThan(0);
  expect(printPayload ?? "").not.toContain("bank account number");
});

test("a completed check is listed in tab history and the list can be cleared", async ({ page }) => {
  await page.goto("/checker");
  await view(page).getByLabel("Message to check", { exact: true }).fill(SCAM_MESSAGE);
  await submitButton(page).click();
  await expect(page.getByRole("heading", { name: "Rules-only analysis", exact: true })).toBeVisible();

  await nav(page).getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Your check history", exact: true })).toBeVisible();
  await expect(page.locator(".history-item")).toHaveCount(1);

  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.locator(".history-item")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No checks yet", exact: true })).toBeVisible();
});

test("the checker stylesheet applies on its own route", async ({ page }) => {
  // M4's sheet is unlayered while globals declares `.btn` inside `@layer components`, so M4 wins
  // on its own page. If that ever inverted, the button would silently shrink to the shared 44px.
  //
  // Cross-route isolation cannot be asserted from `next dev` (dev injects every stylesheet
  // globally); it is guarded against the build output by `tests/checker-css-isolation.test.ts`.
  await page.goto("/checker");
  await view(page).getByLabel("Message to check", { exact: true }).fill("hello");
  const height = await submitButton(page).evaluate((node) => getComputedStyle(node).minHeight);
  expect(height).toBe("48px");
});

test("the history API exists and fails closed without a session", async ({ request }) => {
  // `GET /api/history` used to exist only in the retired Netlify handler. It now lives in the app,
  // and its whole point is that the subject comes from a verified session — so an anonymous caller
  // must be refused rather than handed an empty or someone else's list.
  const response = await request.get("/api/history");
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain("entries");
});

test("the checker has no horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/checker");
  await expect(view(page).getByRole("heading", { name: "Check a suspicious message", exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
