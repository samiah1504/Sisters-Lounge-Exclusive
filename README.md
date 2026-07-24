# Sisters Lounge Exclusive

A salon subscription, booking and hair-care management platform for
**Sisters Lounge** (Ilorin, Nigeria).

Customers subscribe to a monthly salon plan, pay online, book their visits
ahead, track remaining visits, manage plans for their children, add extra
paid services, book paid consultations and purchase hair-care products.
Sisters Lounge staff manage subscribers, bookings, plans, payments,
stylists, products and consultations.

## Phase 1 (this release)

Phase 1 is the public-facing homepage: a mobile-first, dependency-free
static site that presents the product — subscription plans, how it works,
extra services, family profiles, consultations, the product shop,
membership benefits, a dashboard preview and an FAQ.

- `index.html` — the homepage (all prices shown are labelled sample
  placeholders; accounts, payments and booking arrive in later phases)
- `css/styles.css` — mobile-first stylesheet, pink-and-gold identity with
  gold used as an accent only; breakpoints at 640px and 960px
- `js/main.js` — mobile navigation menu and footer year

No build step is required. Open `index.html` in a browser, or serve the
folder with any static server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Business rules reflected in the UI

- Every subscription lasts one monthly cycle; unused visits expire at
  cycle end and cannot roll over
- Two subscription visits must be at least seven days apart
- An already-paid active subscription cannot be cancelled or paused;
  customers can opt out of the next renewal
- Plan changes apply from the next cycle
- Missed appointments do not automatically consume a visit
- Products, consultations and extra services are each paid for separately
- Home service is currently available only within Ilorin
- Weekend booking is available; customers cannot select their stylist

## Roadmap

| Phase | Scope |
| ----- | ----- |
| 1 | Public homepage and product positioning (this release) |
| 2 | Accounts, subscription checkout and online payments |
| 3 | Appointment booking, visit tracking and reminders |
| 4 | Child profiles, extra services, consultations and product shop |
| 5 | Staff admin: subscribers, bookings, plans, payments, stylists |

## Contributing

Phase 1 intentionally has no framework or build tooling — plain HTML, CSS
and JavaScript — so it stays easy to host and hand-edit. The stylesheet is
mobile-first: base styles target small phones (~360px) and media queries at
`640px` / `960px` enhance for tablet and desktop. Keep new pages consistent
with the design tokens defined at the top of `css/styles.css`.
