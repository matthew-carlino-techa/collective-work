# Multi-bot Freelancer Dashboard

Control panel for freelancing outreach bots. **Collective.work** is live; more platforms slot in as tabs.

## Platforms

| Tab | Status |
|-----|--------|
| Collective | Live — accounts, DOM, pipeline, brain MD |
| Upwork / Fiverr / Freelancer | Placeholders |

## Collective features

- **Accounts** — Open / Start / Contact / Stop (per account + all), proxy, GitHub, DM limits, Sherlock brief
- **DOM** — Import Claude analysis `.md` → bot steps
- **Pipeline** — unique sellers, live contacting, email / LinkedIn when scraped
- **Brain** — ASD-STE100 `.md`; First msg drives Start

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- SQLite (`better-sqlite3`) at `data/collective.db`

## Run

Listens on **all interfaces** (`0.0.0.0:43123`) so coworkers can open it.

```bash
npm install
npm run dev
```

- Local: `http://127.0.0.1:43123`
- Share with worker: `http://62.169.22.108:43123` (this VPS public IP)

Hash example: `#collective/bots`.

> No login yet — only share with trusted workers. Contabo firewall must allow inbound TCP **43123** if the page does not load from outside.

## AI session protocol

Read **`handover.md`** at the start of every new session before scanning the repo. Update it after each meaningful change.

## Scrape Collective profile links

Paced, read-only Playwright scraper. Uses a saved logged-in Chrome profile under `data/browser-profiles/<accountId>` and writes Export-for-Grok JSON.

```bash
# Preview targets (no browser)
node scripts/scrape-profile-links.mjs --account 12 --dry-run

# Small batch — Close that account in the dashboard first
node scripts/scrape-profile-links.mjs --account 12 --limit 5

npm run scrape:profile-links -- --account 12 --limit 5
```

Output: `data/collective-profile-links-scraped.json` → Pipeline **Import profiles**.
Does not send DMs. Prefer accounts with `session-meta.json` `loggedIn: true` (e.g. 12).
