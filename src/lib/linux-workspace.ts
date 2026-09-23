/**
 * Keep Collective bot Chrome windows on one Linux X11 workplace
 * so they do not jump onto the desktop you are working on.
 *
 * Home workspace = first workplace (index 0), or BOT_HOME_WORKSPACE env.
 * Uses `xprop` only (no wmctrl/xdotool required).
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let homeWorkspace: number | null = null;

function displayEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":20.0",
  };
}

async function xprop(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("xprop", args, {
      env: displayEnv(),
      timeout: 4000,
    });
    return stdout || "";
  } catch {
    return "";
  }
}

/** Capture / return the home workplace (first desktop = 0). */
export function getHomeWorkspace(): number {
  if (homeWorkspace != null) return homeWorkspace;
  const fromEnv = Number(process.env.BOT_HOME_WORKSPACE);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    homeWorkspace = Math.floor(fromEnv);
    return homeWorkspace;
  }
  homeWorkspace = 0; // first Linux workplace
  return homeWorkspace;
}

/**
 * Pin every CollectiveBot Chrome window to the home workplace.
 * Safe to call often; no-ops if xprop/DISPLAY unavailable.
 */
export async function pinBotWindowsToHomeWorkspace(
  nameHint?: string,
): Promise<void> {
  const desktop = getHomeWorkspace();
  const listOut = await xprop("-root", "_NET_CLIENT_LIST");
  // _NET_CLIENT_LIST(WINDOW): window id # 0x1a00007, 0x1a0000c, ...
  const ids = [
    ...listOut.matchAll(/0x[0-9a-fA-F]+/g),
  ].map((m) => m[0]);
  if (!ids.length) return;

  const needle = (nameHint || "CollectiveBot").toLowerCase();

  for (const id of ids) {
    const nameOut = await xprop("-id", id, "WM_NAME", "WM_CLASS");
    const blob = nameOut.toLowerCase();
    if (!blob.includes(needle) && !blob.includes("collectivebot")) continue;

    // Move to home workplace (CARDINAL 32)
    await execFileAsync(
      "xprop",
      ["-id", id, "-f", "_NET_WM_DESKTOP", "32c", "-set", "_NET_WM_DESKTOP", String(desktop)],
      { env: displayEnv(), timeout: 3000 },
    ).catch(() => undefined);

    // Ensure not sticky across all workplaces
    await execFileAsync(
      "xprop",
      [
        "-id",
        id,
        "-f",
        "_NET_WM_STATE",
        "32a",
        "-set",
        "_NET_WM_STATE",
        "",
      ],
      { env: displayEnv(), timeout: 3000 },
    ).catch(() => undefined);
  }
}
