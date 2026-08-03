import Link from "next/link";
import { requireCustomer } from "@/server/auth";
import { BottomNav } from "@/components/bottom-nav";
import { Onboarding } from "@/components/onboarding";
import { signOut } from "@/server/actions/auth";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCustomer();
  const firstName = session.profile.full_name.split(" ")[0] || "there";

  return (
    <div className="min-h-dvh bg-cream pb-20 lg:pb-8">
      <header className="sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/app" className="font-display text-[17px] font-bold text-ink">
            <span className="mr-1 text-gold-600">✦</span>
            Sisters Lounge <em className="not-italic text-brand-600">Exclusive</em>
          </Link>
          <div className="hidden items-center gap-4 text-sm lg:flex">
            <Link href="/app" className="text-ink-soft hover:text-brand-600">Dashboard</Link>
            <Link href="/app/book" className="text-ink-soft hover:text-brand-600">Reserve Visit</Link>
            <Link href="/app/appointments" className="text-ink-soft hover:text-brand-600">My Visits</Link>
            <Link href="/app/children" className="text-ink-soft hover:text-brand-600">My Children</Link>
            <Link href="/app/products" className="text-ink-soft hover:text-brand-600">Shop</Link>
            <Link href="/app/support" className="text-ink-soft hover:text-brand-600">Chat with Us</Link>
            <Link href="/app/profile" className="text-ink-soft hover:text-brand-600">Profile</Link>
          </div>
          <form action={signOut}>
            <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-5" data-greeting={firstName}>
        {children}
      </main>
      <BottomNav />
      <Onboarding />
    </div>
  );
}
