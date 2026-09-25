import { NextResponse } from "next/server";
import {
  getTemplateBrainMd,
  loadBotBrain,
  saveBotBrainMd,
} from "@/lib/bot-brain";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "collective";
  const brain = loadBotBrain(platform);
  return NextResponse.json({
    platform,
    brain,
    template: getTemplateBrainMd(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const platform =
      typeof body.platform === "string" && body.platform.trim()
        ? body.platform.trim()
        : "collective";

    if (typeof body.markdown !== "string" || !body.markdown.trim()) {
      return NextResponse.json(
        { error: "markdown string required (import .md contents)" },
        { status: 400 },
      );
    }

    const brain = saveBotBrainMd(body.markdown, platform);
    if (!brain.first_msg.trim()) {
      return NextResponse.json(
        {
          error:
            "Imported MD missing “## 1. First msg” section with message body",
          brain,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      platform,
      brain,
      message: "Bot brain saved — Start will use First msg",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
