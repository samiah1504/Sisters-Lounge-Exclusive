"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendCustomerMessage,
  sendStaffMessage,
} from "@/server/actions/operations";
import { formatDateTime } from "@/lib/format";
import { buttonClass, inputClass } from "@/components/ui";

export interface ChatMessage {
  id: string;
  sender_type: "customer" | "staff";
  sender_name: string;
  body: string;
  is_internal_note: boolean;
  created_at: string;
}

/** Message list + composer. Polls for new messages every 15s. */
export function ChatThread({
  conversationId,
  messages,
  viewer,
  closed,
  savedReplies = [],
}: {
  conversationId: string;
  messages: ChatMessage[];
  viewer: "customer" | "staff";
  closed: boolean;
  savedReplies?: Array<{ title: string; body: string }>;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [router]);

  const send = () => {
    const text = body.trim();
    if (!text || pending) return; // double-submit guard
    startTransition(async () => {
      setError(null);
      const r = viewer === "customer"
        ? await sendCustomerMessage(conversationId, text)
        : await sendStaffMessage(conversationId, text, internal);
      if (r.error) setError(r.error);
      else {
        setBody("");
        setInternal(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex min-h-[50dvh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {messages.map((m) => {
          const mine =
            (viewer === "customer" && m.sender_type === "customer") ||
            (viewer === "staff" && m.sender_type === "staff");
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] shadow-sm ${
                  m.is_internal_note
                    ? "border border-dashed border-gold-400 bg-gold-100/60"
                    : mine
                      ? "bg-brand-600 text-white"
                      : "border border-line bg-white"
                }`}
              >
                {m.is_internal_note && (
                  <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-700">
                    Internal note — hidden from customer
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[11px] ${mine && !m.is_internal_note ? "text-white/70" : "text-ink-soft"}`}>
                  {m.sender_name} · {formatDateTime(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closed && viewer === "customer" ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm text-ink-soft">
          This conversation is closed. Start a new one if you need more help.
        </p>
      ) : (
        <div className="sticky bottom-0 grid gap-2 border-t border-line bg-cream pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
          {viewer === "staff" && savedReplies.length > 0 && (
            <select
              className={inputClass}
              value=""
              onChange={(e) => {
                const r = savedReplies.find((x) => x.title === e.target.value);
                if (r) setBody((b) => (b ? b + "\n\n" : "") + r.body);
              }}
            >
              <option value="">Insert a saved reply…</option>
              {savedReplies.map((r) => (
                <option key={r.title} value={r.title}>{r.title}</option>
              ))}
            </select>
          )}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              className={`${inputClass} flex-1 resize-none`}
              placeholder={internal ? "Internal note (customer will never see this)…" : "Write a message…"}
              value={body}
              maxLength={5000}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className={buttonClass("primary")} disabled={pending || !body.trim()} onClick={send}>
              {pending ? "…" : "Send"}
            </button>
          </div>
          {viewer === "staff" && (
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={internal} className="h-4 w-4 accent-gold-600"
                onChange={(e) => setInternal(e.target.checked)} />
              Internal note (staff only)
            </label>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
