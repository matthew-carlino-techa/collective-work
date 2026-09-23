import fs from "fs";
import path from "path";
import type { BrowserContext, Page } from "playwright";

export function botExtensionPath() {
  return path.join(process.cwd(), "extensions", "collective-bot-control");
}

let cachedScript: string | null = null;

function readContentScript(): string {
  if (cachedScript) return cachedScript;
  const file = path.join(botExtensionPath(), "content.js");
  cachedScript = fs.readFileSync(file, "utf8");
  return cachedScript;
}

/**
 * Google Chrome no longer honors --load-extension.
 * We inject the same Bot Control script into every page so the bar + picker
 * always exist in each account browser.
 */
export async function attachBotControl(context: BrowserContext): Promise<void> {
  const source = readContentScript();
  await context.addInitScript({ content: source });

  for (const page of context.pages()) {
    await injectIntoPage(page, source);
  }

  context.on("page", (page) => {
    void injectIntoPage(page, source);
  });
}

async function injectIntoPage(page: Page, source: string) {
  try {
    if (page.isClosed()) return;
    await page.addInitScript({ content: source });
    await page.evaluate(source);
  } catch {
    // about:blank / navigating — init script still covers next load
  }
}

export async function ensureBotControlOnPage(page: Page): Promise<boolean> {
  const source = readContentScript();
  try {
    const ok = await page.evaluate((src) => {
      if (!(window as unknown as { __collectiveBot?: unknown }).__collectiveBot) {
        // eslint-disable-next-line no-eval
        eval(src);
      }
      return Boolean(
        (window as unknown as { __collectiveBot?: unknown }).__collectiveBot,
      );
    }, source);
    return ok;
  } catch {
    return false;
  }
}
