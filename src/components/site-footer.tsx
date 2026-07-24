export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-1 px-4 text-sm text-ink-soft sm:flex sm:justify-between">
        <p>© {new Date().getFullYear()} Sisters Lounge · Ilorin. All rights reserved.</p>
        <p className="text-gold-600">
          Salon subscriptions, booking &amp; hair care.
        </p>
      </div>
    </footer>
  );
}
