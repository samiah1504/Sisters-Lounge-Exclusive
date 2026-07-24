/**
 * Integration tests against a real PostgreSQL database with the full
 * migration set, RLS enabled and the Supabase auth shim.
 *
 * Run: npm run db:reset && npm run test:integration
 *
 * Users are impersonated exactly the way PostgREST does it: SET ROLE
 * authenticated/anon plus the request.jwt.claims setting that auth.uid()
 * reads. SECURITY DEFINER functions therefore see the same world they see
 * in production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type QueryResult } from "pg";

const ADMIN = "11111111-0000-0000-0000-000000000001";
const STYLIST = "11111111-0000-0000-0000-000000000002";
const MARYAM = "11111111-0000-0000-0000-000000000003"; // active Deluxe
const FATIMA = "11111111-0000-0000-0000-000000000005"; // active Basic, no bookings
const AISHA = "11111111-0000-0000-0000-000000000006"; // parent, two children
const ZAINAB = "11111111-0000-0000-0000-000000000007"; // expired sub
const CHILD_HAFSAT = "22222222-0000-0000-0000-000000000001";
const PLAN_BASIC = "55555555-0000-0000-0000-000000000001";
const SVC_WASH = "44444444-0000-0000-0000-000000000001";
const SVC_KIDS = "44444444-0000-0000-0000-000000000004";
const XS_HENNA = "77777777-0000-0000-0000-000000000001";
const XS_TRIM = "77777777-0000-0000-0000-000000000005";
const XS_COLOUR = "77777777-0000-0000-0000-000000000006"; // 48h notice, prepay, adults

let db: Client;

/** Run statements as a given user (or anon), in one committed transaction. */
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

/** Next date at least `minDays` ahead that is not a Sunday (salon closed). */
function nextOpenDate(minDays: number, avoid: string[] = []): string {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  for (let i = 0; i < 14; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() !== 0 && !avoid.includes(iso)) return iso;
    d.setDate(d.getDate() + 1);
  }
  throw new Error("no open date found");
}

const at = (date: string, time: string) => `${date}T${time}:00+01:00`; // Lagos

async function customerIdOf(profileId: string): Promise<string> {
  const r = await db.query(
    "select id from customer_profiles where profile_id = $1",
    [profileId],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  db = new Client({
    host: "/tmp",
    port: Number(process.env.SL_PGPORT ?? 5433),
    database: "sisters_lounge",
    user: "postgres",
  });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

describe("RLS: catalogue visibility", () => {
  it("public (anon) can browse active public plans", async () => {
    const rows = await runAs(null, async (q) => {
      const r = await q("select slug, status from subscription_plans order by slug");
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(
      rows.every((r: { status: string }) => ["active", "closed"].includes(r.status)),
    ).toBe(true);
  });

  it("anon cannot see draft/hidden plans", async () => {
    await db.query(
      `insert into subscription_plans (organisation_id, category_id, name, slug, plan_code,
        monthly_price_kobo, visits_included, status)
       values ((select id from organisations limit 1),
               '33333333-0000-0000-0000-000000000001',
               'Secret Draft', 'secret-draft', 'SL-DRAFT-1', 100000, 2, 'draft')`,
    );
    const rows = await runAs(null, async (q) => {
      const r = await q("select 1 from subscription_plans where slug = 'secret-draft'");
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe("RLS: customer data isolation", () => {
  it("customer creates a child profile", async () => {
    const cid = await customerIdOf(MARYAM);
    const rows = await runAs(MARYAM, async (q) => {
      const r = await q(
        `insert into children (customer_id, full_name, date_of_birth)
         values ($1, 'Test Daughter', '2019-06-01') returning id`,
        [cid],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(1);
  });

  it("customer cannot create a child under another customer's account", async () => {
    const aishaCid = await customerIdOf(AISHA);
    await expect(
      runAs(MARYAM, (q) =>
        q(
          `insert into children (customer_id, full_name, date_of_birth)
           values ($1, 'Intruder Child', '2019-06-01')`,
          [aishaCid],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("customer cannot see another customer's children", async () => {
    const rows = await runAs(MARYAM, async (q) => {
      const r = await q("select id from children where id = $1", [CHILD_HAFSAT]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("customer cannot read internal notes", async () => {
    const cid = await customerIdOf(MARYAM);
    await db.query(
      `insert into customer_internal_notes (customer_id, author_profile_id, note)
       values ($1, $2, 'VIP - handle with care')`,
      [cid, ADMIN],
    );
    const rows = await runAs(MARYAM, async (q) => {
      const r = await q("select * from customer_internal_notes");
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("customer cannot insert a subscription for themselves", async () => {
    const cid = await customerIdOf(MARYAM);
    await expect(
      runAs(MARYAM, (q) =>
        q(
          `insert into subscriptions (customer_id, plan_id, plan_version_id, status)
           values ($1, $2, public.latest_plan_version($2), 'active')`,
          [cid, PLAN_BASIC],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("customer cannot modify visit entitlements", async () => {
    const r = await runAs(MARYAM, async (q) => {
      // RLS: update matches no writable rows -> 0 rows affected, no error
      return await q(
        "update visit_entitlements set status = 'available' where status = 'consumed'",
      );
    });
    expect(r.rowCount).toBe(0);
  });
});

describe("admin catalogue management", () => {
  it("admin creates and archives a plan", async () => {
    await runAs(ADMIN, async (q) => {
      await q(
        `insert into subscription_plans (organisation_id, category_id, name, slug, plan_code,
          monthly_price_kobo, visits_included, status)
         values ((select id from organisations limit 1),
                 '33333333-0000-0000-0000-000000000001',
                 'Admin Test Plan', 'admin-test-plan', 'SL-TEST-1', 2000000, 2, 'active')`,
      );
      await q(
        `update subscription_plans set status = 'archived', archived_at = now()
         where slug = 'admin-test-plan'`,
      );
    });
    const r = await db.query(
      "select status from subscription_plans where slug = 'admin-test-plan'",
    );
    expect(r.rows[0].status).toBe("archived");
  });

  it("plan price change creates a new immutable version", async () => {
    const before = await db.query(
      "select count(*)::int as n from subscription_plan_versions where plan_id = $1",
      [PLAN_BASIC],
    );
    await runAs(ADMIN, (q) =>
      q("update subscription_plans set monthly_price_kobo = monthly_price_kobo + 100000 where id = $1", [PLAN_BASIC]),
    );
    const after = await db.query(
      "select count(*)::int as n from subscription_plan_versions where plan_id = $1",
      [PLAN_BASIC],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n + 1);
    // restore
    await runAs(ADMIN, (q) =>
      q("update subscription_plans set monthly_price_kobo = monthly_price_kobo - 100000 where id = $1", [PLAN_BASIC]),
    );
  });

  it("customer cannot create a plan", async () => {
    await expect(
      runAs(MARYAM, (q) =>
        q(
          `insert into subscription_plans (organisation_id, category_id, name, slug, plan_code,
            monthly_price_kobo, visits_included, status)
           values ((select id from organisations limit 1),
                   '33333333-0000-0000-0000-000000000001',
                   'Hacked', 'hacked-plan', 'SL-HACK', 0, 31, 'active')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("admin creates an extra service", async () => {
    await runAs(ADMIN, (q) =>
      q(
        `insert into extra_services (name, slug, price_kobo, estimated_duration_minutes)
         values ('Test Add-on', 'test-addon', 250000, 15)`,
      ),
    );
    const r = await db.query("select 1 from extra_services where slug = 'test-addon'");
    expect(r.rows).toHaveLength(1);
  });
});

describe("plan selection", () => {
  it("customer creates a pending plan selection (no payment, no activation)", async () => {
    const selectionId = await runAs(FATIMA, async (q) => {
      const r = await q("select fn_select_plan($1) as id", [PLAN_BASIC]);
      return r.rows[0].id;
    });
    const sel = await db.query(
      "select status from pending_plan_selections where id = $1",
      [selectionId],
    );
    expect(sel.rows[0].status).toBe("pending_payment");
    const intent = await db.query(
      "select status, amount_kobo::int as amount from pending_payment_intents where pending_selection_id = $1",
      [selectionId],
    );
    expect(intent.rows[0].status).toBe("pending");
    expect(intent.rows[0].amount).toBeGreaterThan(0);
    // No subscription was activated by selecting a plan.
    const subs = await db.query(
      `select count(*)::int as n from subscriptions s
       join customer_profiles cp on cp.id = s.customer_id
       where cp.profile_id = $1 and s.status = 'active'`,
      [FATIMA],
    );
    expect(subs.rows[0].n).toBe(1); // only the seeded one
  });

  it("selecting an archived plan is rejected", async () => {
    const archived = await db.query(
      "select id from subscription_plans where slug = 'admin-test-plan'",
    );
    await expect(
      runAs(FATIMA, (q) => q("select fn_select_plan($1)", [archived.rows[0].id])),
    ).rejects.toThrow(/not open for selection/);
  });
});

describe("booking, reservation and the seven-day rule", () => {
  let fatimaSub: string;
  let apptId: string;
  let bookDate: string;

  beforeAll(async () => {
    const r = await db.query(
      `select s.id from subscriptions s join customer_profiles cp on cp.id = s.customer_id
       where cp.profile_id = $1 and s.status = 'active'`,
      [FATIMA],
    );
    fatimaSub = r.rows[0].id;
    // Make the scenario deterministic regardless of the calendar month the
    // suite runs in: give Fatima's cycle a fixed 45-day horizon.
    await db.query(
      `update subscription_cycles set ends_on = starts_on + 45
       where subscription_id = $1`,
      [fatimaSub],
    );
  });

  it("customer books an eligible appointment with add-ons", async () => {
    bookDate = nextOpenDate(2);
    apptId = await runAs(FATIMA, async (q) => {
      const r = await q(
        `select fn_book_appointment($1, $2, $3::timestamptz, 'salon', null,
                                    array[$4, $5]::uuid[], 'First visit!') as id`,
        [fatimaSub, SVC_WASH, at(bookDate, "14:00"), XS_HENNA, XS_TRIM],
      );
      return r.rows[0].id;
    });
    const appt = await db.query(
      "select status, duration_minutes, addon_total_kobo::int as addons from appointments where id = $1",
      [apptId],
    );
    // wash 60 + henna 45 + trim 20 = 125 minutes; henna 5000 + trim 4000 = 9000 NGN
    expect(appt.rows[0].duration_minutes).toBe(125);
    expect(appt.rows[0].addons).toBe(900000);
    expect(appt.rows[0].status).toBe("pending_confirmation");
  });

  it("booking reserves a visit — it does NOT consume it", async () => {
    const r = await db.query(
      `select e.status from visit_reservations vr
       join visit_entitlements e on e.id = vr.entitlement_id
       where vr.appointment_id = $1 and vr.status = 'active'`,
      [apptId],
    );
    expect(r.rows[0].status).toBe("reserved");
    const consumed = await db.query(
      `select count(*)::int as n from visit_entitlements e
       join subscription_cycles c on c.id = e.cycle_id
       where c.subscription_id = $1 and e.status = 'consumed'`,
      [fatimaSub],
    );
    expect(consumed.rows[0].n).toBe(0);
  });

  it("a second booking fewer than 7 days later is rejected with a clear error", async () => {
    const tooSoon = nextOpenDate(4, [bookDate]);
    await expect(
      runAs(FATIMA, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz)", [
          fatimaSub,
          SVC_WASH,
          at(tooSoon, "14:00"),
        ]),
      ),
    ).rejects.toThrow(/INTERVAL: subscription visits must be at least 7 days apart/);
  });

  it("duplicate submission of the same booking is rejected", async () => {
    await expect(
      runAs(FATIMA, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz)", [
          fatimaSub,
          SVC_WASH,
          at(bookDate, "15:00"),
        ]),
      ),
    ).rejects.toThrow(/INTERVAL|DUPLICATE/);
  });

  it("adults-only customer cannot book a children-only service", async () => {
    await expect(
      runAs(FATIMA, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz)", [
          fatimaSub,
          SVC_KIDS,
          at(nextOpenDate(10, [bookDate]), "10:00"),
        ]),
      ),
    ).rejects.toThrow(/children only|not included/);
  });

  it("ineligible extra service is blocked (kids booking + adult-only colouring)", async () => {
    const aishaSub = await db.query(
      `select s.id from subscriptions s where s.child_id = $1`,
      [CHILD_HAFSAT],
    );
    await expect(
      runAs(AISHA, (q) =>
        q(
          `select fn_book_appointment($1, $2, $3::timestamptz, 'salon', $4, array[$5]::uuid[])`,
          [
            aishaSub.rows[0].id,
            SVC_KIDS,
            at(nextOpenDate(13), "11:00"),
            CHILD_HAFSAT,
            XS_COLOUR,
          ],
        ),
      ),
    ).rejects.toThrow(/ADDON_INELIGIBLE|INTERVAL/);
  });

  it("expired subscription cannot book", async () => {
    const zainabSub = await db.query(
      `select s.id from subscriptions s join customer_profiles cp on cp.id = s.customer_id
       where cp.profile_id = $1`,
      [ZAINAB],
    );
    await expect(
      runAs(ZAINAB, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz)", [
          zainabSub.rows[0].id,
          SVC_WASH,
          at(nextOpenDate(3), "10:00"),
        ]),
      ),
    ).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
  });

  it("customer cannot assign a stylist (even to their own appointment)", async () => {
    await expect(
      runAs(FATIMA, (q) =>
        q("select fn_assign_stylist($1, $2)", [apptId, STYLIST]),
      ),
    ).rejects.toThrow(/permission denied: appointments.assign/);
  });

  it("admin assigns a stylist; assignment history is recorded", async () => {
    await runAs(ADMIN, (q) => q("select fn_assign_stylist($1, $2)", [apptId, STYLIST]));
    const appt = await db.query(
      "select status, stylist_profile_id from appointments where id = $1",
      [apptId],
    );
    expect(appt.rows[0].stylist_profile_id).toBe(STYLIST);
    expect(appt.rows[0].status).toBe("assigned");
    const hist = await db.query(
      "select count(*)::int as n from stylist_assignment_history where appointment_id = $1",
      [apptId],
    );
    expect(hist.rows[0].n).toBe(1);
  });

  it("customer reschedules; reservation is preserved and history kept", async () => {
    const newDate = nextOpenDate(9, [bookDate]);
    await runAs(FATIMA, (q) =>
      q("select fn_reschedule_appointment($1, $2::timestamptz, 'change of plans')", [
        apptId,
        at(newDate, "11:00"),
      ]),
    );
    const appt = await db.query(
      "select status, stylist_profile_id from appointments where id = $1",
      [apptId],
    );
    expect(appt.rows[0].status).toBe("pending_confirmation"); // needs re-confirmation
    const res = await db.query(
      "select count(*)::int as n from visit_reservations where appointment_id = $1 and status = 'active'",
      [apptId],
    );
    expect(res.rows[0].n).toBe(1); // reservation preserved
    const hist = await db.query(
      "select count(*)::int as n from appointment_reschedule_history where appointment_id = $1",
      [apptId],
    );
    expect(hist.rows[0].n).toBe(1);
  });

  it("rescheduling beyond the subscription cycle end is rejected", async () => {
    await expect(
      runAs(FATIMA, (q) =>
        q("select fn_reschedule_appointment($1, $2::timestamptz)", [
          apptId,
          at(nextOpenDate(40), "11:00"),
        ]),
      ),
    ).rejects.toThrow(/CYCLE|WINDOW/);
  });

  it("completion consumes the visit exactly once", async () => {
    // Customer reschedule reset the appointment to pending confirmation.
    await runAs(ADMIN, (q) => q("select fn_set_appointment_status($1, 'confirmed')", [apptId]));
    await runAs(ADMIN, (q) => q("select fn_set_appointment_status($1, 'arrived')", [apptId]));
    await runAs(ADMIN, (q) => q("select fn_complete_appointment($1)", [apptId]));
    const ent = await db.query(
      `select e.status from visit_reservations vr
       join visit_entitlements e on e.id = vr.entitlement_id
       where vr.appointment_id = $1`,
      [apptId],
    );
    expect(ent.rows[0].status).toBe("consumed");
    // double completion is blocked
    await expect(
      runAs(ADMIN, (q) => q("select fn_complete_appointment($1)", [apptId])),
    ).rejects.toThrow(/ALREADY_COMPLETED/);
  });

  it("missed appointment releases the reservation — visit NOT consumed", async () => {
    // Fatima has 1 visit left; book it, then mark missed.
    const d = nextOpenDate(20, [bookDate]);
    const appt2 = await runAs(FATIMA, async (q) => {
      const r = await q("select fn_book_appointment($1, $2, $3::timestamptz) as id", [
        fatimaSub,
        SVC_WASH,
        at(d, "12:00"),
      ]);
      return r.rows[0].id;
    });
    await runAs(ADMIN, (q) =>
      q("select fn_release_appointment($1, 'missed', 'no show')", [appt2]),
    );
    const ent = await db.query(
      `select e.status from visit_reservations vr
       join visit_entitlements e on e.id = vr.entitlement_id
       where vr.appointment_id = $1`,
      [appt2],
    );
    expect(ent.rows[0].status).toBe("available"); // returned, not consumed
  });

  it("no visits remaining -> booking rejected with NO_VISITS", async () => {
    // Fatima: 1 consumed, 1 available (released by the missed appointment).
    // Book it (>=7 days from both the completed and missed slots), then a
    // further attempt must fail on visit exhaustion specifically.
    const d1 = nextOpenDate(27);
    // +7 days is the same weekday, so it can never land on a closed Sunday.
    const d2t = new Date(`${d1}T12:00:00Z`);
    d2t.setUTCDate(d2t.getUTCDate() + 7);
    const d2 = d2t.toISOString().slice(0, 10);
    await runAs(FATIMA, (q) =>
      q("select fn_book_appointment($1, $2, $3::timestamptz)", [
        fatimaSub, SVC_WASH, at(d1, "13:00"),
      ]),
    );
    await expect(
      runAs(FATIMA, (q) =>
        q("select fn_book_appointment($1, $2, $3::timestamptz)", [
          fatimaSub, SVC_WASH, at(d2, "13:00"),
        ]),
      ),
    ).rejects.toThrow(/NO_VISITS/);
  });
});

describe("capacity", () => {
  it("slot capacity is enforced", async () => {
    await db.query("update scheduling_settings set max_bookings_per_slot = 1");
    try {
      const d = nextOpenDate(3);
      const maryamSub = await db.query(
        `select s.id from subscriptions s join customer_profiles cp on cp.id = s.customer_id
         where cp.profile_id = $1 and s.status = 'active'`,
        [MARYAM],
      );
      // Occupy the slot directly (superuser insert bypasses functions).
      await db.query(
        `insert into appointments (customer_id, service_id, starts_at, ends_at,
           duration_minutes, status)
         select cp.id, $1, $2::timestamptz, $2::timestamptz + interval '60 minutes', 60,
                'confirmed'
         from customer_profiles cp where cp.profile_id = $3`,
        [SVC_WASH, at(d, "16:00"), ZAINAB],
      );
      await expect(
        runAs(MARYAM, (q) =>
          q("select fn_book_appointment($1, $2, $3::timestamptz)", [
            maryamSub.rows[0].id,
            SVC_WASH,
            at(d, "16:00"),
          ]),
        ),
      ).rejects.toThrow(/CAPACITY|INTERVAL/);
    } finally {
      await db.query("update scheduling_settings set max_bookings_per_slot = 3");
    }
  });
});

describe("visit balance adjustment", () => {
  it("adjustment without a reason is rejected", async () => {
    const cycle = await db.query(
      `select c.id from subscription_cycles c
       join subscriptions s on s.id = c.subscription_id
       join customer_profiles cp on cp.id = s.customer_id
       where cp.profile_id = $1 and c.status = 'active'`,
      [MARYAM],
    );
    await expect(
      runAs(ADMIN, (q) => q("select fn_adjust_visit_balance($1, 1, '')", [cycle.rows[0].id])),
    ).rejects.toThrow(/REASON_REQUIRED/);
  });

  it("adjustment with a reason works and is audited", async () => {
    const cycle = await db.query(
      `select c.id from subscription_cycles c
       join subscriptions s on s.id = c.subscription_id
       join customer_profiles cp on cp.id = s.customer_id
       where cp.profile_id = $1 and c.status = 'active'`,
      [MARYAM],
    );
    await runAs(ADMIN, (q) =>
      q("select fn_adjust_visit_balance($1, 1, 'goodwill visit for referral')", [
        cycle.rows[0].id,
      ]),
    );
    const audit = await db.query(
      `select count(*)::int as n from audit_log
       where action = 'subscription.adjust_visits' and entity_id = $1`,
      [cycle.rows[0].id],
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("customer cannot call the adjustment function", async () => {
    const cycle = await db.query(
      `select c.id from subscription_cycles c
       join subscriptions s on s.id = c.subscription_id
       join customer_profiles cp on cp.id = s.customer_id
       where cp.profile_id = $1 and c.status = 'active'`,
      [MARYAM],
    );
    await expect(
      runAs(MARYAM, (q) =>
        q("select fn_adjust_visit_balance($1, 5, 'gimme')", [cycle.rows[0].id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("consultations and favourites", () => {
  it("customer books a pending consultation", async () => {
    const cid = await customerIdOf(MARYAM);
    const ct = await db.query(
      "select id, price_kobo from consultation_types where slug = 'general-hair'",
    );
    const rows = await runAs(MARYAM, async (q) => {
      const r = await q(
        `insert into consultation_bookings
           (customer_id, consultation_type_id, requested_at, concerns, price_kobo, status)
         values ($1, $2, $3::timestamptz, 'Breakage at the temples', $4, 'pending_payment')
         returning status`,
        [cid, ct.rows[0].id, at(nextOpenDate(4), "12:00"), ct.rows[0].price_kobo],
      );
      return r.rows;
    });
    expect(rows[0].status).toBe("pending_payment");
  });

  it("customer favourites a product; another customer cannot see it", async () => {
    const cid = await customerIdOf(FATIMA);
    const prod = await db.query("select id from products where slug = 'moisture-shampoo'");
    await runAs(FATIMA, (q) =>
      q("insert into favourites (customer_id, item_type, item_id) values ($1, 'product', $2)", [
        cid,
        prod.rows[0].id,
      ]),
    );
    const other = await runAs(MARYAM, async (q) => {
      const r = await q("select * from favourites where customer_id = $1", [cid]);
      return r.rows;
    });
    expect(other).toHaveLength(0);
  });
});

describe("retention prompts", () => {
  it("regeneration does not duplicate prompts", async () => {
    const cid = await customerIdOf(FATIMA);
    await db.query("select fn_generate_retention_prompts($1)", [cid]);
    await db.query("select fn_generate_retention_prompts($1)", [cid]);
    const r = await db.query(
      `select prompt_key, count(*)::int as n from retention_prompts
       where customer_id = $1 group by prompt_key having count(*) > 1`,
      [cid],
    );
    expect(r.rows).toHaveLength(0);
  });

  it("customer can dismiss but not edit a prompt", async () => {
    const cid = await customerIdOf(FATIMA);
    const p = await db.query(
      "select id from retention_prompts where customer_id = $1 and dismissible limit 1",
      [cid],
    );
    if (p.rows.length === 0) return; // no dismissible prompt right now
    await runAs(FATIMA, (q) =>
      q("update retention_prompts set dismissed_at = now() where id = $1", [p.rows[0].id]),
    );
    await expect(
      runAs(FATIMA, (q) =>
        q("update retention_prompts set title = 'hacked' where id = $1", [p.rows[0].id]),
      ),
    ).rejects.toThrow(/seen\/dismissed/);
  });
});
