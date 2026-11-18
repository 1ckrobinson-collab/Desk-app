// Number and time formatting for the STEP 10 app. Never invents a number:
// null, undefined or non-finite -> "—". Exported for node tests.
(function (root) {
  "use strict";

  const DASH = "—";
  const TZ = "America/New_York";

  function num(x) {
    if (x == null || x === "") return null;
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function money(x, opts) {
    const n = num(x);
    if (n === null) return DASH;
    const digits = opts && opts.digits != null ? opts.digits : 2;
    const sign = opts && opts.sign;
    const abs = Math.abs(n).toFixed(digits);
    const core = "$" + abs;
    if (sign || (opts && opts.signed)) {
      if (n > 0) return "+" + core;
      if (n < 0) return "-" + core;
    }
    if (n < 0) return "-" + core;
    return core;
  }

  function pct(x, opts) {
    const n = num(x);
    if (n === null) return DASH;
    const digits = opts && opts.digits != null ? opts.digits : 2;
    const body = Math.abs(n).toFixed(digits) + "%";
    const withSign = !opts || opts.sign !== false;
    if (withSign) {
      if (n > 0) return "+" + body;
      if (n < 0) return "-" + body;
    }
    if (!withSign && n < 0) return "-" + body;
    return body;
  }

  function multiplier(x) {
    const n = num(x);
    if (n === null) return DASH;
    const digits = n >= 10 ? 2 : 2;
    return n.toFixed(digits) + "\u00d7";
  }

  function compactUsd(x) {
    const n = num(x);
    if (n === null) return DASH;
    const sign = n < 0 ? "-" : "";
    const a = Math.abs(n);
    if (a < 1000) return sign + "$" + a.toFixed(2);
    if (a < 1e6) {
      const k = a / 1e3;
      const s = k >= 100 ? k.toFixed(0) : k.toFixed(1);
      return sign + "$" + s.replace(/\.0$/, "") + "K";
    }
    const m = a / 1e6;
    const s = m >= 100 ? m.toFixed(0) : m.toFixed(2);
    return sign + "$" + s.replace(/\.00$/, "") + "M";
  }

  function holders(x) {
    const n = num(x);
    if (n === null) return DASH;
    return Math.round(n).toLocaleString("en-US");
  }

  function ageH(x) {
    const n = num(x);
    if (n === null) return DASH;
    if (n < 1) {
      const min = Math.round(n * 60);
      return min + "m old";
    }
    const s = Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
    return s + "h old";
  }

  function price(x) {
    const n = num(x);
    if (n === null) return DASH;
    const d = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
    let s = n.toFixed(d);
    if (d > 2) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return "$" + s;
  }

  function clock(ts, opts) {
    const n = num(ts);
    if (n === null) return DASH;
    const ms = n > 1e12 ? n : n * 1000;
    try {
      return new Date(ms).toLocaleTimeString("en-US", {
        timeZone: TZ,
        hour: "numeric",
        minute: "2-digit",
        ...(opts && opts.seconds ? { second: "2-digit" } : {}),
      });
    } catch (e) {
      return DASH;
    }
  }

  function when(ts) {
    const n = num(ts);
    if (n === null) return DASH;
    const ms = n > 1e12 ? n : n * 1000;
    const t = new Date(ms);
    const now = Date.now();
    const sameDay = new Date(now).toLocaleDateString("en-US", { timeZone: TZ }) ===
      t.toLocaleDateString("en-US", { timeZone: TZ });
    return sameDay ? clock(n) : t.toLocaleString("en-US", {
      timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  // FOMO links: pass through the exact string from the data. Never build or alter one.
  function fomoHref(link) {
    if (typeof link !== "string") return null;
    const s = link.trim();
    return s ? s : null;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeText(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fomoAnchor(link, label) {
    const href = fomoHref(link);
    if (!href) return "";
    const text = label == null ? "Open on FOMO" : label;
    return '<a class="btn btn-fomo" href="' + escapeAttr(href) + '" rel="noopener noreferrer" target="_blank">' +
      escapeText(text) + "</a>";
  }

  // Later marks move up a row when their x would overlap an earlier mark.
  function stackMarks(marks, xOf, minGap) {
    const gap = minGap == null ? 64 : minGap;
    const placed = [];
    return (marks || []).map((m) => {
      const x = xOf(m);
      let row = 0;
      while (placed.some((p) => p.row === row && Math.abs(p.x - x) < gap)) row += 1;
      placed.push({ x, row });
      return { mark: m, x, row };
    });
  }

  const Format = {
    DASH, TZ, num, money, pct, multiplier, compactUsd, holders, ageH, price,
    clock, when, fomoHref, fomoAnchor, escapeAttr, escapeText, stackMarks,
  };
  root.Format = Format;
  if (typeof module !== "undefined") module.exports = Format;
})(typeof window !== "undefined" ? window : globalThis);
