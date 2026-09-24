import { collectiveProfileId } from "@/lib/collective-url";
import { linkedinProfileId } from "@/lib/linkedin-url";

export type ProfileLinkRow = {
  display_name: string;
  seller_username: string;
  linkedin_url: string;
  profile_url: string;
};

function cleanSeller(raw: string) {
  return raw.replace(/^@/, "").trim();
}

function fromObject(raw: Record<string, unknown>): ProfileLinkRow | null {
  const seller = cleanSeller(String(raw.seller_username ?? raw.seller ?? ""));
  if (!seller) return null;
  return {
    display_name: String(raw.display_name ?? raw.name ?? "").trim(),
    seller_username: seller,
    linkedin_url: String(raw.linkedin_url ?? raw.linkedin ?? "").trim(),
    profile_url: String(
      raw.profile_url ?? raw.collective_url ?? raw.site ?? "",
    ).trim(),
  };
}

/** JSON array, or blocks of name / @seller / linkedin / collective URL. */
export function parseProfileLinkFile(text: string): ProfileLinkRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)
        ? (parsed as { rows: unknown[] }).rows
        : [];
    return list
      .map((row) =>
        row && typeof row === "object"
          ? fromObject(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is ProfileLinkRow => Boolean(row));
  }

  const blocks = trimmed.split(/\n\s*\n/);
  const rows: ProfileLinkRow[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;
    const sellerLine = lines.find(
      (line) =>
        line.startsWith("@") ||
        /^c_[a-z0-9]+$/i.test(line) ||
        /^i\d+_/i.test(line),
    );
    const seller = cleanSeller(sellerLine || lines[1] || "");
    if (!seller) continue;
    const urls = lines.filter((line) => /^https?:\/\//i.test(line));
    const linkedin = urls.find((url) => /linkedin\.com/i.test(url)) || "";
    const profile =
      urls.find((url) => /collective\.work\/profile\//i.test(url)) || "";
    const name = lines.find(
      (line) => line !== sellerLine && !/^https?:\/\//i.test(line) && !line.startsWith("@"),
    );
    rows.push({
      display_name: name || "",
      seller_username: seller,
      linkedin_url: linkedin,
      profile_url: profile,
    });
  }
  return rows;
}

export function profileLinkIds(row: ProfileLinkRow) {
  const profileUrl = (row.profile_url || "").trim();
  return {
    seller_username: cleanSeller(row.seller_username || ""),
    display_name: (row.display_name || "").trim(),
    linkedin_id: linkedinProfileId(row.linkedin_url || ""),
    profile_id: profileUrl ? collectiveProfileId(profileUrl) : "",
  };
}
