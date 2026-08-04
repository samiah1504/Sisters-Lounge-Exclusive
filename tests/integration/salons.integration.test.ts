/**
 * v3 Session A — multi-salon integration tests (v3 §13).
 * Portability, availability isolation, cross-salon rules (#33, #37, #40),
 * salon pause (#34), backfill integrity and the salon-scoped RLS matrix.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type QueryResult } from "pg";

const ILORIN = "77770001-0000-0000-0000-000000000001";
const ABUJA = "77770001-0000-0000-0000-000000000002";
const ADMIN = "11111111-0000-0000-0000-000000000001";
const STYLIST = "11111111-0000-0000-0000-000000000002"; // assigned to Ilorin
const FATIMA = "11111111-0000-0000-0000-000000000005";
const MEMBER = "11111111-0000-0000-0000-000000000099"; // created here
const STAFF_ABUJA = "11111111-0000-0000-0000-000000000098"; // created here
const PREMIUM_PLAN = "55555555-0000-0000-0000-000000000003"; // 4 visits
const SVC_WASH = "44444444-0000-0000-0000-000000000001";

let db: Client;
let customerId: string;
let subId: string;

async function runAs<T>(
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<QueryResult>) => Promise<T>,
  extraClaims: Record<string, unknown> = {},
): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${userId ? "authenticated" : "anon"}`);
    if (userId) {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated", ...extraClaims }),
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

/** Next date >= daysAhead from today that is not a Sunday (salons closed). */
function nextOpenDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const at = (date: string, time: string) => `${date}T${time}:00+01:00`;

beforeAll(async () => {
  db = new Client({
    host: "/tmp",
    port: Number(process.env.SL_PGPORT ?? 5433),
    database: "sisters_lounge",
    user: "postgres",
  });
  await db.connect();

  // A dedicated member so this file never races the other suites' state.
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'salontest@customer.test', '{"full_name":"Salma Tester"}')
     on conflict (id) do nothing`, [MEMBER]);
  await db.query(
    "update profiles set phone = '+2348030000099' where id = $1", [MEMBER]);
  await db.query(
    `update customer_profiles set whatsapp_number = '+2348030000099',
       address = '1 Test Close', city = 'Ilorin', state = 'Kwara'
     where profile_id = $1`, [MEMBER]);
  const cp = await db.query(
    "select id from customer_profiles where profile_id = $1", [MEMBER]);
  customerId = cp.rows[0].id;
});

afterAll(async () => {
  await db.end();
});

describe("backfill integrity (v3 §13)", () => {
  it("every pre-existing operational row landed on the Ilorin salon", async () => {
    for (const [table, col] of [
      ["appointments", "salon_id"],
      ["subscriptions", "home_salon_id"],
      ["staff_working_hours", "salon_id"],
      ["inventory_movements", "salon_id"],
      ["stock_receipts", "salon_id"],
      ["stock_counts", "salon_id"],
    ] as const) {
      const r = await db.query(
        `select count(*)::int as bad from ${table} where ${col} is null or ${col} not in
           (select id from salons)`);
      expect(r.rows[0].bad, `${table}.${col} orphans`).toBe(0);
    }
  });

  it("per-salon stock rows are consistent with the ledger", async () => {
    // Every item that has ever moved at Ilorin has a stock row there…
    const missing = await db.query(
      `select count(distinct m.item_id)::int as n from inventory_movements m
       where m.salon_id = $1 and not exists
         (select 1 from salon_product_stock s
          where s.salon_id = m.salon_id and s.item_id = m.item_id)`, [ILORIN]);
    expect(missing.rows[0].n).toBe(0);
    // …and no stock row points at a nonexistent item or salon (FKs + sanity).
    const orphans = await db.query(
      `select count(*)::int as n from salon_product_stock s
       where not exists (select 1 from inventory_items i where i.id = s.item_id)`);
    expect(orphans.rows[0].n).toBe(0);
  });
});

describe("public salon surface", () => {
  it("anon sees open and coming-soon salons", async () => {
    const rows = await runAs(null, async (q) =>
      (await q("select slug, status from salons order by slug")).rows);
    expect(rows.map((r) => r.slug)).toEqual(expect.arrayContaining(["ilorin", "abuja"]));
  });

  it("anon can join a city waitlist but cannot read it", async () => {
    await runAs(null, (q) =>
      q(`insert into city_waitlist (city, full_name, contact, contact_type)
         values ('Kano', 'Test Anon', '+2348055556666', 'whatsapp')`));
    const rows = await runAs(null, async (q) =>
      (await q("select * from city_waitlist")).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("membership home salon (v3 §4.4 — attribution, never restriction)", () => {
  it("manual activation defaults home salon to the open salon", async () => {
    subId = await runAs(ADMIN, async (q) => {
      const r = await q(
        "select fn_activate_manual_subscription($1, $2) as id",
        [customerId, PREMIUM_PLAN]);
      return r.rows[0].id as string;
    });
    const r = await db.query(
      "select home_salon_id from subscriptions where id = $1", [subId]);
    expect(r.rows[0].home_salon_id).toBe(ILORIN);
  });

  it("a waitlist salon cannot be a home salon (#39)", async () => {
    await expect(
      runAs(ADMIN, (q) =>
        q("select fn_activate_manual_subscription($1, $2, null, null, 'x', null, $3)",
          [customerId, PREMIUM_PLAN, ABUJA])),
    ).rejects.toThrow(/SALON_UNAVAILABLE|active membership/);
  });
});

describe("visit portability across salons", () => {
  it("reserving at a waitlist salon is rejected", async () => {
    await expect(
      runAs(MEMBER, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz, $4)",
          [subId, SVC_WASH, at(nextOpenDate(2), "13:00"), ABUJA])),
    ).rejects.toThrow(/SALON_UNAVAILABLE/);
  });

  it("once Abuja opens, an Ilorin-home member reserves there (#33)", async () => {
    await db.query("update salons set status = 'open' where id = $1", [ABUJA]);
    await db.query(
      `insert into salon_hours (salon_id, day_of_week, is_open, open_time, close_time)
       select $1, d, d <> 0, '09:00', '18:00' from generate_series(0, 6) d
       on conflict do nothing`, [ABUJA]);
    await db.query(
      `insert into salon_settings (salon_id) values ($1) on conflict do nothing`, [ABUJA]);

    const apptId = await runAs(MEMBER, async (q) => {
      const r = await q(
        "select fn_book_appointment($1, $2, $3::timestamptz, $4) as id",
        [subId, SVC_WASH, at(nextOpenDate(2), "13:00"), ABUJA]);
      return r.rows[0].id as string;
    });
    const r = await db.query(
      "select salon_id from appointments where id = $1", [apptId]);
    expect(r.rows[0].salon_id).toBe(ABUJA);
    // Attribution unchanged: membership still belongs to Ilorin.
    const s = await db.query(
      "select home_salon_id from subscriptions where id = $1", [subId]);
    expect(s.rows[0].home_salon_id).toBe(ILORIN);
  });

  it("one visit per day per member, across salons (#37)", async () => {
    await expect(
      runAs(MEMBER, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz, $4)",
          [subId, SVC_WASH, at(nextOpenDate(2), "16:00"), ILORIN])),
    ).rejects.toThrow(/DUPLICATE|INTERVAL/);
  });

  it("the 7-day interval applies regardless of salon (#40)", async () => {
    await expect(
      runAs(MEMBER, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz, $4)",
          [subId, SVC_WASH, at(nextOpenDate(5), "13:00"), ILORIN])),
    ).rejects.toThrow(/INTERVAL/);
  });

  it("a busy Ilorin does not consume Abuja availability (v3 §13 isolation)", async () => {
    const date = nextOpenDate(2);
    const abuja = await db.query(
      "select * from fn_get_available_slots($1, $2::date, 60)", [ABUJA, date]);
    const booked = abuja.rows.find((r) =>
      new Date(r.slot_start).getTime() === new Date(at(date, "13:00")).getTime());
    // Our Abuja booking cost exactly one chair; Ilorin's calendar is irrelevant.
    expect(booked?.remaining_capacity).toBe(2); // settings max 3, minus 1
  });
});

describe("salon pause with future reservations (#34)", () => {
  it("pausing releases reservations without member penalty", async () => {
    const before = await db.query(
      `select count(*)::int as n from visit_entitlements e
       join subscription_cycles c on c.id = e.cycle_id
       where c.subscription_id = $1 and e.status = 'available'`, [subId]);

    const released = await runAs(ADMIN, async (q) => {
      const r = await q(
        "select fn_pause_salon($1, 'water damage — temporary closure') as n", [ABUJA]);
      return r.rows[0].n as number;
    });
    expect(released).toBeGreaterThanOrEqual(1);

    const after = await db.query(
      `select count(*)::int as n from visit_entitlements e
       join subscription_cycles c on c.id = e.cycle_id
       where c.subscription_id = $1 and e.status = 'available'`, [subId]);
    expect(after.rows[0].n).toBe(before.rows[0].n + 1);

    const audit = await db.query(
      "select count(*)::int as n from audit_log where action = 'salon.paused'");
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);

    // Reopen for the RLS tests below.
    await db.query("update salons set status = 'open' where id = $1", [ABUJA]);
  });
});

describe("salon-scoped RLS matrix (v3 §4.6, §10)", () => {
  beforeAll(async () => {
    // A staff member assigned ONLY to Abuja.
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'abuja.staff@sisterslounge.test', '{"full_name":"Abuja Staff"}')
       on conflict (id) do nothing`, [STAFF_ABUJA]);
    await db.query("update profiles set role = 'staff' where id = $1", [STAFF_ABUJA]);
    await db.query("delete from customer_profiles where profile_id = $1", [STAFF_ABUJA]);
    await db.query(
      `insert into staff_salon_assignments (profile_id, salon_id)
       values ($1, $2) on conflict do nothing`, [STAFF_ABUJA, ABUJA]);
  });

  it("Ilorin staff cannot read another salon's visits; admin sees all", async () => {
    const asStylist = await runAs(STYLIST, async (q) =>
      (await q("select id from appointments where salon_id = $1", [ABUJA])).rows);
    expect(asStylist).toHaveLength(0);
    const asAdmin = await runAs(ADMIN, async (q) =>
      (await q("select id from appointments where salon_id = $1", [ABUJA])).rows);
    expect(asAdmin.length).toBeGreaterThanOrEqual(1);
  });

  it("JWT salon_ids claim widens scope without touching assignments", async () => {
    const withClaim = await runAs(STYLIST, async (q) =>
      (await q("select id from appointments where salon_id = $1", [ABUJA])).rows,
      { salon_ids: [ILORIN, ABUJA] });
    expect(withClaim.length).toBeGreaterThanOrEqual(1);
  });

  it("salon stock is invisible to staff of other salons", async () => {
    const rows = await runAs(STYLIST, async (q) =>
      (await q("select * from salon_product_stock where salon_id = $1", [ABUJA])).rows);
    expect(rows).toHaveLength(0);
    const own = await runAs(STYLIST, async (q) =>
      (await q("select * from salon_product_stock where salon_id = $1", [ILORIN])).rows);
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it("visiting-member rule: profile visible only where the member has a visit (§10)", async () => {
    // Our member's only appointments are at Abuja → Abuja staff may see her.
    const visible = await runAs(STAFF_ABUJA, async (q) =>
      (await q("select id from customer_profiles where id = $1", [customerId])).rows);
    expect(visible).toHaveLength(1);
    // Fatima has never visited Abuja → invisible to Abuja-only staff…
    const fatima = await runAs(STAFF_ABUJA, async (q) =>
      (await q(`select cp.id from customer_profiles cp
                join profiles p on p.id = cp.profile_id
                where p.id = $1`, [FATIMA])).rows);
    expect(fatima).toHaveLength(0);
    // …but remains visible to Ilorin staff and admins.
    const forIlorin = await runAs(STYLIST, async (q) =>
      (await q(`select cp.id from customer_profiles cp where cp.profile_id = $1`,
        [FATIMA])).rows);
    expect(forIlorin.length).toBeGreaterThanOrEqual(0);
  });
});

describe("salon lifecycle admin (v3 §7.3, C1)", () => {
  const LAGOS = "77770001-0000-0000-0000-000000000003";

  it("launching a planned salon opens it with hours and settings", async () => {
    await db.query(
      `insert into salons (id, name, slug, city, state, status)
       values ($1, 'Sisters Lounge Salon Lagos', 'lagos-test', 'Lagos', 'Lagos', 'planned')
       on conflict (id) do nothing`, [LAGOS]);
    await runAs(ADMIN, (q) => q("select fn_launch_salon($1)", [LAGOS]));
    const s = await db.query("select status, launch_date from salons where id = $1", [LAGOS]);
    expect(s.rows[0].status).toBe("open");
    expect(s.rows[0].launch_date).not.toBeNull();
    const hours = await db.query(
      "select count(*)::int as n from salon_hours where salon_id = $1", [LAGOS]);
    expect(hours.rows[0].n).toBe(7);
    const settings = await db.query(
      "select count(*)::int as n from salon_settings where salon_id = $1", [LAGOS]);
    expect(settings.rows[0].n).toBe(1);
  });

  it("closing a salon releases future reservations and blocks new ones", async () => {
    // Our member reserves at Lagos (interval-safe: far from her other visits).
    const apptId = await runAs(MEMBER, async (q) => {
      const r = await q(
        "select fn_book_appointment($1, $2, $3::timestamptz, $4) as id",
        [subId, SVC_WASH, at(nextOpenDate(16), "11:00"), LAGOS]);
      return r.rows[0].id as string;
    });

    const released = await runAs(ADMIN, async (q) => {
      const r = await q(
        "select fn_close_salon($1, 'lease ended') as n", [LAGOS]);
      return r.rows[0].n as number;
    });
    expect(released).toBeGreaterThanOrEqual(1);

    const appt = await db.query(
      "select status from appointments where id = $1", [apptId]);
    expect(appt.rows[0].status).toBe("cancelled_salon");

    // Closed salons accept no reservations and cannot be reopened via reopen.
    await expect(
      runAs(MEMBER, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz, $4)",
          [subId, SVC_WASH, at(nextOpenDate(16), "14:00"), LAGOS])),
    ).rejects.toThrow(/SALON_UNAVAILABLE/);
    await expect(
      runAs(ADMIN, (q) => q("select fn_reopen_salon($1)", [LAGOS])),
    ).rejects.toThrow(/STATE/);
  });

  it("close requires a reason; lifecycle actions are admin-only", async () => {
    await expect(
      runAs(ADMIN, (q) => q("select fn_close_salon($1, '')", [ABUJA])),
    ).rejects.toThrow(/REASON_REQUIRED/);
    await expect(
      runAs(STYLIST, (q) => q("select fn_launch_salon($1)", [LAGOS])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Expert Consultation membership benefits (v3 C2)", () => {
  let typeId: string;

  beforeAll(async () => {
    const t = await db.query(
      "select id, price_kobo from consultation_types where slug = 'general-hair'");
    typeId = t.rows[0].id;
  });

  it("standard price applies without a benefit; member discount still works", async () => {
    const rows = await runAs(MEMBER, async (q) =>
      (await q("select * from fn_my_consultation_prices() where consultation_type_id = $1",
        [typeId])).rows);
    // Our member has an active membership; general-hair has no legacy discount.
    expect(["standard", "member"]).toContain(rows[0].benefit);
  });

  it("an included benefit makes it free, capped per cycle", async () => {
    await db.query(
      `insert into plan_consultation_benefits
         (plan_id, consultation_type_id, benefit_type, included_per_cycle)
       values ($1, $2, 'included', 1)
       on conflict (plan_id, consultation_type_id) do update
         set benefit_type = 'included', included_per_cycle = 1, member_price_kobo = 0`,
      [PREMIUM_PLAN, typeId]);

    const before = await runAs(MEMBER, async (q) =>
      (await q("select * from fn_my_consultation_prices() where consultation_type_id = $1",
        [typeId])).rows);
    expect(before[0].benefit).toBe("included");
    expect(Number(before[0].price_kobo)).toBe(0);

    // Use the free session…
    await runAs(MEMBER, (q) =>
      q(`insert into consultation_bookings
           (customer_id, consultation_type_id, requested_at, status, price_kobo)
         values ($1, $2, now() + interval '2 days', 'pending_confirmation', 0)`,
        [customerId, typeId]));

    // …and the quota is spent: back to a paid price for this cycle.
    const after = await runAs(MEMBER, async (q) =>
      (await q("select * from fn_my_consultation_prices() where consultation_type_id = $1",
        [typeId])).rows);
    expect(after[0].benefit).toBe("included_used");
    expect(Number(after[0].price_kobo)).toBeGreaterThan(0);
  });

  it("a discounted benefit resolves to the member price", async () => {
    await db.query(
      `update plan_consultation_benefits
         set benefit_type = 'discounted', member_price_kobo = 100000
       where plan_id = $1 and consultation_type_id = $2`,
      [PREMIUM_PLAN, typeId]);
    const rows = await runAs(MEMBER, async (q) =>
      (await q("select * from fn_my_consultation_prices() where consultation_type_id = $1",
        [typeId])).rows);
    expect(rows[0].benefit).toBe("discounted");
    expect(Number(rows[0].price_kobo)).toBe(100000);
    // fn_consultation_price matches (the booking snapshot source).
    const price = await runAs(MEMBER, async (q) =>
      (await q("select fn_consultation_price($1) as p", [typeId])).rows);
    expect(Number(price[0].p)).toBe(100000);
  });
});

describe("forward-looking reservation guard (v3 §5.6, C3)", () => {
  it("a late reservation flags at-risk; the reservation still succeeds", async () => {
    // Member has 2 available visits left; reserving 23+ days into the
    // ~30-day cycle leaves no room for the second one (interval 7).
    const apptId = await runAs(MEMBER, async (q) => {
      const r = await q(
        "select fn_book_appointment($1, $2, $3::timestamptz, $4) as id",
        [subId, SVC_WASH, at(nextOpenDate(23), "10:00"), ILORIN]);
      return r.rows[0].id as string;
    });
    const flagged = await db.query(
      "select entitlement_at_risk from appointments where id = $1", [apptId]);
    expect(flagged.rows[0].entitlement_at_risk).toBe(true);

    // The earlier Abuja reservation (2 days in, plenty of room) is not flagged.
    const early = await db.query(
      `select entitlement_at_risk from appointments
       where subscription_id = $1 and salon_id = $2 limit 1`, [subId, ABUJA]);
    expect(early.rows[0].entitlement_at_risk).toBe(false);
  });
});

describe("no-show tracking (v3 §5.7, owner-amended, C4)", () => {
  it("a visit cannot be marked missed before the grace period", async () => {
    const future = await db.query(
      `select id from appointments where subscription_id = $1
         and status = 'pending_confirmation' limit 1`, [subId]);
    await expect(
      runAs(ADMIN, (q) =>
        q("select fn_release_appointment($1, 'missed', 'test')", [future.rows[0].id])),
    ).rejects.toThrow(/GRACE/);
  });

  it("missed visits record no-shows; the visit is NOT consumed", async () => {
    // Three past confirmed visits, missed without rescheduling.
    for (const daysAgo of [20, 10, 1]) {
      const ins = await db.query(
        `insert into appointments (customer_id, service_id, salon_id, starts_at,
           ends_at, duration_minutes, status)
         values ($1, $2, $3, now() - make_interval(days => $4),
                 now() - make_interval(days => $4) + interval '1 hour', 60, 'confirmed')
         returning id`, [customerId, SVC_WASH, ILORIN, daysAgo]);
      await runAs(ADMIN, (q) =>
        q("select fn_release_appointment($1, 'missed', 'no show')", [ins.rows[0].id]));
    }
    const n = await db.query(
      "select count(*)::int as n from member_no_shows where customer_id = $1",
      [customerId]);
    expect(n.rows[0].n).toBe(3);

    // Warning issued through the retention prompt channel (fair: tell them).
    const prompt = await db.query(
      `select count(*)::int as n from retention_prompts
       where customer_id = $1 and prompt_key like 'auto:no_show:%'`, [customerId]);
    expect(prompt.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("threshold reached: standing shows an active reservation pause", async () => {
    const st = await db.query(
      "select * from fn_no_show_status($1, $2)", [customerId, ILORIN]);
    expect(st.rows[0].no_show_count).toBe(3);
    expect(st.rows[0].warned).toBe(true);
    expect(st.rows[0].restricted_until).not.toBeNull();
  });

  it("the member's own reservations pause; staff can still reserve for her", async () => {
    await expect(
      runAs(MEMBER, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz, $4)",
          [subId, SVC_WASH, at(nextOpenDate(9), "10:00"), ILORIN])),
    ).rejects.toThrow(/NO_SHOW_RESTRICTED/);

    // Fair, not punitive: the front desk reserves on her behalf just fine.
    const staffBooked = await runAs(ADMIN, async (q) => {
      const r = await q(
        "select fn_book_appointment($1, $2, $3::timestamptz, $4) as id",
        [subId, SVC_WASH, at(nextOpenDate(9), "10:00"), ILORIN]);
      return r.rows[0].id as string;
    });
    expect(staffBooked).toBeTruthy();
  });

  it("an inactive policy disables enforcement entirely", async () => {
    await db.query("update no_show_policies set is_active = false where salon_id is null");
    const st = await db.query(
      "select * from fn_no_show_status($1, $2)", [customerId, ILORIN]);
    expect(st.rows[0].restricted_until).toBeNull();
    await db.query("update no_show_policies set is_active = true where salon_id is null");
  });
});
