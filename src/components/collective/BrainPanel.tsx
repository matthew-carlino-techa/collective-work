"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type BrainPayload = {
  first_msg: string;
  project_description: string;
  chat_rules: string;
  other: string;
  standard: string;
  raw: string;
  source: string;
  updated_at: string;
};

export function BrainPanel() {
  const [brain, setBrain] = useState<BrainPayload | null>(null);
  const [raw, setRaw] = useState("");
  const [template, setTemplate] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    const res = await fetch("/api/collective/brain?platform=collective");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load brain");
      return;
    }
    setBrain(data.brain);
    setRaw(data.brain.raw || "");
    setTemplate(data.template || "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMarkdown(markdown: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/collective/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "collective", markdown }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setBrain(data.brain);
      setRaw(data.brain.raw);
      setMessage(data.message || "Brain saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRaw(text);
      void saveMarkdown(text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-5" data-testid="brain-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[#1c3330]">Bot brain (.md)</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#5d736e]">
            ASD-STE100 structured markdown is the bot’s brain. Import a{" "}
            <code className="text-zinc-300">.md</code> file —{" "}
            <strong>1. First msg</strong> is what Start sends on Collective.
            Update the MD to change behavior without code changes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="bg-[#2f81f7] text-white hover:bg-[#388bfd]"
          >
            Import .md
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRaw(template);
              setMessage("Template loaded in editor — Save to activate");
            }}
            className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
          >
            Load template
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void saveMarkdown(raw)}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {saving ? "Saving…" : "Save brain"}
          </Button>
        </div>
      </div>

      {(error || message) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>
          {error || message}
        </p>
      )}

      {brain ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#e3eeea] bg-[#f7faf9] p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              1. First msg (sent by Start)
            </p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-emerald-300">
              {brain.first_msg || "(empty)"}
            </pre>
          </div>
          <div className="rounded-lg border border-[#e3eeea] bg-[#f7faf9] p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Meta
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              {brain.standard || "ASD-STE100"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Updated {brain.updated_at}
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm text-zinc-400">Raw markdown editor</p>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-h-[420px] border-[#d5e3de] bg-white font-mono text-xs text-[#1c3330]"
        />
      </div>
    </div>
  );
}
