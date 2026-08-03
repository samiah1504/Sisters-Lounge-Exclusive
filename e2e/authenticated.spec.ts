import { expect, test, type Page } from "@playwright/test";

/**
 * Authenticated mobile flows. These need a live Supabase project with
 * supabase/seed.sql loaded and dev users created via
 * scripts/create-dev-users.ts. They self-skip otherwise.
 *
 * Run: E2E_SUPABASE=1 npx playwright test e2e/authenticated.spec.ts
 */
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

test("customer dashboard shows plan, visits and retention prompt", async ({ page }) => {
  await signIn(page, "fatima@customer.test");
  await expect(page.getByText(/basic/i).first()).toBeVisible();
  // Fatima has booked nothing → re-engagement prompt.
  await expect(page.getByText(/no visit reserved yet/i)).toBeVisible();
});

test("add a child", async ({ page }) => {
  await signIn(page, "maryam@customer.test");
  await page.goto("/app/children/new");
  await page.getByLabel(/full name/i).fill("Test Child E2E");
  await page.getByLabel(/date of birth/i).fill("2019-05-01");
  await page.getByRole("button", { name: /add child/i }).click();
  await page.waitForURL(/\/app\/children$/);
  await expect(page.getByText("Test Child E2E")).toBeVisible();
});

test("reserve a valid visit with add-ons, then invalid second reservation fails", async ({ page }) => {
  await signIn(page, "fatima@customer.test");
  await page.goto("/app/book");

  // Step 1: subscription preselected → continue
  await page.getByRole("button", { name: /continue/i }).click();
  // Step 2: salon (defaults to home salon; confirm it)
  await page.getByRole("button", { name: /sisters lounge salon/i }).first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  // Step 3: service
  await page.getByRole("button", { name: /wash & deep condition/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  // Step 4: date & time — pick 3 days out (skip Sunday)
  const d = new Date(Date.now() + 3 * 86_400_000);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  await page.locator("#date").fill(d.toISOString().slice(0, 10));
  await page.locator("button", { hasText: /am|pm/i }).first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  // Step 5: ENHANCE YOUR VISIT — add henna
  await expect(page.getByText(/enhance your visit/i)).toBeVisible();
  await page.getByRole("button", { name: /henna/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  // Step 6: review shows included visit + add-on price, then submit
  await expect(page.getByText(/included/i).first()).toBeVisible();
  await expect(page.getByText(/₦5,000/)).toBeVisible();
  await page.getByRole("button", { name: /reserve visit/i }).click();
  await page.waitForURL(/\/app\/appointments\//);
  await expect(page.getByText(/visit reserved/i).first()).toBeVisible();

  // Second booking a few days later must violate the 7-day rule.
  await page.goto("/app/book");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /sisters lounge salon/i }).first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /wash & deep condition/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  const tooSoon = new Date(d.getTime() + 2 * 86_400_000);
  if (tooSoon.getDay() === 0) tooSoon.setDate(tooSoon.getDate() + 1);
  await page.locator("#date").fill(tooSoon.toISOString().slice(0, 10));
  await expect(page.getByText(/at least 7 days apart/i)).toBeVisible();
});

test("customer cannot access admin routes", async ({ page }) => {
  await signIn(page, "maryam@customer.test");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app/);
  await page.goto("/admin/plans");
  await expect(page).toHaveURL(/\/app/);
});

test("admin creates a plan", async ({ page }) => {
  await signIn(page, "admin@sisterslounge.test");
  await page.goto("/admin/plans/new");
  await page.getByLabel(/plan name/i).fill("E2E Test Plan");
  await page.getByLabel(/plan code/i).fill("SL-E2E-1");
  await page.getByLabel(/monthly price/i).fill("20000");
  await page.getByLabel(/visits included/i).fill("2");
  await page.getByRole("button", { name: /create plan/i }).click();
  await page.waitForURL(/\/admin\/plans$/);
  await expect(page.getByText("E2E Test Plan")).toBeVisible();
});

test("admin manages an extra service", async ({ page }) => {
  await signIn(page, "admin@sisterslounge.test");
  await page.goto("/admin/extra-services/new");
  await page.getByLabel(/^name$/i).fill("E2E Add-on");
  await page.getByLabel(/price/i).fill("2500");
  await page.getByRole("button", { name: /create add-on/i }).click();
  await page.waitForURL(/\/admin\/extra-services$/);
  await expect(page.getByText("E2E Add-on")).toBeVisible();
});

test("admin assigns a stylist to a pending booking", async ({ page }) => {
  await signIn(page, "admin@sisterslounge.test");
  await page.goto("/admin/bookings?filter=pending");
  const first = page.locator("a[href^='/admin/bookings/']").first();
  await first.click();
  await page.getByRole("combobox").last().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^assign$/i }).click();
  await expect(page.getByText(/stylist assigned/i)).toBeVisible();
});

test("reschedule an appointment", async ({ page }) => {
  await signIn(page, "maryam@customer.test");
  await page.goto("/app/appointments");
  await page.locator("a[href^='/app/appointments/']").first().click();
  const reschedule = page.getByRole("link", { name: /reschedule/i });
  test.skip(!(await reschedule.isVisible()), "no reschedulable appointment in seed state");
  await reschedule.click();
  const d = new Date(Date.now() + 12 * 86_400_000);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  await page.locator("#new-date").fill(d.toISOString().slice(0, 10));
  await page.locator("button", { hasText: /am|pm/i }).first().click();
  await page.getByRole("button", { name: /confirm new time/i }).click();
  await expect(page.getByText(/rescheduled/i).first()).toBeVisible();
});
