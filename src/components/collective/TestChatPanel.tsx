"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Turn = { role: "bot" | "you"; text: string };

/** Local preview of the brain First msg. Nothing is sent to Collective or an LLM. */
export function TestChatPanel() {
  const [firstMsg, setFirstMsg] = useState("");
  const [name, setName] = useState("Sam Chen");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/collective/brain?platform=collective");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load the brain");
        return;
      }
      setFirstMsg(String(data.brain?.first_msg || ""));
    })();
  }, []);

  function start() {
    const text = firstMsg.trim();
    if (!text) {
      setError("Brain First msg is empty. Open Sample MD and save one.");
      return;
    }
    setError("");
    const personalized = text.replace(/\{name\}/gi, name.trim() || "there");
    setTurns([{ role: "bot", text: personalized }]);
  }

  function send() {
    const text = draft.trim();
    if (!text || turns.length === 0) return;
    setDraft("");
    setTurns((prev) => [
      ...prev,
      { role: "you", text },
      {
        role: "bot",
        text: "Preview only. Start on a bot sends the First msg. This chat does not call a model or Collective.",
      },
    ]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]" data-testid="test-chat">
      <div className="space-y-3 rounded-2xl border border-[#e3eeea] bg-[#f7faf9] p-4">
        <h2 className="text-lg font-medium text-[#1c3330]">Test chat</h2>
        <p className="text-xs text-[#6d847f]">
          Preview the Collective First msg with a name filled in. Nothing is
          sent.
        </p>
        <label className="block space-y-1 text-xs text-[#5d736e]">
          Your name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
        </label>
        <label className="block space-y-1 text-xs text-[#5d736e]">
          Profile notes
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kept on this screen only"
            className="min-h-24 border-[#d5e3de] bg-white text-sm text-[#1c3330]"
          />
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={start}
            className="bg-[#0f766e] text-white hover:bg-[#0d655e]"
          >
            Start chat
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTurns([])}
            className="border-[#d5e3de]"
          >
            Reset
          </Button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
      <div className="flex min-h-[420px] flex-col rounded-2xl border border-[#e3eeea]">
        <div className="flex-1 space-y-3 p-4">
          {turns.length === 0 ? (
            <p className="pt-16 text-center text-sm text-[#8aa099]">
              Pick a name and start. The bot opens with the brain First msg.
            </p>
          ) : (
            turns.map((turn, i) => (
              <div
                key={`${turn.role}-${i}`}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  turn.role === "bot"
                    ? "bg-[#e7f6f2] text-[#1c3330]"
                    : "ml-auto bg-[#0f766e] text-white"
                }`}
              >
                {turn.text}
              </div>
            ))
          )}
          {notes.trim() && turns.length > 0 ? (
            <p className="text-[11px] text-[#8aa099]">Notes: {notes}</p>
          ) : null}
        </div>
        <form
          className="flex gap-2 border-t border-[#e3eeea] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply locally. This is not sent."
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
          <Button
            type="submit"
            className="bg-[#0f766e] text-white hover:bg-[#0d655e]"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
