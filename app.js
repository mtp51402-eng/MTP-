/* MTP Honey — വാങ്ങൽ, പ്രൊഡക്ഷൻ & വിതരണം
   Offline-first PWA. Data: IndexedDB (device) ⇄ Firebase Realtime Database (REST). */
(function () {
  "use strict";

  /* =====================================================================
     1. CONFIG
     ===================================================================== */
  const CFG = {
    DB: "https://mtp-honey-default-rtdb.asia-southeast1.firebasedatabase.app", // can be changed inside the app
    ROOT: "mtp-honey-v1",
    IDB: "mtp-honey",
    DB_KEY: "mth_db_url",
    SYNC_DEBOUNCE: 1200,
    POLL_MS: 45000,
    AUTOLOCK_MS: 5 * 60 * 1000,
    MAX_TRIES: 5,
    LOCK_MS: 30000
  };
  const COLS = ["products", "suppliers", "shops", "purchases", "sales", "staff", "settings"];
  const BACKUP_COLS = ["products", "suppliers", "shops", "purchases", "sales", "staff"];
  const CATEGORIES = ["തേൻ (Honey)", "മരുന്നുകൾ പൊടിച്ചത് (Herbal Mix)", "ബോട്ടിൽ & ജാർ (Bottles)", "ക്യാഷ് / മറ്റ് ചെലവ് (Cash)", "ട്രാവൽ (Travel)"];
  const UNITS = ["kg", "gram", "bottle", "packet", "litre"];


  /* =====================================================================
     2. HELPERS
     ===================================================================== */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const pad = (n) => String(n).padStart(2, "0");
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = (s) => String(s || "").normalize("NFC").trim().replace(/\s+/g, " ");
  const norm = (s) => clean(s).toLowerCase();
  const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const kgFmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  // Local calendar date (NOT UTC) — fixes wrong "today" in India before 5:30 AM
  const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayIso = () => isoOf(new Date());
  const monthNow = () => todayIso().slice(0, 7);
  const parseIso = (iso) => { const p = String(iso || "").split("-").map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const MONTHS = ["ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ", "ജൂലൈ", "ഓഗസ്റ്റ്", "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ"];
  const WD = ["ഞായർ", "തിങ്കൾ", "ചൊവ്വ", "ബുധൻ", "വ്യാഴം", "വെള്ളി", "ശനി"];
  const fmtDate = (iso) => { const d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); };
  const fmtDay = (iso) => { const d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + ", " + WD[d.getDay()]; };
  const fmtMonth = (k) => { const p = String(k).split("-").map(Number); return MONTHS[(p[1] || 1) - 1] + " " + p[0]; };
  const initial = (s) => { const t = clean(s) || "?"; return (typeof Intl !== "undefined" && Intl.Segmenter) ? (Array.from(new Intl.Segmenter("ml", { granularity: "grapheme" }).segment(t), (x) => x.segment)[0] || "?") : Array.from(t)[0]; };
  const segs = (s) => (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("ml", { granularity: "grapheme" }).segment(s), (x) => x.segment) : Array.from(s);

  function cyrb53(str, seed) {
    seed = seed || 0;
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const pinHash = (pin) => String(cyrb53("mc-pin:" + pin));

  const ICON = (() => {
    const p = {
      grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6"/>',
      cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>',
      store: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M10 20v-5h4v5"/>',
      chart: '<path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-9"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4"/>',
      lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      check: '<path d="M5 12l5 5 9-10"/>',
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
      msg: '<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 20l1.3-5A8.4 8.4 0 1 1 21 11.5z"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
      upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
      print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/>',
      file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/>',
      book: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM4 17a3 3 0 0 1 3-3h12"/>',
      refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4"/>',
      delete: '<path d="M21 4H8l-6 8 6 8h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM18 9l-6 6M12 9l6 6"/>',
      phone2: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'
    };
    const o = {};
    Object.keys(p).forEach((k) => { o[k] = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p[k] + "</svg>"; });
    return o;
  })();


  Object.assign(ICON, (() => {
    const mk = (p) => '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
    return {
      sun: mk('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
      moon: mk('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
      bell: mk('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>'),
      list: mk('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
      users: mk('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
      truck: mk('<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>'),
      flask: mk('<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3M7.5 15h9"/>'),
      settings: mk('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
      rupee: mk('<path d="M6 3h12M6 8h12M6 13h4a4 4 0 0 0 0-5M9 13l7 8"/>')
    };
  })());

  /* =====================================================================
     3. STATE & LOCAL PERSISTENCE
     ===================================================================== */
  function defaultSettings() {
    return {
      id: "main", updatedAt: 0,
      adminHash: pinHash("1234"),
      biz: { name: "MTP Honey", tag: "വാങ്ങൽ • പ്രൊഡക്ഷൻ • വിതരണം", place: "", phone: "" }
    };
  }
  function defaultState() {
    const products = {};
    [["MTP Pure Honey 500g", "gram", 320], ["MTP Pure Honey 1kg", "kg", 620], ["MTP Honey Mix 250g", "gram", 240], ["MTP Honey Bottle", "bottle", 350]].forEach((p, i) => {
      const id = "pr" + (i + 1); products[id] = { id, name: p[0], unit: p[1], price: p[2], order: i + 1, deleted: false, updatedAt: 0 };
    });
    return {
      v: 1,
      data: { products, suppliers: {}, shops: {}, purchases: {}, sales: {}, staff: {}, settings: { main: defaultSettings() } },
      dirty: {}, lastSync: 0, lastAutoBackup: "", lock: { n: 0, until: 0 }, theme: "light"
    };
  }
  let state = defaultState();
  let session = null; // { role:'admin'|'staff', name, code, canProfit }
  let ui = { mode: "purchase", pane: "p_entry", pMonth: monthNow(), pSearch: "", sMonth: monthNow(), sSearch: "", rMonth: monthNow(), editPurchase: null, editSale: null };
  let persistTimer = null, dbPromise = null;

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("no idb"));
        const q = indexedDB.open(CFG.IDB, 1);
        q.onupgradeneeded = () => q.result.createObjectStore("kv");
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }
    return dbPromise;
  }
  async function idbGet(k) { const db = await withTimeout(idb(), 2500); return new Promise((res, rej) => { const r = db.transaction("kv", "readonly").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function idbSet(k, v) { const db = await withTimeout(idb(), 2500); return new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

  let idbSkip = false;
  async function loadState() {
    const base = defaultState();
    // ഡാറ്റ രണ്ട് സ്ഥലത്ത് (localStorage + IndexedDB) സേവ് ചെയ്യുന്നു; പുതിയ കോപ്പി എടുക്കും
    let a = { ok: false };
    for (let i = 0; i < 3 && !a.ok; i++) {
      try { a = { ok: true, v: await withTimeout(idbGet("state"), 5000) }; } catch (e) { dbPromise = null; await new Promise((r) => setTimeout(r, 400)); }
    }
    let b = null;
    try { const raw = localStorage.getItem("mth_state_v1"); if (raw) b = JSON.parse(raw); } catch (e) { /* ignore */ }
    const ta = a.ok && a.v && typeof a.v === "object" ? (a.v.savedAt || 1) : 0;
    const tb = b && typeof b === "object" ? (b.savedAt || 1) : 0;
    const saved = ta || tb ? (ta >= tb ? a.v : b) : null;
    if (!a.ok) idbSkip = true; // IndexedDB തകരാറിലാണെങ്കിൽ localStorage മാത്രം ഉപയോഗിക്കും
    if (saved && typeof saved === "object" && saved.data) {
      state = Object.assign(base, saved);
      COLS.forEach((c) => { if (!state.data[c] || typeof state.data[c] !== "object") state.data[c] = base.data[c]; });
      if (!state.data.settings.main) state.data.settings.main = defaultSettings();
      if (!state.dirty) state.dirty = {};
      if (!state.lock) state.lock = { n: 0, until: 0 };
    }
  }
  function persist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 250); }
  async function persistNow() {
    clearTimeout(persistTimer);
    state.savedAt = Date.now();
    try { localStorage.setItem("mth_state_v1", JSON.stringify(state)); } catch (e) { /* full */ }
    if (idbSkip) return;
    try { await withTimeout(idbSet("state", JSON.parse(JSON.stringify(state))), 4000); } catch (e) { dbPromise = null; /* localStorage copy remains */ }
  }

  /* =====================================================================
     4. DATA ACCESS & BUSINESS LOGIC
     ===================================================================== */
  const S = () => state.data.settings.main;
  const live = (col) => Object.values(state.data[col]).filter((r) => r && !r.deleted);
  const byId = (col, id) => { const r = state.data[col][id]; return r && !r.deleted ? r : null; };
  const isAdmin = () => !!session && session.role === "admin";
  const canProfit = () => !!session && (session.role === "admin" || !!session.canProfit);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "ml");
  const sortedProducts = () => live("products").sort((a, b) => (a.order || 0) - (b.order || 0) || byName(a, b));
  const sumBy = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);

  function save(col, rec) {
    rec.updatedAt = Date.now();
    state.data[col][rec.id] = rec;
    state.dirty[col + "/" + rec.id] = 1;
    persist();
    scheduleSync();
    return rec;
  }
  function softDelete(col, id) { const r = state.data[col][id]; if (r) { r.deleted = true; save(col, r); } }

  // Money owed TO suppliers
  function supplierSummary(id) {
    const s = state.data.suppliers[id];
    let billed = s ? num(s.openingPayable) : 0, paid = 0;
    live("purchases").forEach((p) => { if (p.supplierId === id) { billed += num(p.total); paid += num(p.paid); } });
    return { billed: r2(billed), paid: r2(paid), balance: r2(billed - paid) };
  }
  // Money owed BY shops
  function shopSummary(id) {
    const s = state.data.shops[id];
    let billed = s ? num(s.openingCredit) : 0, paid = 0;
    live("sales").forEach((x) => { if (x.shopId === id) { if (x.kind === "sale") billed += num(x.total); paid += num(x.paid); } });
    return { billed: r2(billed), paid: r2(paid), balance: r2(billed - paid) };
  }
  const totalPayable = () => r2(live("suppliers").reduce((a, s) => a + Math.max(0, supplierSummary(s.id).balance), 0));
  const totalCredit = () => r2(live("shops").reduce((a, s) => a + Math.max(0, shopSummary(s.id).balance), 0));
  const isOverdue = (shop) => !!shop.dueDate && shop.dueDate < todayIso() && shopSummary(shop.id).balance > 0;

  function reportData(m) {
    const mS = live("sales").filter((s) => (s.date || "").startsWith(m));
    const mP = live("purchases").filter((p) => (p.date || "").startsWith(m));
    const sold = {};
    mS.forEach((s) => { if (s.kind === "sale") (s.items || []).forEach((i) => { const k = i.name + " (" + i.unit + ")"; const o = sold[k] || (sold[k] = { name: k, qty: 0, amount: 0 }); o.qty += num(i.qty); o.amount += num(i.amount); }); });
    return {
      sales: r2(sumBy(mS.filter((s) => s.kind === "sale"), (s) => s.total)), received: r2(sumBy(mS, (s) => s.paid)),
      purchase: r2(sumBy(mP.filter((p) => p.kind === "purchase"), (p) => p.total)), paidOut: r2(sumBy(mP, (p) => p.paid)),
      sold: Object.values(sold).sort((a, b) => b.amount - a.amount),
      shopsDue: live("shops").map((s) => ({ s, b: shopSummary(s.id).balance })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b),
      suppliersDue: live("suppliers").map((s) => ({ s, b: supplierSummary(s.id).balance })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b)
    };
  }

  function nextBillNo() {
    let mx = 0;
    Object.values(state.data.sales).forEach((s) => { const m = /(\d+)$/.exec(s.billNo || ""); if (m) mx = Math.max(mx, parseInt(m[1], 10)); });
    return "MTP-" + String(mx + 1).padStart(4, "0");
  }
  function dbBase() { try { return localStorage.getItem(CFG.DB_KEY) || CFG.DB; } catch (e) { return CFG.DB; } }
  function applyTheme() { document.documentElement.setAttribute("data-theme", state.theme === "dark" ? "dark" : "light"); }

  /* =====================================================================
     5. FIREBASE SYNC
     ===================================================================== */
  let syncing = false, syncTimer = null, syncState = "idle", syncErr = "";
  const online = () => navigator.onLine !== false;
  const pending = () => Object.keys(state.dirty).length;
  const url = (path) => dbBase().replace(/\/+$/, "") + "/" + CFG.ROOT + (path ? "/" + path : "") + ".json";

  async function fetchRoot() {
    const r = await fetch(url(""), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function mergeRemote(root) {
    if (!root) return false;
    let changed = false;
    COLS.forEach((col) => {
      const rc = root[col];
      if (!rc || typeof rc !== "object") return;
      Object.keys(rc).forEach((id) => {
        const rv = rc[id];
        if (!rv || typeof rv !== "object") return;
        const lv = state.data[col][id];
        if (!lv || (rv.updatedAt || 0) > (lv.updatedAt || 0)) {
          state.data[col][id] = rv;
          delete state.dirty[col + "/" + id];
          changed = true;
        }
      });
    });
    return changed;
  }
  async function push() {
    const keys = Object.keys(state.dirty);
    for (let i = 0; i < keys.length; i += 4) {
      await Promise.all(keys.slice(i, i + 4).map(async (k) => {
        const [col, id] = k.split("/");
        const rec = state.data[col] && state.data[col][id];
        if (!rec) { delete state.dirty[k]; return; }
        const stamp = rec.updatedAt;
        const r = await fetch(url(k), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const now = state.data[col][id];
        if (now && now.updatedAt === stamp) delete state.dirty[k];
      }));
    }
  }
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), CFG.SYNC_DEBOUNCE); updateStatus(); }

  async function sync(manual) {
    if (syncing) return manual ? "busy" : undefined;
    if (!online()) { updateStatus(); return "offline"; }
    syncing = true; syncState = "busy"; syncErr = ""; updateStatus();
    let changed = false;
    try { await push(); } catch (e) { syncErr = String((e && e.message) || e); }
    try { changed = mergeRemote(await fetchRoot()); } catch (e) { syncErr = syncErr || String((e && e.message) || e); }
    if (!syncErr) {
      state.lastSync = Date.now(); syncState = "ok";
      if (changed) { try { await push(); } catch (e) { /* retry next time */ } }
    } else { syncState = "err"; }
    syncing = false;
    persist(); updateStatus();
    if (changed) softRefresh();
    return syncState;
  }

  function statusText() {
    const n = pending();
    if (!online()) return ["off", "ഓഫ്‌ലൈൻ" + (n ? " • " + n + " മാറ്റം അയക്കാനുണ്ട്" : " • ഫോണിൽ സേവ് ആകുന്നു")];
    if (syncState === "busy") return ["busy", "സിങ്ക് ചെയ്യുന്നു…"];
    if (syncState === "err") return ["err", "സെർവർ ലഭ്യമല്ല (" + syncErr + ")" + (n ? " • " + n + " മാറ്റം പിന്നീട് അയക്കും" : "")];
    if (n) return ["", "ഓൺലൈൻ • " + n + " മാറ്റം അയക്കാനുണ്ട്"];
    return ["", "ഓൺലൈൻ • സിങ്ക് പൂർത്തിയായി"];
  }
  function updateStatus() {
    const d = $("#syncDot"), t = $("#syncText");
    if (!d || !t) return;
    const s = statusText();
    d.className = "dot " + s[0];
    t.textContent = s[1];
  }


  /* =====================================================================
     6. UI PLUMBING: toast, modal
     ===================================================================== */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (kind ? " " + kind : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
  }
  let modal = null;
  function openModal(m) {
    modal = m;
    renderModal();
    if (m.focus !== false) { const f = $("#modalRoot input:not([readonly]), #modalRoot select"); if (f) setTimeout(() => f.focus(), 60); }
  }
  function closeModal() { modal = null; renderModal(); }
  function renderModal() {
    const root = $("#modalRoot");
    if (!modal) { root.innerHTML = ""; return; }
    root.innerHTML = '<div class="overlay" data-act="modal-bg"><div class="sheet' + (modal.wide ? " wide" : "") + '" role="dialog" aria-modal="true"><h3>' + h(modal.title) + "</h3>" +
      (modal.text ? '<p class="t">' + h(modal.text) + "</p>" : "") + (modal.body || "") + '<p id="modalErr" class="neg" style="margin:0;font-size:.78rem;font-weight:700" hidden></p>' +
      (modal.footer ? modal.footer : '<div class="acts"><button type="button" class="btn ghost" data-act="modal-cancel">റദ്ദാക്കുക</button><button type="button" class="btn ' + (modal.danger ? "danger" : "") + '" data-act="modal-ok">' + h(modal.ok || "സേവ്") + "</button></div>") + "</div></div>";
  }
  const mv = (id) => { const e = document.getElementById("mf_" + id); return e ? (e.type === "checkbox" ? e.checked : e.value) : ""; };
  function modalErr(msg) { const e = $("#modalErr"); if (e) { e.textContent = msg; e.hidden = false; } return false; }
  function confirmBox(title, text, okLabel, fn) { openModal({ title, text, ok: okLabel, danger: true, focus: false, onOk: fn }); }


  /* =====================================================================
     7. LOGIN
     ===================================================================== */
  let pin = "";
  function loginView() {
    const b = S().biz;
    const dots = [0, 1, 2, 3].map((i) => '<i class="' + (i < pin.length ? "on" : "") + '"></i>').join("");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => '<button type="button" data-act="pin" data-k="' + k + '">' + k + "</button>").join("");
    return '<div class="login"><div class="login-card"><div class="login-head"><div class="logo">MTP</div><h1>' + h(b.name) + '</h1><div class="tag">' + h(b.tag) + "</div>" + (b.place || b.phone ? '<div class="loc">' + (b.place ? "📍 " + h(b.place) : "") + (b.phone ? " • 📞 " + h(b.phone) : "") + "</div>" : "") + "</div>" +
      '<div class="login-body"><h2>സുരക്ഷാ പിൻ നൽകുക</h2><p>അഡ്മിൻ അല്ലെങ്കിൽ സ്റ്റാഫ് പിൻ ടൈപ്പ് ചെയ്യുക</p><div class="dots" id="dots">' + dots + '</div><div class="pin-err" id="pinErr"></div>' +
      '<div class="pad">' + keys + '<button type="button" class="sec" data-act="pin-clear">CLEAR</button><button type="button" data-act="pin" data-k="0">0</button><button type="button" class="sec2" data-act="pin-back" aria-label="Backspace">' + ICON.delete + "</button></div>" +
      '<div class="sync-note"><span class="dot ' + statusText()[0] + '" id="syncDot"></span><span id="syncText">' + h(statusText()[1]) + '</span></div><button type="button" class="linkbtn" data-act="db-url">Firebase വിലാസം</button></div></div></div>';
  }
  function updateDots() { const d = $("#dots"); if (d) d.innerHTML = [0, 1, 2, 3].map((i) => '<i class="' + (i < pin.length ? "on" : "") + '"></i>').join(""); }
  function pinMsg(msg) { const e = $("#pinErr"); if (e) e.textContent = msg || ""; }

  async function verifyPin() {
    const entered = pin, now = Date.now();
    if (state.lock.until > now) { pin = ""; updateDots(); pinMsg("കുറച്ച് സമയത്തിന് ശേഷം ശ്രമിക്കുക (" + Math.ceil((state.lock.until - now) / 1000) + " സെക്കൻഡ്)"); return; }
    if (!state.lastSync && online()) { pinMsg("പരിശോധിക്കുന്നു…"); try { await withTimeout(sync(true), 8000); } catch (e) { /* use local */ } pinMsg(""); }
    const hs = pinHash(entered);
    let sess = null;
    if (hs === S().adminHash) sess = { role: "admin", name: "അഡ്മിൻ", canProfit: true };
    else { const st = live("staff").find((x) => x.pinHash === hs); if (st) sess = { role: "staff", name: st.name, code: st.id, canProfit: !!st.canProfit }; }
    if (sess) {
      state.lock = { n: 0, until: 0 }; persist();
      pin = ""; session = sess; ui.mode = "purchase"; ui.pane = "entry";
      autoBackupCheck(); render(); toast("സ്വാഗതം " + sess.name); sync(false);
      return;
    }
    state.lock.n++;
    if (state.lock.n >= CFG.MAX_TRIES) { state.lock = { n: 0, until: Date.now() + CFG.LOCK_MS }; pinMsg("5 തവണ തെറ്റി. 30 സെക്കൻഡ് കാത്തിരിക്കുക."); }
    else pinMsg("തെറ്റായ പിൻ! (" + (CFG.MAX_TRIES - state.lock.n) + " ശ്രമങ്ങൾ ബാക്കി)");
    persist(); pin = ""; updateDots();
    const d = $("#dots"); if (d) { d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake"); }
  }
  function logout() { session = null; pin = ""; modal = null; renderModal(); render(); }

  /* =====================================================================
     8. SHELL
     ===================================================================== */
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const paneList = () => {
    const pm = ui.mode === "purchase";
    const l = [["entry", pm ? "പർച്ചേസ്" : "സെയിൽസ്", pm ? "cart" : "receipt"], ["parties", pm ? "സപ്ലയർമാർ" : "കടകൾ", pm ? "truck" : "store"], ["reports", "റിപ്പോർട്ട്", "chart"], ["admin", isAdmin() ? "അഡ്മിൻ" : "ബാക്കപ്പ്", "shield"]];
    return l;
  };
  function render() {
    const root = $("#root");
    if (!session) { root.innerHTML = loginView(); return; }
    const b = S().biz, st = statusText(), pm = ui.mode === "purchase";
    const panes = paneList();
    if (!panes.some((p) => p[0] === ui.pane)) ui.pane = "entry";
    root.innerHTML =
      '<div class="app ' + (pm ? "m-p" : "m-s") + '"><header class="header"><div class="header-in"><div class="brand"><div class="logo">MTP</div><div style="min-width:0"><b>' + h(b.name) + '<span class="role ' + (isAdmin() ? "" : "staff") + '">' + (isAdmin() ? "ADMIN" : "STAFF") + "</span></b><small>" + h(session.name) + (b.place ? " • " + h(b.place) : "") + "</small></div></div>" +
      '<div class="hbtns"><button type="button" class="hb" data-act="theme" aria-label="Theme">' + (state.theme === "dark" ? ICON.sun : ICON.moon) + '</button><button type="button" class="hb" data-act="install" id="btnInstall">' + ICON.phone2 + '</button><button type="button" class="hb red" data-act="logout">' + ICON.lock + "<span>ലോക്ക്</span></button></div></div>" +
      '<div class="statusbar"><span class="dot ' + st[0] + '" id="syncDot"></span><span id="syncText">' + h(st[1]) + "</span></div>" +
      '</header>' + modesHtml() +
      '<main class="main" id="app">' + paneHtml() + '</main><nav class="dock">' + panes.map((p) => '<button type="button" data-act="pane" data-p="' + p[0] + '" class="' + (ui.pane === p[0] ? "on" : "") + '">' + ICON[p[2]] + "<span>" + p[1] + "</span></button>").join("") + "</nav></div>";
    postRender();
    const inst = $("#btnInstall"); if (inst) inst.hidden = isStandalone();
  }
  function paneHtml() {
    if (ui.pane === "parties") return ui.mode === "purchase" ? suppliersView() : shopsView();
    if (ui.pane === "reports") return reportsView();
    if (ui.pane === "admin") return adminView();
    return ui.mode === "purchase" ? purchaseView() : salesView();
  }
  function postRender() {
    if (ui.pane !== "entry") return;
    if (ui.mode === "purchase") initPurchaseForm(); else initSalesForm();
  }
  function softRefresh() {
    if (!session || modal) return;
    const a = document.activeElement;
    const typing = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $("#app") && $("#app").contains(a);
    if (ui.pane === "entry") { const el = $("#liveList"); if (el) el.innerHTML = ui.mode === "purchase" ? purchaseListInner() : salesListInner(); const m = $(".modes"); if (m) m.outerHTML = modesHtml(); return; }
    if (typing) return;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }
  function modesHtml() {
    const pm = ui.mode === "purchase";
    return '<div class="modes"><button type="button" data-act="mode" data-m="purchase" class="mp ' + (pm ? "on" : "") + '">' + ICON.cart + '<span>വാങ്ങൽ</span><b>' + money(totalPayable()) + ' കൊടുക്കാൻ</b></button><button type="button" data-act="mode" data-m="sales" class="ms ' + (!pm ? "on" : "") + '">' + ICON.receipt + '<span>വിതരണം</span><b>' + money(totalCredit()) + ' കിട്ടാൻ</b></button></div>';
  }

  const emptyBox = (t) => '<div class="empty">' + h(t) + "</div>";
  const opt = (v, label, sel, extra) => '<option value="' + h(v) + '"' + (sel ? " selected" : "") + (extra || "") + ">" + h(label) + "</option>";
  const supplierOptions = (sel) => live("suppliers").sort(byName).map((s) => opt(s.id, s.name + (s.place ? " (" + s.place + ")" : ""), s.id === sel)).join("");
  const shopOptions = (sel) => live("shops").sort(byName).map((s) => opt(s.id, s.name + (s.place ? " (" + s.place + ")" : ""), s.id === sel)).join("");
  const unitOptions = (sel) => UNITS.map((u) => opt(u, u, u === sel)).join("");
  const monthIn = (id, val) => '<label class="f">മാസം<input class="in sm" type="month" data-ui="' + id + '" value="' + h(val) + '"></label>';
  const phoneBtns = (p) => (p ? '<a class="ib" href="tel:' + h(p) + '" aria-label="Call">' + ICON.phone + "</a>" : "");

  /* ---------- PURCHASE entry ---------- */
  function purchaseView() {
    const e = ui.editPurchase ? state.data.purchases[ui.editPurchase] : null;
    return '<section class="card stack"><div class="row between"><h2>' + (e ? "പർച്ചേസ് എഡിറ്റ്" : "പുതിയ പർച്ചേസ്") + '</h2>' + (e ? '<button type="button" class="btn sm ghost" data-act="cancel-purchase">റദ്ദാക്കുക</button>' : "") + "</div>" +
      '<div class="g2"><label class="f">തീയതി<input id="p_date" type="date" class="in" value="' + h(e ? e.date : todayIso()) + '"></label><label class="f">വിഭാഗം<select id="p_cat" class="sel">' + CATEGORIES.map((c) => opt(c, c, e && e.category === c)).join("") + "</select></label></div>" +
      '<label class="f">സപ്ലയർ<div class="row"><select id="p_sup" class="sel grow" data-ch="p-sup"><option value="">— തിരഞ്ഞെടുക്കുക —</option>' + supplierOptions(e && e.supplierId) + '</select><button type="button" class="btn sm" data-act="add-supplier">' + ICON.plus + '</button></div></label><div class="muted" id="p_supinfo"></div>' +
      '<label class="f">ഇനം / വിവരം<input id="p_item" class="in" placeholder="ഉദാ: കാട്ടുതേൻ" value="' + h(e ? e.item : "") + '"></label>' +
      '<div class="g3"><label class="f">അളവ്<input id="p_qty" class="in calc-p" type="number" step="any" inputmode="decimal" value="' + h(e ? e.qty : "") + '"></label><label class="f">യൂണിറ്റ്<select id="p_unit" class="sel">' + unitOptions(e ? e.unit : "kg") + '</select></label><label class="f">നിരക്ക് ₹<input id="p_rate" class="in calc-p" type="number" step="any" inputmode="decimal" value="' + h(e ? e.rate : "") + '"></label></div>' +
      '<div class="g2"><label class="f">ആകെ തുക ₹<input id="p_total" class="in calc-p" type="number" step="any" inputmode="decimal" value="' + h(e ? e.total : "") + '"></label><label class="f">കൊടുത്തത് ₹<input id="p_paid" class="in" type="number" step="any" inputmode="decimal" placeholder="ഒഴിച്ചിട്ടാൽ മുഴുവൻ" value="' + (e ? h(e.paid) : "") + '"></label></div>' +
      '<label class="f">കുറിപ്പ്<input id="p_note" class="in" value="' + h(e ? e.note : "") + '"></label><button type="button" class="btn block lg" data-act="save-purchase">' + ICON.check + (e ? "അപ്ഡേറ്റ് ചെയ്യുക" : "സേവ് ചെയ്യുക") + "</button></section>" +
      '<section class="card"><div class="row between wrap pad-s"><h2>എൻട്രികൾ</h2><div class="row wrap">' + monthIn("pMonth", ui.pMonth) + '<label class="f">തിരയുക<input class="in sm" data-ui="pSearch" value="' + h(ui.pSearch) + '" placeholder="പേര് / ഇനം"></label></div></div><div class="list" id="liveList">' + purchaseListInner() + "</div></section>";
  }
  function purchaseListInner() {
    const q = norm(ui.pSearch);
    const arr = live("purchases").filter((p) => (p.date || "").startsWith(ui.pMonth) && (!q || norm(p.supplierName + " " + (p.item || "") + " " + (p.category || "")).includes(q))).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt) || b.updatedAt - a.updatedAt);
    if (!arr.length) return emptyBox("ഈ മാസം എൻട്രികൾ ഇല്ല");
    const tot = sumBy(arr, (p) => p.total);
    return '<div class="sumrow"><span>ആകെ ' + arr.length + ' എൻട്രികൾ</span><b>' + money(tot) + "</b></div>" + arr.map((p) => {
      const due = r2(num(p.total) - num(p.paid)), pay = p.kind === "payment";
      return '<div class="li wrapli"><div class="grow"><div class="t">' + h(p.supplierName) + (pay ? ' <span class="chip blue">പേയ്‌മെന്റ്</span>' : "") + '</div><div class="s">' + h(fmtDay(p.date)) + " • " + (pay ? h(p.note || "പണം നൽകി") : h(p.item) + " • " + kgFmt(p.qty) + " " + h(p.unit) + " × ₹" + kgFmt(p.rate)) + "</div>" + (!pay ? '<div class="s">' + h((p.category || "").split(" (")[0]) + "</div>" : "") + "</div>" +
        '<div class="right"><div class="amt">' + money(pay ? p.paid : p.total) + "</div>" + (!pay ? (due > 0 ? '<span class="chip rose">ബാക്കി ' + money(due) + "</span>" : '<span class="chip">Paid</span>') : "") + "</div>" +
        '<div class="acts-row row">' + (!pay ? '<button type="button" class="btn sm ghost" data-act="edit-purchase" data-id="' + h(p.id) + '">' + ICON.edit + "</button>" : "") + (isAdmin() ? '<button type="button" class="btn sm ghost red" data-act="del-purchase" data-id="' + h(p.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>";
    }).join("");
  }
  function initPurchaseForm() { purchaseSupInfo(); }
  function calcPurchase(src) {
    const q = num($("#p_qty").value), r = num($("#p_rate").value);
    if (src !== "p_total") { const t = $("#p_total"); if (q > 0 && r > 0) t.value = r2(q * r); }
    else if (q > 0) { $("#p_rate").value = r2(num($("#p_total").value) / q); }
  }
  function purchaseSupInfo() { const s = byId("suppliers", $("#p_sup") && $("#p_sup").value), el = $("#p_supinfo"); if (el) el.textContent = s ? (s.phone ? "📞 " + s.phone + "  " : "") + (s.place ? "📍 " + s.place + "  " : "") + "• കൊടുക്കാനുള്ളത്: " + money(supplierSummary(s.id).balance) : ""; }

  /* ---------- SALES entry ---------- */
  function rowHtml(it) {
    const prods = sortedProducts();
    it = it || { productId: prods[0] ? prods[0].id : "", qty: "", rate: prods[0] ? prods[0].price : "" };
    return '<div class="srow"><select class="sel r-prod" data-ch="row-prod">' + prods.map((p) => opt(p.id, p.name + " (" + p.unit + ")", p.id === it.productId, ' data-price="' + h(p.price) + '"')).join("") + '</select><div class="g3 tight"><label class="f">അളവ്<input class="in r-qty calc-s" type="number" step="any" inputmode="decimal" value="' + h(it.qty) + '"></label><label class="f">നിരക്ക്<input class="in r-rate calc-s" type="number" step="any" inputmode="decimal" value="' + h(it.rate) + '"></label><div class="f">തുക<div class="amtbox r-amt">₹0</div></div></div><button type="button" class="rm" data-act="rm-row" aria-label="Remove">' + ICON.x + "</button></div>";
  }
  function salesView() {
    const e = ui.editSale ? state.data.sales[ui.editSale] : null;
    return '<section class="card stack"><div class="row between"><h2>' + (e ? "ബിൽ എഡിറ്റ് " + h(e.billNo) : "പുതിയ ബിൽ / വിതരണം") + '</h2>' + (e ? '<button type="button" class="btn sm ghost" data-act="cancel-sale">റദ്ദാക്കുക</button>' : "") + "</div>" +
      '<div class="g2"><label class="f">തീയതി<input id="s_date" type="date" class="in" value="' + h(e ? e.date : todayIso()) + '"></label><label class="f">ബിൽ നമ്പർ<input id="s_bill" class="in mono" readonly value="' + h(e ? e.billNo : nextBillNo()) + '"></label></div>' +
      '<label class="f">കട<div class="row"><select id="s_shop" class="sel grow" data-ch="s-shop"><option value="">— തിരഞ്ഞെടുക്കുക —</option>' + shopOptions(e && e.shopId) + '</select><button type="button" class="btn sm" data-act="add-shop">' + ICON.plus + '</button></div></label><div class="muted" id="s_shopinfo"></div>' +
      '<div id="s_rows" class="stack"></div><button type="button" class="btn ghost block" data-act="add-row">' + ICON.plus + 'ഇനം ചേർക്കുക</button>' +
      '<div class="totbox"><span>ആകെ ബിൽ</span><b id="s_total">₹0</b></div>' +
      '<div class="g2"><label class="f">ലഭിച്ചത് ₹<input id="s_paid" class="in" type="number" step="any" inputmode="decimal" placeholder="ഒഴിച്ചിട്ടാൽ മുഴുവൻ" value="' + (e ? h(e.paid) : "") + '"></label><div class="f">ഈ ബില്ലിലെ കടം<div class="amtbox" id="s_credit">₹0</div></div></div>' +
      '<label class="f">കുറിപ്പ്<input id="s_note" class="in" value="' + h(e ? e.note : "") + '"></label><button type="button" class="btn block lg blue" data-act="save-sale">' + ICON.check + (e ? "അപ്ഡേറ്റ് ചെയ്യുക" : "ബിൽ സേവ് ചെയ്യുക") + "</button></section>" +
      '<section class="card"><div class="row between wrap pad-s"><h2>ബില്ലുകൾ</h2><div class="row wrap">' + monthIn("sMonth", ui.sMonth) + '<label class="f">തിരയുക<input class="in sm" data-ui="sSearch" value="' + h(ui.sSearch) + '" placeholder="കട / ബിൽ നമ്പർ"></label></div></div><div class="list" id="liveList">' + salesListInner() + "</div></section>";
  }
  function initSalesForm() {
    const e = ui.editSale ? state.data.sales[ui.editSale] : null;
    const box = $("#s_rows"); if (!box) return;
    if (!sortedProducts().length) { box.innerHTML = emptyBox("ആദ്യം അഡ്മിൻ ടാബിൽ ഉൽപ്പന്നങ്ങൾ ചേർക്കുക"); return; }
    box.innerHTML = e && e.items && e.items.length ? e.items.map((i) => rowHtml({ productId: i.productId, qty: i.qty, rate: i.rate })).join("") : rowHtml();
    recalcSale(); salesShopInfo();
  }
  function recalcSale() {
    let t = 0;
    $$("#s_rows .srow").forEach((r) => { const a = r2(num($(".r-qty", r).value) * num($(".r-rate", r).value)); $(".r-amt", r).textContent = money(a); t += a; });
    t = r2(t); const tt = $("#s_total"); if (tt) tt.textContent = money(t);
    const raw = $("#s_paid") ? $("#s_paid").value : ""; const paid = raw === "" ? t : num(raw);
    const c = $("#s_credit"); if (c) c.textContent = money(Math.max(0, r2(t - paid)));
  }
  function salesShopInfo() { const s = byId("shops", $("#s_shop") && $("#s_shop").value), el = $("#s_shopinfo"); if (el) el.textContent = s ? (s.phone ? "📞 " + s.phone + "  " : "") + (s.place ? "📍 " + s.place + "  " : "") + "• ബാക്കി കടം: " + money(shopSummary(s.id).balance) : ""; }
  function salesListInner() {
    const q = norm(ui.sSearch);
    const arr = live("sales").filter((s) => (s.date || "").startsWith(ui.sMonth) && (!q || norm(s.shopName + " " + (s.billNo || "")).includes(q))).sort((a, b) => (b.date + (b.billNo || "")).localeCompare(a.date + (a.billNo || "")) || b.updatedAt - a.updatedAt);
    if (!arr.length) return emptyBox("ഈ മാസം ബില്ലുകൾ ഇല്ല");
    return '<div class="sumrow"><span>വിൽപ്പന</span><b>' + money(sumBy(arr.filter((s) => s.kind === "sale"), (s) => s.total)) + "</b></div>" + arr.map((s) => {
      const col = s.kind === "collect", cr = r2(num(s.total) - num(s.paid));
      return '<div class="li wrapli"><div class="grow"><div class="t">' + h(s.shopName) + (col ? ' <span class="chip blue">പണം വരവ്</span>' : "") + '</div><div class="s">' + (col ? "" : '<span class="mono">' + h(s.billNo) + "</span> • ") + h(fmtDay(s.date)) + (col ? " • " + h(s.note || "") : " • " + (s.items || []).length + " ഇനം") + '</div></div><div class="right"><div class="amt">' + money(col ? s.paid : s.total) + "</div>" + (!col ? (cr > 0 ? '<span class="chip rose">കടം ' + money(cr) + "</span>" : '<span class="chip">Paid</span>') : "") + "</div>" +
        '<div class="acts-row row">' + (!col ? '<button type="button" class="btn sm ghost" data-act="view-bill" data-id="' + h(s.id) + '">' + ICON.file + '</button><button type="button" class="btn sm ghost" data-act="edit-sale" data-id="' + h(s.id) + '">' + ICON.edit + "</button>" : "") + (isAdmin() ? '<button type="button" class="btn sm ghost red" data-act="del-sale" data-id="' + h(s.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>";
    }).join("");
  }

  /* ---------- Suppliers & Shops ---------- */
  function suppliersView() {
    const arr = live("suppliers").sort(byName);
    return '<section class="card"><div class="row between pad-s"><div><h2>സപ്ലയർമാർ</h2><div class="muted">കൊടുക്കാനുള്ളത്: <b class="neg">' + money(totalPayable()) + '</b></div></div><button type="button" class="btn" data-act="add-supplier">' + ICON.plus + 'പുതിയ</button></div><div class="list">' + (arr.length ? arr.map((s) => {
      const m = supplierSummary(s.id);
      return '<div class="li wrapli"><div class="av">' + h(initial(s.name)) + '</div><div class="grow"><div class="t">' + h(s.name) + '</div><div class="s">' + h(s.place || "") + (s.phone ? " • " + h(s.phone) : "") + '</div></div><div class="right"><div class="amt ' + (m.balance > 0 ? "neg" : "pos") + '">' + money(m.balance) + '</div><div class="s">ആകെ ' + money(m.billed) + '</div></div><div class="acts-row row">' + phoneBtns(s.phone) +
        '<button type="button" class="btn sm" data-act="pay-supplier" data-id="' + h(s.id) + '">' + ICON.rupee + 'പണം നൽകുക</button><button type="button" class="btn sm ghost" data-act="stmt-supplier" data-id="' + h(s.id) + '">' + ICON.list + '</button><button type="button" class="btn sm ghost" data-act="edit-supplier" data-id="' + h(s.id) + '">' + ICON.edit + "</button>" + (isAdmin() ? '<button type="button" class="btn sm ghost red" data-act="del-supplier" data-id="' + h(s.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>";
    }).join("") : emptyBox("സപ്ലയർമാരെ ചേർക്കുക")) + "</div></section>";
  }
  function shopsView() {
    const arr = live("shops").sort(byName);
    const over = arr.filter(isOverdue);
    return (over.length ? '<div class="banner red">⏰ ' + over.length + ' കടകളിൽ നിന്ന് പണം ലഭിക്കാൻ വൈകി: ' + over.map((s) => h(s.name)).join(", ") + "</div>" : "") +
      '<section class="card"><div class="row between pad-s"><div><h2>കടകൾ</h2><div class="muted">കിട്ടാനുള്ളത്: <b class="blue">' + money(totalCredit()) + '</b></div></div><button type="button" class="btn blue" data-act="add-shop">' + ICON.plus + 'പുതിയ</button></div><div class="list">' + (arr.length ? arr.map((s) => {
        const m = shopSummary(s.id), od = isOverdue(s);
        return '<div class="li wrapli"><div class="av b">' + h(initial(s.name)) + '</div><div class="grow"><div class="t">' + h(s.name) + (od ? ' <span class="chip rose">വൈകി</span>' : "") + '</div><div class="s">' + h(s.place || "") + (s.phone ? " • " + h(s.phone) : "") + (s.dueDate ? " • അവധി " + h(fmtDate(s.dueDate)) : "") + '</div></div><div class="right"><div class="amt ' + (m.balance > 0 ? "neg" : "pos") + '">' + money(m.balance) + '</div><div class="s">ആകെ ' + money(m.billed) + '</div></div><div class="acts-row row">' + phoneBtns(s.phone) +
          '<button type="button" class="btn sm blue" data-act="collect-shop" data-id="' + h(s.id) + '">' + ICON.rupee + 'പണം വരവ്</button>' + (m.balance > 0 ? '<button type="button" class="btn sm ghost" data-act="remind-shop" data-id="' + h(s.id) + '">' + ICON.bell + "</button>" : "") + '<button type="button" class="btn sm ghost" data-act="stmt-shop" data-id="' + h(s.id) + '">' + ICON.list + '</button><button type="button" class="btn sm ghost" data-act="edit-shop" data-id="' + h(s.id) + '">' + ICON.edit + "</button>" + (isAdmin() ? '<button type="button" class="btn sm ghost red" data-act="del-shop" data-id="' + h(s.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>";
      }).join("") : emptyBox("കടകളെ ചേർക്കുക")) + "</div></section>";
  }

  /* ---------- Reports ---------- */
  function reportsView() {
    const m = ui.rMonth || monthNow(), d = reportData(m), cp = canProfit();
    const tiles = '<div class="tiles"><div class="tile hero"><div class="lbl">വിൽപ്പന</div><div class="val">' + money(d.sales) + '</div><div class="sub">ലഭിച്ചത് ' + money(d.received) + '</div></div>' + '<div class="tile blue"><div class="lbl">പർച്ചേസ്</div><div class="val">' + money(d.purchase) + '</div><div class="sub">നൽകിയത് ' + money(d.paidOut) + "</div></div>" +
      '<div class="tile rose"><div class="lbl">കിട്ടാനുള്ളത്</div><div class="val">' + money(totalCredit()) + '</div><div class="sub">' + d.shopsDue.length + ' കടകൾ</div></div><div class="tile amber"><div class="lbl">കൊടുക്കാനുള്ളത്</div><div class="val">' + money(totalPayable()) + '</div><div class="sub">' + d.suppliersDue.length + " സപ്ലയർ</div></div></div>";
    return '<section class="card stack"><div class="row between wrap"><h2>റിപ്പോർട്ട്</h2>' + monthIn("rMonth", m) + "</div>" + tiles +
      (cp ? '<div class="banner ' + (d.sales - d.purchase >= 0 ? "green" : "red") + '">ലാഭം (വിൽപ്പന − പർച്ചേസ്): <b>' + money(d.sales - d.purchase) + "</b></div>" : "") +
      '<div class="row wrap"><button type="button" class="btn" data-act="report-pdf">' + ICON.file + 'PDF</button><button type="button" class="btn ghost" data-act="report-wa">' + ICON.msg + "WhatsApp</button></div></section>" +
      '<section class="card"><h2 class="pad-s">ഉൽപ്പന്നം തിരിച്ചുള്ള വിൽപ്പന</h2><div class="list">' + (d.sold.length ? d.sold.map((x, i) => '<div class="li"><div class="rank">' + (i + 1) + '</div><div class="grow"><div class="t">' + h(x.name) + '</div><div class="s">' + kgFmt(x.qty) + '</div></div><div class="amt">' + money(x.amount) + "</div></div>").join("") : emptyBox("വിൽപ്പന ഇല്ല")) + "</div></section>" +
      '<section class="card"><h2 class="pad-s">കിട്ടാനുള്ള കടകൾ</h2><div class="list">' + (d.shopsDue.length ? d.shopsDue.map((x) => '<div class="li"><div class="grow"><div class="t">' + h(x.s.name) + '</div><div class="s">' + h(x.s.place || "") + '</div></div><div class="amt neg">' + money(x.b) + "</div></div>").join("") : emptyBox("ബാക്കി ഇല്ല 🎉")) + "</div></section>" +
      '<section class="card"><h2 class="pad-s">കൊടുക്കാനുള്ള സപ്ലയർമാർ</h2><div class="list">' + (d.suppliersDue.length ? d.suppliersDue.map((x) => '<div class="li"><div class="grow"><div class="t">' + h(x.s.name) + '</div><div class="s">' + h(x.s.place || "") + '</div></div><div class="amt neg">' + money(x.b) + "</div></div>").join("") : emptyBox("ബാക്കി ഇല്ല 🎉")) + "</div></section>";
  }

  /* ---------- Admin ---------- */
  let snapCache = [];
  async function getSnapshots() { try { return (await withTimeout(idbGet("snapshots"), 3000)) || []; } catch (e) { return []; } }
  function adminView() {
    const s = S(); let o = "";
    if (isAdmin()) {
      o += (s.adminHash === pinHash("1234") ? '<div class="banner red">⚠️ ഡിഫോൾട്ട് പിൻ (1234) ഇപ്പോഴും ഉപയോഗത്തിലുണ്ട്. ഉടൻ മാറ്റുക.</div>' : "") +
        '<div class="cols2"><section class="card stack"><h2>അഡ്മിൻ പിൻ</h2><label class="f">പുതിയ പിൻ (4 അക്കം)<input id="a_pin" class="in" inputmode="numeric" maxlength="4" autocomplete="off"></label><button type="button" class="btn" data-act="save-pin">പിൻ മാറ്റുക</button></section>' +
        '<section class="card stack"><h2>സ്ഥാപന വിവരങ്ങൾ</h2><label class="f">പേര്<input id="b_name" class="in" value="' + h(s.biz.name) + '"></label><label class="f">ടാഗ്‌ലൈൻ<input id="b_tag" class="in" value="' + h(s.biz.tag) + '"></label><div class="g2"><label class="f">സ്ഥലം<input id="b_place" class="in" value="' + h(s.biz.place) + '"></label><label class="f">ഫോൺ<input id="b_phone" class="in" inputmode="tel" value="' + h(s.biz.phone) + '"></label></div><button type="button" class="btn" data-act="save-biz">സേവ്</button></section></div>' +
        '<section class="card"><div class="row between pad-s"><div><h2>ഉൽപ്പന്നങ്ങളും വിലയും</h2><div class="muted">വിതരണ ബില്ലിൽ ഉപയോഗിക്കുന്നവ</div></div><button type="button" class="btn" data-act="add-product">' + ICON.plus + 'പുതിയ</button></div><div class="list">' + (sortedProducts().length ? sortedProducts().map((p) => '<div class="li"><div class="grow"><div class="t">' + h(p.name) + '</div><div class="s">' + h(p.unit) + '</div></div><div class="amt">' + money(p.price) + '</div><button type="button" class="btn sm ghost" data-act="edit-product" data-id="' + h(p.id) + '">' + ICON.edit + '</button><button type="button" class="btn sm ghost red" data-act="del-product" data-id="' + h(p.id) + '">' + ICON.trash + "</button></div>").join("") : emptyBox("ഉൽപ്പന്നങ്ങൾ ഇല്ല")) + "</div></section>" +
        '<section class="card"><div class="row between pad-s"><div><h2>സ്റ്റാഫ്</h2><div class="muted">ഓരോരുത്തർക്കും സ്വന്തം 4 അക്ക പിൻ</div></div><button type="button" class="btn" data-act="add-staff">' + ICON.plus + 'പുതിയ</button></div><div class="list">' + (live("staff").length ? live("staff").sort(byName).map((p) => '<div class="li"><div class="av">' + h(initial(p.name)) + '</div><div class="grow"><div class="t">' + h(p.name) + '</div><div class="s">' + (p.canProfit ? "ലാഭം കാണാം" : "ലാഭം മറച്ചത്") + '</div></div><button type="button" class="btn sm ghost" data-act="edit-staff" data-id="' + h(p.id) + '">' + ICON.edit + '</button><button type="button" class="btn sm ghost red" data-act="del-staff" data-id="' + h(p.id) + '">' + ICON.trash + "</button></div>").join("") : emptyBox("സ്റ്റാഫ് ഇല്ല")) + "</div></section>";
    }
    o += '<section class="card stack"><h2>ബാക്കപ്പ് & സിങ്ക്</h2><div class="banner green" id="syncBanner">' + h(statusText()[1]) + (state.lastSync ? " • അവസാന സിങ്ക്: " + new Date(state.lastSync).toLocaleString("en-IN") : "") + '</div><div class="muted">ഡാറ്റ ബേസ്: ' + h(dbBase()) + '</div><div class="row wrap"><button type="button" class="btn" data-act="sync-now">' + ICON.refresh + 'സിങ്ക്</button><button type="button" class="btn ghost" data-act="snapshot">ഫോൺ ബാക്കപ്പ്</button><button type="button" class="btn ghost" data-act="export">' + ICON.download + 'JSON</button>' +
      (isAdmin() ? '<label class="btn ghost" style="cursor:pointer">' + ICON.upload + 'റീസ്റ്റോർ<input type="file" accept=".json,application/json" data-ch="restore-file" hidden></label><button type="button" class="btn ghost" data-act="db-url">Firebase വിലാസം</button>' : "") + '</div><div id="snapList" class="stack"><div class="muted">ലോഡ് ചെയ്യുന്നു…</div></div></section>';
    getSnapshots().then((arr) => { snapCache = arr; const el = $("#snapList"); if (el) el.innerHTML = arr.length ? arr.map((b) => '<div class="li" style="border:1px solid var(--line);border-radius:13px"><div class="grow"><div class="t">' + h(b.label) + '</div><div class="s">' + h(b.ts) + "</div></div>" + (isAdmin() ? '<button type="button" class="btn sm ghost" data-act="restore-snap" data-id="' + h(b.id) + '">Restore</button>' : "") + "</div>").join("") : '<div class="muted">ഫോൺ ബാക്കപ്പുകൾ ഇല്ല</div>'; });
    return o;
  }

  /* --- canvas → JPEG → minimal PDF (works offline; browser shapes Malayalam correctly) --- */
  const PW = 1240, PH = 1754, MX = 80, TOP = 200, BOT = 110;
  const FONT = '"Noto Sans Malayalam","Noto Sans","Manjari","Meera","Nirmala UI","Kartika",system-ui,sans-serif';
  const fit = (ctx, str, maxW) => { if (ctx.measureText(str).width <= maxW) return str; const g = segs(str); while (g.length > 1 && ctx.measureText(g.join("") + "…").width > maxW) g.pop(); return g.join("") + "…"; };
  const rrect = (ctx, x, y, w, hh, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  class PdfDoc {
    constructor(title, subtitle) { this.title = title; this.subtitle = subtitle; this.pages = []; this.newPage(); }
    newPage() {
      const c = document.createElement("canvas"); c.width = PW; c.height = PH;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, PW, PH);
      const g = x.createLinearGradient(0, 0, PW, 0); g.addColorStop(0, "#1e3a8a"); g.addColorStop(1, "#1d4ed8");
      x.fillStyle = g; x.fillRect(0, 0, PW, 170);
      x.fillStyle = "#fbbf24"; x.fillRect(0, 170, PW, 8);
      this.c = c; this.x = x; this.pages.push(c);
      const b = S().biz;
      this.t(b.name + "  •  " + b.place + "  •  " + b.phone, MX, 40, { size: 22, weight: 600, color: "#bfdbfe", maxW: PW - 2 * MX });
      this.t(this.title, MX, 92, { size: 44, weight: 800, color: "#fff", maxW: PW - 2 * MX });
      this.t(this.subtitle, MX, 140, { size: 27, weight: 600, color: "#dbeafe", maxW: PW - 2 * MX });
      this.y = TOP;
    }
    t(str, x, y, o) {
      o = o || {}; const ctx = this.x;
      ctx.font = (o.weight || 500) + " " + (o.size || 26) + "px " + FONT; ctx.fillStyle = o.color || "#0f172a"; ctx.textAlign = o.align || "left"; ctx.textBaseline = "middle";
      let s = String(str); if (o.maxW) s = fit(ctx, s, o.maxW); ctx.fillText(s, x, y);
    }
    ensure(hh) { if (this.y + hh > PH - BOT) this.newPage(); }
    heading(text) { this.ensure(110); this.y += 10; this.x.fillStyle = "#059669"; rrect(this.x, MX, this.y, 10, 46, 5); this.x.fill(); this.t(text, MX + 28, this.y + 24, { size: 33, weight: 800, color: "#064e3b", maxW: PW - 2 * MX - 28 }); this.y += 70; }
    kpis(list) {
      const w = (PW - 2 * MX - 20 * (list.length - 1)) / list.length; this.ensure(170);
      list.forEach((k, i) => { const x0 = MX + i * (w + 20), x = this.x; x.fillStyle = k.bg || "#ecfdf5"; rrect(x, x0, this.y, w, 140, 22); x.fill(); this.t(k.label, x0 + 22, this.y + 38, { size: 21, weight: 700, color: "#475569", maxW: w - 40 }); this.t(k.value, x0 + 22, this.y + 94, { size: 38, weight: 800, color: k.color || "#047857", maxW: w - 40 }); });
      this.y += 170;
    }
    table(cols, rows, o) {
      o = o || {}; const RH = 60, total = PW - 2 * MX;
      const xOf = (c, cx, w) => (c.align === "right" ? cx + w - 18 : c.align === "center" ? cx + w / 2 : cx + 18);
      const head = () => { this.ensure(RH * 2); this.x.fillStyle = "#dbeafe"; rrect(this.x, MX, this.y, total, RH - 8, 14); this.x.fill(); let cx = MX; cols.forEach((c) => { const w = c.w * total; this.t(c.label, xOf(c, cx, w), this.y + (RH - 8) / 2, { size: 22, weight: 800, color: "#064e3b", align: c.align, maxW: w - 30 }); cx += w; }); this.y += RH; };
      head();
      rows.forEach((r, i) => {
        if (this.y + RH > PH - BOT) { this.newPage(); head(); }
        this.x.fillStyle = r.hot ? "#fef3c7" : i % 2 ? "#f8fafc" : "#fff"; this.x.fillRect(MX, this.y, total, RH);
        this.x.fillStyle = "#e2e8f0"; this.x.fillRect(MX, this.y + RH - 1, total, 1);
        let cx = MX; cols.forEach((c, ci) => { const w = c.w * total; this.t(r.cells[ci], xOf(c, cx, w), this.y + RH / 2, { size: 25, weight: c.bold || r.bold ? 800 : 500, align: c.align, maxW: w - 30, color: (r.colors && r.colors[ci]) || c.color || "#0f172a" }); cx += w; });
        this.y += RH;
      });
      this.y += 26;
    }
    kv(label, value, o) {
      o = o || {}; this.ensure(70);
      if (o.line) { this.x.fillStyle = "#064e3b"; this.x.fillRect(PW / 2, this.y, PW / 2 - MX, 3); this.y += 10; }
      this.t(label, PW / 2 + 10, this.y + 28, { size: o.size || 27, weight: o.bold ? 800 : 600, color: "#334155" });
      this.t(value, PW - MX, this.y + 28, { size: o.size || 27, weight: 800, color: o.color || "#0f172a", align: "right" });
      this.y += o.gap || 54;
    }
    finish() {
      const n = this.pages.length;
      this.pages.forEach((c, i) => { const x = c.getContext("2d"); x.fillStyle = "#e2e8f0"; x.fillRect(MX, PH - 84, PW - 2 * MX, 2); x.font = "500 22px " + FONT; x.fillStyle = "#64748b"; x.textBaseline = "middle"; x.textAlign = "left"; x.fillText("തയ്യാറാക്കിയത്: " + fmtDate(todayIso()), MX, PH - 50); x.textAlign = "right"; x.fillText("പേജ് " + (i + 1) + " / " + n, PW - MX, PH - 50); });
      return this.pages;
    }
  }
  async function ensureFonts() { try { if (document.fonts && document.fonts.load) { await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(w + ' 26px "Noto Sans Malayalam"', "മലയാളം 1234"))); await document.fonts.ready; } } catch (e) { /* fallback fonts */ } }
  function pdfFromCanvases(canvases) {
    const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
    const push = (d) => { const b = typeof d === "string" ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
    const obj = (n, fn) => { offs[n] = pos; push(n + " 0 obj\n"); fn(); push("endobj\n"); };
    const n = canvases.length, W = 595.28, H = 841.89;
    push("%PDF-1.4\n");
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>\n"));
    obj(2, () => push("<< /Type /Pages /Kids [" + canvases.map((_, i) => 3 + i * 3 + " 0 R").join(" ") + "] /Count " + n + " >>\n"));
    canvases.forEach((c, i) => {
      const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
      const bin = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]); const bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      obj(pg, () => push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>\n"));
      const content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
      obj(ct, () => push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\n"));
      obj(im, () => { push("<< /Type /XObject /Subtype /Image /Width " + c.width + " /Height " + c.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + bytes.length + " >>\nstream\n"); push(bytes); push("\nendstream\n"); });
    });
    const total = 3 + n * 3, xref = pos; let x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    push(x + "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    const out = new Uint8Array(pos); let o = 0; chunks.forEach((c) => { out.set(c, o); o += c.length; }); return out;
  }


  async function buildReportPdf(m) {
    await ensureFonts();
    const d = reportData(m), cp = canProfit();
    const doc = new PdfDoc("പ്രതിമാസ റിപ്പോർട്ട്", fmtMonth(m));
    doc.kpis([{ label: "വിൽപ്പന", value: money(d.sales) }, { label: "ലഭിച്ചത്", value: money(d.received), bg: "#eff6ff", color: "#1d4ed8" }, { label: "പർച്ചേസ്", value: money(d.purchase), bg: "#fffbeb", color: "#b45309" }]);
    const k2 = [{ label: "സപ്ലയർക്ക് നൽകിയത്", value: money(d.paidOut), bg: "#fffbeb", color: "#b45309" }, { label: "കിട്ടാനുള്ളത്", value: money(totalCredit()), bg: "#fff1f2", color: "#be123c" }, { label: "കൊടുക്കാനുള്ളത്", value: money(totalPayable()), bg: "#fff1f2", color: "#be123c" }];
    doc.kpis(k2);
    if (cp) doc.kv("ലാഭം (വിൽപ്പന − പർച്ചേസ്)", money(d.sales - d.purchase), { bold: true, color: d.sales - d.purchase >= 0 ? "#047857" : "#be123c" });
    doc.heading("ഉൽപ്പന്നം തിരിച്ചുള്ള വിൽപ്പന");
    doc.table([{ label: "ഉൽപ്പന്നം", w: 0.56 }, { label: "അളവ്", w: 0.18, align: "right" }, { label: "തുക", w: 0.26, align: "right", bold: true, color: "#047857" }],
      d.sold.length ? d.sold.map((r, i) => ({ hot: i === 0, cells: [r.name, kgFmt(r.qty), money(r.amount)] })) : [{ cells: ["വിൽപ്പന ഇല്ല", "", ""] }]);
    doc.heading("കിട്ടാനുള്ള കടകൾ");
    doc.table([{ label: "കട", w: 0.6 }, { label: "ബാക്കി", w: 0.4, align: "right", bold: true, color: "#be123c" }], d.shopsDue.length ? d.shopsDue.map((x) => ({ cells: [x.s.name, money(x.b)] })) : [{ cells: ["ബാക്കി ഇല്ല", ""] }]);
    doc.heading("കൊടുക്കാനുള്ള സപ്ലയർമാർ");
    doc.table([{ label: "സപ്ലയർ", w: 0.6 }, { label: "ബാക്കി", w: 0.4, align: "right", bold: true, color: "#be123c" }], d.suppliersDue.length ? d.suppliersDue.map((x) => ({ cells: [x.s.name, money(x.b)] })) : [{ cells: ["ബാക്കി ഇല്ല", ""] }]);
    return pdfFromCanvases(doc.finish());
  }
  async function buildBillPdf(inv) {
    await ensureFonts();
    const doc = new PdfDoc("ബിൽ " + inv.billNo, inv.shopName + "  •  " + fmtDate(inv.date) + (inv.shopPhone ? "  •  Ph: " + inv.shopPhone : ""));
    doc.table([{ label: "ഉൽപ്പന്നം", w: 0.42 }, { label: "അളവ്", w: 0.14, align: "center" }, { label: "നിരക്ക്", w: 0.18, align: "right" }, { label: "തുക", w: 0.26, align: "right", bold: true, color: "#047857" }],
      (inv.items || []).map((i) => ({ cells: [i.name, kgFmt(i.qty) + " " + i.unit, num(i.rate).toFixed(2), num(i.amount).toFixed(2)] })));
    doc.kv("ആകെ ബിൽ", money(inv.total), { bold: true, size: 34, line: true, gap: 66 });
    doc.kv("ലഭിച്ചത്", money(inv.paid), { color: "#047857" });
    doc.kv("ഈ ബില്ലിലെ കടം", money(r2(inv.total - inv.paid)), { color: inv.total - inv.paid > 0 ? "#be123c" : "#0f172a" });
    doc.kv("കടയുടെ ആകെ ബാക്കി", money(shopSummary(inv.shopId).balance), { bold: true, color: "#be123c", line: true });
    return pdfFromCanvases(doc.finish());
  }

  /* =====================================================================
     11. FORMS & ACTIONS
     ===================================================================== */
  function partyModal(kind, rec) {
    const isShop = kind === "shop", col = isShop ? "shops" : "suppliers";
    openModal({
      title: (rec ? "എഡിറ്റ്: " : "പുതിയ ") + (isShop ? "കട" : "സപ്ലയർ"),
      body: '<label class="f">പേര്<input id="mf_name" class="in" value="' + h(rec ? rec.name : "") + '"></label><label class="f">ഫോൺ<input id="mf_phone" class="in" inputmode="tel" value="' + h(rec ? rec.phone : "") + '"></label><label class="f">സ്ഥലം<input id="mf_place" class="in" value="' + h(rec ? rec.place : "") + '"></label>' +
        '<label class="f">' + (isShop ? "പഴയ കടം (കിട്ടാനുള്ളത്) ₹" : "പഴയ ബാക്കി (കൊടുക്കാനുള്ളത്) ₹") + '<input id="mf_open" class="in" type="number" step="any" inputmode="decimal" value="' + (rec ? num(isShop ? rec.openingCredit : rec.openingPayable) : 0) + "\"></label>" +
        (isShop ? '<label class="f">പണം തരേണ്ട തീയതി (ഓപ്ഷണൽ)<input id="mf_due" class="in" type="date" value="' + h(rec && rec.dueDate ? rec.dueDate : "") + '"></label>' : ""),
      onOk() {
        const name = clean(mv("name")); if (!name) return modalErr("പേര് നൽകുക.");
        if (live(col).some((x) => x.id !== (rec && rec.id) && norm(x.name) === norm(name))) return modalErr("ഈ പേര് നിലവിലുണ്ട്.");
        const r = Object.assign(rec ? {} : { id: uid(isShop ? "sh" : "su"), deleted: false, createdAt: Date.now() }, rec || {}, { name, phone: clean(mv("phone")), place: clean(mv("place")) });
        if (isShop) { r.openingCredit = r2(num(mv("open"))); r.dueDate = mv("due") || ""; } else r.openingPayable = r2(num(mv("open")));
        save(col, r);
        if (rec) (isShop ? live("sales") : live("purchases")).forEach((x) => { const k = isShop ? "shopId" : "supplierId", nk = isShop ? "shopName" : "supplierName"; if (x[k] === r.id && (x[nk] !== r.name || x.shopPhone !== r.phone)) { x[nk] = r.name; if (isShop) x.shopPhone = r.phone; save(isShop ? "sales" : "purchases", x); } });
        toast("✅ സേവ് ചെയ്തു"); render();
        const sel = $(isShop ? "#s_shop" : "#p_sup"); if (sel && !rec) { sel.value = r.id; isShop ? salesShopInfo() : purchaseSupInfo(); }
      }
    });
  }
  function productModal(rec) {
    openModal({
      title: rec ? "ഉൽപ്പന്നം എഡിറ്റ്" : "പുതിയ ഉൽപ്പന്നം",
      body: '<label class="f">പേര്<input id="mf_name" class="in" value="' + h(rec ? rec.name : "") + '"></label><div class="g2"><label class="f">യൂണിറ്റ്<select id="mf_unit" class="sel">' + unitOptions(rec ? rec.unit : "kg") + '</select></label><label class="f">വില ₹<input id="mf_price" class="in" type="number" step="any" inputmode="decimal" value="' + (rec ? num(rec.price) : "") + '"></label></div>',
      onOk() {
        const name = clean(mv("name")); if (!name) return modalErr("പേര് നൽകുക.");
        if (live("products").some((x) => x.id !== (rec && rec.id) && norm(x.name) === norm(name))) return modalErr("ഈ പേര് നിലവിലുണ്ട്.");
        const r = Object.assign(rec ? {} : { id: uid("pr"), deleted: false, order: live("products").length + 1 }, rec || {}, { name, unit: mv("unit"), price: r2(num(mv("price"))) });
        save("products", r); toast("✅ സേവ് ചെയ്തു"); render();
      }
    });
  }
  function staffModal(rec) {
    openModal({
      title: rec ? "സ്റ്റാഫ് എഡിറ്റ്" : "പുതിയ സ്റ്റാഫ്",
      body: '<label class="f">പേര്<input id="mf_name" class="in" value="' + h(rec ? rec.name : "") + '"></label><label class="f">4 അക്ക പിൻ' + (rec ? " (മാറ്റാൻ മാത്രം)" : "") + '<input id="mf_pin" class="in" inputmode="numeric" maxlength="4" autocomplete="off"></label><div class="switch ' + (rec && rec.canProfit ? "on" : "") + '" data-act="sw-profit" id="mf_sw"><div class="t" style="font-weight:800;font-size:.84rem">ലാഭം കാണാൻ അനുവദിക്കുക</div><div class="tr"><i></i></div></div>',
      onOk() {
        const name = clean(mv("name")); if (!name) return modalErr("പേര് നൽകുക.");
        const p = clean(mv("pin"));
        if (!rec && !/^\d{4}$/.test(p)) return modalErr("4 അക്ക പിൻ നൽകുക.");
        if (p && !/^\d{4}$/.test(p)) return modalErr("പിൻ 4 അക്ക നമ്പർ ആയിരിക്കണം.");
        const hs = p ? pinHash(p) : rec.pinHash;
        if (hs === S().adminHash || live("staff").some((x) => x.id !== (rec && rec.id) && x.pinHash === hs)) return modalErr("ഈ പിൻ ഉപയോഗത്തിലുണ്ട്. മറ്റൊന്ന് നൽകുക.");
        save("staff", Object.assign(rec ? {} : { id: uid("st"), deleted: false }, rec || {}, { name, pinHash: hs, canProfit: $("#mf_sw").classList.contains("on") }));
        toast("✅ സേവ് ചെയ്തു"); render();
      }
    });
  }
  function dbModal() {
    openModal({
      title: "Firebase ഡാറ്റാബേസ് വിലാസം",
      text: "Firebase Console → Realtime Database പേജിന്റെ മുകളിൽ കാണുന്ന https://…firebasedatabase.app (അല്ലെങ്കിൽ …firebaseio.com) വിലാസം. mtp-honey.web.app (Hosting) ഇവിടെ പാടില്ല.",
      body: '<label class="f">വിലാസം<input id="mf_url" class="in" inputmode="url" autocapitalize="off" value="' + h(dbBase()) + '"></label>',
      ok: "സേവ്",
      onOk() {
        let u = clean(mv("url")).replace(/\/+$/, "");
        if (!/^https:\/\/[a-z0-9-]+(-default-rtdb)?(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/i.test(u)) return modalErr("ശരിയായ Realtime Database വിലാസം നൽകുക (…firebaseio.com / …firebasedatabase.app).");
        try { localStorage.setItem(CFG.DB_KEY, u); } catch (e) { /* ignore */ }
        syncErr = ""; syncState = "idle"; updateStatus(); toast("വിലാസം സേവ് ചെയ്തു"); sync(true).then(() => { updateStatus(); if (session) render(); });
      }
    });
  }
  function stmtEntries(kind, p) {
    const out = [];
    if (kind === "shop") { if (num(p.openingCredit)) out.push({ date: "0000", label: "പഴയ ബാക്കി", debit: num(p.openingCredit), credit: 0 }); live("sales").filter((x) => x.shopId === p.id).forEach((x) => { out.push({ date: x.date, label: x.kind === "sale" ? "ബിൽ " + x.billNo : "പണം വരവ്", debit: x.kind === "sale" ? num(x.total) : 0, credit: num(x.paid) }); }); }
    else { if (num(p.openingPayable)) out.push({ date: "0000", label: "പഴയ ബാക്കി", debit: num(p.openingPayable), credit: 0 }); live("purchases").filter((x) => x.supplierId === p.id).forEach((x) => { out.push({ date: x.date, label: x.kind === "payment" ? "പണം നൽകി" : x.item, debit: num(x.total), credit: num(x.paid) }); }); }
    out.sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0; out.forEach((e) => { bal = r2(bal + e.debit - e.credit); e.bal = bal; });
    return out;
  }
  function stmtModal(kind, p) {
    const es = stmtEntries(kind, p), b = es.length ? es[es.length - 1].bal : 0;
    openModal({ title: p.name + " — സ്റ്റേറ്റ്‌മെന്റ്", wide: true, focus: false, stmt: { kind, id: p.id },
      body: '<div class="banner ' + (b > 0 ? "red" : "green") + '">ബാക്കി: <b>' + money(b) + '</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>തീയതി</th><th>വിവരം</th><th class="r">ബിൽ</th><th class="r">പണം</th><th class="r">ബാക്കി</th></tr></thead><tbody>' + (es.length ? es.map((x) => "<tr><td>" + (x.date === "0000" ? "-" : h(fmtDate(x.date))) + "</td><td>" + h(x.label) + '</td><td class="r">' + (x.debit ? money(x.debit) : "") + '</td><td class="r">' + (x.credit ? money(x.credit) : "") + '</td><td class="r"><b>' + money(x.bal) + "</b></td></tr>").join("") : '<tr><td colspan="5">എൻട്രികൾ ഇല്ല</td></tr>') + "</tbody></table></div>",
      footer: '<div class="acts"><button type="button" class="btn" data-act="stmt-wa">' + ICON.msg + 'WhatsApp</button><button type="button" class="btn ghost" data-act="modal-cancel">അടയ്ക്കുക</button></div>' });
  }
  function cashModal(kind, p) {
    const isShop = kind === "shop", bal = isShop ? shopSummary(p.id).balance : supplierSummary(p.id).balance;
    openModal({
      title: (isShop ? "പണം വരവ്: " : "പണം നൽകുക: ") + p.name,
      body: '<div class="banner ' + (bal > 0 ? "red" : "green") + '">ബാക്കി: <b>' + money(bal) + '</b></div><label class="f">തുക ₹<input id="mf_amt" class="in" type="number" step="any" inputmode="decimal" value="' + (bal > 0 ? bal : "") + '"></label><label class="f">തീയതി<input id="mf_date" class="in" type="date" value="' + todayIso() + '"></label><label class="f">കുറിപ്പ്<input id="mf_note" class="in" placeholder="Cash / UPI"></label>',
      onOk() {
        const amt = r2(num(mv("amt"))), date = mv("date"); if (amt <= 0) return modalErr("തുക നൽകുക."); if (!date) return modalErr("തീയതി നൽകുക.");
        if (isShop) save("sales", { id: uid("sa"), deleted: false, createdAt: Date.now(), kind: "collect", date, shopId: p.id, shopName: p.name, shopPhone: p.phone, items: [], total: 0, paid: amt, note: clean(mv("note")) });
        else save("purchases", { id: uid("pu"), deleted: false, createdAt: Date.now(), kind: "payment", date, supplierId: p.id, supplierName: p.name, category: "", item: "", qty: 0, unit: "", rate: 0, total: 0, paid: amt, note: clean(mv("note")) });
        toast("✅ രേഖപ്പെടുത്തി"); render();
      }
    });
  }
  function billHtml(inv) {
    const b = S().biz, cr = r2(inv.total - inv.paid);
    return '<div class="inv"><div class="inv-h"><b>' + h(b.name) + "</b><div>" + h(b.tag) + "</div>" + (b.place || b.phone ? "<div>" + h(b.place) + (b.phone ? " | Ph: " + h(b.phone) : "") + "</div>" : "") + '</div><div class="inv-meta"><div><b>' + h(inv.shopName) + '</b><div class="muted">' + h(inv.shopPhone || "") + '</div></div><div class="right"><b class="mono">' + h(inv.billNo) + '</b><div class="muted">' + h(fmtDate(inv.date)) + "</div></div></div>" +
      '<table><thead><tr><th>ഉൽപ്പന്നം</th><th class="c">അളവ്</th><th class="r">നിരക്ക്</th><th class="r">തുക</th></tr></thead><tbody>' + (inv.items || []).map((i) => "<tr><td><b>" + h(i.name) + '</b></td><td class="c">' + kgFmt(i.qty) + " " + h(i.unit) + '</td><td class="r">' + kgFmt(i.rate) + '</td><td class="r"><b>' + num(i.amount).toFixed(2) + "</b></td></tr>").join("") + "</tbody></table>" +
      '<div class="inv-t"><div class="big"><span>ആകെ ബിൽ</span><span>' + money(inv.total) + "</span></div><div><span>ലഭിച്ചത്</span><span>" + money(inv.paid) + '</span></div><div><span>ഈ ബില്ലിലെ കടം</span><b class="' + (cr > 0 ? "neg" : "") + '">' + money(cr) + "</b></div><div><span>കടയുടെ ആകെ ബാക്കി</span><b>" + money(shopSummary(inv.shopId).balance) + '</b></div></div><div class="inv-foot">നന്ദി! 🙏</div></div>';
  }
  function showBill(id) {
    const inv = byId("sales", id); if (!inv) return;
    openModal({ title: "ബിൽ " + inv.billNo, wide: true, focus: false, invId: id, body: billHtml(inv),
      footer: '<div class="acts n3"><button type="button" class="btn" data-act="inv-wa">' + ICON.msg + 'WhatsApp</button><button type="button" class="btn ghost" data-act="inv-pdf">' + ICON.file + 'PDF</button><button type="button" class="btn ghost" data-act="inv-print">' + ICON.print + '</button></div><button type="button" class="btn ghost block" data-act="modal-cancel">അടയ്ക്കുക</button>' });
  }
  function openWa(phone, text) {
    const p = String(phone || "").replace(/\D/g, "");
    window.open((p.length >= 10 ? "https://wa.me/91" + p.slice(-10) : "https://wa.me/") + "?text=" + encodeURIComponent(text), "_blank");
  }
  function billText(inv) {
    const b = S().biz;
    return ["*" + b.name + "*", b.place + (b.phone ? " | Ph: " + b.phone : ""), "------------------------", "Bill: *" + inv.billNo + "* | " + inv.date, "Shop: *" + inv.shopName + "*", "------------------------"]
      .concat((inv.items || []).map((i) => "• " + i.name + ": " + kgFmt(i.qty) + " " + i.unit + " x ₹" + kgFmt(i.rate) + " = *₹" + num(i.amount).toFixed(2) + "*"))
      .concat(["------------------------", "*Total: ₹" + inv.total + "*", "Paid: ₹" + inv.paid, "Bill Credit: ₹" + r2(inv.total - inv.paid), "Total Balance: *₹" + shopSummary(inv.shopId).balance + "*", "", "Thank you!"]).join("\n");
  }
  const delConfirm = (title, text, fn) => confirmBox(title, text, "നീക്കം ചെയ്യുക", () => { fn(); toast("നീക്കം ചെയ്തു", "warn"); render(); });

  /* ---------- backups ---------- */
  function dataSnapshot() { const o = {}; BACKUP_COLS.forEach((c) => { o[c] = JSON.parse(JSON.stringify(state.data[c])); }); return o; }
  async function createSnapshot(label) {
    const arr = await getSnapshots();
    arr.unshift({ id: "bk" + Date.now(), label, ts: new Date().toLocaleString("en-IN"), data: dataSnapshot() });
    try { await idbSet("snapshots", arr.slice(0, 15)); } catch (e) { /* ignore */ }
  }
  async function autoBackupCheck() { const t = todayIso(); if (state.lastAutoBackup !== t) { state.lastAutoBackup = t; persist(); await createSnapshot("Auto Backup (" + t + ")"); } }
  function restoreData(data) {
    const now = Date.now();
    BACKUP_COLS.forEach((col) => {
      const src = data[col]; if (!src) return;
      const map = Array.isArray(src) ? Object.fromEntries(src.filter((r) => r && r.id).map((r) => [r.id, r])) : src;
      Object.keys(state.data[col]).forEach((id) => { if (!map[id] && !state.data[col][id].deleted) { state.data[col][id].deleted = true; state.data[col][id].updatedAt = now; state.dirty[col + "/" + id] = 1; } });
      Object.keys(map).forEach((id) => { state.data[col][id] = Object.assign({}, map[id], { id, deleted: !!map[id].deleted, updatedAt: now }); state.dirty[col + "/" + id] = 1; });
    });
    persist(); scheduleSync();
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  }

  const actions = {
    pin(el) { if (pin.length >= 4) return; pin += el.dataset.k; updateDots(); pinMsg(""); if (pin.length === 4) verifyPin(); },
    "pin-back"() { pin = pin.slice(0, -1); updateDots(); },
    "pin-clear"() { pin = ""; updateDots(); pinMsg(""); },
    logout,
    theme() { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); persist(); render(); },
    install: async function () { if (installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) { /* ignore */ } installPrompt = null; } else toast("ബ്രൗസർ മെനുവിലെ 'Install app' / 'Add to Home Screen' ഉപയോഗിക്കുക."); },
    mode(el) { ui.mode = el.dataset.m; ui.pane = "entry"; ui.editPurchase = null; ui.editSale = null; render(); },
    pane(el) { ui.pane = el.dataset.p; render(); window.scrollTo(0, 0); },
    "db-url": dbModal,

    "add-supplier"() { partyModal("supplier"); },
    "edit-supplier"(el) { const r = byId("suppliers", el.dataset.id); if (r) partyModal("supplier", r); },
    "del-supplier"(el) { const r = byId("suppliers", el.dataset.id); if (r && isAdmin()) delConfirm("സപ്ലയറെ നീക്കം ചെയ്യണോ?", r.name + " — പഴയ എൻട്രികൾ റിപ്പോർട്ടിൽ നിലനിൽക്കും.", () => softDelete("suppliers", r.id)); },
    "add-shop"() { partyModal("shop"); },
    "edit-shop"(el) { const r = byId("shops", el.dataset.id); if (r) partyModal("shop", r); },
    "del-shop"(el) { const r = byId("shops", el.dataset.id); if (r && isAdmin()) delConfirm("കടയെ നീക്കം ചെയ്യണോ?", r.name, () => softDelete("shops", r.id)); },
    "pay-supplier"(el) { const r = byId("suppliers", el.dataset.id); if (r) cashModal("supplier", r); },
    "collect-shop"(el) { const r = byId("shops", el.dataset.id); if (r) cashModal("shop", r); },
    "stmt-supplier"(el) { const r = byId("suppliers", el.dataset.id); if (r) stmtModal("supplier", r); },
    "stmt-shop"(el) { const r = byId("shops", el.dataset.id); if (r) stmtModal("shop", r); },
    "stmt-wa"() {
      if (!modal || !modal.stmt) return; const k = modal.stmt.kind, p = byId(k === "shop" ? "shops" : "suppliers", modal.stmt.id); if (!p) return; const b = S().biz;
      openWa(p.phone, ["*" + b.name + "*", "സ്റ്റേറ്റ്‌മെന്റ് — *" + p.name + "*", "------------------------"].concat(stmtEntries(k, p).slice(-12).map((x) => (x.date === "0000" ? "" : x.date + " ") + x.label + (x.debit ? " | +₹" + x.debit : "") + (x.credit ? " | −₹" + x.credit : "") + " | ₹" + x.bal)).concat(["------------------------", "*ആകെ ബാക്കി: ₹" + (k === "shop" ? shopSummary(p.id).balance : supplierSummary(p.id).balance) + "*"]).join("\n"));
    },
    "remind-shop"(el) {
      const s = byId("shops", el.dataset.id); if (!s) return; const b = S().biz, bal = shopSummary(s.id).balance;
      openWa(s.phone, "നമസ്കാരം, " + s.name + ".\n" + b.name + " ലേക്ക് ₹" + bal + " ബാക്കി നൽകാനുണ്ട്" + (s.dueDate ? " (അവധി: " + fmtDate(s.dueDate) + ")" : "") + ". ദയവായി പണം നൽകണമെന്ന് അഭ്യർത്ഥിക്കുന്നു. നന്ദി 🙏");
    },

    /* purchases */
    "save-purchase"() {
      const sup = byId("suppliers", $("#p_sup").value), item = clean($("#p_item").value), qty = num($("#p_qty").value), rate = num($("#p_rate").value), date = $("#p_date").value;
      if (!sup) return toast("സപ്ലയറെ തിരഞ്ഞെടുക്കുക", "error");
      if (!item) return toast("ഇനം നൽകുക", "error");
      if (!date) return toast("തീയതി നൽകുക", "error");
      const total = r2($("#p_total").value === "" ? qty * rate : num($("#p_total").value));
      if (total <= 0) return toast("തുക നൽകുക", "error");
      const raw = $("#p_paid").value, paid = raw === "" ? total : r2(num(raw));
      if (paid < 0 || paid > total + 0.005) return toast("കൊടുത്ത തുക ശരിയല്ല (0 – " + money(total) + ")", "error");
      const old = ui.editPurchase ? state.data.purchases[ui.editPurchase] : null;
      save("purchases", Object.assign({}, old || { id: uid("pu"), deleted: false, createdAt: Date.now() }, { kind: "purchase", date, supplierId: sup.id, supplierName: sup.name, category: $("#p_cat").value, item, qty, unit: $("#p_unit").value, rate: qty > 0 ? r2(total / qty) : rate, total, paid, note: clean($("#p_note").value) }));
      toast(old ? "✅ അപ്ഡേറ്റ് ചെയ്തു" : "✅ സേവ് ചെയ്തു"); ui.editPurchase = null; render();
    },
    "edit-purchase"(el) { ui.editPurchase = el.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    "cancel-purchase"() { ui.editPurchase = null; render(); },
    "del-purchase"(el) { const p = byId("purchases", el.dataset.id); if (p && isAdmin()) delConfirm("എൻട്രി നീക്കം ചെയ്യണോ?", p.supplierName + " — " + money(p.total || p.paid), () => softDelete("purchases", p.id)); },

    /* sales */
    "add-row"() { if (!sortedProducts().length) return toast("ഉൽപ്പന്നങ്ങൾ ഇല്ല", "warn"); $("#s_rows").insertAdjacentHTML("beforeend", rowHtml()); recalcSale(); },
    "rm-row"(el) { if ($$("#s_rows .srow").length <= 1) return toast("കുറഞ്ഞത് ഒരു ഇനം വേണം", "warn"); el.closest(".srow").remove(); recalcSale(); },
    "save-sale"() {
      const shop = byId("shops", $("#s_shop").value); if (!shop) return toast("കടയെ തിരഞ്ഞെടുക്കുക", "error");
      const date = $("#s_date").value; if (!date) return toast("തീയതി നൽകുക", "error");
      const items = [];
      $$("#s_rows .srow").forEach((row) => {
        const sel = $(".r-prod", row), qty = num($(".r-qty", row).value), rate = num($(".r-rate", row).value);
        if (qty > 0) { const p = state.data.products[sel.value]; items.push({ productId: sel.value, name: p ? p.name : sel.options[sel.selectedIndex].text, unit: p ? p.unit : "", qty, rate, amount: r2(qty * rate) }); }
      });
      if (!items.length) return toast("കുറഞ്ഞത് ഒരു ഇനത്തിന്റെ അളവ് നൽകുക", "error");
      const total = r2(sumBy(items, (i) => i.amount)), raw = $("#s_paid").value, paid = raw === "" ? total : r2(num(raw));
      if (paid < 0 || paid > total + 0.005) return toast("ലഭിച്ച തുക ബില്ലിനേക്കാൾ (" + money(total) + ") കൂടുതലാണ്. അധികം 'പണം വരവ്' ആയി രേഖപ്പെടുത്തുക.", "error");
      const old = ui.editSale ? state.data.sales[ui.editSale] : null;
      const billNo = old ? old.billNo : nextBillNo();
      const rec = save("sales", Object.assign({}, old || { id: uid("sa"), deleted: false, createdAt: Date.now() }, { kind: "sale", billNo, date, shopId: shop.id, shopName: shop.name, shopPhone: shop.phone, items, total, paid, note: clean($("#s_note").value) }));
      ui.editSale = null; render(); toast("✅ ബിൽ " + billNo + " സേവ് ചെയ്തു"); showBill(rec.id);
    },
    "edit-sale"(el) { ui.editSale = el.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    "cancel-sale"() { ui.editSale = null; render(); },
    "del-sale"(el) { const s = byId("sales", el.dataset.id); if (s && isAdmin()) delConfirm("എൻട്രി നീക്കം ചെയ്യണോ?", (s.billNo || "പണം വരവ്") + " — " + s.shopName, () => softDelete("sales", s.id)); },
    "view-bill"(el) { showBill(el.dataset.id); },
    "inv-wa"() { const inv = byId("sales", modal && modal.invId); if (inv) openWa(inv.shopPhone, billText(inv)); },
    "inv-print"() { window.print(); },
    async "inv-pdf"(el) { const inv = byId("sales", modal && modal.invId); if (!inv) return; el.disabled = true; try { download(new Blob([await buildBillPdf(inv)], { type: "application/pdf" }), inv.billNo + ".pdf"); toast("PDF ഡൗൺലോഡ് ചെയ്തു"); } catch (e) { toast("PDF നിർമ്മിക്കാൻ കഴിഞ്ഞില്ല", "error"); } el.disabled = false; },

    /* reports */
    async "report-pdf"(el) { el.disabled = true; try { download(new Blob([await buildReportPdf(ui.rMonth || monthNow())], { type: "application/pdf" }), "MTP_Honey_Report_" + (ui.rMonth || monthNow()) + ".pdf"); toast("PDF ഡൗൺലോഡ് ചെയ്തു"); } catch (e) { toast("PDF നിർമ്മിക്കാൻ കഴിഞ്ഞില്ല", "error"); } el.disabled = false; },
    "report-wa"() {
      const m = ui.rMonth || monthNow(), d = reportData(m), b = S().biz;
      openWa("", ["*" + b.name + " — " + fmtMonth(m) + "*", "------------------------", "വിൽപ്പന: *₹" + d.sales + "*", "ലഭിച്ചത്: ₹" + d.received, "പർച്ചേസ്: *₹" + d.purchase + "*", "നൽകിയത്: ₹" + d.paidOut].concat(canProfit() ? ["ലാഭം: *₹" + r2(d.sales - d.purchase) + "*"] : []).concat(["കിട്ടാനുള്ളത്: ₹" + totalCredit(), "കൊടുക്കാനുള്ളത്: ₹" + totalPayable()]).join("\n"));
    },

    /* admin */
    "save-pin"() {
      const a = $("#a_pin").value.trim(); if (!/^\d{4}$/.test(a)) return toast("പിൻ 4 അക്ക നമ്പർ ആയിരിക്കണം", "error");
      const hs = pinHash(a); if (live("staff").some((x) => x.pinHash === hs)) return toast("ഈ പിൻ ഒരു സ്റ്റാഫിന്റേതാണ്", "error");
      const s = S(); s.adminHash = hs; save("settings", s); toast("✅ പിൻ മാറ്റി"); render();
    },
    "save-biz"() {
      const s = S(), n = clean($("#b_name").value); if (!n) return toast("പേര് നൽകുക", "error");
      s.biz = { name: n, tag: clean($("#b_tag").value), place: clean($("#b_place").value), phone: clean($("#b_phone").value) };
      save("settings", s); toast("✅ സേവ് ചെയ്തു"); render();
    },
    "add-product"() { productModal(); },
    "edit-product"(el) { const r = byId("products", el.dataset.id); if (r) productModal(r); },
    "del-product"(el) { const r = byId("products", el.dataset.id); if (r && isAdmin()) delConfirm("ഉൽപ്പന്നം നീക്കം ചെയ്യണോ?", r.name, () => softDelete("products", r.id)); },
    "add-staff"() { staffModal(); },
    "edit-staff"(el) { const r = byId("staff", el.dataset.id); if (r) staffModal(r); },
    "del-staff"(el) { const r = byId("staff", el.dataset.id); if (r && isAdmin()) delConfirm("സ്റ്റാഫിനെ നീക്കം ചെയ്യണോ?", r.name, () => softDelete("staff", r.id)); },
    "sw-profit"(el) { el.classList.toggle("on"); },
    async "sync-now"(el) { el.disabled = true; const r = await sync(true); el.disabled = false; toast(r === "ok" ? "സിങ്ക് പൂർത്തിയായി" : r === "offline" ? "ഓഫ്‌ലൈൻ ആണ്" : "സിങ്ക് പരാജയപ്പെട്ടു: " + syncErr, r === "ok" ? "" : "error"); if (ui.pane === "admin") render(); },
    async snapshot() { await createSnapshot("Manual Backup (" + todayIso() + ")"); toast("✅ ഫോണിൽ ബാക്കപ്പ് എടുത്തു"); render(); },
    export() { download(new Blob([JSON.stringify({ app: "mtp-honey", v: 1, exportedAt: new Date().toISOString(), data: dataSnapshot() }, null, 2)], { type: "application/json" }), "MTP_Honey_Backup_" + todayIso() + ".json"); toast("📥 ഡൗൺലോഡ് ചെയ്തു"); },
    "restore-snap"(el) { if (!isAdmin()) return; const b = snapCache.find((x) => x.id === el.dataset.id); if (!b) return; confirmBox("റീസ്റ്റോർ ചെയ്യണോ?", b.label + " — നിലവിലെ ഡാറ്റ മാറ്റപ്പെടും.", "റീസ്റ്റോർ", () => { restoreData(b.data); toast("✅ റീസ്റ്റോർ ചെയ്തു"); render(); }); },
    "modal-cancel": closeModal,
    "modal-ok"() { if (!modal || !modal.onOk) return; const r = modal.onOk(); if (r !== false) closeModal(); }
  };

  /* =====================================================================
     12. EVENTS & BOOT
     ===================================================================== */
  let installPrompt = null, hiddenAt = 0;
  function wire() {
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-act]"); if (!el) return;
      const act = el.dataset.act;
      if (act === "modal-bg") { if (ev.target === el) closeModal(); return; }
      if (actions[act]) { if (el.tagName === "A") return; actions[act](el, ev); }
    });
    document.addEventListener("input", (ev) => {
      const el = ev.target;
      if (el.classList.contains("calc-s") || el.id === "s_paid") recalcSale();
      else if (el.classList.contains("calc-p")) calcPurchase(el.id);
      else if (el.dataset && (el.dataset.ui === "pSearch" || el.dataset.ui === "sSearch")) { ui[el.dataset.ui] = el.value; const l = $("#liveList"); if (l) l.innerHTML = ui.mode === "purchase" ? purchaseListInner() : salesListInner(); }
    });
    document.addEventListener("change", (ev) => {
      const el = ev.target, ch = el.dataset && el.dataset.ch;
      if (ch === "row-prod") { const o = el.options[el.selectedIndex]; $(".r-rate", el.closest(".srow")).value = o.getAttribute("data-price") || 0; recalcSale(); }
      else if (ch === "s-shop") salesShopInfo();
      else if (ch === "p-sup") purchaseSupInfo();
      else if (ch === "restore-file") {
        const f = el.files && el.files[0]; if (!f || !isAdmin()) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const p = JSON.parse(rd.result), data = p.data || p;
            if (!data.sales || !data.shops) throw new Error("bad");
            confirmBox("ഫയലിൽ നിന്ന് റീസ്റ്റോർ ചെയ്യണോ?", f.name + " — നിലവിലെ ഡാറ്റ മാറ്റപ്പെടും.", "റീസ്റ്റോർ", () => { restoreData(data); toast("✅ റീസ്റ്റോർ ചെയ്തു"); render(); });
          } catch (e) { toast("അസാധുവായ ബാക്കപ്പ് ഫയൽ!", "error"); }
          el.value = "";
        };
        rd.readAsText(f);
      } else if (el.dataset && el.dataset.ui) {
        ui[el.dataset.ui] = el.value;
        if (/^(pMonth|sMonth)$/.test(el.dataset.ui)) { const l = $("#liveList"); if (l) l.innerHTML = ui.mode === "purchase" ? purchaseListInner() : salesListInner(); } else render();
      }
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modal) { closeModal(); return; }
      if (!session && !modal && /^[0-9]$/.test(ev.key)) { actions.pin({ dataset: { k: ev.key } }); return; }
      if (!session && !modal && ev.key === "Backspace") { actions["pin-back"](); return; }
      if (ev.key === "Enter" && modal && ev.target.tagName === "INPUT" && modal.onOk) { ev.preventDefault(); actions["modal-ok"](); }
    });
    window.addEventListener("online", () => { updateStatus(); sync(false); });
    window.addEventListener("offline", updateStatus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); persistNow(); }
      else {
        if (session && hiddenAt && Date.now() - hiddenAt > CFG.AUTOLOCK_MS) { logout(); toast("സുരക്ഷയ്ക്കായി ലോക്ക് ചെയ്തു"); }
        if (online()) sync(false);
      }
    });
    window.addEventListener("pagehide", persistNow);
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; const b = $("#btnInstall"); if (b) b.hidden = false; });
    window.addEventListener("appinstalled", () => { installPrompt = null; if (session) render(); toast("ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്തു"); });
  }

  async function boot() {
    await loadState();
    applyTheme(); wire(); render();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (online()) sync(false);
    setInterval(() => { if (online() && document.visibilityState === "visible" && !syncing) sync(false); }, CFG.POLL_MS);
    if (window.__MTH_TEST) {
      window.__MTH = { state: () => state, setSession: (r) => { session = r ? { role: r, name: r, canProfit: r === "admin" } : null; }, ui: () => ui, render, actions, mergeRemote, save, restoreData, buildReportPdf, buildBillPdf, reportData, pinHash, verifyPin, setPin: (p) => { pin = p; }, supplierSummary, shopSummary, nextBillNo, totalPayable, totalCredit, isOverdue, live, S, todayIso, session: () => session };
    }
  }
  boot();
})();
