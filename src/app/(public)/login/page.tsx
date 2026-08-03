import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="heading-rule font-display text-2xl text-ink">Welcome back</h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">
        Sign in to manage your membership, reserve visits and track your hair care.
      </p>
      <LoginForm next={next} />
    </div>
  );
}
