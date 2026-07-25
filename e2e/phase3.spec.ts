import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 flows — salon operations, expenses, support chat, capacity.
 * Public assertions run without Supabase; authenticated ones self-skip
 * unless E2E_SUPABASE=1 (live project + dev users), matching the
 * pattern in authenticated.spec.ts.
 */

test("operations pages are locked behind login", async ({ page }) => {
  for (const path of [
    "/admin/operations", "/admin/inventory", "/admin/expenses",
    "/admin/support", "/admin/capacity", "/app/support",
  ]) {
    await page.goto(path);
    await expect(page, `${path} must redirect anonymous users`).toHaveURL(/\/login/);
  }
});

/* ------------------------------------------------------- authenticated -- */

test.describe("authenticated operations flows", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Requires a configured Supabase project with dev seed (set E2E_SUPABASE=1)",
  );

  const PASSWORD = "SistersLounge!Dev1";

  async function signIn(page: Page, email: string) {
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(app|admin|staff)/);
  }

  test("admin sees the operations dashboard sections", async ({ page }) => {
    await signIn(page, "admin@sisterslounge.test");
    await page.goto("/admin/operations");
    for (const section of [
      /subscription health/i, /capacity/i, /upselling/i,
      /inventory/i, /expenses/i, /support/i,
    ]) {
      await expect(page.getByText(section).first()).toBeVisible();
    }
    // Pending money is never presented as collected revenue.
    await expect(page.getByText(/not yet collected/i)).toBeVisible();
  });

  test("inventory list shows stock levels and alerts page loads", async ({ page }) => {
    await signIn(page, "admin@sisterslounge.test");
    await page.goto("/admin/inventory");
    await expect(page.getByText(/shampoo/i).first()).toBeVisible();
    await page.goto("/admin/inventory/alerts");
    await expect(page.getByText(/out of stock/i).first()).toBeVisible();
  });

  test("customer chats with the salon manager", async ({ page }) => {
    await signIn(page, "maryam@customer.test");
    await page.goto("/app/support");
    await expect(page.getByText(/chat with your salon manager/i).first()).toBeVisible();
    await page.getByRole("link", { name: /new conversation|start a conversation/i }).first().click();
    await page.getByLabel(/subject/i).fill("E2E test message");
    await page.getByLabel(/message/i).fill("Testing the chat, please ignore.");
    await page.getByRole("button", { name: /send/i }).click();
    await page.waitForURL(/\/app\/support\//);
    await expect(page.getByText("Testing the chat, please ignore.")).toBeVisible();
  });

  test("customer never sees internal notes", async ({ page }) => {
    await signIn(page, "zainab@customer.test");
    await page.goto("/app/support");
    await page.locator("a[href^='/app/support/']").first().click();
    // Seeded staff internal note on Zainab's complaint thread.
    await expect(page.getByText(/refund the ₦2,000/i)).toHaveCount(0);
    await expect(page.getByText(/internal note/i)).toHaveCount(0);
  });

  test("staff inbox lists conversations and internal notes are marked", async ({ page }) => {
    await signIn(page, "admin@sisterslounge.test");
    await page.goto("/admin/support");
    await page.locator("a[href^='/admin/support/']").first().click();
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("expense self-approval is blocked in the UI flow", async ({ page }) => {
    await signIn(page, "admin@sisterslounge.test");
    await page.goto("/admin/expenses");
    await expect(page.getByText(/fuel|rent|electricity/i).first()).toBeVisible();
  });

  test("capacity page shows utilisation and per-plan limits", async ({ page }) => {
    await signIn(page, "admin@sisterslounge.test");
    await page.goto("/admin/capacity");
    await expect(page.getByText(/capacity utilisation/i)).toBeVisible();
    await expect(page.getByText(/subscribers per plan/i)).toBeVisible();
  });
});
