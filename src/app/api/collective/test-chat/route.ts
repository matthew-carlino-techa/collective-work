import { NextResponse } from "next/server";
import {
  loadChatWorkflowBrain,
  openingMessage,
  replyFromWorkflow,
  type ChatTurn,
} from "@/lib/chat-workflow";
import { listPipeline } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const brain = loadChatWorkflowBrain("collective");
  const leads = listPipeline({ platform: "collective" })
    .filter((l) => l.display_name?.trim())
    .slice(0, 80)
    .map((l) => ({
      id: l.id,
      display_name: l.display_name,
      seller_username: l.seller_username,
      status: l.status,
      email: l.email || "",
      linkedin_url: l.linkedin_url || "",
      profile_id: l.profile_id || "",
    }));
  return NextResponse.json({
    first_msg: brain.first_msg,
    source: brain.source,
    branches: (brain.other + brain.chat_rules).length,
    candidates: leads,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "reply");
    const name = String(body.name || "there").trim() || "there";
    const skills = String(body.skills || body.notes || "").trim();
    const username = String(body.username || name).trim();
    const repo = String(body.repo || "").trim();
    const notes = String(body.notes || "").trim();
    const ctx = { name, skills, username, repo, notes };
    const brain = loadChatWorkflowBrain("collective");

    if (action === "open") {
      const text = openingMessage(brain, ctx);
      return NextResponse.json({
        text,
        branch: "1. First msg",
        stopped: false,
      });
    }

    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const history = (Array.isArray(body.history) ? body.history : []) as ChatTurn[];
    const result = replyFromWorkflow(message, brain, ctx, history);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
