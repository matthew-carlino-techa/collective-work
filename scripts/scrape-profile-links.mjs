#!/usr/bin/env node
/**
 * Collective profile-link scraper (read-only).
 *
 * Opens a saved Playwright Chrome profile (logged-in cookies under
 * data/browser-profiles/<accountId>), visits public profile pages slowly,
 * extracts display_name + LinkedIn + confirmed profile_url, and appends
 * batches to data/collective-profile-links-scraped.json in Export-for-Grok
 * shape: { rows: [{ display_name, seller_username, linkedin_url, profile_url }] }.
 *
 * Does NOT send DMs, open contact menus for messaging, or invent URLs.
 * Empty string when a field is not found on the page.
 *
 * ── How to run ──────────────────────────────────────────────────────────
 *   cd /home/lighthouse/Documents/multi-bot-dashboard
 *
 *   # Preview which leads would be scraped (no browser):
 *   node scripts/scrape-profile-links.mjs --account 12 --dry-run
 *
 *   # First small batch (Close account 12 in the dashboard first):
 *   node scripts/scrape-profile-links.mjs --account 12 --limit 3
 *
 *   # Or via npm:
 *   npm run scrape:profile-links -- --account 12 --limit 5
 *
 * Prefer an account with session-meta loggedIn:true, e.g. 1,2,3,4,5,6,11,12.
 * Close that account in the dashboard before running so Chrome's profile
 * lock is free. Proxy must be reachable (same as Open/Start).
 *
 * Flags:
 *   --account <id>     Required. Browser profile + proxy from accounts table.
 *   --limit <n>        Max leads this run (default 20).
 *   --dry-run          List targets only; do not launch Chrome.
 *   --all              Also include leads that already have both fields.
 *   --min-delay <s>    Min seconds between profiles (default 8).
 *   --max-delay <s>    Max seconds between profiles (default 15).
 *   --out <path>       Output JSON (default data/collective-profile-links-scraped.json).
 *   --headed / --headless   Default headed (Collective often blocks headless).
 */

import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "collective.db");
const DEFAULT_OUT = path.join(ROOT, "data", "collective-profile-links-scraped.json");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const out = {
    account: null,
    limit: 20,
    dryRun: false,
    all: false,
    minDelay: 8,
    maxDelay: 15,
    outPath: DEFAULT_OUT,
    headless: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--account") out.account = Number(next());
    else if (a === "--limit") out.limit = Math.max(1, Number(next()) || 20);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--all") out.all = true;
    else if (a === "--min-delay") out.minDelay = Math.max(1, Number(next()) || 8);
    else if (a === "--max-delay") out.maxDelay = Math.max(1, Number(next()) || 15);
    else if (a === "--out") out.outPath = path.resolve(ROOT, next());
    else if (a === "--headless") out.headless = true;
    else if (a === "--headed") out.headless = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  if (out.maxDelay < out.minDelay) out.maxDelay = out.minDelay;
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randDelayMs(minS, maxS) {
  const lo = minS * 1000;
  const hi = maxS * 1000;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Mirror src/lib/linkedin-url.ts normalizeLinkedInUrl */
function normalizeLinkedInUrl(raw) {
  let u = (raw || "").trim();
  if (!u || u === "#" || u === "about:blank") return "";
  if (u.startsWith("//")) u = `https:${u}`;
  if (u.startsWith("/")) u = `https://www.linkedin.com${u}`;
  if (!/^https?:\/\//i.test(u)) {
    if (/linkedin\.com/i.test(u)) u = `https://${u.replace(/^\/+/, "")}`;
    else if (/^(in|pub|company)\//i.test(u)) {
      u = `https://www.linkedin.com/${u.replace(/^\/+/, "")}`;
    } else return "";
  }
  try {
    const url = new URL(u);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return "";
    if (url.hostname === "linkedin.com") url.hostname = "www.linkedin.com";
    url.hash = "";
    for (const k of ["trk", "originalSubdomain", "lipi", "licu"]) {
      url.searchParams.delete(k);
    }
    let out = url.toString();
    if (out.endsWith("/") && url.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return u;
  }
}

/** Mirror src/lib/collective-url.ts collectiveProfileId / Url */
function slugifyCollectiveName(name) {
  const raw = (name || "").trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/[''\-]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function collectiveProfileId(raw) {
  const u = (raw || "").trim();
  if (!u) return "";
  if (/collective\.work/i.test(u) || u.startsWith("/profile/")) {
    try {
      const url = u.startsWith("http")
        ? new URL(u)
        : new URL(u, "https://www.collective.work");
      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map((p) => decodeURIComponent(p).toLowerCase());
      const i = parts.indexOf("profile");
      if (i >= 0 && parts[i + 1] && SLUG_RE.test(parts[i + 1])) {
        return parts[i + 1];
      }
    } catch {
      /* fall through */
    }
  }
  if (SLUG_RE.test(u)) return u;
  return slugifyCollectiveName(u);
}

function collectiveProfileUrl(idOrName) {
  const id = collectiveProfileId(idOrName);
  if (!id) return "";
  return `https://www.collective.work/profile/${id}`;
}

function linkedinProfileUrlFromStored(idOrUrl) {
  const full = normalizeLinkedInUrl(idOrUrl);
  if (full) return full;
  const id = (idOrUrl || "").trim();
  if (!id) return "";
  if (id.startsWith("company/")) return `https://www.linkedin.com/${id}`;
  if (/^[\w.\-%\u0080-\uffff]+$/i.test(id)) {
    return `https://www.linkedin.com/in/${encodeURI(
      decodeURIComponent(id),
    )}`;
  }
  return "";
}

function profileDir(accountId) {
  return path.join(ROOT, "data", "browser-profiles", String(accountId));
}

function clearChromeLocks(accountId) {
  const dir = profileDir(accountId);
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* ignore */
    }
  }
}

function readSessionMeta(accountId) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(profileDir(accountId), "session-meta.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

function tcpReachable(host, port, ms = 10_000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(ms, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

function loadAccount(db, id) {
  return db
    .prepare(
      `SELECT id, username, email, password, proxy_ip, proxy_port, proxy_user, proxy_pass
       FROM accounts WHERE id = ?`,
    )
    .get(id);
}

function loadLeads(db, { all, limit }) {
  let sql = `
    SELECT seller_username, display_name, linkedin_url, profile_id
    FROM pipeline_leads
    WHERE platform = 'collective'
  `;
  if (!all) {
    sql += ` AND (linkedin_url = '' OR profile_id = '')`;
  }
  sql += `
    ORDER BY
      CASE
        WHEN profile_id != '' AND linkedin_url = '' THEN 0
        WHEN profile_id = '' AND linkedin_url != '' THEN 1
        WHEN profile_id = '' AND linkedin_url = '' THEN 2
        ELSE 3
      END,
      id ASC
    LIMIT ?
  `;
  return db.prepare(sql).all(limit);
}

function loadOutput(outPath) {
  if (!fs.existsSync(outPath)) return { rows: [] };
  try {
    let raw = fs.readFileSync(outPath, "utf8").trim();
    if (raw.endsWith("\\n")) raw = raw.slice(0, -2).trim();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { rows: parsed };
    if (parsed && Array.isArray(parsed.rows)) return { rows: parsed.rows };
  } catch {
    /* start fresh */
  }
  return { rows: [] };
}

function saveOutput(outPath, rows) {
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ rows }, null, 2) + "\n");
  fs.renameSync(tmp, outPath);
}

function mergeRow(existingRows, row) {
  const key = row.seller_username.toLowerCase();
  const idx = existingRows.findIndex(
    (r) => (r.seller_username || "").toLowerCase() === key,
  );
  if (idx < 0) {
    existingRows.push({ ...row });
    return;
  }
  const prev = existingRows[idx];
  existingRows[idx] = {
    display_name: row.display_name || prev.display_name || "",
    seller_username: prev.seller_username || row.seller_username,
    linkedin_url: row.linkedin_url || prev.linkedin_url || "",
    profile_url: row.profile_url || prev.profile_url || "",
  };
}

async function detectLoggedIn(page) {
  try {
    if (page.isClosed()) return false;

    // Cookies are the reliable signal while the SPA still shows "Loading..."
    const cookies = await page.context().cookies();
    const hasAuthCookie = cookies.some(
      (c) =>
        /collective\.work/i.test(c.domain) &&
        /session|token|auth|user|access|refresh|sb-/i.test(c.name) &&
        !/cf_|__cf|datafast/i.test(c.name) &&
        Boolean(c.value) &&
        c.value.length > 8,
    );
    if (hasAuthCookie) return true;

    const url = page.url().toLowerCase();
    if (/\/(login|signin|sign-in|auth|register|signup)/.test(url)) return false;

    return await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() ?? "";
      if (/log\s*out|sign\s*out|sherlock|recruiter/.test(body)) return true;
      if (
        document.querySelector(
          '[data-dd-id="contact-button"], .chakra-avatar__img, [aria-label*="Account" i], [data-dd-id="sidebar-user-menu"]',
        )
      ) {
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

async function pageLooksGone(page) {
  try {
    return await page.evaluate(() => {
      const title = (document.title || "").trim();
      const h1 = (document.querySelector("h1")?.textContent || "").trim();
      const body = (document.body?.innerText || "").slice(0, 400).toLowerCase();
      if (/^(404|410|403|500)$/i.test(h1) || /^(404|410|403|500)\b/.test(title)) {
        return h1 || title.split(/\s/)[0];
      }
      if (/page not found|profile (not found|unavailable|removed)|doesn.?t exist/.test(body)) {
        return "not_found";
      }
      return "";
    });
  } catch {
    return "";
  }
}

async function pageLooksBlocked(page) {
  try {
    return await page.evaluate(() => {
      const t = (document.body?.innerText || "").toLowerCase();
      const title = (document.title || "").toLowerCase();
      if (/just a moment|attention required|cf-browser-verification|challenge-platform/.test(t)) {
        return "cloudflare";
      }
      if (/too many requests|rate limit|429/.test(t)) return "429";
      if (/sign up to see|create an account to see|log in to see/.test(t)) {
        return "gated";
      }
      if (title.includes("just a moment")) return "cloudflare";
      return "";
    });
  } catch {
    return "";
  }
}

/**
 * Extract LinkedIn + display name from a Collective profile page.
 * Public pages often hide the LinkedIn button behind "Sign up to see profile",
 * but the LinkedIn URL is still embedded in the HTML (JSON-LD / Next data /
 * escaped strings). Prefer anchors; fall back to HTML regex. Never invent.
 */
async function extractFromProfilePage(page) {
  return page.evaluate(() => {
    const abs = (href) => {
      try {
        return new URL(href, location.href).href;
      } catch {
        return (href || "").trim();
      }
    };

    const pickLinkedIn = (candidates) => {
      for (const raw of candidates) {
        if (!raw) continue;
        let u = String(raw).replace(/\\\//g, "/").trim();
        if (!/linkedin\.com/i.test(u)) continue;
        if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, "")}`;
        if (/linkedin\.com\/(in|pub|company)\//i.test(u)) return u;
      }
      return "";
    };

    let linkedin_url = "";
    const typed = document.querySelector(
      'a[data-type="LINKEDIN"], a[data-type="linkedin"]',
    );
    if (typed) {
      linkedin_url = pickLinkedIn([
        typed.getAttribute("href"),
        typed.href,
      ]);
    }

    if (!linkedin_url) {
      const hrefs = [...document.querySelectorAll("a[href]")].map(
        (a) => a.getAttribute("href") || a.href || "",
      );
      linkedin_url = pickLinkedIn(hrefs.map(abs));
    }

    if (!linkedin_url) {
      for (const a of document.querySelectorAll(
        'a[aria-label*="LinkedIn" i], a[title*="LinkedIn" i]',
      )) {
        linkedin_url = pickLinkedIn([
          a.getAttribute("href"),
          a.href,
          a.parentElement?.getAttribute?.("href"),
        ]);
        if (linkedin_url) break;
      }
    }

    // Embedded in HTML even when UI is gated (Next.js / JSON-LD / escaped JSON)
    if (!linkedin_url) {
      const html = document.documentElement?.innerHTML || "";
      const re =
        /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub|company)\/[\w.%~\-\u0080-\uffff]+/gi;
      const found = html.match(re) || [];
      linkedin_url = pickLinkedIn(found);
    }

    let display_name = "";
    const h1 = document.querySelector("h1");
    if (h1?.textContent) display_name = h1.textContent.trim();
    if (!display_name) {
      const og = document.querySelector('meta[property="og:title"]');
      if (og?.content) {
        display_name = og.content.replace(/\s*[|\-–].*$/, "").trim();
      }
    }
    if (!display_name) {
      const img = document.querySelector('img[alt]:not([alt=""])');
      if (img) display_name = (img.getAttribute("alt") || "").trim();
    }

    const profile_url = location.href;

    return { linkedin_url, display_name, profile_url };
  });
}

async function softGoto(page, url) {
  try {
    if (page.isClosed()) {
      return { ok: false, status: 0, error: "page already closed" };
    }
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(1800);
    if (page.isClosed()) {
      return { ok: false, status: 0, error: "page closed after goto" };
    }
    const status = resp?.status?.() ?? 0;
    return { ok: true, status };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function resolveTargetUrl(lead) {
  if (lead.profile_id) return collectiveProfileUrl(lead.profile_id);
  if (lead.display_name) {
    const slug = slugifyCollectiveName(lead.display_name);
    if (slug) return collectiveProfileUrl(slug);
  }
  return "";
}

async function scrapeOne(page, lead) {
  const target = resolveTargetUrl(lead);
  const base = {
    display_name: (lead.display_name || "").trim(),
    seller_username: lead.seller_username,
    linkedin_url: linkedinProfileUrlFromStored(lead.linkedin_url) || "",
    profile_url: lead.profile_id ? collectiveProfileUrl(lead.profile_id) : "",
  };

  if (!target) {
    return {
      row: base,
      status: "skipped_no_profile_url",
      note: "no profile_id / slugifiable name — left unchanged",
    };
  }

  const nav = await softGoto(page, target);
  if (!nav.ok) {
    return { row: base, status: "nav_error", note: nav.error || "goto failed" };
  }
  if (nav.status === 429) {
    return { row: base, status: "429", note: "HTTP 429" };
  }

  let block = await pageLooksBlocked(page);
  if (block === "cloudflare" || block === "429") {
    return { row: base, status: block, note: `blocked: ${block}` };
  }

  // Confirm we landed on a profile URL (slug may 404 → redirect home)
  const landed = collectiveProfileId(page.url());
  if (!landed) {
    return {
      row: base,
      status: "not_found",
      note: `did not land on /profile/* (url=${page.url()})`,
    };
  }

  const gone = await pageLooksGone(page);
  let extracted = await extractFromProfilePage(page);
  // www pages often show "Sign up to see profile" but still embed LinkedIn in HTML.
  // app.collective.work/profile/{slug} redirects to Sherlock — skip that hop.
  if (!extracted.profile_url || /app\.collective\.work/i.test(extracted.profile_url)) {
    extracted.profile_url = collectiveProfileUrl(landed);
  }

  // Prefer DB name when page title is an HTTP error code or empty
  const extractedName = (extracted.display_name || "").trim();
  const badName =
    !extractedName ||
    /^(404|410|403|500)$/i.test(extractedName) ||
    /not found|unavailable/i.test(extractedName);
  if (badName && base.display_name) {
    extracted.display_name = base.display_name;
  }

  if (gone && !extracted.linkedin_url) {
    return {
      row: {
        ...base,
        display_name: extracted.display_name || base.display_name,
        profile_url: collectiveProfileUrl(landed) || base.profile_url,
      },
      status: "gone",
      note: `profile page looks gone (${gone}) — LinkedIn left empty`,
    };
  }

  const linkedin = normalizeLinkedInUrl(extracted.linkedin_url);
  const confirmedSlug = collectiveProfileId(extracted.profile_url || page.url());
  const profile_url = confirmedSlug
    ? collectiveProfileUrl(confirmedSlug)
    : base.profile_url;

  const row = {
    display_name: (extracted.display_name || base.display_name || "").trim(),
    seller_username: lead.seller_username,
    linkedin_url: linkedin || base.linkedin_url || "",
    profile_url: profile_url || "",
  };

  return {
    row,
    status: "ok",
    note: linkedin
      ? "linkedin found"
      : block === "gated"
        ? "page gated and no LinkedIn embedded in HTML"
        : "no LinkedIn on page (left empty)",
  };
}

async function launchScraperContext(account, headless) {
  const ip = account.proxy_ip?.trim();
  const port = account.proxy_port?.trim();
  if (!ip || !port) {
    throw new Error("Account is missing proxy_ip / proxy_port");
  }
  if (!(await tcpReachable(ip, Number(port)))) {
    throw new Error(
      `Proxy ${ip}:${port} unreachable. Run: warp-cli tunnel ip add ${ip}`,
    );
  }

  clearChromeLocks(account.id);
  const userDataDir = profileDir(account.id);
  if (!fs.existsSync(userDataDir)) {
    throw new Error(`No browser profile at ${userDataDir}`);
  }

  const proxy = { server: `http://${ip}:${port}` };
  if (account.proxy_user?.trim()) proxy.username = account.proxy_user.trim();
  if (account.proxy_pass?.trim()) proxy.password = account.proxy_pass.trim();

  const display = process.env.DISPLAY || ":20.0";
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless,
    proxy,
    viewport: { width: 1360, height: 900 },
    env: { ...process.env, DISPLAY: display },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      `--window-name=CollectiveScrape:${account.username}`,
    ],
    ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

function printHelp() {
  console.log(`Usage:
  node scripts/scrape-profile-links.mjs --account <id> [--limit N] [--dry-run]

Close the chosen account in the dashboard first. Prefer logged-in profiles
(data/browser-profiles/<id>/session-meta.json → loggedIn: true).

Output: data/collective-profile-links-scraped.json
Import via Pipeline → Import profiles when ready.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  if (!opts.account || !Number.isFinite(opts.account)) {
    console.error("Error: --account <id> is required.");
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const account = loadAccount(db, opts.account);
  if (!account) {
    console.error(`Account ${opts.account} not found`);
    process.exit(1);
  }

  const meta = readSessionMeta(opts.account);
  let leads = loadLeads(db, {
    all: opts.all,
    // Over-fetch so we can skip sellers already present in the output file
    limit: Math.max(opts.limit * 5, opts.limit),
  });
  db.close();

  const existingOut = loadOutput(opts.outPath);
  const done = new Set(
    existingOut.rows
      .filter((r) => {
        if (opts.all) return false;
        // Skip if we already captured a LinkedIn URL, or already wrote a row
        // for a lead that only needed profile_url confirmation with empty LI.
        return Boolean((r.linkedin_url || "").trim()) || Boolean((r.profile_url || "").trim());
      })
      .map((r) => (r.seller_username || "").toLowerCase()),
  );
  if (done.size) {
    leads = leads.filter((l) => !done.has(l.seller_username.toLowerCase()));
  }
  leads = leads.slice(0, opts.limit);

  console.log(`Account #${account.id} (${account.username})`);
  console.log(
    `  profile dir: data/browser-profiles/${account.id}` +
      (meta?.loggedIn ? " [session-meta loggedIn=true]" : " [no loggedIn meta]"),
  );
  console.log(`  proxy: ${account.proxy_ip}:${account.proxy_port}`);
  console.log(`  leads this run: ${leads.length}` + (opts.all ? " (--all)" : " (missing linkedin or profile)"));
  console.log(`  output: ${path.relative(ROOT, opts.outPath)}`);
  console.log(`  pace: ${opts.minDelay}–${opts.maxDelay}s between profiles`);

  if (!leads.length) {
    console.log("Nothing to scrape.");
    return;
  }

  for (const lead of leads) {
    const target = resolveTargetUrl(lead);
    console.log(
      `  • ${lead.seller_username}` +
        (lead.display_name ? ` (${lead.display_name})` : "") +
        ` → ${target || "(no URL)"}` +
        (lead.linkedin_url ? ` [has LI id]` : "") +
        (lead.profile_id ? ` [has profile_id]` : ""),
    );
  }

  if (opts.dryRun) {
    console.log("\nDry-run only — no browser launched.");
    return;
  }

  console.log("\nLaunching Chrome (Close this account in the dashboard if lock errors)…");
  let context;
  let page;
  try {
    ({ context, page } = await launchScraperContext(account, opts.headless));
  } catch (err) {
    console.error(
      `Failed to launch: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(1);
  }

  const rows = existingOut.rows;
  let scraped = 0;
  let foundLi = 0;
  let backoffMs = 0;

  try {
    // Warm session on app root; wait for SPA / auth cookies
    let warm = await softGoto(page, "https://app.collective.work/");
    if (!warm.ok || page.isClosed()) {
      throw new Error(
        `Warm navigation failed (${warm.note || warm.error || "page closed"}). ` +
          "Close this account in the dashboard and retry.",
      );
    }
    // Give the React shell time past the "Loading..." splash
    for (let w = 0; w < 8; w++) {
      if (page.isClosed()) break;
      if (await detectLoggedIn(page)) break;
      await sleep(1000);
    }
    const loggedIn = !page.isClosed() && (await detectLoggedIn(page));
    console.log(`Logged-in detection: ${loggedIn ? "yes" : "NO — LinkedIn may stay hidden"}`);
    if (!loggedIn) {
      console.warn(
        "Warning: finish login in the opened Chrome window, then re-run.\n" +
          "Continuing anyway (public pages often hide LinkedIn).",
      );
      await sleep(3000);
    }
    if (page.isClosed()) {
      throw new Error("Browser closed during warm-up — profile may be locked or Chrome crashed.");
    }

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      console.log(`\n[${i + 1}/${leads.length}] ${lead.seller_username}`);

      if (backoffMs > 0) {
        console.log(`  backoff ${Math.round(backoffMs / 1000)}s…`);
        await sleep(backoffMs);
      }

      const result = await scrapeOne(page, lead);
      console.log(`  status=${result.status} — ${result.note}`);
      console.log(
        `  → name="${result.row.display_name}" li="${result.row.linkedin_url}" profile="${result.row.profile_url}"`,
      );

      mergeRow(rows, result.row);
      scraped++;
      if (result.row.linkedin_url) foundLi++;

      // Persist after each lead so Ctrl+C keeps progress
      saveOutput(opts.outPath, rows);

      if (result.status === "429" || result.status === "cloudflare") {
        backoffMs = Math.min(Math.max(backoffMs * 2, 30_000), 180_000);
        console.warn(`  rate-limit/CF — next backoff ${Math.round(backoffMs / 1000)}s`);
      } else {
        backoffMs = Math.max(0, Math.floor(backoffMs * 0.5));
      }

      if (i < leads.length - 1) {
        const wait = randDelayMs(opts.minDelay, opts.maxDelay);
        console.log(`  pacing ${Math.round(wait / 1000)}s…`);
        await sleep(wait);
      }
    }
  } finally {
    try {
      await context.close();
    } catch {
      /* ignore */
    }
  }

  console.log(
    `\nDone. Wrote ${scraped} row(s) (${foundLi} with LinkedIn) → ${path.relative(ROOT, opts.outPath)}`,
  );
  console.log(
    "Import via Pipeline → Import profiles (matches seller_username; fills LI id + profile slug only).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
