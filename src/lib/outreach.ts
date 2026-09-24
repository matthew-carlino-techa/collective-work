import { ensureAccountSession, hasOpenSession } from "@/lib/browser-sessions";
import { getBrainFirstMessage } from "@/lib/bot-brain";
import { runBotFlowBatch } from "@/lib/bot-flow-runner";
import { pickRepo } from "@/lib/collective-dm";
import {
  alreadyMessagedSeller,
  getAccount,
  getAccountBotConfig,
  getAccountDmLimits,
  getAccountSearchBrief,
  logOutreach,
  patchAccountStatus,
  recordDmSent,
  upsertPipelineLead,
} from "@/lib/db";

type GlobalRuns = {
  __collectiveOutreach?: Map<number, AbortController>;
};

function runs(): Map<number, AbortController> {
  const g = globalThis as GlobalRuns;
  if (!g.__collectiveOutreach) g.__collectiveOutreach = new Map();
  return g.__collectiveOutreach;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function remainingQuota(accountId: number) {
  const limits = getAccountDmLimits(accountId);
  const dayLeft = Math.max(0, limits.dm_per_day - limits.today_sent);
  const hourLeft = Math.max(0, limits.dm_per_hour - limits.hour_batch);
  return {
    limits,
    dayLeft,
    hourLeft,
    canSend: dayLeft > 0 && hourLeft > 0,
    batchMax: Math.min(dayLeft, hourLeft),
  };
}

function defaultTrack(accountId: number): "fullstack" | "blockchain" {
  const account = getAccount(accountId);
  if (!account) return "fullstack";
  if (account.github_bc_repo?.trim() && !account.github_fs_repo?.trim()) {
    return "blockchain";
  }
  return "fullstack";
}

/**
 * Contact/Start batch using this account's picked DOM steps.
 */
export async function runContactBatch(accountId: number): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
  message: string;
}> {
  const account = getAccount(accountId);
  if (!account) throw new Error("Account not found");

  const quota = remainingQuota(accountId);
  if (!quota.canSend) {
    throw new Error(
      `DM limit reached for this account (today ${quota.limits.today_sent}/${quota.limits.dm_per_day}, hour ${quota.limits.hour_batch}/${quota.limits.dm_per_hour})`,
    );
  }

  const track = defaultTrack(accountId);
  const brief = getAccountSearchBrief(accountId);
  if (!brief.trim()) {
    throw new Error(
      "Sherlock search brief is empty for this account — set it in Edit account",
    );
  }
  const firstMsg = getBrainFirstMessage("collective");
  if (!firstMsg.trim()) {
    throw new Error(
      "Brain First msg is empty — set it in Brain (.md) before Start/Contact",
    );
  }
  const config = getAccountBotConfig(accountId);

  patchAccountStatus(accountId, {
    contact_status: "pending",
    online_status: "yes",
    error_message: "Searching then DMing each card (Contact→DM→Send)…",
  });

  const page = await ensureAccountSession(accountId);

  logOutreach({
    account_id: accountId,
    action: "info",
    detail: `Brain first_msg run — brief: ${brief}`,
  });

  const result = await runBotFlowBatch({
    page,
    account,
    config,
    brief,
    maxSends: quota.batchMax,
    messageText: () => firstMsg,
    alreadyContacted: (sellerKey) => alreadyMessagedSeller(sellerKey),
    onEvent: (e) => {
      logOutreach({
        account_id: accountId,
        seller_key: e.sellerKey,
        seller_name: e.name,
        action: e.action,
        detail: e.detail,
      });

      if (e.action === "contacting" && e.sellerKey) {
        upsertPipelineLead({
          seller_username: e.sellerKey,
          display_name: e.display_name || e.name,
          track,
          step: "Contact",
          status: "contacting",
          replies: 0,
          wait_label: "now contacting",
          assigned_account_id: accountId,
          github_url: pickRepo(account, track),
          email: e.email,
          linkedin_url: e.linkedin_url,
          profile_id: e.profile_id,
        });
        patchAccountStatus(accountId, {
          contact_status: "pending",
          error_message: e.detail,
        });
      }

      if (
        (e.action === "sent" ||
          e.action === "skipped" ||
          e.action === "error") &&
        e.sellerKey
      ) {
        const status =
          e.action === "sent"
            ? "waiting"
            : e.action === "skipped"
              ? "skipped"
              : "error";
        upsertPipelineLead({
          seller_username: e.sellerKey,
          display_name: e.display_name || e.name,
          track,
          step: "Contact",
          status,
          replies: 0,
          wait_label:
            e.action === "sent"
              ? "awaiting reply"
              : e.action === "skipped"
                ? "skipped — no duplicate / inactive"
                : "error",
          assigned_account_id: accountId,
          github_url: pickRepo(account, track),
          email: e.email,
          linkedin_url: e.linkedin_url,
          profile_id: e.profile_id,
        });
      }

      // DM counters are sent messages only. Skipped and failed profiles do not count.
      if (e.action === "sent") {
        recordDmSent(accountId);
      }
      if (e.action === "info") {
        patchAccountStatus(accountId, {
          contact_status: "pending",
          error_message: e.detail,
        });
      }
    },
  });

  const message =
    result.sent > 0
      ? `Sent ${result.sent} DM(s) via your steps; skipped ${result.skipped}`
      : `No messages sent (skipped ${result.skipped}). ${result.errors[0] || "Check picked selectors."}`;

  patchAccountStatus(accountId, {
    contact_status: result.sent > 0 ? "yes" : "no",
    online_status: "yes",
    error_message: message,
  });
  logOutreach({ account_id: accountId, action: "info", detail: message });

  return { ...result, message };
}

export async function startOutreachLoop(accountId: number): Promise<void> {
  stopOutreachLoop(accountId);
  await ensureAccountSession(accountId);

  const ac = new AbortController();
  runs().set(accountId, ac);

  patchAccountStatus(accountId, {
    start_status: "yes",
    online_status: "yes",
    error_message: "Start: Sherlock search → Contact → DM",
  });
  logOutreach({
    account_id: accountId,
    action: "info",
    detail: "Start loop began (search → contact → message)",
  });

  void (async () => {
    try {
      while (!ac.signal.aborted) {
        const quota = remainingQuota(accountId);
        if (!quota.canSend) {
          patchAccountStatus(accountId, {
            start_status: "yes",
            error_message:
              `This account DM limit reached (today ${quota.limits.today_sent}/${quota.limits.dm_per_day}, hour ${quota.limits.hour_batch}/${quota.limits.dm_per_hour}) — waiting 5 min`,
          });
          await sleep(5 * 60_000);
          continue;
        }

        try {
          await ensureAccountSession(accountId);
        } catch (error) {
          patchAccountStatus(accountId, {
            start_status: "no",
            online_status: "no",
            error_message:
              error instanceof Error
                ? error.message
                : "Start stopped — no browser session",
          });
          break;
        }

        try {
          const result = await runContactBatch(accountId);
          if (ac.signal.aborted) break;

          if (result.sent === 0) {
            patchAccountStatus(accountId, {
              start_status: "yes",
              error_message:
                "Start idle — no new candidates; waiting then retrying search→contact",
            });
            await sleep(20_000);
            continue;
          }
          await sleep(60_000);
        } catch (batchError) {
          if (ac.signal.aborted) break;
          const message =
            batchError instanceof Error
              ? batchError.message
              : "Contact batch failed";
          logOutreach({
            account_id: accountId,
            action: "error",
            detail: message,
          });
          if (/DM limit reached/i.test(message)) {
            patchAccountStatus(accountId, {
              start_status: "yes",
              error_message: `${message} — waiting 5 min`,
            });
            await sleep(5 * 60_000);
            continue;
          }
          patchAccountStatus(accountId, {
            start_status: "no",
            error_message: message,
          });
          break;
        }
      }
    } catch (error) {
      if (ac.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Start loop failed";
      logOutreach({ account_id: accountId, action: "error", detail: message });
      patchAccountStatus(accountId, {
        start_status: "no",
        error_message: message,
      });
    } finally {
      if (runs().get(accountId) === ac) runs().delete(accountId);
    }
  })();
}

export function stopOutreachLoop(accountId: number) {
  const ac = runs().get(accountId);
  if (ac) {
    ac.abort();
    runs().delete(accountId);
  }
}

export { hasOpenSession };
