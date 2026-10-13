// Progress and settings: saved in this browser, synced through the Worker + D1 when a sync key is set.
// Two documents: "progress" (merged across devices) and "settings" (latest change wins).

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export const DEFAULT_SETTINGS = { spelling: "theory", labels: false, volume: 0.7, unlockAll: false, typing: true, midi: false };
export const emptyProgress = () => ({ levels: {}, history: [] });
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Combine two progress documents without losing anything: best scores keep the max, history is a union.
export function mergeProgress(a, b) {
  const out = emptyProgress();
  for (const src of [a || {}, b || {}]) {
    for (const [id, lv] of Object.entries(src.levels || {})) {
      const o = (out.levels[id] ||= {});
      for (const mode of ["play", "name"]) {
        const x = lv[mode];
        if (!x) continue;
        const y = (o[mode] ||= { best: 0, rounds: 0, lastAt: 0 });
        y.best = Math.max(y.best, x.best || 0);
        y.rounds = Math.max(y.rounds, x.rounds || 0);
        y.lastAt = Math.max(y.lastAt, x.lastAt || 0);
      }
    }
  }
  const seen = new Map();
  [...(a?.history || []), ...(b?.history || [])].forEach((h) => seen.set(h.id, h));
  out.history = [...seen.values()].sort((x, y) => x.at - y.at).slice(-400);
  // Rounds count from history where available, so two devices don't undercount.
  for (const h of out.history) {
    const y = out.levels[h.level]?.[h.mode];
    if (y) y.rounds = Math.max(y.rounds, out.history.filter((z) => z.level === h.level && z.mode === h.mode).length);
  }
  return out;
}

export function createStore({ onChange, onStatus }) {
  const s = {
    progress: mergeProgress(LS.get("pd-progress", emptyProgress()), emptyProgress()),
    settings: { ...DEFAULT_SETTINGS, ...LS.get("pd-settings", {}) },
    key: LS.get("spr-sync-key", ""),
    since: LS.get("pd-sync-since", 0),
    meta: LS.get("pd-meta", {}),
    dirty: LS.get("pd-dirty", {}),
    status: "",
    busy: false, again: false, timer: null,
  };
  const persist = () => {
    LS.set("pd-progress", s.progress); LS.set("pd-settings", s.settings);
    LS.set("spr-sync-key", s.key); LS.set("pd-sync-since", s.since); LS.set("pd-meta", s.meta); LS.set("pd-dirty", s.dirty);
  };
  const status = (t) => { s.status = t; onStatus && onStatus(t); };
  const body = (id) => (id === "progress" ? s.progress : id === "settings" ? s.settings : null);

  function markDirty(id) {
    s.meta[id] = Date.now();
    s.dirty[id] = 1;
    persist();
    schedule(1200);
  }
  function schedule(ms) {
    if (!s.key) return;
    clearTimeout(s.timer);
    s.timer = setTimeout(run, ms);
  }
  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { Authorization: "Bearer " + s.key, "Content-Type": "application/json" } });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(b.error || "HTTP " + r.status); e.status = r.status; throw e; }
    return b;
  }
  async function pull(full) {
    const res = await api("/api/sync?since=" + (full ? 0 : s.since));
    let changed = false;
    const seen = new Set();
    for (const d of res.docs) {
      seen.add(d.id);
      if (d.id === "progress") {
        const merged = mergeProgress(s.progress, d.body);
        if (!same(merged, s.progress)) { s.progress = merged; changed = true; }
        if (!same(merged, mergeProgress(d.body, emptyProgress()))) { s.dirty.progress = 1; s.meta.progress = Date.now(); }
      } else if (d.id === "settings") {
        if (d.updated_at > (s.meta.settings || 0)) {
          s.settings = { ...DEFAULT_SETTINGS, ...d.body };
          s.meta.settings = d.updated_at;
          delete s.dirty.settings;
          changed = true;
        }
      }
    }
    if (full) for (const id of ["progress", "settings"]) if (!seen.has(id)) { s.dirty[id] = 1; s.meta[id] ||= Date.now(); }
    s.since = res.now;
    persist();
    return changed;
  }
  async function push() {
    const ids = Object.keys(s.dirty).filter(body);
    if (!ids.length) return;
    const docs = ids.map((id) => ({ id, body: clone(body(id)), updated_at: s.meta[id] || Date.now() }));
    await api("/api/docs", { method: "POST", body: JSON.stringify(docs) });
    docs.forEach((d) => { if (s.meta[d.id] === d.updated_at) delete s.dirty[d.id]; });
    persist();
  }
  async function run(full) {
    if (!s.key) { status("Saved in this browser"); return; }
    if (!navigator.onLine) { status("Offline · will sync later"); return; }
    if (s.busy) { s.again = true; return; }
    s.busy = true;
    status("Syncing…");
    try {
      const changed = await pull(full === true);
      await push();
      status("Synced " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      if (changed && onChange) onChange();
    } catch (e) {
      status(e.status === 401 ? "Sync key rejected" : "Couldn't sync · will retry");
    } finally {
      s.busy = false;
      if (s.again) { s.again = false; schedule(400); }
    }
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(200); });
  window.addEventListener("online", () => schedule(200));
  setInterval(() => { if (document.visibilityState === "visible") run(); }, 60000);
  status(s.key ? "Syncing…" : "Saved in this browser");
  if (s.key) schedule(300);

  return {
    get progress() { return s.progress; },
    get settings() { return s.settings; },
    get status() { return s.status; },
    get connected() { return !!s.key; },
    saveProgress() { persist(); markDirty("progress"); },
    saveSettings() { persist(); markDirty("settings"); },
    syncNow: () => run(),
    async connect(key) {
      const prev = s.key;
      s.key = key.trim();
      try { await api("/api/ping"); s.since = 0; persist(); await run(true); return true; }
      catch (e) { s.key = prev; persist(); throw e; }
    },
    disconnect() { s.key = ""; persist(); status("Saved in this browser"); },
    resetProgress() { s.progress = emptyProgress(); persist(); markDirty("progress"); },
  };
}
