import { test, expect } from "@playwright/test";

test("list search, filters, pagination and add/edit/delete journey", async ({ page }) => {
  await page.goto("/vault");
  await expect(page.getByRole("heading",{name:"Password vault",exact:true})).toBeVisible();
  await expect(page.getByText("Showing 1–6 of 24 logins")).toBeVisible();
  await page.screenshot({path:"test-results/vault-desktop.png",fullPage:true});
  await page.getByLabel("Search vault").fill("Netflix");
  await expect(page.getByText("Showing 1–1 of 1 logins")).toBeVisible();
  await page.getByLabel("Search vault").fill("not-a-record");
  await expect(page.getByRole("heading",{name:"No matching items"})).toBeVisible();
  await page.getByRole("button",{name:"Clear search and filters"}).click();
  await page.getByRole("button",{name:"Next page"}).click();
  await expect(page.getByText("Showing 7–12 of 24 logins")).toBeVisible();
  await page.getByRole("link",{name:"Add item",exact:true}).click();
  await page.getByRole("button",{name:"Save login",exact:true}).click();
  await expect(page.getByText("Enter a title for this login.")).toBeVisible();
  await page.getByLabel("Title *",{exact:true}).fill("Test example");
  await page.getByLabel("Website",{exact:true}).fill("https://test.example.com");
  await page.getByLabel("Username / email *").fill("test@example.com");
  await page.getByLabel("Password *",{exact:true}).fill("Fictional-Testing!42");
  await page.getByRole("button",{name:"Save login",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Login saved"})).toBeVisible();
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Test example",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/login-details.png",fullPage:true});
  await page.getByRole("button",{name:"Show password",exact:true}).click();
  await expect(page.getByLabel("Password",{exact:true})).toHaveAttribute("type","text");
  await page.getByRole("button",{name:"Hide password",exact:true}).click();
  await page.getByRole("link",{name:"Edit login",exact:true}).click();
  await page.getByLabel("Title *",{exact:true}).fill("Updated example");
  await page.getByRole("button",{name:"Save changes",exact:true}).click();
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Updated example",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Delete login",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Delete login",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Password vault",exact:true})).toBeVisible();
});
test("folders, bulk move and deletion preserve records", async ({ page }) => {
  await page.goto("/vault");
  await page.getByRole("table").getByLabel("Select Google",{exact:true}).check();
  await page.getByRole("table").getByLabel("Select Netflix",{exact:true}).check();
  await page.getByRole("button",{name:"Move to folder",exact:true}).click();
  await page.getByRole("radio",{name:"Work",exact:true}).check();
  await page.getByRole("button",{name:"Move items",exact:true}).click();
  await page.getByRole("link",{name:"Folders",exact:true}).click();
  await page.getByRole("button",{name:"New folder",exact:true}).click();
  await page.screenshot({path:"test-results/folder-dialog.png",fullPage:true});
  await page.getByLabel("Folder name *").fill("Banking");
  await page.getByRole("button",{name:"Create folder",exact:true}).click();
  await page.getByRole("button",{name:"Manage Banking"}).click();
  await page.getByLabel("Folder name *").fill("Finance");
  await page.getByRole("button",{name:"Save name"}).click();
  await expect(page.getByRole("heading",{name:"Finance",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Manage Work"}).click();
  await page.getByRole("button",{name:"Delete folder",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Delete Work folder?"})).toBeVisible();
  await page.getByRole("button",{name:"Delete folder",exact:true}).click();
  await page.getByRole("link",{name:"All items",exact:true}).click();
  await expect(page.getByText("Showing 1–6 of 24 logins")).toBeVisible();
});
test("notes are masked, editable and removable", async ({ page }) => {
  await page.goto("/vault/notes");
  await expect(page.getByRole("heading",{name:"Note content hidden"})).toBeVisible();
  await page.getByRole("button",{name:"Reveal note"}).click();
  await page.screenshot({path:"test-results/secure-notes.png",fullPage:true});
  await expect(page.getByText(/Recovery instructions are stored/)).toBeVisible();
  await page.getByRole("button",{name:"Hide note"}).click();
  await page.getByRole("button",{name:"New note",exact:true}).click();
  await page.getByLabel("Title *",{exact:true}).fill("Test note");
  await page.getByLabel("Note content *").fill("Fictional reminder for tests.");
  await page.getByRole("button",{name:"Save note",exact:true}).click();
  await page.getByRole("button",{name:"Reveal note"}).click();
  await expect(page.getByText("Fictional reminder for tests.")).toBeVisible();
  await page.getByRole("button",{name:"Delete note",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Delete secure note",exact:true}).click();
  await expect(page.getByText("Fictional reminder for tests.")).toHaveCount(0);
});
test("generator transfers output to form without putting it in URL or storage", async ({ page }) => {
  await page.goto("/vault/generator");
  await page.getByRole("button",{name:"Generate password",exact:true}).click();
  await page.screenshot({path:"test-results/generator.png",fullPage:true});
  const generated = await page.locator(".generator-value strong").innerText();
  expect(generated).toHaveLength(16);
  await page.getByRole("button",{name:"Use in login",exact:true}).click();
  await expect(page.getByLabel("Password *",{exact:true})).toHaveValue(generated);
  expect(page.url()).toBe("http://127.0.0.1:3000/vault/new");
  expect(await page.evaluate(() => JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(generated);
});
test("manual lock removes revealed content and resets the demo", async ({ page }) => {
  await page.goto("/vault/login/google");
  await page.getByRole("button",{name:"Show password",exact:true}).click();
  await page.getByRole("button",{name:"Lock vault",exact:true}).filter({visible:true}).click();
  await expect(page.getByRole("heading",{name:"Your vault is locked"})).toBeVisible();
  await expect(page.getByLabel("Password",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Continue with demo data"}).click();
  await expect(page.getByRole("heading",{name:"Password vault",exact:true})).toBeVisible();
});
test("idle timeout locks the vault and cancels visible secrets", async ({ page }) => {
  await page.clock.install();
  await page.goto("/vault/login/google");
  await page.getByRole("button",{name:"Show password",exact:true}).click();
  await page.clock.fastForward(5 * 60 * 1000 + 1000);
  await expect(page.getByRole("heading",{name:"Your vault is locked"})).toBeVisible();
  await expect(page.getByLabel("Password",{exact:true})).toHaveCount(0);
});
test("copy reports success only when the browser accepts the write", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  await page.goto("/vault/login/google");
  await page.getByRole("button",{name:"Copy password",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Password copied",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.addInitScript(() => Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async () => {throw new Error("Permission denied");}}}));
  await page.reload();
  await page.getByRole("button",{name:"Copy password",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Clipboard access was denied");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("mobile views reflow without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  for (const route of ["/vault","/vault/login/google","/vault/new","/vault/health","/vault/notes","/vault/folders","/vault/generator"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/mobile-${route.replaceAll("/","-")}.png`,fullPage:true});
  }
  await page.goto("/vault");
  await page.getByRole("button",{name:"Open navigation"}).click();
  await expect(page.getByRole("navigation",{name:"Vault navigation"})).toBeVisible();
  await page.getByRole("link",{name:"Secure notes",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Secure notes",exact:true})).toBeVisible();
});
test("all supplied screen families render, including dark-token preview", async ({ page }) => {
  for (const route of ["/vault","/vault/login/google","/vault/new","/vault/login/google/edit","/vault/generator","/vault/health","/vault/notes","/vault/folders","/vault/activity","/vault/locked","/vault/states"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
  await page.goto("/vault");
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  expect(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(15, 23, 42)");
  await page.screenshot({path:"test-results/vault-dark.png",fullPage:true});
});
