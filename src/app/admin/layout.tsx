import Link from "next/link";
import { requireAdmin } from "@/server/auth";
import { signOut } from "@/server/actions/auth";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="min-h-dvh bg-cream">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="font-display text-[17px] font-bold text-ink">
            <span className="mr-1 text-gold-600">✦</span>
            Sisters Lounge <span className="text-brand-600">Admin</span>
          </Link>
          <form action={signOut}>
            <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600">
              Sign out
            </button>
          </form>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
