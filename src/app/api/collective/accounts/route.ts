import { NextResponse } from "next/server";
import {
  closeAccountSession,
  openAccountSession,
} from "@/lib/browser-sessions";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  patchAccountStatus,
  setAccountAction,
  updateAccount,
} from "@/lib/db";
import {
  runContactBatch,
  startOutreachLoop,
  stopOutreachLoop,
} from "@/lib/outreach";
import type { AccountInput } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ accounts: listAccounts() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AccountInput & {
      action?: string;
      id?: number;
    };

    // Bulk: Open / Start / Stop every account
    if (
      body.action === "open_all" ||
      body.action === "start_all" ||
      body.action === "stop_all"
    ) {
      const accounts = listAccounts();
      const results: Array<{
        id: number;
        ok: boolean;
        error?: string;
      }> = [];

      for (const account of accounts) {
        try {
          if (body.action === "open_all") {
            if (!account.proxy_ip?.trim() || !account.proxy_port?.trim()) {
              results.push({
                id: account.id,
                ok: false,
                error: "Missing proxy",
              });
              continue;
            }
            setAccountAction(account.id, "open");
            await openAccountSession(getAccount(account.id)!);
            results.push({ id: account.id, ok: true });
          } else if (body.action === "start_all") {
            await startOutreachLoop(account.id);
            results.push({ id: account.id, ok: true });
          } else {
            stopOutreachLoop(account.id);
            await closeAccountSession(account.id, false);
            setAccountAction(account.id, "stop");
            results.push({ id: account.id, ok: true });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Action failed";
          if (body.action === "open_all") {
            patchAccountStatus(account.id, {
              online_status: "no",
              error_message: message,
            });
          }
          if (body.action === "start_all") {
            patchAccountStatus(account.id, {
              start_status: "no",
              error_message: message,
            });
          }
          results.push({ id: account.id, ok: false, error: message });
        }
      }

      const okCount = results.filter((r) => r.ok).length;
      return NextResponse.json({
        accounts: listAccounts(),
        results,
        message: `${body.action}: ${okCount}/${results.length} succeeded`,
      });
    }

    if (body.action && body.id) {
      const existing = getAccount(body.id);
      if (!existing) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }

      if (body.action === "open") {
        if (!existing.proxy_ip?.trim() || !existing.proxy_port?.trim()) {
          return NextResponse.json(
            {
              error:
                "Set proxy IP and port on this account before clicking Open",
            },
            { status: 400 },
          );
        }

        const account = setAccountAction(body.id, "open");
        try {
          await openAccountSession(account!);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to open browser";
          const failed = patchAccountStatus(body.id, {
            online_status: "no",
            error_message: message,
          });
          return NextResponse.json(
            { error: message, account: failed },
            { status: 500 },
          );
        }
        return NextResponse.json({ account: getAccount(body.id) });
      }

      if (body.action === "stop") {
        stopOutreachLoop(body.id);
        await closeAccountSession(body.id, false);
        const account = setAccountAction(body.id, "stop");
        return NextResponse.json({ account });
      }

      if (body.action === "contact") {
        try {
          const result = await runContactBatch(body.id);
          return NextResponse.json({
            account: getAccount(body.id),
            result,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Contact failed";
          patchAccountStatus(body.id, {
            contact_status: "no",
            error_message: message,
          });
          return NextResponse.json(
            { error: message, account: getAccount(body.id) },
            { status: 500 },
          );
        }
      }

      if (body.action === "start") {
        try {
          await startOutreachLoop(body.id);
          return NextResponse.json({ account: getAccount(body.id) });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Start failed";
          patchAccountStatus(body.id, {
            start_status: "no",
            error_message: message,
          });
          return NextResponse.json(
            { error: message, account: getAccount(body.id) },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (!body.owner_name?.trim() || !body.username?.trim()) {
      return NextResponse.json(
        { error: "Owner name and Collective username are required" },
        { status: 400 },
      );
    }

    if (body.id) {
      const account = updateAccount(body.id, body);
      if (!account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      return NextResponse.json({ account });
    }

    const account = createAccount(body);
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Collective username already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  if (!getAccount(id)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  stopOutreachLoop(id);
  await closeAccountSession(id, false);
  deleteAccount(id);
  return NextResponse.json({ ok: true });
}
