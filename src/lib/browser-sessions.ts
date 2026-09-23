import { execFile } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { promisify } from "util";
import { chromium, type BrowserContext, type Page } from "playwright";
import { getAccount, patchAccountStatus } from "@/lib/db";
import {
  attachBotControl,
  botExtensionPath,
  ensureBotControlOnPage,
} from "@/lib/bot-control-inject";
import type { CollectiveAccount } from "@/lib/types";

const execFileAsync = promisify(execFile);

const COLLECTIVE_URL = "https://app.collective.work/";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 1500;
const NAV_TIMEOUT_MS = 60_000;

type Session = {
  accountId: number;
  context: BrowserContext;
  page: Page;
  closed: boolean;
};

type GlobalSessions = {
  __collectiveBrowserSessions?: Map<number, Session>;
};

function sessionMap(): Map<number, Session> {
  const g = globalThis as GlobalSessions;
  if (!g.__collectiveBrowserSessions) {
    g.__collectiveBrowserSessions = new Map();
  }
  return g.__collectiveBrowserSessions;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProxy(account: CollectiveAccount) {
  const ip = account.proxy_ip?.trim();
  const port = account.proxy_port?.trim();
  if (!ip || !port) {
    throw new Error("Set proxy IP and port on the account before Open");
  }

  const proxy: { server: string; username?: string; password?: string } = {
    server: `http://${ip}:${port}`,
  };
  const user = account.proxy_user?.trim();
  const pass = account.proxy_pass?.trim();
  if (user) proxy.username = user;
  if (pass) proxy.password = pass;
  return proxy;
}

function profileDir(accountId: number) {
  const dir = path.join(
    process.cwd(),
    "data",
    "browser-profiles",
    String(accountId),
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionMetaPath(accountId: number) {
  return path.join(profileDir(accountId), "session-meta.json");
}

function writeSessionMeta(accountId: number, data: Record<string, unknown>) {
  fs.writeFileSync(
    sessionMetaPath(accountId),
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2),
  );
}

function readSessionMeta(accountId: number): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(sessionMetaPath(accountId), "utf8"));
  } catch {
    return null;
  }
}

function clearChromeLocks(accountId: number) {
  const dir = profileDir(accountId);
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // ignore
    }
  }
}

function tcpReachable(host: string, port: number, ms = 10_000): Promise<boolean> {
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

async function ensureProxyReachable(ip: string, port: string): Promise<void> {
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) {
    throw new Error(`Invalid proxy port: ${port}`);
  }

  if (await tcpReachable(ip, portNum)) return;

  for (const args of [
    ["tunnel", "ip", "add", ip],
    ["tunnel", "ip", "add-range", `${ip}/32`],
  ]) {
    try {
      await execFileAsync("warp-cli", args, { timeout: 10_000 });
    } catch {
      // ignore
    }
  }

  await sleep(2000);
  if (await tcpReachable(ip, portNum)) return;

  throw new Error(
    `Proxy ${ip}:${port} unreachable (TCP timeout). Run: warp-cli tunnel ip add ${ip}`,
  );
}

export async function detectLoggedIn(page: Page): Promise<boolean> {
  try {
    if (page.isClosed()) return false;

    const url = page.url().toLowerCase();
    if (/\/(login|signin|sign-in|auth|register|signup)/.test(url)) {
      return false;
    }

    const loggedIn = await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() ?? "";
      if (/log\s*out|sign\s*out|sherlock|recruiter/.test(body)) return true;
      if (
        document.querySelector(
          '[data-dd-id="contact-button"], .chakra-avatar__img, [aria-label*="Account" i]',
        )
      ) {
        return true;
      }
      return false;
    });
    if (loggedIn) return true;

    const cookies = await page.context().cookies();
    return cookies.some(
      (c) =>
        /collective\.work/i.test(c.domain) &&
        /session|token|auth|user|access|refresh|sb-/i.test(c.name) &&
        !/cf_|__cf/i.test(c.name) &&
        Boolean(c.value) &&
        c.value.length > 8,
    );
  } catch {
    return false;
  }
}

async function tryAutoLogin(page: Page, account: CollectiveAccount) {
  const email = account.email?.trim();
  const password = account.password?.trim();
  if (!email || !password || page.isClosed()) return false;

  try {
    const emailInput = page
      .locator(
        'input[type="email"], input[name*="email" i], input[autocomplete="username"], input[placeholder*="email" i]',
      )
      .first();
    const passInput = page
      .locator(
        'input[type="password"], input[name*="pass" i], input[autocomplete="current-password"]',
      )
      .first();

    if ((await emailInput.count()) === 0 || (await passInput.count()) === 0) {
      return false;
    }
    if (!(await emailInput.isVisible().catch(() => false))) return false;

    await emailInput.fill(email, { timeout: 2000 });
    await passInput.fill(password, { timeout: 2000 });

    const submit = page
      .locator(
        'button[type="submit"], button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign in"), button:has-text("Continue")',
      )
      .first();
    if (
      (await submit.count()) > 0 &&
      (await submit.isEnabled().catch(() => false))
    ) {
      await submit.click({ timeout: 2000 });
    } else {
      await passInput.press("Enter");
    }
    return true;
  } catch {
    return false;
  }
}

async function softGoto(page: Page, url = COLLECTIVE_URL): Promise<boolean> {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    await ensureBotControlOnPage(page);
    return true;
  } catch {
    await ensureBotControlOnPage(page);
    return false;
  }
}

async function watchLogin(account: CollectiveAccount, session: Session) {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let submitted = false;
  let lastNavAttempt = 0;

  try {
    while (Date.now() < deadline) {
      const current = sessionMap().get(account.id);
      if (!current || current.closed || current !== session) return;

      if (await detectLoggedIn(session.page)) {
        writeSessionMeta(account.id, {
          accountId: account.id,
          loggedIn: true,
          url: session.page.url(),
        });
        patchAccountStatus(account.id, {
          online_status: "yes",
          error_message: "Logged in — session saved. Click Start to outreach.",
        });
        return;
      }

      const url = session.page.url();
      if (
        (!url || url === "about:blank" || url.startsWith("chrome-error://")) &&
        Date.now() - lastNavAttempt > 20_000
      ) {
        lastNavAttempt = Date.now();
        await softGoto(session.page);
      }

      if (!submitted) {
        submitted = await tryAutoLogin(session.page, account);
      }

      await sleep(POLL_MS);
    }

    if (sessionMap().get(account.id) === session) {
      patchAccountStatus(account.id, {
        online_status: "no",
        error_message:
          "Timed out waiting for login — finish sign-in within 5 minutes",
      });
      await closeAccountSession(account.id, false);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Browser session failed";
    patchAccountStatus(account.id, {
      online_status: "no",
      error_message: message,
    });
    await closeAccountSession(account.id, false);
  }
}

async function launchContext(account: CollectiveAccount): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const proxy = buildProxy(account);
  await ensureProxyReachable(account.proxy_ip.trim(), account.proxy_port.trim());

  clearChromeLocks(account.id);
  const display = process.env.DISPLAY || ":20.0";
  const extPath = path.resolve(botExtensionPath());
  if (!fs.existsSync(path.join(extPath, "manifest.json"))) {
    throw new Error(`Bot extension missing at ${extPath}`);
  }

  // Note: branded Google Chrome ignores --load-extension; we still pass the
  // flags for Chromium, and always inject Bot Control via attachBotControl().
  const context = await chromium.launchPersistentContext(profileDir(account.id), {
    channel: "chrome",
    headless: false,
    proxy,
    viewport: { width: 1360, height: 900 },
    env: { ...process.env, DISPLAY: display },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      `--window-name=Collective:${account.username}`,
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
    ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
  });

  await attachBotControl(context);

  const page = context.pages()[0] ?? (await context.newPage());
  await ensureBotControlOnPage(page);
  return { context, page };
}

function bindSession(
  accountId: number,
  context: BrowserContext,
  page: Page,
): Session {
  const session: Session = {
    accountId,
    context,
    page,
    closed: false,
  };
  sessionMap().set(accountId, session);

  context.on("close", () => {
    session.closed = true;
    if (sessionMap().get(accountId) === session) {
      sessionMap().delete(accountId);
    }
  });

  writeSessionMeta(accountId, {
    accountId,
    launched: true,
    url: page.url(),
  });

  return session;
}

/** Launch headed Chrome via account proxy (saves cookies in profile dir). */
export async function openAccountSession(
  account: CollectiveAccount,
): Promise<void> {
  await closeAccountSession(account.id, false);

  let context: BrowserContext;
  let page: Page;
  try {
    ({ context, page } = await launchContext(account));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to launch Chrome";
    throw new Error(`Could not open browser: ${message}`);
  }

  const session = bindSession(account.id, context, page);

  const reached = await softGoto(page);
  if (!reached) {
    patchAccountStatus(account.id, {
      online_status: "pending",
      error_message:
        "Proxy connected but Collective load is slow — finish login in Chrome",
    });
  } else {
    patchAccountStatus(account.id, {
      online_status: "pending",
      error_message:
        "Waiting for Collective login — finish sign-in within 5 minutes",
    });
    await tryAutoLogin(page, account);
  }

  void watchLogin(account, session);
}

/**
 * Ensure an attached Playwright session exists.
 * Reuses memory session, otherwise relaunches the saved Chrome profile
 * (cookies persist on disk under data/browser-profiles/{id}).
 */
export async function ensureAccountSession(
  accountId: number,
): Promise<Page> {
  const live = getOpenPage(accountId);
  if (live) return live;

  const account = getAccount(accountId);
  if (!account) throw new Error("Account not found");
  if (!account.proxy_ip?.trim() || !account.proxy_port?.trim()) {
    throw new Error("Set proxy IP and port before Start/Contact");
  }

  patchAccountStatus(accountId, {
    error_message: "Reconnecting saved Chrome session…",
  });

  let context: BrowserContext;
  let page: Page;
  try {
    ({ context, page } = await launchContext(account));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reconnect Chrome";
    throw new Error(
      `No live session and reconnect failed: ${message}. Click Open first.`,
    );
  }

  bindSession(accountId, context, page);

  // Prefer staying on current profile page; otherwise go to app
  if (!page.url() || page.url() === "about:blank") {
    await softGoto(page);
  }

  if (!(await detectLoggedIn(page))) {
    await tryAutoLogin(page, account);
    await sleep(2500);
  }

  if (!(await detectLoggedIn(page))) {
    patchAccountStatus(accountId, {
      online_status: "pending",
      error_message:
        "Chrome reconnected but not logged in — finish login, then Start again",
    });
    throw new Error(
      "Saved browser opened but not logged in. Finish login in Chrome, then click Start again.",
    );
  }

  writeSessionMeta(accountId, {
    accountId,
    loggedIn: true,
    url: page.url(),
    reconnected: true,
  });
  patchAccountStatus(accountId, {
    online_status: "yes",
    error_message: "Session restored from saved profile",
  });

  return page;
}

export async function closeAccountSession(
  accountId: number,
  updateStatus: boolean,
): Promise<void> {
  const session = sessionMap().get(accountId);
  if (!session) {
    if (updateStatus) {
      patchAccountStatus(accountId, {
        start_status: "no",
        contact_status: "no",
        online_status: "no",
        error_message: "Stopped by operator",
      });
    }
    return;
  }

  session.closed = true;
  sessionMap().delete(accountId);
  try {
    await session.context.close();
  } catch {
    // already closed
  }

  writeSessionMeta(accountId, { accountId, closed: true });

  if (updateStatus) {
    patchAccountStatus(accountId, {
      start_status: "no",
      contact_status: "no",
      online_status: "no",
      error_message: "Stopped by operator",
    });
  }
}

export function hasOpenSession(accountId: number): boolean {
  const session = sessionMap().get(accountId);
  return Boolean(session && !session.closed && !session.page.isClosed());
}

export function getOpenPage(accountId: number): Page | undefined {
  const session = sessionMap().get(accountId);
  if (!session || session.closed || session.page.isClosed()) return undefined;
  return session.page;
}

export function hasSavedProfile(accountId: number): boolean {
  return fs.existsSync(profileDir(accountId));
}

export function getSessionMeta(accountId: number) {
  return readSessionMeta(accountId);
}
