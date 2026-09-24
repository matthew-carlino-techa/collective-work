/** Normalize scraped / stored LinkedIn hrefs to full https URLs. */
export function normalizeLinkedInUrl(raw: string | null | undefined): string {
  let u = (raw || "").trim();
  if (!u || u === "#" || u === "about:blank") return "";

  // Protocol-relative
  if (u.startsWith("//")) u = `https:${u}`;

  // Site-relative
  if (u.startsWith("/")) {
    u = `https://www.linkedin.com${u}`;
  }

  // Bare path like in/username or linkedin.com/...
  if (!/^https?:\/\//i.test(u)) {
    if (/linkedin\.com/i.test(u)) {
      u = `https://${u.replace(/^\/+/, "")}`;
    } else if (/^(in|pub|company)\//i.test(u)) {
      u = `https://www.linkedin.com/${u.replace(/^\/+/, "")}`;
    } else {
      return "";
    }
  }

  try {
    const url = new URL(u);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return "";
    // Prefer www host for readability
    if (url.hostname === "linkedin.com") url.hostname = "www.linkedin.com";
    // Drop noisy tracking params but keep the path
    url.hash = "";
    ["trk", "originalSubdomain", "lipi", "licu"].forEach((k) =>
      url.searchParams.delete(k),
    );
    let out = url.toString();
    if (out.endsWith("/") && url.pathname !== "/") {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return u;
  }
}

/** LinkedIn vanity id only — `nidhal-ben-taarit`, or `company/acme`. */
export function linkedinProfileId(raw: string | null | undefined): string {
  const u = (raw || "").trim();
  if (!u) return "";

  const full = normalizeLinkedInUrl(u);
  if (full) {
    try {
      const url = new URL(full);
      const parts = url.pathname.split("/").filter(Boolean).map((p) =>
        decodeURIComponent(p),
      );
      if ((parts[0] === "in" || parts[0] === "pub") && parts[1]) return parts[1];
      if (parts[0] === "company" && parts[1]) return `company/${parts[1]}`;
      return parts[parts.length - 1] || "";
    } catch {
      return "";
    }
  }

  if (/^company\/[\w.\-%]+$/i.test(u)) return u;
  if (/^[\w.\-%]+$/.test(u)) return decodeURIComponent(u);
  return "";
}

/** Dashboard display URL. Database stores `linkedinProfileId` only. */
export function linkedinProfileUrl(idOrUrl: string | null | undefined): string {
  const id = linkedinProfileId(idOrUrl);
  if (!id) return "";
  if (id.startsWith("company/")) return `https://www.linkedin.com/${id}`;
  return `https://www.linkedin.com/in/${id}`;
}
