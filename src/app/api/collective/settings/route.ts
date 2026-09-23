import { NextResponse } from "next/server";
import {
  getDefaultDmCaps,
  getDmLimits,
  listOutreachLog,
  saveDmLimits,
  saveSearchBrief,
  getSearchBrief,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    // Global defaults for *new* accounts only — live quotas are per-account
    limits: getDmLimits(),
    default_caps: getDefaultDmCaps(),
    search_brief: getSearchBrief(),
    outreach_log: listOutreachLog(40),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let limits = getDmLimits();
    let search_brief = getSearchBrief();

    const hasLimits =
      body.dm_per_day !== undefined || body.dm_per_hour !== undefined;
    if (hasLimits) {
      const dm_per_day = Number(body.dm_per_day ?? limits.dm_per_day);
      const dm_per_hour = Number(body.dm_per_hour ?? limits.dm_per_hour);
      if (!Number.isFinite(dm_per_day) || !Number.isFinite(dm_per_hour)) {
        return NextResponse.json({ error: "Invalid limits" }, { status: 400 });
      }
      // Saves defaults for newly created accounts (not live per-bot quotas)
      limits = saveDmLimits(dm_per_day, dm_per_hour);
    }

    if (typeof body.search_brief === "string") {
      search_brief = saveSearchBrief(body.search_brief);
    }

    if (!hasLimits && typeof body.search_brief !== "string") {
      return NextResponse.json(
        { error: "Nothing to save" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      limits,
      default_caps: getDefaultDmCaps(),
      search_brief,
      message: hasLimits
        ? "Saved as default for new accounts. Edit each account for its own DM limits."
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
