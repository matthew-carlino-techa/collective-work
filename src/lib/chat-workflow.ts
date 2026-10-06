import fs from "fs";
import path from "path";
import { loadBotBrain, parseBotBrainMd, type BotBrainSections } from "./bot-brain";

export type ChatBranch = {
  id: string;
  title: string;
  template: string;
};

export type ChatReplyContext = {
  name: string;
  skills?: string;
  repo?: string;
  username?: string;
  notes?: string;
};

export type ChatTurn = { role: "bot" | "you"; text: string };

export type ChatReplyResult = {
  text: string;
  branch: string;
  stopped: boolean;
};

const WORKFLOW_SEED = path.join(
  process.cwd(),
  "brains",
  "collective",
  "chat-workflow.md",
);

/** Prefer the chat-workflow seed when present; fall back to the active brain. */
export function loadChatWorkflowBrain(platform = "collective"): BotBrainSections {
  const active = loadBotBrain(platform);
  if (fs.existsSync(WORKFLOW_SEED)) {
    const raw = fs.readFileSync(WORKFLOW_SEED, "utf8");
    const seeded = parseBotBrainMd(raw, WORKFLOW_SEED);
    // Active First msg wins if the operator customized Sample MD
    if (active.first_msg.trim()) seeded.first_msg = active.first_msg;
    if (active.project_description.trim()) {
      seeded.project_description = active.project_description;
    }
    return seeded;
  }
  return active;
}

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Pull `#### Title` + fenced template blocks from Chat rules / Other. */
export function extractChatBranches(brain: BotBrainSections): ChatBranch[] {
  const blob = [brain.chat_rules, brain.other, brain.raw].filter(Boolean).join("\n\n");
  const branches: ChatBranch[] = [];
  const re =
    /#{2,4}\s+([^\n]+)\n+```[a-z]*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(blob))) {
    const title = match[1].trim();
    const template = match[2].trim();
    if (!template) continue;
    // Skip the First msg fence if it appears under Other
    if (/^1\.\s*first msg/i.test(title) || /^first msg/i.test(title)) continue;
    branches.push({ id: slug(title), title, template });
  }
  return branches;
}

export function fillChatTemplate(
  template: string,
  ctx: ChatReplyContext,
): string {
  const name = (ctx.name || "there").trim() || "there";
  const skills = (ctx.skills || ctx.notes || "your stack").trim() || "your stack";
  const repo = (ctx.repo || "the assessment repo").trim();
  const username = (ctx.username || name).trim();
  return template
    .replace(/Hello\{name\}/gi, `Hello ${name}`)
    .replace(/\{\{name\}\}/gi, name)
    .replace(/\{name\}/gi, name)
    .replace(/\{\{skills\}\}/gi, skills)
    .replace(/\{skills\}/gi, skills)
    .replace(/\{\{repo\}\}/gi, repo)
    .replace(/\{repo\}/gi, repo)
    .replace(/\{\{username\}\}/gi, username)
    .replace(/\{username\}/gi, username)
    .trim();
}

type Intent =
  | "decline"
  | "salary"
  | "applied"
  | "busy"
  | "project_question"
  | "interested"
  | "nudge"
  | "generic";

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (
    /\b(no thanks|not interested|stop|unsubscribe|don't contact|do not contact|leave me alone|pass)\b/i.test(
      t,
    ) ||
    /^(no|nah|nope)\b/.test(t.trim())
  ) {
    return "decline";
  }
  if (
    /\b(salary|compensat|pay|rate|hourly|equity|token|budget|how much)\b/i.test(t)
  ) {
    return "salary";
  }
  if (
    /\b(i applied|applied|application submitted|submitted (my )?application|just applied)\b/i.test(
      t,
    )
  ) {
    return "applied";
  }
  if (
    /\b(busy|later|next week|in a few days|not now|follow up later|ping me later)\b/i.test(
      t,
    )
  ) {
    return "busy";
  }
  if (
    /\b(what is|what's|tell me about|more (info|detail|information)|how does|process|proof of dev|antfarm|role|stack|interview|assessment)\b/i.test(
      t,
    ) ||
    /\?/.test(t)
  ) {
    return "project_question";
  }
  if (
    /\b(yes|interested|sounds good|tell me more|i('| a)?m open|available|let'?s do|sure|keen|count me in)\b/i.test(
      t,
    )
  ) {
    return "interested";
  }
  return "generic";
}

function findBranch(
  branches: ChatBranch[],
  ...needles: string[]
): ChatBranch | undefined {
  return branches.find((b) => {
    const hay = `${b.id} ${b.title}`.toLowerCase();
    return needles.some((n) => hay.includes(n.toLowerCase()));
  });
}

/**
 * Pick the best workflow reply for a candidate message.
 * Uses reply-branch templates from the chat-workflow MD.
 */
export function replyFromWorkflow(
  candidateText: string,
  brain: BotBrainSections,
  ctx: ChatReplyContext,
  history: ChatTurn[],
): ChatReplyResult {
  const branches = extractChatBranches(brain);
  const intent = detectIntent(candidateText);
  const alreadyDeclined = history.some(
    (t) =>
      t.role === "bot" &&
      /stop the outreach|wish you the best/i.test(t.text),
  );
  if (alreadyDeclined) {
    return {
      text: fillChatTemplate(
        "I already closed this thread, {name}. I will not send more messages here.",
        ctx,
      ),
      branch: "already_stopped",
      stopped: true,
    };
  }

  let branch: ChatBranch | undefined;
  let stopped = false;

  switch (intent) {
    case "decline":
      branch = findBranch(branches, "decline", "not interested");
      stopped = true;
      break;
    case "salary":
      branch = findBranch(branches, "salary", "equity", "token", "compensation");
      break;
    case "applied":
      branch =
        findBranch(branches, "candidate applied", "applied") ||
        findBranch(branches, "step 5");
      break;
    case "busy":
      branch = findBranch(branches, "busy", "follow up later", "later");
      break;
    case "project_question":
      branch = findBranch(
        branches,
        "questions about the project",
        "project / process",
        "process",
      );
      break;
    case "interested":
      branch =
        findBranch(branches, "interested", "tell me more") ||
        findBranch(branches, "step 2", "after first positive");
      break;
    default:
      // First candidate reply after opening → treat as light interest / brief
      if (history.filter((t) => t.role === "you").length === 0) {
        branch =
          findBranch(branches, "interested", "tell me more") ||
          findBranch(branches, "step 2");
      } else {
        branch =
          findBranch(branches, "questions about the project", "process") ||
          findBranch(branches, "interested", "tell me more");
      }
  }

  if (!branch) {
    const fallback = [
      "Thanks {name}.",
      "",
      "The hiring path stays on the careers page:",
      "https://theantfarm.tech/careers",
      "",
      "Ask me about the process, Proof of Dev, or say if you already applied — I will answer from the chat workflow.",
    ].join("\n");
    return {
      text: fillChatTemplate(fallback, ctx),
      branch: intent,
      stopped: false,
    };
  }

  return {
    text: fillChatTemplate(branch.template, ctx),
    branch: branch.title,
    stopped,
  };
}

export function openingMessage(
  brain: BotBrainSections,
  ctx: ChatReplyContext,
): string {
  const raw = brain.first_msg.trim();
  if (!raw) {
    throw new Error("Brain First msg is empty — import chat-workflow.md in Sample MD");
  }
  // Normalize "Hello{name}," → "Hello {name},"
  const normalized = raw.replace(/Hello\{name\}/gi, "Hello {name}");
  return fillChatTemplate(normalized, ctx);
}
