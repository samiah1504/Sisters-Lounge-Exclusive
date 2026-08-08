import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractChargeInfo,
  extractSubscriptionInfo,
  paystackEventKey,
  verifyPaystackSignature,
} from "./paystack";

const SECRET = "sk_test_abc123";
const sign = (body: string) =>
  createHmac("sha512", SECRET).update(body).digest("hex");

describe("verifyPaystackSignature (payments spec §9)", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "r1" } });
    expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { amount: 100 } });
    const tampered = body.replace("100", "1");
    expect(verifyPaystackSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a missing signature or secret", () => {
    const body = "{}";
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body), "")).toBe(false);
  });
});

describe("paystackEventKey (payments spec §12 idempotency)", () => {
  it("keys charges by reference — same delivery, same key", () => {
    const evt = { event: "charge.success", data: { reference: "T123", amount: 1 } };
    expect(paystackEventKey(evt)).toBe("charge.success:T123");
    expect(paystackEventKey({ ...evt })).toBe("charge.success:T123");
  });

  it("keys invoice and subscription events by their codes", () => {
    expect(
      paystackEventKey({
        event: "invoice.payment_failed",
        data: { invoice_code: "INV_9" },
      }),
    ).toBe("invoice.payment_failed:INV_9");
    expect(
      paystackEventKey({
        event: "subscription.disable",
        data: { subscription_code: "SUB_7" },
      }),
    ).toBe("subscription.disable:SUB_7");
  });
});

describe("extractChargeInfo", () => {
  it("reads reference, amount, intent metadata and authorization", () => {
    const info = extractChargeInfo({
      event: "charge.success",
      data: {
        reference: "T500",
        amount: 2500000,
        metadata: { intent_id: "abc-123" },
        customer: { customer_code: "CUS_1", email: "m@example.com" },
        plan: { plan_code: "PLN_1" },
        authorization: { authorization_code: "AUTH_1", last4: "4081" },
      },
    });
    expect(info).toMatchObject({
      reference: "T500",
      amountKobo: 2500000,
      intentId: "abc-123",
      customerCode: "CUS_1",
      customerEmail: "m@example.com",
      planCode: "PLN_1",
    });
    expect(info.authorization?.last4).toBe("4081");
  });

  it("renewal charges (no intent metadata) yield a null intentId", () => {
    const info = extractChargeInfo({
      event: "charge.success",
      data: { reference: "T501", amount: 100, metadata: {} },
    });
    expect(info.intentId).toBeNull();
  });
});

describe("extractSubscriptionInfo", () => {
  it("reads subscription.create payloads (flat shape)", () => {
    const info = extractSubscriptionInfo({
      event: "subscription.create",
      data: {
        subscription_code: "SUB_1",
        email_token: "tok",
        next_payment_date: "2026-09-08T00:00:00Z",
        status: "active",
        customer: { customer_code: "CUS_1", email: "m@example.com" },
        plan: { plan_code: "PLN_1" },
      },
    });
    expect(info).toMatchObject({
      subscriptionCode: "SUB_1",
      emailToken: "tok",
      customerCode: "CUS_1",
      planCode: "PLN_1",
      nextPaymentDate: "2026-09-08T00:00:00Z",
    });
  });

  it("reads invoice payloads (nested subscription shape)", () => {
    const info = extractSubscriptionInfo({
      event: "invoice.payment_failed",
      data: {
        invoice_code: "INV_1",
        subscription: { subscription_code: "SUB_2", email_token: "t2" },
        customer: { email: "m@example.com" },
      },
    });
    expect(info.subscriptionCode).toBe("SUB_2");
    expect(info.customerEmail).toBe("m@example.com");
  });
});
