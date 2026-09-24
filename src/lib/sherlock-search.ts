import type { Page, Locator } from "playwright";

/** Correct Sherlock search entry (recruiter). */
const SHERLOCK_SEARCH = "https://app.collective.work/recruiter/sherlock/search";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function countMessagableCards(page: Page): Promise<number> {
  return page.evaluate(() => {
    const buttons = document.querySelectorAll('[data-dd-id="contact-button"]');
    return buttons.length;
  });
}

async function isResultsLoading(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const spinners = document.querySelectorAll(
      '.chakra-spinner, [class*="spinner"], [data-loading="true"], [aria-busy="true"]',
    );
    for (const el of spinners) {
      const style = window.getComputedStyle(el);
      if (style.display !== "none" && style.visibility !== "hidden") return true;
    }
    const body = document.body?.innerText?.toLowerCase() ?? "";
    if (
      /searching|loading results|loading candidates|finding profiles|analyzing/.test(
        body,
      )
    ) {
      return true;
    }
    return false;
  });
}

/** Go to Sherlock search page with the description textarea. */
export async function goToSherlock(page: Page): Promise<void> {
  await page.goto(SHERLOCK_SEARCH, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await sleep(1500);

  // Wait for the known search box
  const box = page.locator('textarea[name="description"]').first();
  await box.waitFor({ state: "visible", timeout: 45_000 }).catch(() => undefined);
}

/**
 * Exact Sherlock search field:
 * <textarea name="description" placeholder="Describe the profile you are looking for...">
 */
async function findSearchBox(page: Page): Promise<Locator | null> {
  const primary = page.locator('textarea[name="description"]').first();
  if (await primary.isVisible().catch(() => false)) return primary;

  const byPlaceholder = page
    .getByPlaceholder(/Describe the profile you are looking for/i)
    .first();
  if (await byPlaceholder.isVisible().catch(() => false)) return byPlaceholder;

  const chakra = page.locator("textarea.chakra-textarea").first();
  if (await chakra.isVisible().catch(() => false)) return chakra;

  return null;
}

async function typeBrief(box: Locator, query: string) {
  await box.click({ timeout: 8000 });
  await sleep(200);
  await box.fill("");
  await box.fill(query);
  // Confirm value stuck (React controlled fields)
  const value = await box.inputValue().catch(() => "");
  if (!value.includes(query.slice(0, Math.min(20, query.length)))) {
    await box.click({ timeout: 3000 });
    await box.press("Control+A").catch(() => undefined);
    await box.type(query, { delay: 12 });
  }
}

/**
 * Search Sherlock with the brief (supports multiple skills in one description),
 * wait until searching finishes and Contact buttons are stable, then return count.
 */
export async function searchSherlockAndWait(
  page: Page,
  brief: string,
): Promise<{ cardCount: number; url: string }> {
  const query = brief.trim();
  if (!query) {
    throw new Error("Set a Sherlock search brief before Contact/Start");
  }

  await goToSherlock(page);

  const box = await findSearchBox(page);
  if (!box) {
    throw new Error(
      `Sherlock description textarea not found (url=${page.url()}). Expected textarea[name="description"].`,
    );
  }

  await typeBrief(box, query);
  await sleep(400);

  // Submit: prefer a Search / submit button near the form, else Enter
  const searchBtn = page
    .getByRole("button", { name: /search|find|ask sherlock|submit|go/i })
    .first();
  if (await searchBtn.isVisible().catch(() => false)) {
    await searchBtn.click({ timeout: 8000 });
  } else {
    await box.press("Enter");
  }

  // Give search a moment to start (spinner / navigating)
  await sleep(1500);

  // Wait until loading is done AND at least one Contact button exists, then stabilize
  const cardCount = await waitForSearchThenStableResults(page);
  if (cardCount === 0) {
    throw new Error(
      `Sherlock finished but found 0 candidates with Contact for "${query.slice(0, 80)}" (url=${page.url()})`,
    );
  }
  return { cardCount, url: page.url() };
}

/**
 * 1) Wait while "searching" / spinner is active (up to timeout)
 * 2) Then poll Contact-button count until it stops changing
 */
export async function waitForSearchThenStableResults(
  page: Page,
  opts?: { searchTimeoutMs?: number; stableTimeoutMs?: number },
): Promise<number> {
  const searchTimeoutMs = opts?.searchTimeoutMs ?? 120_000;
  const stableTimeoutMs = opts?.stableTimeoutMs ?? 60_000;
  const started = Date.now();

  // Phase A — wait for search activity to appear then finish, or cards to show
  let sawLoading = false;
  while (Date.now() - started < searchTimeoutMs) {
    const loading = await isResultsLoading(page);
    const count = await countMessagableCards(page);
    if (loading) sawLoading = true;
    if (sawLoading && !loading && count > 0) break;
    if (!sawLoading && count > 0 && Date.now() - started > 8_000) break;
    // Also break if URL moved to a results id path and cards exist
    if (/\/sherlock\/search\//i.test(page.url()) && count > 0 && !loading) break;
    await sleep(1000);
  }

  // Phase B — stabilize card count
  return waitForStableResults(page, {
    timeoutMs: stableTimeoutMs,
    stableRounds: 3,
  });
}

export async function waitForStableResults(
  page: Page,
  opts?: { timeoutMs?: number; stableRounds?: number },
): Promise<number> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const needStable = opts?.stableRounds ?? 3;
  const started = Date.now();
  let last = -1;
  let stable = 0;
  let lastCount = 0;

  while (Date.now() - started < timeoutMs) {
    const loading = await isResultsLoading(page);
    const count = await countMessagableCards(page);
    lastCount = count;

    if (!loading && count > 0 && count === last) {
      stable += 1;
      if (stable >= needStable) return count;
    } else {
      stable = 0;
      last = count;
    }
    await sleep(1000);
  }

  return lastCount;
}

export async function scrollSherlockResults(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main =
      document.querySelector('[data-overlay-container], main, [role="main"]') ||
      document.scrollingElement ||
      document.body;
    main.scrollBy(0, 1200);
  });
  await sleep(1200);
  await waitForStableResults(page, { timeoutMs: 20_000, stableRounds: 2 });
}
