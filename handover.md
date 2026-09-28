# Handover — Freelancer Bot Dashboards (multi-platform)

> **AI rule:** Read this file at the start of every new work session before exploring the codebase.
> After any meaningful change, update this file (status, files touched, next steps).

## Goal

MD files are the **bot brain**. Dashboard = platforms × (DOM / DB / status / bot / API).
Update the brain `.md` → Start sends the new **First msg**.

## Architecture

- **Shell** — light ops desk: platform rail, run/stop/contact/success, per-bot MD + Secrets + Run/Stop, candidates, test chat
  - Hash: `#collective/bots` · `#collective/dom` · `#collective/pipeline` · `#collective/brain`
- **Collective** — Accounts · DOM · Pipeline · Brain (nested under Collective tab)
- **Brain** — ASD-STE100 markdown (`brains/collective/brain.md` → `data/brains/collective.md`)
- **DOM** — Import Claude analysis `.md` → bot steps (`POST /api/collective/dom-analysis`)
- **Pipeline** — live `contacting`; unique seller; email + LinkedIn when scraped
- **Bulk** — Open all / Start all / Stop all
- **DM quota** — **per account** (day/hour caps). Sent DMs count only successful messages; skipped profiles do not increase today/hour.

## Key files

```
src/lib/platforms.ts                 → platform registry
src/components/DashboardShell.tsx    → top-level platform tabs
src/components/collective/*          → Collective-only UI
src/app/api/collective/*             → Collective APIs
brains/collective/brain.md
data/brains/collective.md
data/dom-analysis/latest.md
```

## Operator flow

1. Select **Collective** → opens **Pipeline** first  
2. **Brain** — confirm First msg or Import .md  
3. **DOM** — Import Claude analysis  
4. **Accounts** — per-account Sherlock brief + limits → Open all → Start all. Bot list pages at 10 / 15 / 20 (default 10). Bulk Open/Start/Stop still covers every account.  
5. **Pipeline** — filter by site / name; Following + Double-check; LinkedIn click copies the full URL; Site column is the Collective profile URL (`https://www.collective.work/profile/{slug}`, slug only in the database). Export for Grok downloads `{display_name, seller_username, linkedin_url, profile_url}`. Import profiles matches `seller_username` and fills the LinkedIn id and profile slug only (status, Following, Double-check stay).  

## Share dashboard (remote worker)

- Dev listens on `0.0.0.0:43123` (`npm run dev`)
- Share: `http://62.169.22.108:43123`
- If unreachable from outside: open Contabo panel firewall for TCP **43123**

## Adding a new platform

1. Enable in `src/lib/platforms.ts`  
2. Add `src/components/<platform>/…` + `src/app/api/<platform>/…`  
3. Wire into `DashboardShell` next to Collective  

## Boss rule

> By just updating the MD, our bot works perfectly with a new brain.

## Recent (2026-09-24)

- Added paced read-only profile-link scraper: `scripts/scrape-profile-links.mjs`
- Run: `node scripts/scrape-profile-links.mjs --account 12 --limit 5` (Close that account in dashboard first)
- Dry-run: `--dry-run`. Output: `data/collective-profile-links-scraped.json` (Import profiles)
- Uses logged-in Chrome profile + proxy; LinkedIn often embedded in www HTML even when UI says "Sign up to see profile"
