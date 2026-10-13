import { LEVELS } from "./levels.js";
import { createKeyboard } from "./keyboard.js";
import { play, noteOn, noteOff, pedal, setVolume } from "./audio.js";
import { lessonHTML } from "./lessons.js";
import * as adaptive from "./adaptive.js";
import { createInput } from "./input.js";
import { createStore } from "./store.js";
import { nameAt } from "./theory.js";

const PASS = 0.9;
const ROUND = 10;        // questions per round

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x) => Math.round(x * 100) + "%";

let midiOn = false;
let midiText = "Off";
const store = createStore({
  onChange: () => { applySettings(); renderSidebar(); if (view !== "quiz") renderStage(); },
  onStatus: (t) => { const el = $("#sync"); if (el) el.textContent = t; const s2 = $("#sync-status"); if (s2) s2.textContent = t; },
});
const S = () => store.settings;

let view = "intro";   // intro | quiz | results
let levelIdx = 0;
let mode = "play";
let R = null;         // the current round
let Q = null;         // the current question's state
let result = null;    // last finished round

const kb = createKeyboard($("#keys"), { onKey });
const input = createInput({
  onNote: noteIn,
  onNoteOff: (m) => { kb.hold(m, false); noteOff(m); },
  onPedal: pedal,
  onOctave: (o) => { $("#oct").textContent = o; },
  onMidiStatus: (t) => { midiText = t; const el = $("#midi-status"); if (el) el.textContent = t; },
});

/* ---------------- progress helpers ---------------- */
const rec = (i, m) => store.progress.levels[LEVELS[i].id]?.[m];
const bestOf = (i) => Math.max(rec(i, "play")?.best || 0, rec(i, "name")?.best || 0);
const passed = (i) => bestOf(i) >= PASS;
const unlocked = (i) => S().unlockAll || i === 0 || passed(i - 1);
function nextUp() {
  for (let i = 0; i < LEVELS.length; i++) if (unlocked(i) && bestOf(i) < PASS) return i;
  for (let i = LEVELS.length - 1; i >= 0; i--) if (unlocked(i)) return i;
  return 0;
}

/* ---------------- settings ---------------- */
function applySettings() {
  kb.setLabels(S().labels, S().spelling);
  setVolume(S().volume);
  input.setTyping(S().typing);
  if (S().midi !== midiOn) { midiOn = S().midi; input.setMidi(midiOn); }
}

/* ---------------- sidebar ---------------- */
function renderSidebar() {
  const up = nextUp();
  const onSmart = view === "smart" || R?.smart || (view === "results" && result?.smart);
  let html = `<button class="lvl smart${onSmart ? " cur" : ""}" data-act="smart"><span class="lt"><span class="ln">Smart practice</span><span class="ls">Mixed, tuned to what you miss</span></span></button>`;
  let group = "";
  LEVELS.forEach((L, i) => {
    if (L.group !== group) { group = L.group; html += `<div class="grp">${esc(group)}</div>`; }
    const open = unlocked(i), p = rec(i, "play")?.best, n = rec(i, "name")?.best;
    html += `<button class="lvl${i === levelIdx && !onSmart ? " cur" : ""}${open ? "" : " locked"}" data-act="level" data-i="${i}" ${i === levelIdx && !onSmart ? 'aria-current="true"' : ""}>
      <span class="num">${String(i + 1).padStart(2, "0")}</span>
      <span class="lt"><span class="ln">${esc(L.title)}</span>
        <span class="ls">${open ? `${scoreChip("Play", p)}${scoreChip("Name", n)}` : "Locked"}</span></span>
      <span class="st">${!open ? lockIcon() : passed(i) ? '<span class="pass" title="Passed">✓</span>' : i === up ? '<span class="up">Next</span>' : ""}</span>
    </button>`;
  });
  $("#levels").innerHTML = html;
}
const scoreChip = (label, v) => `<span class="chip${v >= PASS ? " good" : ""}">${label} ${v != null ? pct(v) : "–"}</span>`;
const lockIcon = () => `<svg class="lock" viewBox="0 0 16 16" aria-label="Locked"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none"/></svg>`;

/* ---------------- stage ---------------- */
function renderStage() {
  const el = $("#stage");
  if (view === "intro") el.innerHTML = introView();
  else if (view === "smart") el.innerHTML = smartView();
  else if (view === "quiz") el.innerHTML = quizView();
  else el.innerHTML = resultsView();
  renderMarks();
}

function introView() {
  const L = LEVELS[levelIdx], open = unlocked(levelIdx);
  return `<div class="intro">
    <p class="eyebrow">${esc(L.group)} · Level ${levelIdx + 1} of ${LEVELS.length}</p>
    <h1>${esc(L.title)}</h1>
    <p class="lead">${esc(L.desc)}</p>
    ${open ? `${lessonHTML(L.id, !rec(levelIdx, "play") && !rec(levelIdx, "name"))}
    <div class="modes">
      <button class="mode" data-act="start" data-mode="play">
        <span class="mt">Play it</span>
        <span class="md">I name it, you find it on the keys.</span>
        <span class="mb">Best ${rec(levelIdx, "play") ? pct(rec(levelIdx, "play").best) : "–"}</span>
      </button>
      <button class="mode" data-act="start" data-mode="name">
        <span class="mt">Name it</span>
        <span class="md">I mark the keys, you build the name.</span>
        <span class="mb">Best ${rec(levelIdx, "name") ? pct(rec(levelIdx, "name").best) : "–"}</span>
      </button>
    </div>
    <p class="muted small">Score ${pct(PASS)} or better in either mode to unlock the next level.</p>`
    : `<div class="lockedbox">${lockIcon()}<div><b>Locked.</b> Score ${pct(PASS)} on level ${levelIdx} (${esc(LEVELS[levelIdx - 1].title)}) to open this one, or turn on <i>Unlock all levels</i> in Settings.</div></div>`}
  </div>`;
}

function smartView() {
  const now = Date.now();
  const items = store.progress.items;
  const open = LEVELS.map((_, i) => i).filter(unlocked);
  const top = open[open.length - 1];
  const mastery = (i) => adaptive.levelMastery(items[mode], LEVELS[i].id, passed(i), now);
  const preview = top + 1 < LEVELS.length ? LEVELS[top + 1] : null;
  const rows = open.map((i) => `<div class="mrow"><span>${esc(LEVELS[i].title)}</span><span class="mbar"><i style="width:${Math.round(mastery(i) * 100)}%"></i></span><span class="mpct">${pct(mastery(i))}</span></div>`).join("");
  const sum = (m) => adaptive.summary(items[m], now);
  const chip = (m) => { const x = sum(m); return x.seen ? `${x.mastered} mastered · ${x.learning} learning` : "Nothing tracked yet"; };
  const weak = ["play", "name"].flatMap((m) => adaptive.weakest(items[m], now, 5).map((x) => ({ ...x, m }))).sort((a, b) => a.p - b.p).slice(0, 5);
  return `<div class="intro">
    <p class="eyebrow">Adaptive</p>
    <h1>Smart practice</h1>
    <p class="lead">Questions come from every level you have open. It tracks each exact chord, scale and note, brings back what you miss and what you have not seen for a while, and adds new items as you master the ones you are learning.</p>
    <div class="modes">
      <button class="mode" data-act="start-smart" data-mode="play"><span class="mt">Play it</span><span class="md">I name it, you find it on the keys.</span><span class="mb">${chip("play")}</span></button>
      <button class="mode" data-act="start-smart" data-mode="name"><span class="mt">Name it</span><span class="md">I mark the keys, you build the name.</span><span class="mb">${chip("name")}</span></button>
    </div>
    <div class="lesson mastery"><p class="eyebrow">Level mastery${mode === "name" ? " · Name it" : " · Play it"}</p>${rows}
      ${preview ? `<p class="muted small">${esc(preview.title)} joins practice in small amounts once you are strong on level ${top + 1}. It still opens for its own rounds at ${pct(PASS)}.</p>` : ""}</div>
    ${weak.length ? `<div class="misses"><p class="eyebrow">Needs work</p><ul>${weak.map((x) => `<li>${esc(x.label)} <span class="muted">· ${x.m === "play" ? "Play it" : "Name it"} · ${pct(x.p)}</span></li>`).join("")}</ul></div>` : ""}
  </div>`;
}

function resultsView() {
  const r = result;
  if (r.smart) return `<div class="intro results">
    <p class="eyebrow">Smart practice · ${r.mode === "play" ? "Play it" : "Name it"}</p>
    <h1 class="big">${pct(r.score)}</h1>
    <p class="lead">${r.correct} of ${r.checks} right on the first try.</p>
    ${r.misses.length ? `<div class="misses"><p class="eyebrow">To review</p><ul>${r.misses.slice(0, 8).map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
    <div class="row"><button class="primary" data-act="start-smart" data-mode="${r.mode}">Keep going</button><button data-act="smart">Back</button></div>
  </div>`;
  const L = LEVELS[r.levelIdx];
  return `<div class="intro results">
    <p class="eyebrow">${esc(L.title)} · ${r.mode === "play" ? "Play it" : "Name it"}</p>
    <h1 class="big">${pct(r.score)}</h1>
    <p class="lead">${r.correct} of ${r.checks} right on the first try.${r.best ? " New best for this level." : ""}</p>
    ${r.passed ? `<p class="pass-msg">✓ Passed.${r.unlockedNext ? ` Level ${r.levelIdx + 2}, ${esc(LEVELS[r.levelIdx + 1].title)}, is now open.` : ""}</p>`
      : `<p class="muted">You need ${pct(PASS)} to pass. Misses are the ones worth repeating.</p>`}
    ${r.misses.length ? `<div class="misses"><p class="eyebrow">To review</p><ul>${r.misses.slice(0, 8).map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
    <div class="row">
      <button class="primary" data-act="start" data-mode="${r.mode}">Go again</button>
      ${r.passed && r.levelIdx + 1 < LEVELS.length ? `<button data-act="level" data-i="${r.levelIdx + 1}">Next level →</button>` : ""}
      <button data-act="start" data-mode="${r.mode === "play" ? "name" : "play"}">Try ${r.mode === "play" ? "Name it" : "Play it"}</button>
    </div>
  </div>`;
}

function quizView() {
  const L = LEVELS[Q.li], q = Q.q;
  const playMode = R.mode === "play";
  const total = R.n;
  const head = `<div class="qhead">
      <span class="eyebrow">${R.smart ? "Smart practice · " : ""}${esc(L.title)} · ${playMode ? "Play it" : "Name it"}</span>
      <span class="qprog">Question ${R.i + 1} of ${total}</span>
      <span class="qscore">${R.checks ? `${R.correct} of ${R.checks} right` : "No answers yet"}</span>
      <button class="ghost small" data-act="end">End round</button>
    </div>
    <div class="bar"><i style="width:${((R.i + (Q.complete ? 1 : 0)) / total) * 100}%"></i></div>`;
  const title = playMode ? q.title : q.nameTitle;
  const sub = playMode ? q.sub : q.nameSub || "";
  let body = `<h2 class="prompt">${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}`;
  if (!playMode) body += builderView();
  const fb = Q.feedback ? `<p class="fb ${Q.feedback.kind}" role="status">${Q.feedback.html}</p>` : `<p class="fb" role="status"></p>`;
  const ready = playMode ? Q.sel.size > 0 : builderReady();
  const controls = `<div class="controls">
      <button data-act="hear" title="Space">▶ Play ${playMode ? "selection" : "keys"}</button>
      <button data-act="arp">Arpeggiate</button>
      ${playMode ? `<button data-act="clear" title="Esc">Clear</button>` : ""}
      <span class="spacer"></span>
      ${Q.complete
        ? `<button class="primary" data-act="next" title="Enter">${R.i + 1 < R.n ? "Next question" : "See results"} ⏎</button>`
        : `<button class="primary" data-act="check" title="Enter" ${ready ? "" : "disabled"}>Check ⏎</button>`}
    </div>`;
  return `<div class="quiz">${head}<div class="qbody">${body}</div>${fb}${controls}</div>`;
}

function builderView() {
  return `<div class="builder">${Q.q.fields.map((f) => `
    <div class="field"><span class="flabel">${esc(f.label)}</span>
      <div class="seg" role="group" aria-label="${esc(f.label)}">${f.opts.map((o) =>
        `<button data-act="pick" data-f="${f.id}" data-v="${o.v}" aria-pressed="${Q.ans[f.id] === o.v}" ${Q.complete ? "disabled" : ""}>${esc(o.t)}</button>`).join("")}</div>
    </div>`).join("")}</div>`;
}
const builderReady = () => Q.q.fields.every((f) => Q.ans[f.id] !== undefined);

/* ---------------- keyboard marks ---------------- */
function renderMarks() {
  const marks = new Map();
  const add = (m, k) => { if (!marks.has(m)) marks.set(m, []); marks.get(m).push(k); };
  if (view === "quiz" && Q) {
    const q = Q.q;
    if (R.mode === "play") {
      (q.given || []).forEach((m) => add(m, "given"));
      if (Q.reveal != null) q.targets[Q.reveal].notes.forEach((x) => add(x.m, "reveal"));
      (Q.wrongSel || []).forEach((m) => add(m, "bad"));
      if (Q.complete && Q.hit != null) q.targets[Q.hit].notes.forEach((x) => add(x.m, "ok"));
      Q.sel.forEach((m) => add(m, "sel"));
    } else {
      q.show.forEach((x) => add(x.m, Q.complete ? (Q.judged ? "ok" : "reveal") : "show"));
    }
  }
  kb.setMarks(marks);
}

/* ---------------- quiz flow ---------------- */
function startRound(i, m) {
  levelIdx = i; mode = m;
  R = { levelIdx: i, mode: m, n: ROUND, i: -1, checks: 0, correct: 0, seen: new Set(), misses: [], started: Date.now() };
  view = "quiz";
  nextQuestion();
  renderSidebar();
}

function startSmart(m) {
  mode = m;
  R = { smart: true, mode: m, n: ROUND, i: -1, checks: 0, correct: 0, seen: new Set(), again: [], misses: [], started: Date.now() };
  view = "quiz";
  nextQuestion();
  renderSidebar();
}

function nextQuestion() {
  R.i++;
  let q, li;
  if (R.smart) {
    store.progress.items ||= { play: {}, name: {} };
    ({ li, q } = adaptive.chooseQuestion({ levels: LEVELS, isOpen: unlocked, passedOf: passed, items: store.progress.items[R.mode], spelling: S().spelling, seen: R.seen, again: R.again, i: R.i }));
    R.seen.add(adaptive.itemId(LEVELS[li].id, q));
  } else {
    li = R.levelIdx;
    for (let tries = 0; tries < 40; tries++) {
      q = LEVELS[li].gen({ spelling: S().spelling });
      if (!R.seen.has(q.key)) break;
    }
    R.seen.add(q.key);
  }
  Q = { li, q, sel: new Set(), reveal: null, wrongSel: null, missed: false,
    complete: false, hit: null, ans: {}, judged: null, feedback: null };
  q.fields.forEach((f) => { if (f.def !== undefined) Q.ans[f.id] = f.def; });
  renderStage();
  // Bring the interesting part of the keyboard into view on narrow windows.
  const focus = R.mode === "play" ? q.given?.[0] : q.show[0]?.m;
  if (focus) kb.scrollTo(focus);
  if (R.mode === "name") setTimeout(() => play(q.show.map((x) => x.m), { arp: !!q.arp }), 120);
}

const namesOf = (notes) => notes.map((x) => nameAt(x.m, x.n, S().spelling)).join(" – ");
const fb = (kind, html) => { Q.feedback = { kind, html }; };

function nearest(sel) {
  const c = sel.reduce((a, b) => a + b, 0) / sel.length;
  let best = 0, bd = Infinity;
  Q.q.targets.forEach((t, i) => {
    const d = Math.abs(t.notes.reduce((a, x) => a + x.m, 0) / t.notes.length - c);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Remember how this exact item went on its first try, for adaptive practice.
function logItem(correct) {
  const items = (store.progress.items ||= { play: {}, name: {} })[R.mode];
  const id = adaptive.itemId(LEVELS[Q.li].id, Q.q);
  items[id] = adaptive.update(items[id], correct, Date.now(), (Q.q.title || "").replace(/^(Play|Click) /, "").slice(0, 48));
  adaptive.prune(items);
  if (!correct && R.smart) R.again.push({ li: Q.li, key: Q.q.key, at: R.i + 3 });
  store.saveProgress();
}

function check() {
  if (!Q || Q.complete) return;
  const q = Q.q;
  if (R.mode === "name") {
    if (!builderReady()) return;
    const ok = q.grade(Q.ans, S().spelling);
    Q.complete = true; Q.judged = ok; R.checks++; logItem(ok);
    if (ok) { R.correct++; fb("ok", `<b>Correct.</b> ${esc(q.answer)}`); }
    else { R.misses.push(q.answer); fb("bad", `<b>Not quite.</b> It's ${esc(q.answer)}`); }
    play(q.show.map((x) => x.m), { arp: !!q.arp });
    return renderStage();
  }
  const sel = [...Q.sel].sort((a, b) => a - b);
  if (!sel.length) return;
  const eq = (t) => t.notes.length === sel.length && t.notes.every((x, i) => x.m === sel[i]);

  const hit = q.targets.findIndex(eq);
  if (hit >= 0) {
    Q.complete = true; Q.hit = hit; Q.reveal = null; Q.sel.clear();
    if (!Q.missed) { R.checks++; R.correct++; logItem(true); fb("ok", `<b>Correct.</b> ${esc(namesOf(q.targets[hit].notes))}`); }
    else fb("fixed", `That's it: ${esc(namesOf(q.targets[hit].notes))}. It counts as a miss, but now it's in your hands.`);
    if (!Q.auto) play(sel, { arp: !!q.arp });
  } else {
    if (!Q.missed) { Q.missed = true; R.checks++; R.misses.push(q.title); logItem(false); }
    const n = nearest(sel);
    Q.reveal = n; Q.wrongSel = sel; Q.sel.clear();
    fb("bad", `<b>Not quite.</b> The answer is marked: ${esc(namesOf(q.targets[n].notes))}. Play it to continue.`);
    play(q.targets[n].notes.map((x) => x.m), { arp: !!q.arp });
  }
  renderStage();
}

function next() {
  if (!Q?.complete) return;
  clearTimeout(Q.advance);
  if (R.i + 1 < R.n) return nextQuestion();
  finishRound();
}

function logRound(level) {
  store.progress.history.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: Date.now(), level, mode: R.mode, correct: R.correct, total: R.checks });
}

function finishRound() {
  const score = R.checks ? R.correct / R.checks : 0;
  if (R.smart) {
    logRound("smart");
    store.saveProgress();
    result = { smart: true, mode: R.mode, score, correct: R.correct, checks: R.checks, misses: R.misses };
    view = "results"; R = null; Q = null;
    renderSidebar(); renderStage();
    return;
  }
  const L = LEVELS[R.levelIdx];
  const wasOpen = R.levelIdx + 1 < LEVELS.length && unlocked(R.levelIdx + 1);
  const p = store.progress;
  const lv = (p.levels[L.id] ||= {});
  const m = (lv[R.mode] ||= { best: 0, rounds: 0, lastAt: 0 });
  const best = score > m.best;
  m.best = Math.max(m.best, score); m.rounds++; m.lastAt = Date.now();
  logRound(L.id);
  store.saveProgress();
  result = { levelIdx: R.levelIdx, mode: R.mode, score, correct: R.correct, checks: R.checks, passed: score >= PASS, best,
    unlockedNext: !wasOpen && R.levelIdx + 1 < LEVELS.length && unlocked(R.levelIdx + 1), misses: R.misses };
  view = "results"; R = null; Q = null;
  renderSidebar(); renderStage();
}

/* ---------------- input ---------------- */
function onKey(m) {
  kb.flash(m);
  play([m]);
  toggleSel(m);
}

const canPick = () => view === "quiz" && Q && R.mode === "play" && !Q.complete;

// After the selection changes: drop stale feedback, redraw the keys, and enable Check.
function afterPick() {
  Q.wrongSel = null;
  if (Q.feedback && Q.feedback.kind !== "bad" && Q.feedback.kind !== "info") Q.feedback = null;
  renderMarks();
  const btn = $('[data-act="check"]');
  if (btn) btn.disabled = Q.sel.size === 0;
}

function toggleSel(m) {
  if (!canPick()) return;
  if (Q.sel.has(m)) Q.sel.delete(m); else Q.sel.add(m);
  afterPick();
}

// A controller or the computer keyboard: notes add up, and a full answer is checked and advanced on its own.
function noteIn(m, vel) {
  kb.hold(m, true);
  noteOn(m, vel);
  if (!S().auto) return toggleSel(m);
  if (!canPick()) return;
  Q.auto = true;
  Q.sel.add(m);
  afterPick();
  if (Q.sel.size < Q.q.targets[0].notes.length) return;
  check();
  if (Q.complete) {
    const t = Q;
    t.advance = setTimeout(() => { if (Q === t) next(); }, t.missed ? 1600 : 900);
  }
}

function hear(arp) {
  if (view !== "quiz" || !Q) return;
  const ms = R.mode === "play" ? [...Q.sel] : Q.q.show.map((x) => x.m);
  const fallback = R.mode === "play" && Q.reveal != null ? Q.q.targets[Q.reveal].notes.map((x) => x.m) : [];
  play(ms.length ? ms : fallback, { arp: arp || !!Q.q.arp });
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "level") { levelIdx = +b.dataset.i; view = "intro"; R = null; Q = null; renderSidebar(); renderStage(); }
  else if (a === "start") startRound(levelIdx, b.dataset.mode);
  else if (a === "smart") { view = "smart"; R = null; Q = null; renderSidebar(); renderStage(); }
  else if (a === "start-smart") startSmart(b.dataset.mode);
  else if (a === "check") check();
  else if (a === "next") next();
  else if (a === "clear") { Q.sel.clear(); Q.wrongSel = null; renderStage(); }
  else if (a === "hear") hear(false);
  else if (a === "arp") hear(true);
  else if (a === "end") { view = R.smart ? "smart" : "intro"; R = null; Q = null; renderStage(); renderSidebar(); }
  else if (a === "pick") {
    const f = Q.q.fields.find((x) => x.id === b.dataset.f);
    const o = f.opts.find((x) => String(x.v) === b.dataset.v);
    Q.ans[f.id] = o.v;
    renderStage();
  }
  else if (a === "settings") openSettings();
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select, dialog")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (view !== "quiz" || !Q) return;
  if (e.key === "Enter") { e.preventDefault(); Q.complete ? next() : check(); }
  else if (e.key === " ") { e.preventDefault(); hear(false); }
  else if (e.key === "Escape" && R.mode === "play") { Q.sel.clear(); Q.wrongSel = null; renderStage(); }
});

/* ---------------- settings dialog ---------------- */
function openSettings() {
  const d = $("#settings");
  const s = S();
  d.innerHTML = `<form method="dialog" class="settings">
    <div class="row spread"><h2>Settings</h2><button class="ghost" value="close" aria-label="Close">✕</button></div>
    <fieldset><legend>Note spelling</legend>
      <label><input type="radio" name="spelling" value="theory" ${s.spelling === "theory" ? "checked" : ""}> Theory-correct <span class="muted">F♯ in D major, E♯ and B♯ where they belong</span></label>
      <label><input type="radio" name="spelling" value="simple" ${s.spelling === "simple" ? "checked" : ""}> Simple <span class="muted">Everyday names; enharmonic answers count as right</span></label>
    </fieldset>
    <fieldset><legend>Keyboard</legend>
      <label><input type="checkbox" id="set-labels" ${s.labels ? "checked" : ""}> Show note names on the keys</label>
      <label><input type="checkbox" id="set-typing" ${s.typing ? "checked" : ""}> Play with the computer keyboard <span class="muted">A S D F G H J K L ; ' are white keys, W E T Y U O P are black. 1–8 set the octave.</span></label>
      <label><input type="checkbox" id="set-midi" ${s.midi ? "checked" : ""}> Use a MIDI controller <span class="muted" id="midi-status">${esc(midiText)}</span></label>
      <label><input type="checkbox" id="set-auto" ${s.auto ? "checked" : ""}> Hands-free play <span class="muted">With MIDI or the computer keyboard, a full answer is checked and the next question comes up by itself. Esc clears a wrong note.</span></label>
      <label class="vol">Volume <input type="range" id="set-volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
    </fieldset>
    <fieldset><legend>Levels</legend>
      <label><input type="checkbox" id="set-unlock" ${s.unlockAll ? "checked" : ""}> Unlock all levels <span class="muted">Skip ahead without passing</span></label>
    </fieldset>
    <fieldset><legend>Sync between computers</legend>
      ${store.connected ? `<p class="muted small">Connected. Progress and settings sync automatically.</p>
        <p class="small">Status: <span id="sync-status">${esc(store.status)}</span></p>
        <div class="row"><button type="button" id="sync-now">Sync now</button><button type="button" class="ghost" id="sync-off">Disconnect this browser</button></div>`
      : `<p class="muted small">Enter the sync key you set with <code>wrangler secret put SYNC_KEY</code>.</p>
        <div class="row"><input type="password" id="sync-key" placeholder="Sync key" autocomplete="current-password"><button type="button" class="primary" id="sync-on">Connect</button></div>
        <p class="small" id="sync-msg" role="status"></p>`}
    </fieldset>
  </form>`;
  d.showModal();
  d.querySelectorAll('input[name="spelling"]').forEach((r) => r.addEventListener("change", () => { s.spelling = r.value; save(); }));
  d.querySelector("#set-labels").addEventListener("change", (e) => { s.labels = e.target.checked; save(); });
  d.querySelector("#set-typing").addEventListener("change", (e) => { s.typing = e.target.checked; save(); });
  d.querySelector("#set-auto").addEventListener("change", (e) => { s.auto = e.target.checked; save(); });
  d.querySelector("#set-midi").addEventListener("change", (e) => { s.midi = e.target.checked; save(); });
  d.querySelector("#set-volume").addEventListener("input", (e) => { s.volume = +e.target.value; setVolume(s.volume); });
  d.querySelector("#set-volume").addEventListener("change", (e) => { s.volume = +e.target.value; save(); play([60, 64, 67]); });
  d.querySelector("#set-unlock").addEventListener("change", (e) => { s.unlockAll = e.target.checked; save(); renderSidebar(); if (view === "intro") renderStage(); });
  const on = d.querySelector("#sync-on");
  if (on) on.addEventListener("click", async () => {
    const k = d.querySelector("#sync-key").value.trim();
    const msg = d.querySelector("#sync-msg");
    if (!k) return d.querySelector("#sync-key").focus();
    on.disabled = true; on.textContent = "Connecting…";
    try { await store.connect(k); openSettings(); renderSidebar(); if (view !== "quiz") renderStage(); }
    catch (err) { on.disabled = false; on.textContent = "Connect"; msg.textContent = err.status === 401 ? "That sync key doesn't match." : "Couldn't reach the server. Check your connection."; }
  });
  const now = d.querySelector("#sync-now");
  if (now) now.addEventListener("click", () => store.syncNow());
  const off = d.querySelector("#sync-off");
  if (off) off.addEventListener("click", () => { store.disconnect(); openSettings(); });
  function save() { store.saveSettings(); applySettings(); }
}

/* ---------------- boot ---------------- */
applySettings();
levelIdx = nextUp();
renderSidebar();
renderStage();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// Read-only peek at the current state, for automated tests.
window.__pd = { state: () => ({ view, levelIdx, R, Q }) };
