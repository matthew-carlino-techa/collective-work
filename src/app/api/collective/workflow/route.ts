import { NextResponse } from "next/server";
import { listWorkflow, saveWorkflowSteps } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const track = (searchParams.get("track") ?? "fullstack") as
    | "fullstack"
    | "blockchain";
  return NextResponse.json({ steps: listWorkflow(track) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const track = (body.track ?? "fullstack") as "fullstack" | "blockchain";
    if (!Array.isArray(body.steps)) {
      return NextResponse.json({ error: "steps array required" }, { status: 400 });
    }
    const steps = saveWorkflowSteps(track, body.steps);
    return NextResponse.json({ steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
