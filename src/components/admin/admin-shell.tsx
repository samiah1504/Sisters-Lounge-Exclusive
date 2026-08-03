"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  BarChart3, Bell, Boxes, CalendarClock, CalendarDays, CalendarX2,
  ChevronDown, ChevronsLeft, ChevronsRight, ClipboardList, Crown, Gauge,
  HeartHandshake, Hourglass, Baby, LayoutDashboard, Layers, LifeBuoy,
  ListChecks, LogOut, Megaphone, Menu, MessageSquareHeart, MessagesSquare,
  PackageOpen, Plug, Receipt, Scissors, ScrollText, Settings2, ShieldCheck,
  ShoppingBag, Sparkles, Tags, TrendingUp, Truck, UserCog, UserRound,
  Users, Wand2, Wrench, X, Clock,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;      // absent => "Coming soon"
  canonical?: boolean; // false => never highlighted (alias/deep link)
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: LayoutDashboard, href: "/admin" }],
  },
  {
    label: "Members",
    items: [
      { label: "Members", icon: UserRound, href: "/admin/customers" },
      { label: "Child Profiles", icon: Baby },
      { label: "Active Members", icon: ListChecks, href: "/admin/customers?filter=active-sub", canonical: false },
      { label: "Retention", icon: HeartHandshake, href: "/admin/retention" },
    ],
  },
  {
    label: "Visits",
    items: [
      { label: "Reserved Visits", icon: CalendarDays, href: "/admin/bookings" },
      { label: "Calendar", icon: CalendarClock },
      { label: "Scheduling Settings", icon: Settings2, href: "/admin/settings" },
      { label: "Blackout Dates", icon: CalendarX2, href: "/admin/settings#blackout-dates", canonical: false },
    ],
  },
  {
    label: "Memberships",
    items: [
      { label: "Membership Plans", icon: Crown, href: "/admin/plans" },
      { label: "Categories", icon: Layers, href: "/admin/categories" },
      { label: "Active Memberships", icon: ListChecks, href: "/admin/customers?filter=active-sub", canonical: false },
      { label: "Pending Selections", icon: Hourglass, href: "/admin/retention?view=pending-selection", canonical: false },
    ],
  },
  {
    label: "Services",
    items: [
      { label: "Salon Services", icon: Scissors, href: "/admin/services" },
      { label: "Extra Services", icon: Sparkles, href: "/admin/extra-services" },
      { label: "Expert Consultations", icon: MessageSquareHeart, href: "/admin/consultations" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Products", icon: ShoppingBag, href: "/admin/products" },
      { label: "Orders", icon: PackageOpen },
      { label: "Upselling", icon: TrendingUp, href: "/admin/upsell" },
      { label: "Recommendations", icon: Wand2, href: "/admin/recommendations" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Operations Dashboard", icon: Gauge, href: "/admin/operations" },
      { label: "Capacity", icon: Users, href: "/admin/capacity" },
      { label: "Inventory", icon: Boxes, href: "/admin/inventory" },
      { label: "Stock Counts", icon: ClipboardList, href: "/admin/inventory/counts", canonical: false },
      { label: "Suppliers", icon: Truck, href: "/admin/suppliers" },
      { label: "Equipment", icon: Wrench, href: "/admin/equipment" },
      { label: "Expenses", icon: Receipt, href: "/admin/expenses" },
    ],
  },
  {
    label: "Customer Support",
    items: [
      { label: "Conversations", icon: LifeBuoy, href: "/admin/support" },
      { label: "Saved Replies", icon: MessagesSquare, href: "/admin/support/replies", canonical: false },
    ],
  },
  {
    label: "Staff",
    items: [
      { label: "Staff & Stylists", icon: UserCog, href: "/admin/staff" },
      { label: "Availability", icon: Clock },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Notifications", icon: Bell },
      { label: "Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", icon: BarChart3 },
      { label: "Audit Logs", icon: ScrollText },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Business Settings", icon: Settings2, href: "/admin/settings", canonical: false },
      { label: "Inventory Settings", icon: Boxes, href: "/admin/inventory/settings", canonical: false },
      { label: "Expense Categories", icon: Tags, href: "/admin/expenses/categories", canonical: false },
      { label: "Integrations", icon: Plug },
      { label: "Roles & Permissions", icon: ShieldCheck },
    ],
  },
];

const STORAGE_KEY = "sl.admin.sidebar";

function isActive(item: NavItem, pathname: string): boolean {
  if (!item.href || item.canonical === false) return false;
  const path = item.href.split(/[?#]/)[0];
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(path + "/");
}

/** Group label + item label for the current route (for breadcrumbs). */
function findActive(pathname: string): { group: string; item: string } | null {
  for (const group of NAV) {
    for (const item of group.items) {
      if (isActive(item, pathname)) return { group: group.label, item: item.label };
    }
  }
  return null;
}

export function AdminShell({
  user,
  signOut,
  children,
}: {
  user: { name: string; role: string };
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore persisted sidebar preferences after mount (SSR renders defaults).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { collapsed?: boolean; closedGroups?: string[] };
        if (saved.collapsed) setCollapsed(true);
        if (Array.isArray(saved.closedGroups)) setClosedGroups(saved.closedGroups);
      } catch {
        // ignore corrupted preferences
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const persist = (next: { collapsed: boolean; closedGroups: string[] }) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — non-fatal
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      persist({ collapsed: !c, closedGroups });
      return !c;
    });
  };

  const toggleGroup = (label: string) => {
    setClosedGroups((groups) => {
      const next = groups.includes(label)
        ? groups.filter((g) => g !== label)
        : [...groups, label];
      persist({ collapsed, closedGroups: next });
      return next;
    });
  };

  const crumb = findActive(pathname);

  const navBody = (inDrawer: boolean) => (
    <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-2 py-3">
      {NAV.map((group) => {
        const groupClosed = !inDrawer && !collapsed && closedGroups.includes(group.label);
        return (
          <div key={group.label} className="mb-1.5">
            {(inDrawer || !collapsed) && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400 hover:text-neutral-600"
                aria-expanded={!groupClosed}
              >
                {group.label}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${groupClosed ? "-rotate-90" : ""}`}
                />
              </button>
            )}
            {collapsed && !inDrawer && (
              <div className="mx-3 my-2 border-t border-neutral-200 first:hidden" aria-hidden />
            )}
            {!(groupClosed && !inDrawer) && (
              <ul className="grid gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(item, pathname);
                  const Icon = item.icon;
                  const iconsOnly = collapsed && !inDrawer;
                  if (!item.href) {
                    return (
                      <li key={item.label}>
                        <span
                          title={`${item.label} — coming soon`}
                          className={`flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-neutral-300 ${iconsOnly ? "justify-center" : ""}`}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          {!iconsOnly && (
                            <span className="flex-1 truncate">
                              {item.label}
                              <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                                Soon
                              </span>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        title={iconsOnly ? item.label : undefined}
                        onClick={() => inDrawer && setDrawerOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors ${iconsOnly ? "justify-center" : ""} ${
                          active
                            ? "bg-brand-600 text-white shadow-sm"
                            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                        }`}
                      >
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-neutral-400"}`} />
                        {!iconsOnly && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  const sidebarFooter = (inDrawer: boolean) => {
    const iconsOnly = collapsed && !inDrawer;
    return (
      <div className="border-t border-neutral-200 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className={`flex items-center gap-3 ${iconsOnly ? "flex-col" : ""}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {(user.name || "A")[0].toUpperCase()}
          </span>
          {!iconsOnly && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-800">{user.name}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">
                {user.role}
              </p>
            </div>
          )}
          <form action={signOut}>
            <button
              title="Sign out"
              className="grid h-9 w-9 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-brand-600"
            >
              <LogOut className="h-[18px] w-[18px]" />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    );
  };

  const brand = (inDrawer: boolean) => {
    const iconsOnly = collapsed && !inDrawer;
    return (
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 font-display text-lg text-gold-300">
          ✦
        </span>
        {!iconsOnly && (
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold leading-tight text-neutral-900">
              Sisters Lounge
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-600">
              Admin Portal
            </p>
          </div>
        )}
        {inDrawer && (
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-cream lg:flex">
      {/* ------------------------------------------------ desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px]" : "w-[260px]"}`}
      >
        {brand(false)}
        {navBody(false)}
        <button
          onClick={toggleCollapsed}
          className="mx-2 mb-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : (
            <>
              <ChevronsLeft className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
        {sidebarFooter(false)}
      </aside>

      {/* ------------------------------------------------- mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col bg-white shadow-2xl">
            {brand(true)}
            {navBody(true)}
            {sidebarFooter(true)}
          </div>
        </div>
      )}

      {/* --------------------------------------------------- main column */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-14 items-center gap-3 px-4">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-600 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              {crumb ? (
                <p className="truncate text-sm text-neutral-400">
                  {crumb.group}
                  <span className="mx-1.5">/</span>
                  <span className="font-semibold text-neutral-800">{crumb.item}</span>
                </p>
              ) : (
                <p className="truncate text-sm font-semibold text-neutral-800">Admin</p>
              )}
            </div>
            <button
              title="Notifications — coming soon"
              disabled
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-300"
            >
              <Bell className="h-5 w-5" />
              <span className="sr-only">Notifications (coming soon)</span>
            </button>
            <span className="hidden items-center gap-2 rounded-full border border-neutral-200 py-1 pl-1 pr-3 sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {(user.name || "A")[0].toUpperCase()}
              </span>
              <span className="max-w-32 truncate text-sm font-medium text-neutral-700">
                {user.name}
              </span>
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}
