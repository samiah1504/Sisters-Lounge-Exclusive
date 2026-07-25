import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { saveSavedReply } from "@/server/actions/operations";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Saved Replies" };
export const dynamic = "force-dynamic";

export default async function SavedRepliesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: replies } = await supabase
    .from("support_saved_replies").select("*").order("display_order");

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Saved Replies</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Reusable answers the team can insert into any conversation.
        </p>
      </div>
      <div className="grid gap-3">
        {(replies ?? []).map((r) => (
          <Card key={r.id}>
            <details>
              <summary className="cursor-pointer font-semibold">{r.title}</summary>
              <div className="mt-3">
                <ActionForm action={saveSavedReply.bind(null, r.id)} submitLabel="Save reply">
                  <Field label="Title" htmlFor={`t-${r.id}`}>
                    <input id={`t-${r.id}`} name="title" defaultValue={r.title} className={inputClass} />
                  </Field>
                  <Field label="Body" htmlFor={`b-${r.id}`}>
                    <textarea id={`b-${r.id}`} name="body" rows={4} defaultValue={r.body} className={inputClass} />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </div>
      <Card>
        <p className="mb-3 font-semibold">New saved reply</p>
        <ActionForm action={saveSavedReply.bind(null, null)} submitLabel="Create reply">
          <Field label="Title" htmlFor="new-title">
            <input id="new-title" name="title" required className={inputClass} />
          </Field>
          <Field label="Body" htmlFor="new-body">
            <textarea id="new-body" name="body" rows={4} required className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
