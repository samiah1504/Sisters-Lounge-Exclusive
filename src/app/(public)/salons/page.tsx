import type { Metadata } from "next";
import { getPublicSalonHours, getPublicSalons } from "@/server/catalogue";
import { joinCityWaitlist } from "@/server/actions/public";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import type { Row } from "@/lib/db-rows";

export const metadata: Metadata = { title: "Sisters Lounge Salons" };
export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SalonsPage() {
  const [salons, hours] = await Promise.all([
    getPublicSalons(),
    getPublicSalonHours(),
  ]);
  const all = salons as unknown as Row[];
  const open = all.filter((s) => s.status === "open");
  const comingSoon = all.filter((s) => s.status !== "open");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="heading-rule font-display text-3xl text-ink">
        Sisters Lounge Salons
      </h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Company-owned mini studios across Nigeria — one brand, one standard of
        care. Your membership is valid at every open salon, and each new city
        opens with its waitlist members first in line.
      </p>

      {/* ------------------------------------------------------ open salons */}
      <h2 className="mt-10 font-display text-xl text-ink">Open now</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {open.map((s) => {
          const sh = (hours as Row[]).filter((h) => h.salon_id === s.id);
          const openDays = sh.filter((h) => h.is_open);
          const mapsUrl =
            s.latitude != null && s.longitude != null
              ? `https://maps.google.com/?q=${s.latitude},${s.longitude}`
              : `https://maps.google.com/?q=${encodeURIComponent(`${s.name}, ${s.address}`)}`;
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg text-brand-900">{s.name}</h3>
                  <p className="text-sm text-ink-soft">{s.address} · {s.city}, {s.state}</p>
                </div>
                <Badge tone="green">Open</Badge>
              </div>
              {openDays.length > 0 && (
                <p className="mt-2 text-sm text-ink-soft">
                  {DAYS[openDays[0].day_of_week]}–{DAYS[openDays[openDays.length - 1].day_of_week]}
                  {" · "}
                  {String(openDays[0].open_time).slice(0, 5)}–{String(openDays[0].close_time).slice(0, 5)}
                  {sh.some((h) => !h.is_open) &&
                    ` · closed ${sh.filter((h) => !h.is_open).map((h) => DAYS[h.day_of_week]).join(", ")}`}
                </p>
              )}
              <p className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                {s.phone && (
                  <a className="text-brand-600 hover:underline" href={`tel:${s.phone}`}>
                    Call
                  </a>
                )}
                {s.whatsapp && (
                  <a className="text-brand-600 hover:underline"
                    href={`https://wa.me/${String(s.whatsapp).replace(/\D/g, "")}`}>
                    WhatsApp
                  </a>
                )}
                <a className="text-brand-600 hover:underline" href={mapsUrl}
                  target="_blank" rel="noreferrer">
                  Map
                </a>
              </p>
            </Card>
          );
        })}
        {open.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line bg-brand-50 p-6 text-sm text-ink-soft">
            Salon details are being prepared — check back shortly.
          </p>
        )}
      </div>

      {/* ------------------------------------------------ coming-soon cities */}
      <h2 className="mt-12 font-display text-xl text-ink">Coming soon</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        Want Sisters Lounge in your city? Join the waitlist — new salons launch
        with members already committed, and waitlist members join first.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {comingSoon.map((s) => (
          <Card key={s.id} className="border-gold-300/60">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg text-brand-900">{s.city}</h3>
                <p className="text-sm text-ink-soft">{s.name}</p>
              </div>
              <Badge tone="gold">Coming soon</Badge>
            </div>
            <div className="mt-3">
              <ActionForm action={joinCityWaitlist} submitLabel={`Join the ${s.city} waitlist`}>
                <input type="hidden" name="city" value={s.city} />
                <input type="hidden" name="salon_id" value={s.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Your name" htmlFor={`wl-name-${s.id}`}>
                    <input id={`wl-name-${s.id}`} name="full_name" className={inputClass} />
                  </Field>
                  <Field label="WhatsApp number or email" htmlFor={`wl-contact-${s.id}`}>
                    <input id={`wl-contact-${s.id}`} name="contact" required
                      placeholder="+234… or you@email.com" className={inputClass} />
                  </Field>
                </div>
              </ActionForm>
            </div>
          </Card>
        ))}

        {/* Any other city */}
        <Card className="border-dashed">
          <h3 className="font-display text-lg text-brand-900">Another city?</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Tell us where you are — enough interest is exactly how we choose
            the next city.
          </p>
          <div className="mt-3">
            <ActionForm action={joinCityWaitlist} submitLabel="Request my city">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="City" htmlFor="wl-city">
                  <input id="wl-city" name="city" required className={inputClass} />
                </Field>
                <Field label="Your name" htmlFor="wl-any-name">
                  <input id="wl-any-name" name="full_name" className={inputClass} />
                </Field>
                <Field label="WhatsApp or email" htmlFor="wl-any-contact">
                  <input id="wl-any-contact" name="contact" required
                    placeholder="+234… or you@email.com" className={inputClass} />
                </Field>
              </div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </div>
  );
}
