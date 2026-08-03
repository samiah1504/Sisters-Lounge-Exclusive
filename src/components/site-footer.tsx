export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-1 px-4 text-sm text-ink-soft sm:flex sm:justify-between">
        <p>© {new Date().getFullYear()} Sisters Lounge. All rights reserved.</p>
        <p className="text-gold-600">
          Nigeria&apos;s First Members-Only Natural Hair Club.
        </p>
      </div>
    </footer>
  );
}
