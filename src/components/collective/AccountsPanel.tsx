"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountInput, CollectiveAccount } from "@/lib/types";
import { BrainPanel } from "@/components/collective/BrainPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PAGE_SIZES = [10, 15, 20] as const;

const emptyForm: AccountInput = {
  owner_name: "",
  username: "",
  email: "",
  password: "",
  github_fs_repo: "",
  github_bc_repo: "",
  github_pat: "",
  proxy_ip: "",
  proxy_port: "",
  proxy_user: "",
  proxy_pass: "",
  search_brief: "full stack developer React Node TypeScript",
  dm_per_day: 50,
  dm_per_hour: 20,
};

export function AccountsPanel() {
  const [accounts, setAccounts] = useState<CollectiveAccount[]>([]);
  const [form, setForm] = useState<AccountInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const [aRes, pRes] = await Promise.all([
        fetch("/api/collective/accounts"),
        fetch("/api/collective/pipeline?platform=collective"),
      ]);
      const aData = await aRes.json();
      if (!aRes.ok) throw new Error(aData.error || "Failed to load accounts");
      setAccounts(aData.accounts ?? []);
      if (pRes.ok) {
        const pData = await pRes.json();
        const next: Record<
          number,
          { contact: number; discussing: number; success: number; failed: number }
        > = {};
        for (const lead of pData.leads ?? []) {
          const id = Number(lead.assigned_account_id);
          if (!id) continue;
          const row = next[id] ?? {
            contact: 0,
            discussing: 0,
            success: 0,
            failed: 0,
          };
          row.contact += 1;
          if (lead.status === "done") row.success += 1;
          else if (lead.status === "error") row.failed += 1;
          else if (lead.status !== "skipped") row.discussing += 1;
          next[id] = row;
        }
        setStats(next);
      }
    } catch (e) {
      if (!opts?.quiet) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(accounts.length / pageSize));
    if (page > pageCount) setPage(pageCount);
  }, [accounts.length, pageSize, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const pending = accounts.some(
      (a) =>
        a.online_status === "pending" ||
        a.contact_status === "pending" ||
        a.start_status === "yes",
    );
    if (!pending) return;
    const timer = setInterval(() => {
      void load({ quiet: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [accounts, load]);

  function updateField<K extends keyof AccountInput>(key: K, value: AccountInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/collective/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setForm(emptyForm);
      setEditingId(null);
      setMessage(editingId ? "Account updated" : "Account added");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    id: number,
    action: "open" | "start" | "contact" | "stop",
  ) {
    setError("");
    setMessage("");
    const res = await fetch("/api/collective/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Action failed");
      if (data.account) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === data.account.id ? data.account : a)),
        );
      } else {
        await load({ quiet: true });
      }
      return;
    }
    if (action === "open") {
      setMessage(
        "Chrome opened via your proxy — login is auto-filled when the form appears; finish any CAPTCHA in that window.",
      );
    }
    if (action === "contact") {
      setMessage(
        data.result?.message ||
          "Contact finished — check Pipeline for new leads.",
      );
    }
    if (action === "start") {
      setMessage(
        "Start running — reconnects saved Chrome if needed, opens Sherlock, searches, then messages automatically.",
      );
    }
    if (action === "stop") {
      setMessage("Stopped — outreach halted and Chrome closed.");
    }
    await load({ quiet: true });
  }

  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [mdOpen, setMdOpen] = useState<CollectiveAccount | null>(null);
  const [secrets, setSecrets] = useState<CollectiveAccount | null>(null);
  const [secretForm, setSecretForm] = useState<AccountInput>(emptyForm);
  const [stats, setStats] = useState<
    Record<number, { contact: number; discussing: number; success: number; failed: number }>
  >({});

  async function runAll(action: "open_all" | "start_all" | "stop_all") {
    setError("");
    setMessage("");
    setBulkBusy(action);
    try {
      const res = await fetch("/api/collective/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bulk action failed");
        return;
      }
      if (data.accounts) setAccounts(data.accounts);
      const failed = (data.results || []).filter(
        (r: { ok: boolean }) => !r.ok,
      );
      setMessage(
        data.message +
          (failed.length
            ? ` · ${failed.length} failed (see account Error column)`
            : ""),
      );
      await load({ quiet: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(null);
    }
  }

  async function removeAccount(id: number) {
    if (!confirm("Delete this Collective account?")) return;
    const res = await fetch(`/api/collective/accounts?id=${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    await load();
  }

  function startEdit(account: CollectiveAccount) {
    setEditingId(account.id);
    setForm({
      owner_name: account.owner_name,
      username: account.username,
      email: account.email,
      password: account.password,
      github_fs_repo: account.github_fs_repo,
      github_bc_repo: account.github_bc_repo,
      github_pat: account.github_pat,
      proxy_ip: account.proxy_ip,
      proxy_port: account.proxy_port,
      proxy_user: account.proxy_user,
      proxy_pass: account.proxy_pass,
      search_brief:
        account.search_brief ||
        "full stack developer React Node TypeScript",
      dm_per_day: account.dm_per_day ?? 50,
      dm_per_hour: account.dm_per_hour ?? 20,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("account-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openSecrets(account: CollectiveAccount) {
    setSecrets(account);
    setSecretForm({
      owner_name: account.owner_name,
      username: account.username,
      email: account.email,
      password: account.password,
      github_fs_repo: account.github_fs_repo,
      github_bc_repo: account.github_bc_repo,
      github_pat: account.github_pat,
      proxy_ip: account.proxy_ip,
      proxy_port: account.proxy_port,
      proxy_user: account.proxy_user,
      proxy_pass: account.proxy_pass,
      search_brief: account.search_brief,
      dm_per_day: account.dm_per_day ?? 50,
      dm_per_hour: account.dm_per_hour ?? 20,
    });
  }

  async function saveSecrets(e: React.FormEvent) {
    e.preventDefault();
    if (!secrets) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/collective/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...secretForm, id: secrets.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage("Secrets saved");
      setSecrets(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="accounts-panel">
      {/* Ops strip — always first */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3eeea] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={bulkBusy !== null || accounts.length === 0}
            onClick={() => void runAll("open_all")}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {bulkBusy === "open_all" ? "Opening…" : "Open all"}
          </Button>
          <Button
            type="button"
            disabled={bulkBusy !== null || accounts.length === 0}
            onClick={() => void runAll("start_all")}
            className="bg-[#2f81f7] text-white hover:bg-[#388bfd]"
          >
            {bulkBusy === "start_all" ? "Starting…" : "Start all"}
          </Button>
          <Button
            type="button"
            disabled={bulkBusy !== null || accounts.length === 0}
            onClick={() => void runAll("stop_all")}
            className="bg-orange-600 text-white hover:bg-orange-500"
          >
            {bulkBusy === "stop_all" ? "Stopping…" : "Stop all"}
          </Button>
        </div>
        <p className="text-xs text-zinc-400">
          Each account has its own DM day/hour limits
        </p>
      </div>

      {(error || message) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>
          {error || message}
        </p>
      )}

      <form
        id="account-form"
        onSubmit={saveAccount}
        className="space-y-5 rounded-2xl border border-[#e3eeea] bg-white p-4"
      >
        <h2 className="text-lg font-semibold text-[#1c3330]">
          {editingId ? "Edit account" : "Add account"}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Owner name"
            placeholder="Everett Callahan"
            value={form.owner_name}
            onChange={(v) => updateField("owner_name", v)}
            required
          />
          <Field
            label="Collective username"
            placeholder="buyer_username"
            value={form.username}
            onChange={(v) => updateField("username", v)}
            required
          />
          <Field
            label="Email / login"
            placeholder="account@email.com"
            value={form.email ?? ""}
            onChange={(v) => updateField("email", v)}
          />
          <Field
            label="Collective password (empty if Google)"
            placeholder="........"
            type="password"
            value={form.password ?? ""}
            onChange={(v) => updateField("password", v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-zinc-400">
            Sherlock search brief (this account)
          </Label>
          <Input
            value={form.search_brief ?? ""}
            onChange={(e) => updateField("search_brief", e.target.value)}
            placeholder="full stack developer React Node TypeScript"
            className="border-[#d5e3de] bg-white text-[#1c3330]"
          />
          <p className="text-xs text-zinc-500">
            Each bot runs its own Sherlock query on Start / Contact.
          </p>
        </div>

        <p className="text-xs text-zinc-500">
          DMs / day and DMs / hour are the maximums. Sent DMs in the table
          go up by one for each message that is sent. Skipped profiles do
          not count.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-400">DMs / day (this account)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={String(form.dm_per_day ?? 50)}
              onChange={(e) =>
                updateField("dm_per_day", Math.max(0, Number(e.target.value) || 0))
              }
              className="border-[#d5e3de] bg-white text-[#1c3330]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400">DMs / hour (this account)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={String(form.dm_per_hour ?? 20)}
              onChange={(e) =>
                updateField(
                  "dm_per_hour",
                  Math.max(0, Number(e.target.value) || 0),
                )
              }
              className="border-[#d5e3de] bg-white text-[#1c3330]"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-base font-medium text-[#1c3330]">
              GitHub for this account
            </h3>
            <p className="text-sm text-zinc-500">
              Per-account assessment repos + PAT (STEP7 invites). Different
              accounts can use different repos.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="GitHub fullstack repository"
              placeholder="https://github.com/user/Fullstack-assessment"
              value={form.github_fs_repo ?? ""}
              onChange={(v) => updateField("github_fs_repo", v)}
            />
            <Field
              label="GitHub blockchain repository"
              placeholder="https://github.com/user/Blockchain-assessment"
              value={form.github_bc_repo ?? ""}
              onChange={(v) => updateField("github_bc_repo", v)}
            />
          </div>
          <Field
            label="GitHub token (PAT) (repo scope — leave blank to keep / use global)"
            placeholder="ghp_..."
            value={form.github_pat ?? ""}
            onChange={(v) => updateField("github_pat", v)}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-medium text-[#1c3330]">
            Proxy (leave User/Pass empty if your proxy has no login)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Proxy IP"
              placeholder="107.173.137.165"
              value={form.proxy_ip ?? ""}
              onChange={(v) => updateField("proxy_ip", v)}
            />
            <Field
              label="Proxy port"
              placeholder="6490"
              value={form.proxy_port ?? ""}
              onChange={(v) => updateField("proxy_port", v)}
            />
            <Field
              label="Proxy user"
              placeholder="optional"
              value={form.proxy_user ?? ""}
              onChange={(v) => updateField("proxy_user", v)}
            />
            <Field
              label="Proxy pass"
              placeholder="optional"
              type="password"
              value={form.proxy_pass ?? ""}
              onChange={(v) => updateField("proxy_pass", v)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={saving}
            className="bg-[#2f81f7] text-white hover:bg-[#388bfd]"
          >
            {editingId ? "Save changes" : "Add account"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
          >
            Refresh
          </Button>
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="text-zinc-400"
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[#1c3330]">Bots</h2>
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="accounts-page-size">
              Bots per page
            </label>
            <select
              id="accounts-page-size"
              data-testid="accounts-page-size"
              className="h-8 rounded-lg border border-[#d5e3de] bg-white px-2 text-sm text-[#1c3330] outline-none focus-visible:border-[#0f766e]"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              document.getElementById("account-form")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className="cursor-pointer text-sm text-[#0f766e]"
          >
            + Add bot
          </button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[#6d847f]">Loading bots…</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d5e3de] px-4 py-8 text-center text-sm text-[#6d847f]">
            No bots yet. Add one above.
          </p>
        ) : (
          <BotList
            accounts={accounts}
            page={page}
            pageSize={pageSize}
            stats={stats}
            onPage={setPage}
            onEdit={startEdit}
            onSecrets={openSecrets}
            onMd={setMdOpen}
            onRun={(id, action) => void runAction(id, action)}
            onDelete={(id) => void removeAccount(id)}
          />
        )}
      </div>

      {mdOpen ? (
        <Modal title="MD create & Upload" onClose={() => setMdOpen(null)}>
          <p className="mb-3 text-xs text-[#6d847f]">
            Shared Collective brain for {mdOpen.username}. First msg is what
            Run sends. Upload a markdown file or edit it here.
          </p>
          <BrainPanel />
        </Modal>
      ) : null}

      {secrets ? (
        <Modal
          title={`Secrets · ${secrets.username}`}
          onClose={() => setSecrets(null)}
        >
          <form onSubmit={saveSecrets} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8aa099]">
              Platform login
            </p>
            <Field
              label="Login email"
              value={secretForm.email ?? ""}
              onChange={(v) => setSecretForm((s) => ({ ...s, email: v }))}
            />
            <Field
              label="Password"
              type="password"
              value={secretForm.password ?? ""}
              onChange={(v) => setSecretForm((s) => ({ ...s, password: v }))}
            />
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8aa099]">
              GitHub
            </p>
            <Field
              label="GitHub token"
              value={secretForm.github_pat ?? ""}
              onChange={(v) => setSecretForm((s) => ({ ...s, github_pat: v }))}
            />
            <Field
              label="Fullstack repo"
              value={secretForm.github_fs_repo ?? ""}
              onChange={(v) =>
                setSecretForm((s) => ({ ...s, github_fs_repo: v }))
              }
            />
            <Field
              label="Blockchain repo"
              value={secretForm.github_bc_repo ?? ""}
              onChange={(v) =>
                setSecretForm((s) => ({ ...s, github_bc_repo: v }))
              }
            />
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8aa099]">
              Proxy
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Proxy IP"
                value={secretForm.proxy_ip ?? ""}
                onChange={(v) => setSecretForm((s) => ({ ...s, proxy_ip: v }))}
              />
              <Field
                label="Proxy port"
                value={secretForm.proxy_port ?? ""}
                onChange={(v) =>
                  setSecretForm((s) => ({ ...s, proxy_port: v }))
                }
              />
              <Field
                label="Proxy user"
                value={secretForm.proxy_user ?? ""}
                onChange={(v) =>
                  setSecretForm((s) => ({ ...s, proxy_user: v }))
                }
              />
              <Field
                label="Proxy pass"
                type="password"
                value={secretForm.proxy_pass ?? ""}
                onChange={(v) =>
                  setSecretForm((s) => ({ ...s, proxy_pass: v }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSecrets(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#0f766e] text-white hover:bg-[#0d655e]"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function BotList({
  accounts,
  page,
  pageSize,
  stats,
  onPage,
  onEdit,
  onSecrets,
  onMd,
  onRun,
  onDelete,
}: {
  accounts: CollectiveAccount[];
  page: number;
  pageSize: number;
  stats: Record<
    number,
    { contact: number; discussing: number; success: number; failed: number }
  >;
  onPage: (page: number) => void;
  onEdit: (account: CollectiveAccount) => void;
  onSecrets: (account: CollectiveAccount) => void;
  onMd: (account: CollectiveAccount) => void;
  onRun: (id: number, action: "open" | "start" | "stop") => void;
  onDelete: (id: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(accounts.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const rows = accounts.slice(start, start + pageSize);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-[#eef4f2] rounded-2xl border border-[#e3eeea]">
        {rows.map((account) => {
          const row = stats[account.id] ?? {
            contact: 0,
            discussing: 0,
            success: 0,
            failed: 0,
          };
          const running = account.start_status === "yes";
          return (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-3 px-3 py-3"
              data-testid={`bot-row-${account.id}`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  running ? "bg-emerald-500" : "bg-[#c5d5d0]"
                }`}
              />
              <div className="min-w-[140px] flex-1">
                <div className="text-sm font-medium text-[#1c3330]">
                  {account.username || account.owner_name}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  <span className="text-[#5d736e]">contact {row.contact}</span>
                  <span className="text-[#0f766e]">
                    discussing {row.discussing}
                  </span>
                  <span className="text-emerald-700">success {row.success}</span>
                  <span className="text-red-600">failed {row.failed}</span>
                  <span className="text-[#8aa099]">
                    sent {account.today_count}/{account.dm_per_day ?? "—"}
                  </span>
                </div>
                {account.error_message ? (
                  <p className="mt-1 line-clamp-1 text-[11px] text-red-600">
                    {account.error_message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <RowBtn onClick={() => onMd(account)}>MD create & Upload</RowBtn>
                <RowBtn onClick={() => onSecrets(account)}>Secrets</RowBtn>
                <RowBtn onClick={() => onRun(account.id, "open")}>Open</RowBtn>
                {running ? (
                  <RowBtn
                    tone="stop"
                    onClick={() => onRun(account.id, "stop")}
                  >
                    Stop
                  </RowBtn>
                ) : (
                  <RowBtn tone="run" onClick={() => onRun(account.id, "start")}>
                    Run
                  </RowBtn>
                )}
                <RowBtn onClick={() => onEdit(account)}>Edit</RowBtn>
                <RowBtn onClick={() => onDelete(account.id)}>Delete</RowBtn>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#5d736e]">
        <p data-testid="accounts-page-status">
          Showing {start + 1}–{Math.min(start + pageSize, accounts.length)} of{" "}
          {accounts.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="accounts-page-prev"
            disabled={safePage <= 1}
            onClick={() => onPage(safePage - 1)}
            className="border-[#d5e3de] bg-white text-[#243936] hover:bg-[#f4f8f6]"
          >
            Previous
          </Button>
          <span className="text-xs text-[#6d847f]">
            Page {safePage} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            data-testid="accounts-page-next"
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-zinc-400">{label}</Label>
      <Input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border-[#d5e3de] bg-white text-[#1c3330] placeholder:text-[#8aa099]"
      />
    </div>
  );
}

function RowBtn({
  children,
  onClick,
  tone = "ghost",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "ghost" | "run" | "stop";
}) {
  const tones = {
    ghost:
      "border border-[#d5e3de] bg-white text-[#3d524e] hover:bg-[#f4f8f6]",
    run: "border border-transparent bg-[#0f766e] text-white hover:bg-[#0d655e]",
    stop: "border border-transparent bg-[#e11d48] text-white hover:bg-[#be123c]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1c3330]/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#1c3330]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-sm text-[#6d847f]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
