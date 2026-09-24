import { NextResponse } from "next/server";
import {
  importProfileLinks,
  listPipeline,
  listPipelinePlatforms,
  patchPipelineLead,
  seedDemoPipelineIfEmpty,
  upsertPipelineLead,
} from "@/lib/db";
import { collectiveProfileUrl } from "@/lib/collective-url";
import { linkedinProfileUrl } from "@/lib/linkedin-url";
import { parseProfileLinkFile } from "@/lib/profile-link-import";
import { PLATFORMS } from "@/lib/platforms";

export const runtime = "nodejs";

export async function GET(request: Request) {
  seedDemoPipelineIfEmpty();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "All";
  const step = searchParams.get("step") ?? "All";
  const platform = searchParams.get("platform") ?? "All";
  const q = searchParams.get("q") ?? "";

  const leads = listPipeline({ status, step, platform, q }).map((lead) => ({
    ...lead,
    linkedin_url: linkedinProfileUrl(lead.linkedin_url),
    profile_url: collectiveProfileUrl(lead.profile_id),
  }));

  if (searchParams.get("format") === "links") {
    return NextResponse.json({
      rows: leads.map((lead) => ({
        display_name: lead.display_name,
        seller_username: lead.seller_username,
        linkedin_url: lead.linkedin_url,
        profile_url: lead.profile_url,
      })),
    });
  }

  const fromDb = listPipelinePlatforms();
  const known = PLATFORMS.map((p) => p.id);
  const platforms = Array.from(new Set([...known, ...fromDb])).sort();

  return NextResponse.json({
    leads,
    platforms,
    total: leads.length,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "import_links") {
      const text = Array.isArray(body.rows)
        ? JSON.stringify(body.rows)
        : String(body.text ?? "");
      let rows;
      try {
        rows = parseProfileLinkFile(text);
      } catch {
        return NextResponse.json(
          { error: "Profile file must be JSON or the 4-line blocks" },
          { status: 400 },
        );
      }
      const result = importProfileLinks(rows);
      return NextResponse.json(result);
    }

    // Toggle following / double_checked on an existing lead
    if (body.action === "patch" && body.id != null) {
      const lead = patchPipelineLead(Number(body.id), {
        following: body.following,
        double_checked: body.double_checked,
        linkedin_url: body.linkedin_url,
        email: body.email,
        display_name: body.display_name,
        status: body.status,
      });
      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      return NextResponse.json({
        lead: {
          ...lead,
          linkedin_url: linkedinProfileUrl(lead.linkedin_url),
          profile_url: collectiveProfileUrl(lead.profile_id),
        },
      });
    }

    if (!body.seller_username?.trim()) {
      return NextResponse.json(
        { error: "seller_username is required" },
        { status: 400 },
      );
    }
    const lead = upsertPipelineLead({
      ...body,
      linkedin_url: body.linkedin_url,
    });
    return NextResponse.json({ lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
