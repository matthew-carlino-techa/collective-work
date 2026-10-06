"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Turn = { role: "bot" | "you"; text: string; branch?: string };
type Candidate = {
  id: number;
  display_name: string;
  seller_username: string;
  status: string;
  email: string;
  linkedin_url: string;
  profile_id: string;
};

const QUICK_REPLIES = [
  { label: "Interested", text: "Yes, I'm interested — tell me more." },
  { label: "What's the process?", text: "What is Proof of Dev and how does the hiring process work?" },
  { label: "Salary?", text: "What is the salary / compensation range?" },
  { label: "I applied", text: "I just applied on the careers page." },
  { label: "Busy", text: "I'm busy this week — follow up later." },
  { label: "Not interested", text: "No thanks, not interested." },
];

/**
 * Practice Collective Chat with the chat-workflow brain.
 * Uses real pipeline names when available. Nothing is sent to Collective.
 */
export function TestChatPanel() {
  const [name, setName] = useState("Sam Chen");
  const [username, setUsername] = useState("");
  const [notes, setNotes] = useState("React, Node, TypeScript");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [source, setSource] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/collective/test-chat");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load chat workflow");
      setSource(String(data.source || ""));
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chat workflow");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function pickCandidate(id: string) {
    setCandidateId(id);
    const c = candidates.find((x) => String(x.id) === id);
    if (!c) return;
    setName(c.display_name);
    setUsername(c.seller_username);
    const bits = [
      c.status ? `pipeline: ${c.status}` : "",
      c.email ? `email: ${c.email}` : "",
      c.linkedin_url ? `linkedin: ${c.linkedin_url}` : "",
      c.profile_id ? `profile: ${c.profile_id}` : "",
    ].filter(Boolean);
    setNotes(bits.join(" · ") || "React, Node, TypeScript");
  }

  async function start() {
    setBusy(true);
    setError("");
    setStopped(false);
    try {
      const res = await fetch("/api/collective/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          name,
          username: username || name,
          notes,
          skills: notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open chat");
      setTurns([{ role: "bot", text: data.text, branch: data.branch }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open chat");
    } finally {
      setBusy(false);
    }
  }

  async function sendText(text: string) {
    const message = text.trim();
    if (!message || busy || stopped) return;
    if (turns.length === 0) {
      setError("Start chat first — the bot opens with First msg.");
      return;
    }
    setDraft("");
    setBusy(true);
    setError("");
    const nextHistory = [...turns, { role: "you" as const, text: message }];
    setTurns(nextHistory);
    try {
      const res = await fetch("/api/collective/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          message,
          name,
          username: username || name,
          notes,
          skills: notes,
          history: nextHistory.map(({ role, text: t }) => ({ role, text: t })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reply failed");
      setTurns((prev) => [
        ...prev,
        { role: "bot", text: data.text, branch: data.branch },
      ]);
      if (data.stopped) setStopped(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]" data-testid="test-chat">
      <div className="space-y-3 rounded-2xl border border-[#e3eeea] bg-[#f7faf9] p-4">
        <h2 className="text-lg font-medium text-[#1c3330]">Test chat</h2>
        <p className="text-xs text-[#6d847f]">
          Practice the Collective chat workflow against a candidate. Replies
          come from <code className="text-[#3d524e]">chat-workflow.md</code>.
          Nothing is sent to Collective.
        </p>

        <label className="block space-y-1 text-xs text-[#5d736e]">
          Pipeline candidate
          <select
            data-testid="test-chat-candidate"
            className="h-9 w-full rounded-lg border border-[#d5e3de] bg-white px-2 text-sm text-[#1c3330]"
            value={candidateId}
            onChange={(e) => pickCandidate(e.target.value)}
          >
            <option value="">Custom name…</option>
            {candidates.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.display_name} ({c.status})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-xs text-[#5d736e]">
          Candidate name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setCandidateId("");
            }}
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
        </label>

        <label className="block space-y-1 text-xs text-[#5d736e]">
          Seller key / username
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="optional"
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
        </label>

        <label className="block space-y-1 text-xs text-[#5d736e]">
          Skills / profile notes
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Used as {{skills}} in Step templates"
            className="min-h-20 border-[#d5e3de] bg-white text-sm text-[#1c3330]"
          />
        </label>

        <div className="flex gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="bg-[#0f766e] text-white hover:bg-[#0d655e]"
          >
            {busy && turns.length === 0 ? "Opening…" : "Start chat"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTurns([]);
              setStopped(false);
              setError("");
            }}
            className="border-[#d5e3de]"
          >
            Reset
          </Button>
        </div>

        {source ? (
          <p className="truncate text-[11px] text-[#8aa099]" title={source}>
            Brain: {source.split(/[/\\]/).slice(-2).join("/")}
          </p>
        ) : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {stopped ? (
          <p className="text-xs text-amber-700">
            Outreach stopped for this candidate (decline branch).
          </p>
        ) : null}
      </div>

      <div className="flex min-h-[480px] flex-col rounded-2xl border border-[#e3eeea] bg-white">
        <div className="flex flex-wrap gap-1.5 border-b border-[#eef4f2] px-3 py-2">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={busy || turns.length === 0 || stopped}
              onClick={() => void sendText(q.text)}
              className="cursor-pointer rounded-full border border-[#d5e3de] bg-[#f7faf9] px-2.5 py-1 text-[11px] text-[#3d524e] hover:bg-[#e7f6f2] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 ? (
            <p className="pt-16 text-center text-sm text-[#8aa099]">
              Pick a pipeline candidate (or type a name), then Start chat. The
              bot opens with First msg and answers from the chat workflow.
            </p>
          ) : (
            turns.map((turn, i) => (
              <div key={`${turn.role}-${i}`}>
                <div
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    turn.role === "bot"
                      ? "bg-[#e7f6f2] text-[#1c3330]"
                      : "ml-auto bg-[#0f766e] text-white"
                  }`}
                >
                  {turn.text}
                </div>
                {turn.role === "bot" && turn.branch ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[#8aa099]">
                    {turn.branch}
                  </p>
                ) : null}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex gap-2 border-t border-[#e3eeea] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendText(draft);
          }}
        >
          <Input
            value={draft}
            disabled={busy || stopped || turns.length === 0}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              stopped
                ? "Chat stopped for this candidate"
                : "Type as the candidate…"
            }
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
          <Button
            type="submit"
            disabled={busy || stopped || turns.length === 0 || !draft.trim()}
            className="bg-[#0f766e] text-white hover:bg-[#0d655e]"
          >
            {busy ? "…" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
