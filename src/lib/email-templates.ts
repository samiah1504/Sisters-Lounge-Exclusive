/**
 * Transactional email templates (payments spec §8). Pure functions — no I/O —
 * so content rules are unit-testable. Passwords are NEVER included in any
 * email: members set their password during checkout.
 */

export interface EmailContent {
  subject: string;
  html: string;
}

const BRAND = "#7c3f58";
const GOLD = "#b8860b";

function shell(title: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f2;font-family:Arial,Helvetica,sans-serif;color:#2a2320;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <p style="font-size:18px;font-weight:bold;color:${BRAND};margin:0 0 16px;">
        &#10022; Sisters Lounge
      </p>
      <div style="background:#ffffff;border:1px solid #eadfd6;border-radius:12px;padding:24px;">
        <h1 style="font-size:22px;color:${BRAND};margin:0 0 12px;">${title}</h1>
        ${bodyHtml}
        <a href="${ctaUrl}"
           style="display:inline-block;margin-top:20px;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;">
          ${ctaLabel}
        </a>
      </div>
      <p style="font-size:12px;color:#8a7d72;margin:16px 4px;">
        A Subscription-Based Salon for Natural Hair Care. You are receiving
        this email about your Sisters Lounge membership.
      </p>
    </div>
  </body>
</html>`;
}

const row = (label: string, value: string) =>
  `<tr>
    <td style="padding:6px 12px 6px 0;color:#8a7d72;font-size:14px;white-space:nowrap;">${label}</td>
    <td style="padding:6px 0;font-size:14px;font-weight:bold;">${value}</td>
  </tr>`;

/** Welcome email after webhook-confirmed activation (payments spec §8). */
export function welcomeEmail(args: {
  memberName: string;
  planName: string;
  salonName: string;
  visitsIncluded: number;
  startDate: string;
  siteUrl: string;
}): EmailContent {
  const firstName = args.memberName.trim().split(/\s+/)[0] || "Sister";
  return {
    subject: "Welcome to Sisters Lounge — your membership is active",
    html: shell(
      "Welcome to Sisters Lounge",
      `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
         Assalamu alaikum ${firstName} — your membership is now active.
       </p>
       <table style="border-collapse:collapse;">
         ${row("Membership", args.planName)}
         ${row("Salon", args.salonName)}
         ${row("Visits this cycle", String(args.visitsIncluded))}
         ${row("Membership start", args.startDate)}
       </table>
       <p style="font-size:15px;line-height:1.6;margin:14px 0 0;color:${GOLD};font-weight:bold;">
         Your Sisters Lounge experience starts now.
       </p>
       <p style="font-size:14px;line-height:1.6;margin:8px 0 0;color:#5b5049;">
         Sign in with the email and password you created at checkout to
         reserve your first visit.
       </p>`,
      `${args.siteUrl}/app`,
      "Access Your Account",
    ),
  };
}

/** Failed recurring payment notice (payments spec §11). */
export function paymentFailedEmail(args: {
  memberName: string;
  planName: string;
  siteUrl: string;
}): EmailContent {
  const firstName = args.memberName.trim().split(/\s+/)[0] || "Sister";
  return {
    subject: "Sisters Lounge — we could not renew your membership",
    html: shell(
      "Your renewal payment did not go through",
      `<p style="font-size:15px;line-height:1.6;margin:0 0 10px;">
         Assalamu alaikum ${firstName} — the renewal payment for your
         <strong>${args.planName}</strong> membership was not successful.
       </p>
       <p style="font-size:15px;line-height:1.6;margin:0 0 10px;">
         No visits have been lost. The payment will be retried automatically —
         you can also update your card or settle the payment from your
         dashboard, and your membership continues the moment it succeeds.
       </p>`,
      `${args.siteUrl}/app/subscription`,
      "Fix My Payment",
    ),
  };
}
