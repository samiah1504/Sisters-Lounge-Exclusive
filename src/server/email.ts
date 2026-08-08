import "server-only";
import type { EmailContent } from "@/lib/email-templates";

/**
 * Resend transactional email (payments spec §8, owner decision 2).
 * Deliberately degradable: without RESEND_API_KEY every send is a silent
 * no-op, so the platform runs fully while the sending domain is pending
 * verification. Senders must never throw — activation and webhooks cannot
 * be allowed to fail because an email could not be delivered.
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  // Set EMAIL_FROM once your domain is verified in Resend,
  // e.g. "Sisters Lounge <hello@sisterslounge.ng>".
  return process.env.EMAIL_FROM ?? "Sisters Lounge <onboarding@resend.dev>";
}

export async function sendEmail(
  to: string,
  content: EmailContent,
): Promise<boolean> {
  if (!emailConfigured() || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: content.subject,
        html: content.html,
      }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
