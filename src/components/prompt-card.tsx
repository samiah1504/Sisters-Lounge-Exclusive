"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { RetentionPrompt } from "@/lib/types";
import { dismissPrompt } from "@/server/actions/customer";

const toneClasses: Record<RetentionPrompt["prompt_type"], string> = {
  info: "border-line bg-white",
  action_required: "border-gold-300 bg-gold-100/40",
  urgent: "border-red-200 bg-red-50",
  success: "border-emerald-200 bg-emerald-50",
  re_engagement: "border-brand-200 bg-brand-50",
};

export function PromptCard({ prompt }: { prompt: RetentionPrompt }) {
  const [pending, startTransition] = useTransition();
  return (
    <div
      className={`rounded-2xl border p-4 shadow-card ${toneClasses[prompt.prompt_type]} ${pending ? "opacity-50" : ""}`}
      role={prompt.prompt_type === "urgent" ? "alert" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-ink">{prompt.title}</p>
        {prompt.dismissible && (
          <button
            aria-label="Dismiss"
            className="-m-1 rounded-full p-1 text-ink-soft hover:text-ink"
            onClick={() => startTransition(() => dismissPrompt(prompt.id))}
          >
            ✕
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-soft">{prompt.message}</p>
      {prompt.action_url && prompt.action_label && (
        <Link
          href={prompt.action_url}
          className="mt-2 inline-block text-sm font-bold text-brand-600 underline-offset-2 hover:underline"
        >
          {prompt.action_label} →
        </Link>
      )}
    </div>
  );
}
