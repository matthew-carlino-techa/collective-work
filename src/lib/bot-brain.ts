import fs from "fs";
import path from "path";

export type BotBrainSections = {
  standard: string;
  first_msg: string;
  project_description: string;
  chat_rules: string;
  other: string;
  /** Full raw markdown */
  raw: string;
  /** Source path or "imported" */
  source: string;
  updated_at: string;
};

const BRAINS_DIR = path.join(process.cwd(), "data", "brains");
const SEED_COLLECTIVE = path.join(
  process.cwd(),
  "brains",
  "collective",
  "brain.md",
);
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "brains",
  "templates",
  "asd-ste100-template.md",
);

function ensureDir() {
  fs.mkdirSync(BRAINS_DIR, { recursive: true });
}

function activePath(platform = "collective") {
  return path.join(BRAINS_DIR, `${platform}.md`);
}

/** Map heading titles → section keys */
function sectionKeyFromHeading(heading: string): keyof BotBrainSections | null {
  const h = heading.toLowerCase().replace(/^\d+\.\s*/, "").trim();
  if (h.includes("first msg") || h === "first message" || h === "1. first msg") {
    return "first_msg";
  }
  if (h.includes("project description") || h.includes("project")) {
    return "project_description";
  }
  if (h.includes("chat rule")) return "chat_rules";
  if (h === "other" || h.startsWith("other")) return "other";
  if (h.includes("asd-ste") || h === "standard") return "standard";
  return null;
}

/**
 * Parse ASD-STE100-style bot brain markdown into sections.
 */
export function parseBotBrainMd(
  raw: string,
  source = "inline",
): BotBrainSections {
  const sections: BotBrainSections = {
    standard: "",
    first_msg: "",
    project_description: "",
    chat_rules: "",
    other: "",
    raw,
    source,
    updated_at: new Date().toISOString(),
  };

  // Capture *** Use ASD-STE100 line
  const ste = raw.match(/\*{3}\s*Use\s+ASD-STE100[^\n]*/i);
  if (ste) sections.standard = ste[0].trim();

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let current: keyof BotBrainSections | null = null;
  const buckets: Record<string, string[]> = {
    first_msg: [],
    project_description: [],
    chat_rules: [],
    other: [],
    standard: [],
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)\s*$/);
    if (heading) {
      const key = sectionKeyFromHeading(heading[1]);
      current = key;
      continue;
    }
    if (current && current in buckets) {
      buckets[current].push(line);
    }
  }

  for (const key of Object.keys(buckets) as Array<keyof typeof buckets>) {
    let body = buckets[key].join("\n").trim();
    // Strip wrapping triple-backtick fences often used around first msg
    const fenced = body.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
    if (fenced) body = fenced[1].trim();
    if (key === "first_msg" || key === "project_description" || key === "chat_rules" || key === "other" || key === "standard") {
      if (body) (sections as Record<string, string>)[key] = body;
    }
  }

  // If standard empty but STE line found earlier, keep it
  if (!sections.standard && ste) sections.standard = ste[0].trim();

  return sections;
}

export function getTemplateBrainMd(): string {
  try {
    return fs.readFileSync(TEMPLATE_PATH, "utf8");
  } catch {
    return "# Bot Brain Template\n\n## 1. First msg\n\n";
  }
}

/**
 * Load active brain for a platform. Seeds from repo brain on first run.
 */
export function loadBotBrain(platform = "collective"): BotBrainSections {
  ensureDir();
  const dest = activePath(platform);
  if (!fs.existsSync(dest)) {
    if (platform === "collective" && fs.existsSync(SEED_COLLECTIVE)) {
      fs.copyFileSync(SEED_COLLECTIVE, dest);
    } else {
      fs.writeFileSync(dest, getTemplateBrainMd(), "utf8");
    }
  }
  const raw = fs.readFileSync(dest, "utf8");
  return parseBotBrainMd(raw, dest);
}

export function saveBotBrainMd(
  raw: string,
  platform = "collective",
): BotBrainSections {
  ensureDir();
  const dest = activePath(platform);
  const normalized = raw.replace(/\r\n/g, "\n").trim() + "\n";
  fs.writeFileSync(dest, normalized, "utf8");
  return parseBotBrainMd(normalized, dest);
}

/** First outbound DM text from the brain (required for Start). */
export function getBrainFirstMessage(platform = "collective"): string {
  const brain = loadBotBrain(platform);
  const msg = brain.first_msg.trim();
  if (!msg) {
    throw new Error(
      "Bot brain has empty “1. First msg” — import or edit the MD brain file",
    );
  }
  return msg;
}
