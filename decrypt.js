// Plan B data helper (STEP 4 hosting B). Not the app (STEP 10): it only finds, fetches and
// decrypts the files planb_writer.py publishes.
// The app opens once as {URL}#d={DATA_PATH}. DATA_PATH is moved to localStorage and removed
// from the address bar; it is never sent to any server (a URL fragment never is).
//   folder  d/{sha256(DATA_PATH) hex [:32]}/
//   key     HKDF-SHA256(DATA_PATH, salt "desk-planb-v1", info "aes-256-gcm file key") -> AES-256-GCM
//   file    12-byte nonce || ciphertext+tag, additionalData = path inside the folder
//   coins   coin/{HMAC-SHA256(HKDF info "coin file names", mint) hex [:32]}.json
(function (root) {
  "use strict";
  const enc = new TextEncoder();
  const subtle = (root.crypto || globalThis.crypto).subtle;
  const STORE = "desk.d";
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

  function dataPath() {
    if (typeof location !== "undefined" && location.hash) {
      const p = new URLSearchParams(location.hash.slice(1));
      const d = p.get("d");
      if (d && /^(?:(?![&#+%])[\x21-\x7E]){32,}$/.test(d)) {
        localStorage.setItem(STORE, d);
        p.delete("d");
        const rest = p.toString();
        history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : ""));
      }
    }
    return typeof localStorage !== "undefined" ? localStorage.getItem(STORE) : null;
  }

  async function derive(dp) {
    const base = await subtle.importKey("raw", enc.encode(dp), "HKDF", false, ["deriveKey"]);
    const hk = (info) => ({ name: "HKDF", hash: "SHA-256", salt: enc.encode("desk-planb-v1"), info: enc.encode(info) });
    const key = await subtle.deriveKey(hk("aes-256-gcm file key"), base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const names = await subtle.deriveKey(hk("coin file names"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
    const folder = hex(await subtle.digest("SHA-256", enc.encode(dp))).slice(0, 32);
    return { folder, key, names };
  }

  async function open(ctx, bytes, rel) {
    const b = new Uint8Array(bytes);
    return subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12), additionalData: enc.encode(rel) }, ctx.key, b.slice(12));
  }

  async function coinPath(ctx, mint) {
    return "coin/" + hex(await subtle.sign("HMAC", ctx.names, enc.encode(mint))).slice(0, 32) + ".json";
  }

  let ctxP = null;
  function ctx() {
    if (!ctxP) {
      const dp = dataPath();
      if (!dp) return Promise.reject(new Error("no #d= yet: open the app once as {URL}#d={DATA_PATH}"));
      ctxP = derive(dp);
    }
    return ctxP;
  }

  async function fetchFile(rel) {
    const c = await ctx();
    const r = await fetch(`d/${c.folder}/${rel}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${rel}: ${r.status}`);
    return open(c, await r.arrayBuffer(), rel);
  }
  const json = async (rel) => JSON.parse(new TextDecoder().decode(await fetchFile(rel)));

  let lastShot = null;
  const DeskData = {
    derive, open, coinPath, dataPath,
    state: () => json("state.json"),
    chart: () => json("chart.json"),
    activity: () => json("activity.json"),
    coin: async (mint) => json(await coinPath(await ctx(), mint)),
    // object URL for <img>; the previous one is revoked (double buffering stays with the app)
    screenURL: async () => {
      const u = URL.createObjectURL(new Blob([await fetchFile("screen.jpg")], { type: "image/jpeg" }));
      if (lastShot) URL.revokeObjectURL(lastShot);
      return (lastShot = u);
    },
    forget: () => { localStorage.removeItem(STORE); ctxP = null; },
  };
  root.DeskData = DeskData;
  if (typeof module !== "undefined") module.exports = DeskData;
})(typeof window !== "undefined" ? window : globalThis);
