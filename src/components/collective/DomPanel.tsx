"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BotStepsEditor } from "@/components/collective/BotStepsEditor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  accountId: number;
};

export function DomPanel({ accountId }: Props) {
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/collective/dom-analysis");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      if (typeof data.markdown === "string" && data.markdown) {
        setMarkdown(data.markdown);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load DOM analysis");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function importMarkdown(text: string) {
    setImporting(true);
    setError("");
    setMessage("");
    setAppliedSummary("");
    try {
      const res = await fetch("/api/collective/dom-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: text, applyAll: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setMarkdown(text);
      setMessage(data.message || "DOM analysis imported");
      const first = data.results?.[0];
      if (first?.applied?.length) {
        setAppliedSummary(
          first.applied
            .map(
              (a: { field: string; label: string; selector: string }) =>
                `${a.field}: ${a.selector}`,
            )
            .join(" · "),
        );
      }
      setEditorKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setMarkdown(text);
      void importMarkdown(text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6" data-testid="dom-panel">
      <div className="space-y-3 rounded-lg border border-[#e3eeea] bg-[#f7faf9] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-[#1c3330]">
              Import Claude DOM analysis
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Paste or import the Claude browser-extension markdown (selector
              tables). Mapped fields sync into bot DOM steps for all accounts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".md,text/markdown,text/plain"
              className="hidden"
              data-testid="dom-import-file"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              data-testid="dom-import-btn"
              onClick={() => fileRef.current?.click()}
              className="bg-[#2f81f7] text-white hover:bg-[#388bfd]"
            >
              Import .md
            </Button>
            <Button
              type="button"
              disabled={importing || !markdown.trim()}
              onClick={() => void importMarkdown(markdown)}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {importing ? "Applying…" : "Apply to DOM steps"}
            </Button>
          </div>
        </div>

        <Textarea
          data-testid="dom-analysis-markdown"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder="Paste Claude DOM analysis markdown here…"
          className="min-h-[160px] border-[#d5e3de] bg-white font-mono text-xs text-[#1c3330]"
        />

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
        {appliedSummary ? (
          <p className="text-xs text-zinc-500 break-all">{appliedSummary}</p>
        ) : null}
      </div>

      <BotStepsEditor
        key={editorKey}
        accountId={accountId}
        accountLabel={`Account #${accountId}`}
      />
    </div>
  );
}
