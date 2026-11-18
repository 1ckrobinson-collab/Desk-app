// Canvas charts (STEP 10). devicePixelRatio aware. No invented points.
(function (root) {
  "use strict";
  const GREEN = "#00d35a";
  const ORANGE = "#ff9f0a";
  const COLORS = { blue: "#0a84ff", green: "#00d35a", red: "#ff453a" };
  const F = () => root.Format;

  function reduced() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function setup(canvas) {
    const dpr = Math.max(1, Math.min(3, (root.devicePixelRatio || 1)));
    const cssW = canvas.clientWidth || canvas.width || 1;
    const cssH = canvas.clientHeight || canvas.height || 1;
    if (canvas._cssW === cssW && canvas._cssH === cssH && canvas._dpr === dpr && canvas.width) {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w: cssW, h: cssH, dpr };
    }
    canvas._cssW = cssW; canvas._cssH = cssH; canvas._dpr = dpr;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cssW, h: cssH, dpr };
  }

  function lineChart(canvas, data, opts) {
    const { ctx, w, h } = setup(canvas);
    ctx.clearRect(0, 0, w, h);
    const points = (data && data.points) || [];
    const marks = (data && data.marks) || [];
    const padL = 8, padR = 8, padT = 36, padB = 18;
    const iw = Math.max(1, w - padL - padR);
    const ih = Math.max(1, h - padT - padB);

    if (!points.length) {
      return;
    }

    const vals = points.map((p) => p.value).filter((v) => F().num(v) != null);
    if (data.start != null && F().num(data.start) != null) vals.push(data.start);
    if (!vals.length) return;
    let lo = Math.min.apply(null, vals);
    let hi = Math.max.apply(null, vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const mid = (hi - lo) * 0.12;
    lo -= mid; hi += mid;

    const t0 = points[0].ts;
    const t1 = points[points.length - 1].ts;
    const span = t1 > t0 ? t1 - t0 : 1;
    const slide = (opts && opts.slide) || 0; // 0..1, last point slides in
    const useSlide = slide > 0 && points.length > 1 && !reduced();

    const xOfT = (ts) => padL + ((ts - t0) / span) * iw;
    const yOfV = (v) => padT + (1 - (v - lo) / (hi - lo)) * ih;

    const vis = points.slice();
    if (useSlide && slide < 1) {
      const last = vis[vis.length - 1];
      const prev = vis[vis.length - 2];
      const ts = prev.ts + (last.ts - prev.ts) * slide;
      const value = prev.value + (last.value - prev.value) * slide;
      vis[vis.length - 1] = { ts, value };
    }

    const path = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = xOfT(p.ts), y = yOfV(p.value);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    };

    // fill under the line (allowed: "gradient under the line")
    path(vis);
    const last = vis[vis.length - 1];
    ctx.lineTo(xOfT(last.ts), padT + ih);
    ctx.lineTo(xOfT(vis[0].ts), padT + ih);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, padT + ih);
    g.addColorStop(0, "rgba(0,211,90,0.28)");
    g.addColorStop(1, "rgba(0,211,90,0)");
    ctx.fillStyle = g;
    ctx.fill();

    // dashed start line
    if (F().num(data.start) != null) {
      const y = yOfV(data.start);
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = "rgba(235,235,245,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + iw, y);
      ctx.stroke();
      ctx.restore();
    }

    path(vis);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // end dot
    ctx.beginPath();
    ctx.arc(xOfT(last.ts), yOfV(last.value), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = GREEN;
    ctx.fill();

    const stacked = F().stackMarks(marks, (m) => xOfT(m.ts), 72);
    stacked.forEach((s) => {
      const m = s.mark;
      const x = Math.max(padL, Math.min(padL + iw, s.x));
      const y = yOfV(nearestValue(points, m.ts));
      const color = COLORS[m.color] || COLORS.green;
      const rowY = y - 14 - s.row * 16;
      ctx.font = "600 11px ui-sans-serif, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = color;
      const label = m.label || "";
      ctx.fillText(label, x, rowY);
    });
  }

  function nearestValue(points, ts) {
    let best = points[0], d = Math.abs(points[0].ts - ts);
    for (let i = 1; i < points.length; i++) {
      const n = Math.abs(points[i].ts - ts);
      if (n < d) { d = n; best = points[i]; }
    }
    return best.value;
  }

  function candles(canvas, data) {
    const { ctx, w, h } = setup(canvas);
    ctx.clearRect(0, 0, w, h);
    const rows = (data && data.candles) || [];
    if (!rows.length) return;
    const padL = 8, padR = 8, padT = 10, padB = 10;
    const iw = Math.max(1, w - padL - padR);
    const ih = Math.max(1, h - padT - padB);
    const vals = [];
    rows.forEach((c) => { vals.push(c.h, c.l, c.o, c.c); });
    if (F().num(data.exitLine) != null) vals.push(data.exitLine);
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (lo === hi) { lo -= lo * 0.01 || 0.01; hi += hi * 0.01 || 0.01; }
    const mid = (hi - lo) * 0.08;
    lo -= mid; hi += mid;
    const yOf = (v) => padT + (1 - (v - lo) / (hi - lo)) * ih;
    const n = rows.length;
    const slot = iw / n;
    const bodyW = Math.max(1, Math.min(7, slot * 0.6));

    if (F().num(data.exitLine) != null) {
      const y = yOf(data.exitLine);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + iw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ORANGE;
      ctx.font = "600 11px ui-sans-serif, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("stop " + F().price(data.exitLine), padL + iw, y - 2);
      ctx.restore();
    }

    rows.forEach((c, i) => {
      const x = padL + slot * i + slot / 2;
      const up = c.c >= c.o;
      const color = up ? GREEN : "#ff453a";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();
      const y1 = yOf(c.o), y2 = yOf(c.c);
      const top = Math.min(y1, y2), bh = Math.max(1, Math.abs(y2 - y1));
      ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
    });
  }

  const Charts = { lineChart, candles, setup, reduced };
  root.Charts = Charts;
  if (typeof module !== "undefined") module.exports = Charts;
})(typeof window !== "undefined" ? window : globalThis);
