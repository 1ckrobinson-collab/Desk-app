/* Desk app (STEP 10). Plain JS, no framework, no build step.
   Data: plan A = api.py (token from #t= -> localStorage, Bearer header);
         plan B = encrypted files via decrypt.js (#d= -> localStorage), polled.
   Every FOMO link shown is the exact `link` / `profileUrl` / `inviteUrl` string from the data.
   Never a made-up number: missing -> "—". */
(function () {
  "use strict";
  const F = window.Format, C = window.Charts, D = window.DeskData;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = F.escapeText, attr = F.escapeAttr, DASH = F.DASH;
  const TOK = "desk.t";
  const BOTS = ["scanner", "analyst", "brain", "executor", "risk"];
  const COLORS = { scanner: "#64d2ff", analyst: "#ffd60a", brain: "#bf5af2", executor: "#00d35a", risk: "#ff6b9a" };

  // ------------------------------------------------------------ token (plan A)
  function takeToken() {
    if (location.hash) {
      const p = new URLSearchParams(location.hash.slice(1));
      const t = p.get("t");
      if (t && t.length >= 32) {
        localStorage.setItem(TOK, t);
        p.delete("t");
        const rest = p.toString();
        history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : ""));
      }
    }
    return localStorage.getItem(TOK);
  }

  // ------------------------------------------------------------ data source
  const Src = {
    plan: null, token: null,
    init() {
      this.token = takeToken();
      const dp = D.dataPath();               // also strips #d=
      this.plan = this.token ? "A" : dp ? "B" : null;
    },
    async api(path, opts) {
      const r = await fetch(path, {
        ...(opts || {}),
        cache: "no-store",
        headers: { "Authorization": "Bearer " + this.token, "Content-Type": "application/json" },
      });
      let body = null;
      try { body = await r.json(); } catch (e) { body = null; }
      if (!r.ok) { const e = new Error((body && body.error) || ("HTTP " + r.status)); e.status = r.status; e.body = body; throw e; }
      return body;
    },
    state() { return this.plan === "A" ? this.api("/api/state") : D.state(); },
    async chart(range) {
      if (this.plan === "A") return this.api("/api/chart?range=" + encodeURIComponent(range));
      const all = await D.chart(); return all[range];
    },
    activity() { return this.plan === "A" ? this.api("/api/activity") : D.activity(); },
    coin(mint) { return this.plan === "A" ? this.api("/api/coin/" + encodeURIComponent(mint)) : D.coin(mint); },
    async audit(mint) {
      if (this.plan === "A") return this.api("/api/audit/" + encodeURIComponent(mint));
      const c = await D.coin(mint); return c.audit;
    },
    async decisions(name, state) {
      if (this.plan === "A") return (await this.api("/api/bots/" + name + "/decisions")).decisions;
      return (state && state.decisions && state.decisions[name]) || [];
    },
    account() { return this.plan === "A" ? this.api("/api/account") : Promise.resolve(null); },
    settings() { return this.plan === "A" ? this.api("/api/settings") : Promise.resolve(null); },
    _lastShot: null,
    async screenURL() {
      let url;
      if (this.plan === "A") {
        const r = await fetch("/api/screen.jpg", { cache: "no-store", headers: { "Authorization": "Bearer " + this.token } });
        if (!r.ok) throw new Error("screen " + r.status);
        url = URL.createObjectURL(await r.blob());
      } else {
        // Own object URL so the previous frame stays until the new <img> has loaded
        // (DeskData.screenURL revokes the previous URL immediately).
        const ctx = await D.derive(D.dataPath());
        const r = await fetch("d/" + ctx.folder + "/screen.jpg", { cache: "no-store" });
        if (!r.ok) throw new Error("screen " + r.status);
        const bytes = await D.open(ctx, await r.arrayBuffer(), "screen.jpg");
        url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      }
      const prev = this._lastShot;
      this._lastShot = url;
      if (prev) setTimeout(() => URL.revokeObjectURL(prev), 2000);
      return url;
    },
    canAct() { return this.plan === "A"; },
  };

  // ------------------------------------------------------------ app state
  const S = {
    tab: "home", sub: null, range: "LIVE",
    state: null, chart: {}, activity: null, account: null, settings: null,
    lastOk: null, failing: false, retryIn: 0, coin: null, audit: null, coinMint: null,
    frameTs: null, loaded: false,
  };
  const POLL_MS = () => (Src.plan === "A" ? 3000 : 15000);
  const SCREEN_MS = () => (Src.plan === "A" ? 1000 : 15000);

  // ------------------------------------------------------------ icons
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    bots: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  };

  // ------------------------------------------------------------ chrome
  function renderNav() {
    const h = S.account && S.account.fomoHandle;
    const ini = h ? esc(h.slice(0, 1).toUpperCase()) : "G";
    const flags = (S.state && S.state.flags) || {};
    const dot = flags.logged_out || flags.night_stop || (S.state && S.state.lastOrder && S.state.lastOrder.status === "unverified");
    $("#nav").innerHTML =
      '<button class="avatar" data-go="account" aria-label="Account"><span>' + ini + "</span></button>" +
      '<div class="title">Grok Bot <em>›</em></div>' +
      '<button class="icon-btn" data-act="search" aria-label="Search">' + I.search + "</button>" +
      '<button class="icon-btn" data-act="bell" aria-label="Alerts">' + I.bell + '<i class="dot' + (dot ? " on" : "") + '"></i></button>';
  }
  function renderTabs() {
    const t = [["home", "Home"], ["bots", "Bots"], ["activity", "Activity"], ["account", "Account"]];
    $("#tabs").innerHTML = t.map(([k, l]) =>
      '<button class="tab' + (S.tab === k && !S.sub ? " on" : "") + '" data-go="' + k + '">' + I[k] + "<span>" + l + "</span></button>").join("");
  }
  function show(id) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v.id === "view-" + id));
    $("#app").classList.toggle("screen-full", id === "screen");
    renderTabs();
  }
  function go(tab) { S.tab = tab; S.sub = null; show(tab); renderTab(tab); }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2200);
  }

  // ------------------------------------------------------------ odometer
  function odometer(el, text) {
    const old = el.dataset.v || "";
    el.dataset.v = text;
    if (C.reduced() || !old || old.length !== text.length) { el.textContent = text; return; }
    let html = "", k = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (/\d/.test(ch) && ch !== old[i]) {
        html += '<span style="display:inline-block;overflow:hidden;height:1em;vertical-align:top">' +
          '<span style="display:inline-block;animation:roll 600ms ease-out ' + (k++ * 30) + 'ms both">' + esc(old[i]) + "<br>" + esc(ch) + "</span></span>";
      } else html += esc(ch);
    }
    el.innerHTML = html;
  }
  const st = document.createElement("style");
  st.textContent = "@keyframes roll{from{transform:translateY(0)}to{transform:translateY(-1em)}}";
  document.head.appendChild(st);

  // ------------------------------------------------------------ helpers
  const sign = (n) => (F.num(n) == null ? "flat" : n > 0 ? "up" : n < 0 ? "down" : "flat");
  const coinName = (o) => (o && (o.symbol || o.name)) || (o && o.mint ? o.mint.slice(0, 6) : DASH);
  const chk = (v, l) => '<span class="chk ' + (v === true ? "ok" : v === false ? "no" : "") + '"><span class="mark">' +
    (v === true ? "✓" : v === false ? "✕" : "–") + "</span>" + l + "</span>";

  function skeletonHome() {
    return '<div class="sk sk-balance"></div><div class="sk sk-meta"></div><div class="sk sk-chart"></div>' +
      '<div class="sk sk-card"></div><div class="sk sk-bots"></div><div class="sk sk-row"></div><div class="sk sk-row"></div>';
  }
  function skeletonRows(n) { let s = ""; for (let i = 0; i < n; i++) s += '<div class="sk sk-row"></div>'; return s; }

  // ------------------------------------------------------------ HOME
  function renderHome() {
    const v = $("#view-home");
    if (!S.state) { v.innerHTML = skeletonHome(); return; }
    const s = S.state;
    if (!v.querySelector(".balance")) {
      v.innerHTML =
        '<div class="balance-row"><div class="balance num"></div><span class="badge-paper">PAPER</span></div>' +
        '<div class="home-meta"><span class="today"></span><span class="mult"></span></div>' +
        '<div class="chart-wrap"><canvas id="chart"></canvas></div>' +
        '<div class="ranges">' + ["LIVE", "1H", "4H", "1D", "1W", "ALL"].map((r) =>
          '<button data-range="' + r + '">' + r + "</button>").join("") + "</div>" +
        '<div class="live-card"><div class="live-frame" data-act="screen">' +
          '<img class="a" alt=""><img class="b" alt="">' +
          '<div class="live-tag"><i class="live-dot"></i><span></span></div><div class="live-holder"></div></div>' +
          '<div class="live-meta"><div class="live-order"></div><div class="checks"></div></div></div>' +
        '<div class="section-h"><span class="bots-h"></span></div><div class="carousel"></div>' +
        '<div class="section-h"><span>Activity · <button class="link" data-go="activity">See all</button></span></div>' +
        '<div class="home-rows"></div>';
    }
    odometer($(".balance", v), F.money(s.balance));
    $(".badge-paper", v).classList.toggle("on", !!s.paper);
    const td = $(".today", v);
    td.textContent = F.num(s.todayPct) == null ? DASH : F.pct(s.todayPct) + " today";
    td.className = "today " + sign(s.todayPct);
    const m = $(".mult", v);
    m.textContent = F.multiplier(s.multiplier);
    m.style.display = F.num(s.multiplier) == null ? "none" : "";
    v.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("on", b.dataset.range === S.range));
    drawChart();
    renderLive();
    $(".bots-h", v).textContent = "Bots · " + (F.num(s.running) == null ? DASH : s.running) + " running";
    $(".carousel", v).innerHTML = (s.bots || []).map(botMini).join("");
    const rows = S.activity && S.activity.rows;
    $(".home-rows", v).innerHTML = rows == null ? skeletonRows(3)
      : rows.length ? '<div class="rows">' + rows.slice(0, 5).map(actRow).join("") + "</div>"
      : '<div class="empty">Waiting for the first trade</div>';
  }

  function drawChart(slide) {
    const cv = $("#chart"); if (!cv) return;
    const d = S.chart[S.range];
    if (!d || !d.points || !d.points.length) {
      C.setup(cv).ctx.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    C.lineChart(cv, d, { slide });
  }

  function renderLive() {
    const v = $("#view-home"); const s = S.state; if (!s || !$(".live-card", v)) return;
    const ft = s.screen && s.screen.lastFrameTs;
    const fresh = F.num(ft) != null && Date.now() / 1000 - ft < 5;
    $(".live-dot", v).classList.toggle("hot", fresh);
    $(".live-tag span", v).textContent = fresh ? "Live · Bot's computer" : ft ? "Last frame " + F.clock(ft, { seconds: true }) : "No frame yet";
    const holder = (s.lane && s.lane.holder) || "Idle";
    const bot = BOTS.find((b) => holder.toLowerCase().startsWith(b));
    const hEl = $(".live-holder", v);
    hEl.textContent = holder;
    hEl.style.color = bot ? COLORS[bot] : "var(--secondary)";
    const o = s.lastOrder;
    $(".live-order", v).textContent = o ? o.text || DASH : "No order yet";
    $(".checks", v).innerHTML = o ? chk(o.checks.screen, "screen") + chk(o.checks.api, "api") + chk(o.checks.chain, "chain") : "";
  }

  let flip = false;
  async function refreshFrame() {
    const imgs = document.querySelectorAll("#view-home .live-frame img, #view-screen .screen-img");
    if (!imgs.length || !S.state || !(S.state.screen && S.state.screen.lastFrameTs)) return;
    try {
      const url = await Src.screenURL();
      const home = document.querySelectorAll("#view-home .live-frame img");
      if (home.length === 2) {
        const next = home[flip ? 0 : 1], cur = home[flip ? 1 : 0];
        next.onload = () => { next.classList.add("show"); cur.classList.remove("show"); };
        next.src = url; flip = !flip;
      }
      const full = $("#view-screen .screen-img"); if (full) full.src = url;
    } catch (e) { /* keep the last good frame */ }
  }

  function botMini(b) {
    const col = b.color || COLORS[b.name];
    let body = "";
    if (b.name === "scanner") {
      body = (b.feed || []).slice(0, 3).map((f) => f.verdict === "kill"
        ? '<div class="feed-row"><span class="killed">' + esc(coinName(f)) + '</span><span class="reason">' + esc(f.reason || DASH) + "</span></div>"
        : '<div class="feed-row"><span>' + esc(coinName(f)) + '</span><span class="pass">→ Analyst</span></div>').join("") ||
        '<div class="body">' + DASH + "</div>";
    } else if (b.name === "analyst") {
      const L = (b.last && b.last.layers) || [];
      body = '<div class="strips">' + L.map((l) => '<i class="' + esc(l.state) + '"></i>').join("") + "</div>" +
        '<div class="score-row">' + ring(b.score) + '<span class="body" style="margin:0">' + esc(b.social || "Social: off") + "</span></div>";
    } else if (b.name === "brain") {
      body = '<div class="body" style="color:var(--text);font-weight:600">' + esc(b.text || DASH) + '</div><div class="body">' + esc(b.rule || DASH) + "</div>";
    } else if (b.name === "executor") {
      body = '<div class="ex-bar">' + esc(b.status || DASH) + "</div>";
    } else if (b.name === "risk") {
      body = '<div class="pills">' + (b.pills || []).map((p) => '<span class="pill ' + esc(p.color) + '">' + esc(p.text) + "</span>").join("") + "</div>";
    }
    return '<div class="bot-mini"><div class="top"><i class="status-dot ' + (b.alive && !b.paused ? "on" : "off") + '"></i>' +
      '<span class="name" style="color:' + attr(col) + '">' + esc(b.label) + '</span><span class="title">' + esc(b.title || DASH) + "</span></div>" + body + "</div>";
  }

  function ring(score) {
    const n = F.num(score);
    const pctv = n == null ? 0 : Math.max(0, Math.min(100, n));
    const col = n == null ? "#3a3a3c" : n >= 70 ? "#00d35a" : "#ff453a";
    const r = 15, c = 2 * Math.PI * r, off = c * (1 - pctv / 100);
    return '<svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="' + r + '" fill="none" stroke="#2c2c2e" stroke-width="4"/>' +
      '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) +
      '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 18 18)"/>' +
      '<text x="18" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + (n == null ? "—" : Math.round(n)) + "</text></svg>";
  }

  function actRow(r) {
    const val = r.value || DASH;
    const cls = /^\+/.test(val) ? "up" : /^-/.test(val) ? "down" : "";
    return '<div class="row" data-open="' + attr(r.opens || "coin") + '" data-mint="' + attr(r.mint || "") + '">' +
      '<div class="t">' + esc(r.title || DASH) + '</div><div class="v ' + cls + '">' + esc(val) + "</div>" +
      '<div class="s">' + esc(r.subtitle || DASH) + "</div>" +
      (r.link ? '<div class="open">' + F.fomoAnchor(r.link) + "</div>" : "") + "</div>";
  }

  // ------------------------------------------------------------ BOTS tab
  async function renderBots() {
    const v = $("#view-bots");
    if (!S.state) { v.innerHTML = skeletonRows(5); return; }
    const cards = await Promise.all((S.state.bots || []).map(async (b) => {
      let ds = [];
      try { ds = await Src.decisions(b.name, S.state); } catch (e) { ds = []; }
      const locked = b.name === "risk" && b.pauseLocked;
      return '<div class="bot-full"><div class="head"><i class="status-dot ' + (b.alive && !b.paused ? "on" : "off") + '"></i>' +
        '<span class="name" style="color:' + attr(b.color || COLORS[b.name]) + '">' + esc(b.label) + "</span>" +
        '<span class="count">' + (F.num(b.count) == null ? DASH : b.count) + " today</span>" +
        '<button class="switch' + (b.paused ? "" : " on") + (locked ? " locked" : "") + '" data-pause="' + attr(b.name) +
        '" aria-label="Pause ' + attr(b.label) + '"' + (locked ? ' title="Risk can\'t be paused with a position open"' : "") + "><i></i></button></div>" +
        '<div class="note">' + esc(b.status || DASH) + (locked ? " · locked while a position is open" : "") + "</div>" +
        '<div class="decisions">' + (ds.length ? ds.slice(0, 20).map(decRow).join("") : '<div class="d">' + DASH + "</div>") + "</div>" +
        '<button class="btn btn-ghost" style="margin-top:10px" data-settings="' + attr(b.name) + '">Settings</button></div>';
    }));
    v.innerHTML = '<div style="height:4px"></div>' + cards.join("");
  }
  function decRow(d) {
    const what = d.verdict ? (d.verdict === "pass" ? "→ Analyst" : (d.reason || "killed"))
      : d.sizeUsd != null ? F.money(d.sizeUsd) + (d.pctOfCash != null ? " · " + d.pctOfCash + "% of cash" : "")
      : d.score != null ? "score " + d.score
      : d.status ? d.side + " · " + d.status
      : d.reason || DASH;
    const link = d.link ? '<a href="' + attr(F.fomoHref(d.link)) + '" target="_blank" rel="noopener noreferrer">' + esc(coinName(d)) + "</a>" : esc(coinName(d));
    return '<div class="d"><span>' + link + " · " + esc(String(what)) + "</span><span>" + esc(F.clock(d.ts)) + "</span></div>";
  }

  // ------------------------------------------------------------ ACTIVITY tab
  function renderActivity() {
    const v = $("#view-activity");
    const rows = S.activity && S.activity.rows;
    v.innerHTML = '<div class="section-h" style="margin-top:4px"><span>Activity</span></div>' +
      (rows == null ? skeletonRows(5) : rows.length ? '<div class="rows">' + rows.map(actRow).join("") + "</div>"
        : '<div class="empty">Nothing yet tonight</div>');
  }

  // ------------------------------------------------------------ COIN
  async function openCoin(mint) {
    S.sub = "coin"; S.coinMint = mint; S.coin = null; show("coin"); renderCoin();
    try { S.coin = await Src.coin(mint); } catch (e) { S.coin = { error: e.message }; }
    renderCoin();
  }
  function renderCoin() {
    const v = $("#view-coin");
    const back = '<button class="back" data-back>‹ Back</button>';
    const c = S.coin;
    if (!c) { v.innerHTML = back + '<div class="sk sk-balance"></div><div class="sk sk-chart"></div><div class="sk sk-row"></div>'; return; }
    if (c.error) { v.innerHTML = back + '<div class="empty">' + esc(c.error) + "</div>"; return; }
    const p = c.position;
    const paper = S.state && S.state.paper;
    const since = F.num(c.sinceEntryPct);
    v.innerHTML = back +
      '<div class="coin-h"><div class="name">' + esc(c.name || coinName(c)) + (paper ? '<span class="badge-paper on" style="margin:0">PAPER</span>' : "") + "</div>" +
      '<div class="coin-sub"><span>' + esc(c.symbol || DASH) + " · " + esc(c.chain || "Solana") + " · " + esc(F.ageH(c.ageH)) + "</span>" +
      '<span class="shield' + (c.shield === "8/8" ? " good" : "") + '">🛡 ' + esc(c.shield || DASH) + "</span></div></div>" +
      '<div class="coin-price">' + esc(F.price(c.price)) + "</div>" +
      (since == null ? "" : '<div class="since ' + sign(since) + '">' + (since >= 0 ? "▲ " : "▼ ") + esc(F.pct(Math.abs(since), { sign: false })) + " since entry</div>") +
      '<div class="candle-wrap"><canvas id="candles"></canvas></div>' +
      '<div class="stats"><div class="stat"><div class="k">Market cap</div><div class="n">' + esc(F.compactUsd(c.marketCap)) + "</div></div>" +
      '<div class="stat"><div class="k">Liquidity</div><div class="n">' + esc(F.compactUsd(c.liquidityUsd)) + "</div></div>" +
      '<div class="stat"><div class="k">Holders</div><div class="n">' + esc(F.holders(c.holders)) + "</div></div></div>" +
      (p ? '<div class="pos-card"><div class="k">Your position</div><div class="n">' + esc(F.money(p.sizeUsd)) + " in · Executor</div></div>" : "") +
      '<div class="coin-actions">' + (F.fomoAnchor(c.link) || '<span class="btn btn-ghost">' + DASH + "</span>") +
      (p ? '<button class="btn-sell" data-sell="' + attr(c.mint) + '">Sell now</button>' : '<button class="btn btn-ghost" data-audit="' + attr(c.mint) + '">Audit</button>') + "</div>";
    if ((c.candles || []).length) C.candles($("#candles"), c);
    else $(".candle-wrap", v).innerHTML = '<div class="empty" style="padding:70px 0">' + DASH + "</div>";
  }

  // ------------------------------------------------------------ AUDIT
  async function openAudit(mint) {
    S.sub = "audit"; S.audit = null; show("audit"); renderAudit();
    try { S.audit = await Src.audit(mint); } catch (e) { S.audit = { error: e.message }; }
    renderAudit();
  }
  function renderAudit() {
    const v = $("#view-audit");
    const back = '<button class="back" data-back>‹ Back</button>';
    const a = S.audit;
    if (!a) { v.innerHTML = back + skeletonRows(8); return; }
    if (a.error) { v.innerHTML = back + '<div class="empty">' + esc(a.error) + "</div>"; return; }
    const L = a.layers || [];
    v.innerHTML = back +
      '<div class="coin-h"><div class="name">' + esc(a.name || coinName(a)) + '</div><div class="coin-sub"><span>' + esc(a.symbol || DASH) +
      ' · Audit</span><span class="shield' + (a.shield === "8/8" ? " good" : "") + '">🛡 ' + esc(a.shield || DASH) + "</span></div></div>" +
      '<div class="discs">' + L.map((l) => '<div class="disc" data-n="' + l.n + '">' + l.n + "</div>").join("") + '<i class="beam"></i></div>' +
      '<div class="layers">' + L.map((l) => '<div class="layer" data-layer="' + l.n + '"><span class="mk"></span><span class="nm">' + esc(l.name) +
        '</span><span class="val">' + esc(l.value == null ? DASH : l.value) + "</span></div>").join("") + "</div>" +
      '<div class="social-row">' + esc(socialLine(a)) + "</div>" +
      '<div style="margin-top:16px">' + F.fomoAnchor(a.link) + "</div>";
    beam(L);
  }
  function socialLine(a) {
    const s = a.score;
    if (!s || s.socialPts == null) return "Social: off";
    const so = s.social || {};
    const u = so.u15 != null ? so.u15 : DASH, sm = so.smart != null ? so.smart : DASH;
    return "Social +" + s.socialPts + " · " + u + " accounts in 15m · " + sm + " top traders hold";
  }
  function beam(L) {
    const discs = document.querySelectorAll("#view-audit .disc");
    const b = $("#view-audit .beam");
    const mark = (i) => {
      const l = L[i]; if (!l) return;
      discs[i].classList.add(l.state);
      const row = document.querySelector('#view-audit .layer[data-layer="' + l.n + '"] .mk');
      if (row) { row.textContent = l.state === "green" ? "✓" : l.state === "red" ? "✕" : "–"; row.style.color = l.state === "green" ? "var(--green)" : l.state === "red" ? "var(--red)" : "var(--tertiary)"; }
    };
    if (C.reduced() || !b) { L.forEach((_, i) => mark(i)); return; }
    let i = 0;
    const step = () => {
      if (i >= discs.length) { b.style.opacity = "0"; return; }
      const d = discs[i];
      b.style.transition = "transform 220ms ease-out";
      b.style.transform = "translateX(" + (d.offsetLeft + d.offsetWidth / 2 - 4) + "px)";
      setTimeout(() => { mark(i); i++; step(); }, 260);
    };
    step();
  }

  // ------------------------------------------------------------ SELL sheet
  function openSell(mint) {
    const c = S.coin || {};
    let pct = 100;
    const sh = $("#sheet");
    const draw = () => {
      sh.innerHTML = '<div class="sheet"><div class="grab"></div><h3>Sell ' + esc(coinName(c)) + "</h3>" +
        '<div class="pcts">' + [25, 50, 100].map((p) => '<button data-pct="' + p + '" class="' + (p === pct ? "on" : "") + '">' + p + "%</button>").join("") + "</div>" +
        (Src.canAct() ? '<button class="btn-primary" data-confirm-sell>Confirm sell</button>'
          : '<div class="note">Plan B: the phone can\'t reach the desk. Send <b>sell ' + esc(coinName(c)) + " " + pct + "</b> in Telegram or the Grok Bot chat.</div>" +
            '<div style="margin-top:10px">' + F.fomoAnchor(c.link, "Sell by hand on FOMO") + "</div>") +
        '<button class="btn btn-ghost" style="width:100%;margin-top:10px" data-close>Cancel</button></div>';
    };
    draw(); sh.hidden = false; sh.classList.add("on");
    sh.onclick = async (e) => {
      const t = e.target.closest("button,a"); if (!t) { if (e.target === sh) close(); return; }
      if (t.dataset.pct) { pct = +t.dataset.pct; draw(); }
      else if (t.hasAttribute("data-close")) close();
      else if (t.hasAttribute("data-confirm-sell")) {
        try {
          const r = await Src.api("/api/sell/" + encodeURIComponent(mint), { method: "POST", body: JSON.stringify({ pct, confirm: true }) });
          toast("Sell " + pct + "% queued · Executor clicks it (order " + r.order + ")");
        } catch (err) { toast("Sell refused: " + err.message); }
        close();
      }
    };
    function close() { sh.classList.remove("on"); sh.hidden = true; }
  }

  // ------------------------------------------------------------ ACCOUNT tab
  function renderAccount() {
    const v = $("#view-account");
    const s = S.state, a = S.account;
    const mode = (s && s.mode) || (a && a.mode) || null;
    const cash = a ? a.cash : s ? s.cash : null;
    const planB = Src.plan === "B";
    let h = '<div class="mode-switch"><button data-mode="PAPER" class="' + (mode === "PAPER" ? "on" : "") + '">PAPER</button>' +
      '<button data-mode="LIVE" class="' + (mode === "LIVE" ? "on" : "") + '">LIVE</button></div>' +
      '<div class="cash-box"><div class="k">Cash' + (mode === "LIVE" && cash == null ? " · unavailable (no FOMO token)" : "") + '</div><div class="n">' + esc(F.money(cash)) + "</div></div>";
    const prof = a && a.profileUrl;
    const invite = a && a.inviteUrl;
    h += '<div class="account-list">' +
      (prof ? '<a class="item" href="' + attr(F.fomoHref(prof)) + '" target="_blank" rel="noopener noreferrer"><span>Your FOMO profile</span><span class="r">›</span></a>'
        : '<div class="item"><span>Your FOMO profile</span><span class="r">' + (planB ? "via Telegram" : DASH) + "</span></div>") +
      (invite ? '<button class="item" data-invite="' + attr(F.fomoHref(invite)) + '"><span>Invite a friend</span><span class="r">Share</span></button>'
        : '<div class="item"><span>Invite a friend</span><span class="r">' + (planB ? "send invite in Telegram" : DASH) + "</span></div>") +
      '<div class="item"><span>Pushes</span><span class="r">' + esc(pushText(a)) + "</span></div>" +
      '<button class="item" data-act="test-push"><span>Send test push</span><span class="r">›</span></button>' +
      '<button class="item" data-act="enable-push"><span>Enable notifications</span><span class="r">' + esc(enableText()) + "</span></button>" +
      '<button class="item" data-act="watch"><span>Watch in Grok Bot</span><span class="r">›</span></button>' +
      "</div>";
    h += '<div class="group"><h2>Copy picks</h2><div class="setting"><div class="lab"><span>Every</span><span class="r note" style="margin:0">' +
      (planB ? "set in Telegram" : "chapter 3, not built") + '</span></div><div class="copy-seg">' +
      ["off", "24h", "12h", "6h"].map((o) => '<button disabled class="' + (o === "off" ? "on" : "") + '">' + o + "</button>").join("") +
      '</div><div class="lab" style="margin-top:10px"><span>Time</span><span>' + DASH + "</span></div></div></div>";
    if (S.settings) h += settingsHtml(S.settings);
    else h += '<div class="group"><h2>Settings</h2><div class="setting note">' +
      (planB ? 'Plan B: settings live on the desk. Change one in Telegram or the Grok Bot chat, e.g. "set stop to -20%". It replies "stop -25% -> -20%".'
        : DASH) + "</div></div>";
    v.innerHTML = '<div class="section-h" style="margin-top:4px"><span>Account</span></div>' + h;
  }
  function pushText(a) {
    if (Src.plan === "B") return "Telegram only (plan B)";
    if (!a || !a.pushes) return DASH;
    return a.pushes.connected ? "connected" : "not connected";
  }
  function enableText() {
    const home = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
    if (Src.plan === "B") return "Telegram only";
    return home ? ("Notification" in window ? Notification.permission : "not supported") : "home screen only";
  }
  const GROUPS = ["scanner", "analyst", "social", "brain", "executor", "risk", "desk"];
  function settingsHtml(set) {
    return GROUPS.filter((g) => set.groups[g]).map((g) =>
      '<div class="group"><h2>' + esc(g[0].toUpperCase() + g.slice(1)) + "</h2>" + set.groups[g].map(settingRow).join("") + "</div>").join("");
  }
  function settingRow(x) {
    const ro = x.readOnly || x.key === "desk.mode";
    if (x.type === "float" || x.type === "int") {
      const step = x.type === "int" ? 1 : (x.max - x.min) <= 2 ? 0.01 : (x.max - x.min) <= 50 ? 0.1 : 1;
      return '<div class="setting"><div class="lab"><span>' + esc(x.name) + "</span>" +
        '<input type="number" inputmode="decimal" data-key="' + attr(x.key) + '" value="' + attr(x.value) + '" min="' + attr(x.min) + '" max="' + attr(x.max) + '" step="' + step + '"' + (ro ? " disabled" : "") + "></div>" +
        '<input type="range" data-key="' + attr(x.key) + '" value="' + attr(x.value) + '" min="' + attr(x.min) + '" max="' + attr(x.max) + '" step="' + step + '"' + (ro ? " disabled" : "") + ">" +
        '<div class="note" style="margin-top:0">' + esc(x.min) + " – " + esc(x.max) + "</div></div>";
    }
    if (x.type === "bool") {
      return '<div class="setting"><div class="lab"><span>' + esc(x.name) + '</span><button class="switch' + (x.value ? " on" : "") + '" data-bool="' + attr(x.key) + '"><i></i></button></div></div>';
    }
    if (x.choices) {
      return '<div class="setting"><div class="lab"><span>' + esc(x.name) + "</span></div><select data-key=\"" + attr(x.key) + '"' + (ro ? " disabled" : "") + ">" +
        x.choices.map((c) => '<option' + (c === x.value ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</select></div>";
    }
    return '<div class="setting"><div class="lab"><span>' + esc(x.name) + '</span></div><input type="text" data-key="' + attr(x.key) + '" value="' + attr(x.value == null ? "" : x.value) + '"' + (ro ? " disabled" : "") + "></div>";
  }
  async function saveSetting(key, value) {
    if (!Src.canAct()) return toast("Plan B: change settings in Telegram");
    try {
      const r = await Src.api("/api/settings", { method: "POST", body: JSON.stringify({ key, value }) });
      toast(r.text || "Saved");
      S.settings = await Src.settings();
    } catch (e) { toast(e.message); S.settings = await Src.settings().catch(() => S.settings); }
    renderAccount();
  }

  function openLiveConfirm() {
    const box = $("#confirm");
    box.innerHTML = '<div class="confirm-box"><h3>Switch to LIVE</h3><p>Real money. Type LIVE to confirm.</p>' +
      '<input id="live-in" autocomplete="off" autocapitalize="characters" placeholder="LIVE"><button class="btn-primary" data-go-live>Switch to LIVE</button>' +
      '<button class="btn btn-ghost" style="width:100%;margin-top:10px" data-close>Cancel</button></div>';
    box.hidden = false; box.classList.add("on");
    box.onclick = async (e) => {
      const t = e.target.closest("button"); if (!t) { if (e.target === box) close(); return; }
      if (t.hasAttribute("data-close")) return close();
      if (t.hasAttribute("data-go-live")) {
        const typed = $("#live-in").value.trim();
        if (typed !== "LIVE") return toast("Type LIVE exactly");
        try { await Src.api("/api/mode", { method: "POST", body: JSON.stringify({ mode: "LIVE", confirm: "LIVE" }) }); toast("LIVE"); }
        catch (err) { toast(err.message); }
        close(); poll(true);
      }
    };
    function close() { box.classList.remove("on"); box.hidden = true; }
  }

  // ------------------------------------------------------------ search
  function openSearch() {
    const box = $("#search");
    box.innerHTML = '<div class="search-bar"><input id="q" placeholder="Name, symbol or mint" autocomplete="off"><button data-close>Cancel</button></div><div id="search-results"></div>';
    box.hidden = false; box.classList.add("on");
    const q = $("#q"); q.focus();
    const run = () => {
      const t = q.value.trim().toLowerCase();
      const seen = new Map();
      const add = (o) => { if (o && o.mint && !seen.has(o.mint)) seen.set(o.mint, o); };
      ((S.state && S.state.positions) || []).forEach(add);
      ((S.activity && S.activity.rows) || []).forEach(add);
      ((S.state && S.state.bots) || []).forEach((b) => (b.feed || []).forEach(add));
      const hits = [...seen.values()].filter((o) => !t || [o.name, o.symbol, o.mint].some((x) => x && x.toLowerCase().includes(t)));
      $("#search-results").innerHTML = hits.length ? '<div class="rows">' + hits.map((o) =>
        '<div class="row" data-open="coin" data-mint="' + attr(o.mint) + '"><div class="t">' + esc(o.name || coinName(o)) + '</div><div class="v">' + esc(o.symbol || "") + '</div><div class="s mono">' + esc(o.mint) + '</div><div class="open">' + F.fomoAnchor(o.link) + "</div></div>").join("") + "</div>"
        : '<div class="empty">' + (t ? "No coin on the desk matches" : DASH) + "</div>";
    };
    q.oninput = run; run();
    box.onclick = (e) => {
      if (e.target.closest("[data-close]")) { box.classList.remove("on"); box.hidden = true; return; }
      const r = e.target.closest(".row");
      if (r && !e.target.closest("a")) { box.classList.remove("on"); box.hidden = true; openCoin(r.dataset.mint); }
    };
  }

  // ------------------------------------------------------------ full screen
  function openScreen() {
    S.sub = "screen"; show("screen");
    const coin = S.state && S.state.lastOrder;
    $("#view-screen").innerHTML = '<img class="screen-img" alt="Bot\'s computer">' +
      '<div class="screen-ui"><button class="close" data-back aria-label="Close">✕</button><span style="flex:1"></span>' +
      (coin && coin.link ? F.fomoAnchor(coin.link) : "") + "</div>";
    refreshFrame();
  }

  // ------------------------------------------------------------ errors
  function renderError() {
    const b = $("#error-bar");
    if (!S.failing) { b.classList.remove("on"); b.textContent = ""; return; }
    b.classList.add("on");
    b.textContent = "Desk offline · retrying in " + S.retryIn + "s · last update " + (S.lastOk ? F.clock(S.lastOk / 1000, { seconds: true }) : DASH);
  }

  // ------------------------------------------------------------ polling
  let backoff = 0, tick = null;
  async function poll(force) {
    try {
      const st = await Src.state();
      const prevPts = S.chart[S.range] && S.chart[S.range].points && S.chart[S.range].points.length;
      const [ch, act] = await Promise.all([Src.chart(S.range), Src.activity()]);
      S.state = st; S.chart[S.range] = ch; S.activity = act;
      if (!S.account && Src.plan === "A") { S.account = await Src.account().catch(() => null); S.settings = await Src.settings().catch(() => null); }
      S.lastOk = Date.now(); S.failing = false; backoff = 0;
      const grew = prevPts && ch && ch.points && ch.points.length > prevPts;
      renderAll(grew);
    } catch (e) {
      if (e && e.status === 401) { localStorage.removeItem(TOK); }
      S.failing = true;
      backoff = Math.min(60, backoff ? backoff * 2 : POLL_MS() / 1000);
      S.retryIn = Math.round(backoff);
      if (!S.state) renderTab(S.tab);   // keep skeletons, never blank
    }
    renderError();
    clearTimeout(tick);
    tick = setTimeout(poll, S.failing ? backoff * 1000 : POLL_MS());
  }
  setInterval(() => { if (S.failing && S.retryIn > 0) { S.retryIn--; renderError(); } }, 1000);

  function renderTab(t) {
    if (t === "home") renderHome();
    else if (t === "bots") renderBots();
    else if (t === "activity") renderActivity();
    else if (t === "account") renderAccount();
  }
  function renderAll(grew) {
    renderNav();
    if (S.sub) return;
    renderTab(S.tab);
    if (S.tab === "home" && grew && !C.reduced()) {
      const t0 = performance.now();
      const anim = (t) => { const k = Math.min(1, (t - t0) / 250); drawChart(k); if (k < 1) requestAnimationFrame(anim); };
      requestAnimationFrame(anim);
    }
  }

  // ------------------------------------------------------------ events
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-go],[data-range],[data-act],[data-open],[data-back],[data-sell],[data-audit],[data-pause],[data-mode],[data-invite],[data-settings],[data-bool]");
    if (!el || e.target.closest("a.btn-fomo")) return;
    if (el.dataset.go) return go(el.dataset.go);
    if (el.dataset.range) { S.range = el.dataset.range; try { S.chart[S.range] = await Src.chart(S.range); } catch (err) {} return renderHome(); }
    if (el.hasAttribute("data-back")) { S.sub = null; show(S.tab); return renderTab(S.tab); }
    if (el.dataset.open) return el.dataset.open === "audit" ? openAudit(el.dataset.mint) : el.dataset.mint && openCoin(el.dataset.mint);
    if (el.dataset.sell) return openSell(el.dataset.sell);
    if (el.dataset.audit) return openAudit(el.dataset.audit);
    if (el.dataset.settings) { go("account"); return; }
    if (el.dataset.pause) {
      const b = (S.state.bots || []).find((x) => x.name === el.dataset.pause);
      if (b.name === "risk" && b.pauseLocked && !b.paused) return toast("Risk can't be paused with a position open");
      if (!Src.canAct()) return toast("Plan B: send \"pause " + b.label + "\" in Telegram");
      try { await Src.api("/api/bots/" + b.name + "/" + (b.paused ? "resume" : "pause"), { method: "POST" }); poll(true); }
      catch (err) { toast(err.message); }
      return;
    }
    if (el.dataset.mode) {
      const want = el.dataset.mode;
      if (S.state && want === S.state.mode) return;
      if (!Src.canAct()) return toast("Plan B: send \"" + want.toLowerCase() + "\" in Telegram");
      if (want === "LIVE") return openLiveConfirm();
      try { await Src.api("/api/mode", { method: "POST", body: JSON.stringify({ mode: "PAPER" }) }); poll(true); } catch (err) { toast(err.message); }
      return;
    }
    if (el.dataset.bool) return saveSetting(el.dataset.bool, !el.classList.contains("on"));
    if (el.dataset.invite) {
      const url = el.dataset.invite;
      if (navigator.share) { try { await navigator.share({ url }); } catch (err) {} return; }
      try { await navigator.clipboard.writeText(url); } catch (err) {}
      return toast("Link copied");
    }
    const act = el.dataset.act;
    if (act === "search") return openSearch();
    if (act === "screen") return openScreen();
    if (act === "bell") return go("activity");
    if (act === "test-push") return toast(Src.plan === "B" ? "Plan B: pushes go through Telegram. Send /status there." : "Test push: needs the notifier (STEP 11)");
    if (act === "enable-push") return toast(Src.plan === "B" ? "Plan B: Telegram only" : "Add to Home Screen first, then enable");
    if (act === "watch") return toast("Opens the computer preview in Grok Bot. The official link isn't in the desk data yet.");
  });
  document.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.key;
    if (!k) return;
    const v = e.target.type === "number" || e.target.type === "range" ? Number(e.target.value) : e.target.value;
    saveSetting(k, v);
  });
  document.addEventListener("input", (e) => {
    if (e.target.type !== "range") return;
    const n = e.target.closest(".setting").querySelector('input[type="number"]');
    if (n) n.value = e.target.value;
  });

  // ------------------------------------------------------------ boot
  function boot() {
    Src.init();
    renderNav(); renderTabs(); renderHome();
    if (!Src.plan) {
      $("#view-home").innerHTML = '<div class="empty" style="padding-top:80px">Open the app once with the link from Grok Bot.<br><span class="note">It ends in #d=… or #t=… and is saved on this phone only.</span></div>';
      return;
    }
    poll(true);
    setInterval(refreshFrame, SCREEN_MS());
    setTimeout(refreshFrame, 400);
    if (Src.plan === "A" && typeof EventSource === "function") {
      // ?t= is the documented way for EventSource (it can't set a Bearer header).
      // The token is not written to the page or to console.
      const es = new EventSource("/api/stream?t=" + encodeURIComponent(Src.token));
      ["scan","audit_layer","score","size","order","fill","exit","balance"].forEach((k) => {
        es.addEventListener(k, () => poll(true));
      });
      es.onerror = () => { /* poll() already running as fallback */ };
    }
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  window.DeskApp = { S, Src, go, openCoin, openAudit, openSell, openScreen, openSearch, poll, renderTab, renderHome, renderError, renderNav, toast };
  boot();
})();
