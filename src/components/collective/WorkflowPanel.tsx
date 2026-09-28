"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkflowStep } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const trackSelectClass =
  "h-9 w-44 rounded-lg border border-white/10 bg-[#161b22] px-3 text-sm text-white outline-none focus-visible:border-[#2f81f7]";

export function WorkflowPanel() {
  const [track, setTrack] = useState<"fullstack" | "blockchain">("fullstack");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [activeKey, setActiveKey] = useState("contact");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/collective/workflow?track=${track}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load workflow");
      const next = (data.steps ?? []) as WorkflowStep[];
      setSteps(next);
      if (next.length && !next.some((s) => s.step_key === activeKey)) {
        setActiveKey(next[0].step_key);
      }
      setStatus("Workflow loaded — edit any step, then Save workflow");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [track, activeKey]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const active = steps.find((s) => s.step_key === activeKey) ?? steps[0];

  function updateBody(body: string) {
    if (!active) return;
    setSteps((prev) =>
      prev.map((s) => (s.step_key === active.step_key ? { ...s, body } : s)),
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/collective/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track,
          steps: steps.map((s) => ({ step_key: s.step_key, body: s.body })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSteps(data.steps ?? []);
      setStatus("Workflow saved to integrated SQLite store");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="workflow-panel">
      <p className="text-sm text-zinc-400">
        Edit the hiring chat flow anytime. Placeholders:{" "}
        <code className="text-zinc-300">{"{{name}}"}</code>{" "}
        <code className="text-zinc-300">{"{{skills}}"}</code>{" "}
        <code className="text-zinc-300">{"{{username}}"}</code>{" "}
        <code className="text-zinc-300">{"{{repo}}"}</code>. Save writes to the
        shared Collective database (initial templates included).
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="workflow-track">
          Track
        </label>
        <select
          id="workflow-track"
          data-testid="workflow-track"
          className={trackSelectClass}
          value={track}
          onChange={(e) =>
            setTrack(e.target.value as "fullstack" | "blockchain")
          }
        >
          <option value="fullstack">Fullstack</option>
          <option value="blockchain">Blockchain</option>
        </select>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          Save workflow
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/5"
        >
          Reload
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading workflow…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="flex flex-col gap-1.5">
            {steps.map((step) => {
              const selected = step.step_key === (active?.step_key ?? "");
              return (
                <button
                  key={step.step_key}
                  type="button"
                  onClick={() => setActiveKey(step.step_key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? "border-[#2f81f7] bg-[#2f81f7]/15 text-white"
                      : "border-white/10 bg-[#161b22] text-zinc-300 hover:border-white/20"
                  }`}
                >
                  {step.step_label}
                </button>
              );
            })}
          </aside>

          <div className="space-y-3 rounded-xl border border-white/10 bg-[#0d1117] p-4">
            {active ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {active.step_label} ({track})
                  </h2>
                  <p className="text-sm text-zinc-500">{active.subtitle}</p>
                </div>
                <Textarea
                  value={active.body}
                  onChange={(e) => updateBody(e.target.value)}
                  rows={16}
                  className="min-h-[320px] border-white/10 bg-[#161b22] font-mono text-sm text-zinc-100"
                />
              </>
            ) : (
              <p className="text-sm text-zinc-500">No steps for this track.</p>
            )}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : status ? (
        <p className="text-sm text-amber-300">{status}</p>
      ) : null}
    </div>
  );
}
