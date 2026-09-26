import { NextResponse } from "next/server";
import { applyDomAnalysisToConfig } from "@/lib/dom-analysis-import";
import {
  getAccount,
  getAccountBotConfig,
  listAccounts,
  saveAccountBotConfig,
} from "@/lib/db";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  const file = path.join(process.cwd(), "data", "dom-analysis", "latest.md");
  if (!fs.existsSync(file)) {
    return NextResponse.json({ markdown: "", applied: [] });
  }
  return NextResponse.json({
    markdown: fs.readFileSync(file, "utf8"),
    updated_at: fs.statSync(file).mtime.toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const markdown =
      typeof body.markdown === "string" ? body.markdown.trim() : "";
    if (!markdown) {
      return NextResponse.json({ error: "markdown required" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "data", "dom-analysis");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "latest.md"), markdown + "\n", "utf8");

    const accountId = body.accountId ? Number(body.accountId) : null;
    const applyAll = body.applyAll !== false; // default: sync all accounts from primary pattern

    const targets = accountId
      ? [getAccount(accountId)].filter(Boolean)
      : applyAll
        ? listAccounts()
        : listAccounts().slice(0, 1);

    if (!targets.length) {
      return NextResponse.json(
        { error: "No accounts to apply DOM analysis to" },
        { status: 400 },
      );
    }

    const results: Array<{
      accountId: number;
      applied: Array<{ field: string; selector: string; label: string }>;
      ignored: number;
    }> = [];

    for (const account of targets) {
      if (!account) continue;
      const current = getAccountBotConfig(account.id);
      const { config, applied, ignored } = applyDomAnalysisToConfig(
        markdown,
        current,
      );
      saveAccountBotConfig(account.id, config, {
        propagate: account.id === listAccounts()[0]?.id,
      });
      results.push({
        accountId: account.id,
        applied,
        ignored,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `DOM analysis imported — applied to ${results.length} account(s)`,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
