/** Registry of freelancing platforms — Collective is live; others slot in later. */

export type PlatformId = "collective" | "upwork" | "fiverr" | "freelancer";

export type PlatformDef = {
  id: PlatformId;
  label: string;
  short: string;
  /** Hosted product URL (operator reference) */
  site?: string;
  /** false = tab visible but not wired yet */
  enabled: boolean;
  blurb: string;
};

export const PLATFORMS: PlatformDef[] = [
  {
    id: "collective",
    label: "Collective.work",
    short: "Collective",
    site: "https://app.collective.work",
    enabled: true,
    blurb: "Sherlock search and first-message DMs",
  },
  {
    id: "upwork",
    label: "Upwork",
    short: "Upwork",
    site: "https://www.upwork.com",
    enabled: false,
    blurb: "Proposal and message automation",
  },
  {
    id: "fiverr",
    label: "Fiverr",
    short: "Fiverr",
    site: "https://www.fiverr.com",
    enabled: false,
    blurb: "Gig outreach and reply bots",
  },
  {
    id: "freelancer",
    label: "Freelancer",
    short: "Freelancer",
    site: "https://www.freelancer.com",
    enabled: false,
    blurb: "Bid and chat workers",
  },
];

export function getPlatform(id: string | null | undefined): PlatformDef {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]!;
}
