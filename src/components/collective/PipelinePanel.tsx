"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineLead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_OPTIONS = [
  "All",
  "contacting",
  "waiting",
  "skipped",
  "active",
  "done",
  "error",
];
const STEP_OPTIONS = [
  "All",
  "Contact",
  "Step2",
  "Step3",
  "Step4",
  "Step5",
  "Step6",
  "Step7",
];

const SITE_LABELS: Record<string, string> = {
  collective: "Collective.work",
  upwork: "Upwork",
  fiverr: "Fiverr",
  freelancer: "Freelancer",
};

const PAGE_SIZES = [10, 25, 50] as const;

const filterClass =
  "h-9 rounded-lg border border-[#d5e3de] bg-white px-3 text-sm text-[#1c3330] outline-none focus-visible:border-[#0f766e]";

function statusClass(status: string) {
  if (status === "contacting") {
    return "bg-amber-500/20 text-amber-300 animate-pulse";
  }
  if (status === "waiting") return "bg-emerald-500/15 text-emerald-300";
  if (status === "skipped") return "bg-white/5 text-zinc-500";
  if (status === "error") return "bg-red-500/15 text-red-300";
  return "bg-white/5 text-zinc-400";
}

function siteLabel(platform: string) {
  return SITE_LABELS[platform?.toLowerCase()] || platform || "—";
}

export function PipelinePanel() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(["collective"]);
  const [status, setStatus] = useState("All");
  const [step, setStep] = useState("All");
  const [platform, setPlatform] = useState("All");
  const [nameQuery, setNameQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(25);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contactingCount, setContactingCount] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams({
        status,
        step,
        platform,
        q: nameQuery,
      });
      const res = await fetch(`/api/collective/pipeline?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load pipeline");
      const next = (data.leads ?? []) as PipelineLead[];
      setLeads(next);
      if (Array.isArray(data.platforms) && data.platforms.length) {
        setPlatforms(data.platforms);
      }
      setContactingCount(
        next.filter((l) => l.status === "contacting").length,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status, step, platform, nameQuery]);

  useEffect(() => {
    setPage(1);
  }, [status, step, platform, nameQuery, pageSize]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(id);
  }, [load]);

  async function toggleFlag(
    lead: PipelineLead,
    field: "following" | "double_checked",
    value: boolean,
  ) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id ? { ...l, [field]: value ? 1 : 0 } : l,
      ),
    );
    try {
      const res = await fetch("/api/collective/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "patch",
          id: lead.id,
          [field]: value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      if (data.lead) {
        setLeads((prev) =>
          prev.map((l) => (l.id === data.lead.id ? data.lead : l)),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      void load();
    }
  }

  async function exportLinks() {
    setError("");
    const res = await fetch("/api/collective/pipeline?format=links&platform=collective");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Export failed");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "collective-profile-links.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importLinks(file: File) {
    setImporting(true);
    setError("");
    try {
      const text = await file.text();
      const res = await fetch("/api/collective/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_links", text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setNotice(
        `Imported ${data.updated} profiles. ${data.missing} seller keys were not in the pipeline. ${data.skipped} rows had nothing to save.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5" data-testid="pipeline-panel">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="pipeline-site">
          Freelancing site
        </label>
        <select
          id="pipeline-site"
          data-testid="pipeline-site"
          className={`${filterClass} w-44`}
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="All">Site: All</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {siteLabel(p)}
            </option>
          ))}
        </select>

        <Input
          id="pipeline-name"
          data-testid="pipeline-name"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setNameQuery(draftQuery.trim());
          }}
          placeholder="Filter by candidate name…"
          className={`${filterClass} w-56`}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setNameQuery(draftQuery.trim())}
          className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
        >
          Search
        </Button>

        <select
          id="pipeline-status"
          data-testid="pipeline-status"
          className={`${filterClass} w-36`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "All" ? "Status: All" : opt}
            </option>
          ))}
        </select>
        <select
          id="pipeline-step"
          data-testid="pipeline-step"
          className={`${filterClass} w-36`}
          value={step}
          onChange={(e) => setStep(e.target.value)}
        >
          {STEP_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "All" ? "Step: All" : opt}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="export-profile-links"
          onClick={() => void exportLinks()}
          className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
        >
          Export for Grok
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="import-profile-links"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
        >
          {importing ? "Importing…" : "Import profiles"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,.md,application/json,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importLinks(file);
          }}
        />
        {contactingCount > 0 ? (
          <span
            data-testid="pipeline-contacting-badge"
            className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300"
          >
            {contactingCount} now contacting
          </span>
        ) : null}
        <label className="sr-only" htmlFor="pipeline-page-size">
          Rows per page
        </label>
        <select
          id="pipeline-page-size"
          data-testid="pipeline-page-size"
          className={`${filterClass} w-28`}
          value={pageSize}
          onChange={(e) =>
            setPageSize(Number(e.target.value) as 10 | 25 | 50)
          }
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">
          {leads.length} profile{leads.length === 1 ? "" : "s"} · LinkedIn URL
          is the full https link
        </p>
      </div>

      {notice ? <p className="text-sm text-[#1f6b4a]">{notice}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading && leads.length === 0 ? (
        <p className="text-sm text-zinc-500">Loading pipeline…</p>
      ) : leads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d5e3de] px-4 py-8 text-center text-sm text-[#6d847f]">
          No candidate profiles for these filters.
        </p>
      ) : (
        <PipelineTable
          leads={leads}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onToggle={toggleFlag}
          statusClass={statusClass}
        />
      )}
    </div>
  );
}

function PipelineTable({
  leads,
  page,
  pageSize,
  onPage,
  onToggle,
  statusClass: statusClassFn,
}: {
  leads: PipelineLead[];
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onToggle: (
    lead: PipelineLead,
    field: "following" | "double_checked",
    value: boolean,
  ) => void;
  statusClass: (status: string) => string;
}) {
  const pageCount = Math.max(1, Math.ceil(leads.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const rows = leads.slice(start, start + pageSize);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  async function copyLinkedIn(lead: PipelineLead, url: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(lead.id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === lead.id ? null : cur));
      }, 1200);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-3 font-medium">Candidate</th>
                <th className="min-w-[220px] px-2 py-3 font-medium">
                  LinkedIn URL
                </th>
                <th className="min-w-[280px] px-2 py-3 font-medium">
                  Site
                </th>
                <th className="px-2 py-3 font-medium">Email</th>
                <th className="px-2 py-3 font-medium text-center">Following</th>
                <th className="px-2 py-3 font-medium text-center">
                  Double-check
                </th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-2 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const linkedin = (lead.linkedin_url || "").trim();
                return (
                  <tr
                    key={lead.id}
                    className={`border-t border-[#eef4f2] ${
                      lead.status === "contacting" ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <td className="px-2 py-3 font-medium text-[#1c3330]">
                      <div>
                        <span className="block text-[#1c3330]">
                          {lead.display_name || lead.seller_username}
                        </span>
                        <span className="text-xs text-zinc-500">
                          @{lead.seller_username}
                        </span>
                      </div>
                    </td>
                    <td className="min-w-[220px] max-w-[360px] px-2 py-3">
                      {linkedin ? (
                        <button
                          type="button"
                          data-testid={`copy-linkedin-${lead.id}`}
                          onClick={() => void copyLinkedIn(lead, linkedin)}
                          className="cursor-pointer break-all text-left text-xs text-[#79b8ff] hover:underline"
                          title="Copy LinkedIn URL"
                        >
                          {copiedId === lead.id ? "Copied" : linkedin}
                        </button>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="min-w-[280px] max-w-[420px] px-2 py-3">
                      {lead.profile_url ? (
                        <a
                          href={lead.profile_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-xs text-zinc-200 hover:text-[#79b8ff] hover:underline"
                        >
                          {lead.profile_url}
                        </a>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-zinc-300">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-[#79b8ff] hover:underline"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        data-testid={`following-${lead.id}`}
                        checked={Boolean(lead.following)}
                        onChange={(e) =>
                          void onToggle(lead, "following", e.target.checked)
                        }
                        className="h-4 w-4 cursor-pointer accent-[#2f81f7]"
                        aria-label={`Following ${lead.display_name || lead.seller_username}`}
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        data-testid={`double-check-${lead.id}`}
                        checked={Boolean(lead.double_checked)}
                        onChange={(e) =>
                          void onToggle(
                            lead,
                            "double_checked",
                            e.target.checked,
                          )
                        }
                        className="h-4 w-4 cursor-pointer accent-emerald-500"
                        aria-label={`Double-check ${lead.display_name || lead.seller_username}`}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs ${statusClassFn(lead.status)}`}
                      >
                        {lead.status === "contacting"
                          ? "now contacting"
                          : lead.status}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-zinc-400">
                      {formatActivity(lead.last_activity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
          <p>
            Showing {start + 1}–{Math.min(start + pageSize, leads.length)} of{" "}
            {leads.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => onPage(safePage - 1)}
              className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
            >
              Previous
            </Button>
            <span className="text-xs text-zinc-500">
              Page {safePage} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={safePage >= pageCount}
              onClick={() => onPage(safePage + 1)}
              className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
            >
              Next
            </Button>
          </div>
        </div>
    </div>
  );
}

function formatActivity(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
