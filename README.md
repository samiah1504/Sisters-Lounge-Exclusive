# Sisters Lounge Exclusive

A private, sisters-only online community space — a warm corner of the internet
for connection, learning, and support.

## Phase 1 (this release)

Phase 1 is a static, dependency-free website that establishes the brand and
core information for the community:

- **Landing page** (`index.html`) with hero, about, community offerings,
  guidelines, and a join-request form (front-end only for now)
- **Styling** (`css/styles.css`) — modest, elegant palette with light/dark
  support and a responsive layout
- **Interactions** (`js/main.js`) — mobile navigation, smooth scrolling, and
  client-side form validation

No build step is required. Open `index.html` in a browser, or serve the
folder with any static server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

The site is also ready to deploy on GitHub Pages (serve from the repository
root).

## Roadmap

| Phase | Scope |
| ----- | ----- |
| 1 | Static landing site, branding, join-request form (front-end only) |
| 2 | Backend for join requests (form submissions, moderation queue) |
| 3 | Member accounts and a private lounge area (discussions, events) |
| 4 | Events calendar, book club, and resource library |

## Contributing

Phase 1 intentionally has no framework or build tooling — plain HTML, CSS,
and JavaScript — so it stays easy to host and hand-edit. Please keep new
pages consistent with the design tokens defined at the top of
`css/styles.css`.
