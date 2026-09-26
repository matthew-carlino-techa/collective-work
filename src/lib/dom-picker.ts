import type { Page } from "playwright";
import { ensureBotControlOnPage } from "@/lib/bot-control-inject";

export type PickResult = {
  ok: boolean;
  cancelled?: boolean;
  selector?: string;
  sample?: string;
  error?: string;
};

/**
 * Start DOM pick via Collective Bot Control (injected into every account page).
 */
export async function pickDomSelector(
  page: Page,
  fieldLabel: string,
): Promise<PickResult> {
  await ensureBotControlOnPage(page);

  await page.evaluate(() => {
    (window as unknown as { __botPickResult?: unknown }).__botPickResult = null;
  });

  const started = await page.evaluate((label) => {
    const bot = (
      window as unknown as {
        __collectiveBot?: { startPick: (l: string) => void };
      }
    ).__collectiveBot;
    if (bot?.startPick) {
      bot.startPick(label);
      return "extension";
    }
    return null;
  }, fieldLabel);

  if (!started) {
    await injectPicker(page, fieldLabel);
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __botPickResult: null | {
          cancelled?: boolean;
          selector?: string;
          sample?: string;
        };
      };
      return w.__botPickResult;
    });
    if (result) {
      if (result.cancelled) return { ok: false, cancelled: true };
      if (result.selector) {
        return {
          ok: true,
          selector: result.selector,
          sample: result.sample,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  await page.evaluate(() => {
    (
      window as unknown as {
        __collectiveBot?: { stopPick?: () => void };
        __botStopPick?: () => void;
      }
    ).__collectiveBot?.stopPick?.();
    (
      window as unknown as { __botStopPick?: () => void }
    ).__botStopPick?.();
  });
  return { ok: false, error: "Pick timed out (2 min)" };
}

async function injectPicker(page: Page, fieldLabel: string) {
  await page.evaluate((label) => {
    const w = window as unknown as {
      __botPickResult: null | {
        cancelled?: boolean;
        selector?: string;
        sample?: string;
      };
      __botStopPick?: () => void;
    };

    w.__botStopPick?.();

    const banner = document.createElement("div");
    banner.textContent = `Pick: ${label} — click element · ↑/↓ adjust · Esc cancel`;
    Object.assign(banner.style, {
      position: "fixed",
      top: "8px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "#1f6feb",
      color: "#fff",
      padding: "8px 14px",
      borderRadius: "8px",
      font: "13px/1.3 system-ui,sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,.35)",
      pointerEvents: "none",
    });

    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed",
      zIndex: "2147483646",
      border: "2px solid #58a6ff",
      background: "rgba(56,139,253,.15)",
      pointerEvents: "none",
      display: "none",
    });

    const tag = document.createElement("div");
    Object.assign(tag.style, {
      position: "fixed",
      zIndex: "2147483647",
      background: "#0d1117",
      color: "#7ee787",
      padding: "2px 6px",
      borderRadius: "4px",
      font: "11px/1.2 ui-monospace,monospace",
      maxWidth: "70vw",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      display: "none",
    });

    document.documentElement.append(banner, box, tag);

    let chosen: Element | null = null;
    const stack: Element[] = [];

    function cssEscape(s: string) {
      const esc =
        window.CSS && typeof window.CSS.escape === "function"
          ? window.CSS.escape.bind(window.CSS)
          : null;
      if (esc) return esc(s);
      return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    function buildSelector(el: Element): string {
      if (!(el instanceof Element)) return "";
      const name = el.getAttribute("name");
      if (name) {
        return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
      }
      const dd = el.getAttribute("data-dd-id");
      if (dd) return `[data-dd-id="${cssEscape(dd)}"]`;
      const dt = el.getAttribute("data-type");
      if (dt) return `[data-type="${cssEscape(dt)}"]`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${cssEscape(testId)}"]`;
      const id = el.id;
      if (id && !id.includes("«") && !/:/.test(id)) {
        return `#${cssEscape(id)}`;
      }
      const aria = el.getAttribute("aria-label");
      if (aria) {
        return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`;
      }
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) {
        const short = placeholder.slice(0, 40);
        return `${el.tagName.toLowerCase()}[placeholder*="${cssEscape(short)}"]`;
      }
      const parts: string[] = [];
      let cur: Element | null = el;
      for (let i = 0; cur && i < 5; i++) {
        let part = cur.tagName.toLowerCase();
        const role = cur.getAttribute("role");
        if (role) part += `[role="${cssEscape(role)}"]`;
        else {
          const cls = Array.from(cur.classList)
            .filter((c) => c && !c.startsWith("css-") && c.length < 40)
            .slice(0, 2);
          if (cls.length) part += "." + cls.map(cssEscape).join(".");
        }
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    }

    function paint() {
      if (!chosen || !(chosen instanceof Element)) return;
      const r = chosen.getBoundingClientRect();
      Object.assign(box.style, {
        display: "block",
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      const sel = buildSelector(chosen);
      tag.textContent = sel;
      Object.assign(tag.style, {
        display: "block",
        left: `${Math.max(4, r.left)}px`,
        top: `${Math.max(40, r.top - 22)}px`,
      });
    }

    function onMove(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t === banner || t === box || t === tag) return;
      chosen = t;
      stack.length = 0;
      paint();
    }

    function block(e: Event) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    function cleanup() {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
      for (const ev of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
        document.removeEventListener(ev, block, true);
      }
      banner.remove();
      box.remove();
      tag.remove();
      w.__botStopPick = undefined;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        w.__botPickResult = { cancelled: true };
        cleanup();
      }
      if (
        e.key === "ArrowUp" &&
        chosen?.parentElement &&
        chosen.parentElement !== document.documentElement
      ) {
        e.preventDefault();
        stack.push(chosen);
        chosen = chosen.parentElement;
        paint();
      }
      if (e.key === "ArrowDown" && stack.length) {
        e.preventDefault();
        chosen = stack.pop() || chosen;
        paint();
      }
    }

    function onClick(e: MouseEvent) {
      block(e);
      if (!chosen) return;
      const selector = buildSelector(chosen);
      const sample = (chosen.textContent || chosen.getAttribute("placeholder") || "")
        .trim()
        .slice(0, 80);
      w.__botPickResult = { selector, sample };
      cleanup();
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("keydown", onKey, true);
    for (const ev of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      document.addEventListener(ev, block, true);
    }
    document.addEventListener("click", onClick, true);
    w.__botStopPick = cleanup;
  }, fieldLabel);
}
