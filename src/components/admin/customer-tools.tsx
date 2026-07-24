"use client";

import { useState, useTransition } from "react";
import {
  adminActivateSubscription,
  adminAddCustomerNote,
  adminAdjustVisits,
  adminArchiveCustomer,
  adminAssignTag,
  adminRemoveTag,
} from "@/server/actions/admin";
import { buttonClass, inputClass } from "@/components/ui";

type Msg = { error?: string; success?: string };

function Feedback({ msg }: { msg: Msg }) {
  if (msg.error)
    return <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>;
  if (msg.success)
    return <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.success}</p>;
  return null;
}

function AdjustVisits({ customerId, cycleId }: { customerId: string; cycleId: string }) {
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<Msg>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-line p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        Adjust visit balance (audited — reason required)
      </p>
      <div className="flex flex-wrap gap-2">
        <select className={`${inputClass} w-28`} value={delta}
          onChange={(e) => setDelta(Number(e.target.value))}>
          {[3, 2, 1, -1, -2, -3].map((d) => (
            <option key={d} value={d}>{d > 0 ? `+${d}` : d}</option>
          ))}
        </select>
        <input className={`${inputClass} flex-1`} placeholder="Reason (required)"
          value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        <button
          className={buttonClass("outline")}
          disabled={pending || !reason.trim()}
          onClick={() =>
            startTransition(async () =>
              setMsg(await adminAdjustVisits(customerId, cycleId, delta, reason)),
            )
          }
        >
          Apply
        </button>
      </div>
      <Feedback msg={msg} />
    </div>
  );
}

function AddNote({ customerId }: { customerId: string }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex gap-2">
        <input className={inputClass} placeholder="Add a note (staff only)…"
          value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <button
          className={buttonClass("outline")}
          disabled={pending || !note.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await adminAddCustomerNote(customerId, note);
              setMsg(r);
              if (!r.error) setNote("");
            })
          }
        >
          Add
        </button>
      </div>
      <Feedback msg={msg} />
    </div>
  );
}

function Panel({
  customerId,
  isAdmin,
  archived,
  childOptions,
  planOptions,
  tags,
}: {
  customerId: string;
  isAdmin: boolean;
  archived: boolean;
  childOptions: Array<{ id: string; name: string }>;
  planOptions: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}) {
  const [planId, setPlanId] = useState(planOptions[0]?.id ?? "");
  const [who, setWho] = useState("self");
  const [reason, setReason] = useState("");
  const [tagName, setTagName] = useState("");
  const [msg, setMsg] = useState<Msg>({});
  const [pending, startTransition] = useTransition();

  if (!isAdmin) return null;

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
      <p className="font-semibold">Admin tools</p>
      <Feedback msg={msg} />

      <div className="grid gap-2 border-t border-line pt-3">
        <p className="text-sm font-semibold">
          Manually activate a subscription (test or migrated customers)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {planOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select className={inputClass} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="self">For the customer</option>
            {childOptions.map((c) => (
              <option key={c.id} value={c.id}>For {c.name}</option>
            ))}
          </select>
        </div>
        <input className={inputClass} placeholder="Reason (e.g. migrated from paper records)"
          value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        <button
          className={buttonClass("primary", "justify-self-start")}
          disabled={pending || !planId}
          onClick={() =>
            startTransition(async () =>
              setMsg(
                await adminActivateSubscription(
                  customerId, planId, who === "self" ? null : who, reason,
                ),
              ),
            )
          }
        >
          Activate subscription
        </button>
      </div>

      <div className="grid gap-2 border-t border-line pt-3">
        <p className="text-sm font-semibold">Tags</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t.id}
                className="group rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700"
                title="Remove tag"
                onClick={() =>
                  startTransition(async () => {
                    await adminRemoveTag(customerId, t.id);
                  })
                }
              >
                {t.name} <span className="text-brand-400 group-hover:text-red-600">✕</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input className={inputClass} placeholder="Add tag (e.g. vip, bridal)"
            value={tagName} maxLength={40} onChange={(e) => setTagName(e.target.value)} />
          <button
            className={buttonClass("outline")}
            disabled={pending || !tagName.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await adminAssignTag(customerId, tagName);
                setMsg(r);
                if (!r.error) setTagName("");
              })
            }
          >
            Add
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <button
          className={buttonClass(archived ? "outline" : "danger")}
          disabled={pending}
          onClick={() => {
            if (!archived && !window.confirm("Archive this customer account?")) return;
            startTransition(async () =>
              setMsg(await adminArchiveCustomer(customerId, !archived)),
            );
          }}
        >
          {archived ? "Restore customer" : "Archive customer"}
        </button>
      </div>
    </div>
  );
}

export const CustomerAdminTools = { Panel, AdjustVisits, AddNote };
