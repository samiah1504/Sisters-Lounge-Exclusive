import { expect, test } from "@playwright/test";

/**
 * Public mobile flows — run without a Supabase project (pages degrade to
 * honest empty states, navigation and layout must still work).
 */

test("homepage renders mobile-first with correct positioning", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /subscription-based salon for natural\s?hair\s?care/i }),
  ).toBeVisible();
  await expect(page.getByText(/welcome to sisters lounge/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /become a member/i }).first()).toBeVisible();

  // No horizontal scrolling on mobile.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // No community-era concepts anywhere.
  await expect(page.getByText(/request to join/i)).toHaveCount(0);
  await expect(page.getByText(/sisters-only space/i)).toHaveCount(0);
});

test("browse plans on mobile", async ({ page }) => {
  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: /membership plans/i })).toBeVisible();
  await expect(page.getByText(/visits must be at least 7 days apart/i)).toBeVisible();
  await expect(page.getByText(/no rollover/i)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("compare plans page renders", async ({ page }) => {
  await page.goto("/plans/compare");
  await expect(page.getByRole("heading", { name: /compare memberships/i })).toBeVisible();
});

test("mobile menu opens and navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /toggle menu/i }).click();
  await expect(
    page.locator("#site-menu").getByRole("link", { name: "Membership Plans", exact: true }),
  ).toBeVisible();
  await page.locator("#site-menu").getByRole("link", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel(/email address/i)).toBeVisible();
});

test("customer area redirects anonymous users to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("admin area redirects anonymous users to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("salons page lists open salons and captures waitlist interest", async ({ page }) => {
  await page.goto("/salons");
  await expect(page.getByRole("heading", { name: /sisters lounge salons/i })).toBeVisible();
  await expect(page.getByText(/coming soon/i).first()).toBeVisible();
  // Waitlist form is present for any city, without an account.
  await expect(page.getByRole("heading", { name: /another city\?/i })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("public content pages render in club voice", async ({ page }) => {
  for (const [path, heading] of [
    ["/about", /about sisters lounge/i],
    ["/treatments", /treatments/i],
    ["/faq", /frequently asked questions/i],
    ["/contact", /contact us/i],
    ["/terms", /membership terms/i],
    ["/privacy", /privacy policy/i],
    ["/refund-policy", /refund policy/i],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflow`).toBe(0);
  }
});
