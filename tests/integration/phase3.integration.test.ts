/**
 * Phase 3 integration tests: inventory ledger, receiving, counts,
 * appointment consumption, expenses workflow, support chat RLS, capacity.
 * Runs against the local Postgres harness (npm run db:reset first).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type QueryResult } from "pg";

const ADMIN = "11111111-0000-0000-0000-000000000001";
const STYLIST = "11111111-0000-0000-0000-000000000002";
const MARYAM = "11111111-0000-0000-0000-000000000003";
const FATIMA = "11111111-0000-0000-0000-000000000005";
const AISHA = "11111111-0000-0000-0000-000000000006";
const SHAMPOO = "bbbb1111-0000-0000-0000-000000000001";
const NAIL_POLISH = "bbbb1111-0000-0000-0000-000000000008"; // 0 on hand
const RECEIPT = "cccc1111-0000-0000-0000-000000000001";
const COUNT = "cccc2222-0000-0000-0000-000000000001";
const HENNA_ITEM = "bbbb1111-0000-0000-0000-000000000005";
const KIDS_PLAN = "55555555-0000-0000-0000-000000000005"; // limit 3
const CONV_ZAINAB = "dddd1111-0000-0000-0000-000000000002"; // has internal note

let db: Client;

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

describe("stock movement ledger", () => {
  it("posting a movement updates quantity and records before/after", async () => {
    const before = await db.query(
      "select quantity_on_hand from inventory_items where id = $1", [SHAMPOO]);
    await runAs(ADMIN, (q) =>
      q("select fn_post_stock_movement($1, 'salon_usage', -100, 'test usage')", [SHAMPOO]));
    const after = await db.query(
      "select quantity_on_hand from inventory_items where id = $1", [SHAMPOO]);
    expect(Number(after.rows[0].quantity_on_hand)).toBe(
      Number(before.rows[0].quantity_on_hand) - 100);
    const mv = await db.query(
      `select quantity_before, quantity_after from inventory_movements
       where item_id = $1 order by created_at desc limit 1`, [SHAMPOO]);
    expect(Number(mv.rows[0].quantity_after)).toBe(
      Number(mv.rows[0].quantity_before) - 100);
  });

  it("negative stock is prevented by default", async () => {
    await expect(
      runAs(ADMIN, (q) =>
        q("select fn_post_stock_movement($1, 'salon_usage', -5, 'impossible')", [NAIL_POLISH])),
    ).rejects.toThrow(/NEGATIVE_STOCK/);
  });

  it("quantities cannot be overwritten directly, even by admins", async () => {
    await expect(
      runAs(ADMIN, (q) =>
        q("update inventory_items set quantity_on_hand = 99999 where id = $1", [SHAMPOO])),
    ).rejects.toThrow(/STOCK_GUARD/);
  });

  it("the movement ledger is immutable", async () => {
    await expect(
      db.query("update inventory_movements set quantity = 1 where item_id = $1", [SHAMPOO]),
    ).rejects.toThrow(/LEDGER_IMMUTABLE/);
    await expect(
      db.query("delete from inventory_movements where item_id = $1", [SHAMPOO]),
    ).rejects.toThrow(/LEDGER_IMMUTABLE/);
  });

  it("customers cannot see inventory or costs at all", async () => {
    const rows = await runAs(MARYAM, async (q) => (await q("select * from inventory_items")).rows);
    expect(rows).toHaveLength(0);
    const mv = await runAs(MARYAM, async (q) => (await q("select * from inventory_movements")).rows);
    expect(mv).toHaveLength(0);
  });
});

describe("stock receiving and counts", () => {
  it("confirming a receipt twice does not double stock", async () => {
    await expect(
      runAs(ADMIN, (q) => q("select fn_confirm_stock_receipt($1)", [RECEIPT])),
    ).rejects.toThrow(/ALREADY_POSTED/);
  });

  it("approving a stock count posts the variance and locks the count", async () => {
    const before = await db.query(
      "select quantity_on_hand from inventory_items where id = $1", [HENNA_ITEM]);
    await runAs(ADMIN, (q) =>
      q("select fn_review_stock_count($1, true, 'verified spillage')", [COUNT]));
    const after = await db.query(
      "select quantity_on_hand from inventory_items where id = $1", [HENNA_ITEM]);
    expect(Number(after.rows[0].quantity_on_hand)).toBe(
      Number(before.rows[0].quantity_on_hand) - 100);
    await expect(
      runAs(ADMIN, (q) => q("select fn_review_stock_count($1, true)", [COUNT])),
    ).rejects.toThrow(/STATE/);
  });
});

describe("appointment consumption", () => {
  let apptId: string;

  beforeAll(async () => {
    // Use Maryam's completed seeded appointment.
    const r = await db.query(
      `select a.id from appointments a
       join customer_profiles cp on cp.id = a.customer_id
       where cp.profile_id = $1 and a.status = 'completed' limit 1`, [MARYAM]);
    apptId = r.rows[0].id;
  });

  it("staff confirm usage; movements post once and link to the appointment", async () => {
    const items = JSON.stringify([
      { item_id: SHAMPOO, planned: 50, actual: 55, reason: null },
      { item_id: "bbbb1111-0000-0000-0000-000000000007", planned: 1, actual: 1, reason: null },
    ]);
    await runAs(STYLIST, (q) =>
      q("select fn_post_appointment_consumption($1, $2::jsonb)", [apptId, items]));
    const mv = await db.query(
      `select count(*)::int as n from inventory_movements
       where reference_type = 'appointment' and reference_id = $1`, [apptId]);
    expect(mv.rows[0].n).toBe(2);
  });

  it("duplicate consumption posting is blocked", async () => {
    await expect(
      runAs(STYLIST, (q) =>
        q("select fn_post_appointment_consumption($1, '[]'::jsonb)", [apptId])),
    ).rejects.toThrow(/ALREADY_POSTED/);
  });

  it("large deviation without a reason is rejected", async () => {
    const other = await db.query(
      `select a.id from appointments a join customer_profiles cp on cp.id = a.customer_id
       where cp.profile_id = $1 and a.status = 'completed' limit 1`,
      ["11111111-0000-0000-0000-000000000004"]);
    const items = JSON.stringify([{ item_id: SHAMPOO, planned: 50, actual: 200, reason: "" }]);
    await expect(
      runAs(STYLIST, (q) =>
        q("select fn_post_appointment_consumption($1, $2::jsonb)", [other.rows[0].id, items])),
    ).rejects.toThrow(/REASON_REQUIRED/);
  });

  it("consumption is only for completed appointments", async () => {
    const upcoming = await db.query(
      "select id from appointments where status in ('assigned','confirmed') limit 1");
    await expect(
      runAs(STYLIST, (q) =>
        q("select fn_post_appointment_consumption($1, '[]'::jsonb)", [upcoming.rows[0].id])),
    ).rejects.toThrow(/STATE/);
  });
});

describe("expense workflow", () => {
  let expenseId: string;

  it("staff creates and submits a draft", async () => {
    expenseId = await runAs(STYLIST, async (q) => {
      const cat = await q("select id from expense_categories where name = 'Fuel'");
      const r = await q(
        `insert into expenses (organisation_id, amount_kobo, category_id, description, entered_by)
         values ((select id from organisations limit 1), 500000, $1, 'Test fuel', $2)
         returning id`, [cat.rows[0].id, STYLIST]);
      await q("select fn_expense_transition($1, 'submit')", [r.rows[0].id]);
      return r.rows[0].id as string;
    });
    const r = await db.query("select status from expenses where id = $1", [expenseId]);
    expect(r.rows[0].status).toBe("pending_approval");
  });

  it("submitted expenses cannot be silently edited", async () => {
    await expect(
      runAs(ADMIN, (q) =>
        q("update expenses set amount_kobo = 1 where id = $1", [expenseId])),
    ).rejects.toThrow(/EXPENSE_LOCKED/);
  });

  it("the creator cannot approve their own expense", async () => {
    await expect(
      runAs(STYLIST, (q) =>
        q("select fn_expense_transition($1, 'approve')", [expenseId])),
    ).rejects.toThrow(/SELF_APPROVAL|permission denied/);
  });

  it("another approver approves; double approval is blocked; paid works", async () => {
    await runAs(ADMIN, (q) => q("select fn_expense_transition($1, 'approve')", [expenseId]));
    await expect(
      runAs(ADMIN, (q) => q("select fn_expense_transition($1, 'approve')", [expenseId])),
    ).rejects.toThrow(/STATE/);
    await runAs(ADMIN, (q) => q("select fn_expense_transition($1, 'mark_paid')", [expenseId]));
    const r = await db.query("select status from expenses where id = $1", [expenseId]);
    expect(r.rows[0].status).toBe("paid");
  });

  it("voiding requires a reason and approved expenses cannot be deleted", async () => {
    await expect(
      runAs(ADMIN, (q) => q("select fn_expense_transition($1, 'void', '')", [expenseId])),
    ).rejects.toThrow(/REASON_REQUIRED/);
    const del = await runAs(ADMIN, (q) =>
      q("delete from expenses where id = $1", [expenseId]));
    expect(del.rowCount).toBe(0); // RLS: only drafts deletable
  });

  it("recurring templates generate exactly one draft per due date", async () => {
    await db.query("select fn_generate_recurring_expenses()");
    await db.query("select fn_generate_recurring_expenses()"); // idempotent for same due date
    const r = await db.query(
      `select count(*)::int as n from expenses
       where recurring_template_id is not null`);
    expect(r.rows[0].n).toBe(1);
  });

  it("customers cannot read expenses", async () => {
    const rows = await runAs(MARYAM, async (q) => (await q("select * from expenses")).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("support chat", () => {
  it("customer opens a conversation and sends a message", async () => {
    const convId = await runAs(FATIMA, async (q) => {
      const r = await q(
        `insert into support_conversations (customer_id, subject, topic)
         values (current_customer_id(), 'Test question', 'subscription') returning id`);
      await q(
        `insert into support_messages (conversation_id, sender_profile_id, sender_type, body)
         values ($1, $2, 'customer', 'How do I change my plan?')`, [r.rows[0].id, FATIMA]);
      return r.rows[0].id as string;
    });
    const conv = await db.query(
      "select status, last_customer_message_at from support_conversations where id = $1",
      [convId]);
    expect(conv.rows[0].last_customer_message_at).not.toBeNull();
  });

  it("another customer cannot read someone else's conversation", async () => {
    const rows = await runAs(AISHA, async (q) =>
      (await q("select * from support_messages where conversation_id = $1", [CONV_ZAINAB])).rows);
    expect(rows).toHaveLength(0);
  });

  it("internal notes are invisible to the customer but visible to staff", async () => {
    const zainab = "11111111-0000-0000-0000-000000000007";
    const customerView = await runAs(zainab, async (q) =>
      (await q("select body from support_messages where conversation_id = $1", [CONV_ZAINAB])).rows);
    expect(customerView.some((m) => /Refund the/.test(m.body))).toBe(false);
    const staffView = await runAs(STYLIST, async (q) =>
      (await q("select body, is_internal_note from support_messages where conversation_id = $1", [CONV_ZAINAB])).rows);
    expect(staffView.some((m) => m.is_internal_note)).toBe(true);
  });

  it("customers can never create internal notes (flag is forced off)", async () => {
    const zainab = "11111111-0000-0000-0000-000000000007";
    await runAs(zainab, (q) =>
      q(`insert into support_messages (conversation_id, sender_profile_id, sender_type, body, is_internal_note)
         values ($1, $2, 'staff', 'sneaky note', true)`, [CONV_ZAINAB, zainab]));
    const r = await db.query(
      `select sender_type, is_internal_note from support_messages
       where conversation_id = $1 and body = 'sneaky note'`, [CONV_ZAINAB]);
    expect(r.rows[0].sender_type).toBe("customer"); // forced truthful
    expect(r.rows[0].is_internal_note).toBe(false);
  });

  it("staff reply flips status to waiting_customer and records first response", async () => {
    const conv = "dddd1111-0000-0000-0000-000000000001";
    await runAs(ADMIN, (q) =>
      q(`insert into support_messages (conversation_id, sender_profile_id, sender_type, body)
         values ($1, $2, 'staff', 'Of course — Monday 11am is free, shall I move it?')`,
        [conv, ADMIN]));
    const r = await db.query(
      "select status, first_response_seconds from support_conversations where id = $1", [conv]);
    expect(r.rows[0].status).toBe("waiting_customer");
    expect(r.rows[0].first_response_seconds).not.toBeNull();
  });

  it("customers cannot post into a closed conversation", async () => {
    const resolved = "dddd1111-0000-0000-0000-000000000003";
    await db.query(
      "update support_conversations set status = 'closed', closed_at = now() where id = $1",
      [resolved]);
    await expect(
      runAs(FATIMA, (q) =>
        q(`insert into support_messages (conversation_id, sender_profile_id, sender_type, body)
           values ($1, $2, 'customer', 'one more thing')`, [resolved, FATIMA])),
    ).rejects.toThrow(/CLOSED/);
  });
});

describe("subscription capacity", () => {
  it("activation is blocked at the plan limit and allowed with an admin override", async () => {
    // Kids plan limit is 3; two kids subscriptions exist. Add 1 more → full.
    const fatimaCustomer = await db.query(
      `select cp.id from customer_profiles cp join profiles p on p.id = cp.profile_id
       where p.email = 'khadija@customer.test'`);
    // khadija already has an active sub for herself; kids plan is for a child →
    // create a child for her first (as admin on her behalf via SQL).
    const child = await db.query(
      `insert into children (customer_id, full_name, date_of_birth)
       values ($1, 'Cap Test Child', '2019-01-01') returning id`,
      [fatimaCustomer.rows[0].id]);
    await runAs(ADMIN, (q) =>
      q("select fn_activate_manual_subscription($1, $2, $3)",
        [fatimaCustomer.rows[0].id, KIDS_PLAN, child.rows[0].id]));

    // Now at 3/3 — the next activation must fail…
    const zainabCustomer = await db.query(
      `select cp.id from customer_profiles cp join profiles p on p.id = cp.profile_id
       where p.email = 'zainab@customer.test'`);
    const child2 = await db.query(
      `insert into children (customer_id, full_name, date_of_birth)
       values ($1, 'Cap Test Child 2', '2020-01-01') returning id`,
      [zainabCustomer.rows[0].id]);
    await expect(
      runAs(ADMIN, (q) =>
        q("select fn_activate_manual_subscription($1, $2, $3)",
          [zainabCustomer.rows[0].id, KIDS_PLAN, child2.rows[0].id])),
    ).rejects.toThrow(/CAPACITY_FULL/);

    // …unless overridden with a reason (audited).
    await runAs(ADMIN, (q) =>
      q("select fn_activate_manual_subscription($1, $2, $3, null, 'test', 'VIP request approved by owner')",
        [zainabCustomer.rows[0].id, KIDS_PLAN, child2.rows[0].id]));
    const audit = await db.query(
      "select count(*)::int as n from audit_log where action = 'capacity.override'");
    expect(audit.rows[0].n).toBe(1);
  });

  it("customers cannot read capacity settings", async () => {
    const rows = await runAs(MARYAM, async (q) =>
      (await q("select * from subscription_capacity_settings")).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("product availability follows linked inventory (0018)", () => {
  const SATIN_ITEM = "bbbb1111-0000-0000-0000-000000000009"; // reorder level 5

  const bonnetStatus = async () =>
    (await db.query("select stock_status from products where slug = 'satin-bonnet'"))
      .rows[0].stock_status;

  it("selling stock down flips the linked product to low, then out of stock", async () => {
    expect(await bonnetStatus()).toBe("in_stock"); // 12 on hand at seed
    await runAs(ADMIN, (q) =>
      q("select fn_post_stock_movement($1, 'retail_sale', -8, 'sold at reception')", [SATIN_ITEM]));
    expect(await bonnetStatus()).toBe("low_stock"); // 4 left ≤ reorder 5
    await runAs(ADMIN, (q) =>
      q("select fn_post_stock_movement($1, 'retail_sale', -4, 'sold the rest')", [SATIN_ITEM]));
    expect(await bonnetStatus()).toBe("out_of_stock");
  });

  it("receiving stock brings the product back in stock", async () => {
    await runAs(ADMIN, (q) =>
      q("select fn_post_stock_movement($1, 'stock_received', 20, 'restock')", [SATIN_ITEM]));
    expect(await bonnetStatus()).toBe("in_stock");
  });
});
