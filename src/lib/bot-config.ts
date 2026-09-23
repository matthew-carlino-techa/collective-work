/** Per-account DOM control for Start — operator picks each step in Chrome. */

export type BotStepKind =
  | "search_box"
  | "search_submit"
  | "candidate_card"
  | "contact"
  | "dm_menu"
  | "channel"
  | "message_box"
  | "send"
  | "click";

export type BotStep = {
  id: string;
  label: string;
  kind: BotStepKind;
  selector: string;
  optional?: boolean;
  /** Scope under candidate card when running per-candidate */
  inCard?: boolean;
};

/** @deprecated use BotStepKind — kept for older saved JSON */
export type BotFieldKey =
  | "searchBox"
  | "searchSubmit"
  | "candidateCard"
  | "contactButton"
  | "dmMenuItem"
  | "channelOption"
  | "messageInput"
  | "sendButton";

const KIND_FROM_FIELD: Record<BotFieldKey, BotStepKind> = {
  searchBox: "search_box",
  searchSubmit: "search_submit",
  candidateCard: "candidate_card",
  contactButton: "contact",
  dmMenuItem: "dm_menu",
  channelOption: "channel",
  messageInput: "message_box",
  sendButton: "send",
};

const FIELD_FROM_KIND: Partial<Record<BotStepKind, BotFieldKey>> = {
  search_box: "searchBox",
  search_submit: "searchSubmit",
  candidate_card: "candidateCard",
  contact: "contactButton",
  dm_menu: "dmMenuItem",
  channel: "channelOption",
  message_box: "messageInput",
  send: "sendButton",
};

export type BotFieldDef = {
  key: BotFieldKey;
  label: string;
  hint: string;
  inCard?: boolean;
  optional?: boolean;
};

export const BOT_FIELD_DEFS: BotFieldDef[] = [
  {
    key: "searchBox",
    label: "Sherlock search box",
    hint: "textarea where you type the skills / job brief",
  },
  {
    key: "searchSubmit",
    label: "Search submit button",
    hint: "optional — if empty, bot presses Enter after typing",
    optional: true,
  },
  {
    key: "candidateCard",
    label: "Candidate card",
    hint: "one result card container in the list",
  },
  {
    key: "contactButton",
    label: "Contact button",
    hint: "Contact control inside a card",
    inCard: true,
  },
  {
    key: "dmMenuItem",
    label: "Direct message menu item",
    hint: "Send a direct message entry after Contact",
    optional: true,
  },
  {
    key: "channelOption",
    label: "Collective Chat channel",
    hint: "optional — in-platform chat option if a picker appears",
    optional: true,
  },
  {
    key: "messageInput",
    label: "Message text box",
    hint: "DM composer textarea",
  },
  {
    key: "sendButton",
    label: "Send button",
    hint: "Send in the DM modal (exact Send, not menu text)",
  },
];

export type AccountBotConfig = {
  search_url: string;
  steps: BotStep[];
  /** legacy mirror — kept in sync from steps */
  selectors: Partial<Record<BotFieldKey, string>>;
};

const DEFAULT_SELECTORS: Partial<Record<BotFieldKey, string>> = {
  searchBox: 'form textarea[name="description"]',
  searchSubmit: 'form button[type="submit"][aria-label="Search"]',
  candidateCard: "#result-list > div[data-index]",
  contactButton: 'button[data-dd-id="contact-button"]',
  dmMenuItem: 'button[data-type="IN_APP"]',
  channelOption: 'section[aria-modal="true"] [aria-haspopup="menu"]',
  messageInput: 'section[aria-modal="true"] textarea[name="content"]',
  sendButton: 'section[aria-modal="true"] form button[type="submit"]',
};

export function defaultSteps(): BotStep[] {
  return BOT_FIELD_DEFS.map((def, i) => ({
    id: `step_${def.key}`,
    label: `${i + 1}. ${def.label}`,
    kind: KIND_FROM_FIELD[def.key],
    selector: DEFAULT_SELECTORS[def.key] || "",
    optional: def.optional,
    inCard: def.inCard,
  }));
}

export const DEFAULT_BOT_CONFIG: AccountBotConfig = {
  search_url: "https://app.collective.work/recruiter/sherlock/search",
  steps: defaultSteps(),
  selectors: { ...DEFAULT_SELECTORS },
};

export function newCustomStep(label = "Custom click"): BotStep {
  const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    label,
    kind: "click",
    selector: "",
    optional: true,
  };
}

export function selectorsFromSteps(
  steps: BotStep[],
): Partial<Record<BotFieldKey, string>> {
  const out: Partial<Record<BotFieldKey, string>> = {};
  for (const step of steps) {
    const field = FIELD_FROM_KIND[step.kind];
    if (field) out[field] = step.selector;
  }
  return out;
}

export function stepsFromLegacySelectors(
  selectors: Partial<Record<BotFieldKey, string>> | undefined,
): BotStep[] {
  const merged = { ...DEFAULT_SELECTORS, ...(selectors || {}) };
  return BOT_FIELD_DEFS.map((def, i) => ({
    id: `step_${def.key}`,
    label: `${i + 1}. ${def.label}`,
    kind: KIND_FROM_FIELD[def.key],
    selector: merged[def.key] || "",
    optional: def.optional,
    inCard: def.inCard,
  }));
}

export function findStep(
  config: AccountBotConfig,
  kind: BotStepKind,
): BotStep | undefined {
  return config.steps.find((s) => s.kind === kind);
}

export function stepSelector(
  config: AccountBotConfig,
  kind: BotStepKind,
): string {
  const fromSteps = findStep(config, kind)?.selector?.trim();
  if (fromSteps) return fromSteps;
  const field = FIELD_FROM_KIND[kind];
  if (field) return (config.selectors[field] || "").trim();
  return "";
}

function normalizeStep(raw: Partial<BotStep>, index: number): BotStep {
  const kind = (raw.kind || "click") as BotStepKind;
  return {
    id: raw.id || `step_${index}_${kind}`,
    label: (raw.label || `Step ${index + 1}`).trim() || `Step ${index + 1}`,
    kind,
    selector: typeof raw.selector === "string" ? raw.selector : "",
    optional: Boolean(raw.optional) || kind === "click",
    inCard: Boolean(raw.inCard),
  };
}

export function mergeBotConfig(
  raw: Partial<AccountBotConfig> | null | undefined,
): AccountBotConfig {
  let steps: BotStep[];
  if (Array.isArray(raw?.steps) && raw.steps.length > 0) {
    steps = raw.steps.map((s, i) => normalizeStep(s, i));
  } else if (raw?.selectors && Object.keys(raw.selectors).length > 0) {
    steps = stepsFromLegacySelectors(raw.selectors);
  } else {
    steps = defaultSteps();
  }

  const selectors = {
    ...DEFAULT_SELECTORS,
    ...(raw?.selectors || {}),
    ...selectorsFromSteps(steps),
  };

  return {
    search_url: raw?.search_url?.trim() || DEFAULT_BOT_CONFIG.search_url,
    steps,
    selectors,
  };
}

export function renumberStepLabels(steps: BotStep[]): BotStep[] {
  return steps.map((s, i) => {
    const bare = s.label.replace(/^\d+\.\s*/, "");
    return { ...s, label: `${i + 1}. ${bare}` };
  });
}
