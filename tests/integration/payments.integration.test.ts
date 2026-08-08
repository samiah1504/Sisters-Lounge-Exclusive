/**
 * Automatic subscription payments (payments spec §6, §7, §11, §12, §18).
 * Paid activation via the intent path, renewal cycles, failed payments,
 * webhook idempotency at the database layer, the no-capacity-gate rule and
 * RLS on the new payment tables.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type QueryResult } from "pg";

const ILORIN = "77770001-0000-0000-0000-000000000001";
const PLANNED_SALON = "77770001-0000-0000-0000-000000000097"; // created here, stays planned
const FATIMA = "11111111-0000-0000-0000-000000000005"; // seeded customer
const PAYER = "11111111-0000-0000-0000-000000000097"; // created here
const ESSENTIAL_PLAN = "55555555-0000-0000-0000-000000000001"; // 2 visits
const PREMIUM_PLAN = "55555555-0000-0000-0000-000000000003";

let db: Client;
let customerId: string;
let intentId: string;
let selectionId: string;
let subId: string;

async function runAs<T>(
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<QueryResult>) => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${userId ? "authenticated" : "anon"}`);
    if (userId) {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    const result = await fn((sql, params) => db.query(sql, params));
    await db.query("commit");
    return result;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

/** Trusted server context: definer functions run with no auth.uid(), exactly
 * like the webhook's service-role connection. */
async function runAsServer<T>(
  fn: (q: (sql: string, params?: unknown[]) => Promise<QueryResult>) => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    const result = await fn((sql, params) => db.query(sql, params));
    await db.query("commit");
    return result;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

beforeAll(async () => {
  db = new Client({
    host: "/tmp",
    port: Number(process.env.SL_PGPORT ?? 5433),
    database: "sisters_lounge",
    user: "postgres",
  });
  await db.connect();

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'payer@customer.test', '{"full_name":"Peace Payer"}')
     on conflict (id) do nothing`, [PAYER]);
  await db.query(
    "update profiles set phone = '+2348030000097' where id = $1", [PAYER]);
  await db.query(
    `update customer_profiles set whatsapp_number = '+2348030000097'
     where profile_id = $1`, [PAYER]);
  const cp = await db.query(
    "select id from customer_profiles where profile_id = $1", [PAYER]);
  customerId = cp.rows[0].id;

  // A salon that is never open — no other suite touches it, so the
  // closed-salon negative test cannot race the lifecycle suite.
  await db.query(
    `insert into salons (id, name, slug, city, state, address, status)
     values ($1, 'Sisters Lounge Salon Paytest', 'paytest', 'Lagos', 'Lagos',
             '1 Test Rd', 'planned')
     on conflict (id) do nothing`, [PLANNED_SALON]);
});

afterAll(async () => {
  await db.end();
});

describe("checkout selection with home salon (payments spec §4)", () => {
  it("fn_select_plan stores the chosen home salon and creates the intent", async () => {
    selectionId = await runAs(PAYER, async (q) => {
      const r = await q("select fn_select_plan($1, null, $2) as id",
        [ESSENTIAL_PLAN, ILORIN]);
      return r.rows[0].id as string;
    });
    const sel = await db.query(
      "select home_salon_id, status from pending_plan_selections where id = $1",
      [selectionId]);
    expect(sel.rows[0].home_salon_id).toBe(ILORIN);
    expect(sel.rows[0].status).toBe("pending_payment");

    const intent = await db.query(
      `select id, amount_kobo from pending_payment_intents
       where pending_selection_id = $1 and status = 'pending'`, [selectionId]);
    expect(intent.rows).toHaveLength(1);
    intentId = intent.rows[0].id;
    expect(Number(intent.rows[0].amount_kobo)).toBeGreaterThan(0);
  });

  it("a salon that is not open cannot be chosen as home salon", async () => {
    await expect(
      runAs(PAYER, (q) =>
        q("select fn_select_plan($1, null, $2)", [ESSENTIAL_PLAN, PLANNED_SALON])),
    ).rejects.toThrow(/SALON_UNAVAILABLE/);
  });
});

describe("paid activation (payments spec §6)", () => {
  it("members cannot invoke the activation function themselves (§18 security)", async () => {
    await expect(
      runAs(PAYER, (q) =>
        q("select fn_activate_paid_subscription($1, 'HACK_ref', 1)", [intentId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("underpayment is rejected", async () => {
    await expect(
      runAsServer((q) =>
        q("select fn_activate_paid_subscription($1, 'PAY_underpaid', 100)", [intentId])),
    ).rejects.toThrow(/PAYMENT_AMOUNT/);
  });

  it("a confirmed charge activates the membership with cycle + entitlements", async () => {
    const intent = await db.query(
      "select amount_kobo from pending_payment_intents where id = $1", [intentId]);
    subId = await runAsServer(async (q) => {
      const r = await q(
        `select fn_activate_paid_subscription($1, 'PAY_init_1', $2,
           'CUS_test', 'PLN_test',
           '{"authorization_code":"AUTH_x","brand":"visa","last4":"4081","exp_month":"12","exp_year":"2030"}'::jsonb) as id`,
        [intentId, intent.rows[0].amount_kobo]);
      return r.rows[0].id as string;
    });

    const sub = await db.query(
      `select status, activation_source, home_salon_id from subscriptions where id = $1`,
      [subId]);
    expect(sub.rows[0]).toMatchObject({
      status: "active", activation_source: "payment", home_salon_id: ILORIN,
    });

    const cycle = await db.query(
      `select id, visits_included from subscription_cycles
       where subscription_id = $1 and status = 'active'`, [subId]);
    expect(cycle.rows).toHaveLength(1);
    const ents = await db.query(
      "select count(*)::int as n from visit_entitlements where cycle_id = $1 and status = 'available'",
      [cycle.rows[0].id]);
    expect(ents.rows[0].n).toBe(cycle.rows[0].visits_included);

    const pay = await db.query(
      "select kind, status from payments where provider_reference = 'PAY_init_1'");
    expect(pay.rows[0]).toMatchObject({ kind: "initial", status: "success" });

    const ps = await db.query(
      `select status, card_last4, provider_plan_code from payment_subscriptions
       where subscription_id = $1`, [subId]);
    expect(ps.rows[0]).toMatchObject({
      status: "active", card_last4: "4081", provider_plan_code: "PLN_test",
    });

    const it2 = await db.query(
      "select status from pending_payment_intents where id = $1", [intentId]);
    expect(it2.rows[0].status).toBe("fulfilled_online");
  });

  it("replaying the same charge event is a no-op (payments spec §12)", async () => {
    const intent = await db.query(
      "select amount_kobo from pending_payment_intents where id = $1", [intentId]);
    const again = await runAsServer(async (q) => {
      const r = await q(
        "select fn_activate_paid_subscription($1, 'PAY_init_1', $2) as id",
        [intentId, intent.rows[0].amount_kobo]);
      return r.rows[0].id as string;
    });
    expect(again).toBe(subId);
    const subs = await db.query(
      "select count(*)::int as n from subscriptions where customer_id = $1 and child_id is null",
      [customerId]);
    expect(subs.rows[0].n).toBe(1); // no duplicate membership
    const pays = await db.query(
      "select count(*)::int as n from payments where provider_reference = 'PAY_init_1'");
    expect(pays.rows[0].n).toBe(1); // no duplicate payment row
  });
});

describe("renewal cycles (payments spec §7)", () => {
  it("a successful recurring charge creates the next contiguous cycle", async () => {
    const first = await db.query(
      `select cycle_number, ends_on from subscription_cycles
       where subscription_id = $1 order by cycle_number desc limit 1`, [subId]);
    const cycleId = await runAsServer(async (q) => {
      const r = await q(
        `select fn_renew_subscription_cycle($1, 'PAY_renew_1', 2500000,
           now() + interval '2 months') as id`, [subId]);
      return r.rows[0].id as string;
    });
    const next = await db.query(
      "select cycle_number, starts_on, visits_included from subscription_cycles where id = $1",
      [cycleId]);
    expect(next.rows[0].cycle_number).toBe(first.rows[0].cycle_number + 1);
    expect(String(next.rows[0].starts_on)).toBe(String(first.rows[0].ends_on));

    const ents = await db.query(
      "select count(*)::int as n from visit_entitlements where cycle_id = $1", [cycleId]);
    expect(ents.rows[0].n).toBe(next.rows[0].visits_included);

    const ps = await db.query(
      "select next_billing_at from payment_subscriptions where subscription_id = $1",
      [subId]);
    expect(ps.rows[0].next_billing_at).not.toBeNull();
  });

  it("a duplicate renewal event creates no second cycle (payments spec §12)", async () => {
    const before = await db.query(
      "select count(*)::int as n from subscription_cycles where subscription_id = $1", [subId]);
    await runAsServer((q) =>
      q("select fn_renew_subscription_cycle($1, 'PAY_renew_1', 2500000)", [subId]));
    const after = await db.query(
      "select count(*)::int as n from subscription_cycles where subscription_id = $1", [subId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const pays = await db.query(
      "select count(*)::int as n from payments where provider_reference = 'PAY_renew_1'");
    expect(pays.rows[0].n).toBe(1);
  });

  it("a queued plan change is applied at renewal", async () => {
    await db.query(
      "update subscriptions set next_plan_id = $1 where id = $2",
      [PREMIUM_PLAN, subId]);
    await runAsServer((q) =>
      q("select fn_renew_subscription_cycle($1, 'PAY_renew_2', 4500000)", [subId]));
    const sub = await db.query(
      "select plan_id, next_plan_id from subscriptions where id = $1", [subId]);
    expect(sub.rows[0].plan_id).toBe(PREMIUM_PLAN);
    expect(sub.rows[0].next_plan_id).toBeNull();
    const cycle = await db.query(
      `select visits_included from subscription_cycles
       where subscription_id = $1 order by cycle_number desc limit 1`, [subId]);
    expect(cycle.rows[0].visits_included).toBe(4); // premium allocation
  });
});

describe("failed recurring payments (payments spec §11)", () => {
  it("failure is recorded without destroying membership history", async () => {
    const cyclesBefore = await db.query(
      "select count(*)::int as n from subscription_cycles where subscription_id = $1", [subId]);
    await runAsServer((q) =>
      q(`select fn_record_payment_failure($1, 'PAY_fail_1', 4500000,
           'insufficient funds')`, [subId]));
    const sub = await db.query(
      "select status from subscriptions where id = $1", [subId]);
    expect(sub.rows[0].status).toBe("payment_failed");
    const ps = await db.query(
      "select status from payment_subscriptions where subscription_id = $1", [subId]);
    expect(ps.rows[0].status).toBe("payment_failed");
    const pay = await db.query(
      "select status, failure_reason from payments where provider_reference = 'PAY_fail_1'");
    expect(pay.rows[0]).toMatchObject({ status: "failed", failure_reason: "insufficient funds" });
    const cyclesAfter = await db.query(
      "select count(*)::int as n from subscription_cycles where subscription_id = $1", [subId]);
    expect(cyclesAfter.rows[0].n).toBe(cyclesBefore.rows[0].n); // history intact
  });

  it("a later successful charge revives the membership", async () => {
    await runAsServer((q) =>
      q("select fn_renew_subscription_cycle($1, 'PAY_renew_3', 4500000)", [subId]));
    const sub = await db.query(
      "select status from subscriptions where id = $1", [subId]);
    expect(sub.rows[0].status).toBe("active");
  });
});

describe("payment RLS (payments spec §18 security)", () => {
  it("the payer reads their own payment history; others read nothing", async () => {
    const own = await runAs(PAYER, async (q) =>
      (await q("select * from payments")).rows);
    expect(own.length).toBeGreaterThanOrEqual(3);
    const other = await runAs(FATIMA, async (q) =>
      (await q("select * from payments where customer_id = $1", [customerId])).rows);
    expect(other).toHaveLength(0);
  });

  it("members cannot write payment tables directly", async () => {
    const r = await runAs(PAYER, (q) =>
      q(`insert into payments (customer_id, provider_reference, kind, amount_kobo, status)
         values ($1, 'FORGED', 'other', 1, 'success')`, [customerId]))
      .then(() => "inserted").catch((e: Error) => e.message);
    expect(r).toMatch(/permission denied|violates row-level security/);
  });

  it("webhook event ledger is admin-only", async () => {
    await db.query(
      `insert into payment_events (event_key, event_type, payload)
       values ('charge.success:PAY_init_1', 'charge.success', '{}')
       on conflict (event_key) do nothing`);
    const rows = await runAs(PAYER, async (q) =>
      (await q("select * from payment_events")).rows);
    expect(rows).toHaveLength(0);
  });

  it("duplicate webhook deliveries violate the event key (idempotency backstop)", async () => {
    await expect(
      db.query(
        `insert into payment_events (event_key, event_type, payload)
         values ('charge.success:PAY_init_1', 'charge.success', '{}')`),
    ).rejects.toThrow(/duplicate key/);
  });
});
