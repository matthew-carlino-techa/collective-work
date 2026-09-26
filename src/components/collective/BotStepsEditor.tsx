"use client";

import { useCallback, useEffect, useState } from "react";
import {
  renumberStepLabels,
  type AccountBotConfig,
  type BotStep,
} from "@/lib/bot-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  accountId: number;
  accountLabel: string;
  onClose?: () => void;
};

export function BotStepsEditor({ accountId, accountLabel, onClose }: Props) {
  const [config, setConfig] = useState<AccountBotConfig | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [primaryAccountId, setPrimaryAccountId] = useState<number | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [newStepLabel, setNewStepLabel] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(
      `/api/collective/bot-config?accountId=${accountId}`,
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load bot steps");
      return;
    }
    setConfig(data.config);
    setIsPrimary(Boolean(data.isPrimary));
    setPrimaryAccountId(data.primaryAccountId ?? null);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveConfig(next: AccountBotConfig) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/collective/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, config: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data.config);
      setIsPrimary(Boolean(data.isPrimary));
      setMessage(
        data.propagated
          ? "Saved — copied to all other accounts"
          : "Bot steps saved for this account",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function pickStep(step: BotStep) {
    setError("");
    setMessage("");
    setPicking(step.id);
    try {
      const res = await fetch("/api/collective/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          action: "pick",
          stepId: step.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pick failed");
      if (data.cancelled) {
        setMessage("Pick cancelled");
      } else if (data.picked) {
        setConfig(data.config);
        setMessage(
          `Picked ${step.label}: ${data.picked.selector}${
            data.picked.sample ? ` (“${data.picked.sample}”)` : ""
          }${data.propagated ? " · synced to other accounts" : ""}`,
        );
      } else if (data.config) {
        setConfig(data.config);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pick failed");
    } finally {
      setPicking(null);
    }
  }

  async function addStep() {
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/collective/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          action: "add_step",
          label: newStepLabel || "Custom click",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add step failed");
      setConfig(data.config);
      setNewStepLabel("");
      setMessage(
        isPrimary
          ? "Step added — save/pick will sync to other accounts"
          : "Custom step added",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add step failed");
    }
  }

  async function removeStep(stepId: string) {
    setError("");
    try {
      const res = await fetch("/api/collective/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          action: "remove_step",
          stepId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setConfig(data.config);
      setMessage("Step removed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function syncFromFirst() {
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/collective/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          action: "sync_from_primary",
          all: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setConfig(data.config);
      setMessage(`Copied steps from account #${data.primaryId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    }
  }

  function updateStep(stepId: string, patch: Partial<BotStep>) {
    if (!config) return;
    const steps = renumberStepLabels(
      config.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    );
    setConfig({ ...config, steps });
  }

  if (!config) {
    return (
      <p className="text-sm text-zinc-500">
        Loading bot steps for {accountLabel}…
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-[#d5e3de] bg-white p-4">
      <div>
        <h3 className="text-lg font-medium text-[#1c3330]">
          Bot steps — {accountLabel}
          {isPrimary ? (
            <span className="ml-2 rounded bg-[#1f6feb]/30 px-2 py-0.5 text-xs text-[#58a6ff]">
              primary · others follow
            </span>
          ) : (
            <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-400">
              follows account #{primaryAccountId}
            </span>
          )}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          After <strong>Open</strong>, look for the green/blue bar at the top of
          the account Chrome window: <strong>Collective Bot Control · active</strong>.
          Then use <strong>Pick</strong> here. Saving the first account copies
          steps to all others.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-zinc-400">Sherlock search URL</Label>
        <Input
          value={config.search_url}
          onChange={(e) =>
            setConfig({ ...config, search_url: e.target.value })
          }
          className="border-[#d5e3de] bg-white font-mono text-sm text-[#1c3330]"
        />
      </div>

      <div className="space-y-3">
        {config.steps.map((step) => (
          <div
            key={step.id}
            className="grid gap-2 rounded-md border border-white/10 p-3 sm:grid-cols-[1fr_auto]"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={step.label}
                  onChange={(e) =>
                    updateStep(step.id, { label: e.target.value })
                  }
                  className="border-[#d5e3de] bg-white text-sm text-[#1c3330]"
                />
                <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-500">
                  {step.kind}
                </span>
                {step.optional ? (
                  <span className="text-xs text-zinc-500">optional</span>
                ) : null}
              </div>
              <Input
                value={step.selector}
                onChange={(e) =>
                  updateStep(step.id, { selector: e.target.value })
                }
                placeholder="CSS selector"
                className="border-[#d5e3de] bg-white font-mono text-xs text-emerald-800"
              />
            </div>
            <div className="flex flex-wrap items-end gap-1.5">
              <Button
                type="button"
                disabled={picking !== null}
                onClick={() => void pickStep(step)}
                className="bg-[#2f81f7] text-white hover:bg-[#388bfd]"
              >
                {picking === step.id ? "Click in Chrome…" : "Pick"}
              </Button>
              {step.kind === "click" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void removeStep(step.id)}
                  className="border-white/15 bg-transparent text-zinc-300 hover:bg-white/5"
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-white/15 p-3">
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label className="text-zinc-400">Add custom step</Label>
          <Input
            value={newStepLabel}
            onChange={(e) => setNewStepLabel(e.target.value)}
            placeholder="e.g. Click Next / Accept cookies"
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
        </div>
        <Button
          type="button"
          onClick={() => void addStep()}
          className="bg-teal-600 text-white hover:bg-teal-500"
        >
          Add step
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={() => void saveConfig(config)}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {saving
            ? "Saving…"
            : isPrimary
              ? "Save + sync to all accounts"
              : "Save bot steps"}
        </Button>
        {!isPrimary ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void syncFromFirst()}
            className="border-[#2f81f7]/40 bg-transparent text-[#58a6ff] hover:bg-[#2f81f7]/10"
          >
            Copy from first account
          </Button>
        ) : null}
        {onClose ? (
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/5"
          >
            Close
          </Button>
        ) : null}
      </div>

      {(error || message) && (
        <p
          className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}
        >
          {error || message}
        </p>
      )}
    </div>
  );
}
