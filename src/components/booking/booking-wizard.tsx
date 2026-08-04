"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookAppointment } from "@/server/actions/customer";
import {
  addonTotal,
  intervalConflict,
  totalDuration,
  visitsAtRisk,
} from "@/lib/booking-rules";
import { isExtraServiceEligible, isServiceEligible } from "@/lib/eligibility";
import {
  resolveRecommendations,
  type RecommendationRule,
} from "@/lib/recommendations";
import { formatDuration, formatNaira, formatTime } from "@/lib/format";
import { Badge, buttonClass, inputClass } from "@/components/ui";
import type { Service } from "@/lib/types";

export interface WizardSubscription {
  id: string;
  planId: string;
  planName: string;
  categoryId: string;
  categoryName: string;
  childId: string | null;
  childName: string | null;
  intervalDays: number;
  availableDays: number[];
  remaining: number;
  cycleEndsOn: string;
  liveVisitDates: string[];
}

interface WizardExtra {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  price_kobo: number;
  estimated_duration_minutes: number;
  is_active: boolean;
  is_featured: boolean;
  archived_at: string | null;
  min_advance_notice_hours: number;
  payment_requirement: string;
  eligible_plan_ids: string[];
  eligible_category_ids: string[];
}

interface Props {
  subscriptions: WizardSubscription[];
  childrenList: Array<{ id: string; name: string }>;
  services: Service[];
  planServices: Array<{ plan_id: string; service_id: string; relation: string }>;
  extras: WizardExtra[];
  rules: RecommendationRule[];
  scheduling: {
    minNoticeHours: number;
    maxAdvanceDays: number;
  };
  salons: Array<{ id: string; name: string; city: string; address: string }>;
  salonHours: Array<{ salon_id: string; day_of_week: number; is_open: boolean }>;
  homeSalonId: string | null;
  preselectSubscription: string | null;
}

const STEPS = ["Who & plan", "Salon", "Service", "Date & time", "Enhance", "Review"];

export function BookingWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [subId, setSubId] = useState(
    props.preselectSubscription &&
      props.subscriptions.some((s) => s.id === props.preselectSubscription)
      ? props.preselectSubscription
      : props.subscriptions[0].id,
  );
  const [salonId, setSalonId] = useState(
    props.homeSalonId && props.salons.some((s) => s.id === props.homeSalonId)
      ? props.homeSalonId
      : props.salons[0]?.id ?? "",
  );
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState<string | null>(null); // ISO of chosen slot
  const [slots, setSlots] = useState<Array<{ startsAt: string; remaining: number }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sub = props.subscriptions.find((s) => s.id === subId)!;
  const forChild = sub.childId !== null;

  // Changing the plan resets every downstream choice (handler, not effect).
  const selectSubscription = (id: string) => {
    const next = props.subscriptions.find((s) => s.id === id)!;
    void next;
    setSubId(id);
    setServiceId(null);
    setAddonIds([]);
    setTime(null);
    setDate("");
  };

  const eligibleServices = useMemo(() => {
    const included = props.planServices.filter(
      (ps) => ps.plan_id === sub.planId && ps.relation === "included",
    );
    const optional = props.planServices.filter(
      (ps) => ps.plan_id === sub.planId && ps.relation === "optional",
    );
    const excluded = new Set(
      props.planServices
        .filter((ps) => ps.plan_id === sub.planId &&
          ["excluded", "restricted"].includes(ps.relation))
        .map((ps) => ps.service_id),
    );
    let pool = props.services;
    if (included.length > 0) {
      const allowed = new Set([...included, ...optional].map((ps) => ps.service_id));
      pool = pool.filter((s) => allowed.has(s.id));
    }
    return pool.filter(
      (s) => !excluded.has(s.id) && isServiceEligible(s, { forChild }),
    );
  }, [props.services, props.planServices, sub.planId, forChild]);

  const service = eligibleServices.find((s) => s.id === serviceId) ?? null;
  const selectedExtras = props.extras.filter((e) => addonIds.includes(e.id));
  const duration = service
    ? totalDuration(service.estimated_duration_minutes, selectedExtras)
    : 60;
  const extraTotal = addonTotal(selectedExtras);
  const needsPrepay = selectedExtras.some(
    (e) => e.payment_requirement === "pay_before_confirmation",
  );

  const eligibleExtras = useMemo(
    () =>
      props.extras.filter((e) =>
        isExtraServiceEligible(e, {
          planId: sub.planId,
          categoryId: sub.categoryId,
          startsAt: time ? new Date(time) : undefined,
        }),
      ),
    [props.extras, sub.planId, sub.categoryId, time],
  );

  const recommendedIds = useMemo(() => {
    const recos = resolveRecommendations(props.rules, {
      context: "booking",
      planId: sub.planId,
      serviceId: serviceId ?? undefined,
      categoryId: sub.categoryId,
    });
    const map = new Map<string, string | null>();
    recos
      .filter((r) => r.item_type === "extra_service")
      .forEach((r) => map.set(r.item_id, r.badge_label));
    return map;
  }, [props.rules, sub.planId, sub.categoryId, serviceId]);

  // Date bounds. Captured once per mount — precise enough for min/max attrs;
  // the server re-validates notice and window on submission.
  const [now] = useState(() => new Date());
  const minDate = useMemo(() => {
    const d = new Date(now.getTime() + props.scheduling.minNoticeHours * 3_600_000);
    return d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  }, [now, props.scheduling.minNoticeHours]);
  const maxDate = useMemo(() => {
    const d = new Date(now.getTime() + props.scheduling.maxAdvanceDays * 86_400_000);
    const cap = new Date(sub.cycleEndsOn + "T00:00:00");
    cap.setDate(cap.getDate() - 1); // cycle end is exclusive
    const capped = d < cap ? d : cap;
    return capped.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  }, [now, props.scheduling.maxAdvanceDays, sub.cycleEndsOn]);

  const dateProblem = useMemo(() => {
    if (!date) return null;
    const dow = new Date(date + "T12:00:00").getDay();
    const bh = props.salonHours.find(
      (h) => h.salon_id === salonId && h.day_of_week === dow);
    if (bh && !bh.is_open) return "This salon is closed on this day.";
    if (!sub.availableDays.includes(dow))
      return "Your membership does not include visits on this day.";
    const clash = intervalConflict(sub.liveVisitDates, date, sub.intervalDays);
    if (clash) {
      return `Visits must be at least ${sub.intervalDays} days apart — you already have a visit on ${clash}.`;
    }
    if (date >= sub.cycleEndsOn)
      return "This date falls after your membership cycle ends.";
    return null;
  }, [date, props.salonHours, salonId, sub]);

  // Load slots when the chosen date/duration are valid. All setState happens
  // in async continuations (never synchronously in the effect body).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!date || dateProblem) {
        if (!cancelled) setSlots([]);
        return;
      }
      if (!cancelled) setSlotsLoading(true);
      try {
        const r = await fetch(
          `/api/slots?date=${date}&salon=${salonId}&duration=${duration}`,
        );
        const json = await r.json();
        if (!cancelled) setSlots(json.slots ?? []);
      } catch {
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [date, salonId, duration, dateProblem]);

  const canNext = [
    sub.remaining > 0,
    salonId !== "",
    serviceId !== null,
    time !== null && !dateProblem,
    true,
    false,
  ][step];

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await bookAppointment({
        subscription_id: sub.id,
        service_id: serviceId!,
        starts_at: time!,
        salon_id: salonId,
        child_id: sub.childId,
        extra_service_ids: addonIds,
        notes,
      });
      if (result.error) setError(result.error);
      else router.push(`/app/appointments/${result.appointmentId}?booked=1`);
    });

  return (
    <div className="grid gap-4 pb-24">
      {/* progress */}
      <ol className="flex gap-1.5" aria-label="Reservation steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-600" : "bg-brand-100"}`}
            title={label}
          />
        ))}
      </ol>
      <p className="text-sm font-semibold text-ink-soft">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      {/* STEP 0: who & plan */}
      {step === 0 && (
        <div className="grid gap-3">
          {props.subscriptions.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSubscription(s.id)}
              className={`rounded-2xl border p-4 text-left ${s.id === subId ? "border-brand-600 bg-brand-50" : "border-line bg-white"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">
                  {s.childName ? `${s.childName}` : "Myself"}
                  <span className="text-ink-soft"> · {s.planName} membership</span>
                </p>
                <Badge tone={s.remaining > 0 ? "green" : "red"}>
                  {s.remaining} visit{s.remaining !== 1 ? "s" : ""} left
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{s.categoryName}</p>
            </button>
          ))}
          {sub.remaining === 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No visits remaining on this membership this cycle. Unused visits
              reset with your next cycle.
            </p>
          )}
        </div>
      )}

      {/* STEP 1: salon — visits are valid at every open salon */}
      {step === 1 && (
        <div className="grid gap-3">
          {props.salons.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSalonId(s.id);
                setTime(null);
              }}
              className={`rounded-2xl border p-4 text-left ${salonId === s.id ? "border-brand-600 bg-brand-50" : "border-line bg-white"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{s.name}</p>
                {s.id === props.homeSalonId && <Badge tone="gold">Home salon</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{s.city} · {s.address}</p>
            </button>
          ))}
          {props.salons.length === 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No salon is currently open for reservations.
            </p>
          )}
        </div>
      )}

      {/* STEP 2: service */}
      {step === 2 && (
        <div className="grid gap-3">
          {eligibleServices.map((s) => (
            <button
              key={s.id}
              onClick={() => setServiceId(s.id)}
              className={`rounded-2xl border p-4 text-left ${serviceId === s.id ? "border-brand-600 bg-brand-50" : "border-line bg-white"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{s.name}</p>
                <Badge tone="green">Included</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {s.description} · {formatDuration(s.estimated_duration_minutes)}
              </p>
            </button>
          ))}
          {eligibleServices.length === 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No services available for this plan.
            </p>
          )}
        </div>
      )}

      {/* STEP 3: date & time */}
      {step === 3 && (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="date" className="text-sm font-medium text-ink-soft">
              Choose a date
            </label>
            <input
              id="date"
              type="date"
              className={inputClass}
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime(null);
              }}
            />
            {dateProblem && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {dateProblem}
              </p>
            )}
          </div>
          {date && !dateProblem && (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">
                Available times{slotsLoading ? " (loading…)" : ""}
              </p>
              {!slotsLoading && slots.length === 0 && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No available times on this date — try another day.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s.startsAt}
                    onClick={() => setTime(s.startsAt)}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${time === s.startsAt ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white"}`}
                  >
                    {formatTime(s.startsAt)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: ENHANCE YOUR VISIT */}
      {step === 4 && (
        <div className="grid gap-3">
          <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-4 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gold-300">
              Enhance your visit
            </p>
            <p className="mt-1 text-sm text-white/85">
              Add extra services to your visit — each has an additional
              fee, payable per its terms.
            </p>
          </div>
          {eligibleExtras.map((e) => {
            const selected = addonIds.includes(e.id);
            const badge = recommendedIds.get(e.id);
            return (
              <button
                key={e.id}
                onClick={() =>
                  setAddonIds((ids) =>
                    selected ? ids.filter((i) => i !== e.id) : [...ids, e.id],
                  )
                }
                className={`rounded-2xl border p-4 text-left ${selected ? "border-brand-600 bg-brand-50" : "border-line bg-white"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {e.name}
                      {badge && (
                        <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-700">
                          {badge}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{e.short_description}</p>
                    <p className="mt-1 text-sm">
                      <span className="font-bold text-brand-700">{formatNaira(e.price_kobo)}</span>
                      <span className="text-ink-soft"> · +{formatDuration(e.estimated_duration_minutes)}</span>
                      {e.payment_requirement === "pay_before_confirmation" && (
                        <span className="text-amber-700"> · pay before confirmation</span>
                      )}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-bold ${selected ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-soft"}`}
                  >
                    {selected ? "✓" : "+"}
                  </span>
                </div>
              </button>
            );
          })}
          {eligibleExtras.length === 0 && (
            <p className="text-sm text-ink-soft">
              No extra services are available for this visit.
            </p>
          )}
        </div>
      )}

      {/* STEP 5: review */}
      {step === 5 && service && time && (
        <div className="grid gap-4">
          {/* v3 §5.6 — non-blocking forward-looking guard */}
          {date &&
            visitsAtRisk({
              visitDate: date,
              cycleEndsOn: sub.cycleEndsOn,
              intervalDays: sub.intervalDays,
              remainingAfterThis: sub.remaining - 1,
            }) > 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                Heads up: with visits at least {sub.intervalDays} days apart,
                {" "}{visitsAtRisk({
                  visitDate: date,
                  cycleEndsOn: sub.cycleEndsOn,
                  intervalDays: sub.intervalDays,
                  remainingAfterThis: sub.remaining - 1,
                })}{" "}
                of your remaining visits may not fit before your cycle ends.
                You can still reserve this time — or pick an earlier date to
                use everything you&apos;ve paid for.
              </p>
            )}
          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="font-display text-lg text-brand-900">Visit summary</p>
            <dl className="mt-3 grid gap-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">For</dt>
                <dd className="font-semibold">{sub.childName ?? "Myself"} · {sub.planName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Where</dt>
                <dd className="text-right font-semibold">
                  {props.salons.find((s) => s.id === salonId)?.name ?? "Salon"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">When</dt>
                <dd className="text-right font-semibold">
                  {new Date(time).toLocaleDateString("en-NG", {
                    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short",
                  })}{" "}
                  · {formatTime(time)}
                </dd>
              </div>
              <div className="my-1 border-t border-line" />
              <div className="flex justify-between">
                <dt>Membership visit — {service.name}</dt>
                <dd className="font-bold text-emerald-700">Included</dd>
              </div>
              {selectedExtras.map((e) => (
                <div key={e.id} className="flex justify-between">
                  <dt>{e.name}</dt>
                  <dd className="font-semibold">{formatNaira(e.price_kobo)}</dd>
                </div>
              ))}
              {selectedExtras.length > 0 && (
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="font-semibold">Total extra services</dt>
                  <dd className="font-bold text-brand-700">{formatNaira(extraTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-soft">Estimated visit duration</dt>
                <dd className="font-semibold">{formatDuration(duration)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Payment status</dt>
                <dd className="text-right font-semibold">
                  {selectedExtras.length === 0
                    ? "Nothing to pay — visit included"
                    : needsPrepay
                      ? "Add-on payment required before confirmation"
                      : "Add-ons payable at the salon"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="notes" className="text-sm font-medium text-ink-soft">
              Notes for the salon (optional)
            </label>
            <textarea
              id="notes"
              rows={2}
              maxLength={500}
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the stylist should know"
            />
          </div>
          <p className="text-xs text-ink-soft">
            Your stylist is assigned by the salon and revealed at check-in. This
            reserves one membership visit — it is only used after your visit
            is completed.
          </p>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {/* nav buttons */}
      <div className="fixed inset-x-0 bottom-14 z-10 border-t border-line bg-white/95 p-3 backdrop-blur lg:bottom-0">
        <div className="mx-auto flex max-w-3xl gap-2">
          {step > 0 && (
            <button
              className={buttonClass("outline", "flex-1")}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              className={buttonClass("primary", "flex-[2]")}
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          ) : (
            <button
              className={buttonClass("primary", "flex-[2]")}
              disabled={pending}
              onClick={submit}
            >
              {pending ? "Reserving…" : "Reserve Visit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
