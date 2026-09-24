/** Collective public profile slug. Database stores this id only. */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Name → slug. Hyphens inside a name are removed (`Jean-Charles` → `jeancharles`). */
export function slugifyCollectiveName(name: string | null | undefined): string {
  const raw = (name || "").trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/['’\-]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

/** Accept a stored slug, a `/profile/{slug}` URL, or a candidate name. */
export function collectiveProfileId(raw: string | null | undefined): string {
  const u = (raw || "").trim();
  if (!u) return "";

  if (/collective\.work/i.test(u) || u.startsWith("/profile/")) {
    try {
      const url = u.startsWith("http")
        ? new URL(u)
        : new URL(u, "https://www.collective.work");
      const parts = url.pathname.split("/").filter(Boolean).map((p) =>
        decodeURIComponent(p).toLowerCase(),
      );
      const i = parts.indexOf("profile");
      if (i >= 0 && parts[i + 1] && SLUG.test(parts[i + 1])) return parts[i + 1];
    } catch {
      /* fall through */
    }
  }

  if (SLUG.test(u)) return u;
  return slugifyCollectiveName(u);
}

/** Dashboard display URL. Database stores `collectiveProfileId` only. */
export function collectiveProfileUrl(idOrName: string | null | undefined): string {
  const id = collectiveProfileId(idOrName);
  if (!id) return "";
  return `https://www.collective.work/profile/${id}`;
}
