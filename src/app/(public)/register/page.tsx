import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="heading-rule font-display text-2xl text-ink">
        Join Sisters Lounge Exclusive
      </h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">
        Create your account to choose a plan, manage your family&apos;s hair care
        and book salon visits.
      </p>
      <RegisterForm />
    </div>
  );
}
