(() => {
  // Always strip the old status bar, even if this script already booted
  document.getElementById("collective-bot-bar")?.remove();
  if (window.__collectiveBot) return;

  const w = window;

  function cssEscape(s) {
    const esc =
      window.CSS && typeof window.CSS.escape === "function"
        ? window.CSS.escape.bind(window.CSS)
        : null;
    if (esc) return esc(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildSelector(el) {
    if (!(el instanceof Element)) return "";
    const name = el.getAttribute("name");
    if (name) return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
    const dd = el.getAttribute("data-dd-id");
    if (dd) return `[data-dd-id="${cssEscape(dd)}"]`;
    const dt = el.getAttribute("data-type");
    if (dt) return `[data-type="${cssEscape(dt)}"]`;
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${cssEscape(testId)}"]`;
    const id = el.id;
    if (id && !id.includes("«") && !/:/.test(id)) return `#${cssEscape(id)}`;
    const aria = el.getAttribute("aria-label");
    if (aria) {
      return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`;
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      const short = placeholder.slice(0, 40);
      return `${el.tagName.toLowerCase()}[placeholder*="${cssEscape(short)}"]`;
    }
    const parts = [];
    let cur = el;
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

  let stopPickFn = null;

  function startPick(label) {
    stopPickFn?.();
    w.__botPickResult = null;

    const banner = document.createElement("div");
    banner.id = "collective-bot-pick-banner";
    banner.textContent = `Collective Bot · Pick: ${label || "element"} — click · ↑/↓ · Esc`;
    Object.assign(banner.style, {
      position: "fixed",
      top: "48px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "#1f6feb",
      color: "#fff",
      padding: "10px 16px",
      borderRadius: "8px",
      font: "14px/1.3 system-ui,sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,.45)",
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

    let chosen = null;
    const stack = [];

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
      tag.textContent = buildSelector(chosen);
      Object.assign(tag.style, {
        display: "block",
        left: `${Math.max(4, r.left)}px`,
        top: `${Math.max(40, r.top - 22)}px`,
      });
    }

    function onMove(e) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t === banner || t === box || t === tag) return;
      if (t.closest?.("#collective-bot-bar")) return;
      chosen = t;
      stack.length = 0;
      paint();
    }

    function block(e) {
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
      stopPickFn = null;
    }

    function onKey(e) {
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

    function onClick(e) {
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
    stopPickFn = cleanup;
  }

  function removeStatusBar() {
    document.getElementById("collective-bot-bar")?.remove();
  }

  w.__collectiveBot = {
    version: "1.0.2",
    startPick,
    stopPick: () => stopPickFn?.(),
  };

  const boot = () => removeStatusBar();
  if (document.documentElement) boot();
  else document.addEventListener("DOMContentLoaded", boot);
  // Strip the old status bar if a previous inject left it on the page
  setInterval(removeStatusBar, 2000);

  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type === "startPick") {
          startPick(msg.label || "element");
          sendResponse({ ok: true });
          return true;
        }
        if (msg?.type === "status") {
          sendResponse({ ok: true, version: "1.0.2" });
          return true;
        }
        return false;
      });
    }
  } catch {
    // page inject has no chrome.runtime — fine
  }
})();
