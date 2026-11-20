import { test, expect } from "@playwright/test";

test("partial onboarding exit reminder dismisses once per marketing visit", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Let’s begin" }).click();
  const leave = () =>
    page
      .locator("html")
      .dispatchEvent("pointerleave", { clientY: -1, relatedTarget: null });
  await leave();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Suspicious messages").check();
  await leave();
  await expect(
    page.getByRole("dialog", { name: "You can return to these questions." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await leave();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
