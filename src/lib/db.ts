import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  mergeBotConfig,
  type AccountBotConfig,
} from "./bot-config";
import { collectiveProfileId, slugifyCollectiveName } from "./collective-url";
import {
  profileLinkIds,
  type ProfileLinkRow,
} from "./profile-link-import";
import { linkedinProfileId } from "./linkedin-url";
import type {
  AccountInput,
  AccountStatusFlag,
  CollectiveAccount,
  DmLimits,
  PipelineLead,
  WorkflowStep,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "collective.db");

let dbInstance: Database.Database | null = null;

const DEFAULT_WORKFLOW: Array<{
  track: "fullstack" | "blockchain";
  step_key: string;
  step_label: string;
  subtitle: string;
  body: string;
  sort_order: number;
}> = [
  {
    track: "fullstack",
    step_key: "contact",
    step_label: "Step 1 — Contact",
    subtitle: "Cold Contact DM (first message to seller)",
    body: `Hi {{name}},

I found your profile on Collective.work.
I look for full-stack developers.
Your work with {{skills}} looks useful for our project.
Are you free for a new project?
Did you build production apps with dashboards, APIs, real-time data, or authentication?
If this fits your work, I can send more details here on Collective.`,
    sort_order: 1,
  },
  {
    track: "fullstack",
    step_key: "step2",
    step_label: "Step 2 — STEP2",
    subtitle: "Follow-up after first reply",
    body: `Thanks {{name}}. Here is a quick brief.

We need a fullstack engineer for dashboards + APIs.
Skills we care about: {{skills}}.
If you are open, I can share the repo next: {{repo}}.`,
    sort_order: 2,
  },
  {
    track: "fullstack",
    step_key: "step3",
    step_label: "Step 3 — STEP3",
    subtitle: "Share project details",
    body: `{{name}}, here are project details.

Track: fullstack
Repo: {{repo}}
Username on Collective: {{username}}

Tell me your availability this week.`,
    sort_order: 3,
  },
  {
    track: "fullstack",
    step_key: "step4",
    step_label: "Step 4 — STEP4",
    subtitle: "Confirm interest",
    body: `Quick check-in, {{name}} — still interested in the fullstack work around {{skills}}?`,
    sort_order: 4,
  },
  {
    track: "fullstack",
    step_key: "step5",
    step_label: "Step 5 — STEP5",
    subtitle: "Invite to GitHub",
    body: `Great. I invited {{username}} to {{repo}}. Accept the invite and reply when you can open it.`,
    sort_order: 5,
  },
  {
    track: "fullstack",
    step_key: "step6",
    step_label: "Step 6 — STEP6",
    subtitle: "Assessment kickoff",
    body: `{{name}}, once you accept {{repo}}, start with the README tasks. Ping me if anything is blocked.`,
    sort_order: 6,
  },
  {
    track: "fullstack",
    step_key: "step7",
    step_label: "Step 7 — STEP7",
    subtitle: "Close / next steps",
    body: `Thanks {{name}}. If the assessment looks good we will move to paid work. Keep me posted on {{repo}}.`,
    sort_order: 7,
  },
  {
    track: "fullstack",
    step_key: "ai_rules",
    step_label: "AI rules / brief",
    subtitle: "Rules for automation tone and safety",
    body: `Stay polite. Never invent rates. Use placeholders only.
Prefer short DMs. Stop if the seller declines.
One integrated pipeline row per seller username (no duplicates across bot accounts).`,
    sort_order: 8,
  },
  {
    track: "blockchain",
    step_key: "contact",
    step_label: "Step 1 — Contact",
    subtitle: "Cold Contact DM (first message to seller)",
    body: `Hi {{name}},

I found your profile on Collective.work.
I look for blockchain / smart-contract developers.
Your work with {{skills}} looks useful for our project.
Are you free for a new project?
If this fits, I can share more details and a repo invite.`,
    sort_order: 1,
  },
  {
    track: "blockchain",
    step_key: "step2",
    step_label: "Step 2 — STEP2",
    subtitle: "Follow-up after first reply",
    body: `Thanks {{name}}. Brief: blockchain track, skills {{skills}}, repo {{repo}}. Interested?`,
    sort_order: 2,
  },
  {
    track: "blockchain",
    step_key: "step3",
    step_label: "Step 3 — STEP3",
    subtitle: "Share project details",
    body: `{{name}} — blockchain project details. Repo: {{repo}}. Collective user: {{username}}.`,
    sort_order: 3,
  },
  {
    track: "blockchain",
    step_key: "step4",
    step_label: "Step 4 — STEP4",
    subtitle: "Confirm interest",
    body: `{{name}}, still open for the blockchain work around {{skills}}?`,
    sort_order: 4,
  },
  {
    track: "blockchain",
    step_key: "step5",
    step_label: "Step 5 — STEP5",
    subtitle: "Invite to GitHub",
    body: `Invited {{username}} to {{repo}}. Accept and reply when ready.`,
    sort_order: 5,
  },
  {
    track: "blockchain",
    step_key: "step6",
    step_label: "Step 6 — STEP6",
    subtitle: "Assessment kickoff",
    body: `{{name}}, start the README on {{repo}} and ping me if blocked.`,
    sort_order: 6,
  },
  {
    track: "blockchain",
    step_key: "step7",
    step_label: "Step 7 — STEP7",
    subtitle: "Close / next steps",
    body: `Thanks {{name}}. We will review {{repo}} and follow up.`,
    sort_order: 7,
  },
  {
    track: "blockchain",
    step_key: "ai_rules",
    step_label: "AI rules / brief",
    subtitle: "Rules for automation tone and safety",
    body: `Stay polite. Never invent tokenomics claims.
One pipeline row per seller across all bot accounts.`,
    sort_order: 8,
  },
];

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  migrate(dbInstance);
  return dbInstance;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      github_fs_repo TEXT NOT NULL DEFAULT '',
      github_bc_repo TEXT NOT NULL DEFAULT '',
      github_pat TEXT NOT NULL DEFAULT '',
      proxy_ip TEXT NOT NULL DEFAULT '',
      proxy_port TEXT NOT NULL DEFAULT '',
      proxy_user TEXT NOT NULL DEFAULT '',
      proxy_pass TEXT NOT NULL DEFAULT '',
      search_brief TEXT NOT NULL DEFAULT '',
      dm_per_day INTEGER NOT NULL DEFAULT 50,
      dm_per_hour INTEGER NOT NULL DEFAULT 20,
      dm_hour_batch INTEGER NOT NULL DEFAULT 0,
      dm_hour_started_at TEXT NOT NULL DEFAULT '',
      dm_quota_day TEXT NOT NULL DEFAULT '',
      today_count INTEGER NOT NULL DEFAULT 0,
      start_status TEXT NOT NULL DEFAULT 'no',
      contact_status TEXT NOT NULL DEFAULT 'no',
      online_status TEXT NOT NULL DEFAULT 'no',
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'collective',
      seller_username TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      track TEXT NOT NULL DEFAULT 'fullstack',
      step TEXT NOT NULL DEFAULT 'Contact',
      status TEXT NOT NULL DEFAULT 'waiting',
      replies INTEGER NOT NULL DEFAULT 0,
      wait_label TEXT NOT NULL DEFAULT '—',
      last_activity TEXT NOT NULL DEFAULT (datetime('now')),
      github_url TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      profile_id TEXT NOT NULL DEFAULT '',
      following INTEGER NOT NULL DEFAULT 0,
      double_checked INTEGER NOT NULL DEFAULT 0,
      assigned_account_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform, seller_username),
      FOREIGN KEY(assigned_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track TEXT NOT NULL,
      step_key TEXT NOT NULL,
      step_label TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(track, step_key)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      seller_key TEXT NOT NULL DEFAULT '',
      seller_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Per-account bot DOM config (JSON)
  const accountCols = db.prepare("PRAGMA table_info(accounts)").all() as Array<{
    name: string;
  }>;
  if (!accountCols.some((c) => c.name === "bot_config_json")) {
    db.exec(
      `ALTER TABLE accounts ADD COLUMN bot_config_json TEXT NOT NULL DEFAULT ''`,
    );
  }
  if (!accountCols.some((c) => c.name === "search_brief")) {
    db.exec(
      `ALTER TABLE accounts ADD COLUMN search_brief TEXT NOT NULL DEFAULT ''`,
    );
  }

  // Per-account DM quotas (not shared across bots)
  const addAccountCol = (name: string, ddl: string) => {
    const cols = db.prepare("PRAGMA table_info(accounts)").all() as Array<{
      name: string;
    }>;
    if (!cols.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE accounts ADD COLUMN ${ddl}`);
    }
  };
  addAccountCol("dm_per_day", "dm_per_day INTEGER NOT NULL DEFAULT 50");
  addAccountCol("dm_per_hour", "dm_per_hour INTEGER NOT NULL DEFAULT 20");
  addAccountCol("dm_hour_batch", "dm_hour_batch INTEGER NOT NULL DEFAULT 0");
  addAccountCol(
    "dm_hour_started_at",
    "dm_hour_started_at TEXT NOT NULL DEFAULT ''",
  );
  addAccountCol("dm_quota_day", "dm_quota_day TEXT NOT NULL DEFAULT ''");

  // Seed per-account caps from legacy global settings when still at default 0/empty
  const globalDay = (
    db
      .prepare("SELECT value FROM settings WHERE key = 'dm_per_day'")
      .get() as { value: string } | undefined
  )?.value;
  const globalHour = (
    db
      .prepare("SELECT value FROM settings WHERE key = 'dm_per_hour'")
      .get() as { value: string } | undefined
  )?.value;
  if (globalDay) {
    db.prepare(
      `UPDATE accounts SET dm_per_day = ? WHERE dm_per_day IS NULL OR dm_per_day <= 0`,
    ).run(Number(globalDay) || 50);
  }
  if (globalHour) {
    db.prepare(
      `UPDATE accounts SET dm_per_hour = ? WHERE dm_per_hour IS NULL OR dm_per_hour <= 0`,
    ).run(Number(globalHour) || 20);
  }

  // Pipeline contact extras (Claude/Contact-menu scrape)
  const pipelineCols = db
    .prepare("PRAGMA table_info(pipeline_leads)")
    .all() as Array<{ name: string }>;
  const addPipelineCol = (name: string, ddl: string) => {
    if (!pipelineCols.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE pipeline_leads ADD COLUMN ${ddl}`);
    }
  };
  addPipelineCol("display_name", "display_name TEXT NOT NULL DEFAULT ''");
  addPipelineCol("email", "email TEXT NOT NULL DEFAULT ''");
  addPipelineCol("linkedin_url", "linkedin_url TEXT NOT NULL DEFAULT ''");
  addPipelineCol("profile_id", "profile_id TEXT NOT NULL DEFAULT ''");
  addPipelineCol("following", "following INTEGER NOT NULL DEFAULT 0");
  addPipelineCol("double_checked", "double_checked INTEGER NOT NULL DEFAULT 0");

  // Store LinkedIn as profile id only (dashboard rebuilds the full URL).
  const linkedinRows = db
    .prepare(
      `SELECT id, linkedin_url FROM pipeline_leads WHERE linkedin_url != '' AND linkedin_url LIKE '%linkedin.com%'`,
    )
    .all() as Array<{ id: number; linkedin_url: string }>;
  const shrinkLinkedin = db.prepare(
    `UPDATE pipeline_leads SET linkedin_url = ? WHERE id = ?`,
  );
  for (const row of linkedinRows) {
    const idOnly = linkedinProfileId(row.linkedin_url);
    if (idOnly && idOnly !== row.linkedin_url) {
      shrinkLinkedin.run(idOnly, row.id);
    }
  }

  // Backfill Collective profile slugs from the candidate name (id only).
  const missingProfiles = db
    .prepare(
      `SELECT id, display_name FROM pipeline_leads WHERE profile_id = '' AND display_name != ''`,
    )
    .all() as Array<{ id: number; display_name: string }>;
  const setProfile = db.prepare(
    `UPDATE pipeline_leads SET profile_id = ? WHERE id = ?`,
  );
  for (const row of missingProfiles) {
    const slug = slugifyCollectiveName(row.display_name);
    if (slug) setProfile.run(slug, row.id);
  }

  const settingsCount = db
    .prepare("SELECT COUNT(*) AS c FROM settings")
    .get() as { c: number };
  if (settingsCount.c === 0) {
    const insert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
    );
    insert.run("dm_per_day", "50");
    insert.run("dm_per_hour", "20");
    insert.run("today_sent", "0");
    insert.run("hour_batch", "0");
    insert.run(
      "search_brief",
      "full stack developer React Node TypeScript",
    );
  } else {
    const brief = db
      .prepare("SELECT value FROM settings WHERE key = 'search_brief'")
      .get() as { value: string } | undefined;
    if (!brief) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        "search_brief",
        "full stack developer React Node TypeScript",
      );
    }
  }

  // Backfill empty per-account briefs from legacy global setting
  const globalBrief = (
    db
      .prepare("SELECT value FROM settings WHERE key = 'search_brief'")
      .get() as { value: string } | undefined
  )?.value?.trim();
  if (globalBrief) {
    db.prepare(
      `UPDATE accounts SET search_brief = ? WHERE trim(search_brief) = ''`,
    ).run(globalBrief);
  }

  const workflowCount = db
    .prepare("SELECT COUNT(*) AS c FROM workflow_steps")
    .get() as { c: number };
  if (workflowCount.c === 0) {
    const insert = db.prepare(`
      INSERT INTO workflow_steps (track, step_key, step_label, subtitle, body, sort_order)
      VALUES (@track, @step_key, @step_label, @subtitle, @body, @sort_order)
    `);
    const tx = db.transaction(() => {
      for (const row of DEFAULT_WORKFLOW) insert.run(row);
    });
    tx();
  }
}

export function listAccounts(): CollectiveAccount[] {
  const rows = getDb()
    .prepare("SELECT * FROM accounts ORDER BY id ASC")
    .all() as CollectiveAccount[];
  const changed = rows.some((account) => syncDmSentWindow(account));
  if (!changed) return rows;
  return getDb()
    .prepare("SELECT * FROM accounts ORDER BY id ASC")
    .all() as CollectiveAccount[];
}

export function getAccount(id: number): CollectiveAccount | undefined {
  return getDb()
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(id) as CollectiveAccount | undefined;
}

export function getAccountBotConfig(id: number): AccountBotConfig {
  const account = getAccount(id);
  if (!account) return mergeBotConfig(null);
  try {
    const raw = account.bot_config_json
      ? JSON.parse(account.bot_config_json)
      : null;
    return mergeBotConfig(raw);
  } catch {
    return mergeBotConfig(null);
  }
}

/** First account (lowest id) is the template other accounts follow. */
export function getPrimaryAccountId(): number | null {
  const first = listAccounts()[0];
  return first?.id ?? null;
}

export function isPrimaryAccount(id: number): boolean {
  return getPrimaryAccountId() === id;
}

function writeBotConfigJson(id: number, config: AccountBotConfig): AccountBotConfig {
  const merged = mergeBotConfig(config);
  const result = getDb()
    .prepare(
      `UPDATE accounts SET bot_config_json = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(JSON.stringify(merged), id);
  if (!result.changes) {
    throw new Error("Account not found");
  }
  return merged;
}

/**
 * Save bot steps. Saving the first account always copies steps to every other account.
 */
export function saveAccountBotConfig(
  id: number,
  config: AccountBotConfig,
  opts?: { propagate?: boolean },
): AccountBotConfig {
  const merged = writeBotConfigJson(id, config);
  const primaryId = getPrimaryAccountId();
  const shouldPropagate =
    opts?.propagate === true || (opts?.propagate !== false && primaryId === id);

  if (shouldPropagate) {
    for (const account of listAccounts()) {
      if (account.id === id) continue;
      writeBotConfigJson(account.id, merged);
    }
  }
  return merged;
}

/** Copy first account's bot steps onto this account (or all if accountId omitted). */
export function syncBotConfigFromPrimary(accountId?: number): {
  primaryId: number;
  syncedIds: number[];
  config: AccountBotConfig;
} {
  const primaryId = getPrimaryAccountId();
  if (!primaryId) throw new Error("No accounts");
  const config = getAccountBotConfig(primaryId);
  const syncedIds: number[] = [];
  for (const account of listAccounts()) {
    if (account.id === primaryId) continue;
    if (accountId != null && account.id !== accountId) continue;
    writeBotConfigJson(account.id, config);
    syncedIds.push(account.id);
  }
  return { primaryId, syncedIds, config };
}

export function createAccount(input: AccountInput): CollectiveAccount {
  const defaultBrief =
    input.search_brief?.trim() || getSearchBrief();
  const defaults = getDefaultDmCaps();
  const dm_per_day =
    input.dm_per_day != null && Number.isFinite(input.dm_per_day)
      ? Math.max(0, Math.floor(input.dm_per_day))
      : defaults.dm_per_day;
  const dm_per_hour =
    input.dm_per_hour != null && Number.isFinite(input.dm_per_hour)
      ? Math.max(0, Math.floor(input.dm_per_hour))
      : defaults.dm_per_hour;
  const result = getDb()
    .prepare(
      `
    INSERT INTO accounts (
      owner_name, username, email, password,
      github_fs_repo, github_bc_repo, github_pat,
      proxy_ip, proxy_port, proxy_user, proxy_pass,
      search_brief, dm_per_day, dm_per_hour
    ) VALUES (
      @owner_name, @username, @email, @password,
      @github_fs_repo, @github_bc_repo, @github_pat,
      @proxy_ip, @proxy_port, @proxy_user, @proxy_pass,
      @search_brief, @dm_per_day, @dm_per_hour
    )
  `,
    )
    .run({
      owner_name: input.owner_name.trim(),
      username: input.username.trim(),
      email: input.email?.trim() ?? "",
      password: input.password ?? "",
      github_fs_repo: input.github_fs_repo ?? "",
      github_bc_repo: input.github_bc_repo ?? "",
      github_pat: input.github_pat ?? "",
      proxy_ip: input.proxy_ip?.trim() ?? "",
      proxy_port: input.proxy_port?.trim() ?? "",
      proxy_user: input.proxy_user?.trim() ?? "",
      proxy_pass: input.proxy_pass?.trim() ?? "",
      search_brief: defaultBrief,
      dm_per_day,
      dm_per_hour,
    });
  const created = getAccount(Number(result.lastInsertRowid))!;
  // New accounts inherit first account's bot steps when available
  const primaryId = getPrimaryAccountId();
  if (primaryId && primaryId !== created.id) {
    writeBotConfigJson(created.id, getAccountBotConfig(primaryId));
  }
  return getAccount(created.id)!;
}

export function updateAccount(
  id: number,
  input: AccountInput,
): CollectiveAccount | undefined {
  const existing = getAccount(id);
  if (!existing) return undefined;
  const dm_per_day =
    input.dm_per_day != null && Number.isFinite(Number(input.dm_per_day))
      ? Math.max(0, Math.floor(Number(input.dm_per_day)))
      : existing.dm_per_day;
  const dm_per_hour =
    input.dm_per_hour != null && Number.isFinite(Number(input.dm_per_hour))
      ? Math.max(0, Math.floor(Number(input.dm_per_hour)))
      : existing.dm_per_hour;
  getDb()
    .prepare(
      `
    UPDATE accounts SET
      owner_name = @owner_name,
      username = @username,
      email = @email,
      password = @password,
      github_fs_repo = @github_fs_repo,
      github_bc_repo = @github_bc_repo,
      github_pat = @github_pat,
      proxy_ip = @proxy_ip,
      proxy_port = @proxy_port,
      proxy_user = @proxy_user,
      proxy_pass = @proxy_pass,
      search_brief = @search_brief,
      dm_per_day = @dm_per_day,
      dm_per_hour = @dm_per_hour,
      updated_at = datetime('now')
    WHERE id = @id
  `,
    )
    .run({
      id,
      owner_name: input.owner_name.trim(),
      username: input.username.trim(),
      email: input.email?.trim() ?? "",
      password: input.password ?? existing.password,
      github_fs_repo: input.github_fs_repo ?? "",
      github_bc_repo: input.github_bc_repo ?? "",
      github_pat: input.github_pat ?? "",
      proxy_ip: input.proxy_ip?.trim() ?? "",
      proxy_port: input.proxy_port?.trim() ?? "",
      proxy_user: input.proxy_user?.trim() ?? "",
      proxy_pass: input.proxy_pass?.trim() ?? "",
      search_brief:
        input.search_brief?.trim() ||
        existing.search_brief ||
        getSearchBrief(),
      dm_per_day,
      dm_per_hour,
    });
  return getAccount(id);
}

/** Per-account Sherlock brief; falls back to legacy global setting. */
export function getAccountSearchBrief(accountId: number): string {
  const account = getAccount(accountId);
  const own = account?.search_brief?.trim();
  if (own) return own;
  return getSearchBrief();
}

export function deleteAccount(id: number): boolean {
  const result = getDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
  return result.changes > 0;
}

export function patchAccountStatus(
  id: number,
  patch: {
    start_status?: AccountStatusFlag;
    contact_status?: AccountStatusFlag;
    online_status?: AccountStatusFlag;
    error_message?: string;
  },
): CollectiveAccount | undefined {
  const account = getAccount(id);
  if (!account) return undefined;

  getDb()
    .prepare(
      `
    UPDATE accounts SET
      start_status = ?,
      contact_status = ?,
      online_status = ?,
      error_message = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `,
    )
    .run(
      patch.start_status ?? account.start_status,
      patch.contact_status ?? account.contact_status,
      patch.online_status ?? account.online_status,
      patch.error_message ?? account.error_message,
      id,
    );

  return getAccount(id);
}

export function setAccountAction(
  id: number,
  action: "open" | "start" | "contact" | "stop",
): CollectiveAccount | undefined {
  const account = getAccount(id);
  if (!account) return undefined;

  switch (action) {
    case "open":
      return patchAccountStatus(id, {
        online_status: "pending",
        error_message:
          "Waiting for Collective login — finish sign-in within 5 minutes",
      });
    case "start":
      return patchAccountStatus(id, {
        start_status: "yes",
        online_status: "yes",
        error_message: "",
      });
    case "contact":
      return patchAccountStatus(id, {
        contact_status: "yes",
        online_status: "yes",
        error_message: "",
      });
    case "stop":
      return patchAccountStatus(id, {
        start_status: "no",
        contact_status: "no",
        online_status: "no",
        error_message: "Stopped by operator",
      });
  }
}

/** Defaults used when creating a new account (legacy global settings). */
export function getDefaultDmCaps(): { dm_per_day: number; dm_per_hour: number } {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings")
    .all() as Array<{ key: string; value: string }>;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    dm_per_day: Number(map.dm_per_day ?? 50) || 50,
    dm_per_hour: Number(map.dm_per_hour ?? 20) || 20,
  };
}

/**
 * @deprecated Prefer getAccountDmLimits — global caps only seed new accounts.
 */
export function getDmLimits(): DmLimits {
  const caps = getDefaultDmCaps();
  return {
    dm_per_day: caps.dm_per_day,
    dm_per_hour: caps.dm_per_hour,
    today_sent: 0,
    hour_batch: 0,
  };
}

const DM_HOUR_MS = 60 * 60 * 1000;

/**
 * Sent-message counters for one account.
 * Day/hour windows that have elapsed drop back to 0. A new hour window
 * starts on the next successful send, not when this is read.
 * Returns true when a row was updated.
 */
function syncDmSentWindow(account: CollectiveAccount): boolean {
  const todayKey = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const hourStarted = Number(account.dm_hour_started_at || 0);
  const quotaDay = account.dm_quota_day || "";
  const hourOpen = hourStarted > 0 && now - hourStarted < DM_HOUR_MS;

  const patches: string[] = [];
  const params: Array<string | number> = [];

  if (!quotaDay) {
    patches.push("dm_quota_day = ?");
    params.push(todayKey);
  } else if (quotaDay !== todayKey) {
    patches.push("today_count = ?", "dm_quota_day = ?");
    params.push(0, todayKey);
  }

  if (!hourOpen && (Number(account.dm_hour_batch || 0) !== 0 || hourStarted)) {
    patches.push("dm_hour_batch = ?", "dm_hour_started_at = ?");
    params.push(0, "");
  }

  if (!patches.length) return false;
  params.push(account.id);
  getDb()
    .prepare(
      `UPDATE accounts SET ${patches.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(...params);
  return true;
}

/** Per-account DM quota with day/hour rollover for that bot only. */
export function getAccountDmLimits(accountId: number): DmLimits {
  const account = getAccount(accountId);
  if (!account) {
    return { dm_per_day: 0, dm_per_hour: 0, today_sent: 0, hour_batch: 0 };
  }

  syncDmSentWindow(account);
  const fresh = getAccount(accountId) ?? account;

  return {
    dm_per_day: Number(fresh.dm_per_day ?? 50) || 50,
    dm_per_hour: Number(fresh.dm_per_hour ?? 20) || 20,
    today_sent: Number(fresh.today_count ?? 0),
    hour_batch: Number(fresh.dm_hour_batch ?? 0),
  };
}

export function saveAccountDmLimits(
  accountId: number,
  dm_per_day: number,
  dm_per_hour: number,
): DmLimits {
  const existing = getAccount(accountId);
  if (!existing) {
    throw new Error("Account not found");
  }
  const day = Math.max(0, Math.floor(dm_per_day));
  const hour = Math.max(0, Math.floor(dm_per_hour));
  getDb()
    .prepare(
      `UPDATE accounts SET
        dm_per_day = ?,
        dm_per_hour = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
    )
    .run(day, hour, accountId);
  return getAccountDmLimits(accountId);
}

export function getSearchBrief(): string {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'search_brief'")
    .get() as { value: string } | undefined;
  return (
    row?.value?.trim() ||
    "full stack developer React Node TypeScript"
  );
}

export function saveSearchBrief(brief: string): string {
  const value = brief.trim();
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('search_brief', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(value);
  return getSearchBrief();
}

export function logOutreach(input: {
  account_id: number;
  seller_key?: string;
  seller_name?: string;
  action: "sent" | "skipped" | "error" | "info" | "contacting";
  detail?: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO outreach_log (account_id, seller_key, seller_name, action, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.account_id,
      input.seller_key ?? "",
      input.seller_name ?? "",
      input.action,
      input.detail ?? "",
    );
}

export function listOutreachLog(limit = 50) {
  return getDb()
    .prepare(
      `SELECT * FROM outreach_log ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);
}

/** @deprecated Global defaults for new accounts only — use saveAccountDmLimits. */
export function saveDmLimits(dm_per_day: number, dm_per_hour: number): DmLimits {
  const upsert = getDb().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  upsert.run("dm_per_day", String(Math.max(0, Math.floor(dm_per_day))));
  upsert.run("dm_per_hour", String(Math.max(0, Math.floor(dm_per_hour))));
  return getDmLimits();
}

/** +1 sent DM for this account. Skipped and failed profiles must not call this. */
export function recordDmSent(accountId: number): DmLimits {
  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  getDb()
    .prepare(
      `UPDATE accounts SET
        today_count = CASE
          WHEN dm_quota_day = @today OR dm_quota_day = '' OR dm_quota_day IS NULL
          THEN today_count + 1
          ELSE 1
        END,
        dm_quota_day = @today,
        dm_hour_batch = CASE
          WHEN dm_hour_started_at != ''
           AND (@now - CAST(dm_hour_started_at AS INTEGER)) < @hourMs
          THEN dm_hour_batch + 1
          ELSE 1
        END,
        dm_hour_started_at = CASE
          WHEN dm_hour_started_at != ''
           AND (@now - CAST(dm_hour_started_at AS INTEGER)) < @hourMs
          THEN dm_hour_started_at
          ELSE @nowText
        END,
        updated_at = datetime('now')
      WHERE id = @id`,
    )
    .run({
      today: todayKey,
      now,
      hourMs: DM_HOUR_MS,
      nowText: String(now),
      id: accountId,
    });
  return getAccountDmLimits(accountId);
}

export function pipelineHasSeller(sellerUsername: string): boolean {
  const seller = sellerUsername.replace(/^@/, "").trim().toLowerCase();
  const row = getDb()
    .prepare(
      "SELECT 1 AS ok FROM pipeline_leads WHERE platform = 'collective' AND lower(seller_username) = ? LIMIT 1",
    )
    .get(seller) as { ok: number } | undefined;
  return Boolean(row);
}

/** True if this seller already got a sent DM or is claimed / intentionally skipped. */
export function alreadyMessagedSeller(sellerUsername: string): boolean {
  const seller = sellerUsername.replace(/^@/, "").trim().toLowerCase();
  if (!seller) return false;

  const lead = getDb()
    .prepare(
      `SELECT status FROM pipeline_leads
       WHERE platform = 'collective' AND lower(seller_username) = ?
       LIMIT 1`,
    )
    .get(seller) as { status: string } | undefined;
  if (lead) {
    // error → allow retry; everything else is claimed / done / skipped
    if (lead.status !== "error") return true;
  }

  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM outreach_log
       WHERE action = 'sent' AND lower(seller_key) = ?
       LIMIT 1`,
    )
    .get(seller) as { ok: number } | undefined;
  return Boolean(row);
}

export function listPipeline(filters?: {
  status?: string;
  step?: string;
  platform?: string;
  q?: string;
}): PipelineLead[] {
  let sql = "SELECT * FROM pipeline_leads WHERE 1=1";
  const params: string[] = [];

  if (filters?.platform && filters.platform !== "All") {
    sql += " AND lower(platform) = lower(?)";
    params.push(filters.platform);
  }
  if (filters?.status && filters.status !== "All") {
    sql += " AND status = ?";
    params.push(filters.status);
  }
  if (filters?.step && filters.step !== "All") {
    sql += " AND step = ?";
    params.push(filters.step);
  }
  if (filters?.q?.trim()) {
    const q = `%${filters.q.trim().toLowerCase()}%`;
    sql +=
      " AND (lower(display_name) LIKE ? OR lower(seller_username) LIKE ? OR lower(email) LIKE ? OR lower(linkedin_url) LIKE ? OR lower(profile_id) LIKE ?)";
    params.push(q, q, q, q, q);
  }

  sql += " ORDER BY datetime(last_activity) DESC, id DESC";
  return getDb().prepare(sql).all(...params) as PipelineLead[];
}

export function listPipelinePlatforms(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT platform FROM pipeline_leads ORDER BY platform ASC`,
    )
    .all() as Array<{ platform: string }>;
  return rows.map((r) => r.platform).filter(Boolean);
}

/**
 * Fill LinkedIn id + Collective profile slug on existing rows.
 * Matches `seller_username`. Does not change status, flags, or sent-DM state.
 */
export function importProfileLinks(rows: ProfileLinkRow[]): {
  updated: number;
  missing: number;
  skipped: number;
} {
  const db = getDb();
  const find = db.prepare(
    `SELECT id FROM pipeline_leads
     WHERE platform = 'collective' AND lower(seller_username) = lower(?)`,
  );
  const write = db.prepare(
    `UPDATE pipeline_leads SET
       display_name = CASE WHEN @display_name != '' THEN @display_name ELSE display_name END,
       linkedin_url = CASE WHEN @linkedin_id != '' THEN @linkedin_id ELSE linkedin_url END,
       profile_id = CASE WHEN @profile_id != '' THEN @profile_id ELSE profile_id END,
       updated_at = datetime('now')
     WHERE id = @id`,
  );
  let updated = 0;
  let missing = 0;
  let skipped = 0;
  const apply = db.transaction((list: ProfileLinkRow[]) => {
    for (const row of list) {
      const ids = profileLinkIds(row);
      if (!ids.seller_username) {
        skipped += 1;
        continue;
      }
      if (!ids.profile_id && !ids.linkedin_id && !ids.display_name) {
        skipped += 1;
        continue;
      }
      const existing = find.get(ids.seller_username) as { id: number } | undefined;
      if (!existing) {
        missing += 1;
        continue;
      }
      write.run({
        id: existing.id,
        display_name: ids.display_name,
        linkedin_id: ids.linkedin_id,
        profile_id: ids.profile_id,
      });
      updated += 1;
    }
  });
  apply(rows);
  return { updated, missing, skipped };
}

/** Upsert by (platform, seller_username) — prevents duplicate chat/connection rows across bots. */
export function upsertPipelineLead(input: {
  platform?: string;
  seller_username: string;
  display_name?: string;
  track?: "fullstack" | "blockchain";
  step?: string;
  status?: string;
  replies?: number;
  wait_label?: string;
  github_url?: string;
  email?: string;
  linkedin_url?: string;
  profile_id?: string;
  following?: number | boolean;
  double_checked?: number | boolean;
  assigned_account_id?: number | null;
}): PipelineLead {
  const seller = input.seller_username.replace(/^@/, "").trim();
  const platform = (input.platform || "collective").trim().toLowerCase();
  const linkedin = linkedinProfileId(input.linkedin_url);
  const profileId = collectiveProfileId(input.profile_id || input.display_name);
  getDb()
    .prepare(
      `
    INSERT INTO pipeline_leads (
      platform, seller_username, display_name, track, step, status, replies,
      wait_label, github_url, email, linkedin_url, profile_id, following, double_checked,
      assigned_account_id, last_activity
    ) VALUES (
      @platform, @seller_username, @display_name, @track, @step, @status, @replies,
      @wait_label, @github_url, @email, @linkedin_url, @profile_id, @following, @double_checked,
      @assigned_account_id, datetime('now')
    )
    ON CONFLICT(platform, seller_username) DO UPDATE SET
      display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE pipeline_leads.display_name END,
      track = COALESCE(excluded.track, pipeline_leads.track),
      step = COALESCE(excluded.step, pipeline_leads.step),
      status = COALESCE(excluded.status, pipeline_leads.status),
      replies = COALESCE(excluded.replies, pipeline_leads.replies),
      wait_label = COALESCE(excluded.wait_label, pipeline_leads.wait_label),
      github_url = CASE WHEN excluded.github_url != '' THEN excluded.github_url ELSE pipeline_leads.github_url END,
      email = CASE WHEN excluded.email != '' THEN excluded.email ELSE pipeline_leads.email END,
      linkedin_url = CASE WHEN excluded.linkedin_url != '' THEN excluded.linkedin_url ELSE pipeline_leads.linkedin_url END,
      profile_id = CASE WHEN excluded.profile_id != '' THEN excluded.profile_id ELSE pipeline_leads.profile_id END,
      assigned_account_id = COALESCE(excluded.assigned_account_id, pipeline_leads.assigned_account_id),
      last_activity = datetime('now'),
      updated_at = datetime('now')
  `,
    )
    .run({
      platform,
      seller_username: seller,
      display_name: input.display_name ?? "",
      track: input.track ?? "fullstack",
      step: input.step ?? "Contact",
      status: input.status ?? "waiting",
      replies: input.replies ?? 0,
      wait_label: input.wait_label ?? "—",
      github_url: input.github_url ?? "",
      email: input.email ?? "",
      linkedin_url: linkedin,
      profile_id: profileId,
      following:
        input.following !== undefined ? (input.following ? 1 : 0) : 0,
      double_checked:
        input.double_checked !== undefined
          ? input.double_checked
            ? 1
            : 0
          : 0,
      assigned_account_id: input.assigned_account_id ?? null,
    });

  return getDb()
    .prepare(
      "SELECT * FROM pipeline_leads WHERE platform = ? AND seller_username = ?",
    )
    .get(platform, seller) as PipelineLead;
}

export function patchPipelineLead(
  id: number,
  patch: {
    following?: boolean | number;
    double_checked?: boolean | number;
    linkedin_url?: string;
    email?: string;
    display_name?: string;
    status?: string;
  },
): PipelineLead | undefined {
  const existing = getDb()
    .prepare("SELECT * FROM pipeline_leads WHERE id = ?")
    .get(id) as PipelineLead | undefined;
  if (!existing) return undefined;

  const following =
    patch.following !== undefined
      ? patch.following
        ? 1
        : 0
      : existing.following;
  const double_checked =
    patch.double_checked !== undefined
      ? patch.double_checked
        ? 1
        : 0
      : existing.double_checked;
  const linkedin_url =
    patch.linkedin_url !== undefined
      ? linkedinProfileId(patch.linkedin_url)
      : existing.linkedin_url;

  getDb()
    .prepare(
      `UPDATE pipeline_leads SET
        following = ?,
        double_checked = ?,
        linkedin_url = ?,
        email = ?,
        display_name = ?,
        status = ?,
        updated_at = datetime('now'),
        last_activity = datetime('now')
      WHERE id = ?`,
    )
    .run(
      following,
      double_checked,
      linkedin_url,
      patch.email !== undefined ? patch.email : existing.email,
      patch.display_name !== undefined
        ? patch.display_name
        : existing.display_name,
      patch.status !== undefined ? patch.status : existing.status,
      id,
    );

  return getDb()
    .prepare("SELECT * FROM pipeline_leads WHERE id = ?")
    .get(id) as PipelineLead;
}

export function seedDemoPipelineIfEmpty() {
  const count = getDb()
    .prepare(
      "SELECT COUNT(*) AS c FROM pipeline_leads WHERE platform = 'collective'",
    )
    .get() as { c: number };
  if (count.c > 0) return;
  const demos = [
    "manann_pro",
    "art_ab",
    "haris_103",
    "mughiraahmed",
    "sakib962",
    "mh_tech11",
  ];
  demos.forEach((seller, i) => {
    upsertPipelineLead({
      seller_username: seller,
      track: i % 2 === 0 ? "fullstack" : "blockchain",
      step: i === 0 ? "Contact" : i < 3 ? "Step2" : "Step7",
      status: "waiting",
      replies: i === 2 ? 7 : i % 3,
    });
  });
}

export function listWorkflow(track: "fullstack" | "blockchain"): WorkflowStep[] {
  return getDb()
    .prepare(
      "SELECT * FROM workflow_steps WHERE track = ? ORDER BY sort_order ASC",
    )
    .all(track) as WorkflowStep[];
}

export function saveWorkflowSteps(
  track: "fullstack" | "blockchain",
  steps: Array<{ step_key: string; body: string }>,
): WorkflowStep[] {
  const update = getDb().prepare(`
    UPDATE workflow_steps SET body = ?, updated_at = datetime('now')
    WHERE track = ? AND step_key = ?
  `);
  const tx = getDb().transaction(() => {
    for (const step of steps) {
      update.run(step.body, track, step.step_key);
    }
  });
  tx();
  return listWorkflow(track);
}
