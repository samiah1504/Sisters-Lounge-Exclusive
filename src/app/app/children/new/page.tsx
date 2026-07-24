import type { Metadata } from "next";
import { ChildForm } from "@/components/child-form";

export const metadata: Metadata = { title: "Add Child" };

export default function NewChildPage() {
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">Add a Child</h1>
        <p className="mt-2 text-sm text-ink-soft">
          These details help stylists give your child safe, comfortable care.
        </p>
      </div>
      <ChildForm child={null} />
    </div>
  );
}
