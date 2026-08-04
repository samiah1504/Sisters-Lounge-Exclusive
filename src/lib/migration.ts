/**
 * Member migration import (v3 §9) — pure CSV parsing/validation so the
 * dry-run is unit-testable. Expected header (order-free, case-insensitive):
 * full_name,email,phone,whatsapp,plan_code,start_date,home_salon
 * start_date (YYYY-MM-DD) and home_salon (city or slug) are optional.
 */

export interface ImportRowInput {
  line: number;
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  plan_code: string;
  start_date: string | null;
  home_salon: string | null;
}

export interface ImportRow extends ImportRowInput {
  errors: string[];
}

const REQUIRED = ["full_name", "email", "phone", "plan_code"] as const;
const KNOWN = [
  "full_name", "email", "phone", "whatsapp", "plan_code",
  "start_date", "home_salon",
];

function splitCsvLine(line: string): string[] {
  // Simple CSV: supports double-quoted fields with commas inside.
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseMemberImport(
  csv: string,
  context: {
    planCodes: string[];          // valid plan_code values (case-insensitive)
    salonKeys: string[];          // valid city/slug values (case-insensitive)
  },
): { headerError: string | null; rows: ImportRow[] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { headerError: "Paste a header row plus at least one member row.", rows: [] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  for (const req of REQUIRED) {
    if (!header.includes(req)) {
      return { headerError: `Missing required column "${req}". Expected: ${KNOWN.join(", ")}`, rows: [] };
    }
  }
  const idx = (name: string) => header.indexOf(name);
  const planSet = new Set(context.planCodes.map((c) => c.toLowerCase()));
  const salonSet = new Set(context.salonKeys.map((c) => c.toLowerCase()));

  const rows: ImportRow[] = [];
  const seenEmails = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (name: string) => (idx(name) >= 0 ? cells[idx(name)] ?? "" : "");
    const row: ImportRow = {
      line: i + 1,
      full_name: get("full_name"),
      email: get("email").toLowerCase(),
      phone: get("phone"),
      whatsapp: get("whatsapp") || get("phone"),
      plan_code: get("plan_code"),
      start_date: get("start_date") || null,
      home_salon: get("home_salon") || null,
      errors: [],
    };

    if (row.full_name.length < 2) row.errors.push("full_name is required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) row.errors.push("invalid email");
    if (row.phone.replace(/\D/g, "").length < 7) row.errors.push("invalid phone");
    if (!planSet.has(row.plan_code.toLowerCase())) {
      row.errors.push(`unknown plan_code "${row.plan_code}"`);
    }
    if (row.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date)) {
      row.errors.push("start_date must be YYYY-MM-DD");
    }
    if (row.home_salon && !salonSet.has(row.home_salon.toLowerCase())) {
      row.errors.push(`unknown home_salon "${row.home_salon}"`);
    }
    if (seenEmails.has(row.email)) row.errors.push("duplicate email in this file");
    seenEmails.add(row.email);

    rows.push(row);
  }
  return { headerError: null, rows };
}
