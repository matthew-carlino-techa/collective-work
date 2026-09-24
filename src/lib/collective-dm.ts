import type { Page, Locator } from "playwright";
import type { CollectiveAccount } from "@/lib/types";

export type CandidateCard = {
  name: string;
  skills: string;
  altId: string;
  sellerKey: string;
};

export type SendResult = {
  ok: boolean;
  skipped?: boolean;
  sellerKey?: string;
  name?: string;
  error?: string;
};

const SELECTORS = {
  card: 'div[role="group"]',
  nameImg: ".chakra-avatar__img",
  skills: ".css-ljrcnq",
  contactBtn: '[data-dd-id="contact-button"]',
  dmMenuItem: '[data-type="IN_APP"]',
  messageInput: 'textarea[name="content"], .chakra-textarea, textarea',
  sendButton: 'button[type="submit"]',
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function renderContactTemplate(
  body: string,
  vars: { name: string; skills: string; username: string; repo: string },
): string {
  return body
    .replaceAll("{{name}}", vars.name || "there")
    .replaceAll("{{skills}}", vars.skills || "your stack")
    .replaceAll("{{username}}", vars.username || "")
    .replaceAll("{{repo}}", vars.repo || "");
}

async function visibleCards(page: Page): Promise<Locator[]> {
  const cards = page.locator(SELECTORS.card);
  const count = await cards.count();
  const out: Locator[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const btn = card.locator(SELECTORS.contactBtn).first();
    if ((await btn.count()) === 0) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    out.push(card);
  }
  return out;
}

export async function readCandidate(
  card: Locator,
): Promise<CandidateCard | null> {
  try {
    const img = card.locator(SELECTORS.nameImg).first();
    const name =
      ((await img.count()) > 0
        ? (await img.getAttribute("alt"))?.trim()
        : "") ||
      (
        await card.locator("p.chakra-text").first().textContent().catch(() => "")
      )?.trim() ||
      "";
    const skills = (
      (await card.locator(SELECTORS.skills).allTextContents()) || []
    )
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(", ");
    const altId = ((await img.getAttribute("src")) || "").trim();
    const sellerKey =
      altId ||
      name.toLowerCase().replace(/\s+/g, "_").slice(0, 64) ||
      `card_${Date.now()}`;
    if (!name && !altId) return null;
    return { name: name || "there", skills, altId, sellerKey };
  } catch {
    return null;
  }
}

async function pressEscape(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await sleep(400);
}

/** Send one Step-1 DM to a candidate card on the open Collective list page. */
export async function sendFirstMessageToCard(
  page: Page,
  card: Locator,
  text: string,
): Promise<SendResult> {
  const candidate = await readCandidate(card);
  if (!candidate) return { ok: false, error: "Could not read candidate card" };

  try {
    await card.scrollIntoViewIfNeeded();
    await sleep(rand(400, 900));

    const contactBtn = card.locator(SELECTORS.contactBtn).first();
    if ((await contactBtn.count()) === 0) {
      return {
        ok: false,
        skipped: true,
        sellerKey: candidate.sellerKey,
        name: candidate.name,
        error: "No Contact button on card",
      };
    }
    await contactBtn.click({ timeout: 8000 });
    await sleep(rand(500, 1000));

    // Contact menu → Send a direct message
    const dmItem = page.locator(SELECTORS.dmMenuItem).filter({ hasText: /direct message/i }).first();
    const dmAlt = page.getByRole("menuitem", { name: /direct message/i }).first();
    if (await dmItem.isVisible().catch(() => false)) {
      await dmItem.click({ timeout: 8000 });
    } else if (await dmAlt.isVisible().catch(() => false)) {
      await dmAlt.click({ timeout: 8000 });
    } else {
      // Some UIs open the composer directly
      const inputProbe = page.locator(SELECTORS.messageInput).first();
      if (!(await inputProbe.isVisible().catch(() => false))) {
        await pressEscape(page);
        return {
          ok: false,
          error: "DM menu item not found",
          sellerKey: candidate.sellerKey,
          name: candidate.name,
        };
      }
    }

    const input = page.locator(SELECTORS.messageInput).first();
    await input.waitFor({ state: "visible", timeout: 15_000 });

    // Channel picker: prefer in-platform Collective Chat (never Email/WhatsApp by default)
    const channelResult = await ensureCollectiveChat(page, input);
    if (channelResult.skipped) {
      await pressEscape(page);
      return {
        ok: false,
        skipped: true,
        sellerKey: candidate.sellerKey,
        name: candidate.name,
        error: channelResult.error || "Collective Chat unavailable",
      };
    }
    if (channelResult.error) {
      await pressEscape(page);
      return {
        ok: false,
        sellerKey: candidate.sellerKey,
        name: candidate.name,
        error: channelResult.error,
      };
    }

    const readonly = await input.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return Boolean(t.readOnly || t.disabled || t.getAttribute("aria-readonly") === "true");
    });
    if (readonly) {
      await pressEscape(page);
      return {
        ok: false,
        skipped: true,
        sellerKey: candidate.sellerKey,
        name: candidate.name,
        error: "Message box read-only",
      };
    }

    await input.click({ timeout: 5000 });
    await input.fill("");
    await input.fill(text);
    await sleep(rand(400, 800));

    const held = await input.inputValue().catch(async () => (await input.textContent()) || "");
    if (!(held || "").includes(text.slice(0, Math.min(24, text.length)))) {
      await pressEscape(page);
      return {
        ok: false,
        sellerKey: candidate.sellerKey,
        name: candidate.name,
        error: "Message did not stick in the box",
      };
    }

    // Prefer exact Send submit in the dialog (not "Send a direct message")
    const dialog = page.locator('[role="dialog"], .chakra-modal__content').last();
    const sendInDialog = dialog
      .locator('button[type="submit"]')
      .filter({ hasText: /^Send$/i })
      .first();
    const sendBtn = page
      .locator('button[type="submit"]')
      .filter({ hasText: /^Send$/i })
      .first();
    const sendBtn2 = page.getByRole("button", { name: /^Send$/i }).first();
    if (await sendInDialog.isVisible().catch(() => false)) {
      await sendInDialog.click({ timeout: 8000 });
    } else if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click({ timeout: 8000 });
    } else if (await sendBtn2.isVisible().catch(() => false)) {
      await sendBtn2.click({ timeout: 8000 });
    } else {
      await pressEscape(page);
      return {
        ok: false,
        sellerKey: candidate.sellerKey,
        name: candidate.name,
        error: "Send button not found",
      };
    }

    // Site usually closes the modal after send
    await sleep(1500);
    const stillOpen = await input.isVisible().catch(() => false);
    if (stillOpen) {
      const stillText = await input.inputValue().catch(() => "");
      if (stillText && stillText.length > 10) {
        await pressEscape(page);
        return {
          ok: false,
          sellerKey: candidate.sellerKey,
          name: candidate.name,
          error: "Send clicked but composer still has text",
        };
      }
      await pressEscape(page);
    }

    return {
      ok: true,
      sellerKey: candidate.sellerKey,
      name: candidate.name,
    };
  } catch (error) {
    await pressEscape(page);
    return {
      ok: false,
      sellerKey: candidate.sellerKey,
      name: candidate.name,
      error: error instanceof Error ? error.message : "Send failed",
    };
  }
}

/** Select in-platform Collective Chat when a channel picker is shown. */
async function ensureCollectiveChat(
  page: Page,
  messageInput: Locator,
): Promise<{ skipped?: boolean; error?: string }> {
  try {
    // Find channel trigger near the message box (not a candidate Contact button)
    const trigger = page
      .locator('[aria-haspopup="menu"].chakra-menu__menu-button')
      .filter({ hasText: /channel|chat|email|whatsapp|choose/i })
      .first();

    if (!(await trigger.isVisible().catch(() => false))) {
      // No picker — assume chat composer is already ready
      return {};
    }

    const label = ((await trigger.innerText()) || "").toLowerCase();
    if (label.includes("collective chat")) {
      return {};
    }

    // Open picker and choose Collective Chat
    await trigger.click({ timeout: 8000 });
    await sleep(600);

    const option = page
      .getByRole("menuitem", { name: /collective chat/i })
      .or(page.locator('[role="menuitem"], [role="option"]').filter({ hasText: /collective chat/i }))
      .first();

    if (!(await option.isVisible().catch(() => false))) {
      await pressEscape(page);
      return {
        skipped: true,
        error: "Collective Chat option not in channel picker",
      };
    }

    const optText = ((await option.innerText()) || "").toLowerCase();
    if (/connect|\+/.test(optText) || (await option.isDisabled().catch(() => false))) {
      await pressEscape(page);
      return {
        skipped: true,
        error: "Collective Chat not connected for this candidate",
      };
    }

    await option.click({ timeout: 8000 });
    await sleep(700);

    // Re-check input still usable
    if (!(await messageInput.isVisible().catch(() => false))) {
      return { error: "Message box disappeared after choosing Collective Chat" };
    }
    return {};
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to select Collective Chat",
    };
  }
}

export async function listMessagableCards(page: Page): Promise<Locator[]> {
  return visibleCards(page);
}

export function pickRepo(account: CollectiveAccount, track: "fullstack" | "blockchain") {
  if (track === "blockchain") {
    return account.github_bc_repo || account.github_fs_repo || "";
  }
  return account.github_fs_repo || account.github_bc_repo || "";
}
