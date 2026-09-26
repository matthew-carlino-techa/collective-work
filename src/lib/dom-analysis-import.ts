/**
 * Parse Claude browser-extension DOM analysis markdown
 * (e.g. collective_work_sherlock_dom_selectors.md) into bot selectors.
 */

import type { AccountBotConfig, BotFieldKey } from "@/lib/bot-config";
import { mergeBotConfig } from "@/lib/bot-config";

export type ParsedDomSelector = {
  label: string;
  selector: string;
  backup?: string;
  notes?: string;
  field?: BotFieldKey;
};

const LABEL_TO_FIELD: Array<{ match: RegExp; field: BotFieldKey }> = [
  { match: /search\s*box|description\s*textarea|sherlock\s*description/i, field: "searchBox" },
  { match: /search\s*submit|search\s*\/\s*run|aria-label=["']?search/i, field: "searchSubmit" },
  { match: /result\s*card|candidate\s*card|virtualized/i, field: "candidateCard" },
  { match: /^contact$|contact\s*button|contact\s*new/i, field: "contactButton" },
  { match: /direct\s*message|in_app|send a direct message/i, field: "dmMenuItem" },
  { match: /channel|collective\s*chat|communication\s*channel/i, field: "channelOption" },
  { match: /message\s*(composer|box|text)|textarea.*content|send message/i, field: "messageInput" },
  { match: /^send$|send\s*button|type=["']submit["'].*send/i, field: "sendButton" },
];

function stripTicks(s: string): string {
  return s.replace(/`+/g, "").trim();
}

function guessField(label: string, selector: string): BotFieldKey | undefined {
  const blob = `${label} ${selector}`;
  for (const row of LABEL_TO_FIELD) {
    if (row.match.test(label) || row.match.test(blob)) return row.field;
  }
  if (/textarea\[name=["']description["']\]/i.test(selector)) return "searchBox";
  if (/aria-label=["']Search["']/i.test(selector)) return "searchSubmit";
  if (/#result-list\s*>\s*div\[data-index/i.test(selector)) return "candidateCard";
  if (/data-dd-id=["']contact-button["']/i.test(selector)) return "contactButton";
  if (/data-type=["']IN_APP["']/i.test(selector)) return "dmMenuItem";
  if (/textarea\[name=["']content["']\]/i.test(selector)) return "messageInput";
  if (/aria-modal.*submit|form button\[type=["']submit["']\]/i.test(selector)) {
    return "sendButton";
  }
  if (/aria-haspopup=["']menu["']/.test(selector) && /modal|channel/i.test(label)) {
    return "channelOption";
  }
  return undefined;
}

/**
 * Extract selector rows from Claude analysis markdown tables.
 */
export function parseClaudeDomAnalysis(markdown: string): ParsedDomSelector[] {
  const rows: ParsedDomSelector[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*-+/.test(line)) continue;
    if (/\|\s*Step\s*\|/i.test(line) || /\|\s*Label\s*\|/i.test(line)) continue;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 3) continue;

    // Formats: | step | label | selector | backup | notes |
    // or      | Item | Selector |
    let label = "";
    let selector = "";
    let backup = "";
    let notes = "";

    if (cells.length >= 4 && /`/.test(cells[2] || cells[1])) {
      label = stripTicks(cells[1]);
      selector = stripTicks(cells[2]);
      backup = stripTicks(cells[3] || "");
      notes = stripTicks(cells[4] || "");
    } else if (cells.length >= 2) {
      label = stripTicks(cells[0]);
      selector = stripTicks(cells[1]);
      backup = stripTicks(cells[2] || "");
    }

    // Prefer CSS over xpath for our Playwright locators
    if (!selector || selector.startsWith("xpath=") || selector === "–" || selector === "-") {
      if (backup && !backup.startsWith("xpath=")) selector = backup;
      else continue;
    }
    if (selector.startsWith("xpath=")) continue;

    const field = guessField(label, selector);
    rows.push({ label, selector, backup, notes, field });
  }

  return rows;
}

/** Merge parsed Claude rows into an AccountBotConfig (and sync steps). */
export function applyDomAnalysisToConfig(
  markdown: string,
  existing?: Partial<AccountBotConfig> | null,
): {
  config: AccountBotConfig;
  applied: Array<{ field: BotFieldKey; selector: string; label: string }>;
  ignored: number;
} {
  const parsed = parseClaudeDomAnalysis(markdown);
  const selectors: Partial<Record<BotFieldKey, string>> = {
    ...(existing?.selectors || {}),
  };
  const applied: Array<{ field: BotFieldKey; selector: string; label: string }> =
    [];
  let ignored = 0;

  // Later rows for same field overwrite earlier (results page often better than landing)
  for (const row of parsed) {
    if (!row.field) {
      ignored += 1;
      continue;
    }
    selectors[row.field] = row.selector;
    applied.push({ field: row.field, selector: row.selector, label: row.label });
  }

  const config = mergeBotConfig({
    search_url: existing?.search_url,
    selectors,
    steps: existing?.steps,
  });

  // Rebuild steps selectors from merged map
  config.steps = config.steps.map((s) => {
    const fieldMap: Record<string, BotFieldKey> = {
      search_box: "searchBox",
      search_submit: "searchSubmit",
      candidate_card: "candidateCard",
      contact: "contactButton",
      dm_menu: "dmMenuItem",
      channel: "channelOption",
      message_box: "messageInput",
      send: "sendButton",
    };
    const fk = fieldMap[s.kind];
    if (fk && selectors[fk]) return { ...s, selector: selectors[fk]! };
    return s;
  });
  config.selectors = { ...config.selectors, ...selectors };

  return { config, applied, ignored };
}
