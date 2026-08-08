import { describe, expect, it } from "vitest";
import { paymentFailedEmail, welcomeEmail } from "./email-templates";

const WELCOME_ARGS = {
  memberName: "Amina Yusuf",
  planName: "Sisters Lounge Essential",
  salonName: "Sisters Lounge Salon Ilorin",
  visitsIncluded: 2,
  startDate: "8 August 2026",
  siteUrl: "https://sisterslounge.example",
};

describe("welcomeEmail (payments spec §8)", () => {
  it("contains the membership summary and account CTA", () => {
    const { subject, html } = welcomeEmail(WELCOME_ARGS);
    expect(subject).toMatch(/membership is active/i);
    expect(html).toContain("Sisters Lounge Essential");
    expect(html).toContain("Sisters Lounge Salon Ilorin");
    expect(html).toContain(">2<");
    expect(html).toContain("8 August 2026");
    expect(html).toContain("https://sisterslounge.example/app");
    expect(html).toMatch(/Access Your Account/);
  });

  it("never contains a password (spec §8: no passwords by email)", () => {
    const { html } = welcomeEmail(WELCOME_ARGS);
    // The only permitted mention tells the member to use the password they
    // themselves created at checkout — no credential value is ever embedded.
    expect(html).not.toMatch(/password:\s*\S/i);
    expect(html).toMatch(/password you created at checkout/i);
  });

  it("greets by first name with a safe fallback", () => {
    expect(welcomeEmail(WELCOME_ARGS).html).toContain("Amina");
    expect(welcomeEmail({ ...WELCOME_ARGS, memberName: "  " }).html)
      .toContain("Sister");
  });
});

describe("paymentFailedEmail (payments spec §11)", () => {
  it("reassures and routes to the fix-payment page", () => {
    const { subject, html } = paymentFailedEmail({
      memberName: "Amina Yusuf",
      planName: "Sisters Lounge Essential",
      siteUrl: "https://sisterslounge.example",
    });
    expect(subject).toMatch(/could not renew/i);
    expect(html).toMatch(/No visits have been lost/);
    expect(html).toContain("https://sisterslounge.example/app/subscription");
  });
});
