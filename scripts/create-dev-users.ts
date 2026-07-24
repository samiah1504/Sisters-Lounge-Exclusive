/**
 * Creates the development/test users on a HOSTED Supabase project so
 * supabase/seed.sql can run (it references these fixed UUIDs).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/create-dev-users.ts
 *
 * DEV ONLY — creates accounts with a known password. Never run in production.
 */
import { createClient } from "@supabase/supabase-js";

const users = [
  { id: "11111111-0000-0000-0000-000000000001", email: "admin@sisterslounge.test", full_name: "Salon Admin" },
  { id: "11111111-0000-0000-0000-000000000002", email: "amina.stylist@sisterslounge.test", full_name: "Amina Stylist" },
  { id: "11111111-0000-0000-0000-000000000003", email: "maryam@customer.test", full_name: "Maryam Bello" },
  { id: "11111111-0000-0000-0000-000000000004", email: "khadija@customer.test", full_name: "Khadija Yusuf" },
  { id: "11111111-0000-0000-0000-000000000005", email: "fatima@customer.test", full_name: "Fatima Abdullahi" },
  { id: "11111111-0000-0000-0000-000000000006", email: "aisha.parent@customer.test", full_name: "Aisha Ibrahim" },
  { id: "11111111-0000-0000-0000-000000000007", email: "zainab@customer.test", full_name: "Zainab Suleiman" },
];

const PASSWORD = "SistersLounge!Dev1";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  for (const u of users) {
    const { error } = await admin.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (error && !/already/i.test(error.message)) {
      console.error(`✗ ${u.email}: ${error.message}`);
    } else {
      console.log(`✓ ${u.email}`);
    }
  }
  console.log(`\nAll dev users use password: ${PASSWORD}`);
  console.log("Now run supabase/seed.sql against the project (supabase db push / SQL editor).");
}

main();
