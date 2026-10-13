// Adaptive practice. Every exact item (like "B♭ major, 1st inversion") gets a memory strength that
// grows with correct first tries, drops on misses, and fades with time. Questions favor weak and
// forgotten items, and new items come in only while you have few items still being learned.
const DAY = 864e5;
const MASTERED = 0.85;
const LEARNING_CAP = 5;      // new items are held back while this many are still being learned
const LEVEL_FULL = 12;       // item-strengths that count as full mastery of a level
const PREVIEW_AT = 0.7;      // mastery of the newest open level before the next one starts to appear
const PREVIEW_SHARE = 0.12;
const MAX_ITEMS = 800;

export const itemId = (levelId, q) => `${levelId}:${q.key}`;

// Chance of getting this item right now.
export function recall(rec, now) {
  return rec.s * Math.pow(2, -Math.max(0, now - rec.t) / DAY / rec.d);
}

// rec: {n tries, c correct, s strength, d stability in days, t last seen, l label}
export function update(rec, correct, now, label) {
  const p = rec ? recall(rec, now) : 0;
  const base = rec || { n: 0, c: 0, s: 0, d: 0.5 };
  const out = { n: base.n + 1, c: base.c + (correct ? 1 : 0), t: now, l: label || rec?.l || "" };
  if (correct) {
    out.s = p + (1 - p) * (base.n ? 0.4 : 0.5);
    out.d = Math.min(60, base.d * (1.6 + 0.8 * (1 - p)));
  } else {
    out.s = p * 0.4;
    out.d = Math.max(0.4, base.d * 0.5);
  }
  return out;
}

export function prune(items) {
  const ids = Object.keys(items);
  if (ids.length <= MAX_ITEMS + 50) return;
  const now = Date.now();
  ids.sort((a, b) => recall(items[b], now) - recall(items[a], now) || items[a].t - items[b].t);
  ids.slice(0, ids.length - MAX_ITEMS).forEach((id) => delete items[id]);
}

const inLevel = (items, levelId) => Object.keys(items).filter((id) => id.startsWith(levelId + ":"));

// 0..1: how much of a level you know. Passing the level counts as a head start.
export function levelMastery(items, levelId, passed, now) {
  const sum = inLevel(items, levelId).reduce((a, id) => a + recall(items[id], now), 0);
  return Math.max(Math.min(1, sum / LEVEL_FULL), passed ? 0.5 : 0);
}

export function summary(items, now) {
  let mastered = 0, learning = 0;
  for (const r of Object.values(items)) (recall(r, now) >= MASTERED ? mastered++ : learning++);
  return { mastered, learning, seen: mastered + learning };
}

export function weakest(items, now, count = 5) {
  return Object.entries(items)
    .map(([id, r]) => ({ id, label: r.l, p: recall(r, now), n: r.n }))
    .filter((x) => x.p < MASTERED)
    .sort((a, b) => a.p - b.p)
    .slice(0, count);
}

const accidentals = (s) => (s.match(/[♯♭]/g) || []).length;
const weighted = (list, w) => {
  let r = Math.random() * list.reduce((a, x) => a + w(x), 0);
  for (const x of list) { r -= w(x); if (r <= 0) return x; }
  return list[list.length - 1];
};

// Pick the next question: a missed item coming back, or the best-scoring candidate from a weighted level.
export function chooseQuestion({ levels, isOpen, passedOf, items, spelling, seen, again, i }) {
  const now = Date.now();
  const gen = (li) => levels[li].gen({ spelling });

  const due = again.find((a) => a.at <= i);
  if (due) {
    again.splice(again.indexOf(due), 1);
    for (let t = 0; t < 400; t++) {
      const q = gen(due.li);
      if (q.key === due.key) return { li: due.li, q };
    }
  }

  const open = [];
  for (let k = 0; k < levels.length; k++) if (isOpen(k)) open.push(k);
  const idOf = (k) => levels[k].id;

  // Review or something new? While several items are still being learned, mostly review.
  const known = [];
  open.forEach((k) => inLevel(items, idOf(k)).forEach((id) => { if (!seen.has(id)) known.push({ k, id, need: 1 - recall(items[id], now) }); }));
  const learning = known.length + [...seen].filter((id) => items[id] && recall(items[id], now) < MASTERED).length;
  const pNew = learning >= LEARNING_CAP ? 0.1 : learning <= 1 ? 0.9 : 0.45;
  if (known.length && Math.random() >= pNew) {
    const pool = known.sort((a, b) => b.need - a.need).slice(0, 25);
    const pick = weighted(pool, (x) => Math.pow(x.need, 1.5) + 0.02);
    for (let t = 0; t < 400; t++) {
      const q = gen(pick.k);
      if (itemId(idOf(pick.k), q) === pick.id) return { li: pick.k, q };
    }
  }

  const mastery = new Map(open.map((k) => [k, levelMastery(items, idOf(k), passedOf(k), now)]));
  const weights = open.map((k) => ({ k, w: 0.15 + Math.pow(1 - mastery.get(k), 2) }));
  const top = open[open.length - 1];
  if (top + 1 < levels.length && mastery.get(top) >= PREVIEW_AT) {
    weights.push({ k: top + 1, w: PREVIEW_SHARE * weights.reduce((a, x) => a + x.w, 0) });
  }
  const li = weighted(weights, (x) => x.w).k;

  // A new item: favor ones with fewer accidentals first.
  const cands = [];
  for (let t = 0; t < 40 && cands.length < 8; t++) {
    const q = gen(li);
    const id = itemId(idOf(li), q);
    if (!seen.has(id) && !items[id] && !cands.some(([x]) => x === id)) cands.push([id, q]);
  }
  if (!cands.length) return { li, q: gen(li) };
  const [, q] = weighted(cands, ([, q]) => Math.pow(0.75, accidentals(q.title || "")) * (/inversion/.test(q.title || "") ? 0.9 : 1));
  return { li, q };
}
