import type { Metadata } from "next";
import { requireCustomer } from "@/server/auth";
import { startConversation } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "New Conversation" };

const TOPICS = [
  ["subscription", "My subscription"],
  ["booking", "A booking or appointment"],
  ["extra_services", "Extra services"],
  ["products", "Products"],
  ["consultation", "Consultations"],
  ["payment", "Payment"],
  ["child_subscription", "My child's subscription"],
  ["home_service", "Home service"],
  ["complaint", "A complaint"],
  ["feedback", "Feedback"],
  ["general", "Something else"],
];

export default async function NewConversationPage() {
  await requireCustomer();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">
          Start a Conversation
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Tell us what you need help with — your Salon Manager will reply
          during salon hours.
        </p>
      </div>
      <ActionForm action={startConversation} submitLabel="Send message">
        <Field label="What is this about?" htmlFor="topic">
          <select id="topic" name="topic" className={inputClass} defaultValue="general">
            {TOPICS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </Field>
        <Field label="Subject" htmlFor="subject">
          <input id="subject" name="subject" required minLength={3} maxLength={200}
            placeholder="e.g. Moving my Saturday appointment" className={inputClass} />
        </Field>
        <Field label="Your message" htmlFor="body">
          <textarea id="body" name="body" rows={4} required maxLength={5000}
            className={inputClass} placeholder="Assalamu alaikum…" />
        </Field>
      </ActionForm>
    </div>
  );
}
