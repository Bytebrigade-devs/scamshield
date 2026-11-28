import { expect, test } from "@playwright/test";
import fixture from "./fixtures/check-limited.json";

/**
 * M4 checker — mounted React screen.
 *
 * Drives the page the way a user does (roles and accessible names), and pins the two things that
 * are easy to break silently in a port: the stylesheet actually applies on this route, and a
 * result never renders a risk band it has not measured.
 *
 * **Checks require an account (28 Nov 2026).** `POST /api/check` refuses an anonymous caller with
 * `401 sign-in-required` before the provider is reached, so this browser cannot sign in and cannot
 * obtain a real verdict. Two helpers bridge that honestly:
 *
 * - `stubSession` makes `GET /api/history` answer 200, which is the exact signal the screen uses
 *   to decide it is signed in — the same server answer a real session produces.
 * - `stubCheck` fulfils `POST /api/check` with a payload **captured from the real rules-only service**
 *   (`fixtures/check-limited.json`, generated with a fixed clock), so the screen renders the same
 *   `limited` / `rules_only` shape production renders with no provider configured.
 *
 * The route's own behaviour — 401 anonymous, 200 verified, quota, persistence — is covered under
 * `node --test` in `src/lib/scam-checker/ui/check-route.test.ts`, not here.
 */

const SCAM_MESSAGE =
  "Congratulations! You have won Rs. 1,000,000 in our lottery. Send your OTP and bank account number to claim your prize now.";

/** The screen treats a 200 from this route as "signed in" — exactly what a real session returns. */
async function stubSession(page: import("@playwright/test").Page) {
  await page.route("**/api/history", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: "full", entries: [] }) }),
  );
}

/** Fulfils the check with the real rules-only payload captured from the service. */
async function stubCheck(page: import("@playwright/test").Page) {
  await page.route("**/api/check", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }),
  );
}

/** Signed in + a stubbed verdict, for every test that needs the editor or the result screen. */
async function enterAsSignedIn(page: import("@playwright/test").Page) {
  await stubSession(page);
  await stubCheck(page);
}

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

test("an anonymous visitor gets the sign-in gate, not the editor", async ({ page }) => {
  // No stubs: `/api/history` answers 401 in the real app, which is how the screen learns there is
  // no session. `POST /api/check` would also refuse, so no text is even offered for typing.
  await page.goto("/checker");

  await expect(view(page).getByRole("heading", { name: "Sign in to check a message", exact: true })).toBeVisible();
  await expect(view(page).getByRole("region", { name: "Sign in required" })).toBeVisible();
  await expect(view(page).getByRole("link", { name: "Sign in or create an account" })).toHaveAttribute("href", "/login");
  await expect(view(page).getByLabel("Message to check", { exact: true })).toHaveCount(0);
  await expect(submitButton(page)).toHaveCount(0);
});

test("input screen renders and the submit button stays disabled until there is text", async ({ page }) => {
  await enterAsSignedIn(page);
  await page.goto("/checker");

  await expect(view(page).getByRole("heading", { name: "Check a suspicious message", exact: true })).toBeVisible();
  await expect(view(page).getByRole("heading", { name: "Before you check", exact: true })).toBeVisible();

  await expect(submitButton(page)).toBeDisabled();

  await view(page).getByLabel("Message to check", { exact: true }).fill("hello");
  await expect(submitButton(page)).toBeEnabled();
});

test("the shared app navigation reaches the checker at /checker", async ({ page }) => {
  // Regression for the 28 Nov 2026 finding: the app's nav entry for M4 was a button that told
  // users the checker was "not connected", and nothing in the app linked to /checker at all.
  await page.goto("/vault");
  const appNav = page.getByRole("navigation", { name: "Application navigation" });
  await appNav.getByRole("link", { name: "Scam checker" }).click();
  await expect(page).toHaveURL(/\/checker$/);
  await expect(view(page).getByRole("heading", { name: "Check a suspicious message", exact: true })).toBeVisible();
});

test("the character counter tracks the message and blocks an over-long one", async ({ page }) => {
  await enterAsSignedIn(page);
  await page.goto("/checker");
  const textarea = view(page).getByLabel("Message to check", { exact: true });

  await textarea.fill("abc");
  await expect(page.locator("#character-count")).toContainText("/ 2,000 characters");

  await textarea.fill("x".repeat(2001));
  await expect(page.locator("#count-hint")).toHaveText("Shorten the message to continue.");
  await expect(submitButton(page)).toBeDisabled();
});

test("submitting a scam message renders the rules-only verdict, evidence and the checked message", async ({ page }) => {
  await enterAsSignedIn(page);
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
  await enterAsSignedIn(page);
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

test("a completed check appears in account history and the read-only line is honest", async ({ page }) => {
  // Signed in, the screen reads the SERVER's history: after the first check the stub answers with
  // one retained row, which is what the real route does once it has persisted the check.
  let checked = false;
  await page.route("**/api/history", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access: "full",
        entries: checked
          ? [{ createdAt: Date.parse("2026-11-28T00:00:00.000Z"), snippet: SCAM_MESSAGE.slice(0, 60), verdictLabel: "undetermined", category: "unknown_other" }]
          : [],
      }),
    }),
  );
  await page.route("**/api/check", (route) => {
    checked = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
  });

  await page.goto("/checker");
  await view(page).getByLabel("Message to check", { exact: true }).fill(SCAM_MESSAGE);
  await submitButton(page).click();
  await expect(page.getByRole("heading", { name: "Rules-only analysis", exact: true })).toBeVisible();

  await nav(page).getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Your check history", exact: true })).toBeVisible();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Checks saved to your account", exact: true })).toBeVisible();
  // A signed-in list is the account's, so it is read-only here — no clear button is offered.
  await expect(page.getByRole("button", { name: "Clear history" })).toHaveCount(0);
});

test("the checker stylesheet applies on its own route", async ({ page }) => {
  // M4's sheet is unlayered while globals declares `.btn` inside `@layer components`, so M4 wins
  // on its own page. If that ever inverted, the button would silently shrink to the shared 44px.
  //
  // Cross-route isolation cannot be asserted from `next dev` (dev injects every stylesheet
  // globally); it is guarded against the build output by `tests/checker-css-isolation.test.ts`.
  await enterAsSignedIn(page);
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
  await enterAsSignedIn(page);
  await page.goto("/checker");
  await expect(view(page).getByRole("heading", { name: "Check a suspicious message", exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
