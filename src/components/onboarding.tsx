"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

/**
 * Members' club onboarding (v3 §3.2): four swipeable screens, skippable,
 * shown once (localStorage), replayable from Profile → "Replay the intro".
 */

const SEEN_KEY = "sl.onboarding.seen";
const REPLAY_EVENT = "sl:replay-intro";

const SLIDES: Array<{ title: string; body: string; art: string }> = [
  {
    title: "Healthy Natural Hair Without the Stress",
    body: "Professional care designed for natural hair — on a consistent monthly routine that actually works.",
    art: "✦",
  },
  {
    title: "Members Only",
    body: "No walk-ins. No overcrowding. Every chair is reserved for a member, so your visit is calm and on time.",
    art: "❀",
  },
  {
    title: "Visit Any Salon",
    body: "Use your membership across Sisters Lounge Salons nationwide — reserve wherever suits you.",
    art: "◈",
  },
  {
    title: "Track Your Hair Journey",
    body: "Build healthier hair with professional guidance, visit tracking and progress you can see.",
    art: "✧",
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
      } catch {
        // storage unavailable — skip onboarding rather than block
      }
    });
    const onReplay = () => {
      setSlide(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener(REPLAY_EVENT, onReplay);
    };
  }, []);

  if (!open) return null;

  const finish = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // non-fatal
    }
    setOpen(false);
  };

  const last = slide === SLIDES.length - 1;
  const s = SLIDES[slide];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sisters Lounge"
      className="fixed inset-0 z-50 grid place-items-center bg-brand-900/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div
          className="grid gap-4 p-6 pt-8 text-center"
          onTouchStart={(e) => {
            (e.currentTarget as HTMLElement).dataset.x = String(e.touches[0].clientX);
          }}
          onTouchEnd={(e) => {
            const startX = Number((e.currentTarget as HTMLElement).dataset.x ?? 0);
            const dx = e.changedTouches[0].clientX - startX;
            if (dx < -40 && !last) setSlide((v) => v + 1);
            if (dx > 40 && slide > 0) setSlide((v) => v - 1);
          }}
        >
          <span
            aria-hidden
            className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-100 to-gold-100 font-display text-4xl text-brand-600"
          >
            {s.art}
          </span>
          <h2 className="font-display text-2xl text-brand-900">{s.title}</h2>
          <p className="text-[15px] text-ink-soft">{s.body}</p>

          {/* dots */}
          <div className="mt-1 flex justify-center gap-1.5" aria-hidden>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`h-2 rounded-full transition-all ${i === slide ? "w-6 bg-brand-600" : "w-2 bg-brand-100"}`}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-line p-4">
          <button onClick={finish} className={buttonClass("ghost", "flex-1")}>
            Skip
          </button>
          <button
            onClick={() => (last ? finish() : setSlide((v) => v + 1))}
            className={buttonClass("primary", "flex-[2]")}
          >
            {last ? "Let's go" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small trigger used on the Profile page (v3 §3.2: replayable from settings). */
export function ReplayIntroButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event(REPLAY_EVENT))}
      className="text-sm font-semibold text-brand-600 hover:underline"
    >
      Replay the welcome intro
    </button>
  );
}
