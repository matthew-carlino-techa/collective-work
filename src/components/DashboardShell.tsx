"use client";

import { useEffect, useState } from "react";
import { CollectiveDashboard } from "@/components/collective/CollectiveDashboard";
import {
  PLATFORMS,
  getPlatform,
  type PlatformId,
} from "@/lib/platforms";
import type { CollectiveAccount } from "@/lib/types";

const NAV = [
  { id: "bots", label: "Platforms" },
  { id: "pipeline", label: "Candidates" },
  { id: "brain", label: "Sample MD" },
  { id: "chat", label: "Test chat" },
  { id: "dom", label: "DOM" },
] as const;

function platformFromHash(): PlatformId {
  if (typeof window === "undefined") return "collective";
  const raw = window.location.hash.replace(/^#/, "");
  const platformPart = raw.split("/")[0] || raw;
  if (
    !platformPart ||
    platformPart === "bots" ||
    platformPart === "accounts" ||
    platformPart === "pipeline" ||
    platformPart === "brain" ||
    platformPart === "dom" ||
    platformPart === "chat" ||
    platformPart === "candidates"
  ) {
    return "collective";
  }
  const found = PLATFORMS.find((p) => p.id === platformPart);
  return found?.id ?? "collective";
}

function sectionFromHash(): string {
  if (typeof window === "undefined") return "bots";
  const raw = window.location.hash.replace(/^#/, "");
  if (raw === "candidates") return "pipeline";
  const parts = raw.split("/");
  if (parts.length >= 2 && parts[1]) return parts[1];
  if (
    raw === "pipeline" ||
    raw === "brain" ||
    raw === "dom" ||
    raw === "bots" ||
    raw === "accounts" ||
    raw === "chat"
  ) {
    return raw === "accounts" ? "bots" : raw;
  }
  return "bots";
}

function PlatformComingSoon({ name }: { name: string }) {
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d5e3de] bg-white px-6 py-16 text-center"
      data-testid="platform-coming-soon"
    >
      <p className="text-base font-medium text-[#1c3330]">{name}</p>
      <p className="max-w-md text-sm text-[#6d847f]">
        Same desk as Collective once this platform is wired: bots, secrets,
        brain MD, and candidates.
      </p>
    </div>
  );
}

export function DashboardShell() {
  const [platformId, setPlatformId] = useState<PlatformId>("collective");
  const [section, setSection] = useState("bots");
  const [accounts, setAccounts] = useState<CollectiveAccount[]>([]);
  const [leadTotal, setLeadTotal] = useState(0);
  const [successTotal, setSuccessTotal] = useState(0);

  useEffect(() => {
    const sync = () => {
      setPlatformId(platformFromHash());
      setSection(sectionFromHash());
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const [aRes, pRes] = await Promise.all([
          fetch("/api/collective/accounts"),
          fetch("/api/collective/pipeline?platform=All"),
        ]);
        const aData = await aRes.json();
        const pData = await pRes.json();
        if (stop) return;
        setAccounts(aData.accounts ?? []);
        const leads = (pData.leads ?? []) as Array<{ status?: string }>;
        setLeadTotal(leads.length);
        setSuccessTotal(leads.filter((l) => l.status === "done").length);
      } catch {
        /* header stats are optional */
      }
    })();
    return () => {
      stop = true;
    };
  }, [section]);

  function goPlatform(id: PlatformId) {
    const def = getPlatform(id);
    if (!def.enabled) {
      window.location.hash = `${id}`;
      setPlatformId(id);
      return;
    }
    const nextSection = section && section !== "pipeline" ? section : "bots";
    window.location.hash = `${id}/${nextSection}`;
    setPlatformId(id);
    setSection(nextSection);
  }

  function goSection(next: string) {
    const platform = platformId === "collective" ? platformId : "collective";
    window.location.hash = `${platform}/${next}`;
    setPlatformId("collective");
    setSection(next);
  }

  const platform = getPlatform(platformId);
  const running = accounts.filter((a) => a.start_status === "yes").length;
  const stopped = accounts.filter((a) => a.start_status !== "yes").length;

  return (
    <div className="min-h-full">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#e3eeea] bg-white/80 px-4 py-3 sm:px-6">
        <div className="mr-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d948e]">
            Multi-platform bot ops
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0f766e]">
            Ops
          </h1>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-8">
          <Stat label="Run" value={running} tone="green" />
          <Stat label="Stop" value={stopped} />
          <Stat label="Contact" value={leadTotal} />
          <Stat label="Success" value={successTotal} tone="green" />
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Sections">
          {NAV.map((item) => {
            const selected =
              platformId === "collective" && section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`section-${item.id}`}
                onClick={() => goSection(item.id)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-sm ${
                  selected
                    ? "bg-[#0f766e] text-white"
                    : "bg-white text-[#3d524e] ring-1 ring-[#d5e3de] hover:bg-[#f4f8f6]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-4 lg:grid-cols-[240px_1fr] sm:px-6">
        <aside className="space-y-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7d948e]">
            Platforms
          </p>
          <div
            className="space-y-2"
            role="tablist"
            aria-label="Platforms"
            data-testid="platform-tabs"
          >
            {PLATFORMS.map((p) => {
              const selected = platformId === p.id && section !== "pipeline";
              const count =
                p.id === "collective" ? accounts.length : 0;
              const run =
                p.id === "collective"
                  ? accounts.filter((a) => a.start_status === "yes").length
                  : 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`platform-${p.id}`}
                  data-testid={`platform-${p.id}`}
                  aria-selected={selected}
                  onClick={() => goPlatform(p.id)}
                  className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 text-left ${
                    selected
                      ? "border-[#b7ddd4] bg-white shadow-sm"
                      : "border-transparent bg-white/60 hover:bg-white"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      p.enabled
                        ? "bg-[#e7f6f2] text-[#0f766e]"
                        : "bg-[#eef2f1] text-[#8aa099]"
                    }`}
                  >
                    {p.short.slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#1c3330]">
                      {p.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#6d847f]">
                      {p.blurb}
                    </span>
                    <span className="mt-1 block text-[11px] text-[#8aa099]">
                      {count} bot{count === 1 ? "" : "s"}
                      {p.enabled ? ` · ${run} run` : " · soon"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            data-testid="section-pipeline"
            onClick={() => goSection("pipeline")}
            className={`w-full cursor-pointer rounded-2xl border px-3 py-3 text-left ${
              section === "pipeline"
                ? "border-[#b7ddd4] bg-white shadow-sm"
                : "border-[#e3eeea] bg-[#eef6f3] hover:bg-white"
            }`}
          >
            <span className="block text-sm font-medium text-[#1c3330]">
              All candidates
            </span>
            <span className="mt-0.5 block text-xs text-[#6d847f]">
              Full list across every platform
            </span>
            <span className="mt-1 block text-[11px] text-[#0f766e]">
              {leadTotal} total
            </span>
          </button>
        </aside>

        <section
          aria-labelledby={`platform-${platform.id}`}
          className="min-w-0 rounded-2xl border border-[#e3eeea] bg-white p-4 shadow-sm sm:p-5"
        >
          {platform.id === "collective" && platform.enabled ? (
            <CollectiveDashboard
              section={section}
              onSectionChange={goSection}
            />
          ) : (
            <PlatformComingSoon name={platform.label} />
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green";
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8aa099]">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          tone === "green" ? "text-[#0f766e]" : "text-[#1c3330]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
