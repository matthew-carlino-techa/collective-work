import type { Page } from "playwright";
import { COLLECTIVE_URL, DOM, isResultsUrl } from "@/lib/collective-dom";
import {
  collectiveProfileId,
  slugifyCollectiveName,
} from "@/lib/collective-url";
import type { AccountBotConfig } from "@/lib/bot-config";
import type { CollectiveAccount } from "@/lib/types";

function profileIdFor(name?: string, href?: string) {
  const fromHref = href ? collectiveProfileId(href) : "";
  if (fromHref) return fromHref;
  const n = (name || "").trim();
  if (!n || n === "there") return "";
  return slugifyCollectiveName(n);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fillReactTextarea(page: Page, selector: string, value: string) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 30_000 });
  await locator.click({ timeout: 8000 });
  await locator.evaluate((el, v) => {
    const ta = el as HTMLTextAreaElement;
    const desc = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    );
    desc?.set?.call(ta, v);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  const got = await locator.inputValue().catch(() => "");
  if (!got.includes(value.slice(0, Math.min(24, value.length)))) {
    await locator.fill(value);
  }
}

async function waitForResults(page: Page, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const urlOk = isResultsUrl(page.url());
    const n = await page.locator(DOM.resultCard).count().catch(() => 0);
    const found = await page
      .getByText(/relevant profiles found/i)
      .first()
      .isVisible()
      .catch(() => false);
    if ((urlOk || found) && n > 0) {
      await sleep(900);
      return true;
    }
    await sleep(1000);
  }
  return false;
}

/**
 * ROOT CAUSE FIX: after card 1, Chakra leaves
 * `.chakra-modal__content-container` in a portal that intercepts all clicks.
 * Next Contact never receives the click. We must clear that before every card.
 */
async function clearBlockingModals(page: Page) {
  for (let i = 0; i < 8; i++) {
    const blocking = await page.evaluate(() => {
      const containers = [
        ...document.querySelectorAll(
          ".chakra-modal__content-container, section[aria-modal='true'], .chakra-modal__overlay",
        ),
      ] as HTMLElement[];
      return containers.some((el) => {
        const st = window.getComputedStyle(el);
        return (
          st.display !== "none" &&
          st.visibility !== "hidden" &&
          st.pointerEvents !== "none"
        );
      });
    });

    if (!blocking) {
      await page.evaluate(() => {
        document.getElementById("root")?.removeAttribute("aria-hidden");
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
      });
      return;
    }

    // Try normal close
    const close = page.locator('button[aria-label="Close"]').first();
    if (await close.isVisible().catch(() => false)) {
      await close.click({ force: true, timeout: 2000 }).catch(() => undefined);
      await sleep(300);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await sleep(300);
  }

  // Last resort: disable pointer events on leftover portals (do NOT remove nodes)
  await page.evaluate(() => {
    document.querySelectorAll(".chakra-portal").forEach((portal) => {
      const el = portal as HTMLElement;
      if (
        el.querySelector(
          ".chakra-modal__content-container, section[aria-modal='true'], .chakra-modal__overlay",
        )
      ) {
        el.style.pointerEvents = "none";
        el.style.visibility = "hidden";
      }
    });
    document.getElementById("root")?.removeAttribute("aria-hidden");
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
  });
  await sleep(400);
}

async function mountedRange(page: Page) {
  return page.evaluate((sel) => {
    let min = Infinity;
    let max = -1;
    let count = 0;
    for (const el of document.querySelectorAll(sel)) {
      const idx = Number((el as HTMLElement).dataset.index);
      if (!Number.isFinite(idx)) continue;
      count += 1;
      min = Math.min(min, idx);
      max = Math.max(max, idx);
    }
    return count ? { min, max, count } : { min: -1, max: -1, count: 0 };
  }, DOM.resultCard);
}

/** Scroll #scrollableDiv until data-index is visible with Contact. */
async function scrollToIndex(page: Page, index: number): Promise<boolean> {
  for (let guard = 0; guard < 60; guard++) {
    const range = await mountedRange(page);

    await page.evaluate(
      ({ scrollSel, listSel, index, range, step }) => {
        const scroll = document.querySelector(scrollSel) as HTMLElement | null;
        if (!scroll) return;
        const card = document.querySelector(
          `${listSel} > div[data-index="${index}"]`,
        ) as HTMLElement | null;

        if (card) {
          const styleTop = Number.parseFloat(card.style.top || "");
          if (Number.isFinite(styleTop)) {
            scroll.scrollTop = Math.max(0, styleTop - 20);
          } else {
            const s = scroll.getBoundingClientRect();
            const c = card.getBoundingClientRect();
            scroll.scrollTop += c.top - s.top - 20;
          }
          return;
        }

        if (range.max >= 0 && index > range.max) {
          scroll.scrollTop += Math.max(step, (index - range.max) * step);
        } else if (range.min >= 0 && index < range.min) {
          scroll.scrollTop = Math.max(
            0,
            scroll.scrollTop - Math.max(step, (range.min - index) * step),
          );
        } else {
          scroll.scrollTop = index * step;
        }
      },
      {
        scrollSel: DOM.scrollContainer,
        listSel: DOM.resultList,
        index,
        range,
        step: 380,
      },
    );

    await sleep(350);
    const contact = page.locator(
      `${DOM.resultList} > div[data-index="${index}"] ${DOM.contactButton}`,
    );
    if (await contact.first().isVisible().catch(() => false)) return true;
  }
  return false;
}

async function clickDmMenu(page: Page): Promise<boolean> {
  await page.locator(DOM.contactOpen).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await sleep(400);

  // Prefer open-menu sibling (doc). Avoid hidden clones on other cards.
  const strategies = [
    page.locator(DOM.dmInApp).first(),
    page.locator("[data-popper-placement] button[data-type='IN_APP']").first(),
    page.getByRole("menuitem", { name: /send a direct message/i }).first(),
  ];

  for (const loc of strategies) {
    try {
      if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) {
        await loc.click({ timeout: 5000, force: true });
        await sleep(700);
        return true;
      }
    } catch {
      // next
    }
  }

  return page.evaluate(() => {
    const open = document.querySelector(
      'button[data-dd-id="contact-button"][aria-expanded="true"]',
    );
    if (!open) return false;
    const btn =
      (open.parentElement?.querySelector(
        'button[data-type="IN_APP"]',
      ) as HTMLElement | null) ||
      (document.querySelector(
        "[data-popper-placement] button[data-type='IN_APP']",
      ) as HTMLElement | null);
    if (!btn) return false;
    btn.click();
    return true;
  });
}

/** Scrape LinkedIn / email / name from the open Contact menu (no navigation). */
async function scrapeContactExtras(
  page: Page,
  index: number,
): Promise<{ email: string; linkedin_url: string; display_name: string }> {
  return page.evaluate(
    ({ listSel, index }) => {
      const row = document.querySelector(
        `${listSel} > div[data-index="${index}"]`,
      ) as HTMLElement | null;
      const open =
        row?.querySelector(
          'button[data-dd-id="contact-button"][aria-expanded="true"]',
        ) ||
        document.querySelector(
          'button[data-dd-id="contact-button"][aria-expanded="true"]',
        );
      const menuRoot =
        (open?.parentElement as HTMLElement | null) ||
        (document.querySelector("[data-popper-placement]") as HTMLElement | null);

      let linkedin_url = "";
      let email = "";

      const anchors = [
        ...(menuRoot?.querySelectorAll("a[href]") || []),
        ...(document.querySelectorAll(
          '[data-popper-placement] a[href], [role="menu"] a[href]',
        ) || []),
      ] as HTMLAnchorElement[];

      for (const a of anchors) {
        // Prefer absolute URL (a.href resolves relative links)
        const href = (a.href || a.getAttribute("href") || "").trim();
        if (!linkedin_url && /linkedin\.com/i.test(href)) linkedin_url = href;
        if (!email && /^mailto:/i.test(href)) {
          email = href.replace(/^mailto:/i, "").split("?")[0].trim();
        }
      }

      // data-type LINKEDIN buttons sometimes wrap an <a> or hold data
      const linkedinBtn = menuRoot?.querySelector(
        'button[data-type="LINKEDIN"], a[data-type="LINKEDIN"]',
      ) as HTMLElement | null;
      if (!linkedin_url && linkedinBtn) {
        const a = linkedinBtn.closest("a") || linkedinBtn.querySelector("a");
        const href =
          (a as HTMLAnchorElement | null)?.href ||
          linkedinBtn.getAttribute("href") ||
          linkedinBtn.querySelector("a")?.getAttribute("href") ||
          "";
        if (/linkedin\.com/i.test(href)) linkedin_url = href;
      }

      // Email pattern in menu text (Contact details preview)
      if (!email && menuRoot) {
        const text = menuRoot.innerText || "";
        const m = text.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
        );
        if (m) email = m[0];
      }

      const img = row?.querySelector("img[alt]");
      const display_name =
        (img?.getAttribute("alt") || "").trim() ||
        row?.querySelector("p")?.textContent?.trim() ||
        "";

      return { email, linkedin_url, display_name };
    },
    { listSel: DOM.resultList, index },
  );
}

/**
 * Optionally open DIRECT_CONTACT_DETAILS briefly to grab mailto / email text,
 * then Escape back. Menu must be reopened by caller for DM.
 */
async function tryScrapeEmailFromDetails(page: Page): Promise<string> {
  const details = page
    .locator(
      '[data-popper-placement] button[data-type="DIRECT_CONTACT_DETAILS"], [role="menu"] button[data-type="DIRECT_CONTACT_DETAILS"], button:has-text("Contact details"), button:has-text("Direct contact")',
    )
    .first();
  if (!(await details.isVisible().catch(() => false))) return "";

  await details.click({ timeout: 4000, force: true }).catch(() => undefined);
  await sleep(600);

  const email = await page.evaluate(() => {
    const mailto = document.querySelector(
      'a[href^="mailto:"]',
    ) as HTMLAnchorElement | null;
    if (mailto?.href) {
      return mailto.href.replace(/^mailto:/i, "").split("?")[0].trim();
    }
    const roots = document.querySelectorAll(
      'section[aria-modal="true"], [data-popper-placement], [role="dialog"]',
    );
    for (const root of roots) {
      const text = (root as HTMLElement).innerText || "";
      const m = text.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      );
      if (m) return m[0];
    }
    return "";
  });

  await page.keyboard.press("Escape").catch(() => undefined);
  await sleep(300);
  return email;
}

async function pickCollectiveChat(page: Page): Promise<"ok" | "inactive"> {
  const picker = page.locator(DOM.channelPicker).first();
  if (!(await picker.isVisible().catch(() => false))) {
    const input = page.locator(DOM.messageBox).first();
    if (!(await input.isVisible().catch(() => false))) return "inactive";
    const ro = await input.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return Boolean(t.readOnly || t.disabled);
    });
    return ro ? "inactive" : "ok";
  }

  const label = ((await picker.innerText().catch(() => "")) || "").toLowerCase();
  if (label.includes("collective chat")) {
    const input = page.locator(DOM.messageBox).first();
    const ro = await input
      .evaluate((el) => {
        const t = el as HTMLTextAreaElement;
        return Boolean(t.readOnly || t.disabled);
      })
      .catch(() => true);
    return ro ? "inactive" : "ok";
  }

  await picker.click({ timeout: 5000, force: true });
  await sleep(400);

  const items = page.locator(DOM.channelMenuItem);
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const t = ((await item.innerText().catch(() => "")) || "").toLowerCase();
    if (!t.includes("collective chat")) continue;

    const disabled =
      (await item.isDisabled().catch(() => true)) ||
      (await item.getAttribute("disabled")) != null ||
      (await item.getAttribute("aria-disabled")) === "true";

    if (disabled) {
      // Do NOT click disabled — close and skip
      await page.keyboard.press("Escape").catch(() => undefined);
      return "inactive";
    }
    await item.click({ timeout: 5000, force: true });
    await sleep(500);
    return "ok";
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  return "inactive";
}

type StepResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  email?: string;
  linkedin_url?: string;
  display_name?: string;
};

async function runChainOnIndex(
  page: Page,
  index: number,
  text: string,
): Promise<StepResult> {
  try {
    if (!(await scrollToIndex(page, index))) {
      return { ok: false, error: `cannot mount card ${index}` };
    }

    // Gate: nothing may intercept Contact
    await clearBlockingModals(page);

    const contact = page
      .locator(
        `${DOM.resultList} > div[data-index="${index}"] ${DOM.contactButton}`,
      )
      .first();
    await contact.waitFor({ state: "visible", timeout: 12_000 });

    // 1 Contact
    await contact.click({ timeout: 8000, force: true });
    await sleep(500);
    await page
      .locator(
        `${DOM.resultList} > div[data-index="${index}"] button[data-dd-id="contact-button"][aria-expanded="true"]`,
      )
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });

    // Scrape LinkedIn / email from open menu before DM click
    let extras = await scrapeContactExtras(page, index);
    if (!extras.email) {
      const fromDetails = await tryScrapeEmailFromDetails(page);
      if (fromDetails) extras = { ...extras, email: fromDetails };
      // Re-open Contact if details closed the menu
      const stillOpen = await page
        .locator(
          `${DOM.resultList} > div[data-index="${index}"] button[data-dd-id="contact-button"][aria-expanded="true"]`,
        )
        .first()
        .isVisible()
        .catch(() => false);
      if (!stillOpen) {
        await clearBlockingModals(page);
        await contact.click({ timeout: 8000, force: true });
        await sleep(500);
        await page
          .locator(
            `${DOM.resultList} > div[data-index="${index}"] button[data-dd-id="contact-button"][aria-expanded="true"]`,
          )
          .first()
          .waitFor({ state: "visible", timeout: 8_000 });
        const again = await scrapeContactExtras(page, index);
        extras = {
          email: extras.email || again.email,
          linkedin_url: extras.linkedin_url || again.linkedin_url,
          display_name: extras.display_name || again.display_name,
        };
      }
    }

    // 2 DM
    if (!(await clickDmMenu(page))) {
      await clearBlockingModals(page);
      return {
        ok: false,
        error: "DM menu not clicked",
        ...extras,
      };
    }

    // 3 Modal
    await page.locator(DOM.modal).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });

    const chat = await pickCollectiveChat(page);
    if (chat === "inactive") {
      await clearBlockingModals(page);
      return {
        ok: false,
        skipped: true,
        error: "Collective Chat inactive",
        ...extras,
      };
    }

    // 4 Message
    const input = page.locator(DOM.messageBox).first();
    await input.waitFor({ state: "visible", timeout: 12_000 });
    for (let i = 0; i < 40; i++) {
      const ro = await input.evaluate((el) => {
        const t = el as HTMLTextAreaElement;
        return Boolean(t.readOnly || t.disabled);
      });
      if (!ro) break;
      await sleep(250);
    }
    if (
      await input.evaluate((el) => {
        const t = el as HTMLTextAreaElement;
        return Boolean(t.readOnly || t.disabled);
      })
    ) {
      await clearBlockingModals(page);
      return {
        ok: false,
        skipped: true,
        error: "composer read-only",
        ...extras,
      };
    }
    await fillReactTextarea(page, DOM.messageBox, text);
    await sleep(350);

    // 5 Send
    const send = page.locator(DOM.sendButton).first();
    for (let i = 0; i < 40; i++) {
      if (await send.isEnabled().catch(() => false)) break;
      await sleep(250);
    }
    if (!(await send.isEnabled().catch(() => false))) {
      await clearBlockingModals(page);
      return {
        ok: false,
        skipped: true,
        error: "Send disabled",
        ...extras,
      };
    }
    await send.click({ timeout: 8000, force: true });
    await sleep(1200);

    // CRITICAL for card 2+: clear portal before returning
    await clearBlockingModals(page);
    return { ok: true, ...extras };
  } catch (e) {
    await clearBlockingModals(page);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "chain failed",
    };
  }
}

async function readMeta(page: Page, index: number) {
  return page.evaluate(
    ({ listSel, index }) => {
      const row = document.querySelector(
        `${listSel} > div[data-index="${index}"]`,
      ) as HTMLElement | null;
      const img = row?.querySelector("img[alt]");
      const name =
        (img?.getAttribute("alt") || "").trim() ||
        row?.querySelector("p")?.textContent?.trim() ||
        "there";
      const src = (img?.getAttribute("src") || "").trim();
      const sellerKey = src
        ? `c_${src.replace(/[^a-zA-Z0-9]+/g, "").slice(-28)}`
        : `i${index}_${name.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`;
      let profileHref = "";
      const anchors = Array.from(row?.querySelectorAll("a[href]") || []);
      for (const a of anchors) {
        const href = (
          (a as HTMLAnchorElement).href ||
          a.getAttribute("href") ||
          ""
        ).trim();
        if (/collective\.work\/profile\//i.test(href)) {
          profileHref = href;
          break;
        }
      }
      return { name: name || "there", sellerKey, profileHref };
    },
    { listSel: DOM.resultList, index },
  );
}

export async function runBotFlowBatch(opts: {
  page: Page;
  account: CollectiveAccount;
  config: AccountBotConfig;
  brief: string;
  messageText: (vars: { name: string; skills: string }) => string;
  alreadyContacted: (sellerKey: string) => boolean;
  maxSends: number;
  onEvent?: (e: {
    action: "sent" | "skipped" | "error" | "info" | "contacting";
    name?: string;
    sellerKey?: string;
    detail: string;
    email?: string;
    linkedin_url?: string;
    profile_id?: string;
    display_name?: string;
  }) => void;
}): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const { page, brief, maxSends } = opts;
  const url = opts.config.search_url?.trim() || COLLECTIVE_URL.search;

  opts.onEvent?.({ action: "info", detail: `Goto ${url}` });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(1000);

  let searchSel: string = DOM.searchBox;
  if (!(await page.locator(searchSel).first().isVisible().catch(() => false))) {
    searchSel = DOM.searchBoxBackup;
  }
  await fillReactTextarea(page, searchSel, brief);
  await sleep(400);

  const submit = page.locator(DOM.searchSubmit).first();
  await submit.waitFor({ state: "visible", timeout: 15_000 });
  for (let i = 0; i < 40; i++) {
    if (await submit.isEnabled().catch(() => false)) break;
    await sleep(200);
  }
  if (await submit.isEnabled().catch(() => false)) {
    await submit.click({ timeout: 8000 });
  } else {
    await page.locator(searchSel).first().press("Enter");
  }

  opts.onEvent?.({
    action: "info",
    detail: "Search submitted — waiting for #result-list…",
  });
  if (!(await waitForResults(page))) {
    throw new Error("No Sherlock results");
  }

  opts.onEvent?.({
    action: "info",
    detail: `Results ready — clearing modals between each card (max ${maxSends})`,
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const seen = new Set<string>();
  let miss = 0;

  for (let index = 0; sent < maxSends && index < 800; index++) {
    // Always clear leftover portal BEFORE next card (this was the bug)
    await clearBlockingModals(page);

    if (!(await scrollToIndex(page, index))) {
      miss += 1;
      if (miss >= 4) break;
      continue;
    }
    miss = 0;

    const meta = await readMeta(page, index);
    if (seen.has(meta.sellerKey)) continue;
    seen.add(meta.sellerKey);
    const profile_id = profileIdFor(meta.name, meta.profileHref);

    if (opts.alreadyContacted(meta.sellerKey)) {
      skipped += 1;
      opts.onEvent?.({
        action: "skipped",
        name: meta.name,
        sellerKey: meta.sellerKey,
        profile_id,
        detail: `Card ${index}: already contacted (no duplicate DM)`,
      });
      continue;
    }

    opts.onEvent?.({
      action: "contacting",
      name: meta.name,
      sellerKey: meta.sellerKey,
      display_name: meta.name,
      profile_id,
      detail: `Card ${index} (${meta.name}): contacting…`,
    });

    let result: StepResult = { ok: false, error: "n/a" };
    for (let attempt = 1; attempt <= 2; attempt++) {
      await clearBlockingModals(page);
      result = await runChainOnIndex(
        page,
        index,
        opts.messageText({ name: meta.name, skills: "" }),
      );
      if (result.ok || result.skipped) break;
      opts.onEvent?.({
        action: "info",
        detail: `Card ${index} attempt ${attempt}: ${result.error}`,
      });
      await clearBlockingModals(page);
      await sleep(500);
    }

    await clearBlockingModals(page);

    const contactExtras = {
      email: result.email,
      linkedin_url: result.linkedin_url,
      display_name: result.display_name || meta.name,
      profile_id,
    };

    if (result.skipped) {
      skipped += 1;
      opts.onEvent?.({
        action: "skipped",
        name: meta.name,
        sellerKey: meta.sellerKey,
        detail: `Card ${index}: ${result.error}`,
        ...contactExtras,
      });
      continue;
    }
    if (!result.ok) {
      errors.push(`${meta.name}: ${result.error}`);
      opts.onEvent?.({
        action: "error",
        name: meta.name,
        sellerKey: meta.sellerKey,
        detail: `Card ${index}: ${result.error}`,
        ...contactExtras,
      });
      continue;
    }

    sent += 1;
    opts.onEvent?.({
      action: "sent",
      name: meta.name,
      sellerKey: meta.sellerKey,
      detail: `Card ${index}: sent (${sent}/${maxSends})`,
      ...contactExtras,
    });
    await sleep(900 + Math.floor(Math.random() * 500));
  }

  return { sent, skipped, errors };
}
