"use client";

import { useState, useTransition } from "react";
import {
  previewMemberImport,
  runMemberImport,
  type ImportResult,
} from "@/server/actions/migration";
import type { ImportRow } from "@/lib/migration";
import { Badge, buttonClass, inputClass } from "@/components/ui";

const OUTCOME_TONE = {
  imported: "green", would_import: "green", skipped_active: "gold",
  invalid: "amber", failed: "red",
} as const;

/** v3 §9 — dry-run first, import second, safely repeatable. */
export function MemberImport() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const doPreview = () =>
    startTransition(async () => {
      setError(null);
      setResults(null);
      const r = await previewMemberImport(csv);
      if (r.error) { setError(r.error); setPreview(null); }
      else setPreview(r.rows ?? []);
    });

  const doImport = () => {
    const valid = (preview ?? []).filter((r) => r.errors.length === 0).length;
    if (!window.confirm(
      `Import ${valid} member${valid === 1 ? "" : "s"}? Memberships activate immediately through the standard activation path. Re-running is safe — already-active members are skipped.`))
      return;
    startTransition(async () => {
      setError(null);
      const r = await runMemberImport(csv);
      if (r.error) setError(r.error);
      else { setResults(r.results ?? []); setPreview(null); }
    });
  };

  return (
    <div className="grid gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-ink-soft">
          Paste the member list (CSV)
        </span>
        <textarea
          rows={8}
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setPreview(null); setResults(null); }}
          placeholder={"full_name,email,phone,whatsapp,plan_code,start_date,home_salon\nAmina Yusuf,amina@example.com,+2348011112222,,SL-AD-BASIC,2026-08-01,Ilorin"}
          className={`${inputClass} font-mono text-sm`}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass("outline")} disabled={pending || !csv.trim()}
          onClick={doPreview}>
          {pending ? "Checking…" : "Dry run (validate only)"}
        </button>
        {preview && preview.some((r) => r.errors.length === 0) && (
          <button className={buttonClass("primary")} disabled={pending} onClick={doImport}>
            {pending ? "Importing…" : `Import ${preview.filter((r) => r.errors.length === 0).length} valid member(s)`}
          </button>
        )}
      </div>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      {preview && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-brand-50 text-left text-ink-soft">
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.line} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink-soft">{r.line}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.full_name || "—"}</span>
                    <span className="block text-xs text-ink-soft">{r.email}</span>
                  </td>
                  <td className="px-3 py-2">{r.plan_code}</td>
                  <td className="px-3 py-2">
                    {r.errors.length === 0 ? (
                      <Badge tone="green">ready</Badge>
                    ) : (
                      <span className="text-xs text-red-700">{r.errors.join("; ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-brand-50 text-left text-ink-soft">
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.line} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink-soft">{r.line}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-ink-soft">{r.email}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={OUTCOME_TONE[r.outcome]}>{r.outcome.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
