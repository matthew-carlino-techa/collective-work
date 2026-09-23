import { NextResponse } from "next/server";
import {
  mergeBotConfig,
  newCustomStep,
  renumberStepLabels,
  type BotStep,
} from "@/lib/bot-config";
import { ensureAccountSession } from "@/lib/browser-sessions";
import {
  getAccount,
  getAccountBotConfig,
  getPrimaryAccountId,
  isPrimaryAccount,
  listAccounts,
  saveAccountBotConfig,
  syncBotConfigFromPrimary,
} from "@/lib/db";
import { pickDomSelector } from "@/lib/dom-picker";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("accountId"));
  if (!id) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }
  if (!getAccount(id)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const primaryId = getPrimaryAccountId();
  return NextResponse.json({
    config: getAccountBotConfig(id),
    primaryAccountId: primaryId,
    isPrimary: isPrimaryAccount(id),
    accounts: listAccounts().map((a) => ({
      id: a.id,
      owner_name: a.owner_name,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const accountId = Number(body.accountId);
    if (!accountId || !getAccount(accountId)) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Sync this (or all) accounts from first account's steps
    if (body.action === "sync_from_primary") {
      const result = syncBotConfigFromPrimary(
        body.all === true ? undefined : accountId,
      );
      return NextResponse.json({
        ...result,
        config: getAccountBotConfig(accountId),
        isPrimary: isPrimaryAccount(accountId),
        primaryAccountId: result.primaryId,
      });
    }

    // Add a custom click step
    if (body.action === "add_step") {
      const current = getAccountBotConfig(accountId);
      const step = newCustomStep(
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim()
          : "Custom click",
      );
      const afterId = typeof body.afterId === "string" ? body.afterId : null;
      let steps = [...current.steps];
      if (afterId) {
        const idx = steps.findIndex((s) => s.id === afterId);
        if (idx >= 0) steps.splice(idx + 1, 0, step);
        else steps.push(step);
      } else {
        steps.push(step);
      }
      steps = renumberStepLabels(steps);
      const config = saveAccountBotConfig(accountId, { ...current, steps });
      return NextResponse.json({
        config,
        step,
        isPrimary: isPrimaryAccount(accountId),
        primaryAccountId: getPrimaryAccountId(),
      });
    }

    // Remove a step
    if (body.action === "remove_step" && body.stepId) {
      const current = getAccountBotConfig(accountId);
      const steps = renumberStepLabels(
        current.steps.filter((s) => s.id !== body.stepId),
      );
      if (steps.length === 0) {
        return NextResponse.json(
          { error: "Keep at least one step" },
          { status: 400 },
        );
      }
      const config = saveAccountBotConfig(accountId, { ...current, steps });
      return NextResponse.json({
        config,
        isPrimary: isPrimaryAccount(accountId),
        primaryAccountId: getPrimaryAccountId(),
      });
    }

    // Save full config (first account auto-propagates to others)
    if (body.config) {
      const config = saveAccountBotConfig(
        accountId,
        mergeBotConfig(body.config),
        { propagate: body.propagate === true ? true : undefined },
      );
      return NextResponse.json({
        config,
        isPrimary: isPrimaryAccount(accountId),
        primaryAccountId: getPrimaryAccountId(),
        propagated: isPrimaryAccount(accountId),
      });
    }

    // Start DOM pick for one step in the live Chrome (extension)
    if (body.action === "pick" && body.stepId) {
      const current = getAccountBotConfig(accountId);
      const step = current.steps.find((s) => s.id === body.stepId);
      if (!step) {
        return NextResponse.json({ error: "Unknown step" }, { status: 404 });
      }

      const page = await ensureAccountSession(accountId);
      const result = await pickDomSelector(page, step.label);
      if (!result.ok || !result.selector) {
        return NextResponse.json({
          cancelled: Boolean(result.cancelled),
          error: result.error || "Pick cancelled",
          config: getAccountBotConfig(accountId),
        });
      }

      const steps: BotStep[] = current.steps.map((s) =>
        s.id === step.id ? { ...s, selector: result.selector! } : s,
      );
      const config = saveAccountBotConfig(accountId, { ...current, steps });
      return NextResponse.json({
        config,
        picked: {
          stepId: step.id,
          selector: result.selector,
          sample: result.sample,
        },
        isPrimary: isPrimaryAccount(accountId),
        primaryAccountId: getPrimaryAccountId(),
        propagated: isPrimaryAccount(accountId),
      });
    }

    if (typeof body.search_url === "string") {
      const current = getAccountBotConfig(accountId);
      current.search_url = body.search_url;
      const config = saveAccountBotConfig(accountId, current);
      return NextResponse.json({
        config,
        isPrimary: isPrimaryAccount(accountId),
        primaryAccountId: getPrimaryAccountId(),
      });
    }

    return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
