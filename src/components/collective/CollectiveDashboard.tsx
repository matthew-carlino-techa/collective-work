"use client";

import { useEffect, useState } from "react";
import { AccountsPanel } from "@/components/collective/AccountsPanel";
import { BrainPanel } from "@/components/collective/BrainPanel";
import { DomPanel } from "@/components/collective/DomPanel";
import { PipelinePanel } from "@/components/collective/PipelinePanel";
import { TestChatPanel } from "@/components/collective/TestChatPanel";

type Section = "bots" | "pipeline" | "brain" | "dom" | "chat";

const SECTIONS: Array<{ id: Section; label: string; hint: string }> = [
  { id: "pipeline", label: "Pipeline", hint: "Candidates · LinkedIn" },
  { id: "bots", label: "Accounts", hint: "Open · Start · Stop" },
  { id: "dom", label: "DOM", hint: "Claude import · steps" },
  { id: "brain", label: "Brain", hint: "First msg .md" },
  {
    id: "chat",
    label: "Test chat",
    hint: "Practice replies from chat-workflow.md · not sent to Collective",
  },
];

function normalizeSection(raw: string): Section {
  if (raw === "accounts") return "bots";
  if (
    raw === "bots" ||
    raw === "pipeline" ||
    raw === "brain" ||
    raw === "dom" ||
    raw === "chat"
  ) {
    return raw;
  }
  return "bots";
}

type Props = {
  /** Controlled from DashboardShell hash `#collective/<section>` */
  section?: string;
  onSectionChange?: (section: string) => void;
};

export function CollectiveDashboard({
  section: sectionProp,
}: Props) {
  const [section, setSection] = useState<Section>(() =>
    normalizeSection(sectionProp || "bots"),
  );
  const [domAccountId, setDomAccountId] = useState<number | null>(null);
  const [accountCount, setAccountCount] = useState<number | null>(null);

  useEffect(() => {
    if (sectionProp != null) {
      setSection(normalizeSection(sectionProp));
    }
  }, [sectionProp]);

  useEffect(() => {
    if (section !== "dom" && section !== "bots") return;
    void (async () => {
      const res = await fetch("/api/collective/accounts");
      const data = await res.json();
      const list = data.accounts || [];
      setAccountCount(list.length);
      const first = list[0];
      if (first?.id) setDomAccountId(first.id);
    })();
  }, [section]);

  return (
    <div className="flex flex-col gap-4" data-testid="collective-dashboard">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1c3330]">
            {section === "pipeline"
              ? "All candidates"
              : section === "chat"
                ? "Test chat"
                : section === "brain"
                  ? "Sample MD"
                  : section === "dom"
                    ? "DOM"
                    : "Collective"}
          </h2>
          <p className="text-xs text-[#6d847f]">
            {SECTIONS.find((s) => s.id === section)?.hint ||
              "Preview the First msg. Nothing is sent."}
          </p>
        </div>
        {accountCount != null && section === "bots" ? (
          <span className="text-xs text-[#8aa099]">
            {accountCount} bot{accountCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div
        id={`collective-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`collective-tab-${section}`}
      >
        {section === "bots" ? <AccountsPanel /> : null}
        {section === "pipeline" ? <PipelinePanel /> : null}
        {section === "brain" ? <BrainPanel /> : null}
        {section === "dom" ? (
          domAccountId != null ? (
            <DomPanel accountId={domAccountId} />
          ) : (
            <p className="rounded-lg border border-dashed border-[#d5e3de] px-4 py-10 text-center text-sm text-[#6d847f]">
              Add a bot, then import Claude DOM analysis here.
            </p>
          )
        ) : null}
        {section === "chat" ? <TestChatPanel /> : null}
      </div>
    </div>
  );
}
