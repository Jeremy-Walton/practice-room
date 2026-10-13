// Music theory core: spelled notes, keyboard pitches, chords, scales.
// A spelled note is {l, a}: letter index 0-6 (C..B) and accidental (-2..2).
// A pitch on the keyboard is a MIDI number: A0 = 21, middle C (C4) = 60, C8 = 108.

export const LETTERS = "CDEFGAB";
const NAT = [0, 2, 4, 5, 7, 9, 11];
export const LOW = 21;
export const HIGH = 108;

export const mod12 = (x) => ((x % 12) + 12) % 12;
export const pc = (n) => mod12(NAT[n.l] + n.a);
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(mod12(m));
export const octOf = (m) => Math.floor(m / 12) - 1;

export function N(s) {
  const l = LETTERS.indexOf(s[0]);
  let a = 0;
  for (const ch of s.slice(1)) {
    if (ch === "#" || ch === "♯") a++;
    else if (ch === "b" || ch === "♭") a--;
    else if (ch === "𝄪") a += 2;
    else if (ch === "𝄫") a -= 2;
  }
  return { l, a };
}

export const accStr = (a) => (a === 2 ? "𝄪" : a === -2 ? "𝄫" : a > 0 ? "♯" : a < 0 ? "♭" : "");
export const spell = (n) => LETTERS[n.l] + accStr(n.a);

// Move up from n by `steps` letters and `semis` half steps, keeping correct spelling.
export function up(n, steps, semis) {
  const l = (n.l + steps) % 7;
  let d = mod12(pc(n) + semis - NAT[l]);
  if (d > 6) d -= 12;
  return { l, a: d };
}

export const midiOf = (n, oct) => 12 * (oct + 1) + NAT[n.l] + n.a;
// Octave number of a spelled note sounding at midi m (B♯3 sounds as C4's key).
export const spelledOct = (n, m) => Math.round((m - NAT[n.l] - n.a) / 12) - 1;

const SIMPLE = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const simpleName = (m) => SIMPLE[mod12(m)];
export const sciName = (m) => simpleName(m) + octOf(m);
export const maxAcc = (notes) => Math.max(0, ...notes.map((n) => Math.abs(n.a)));

// Simple mode keeps everyday names (G♯ in E major) but drops rare ones (E♯, C♭, double sharps).
const RARE = new Set(["E♯", "B♯", "C♭", "F♭"]);
export function display(n, m, spelling) {
  if (!n) return simpleName(m);
  const s = spell(n);
  if (spelling === "simple" && (Math.abs(n.a) > 1 || RARE.has(s))) return simpleName(m);
  return s;
}
// Name a pitch with its octave.
export function nameAt(m, n, spelling) {
  if (!n) return sciName(m);
  if (spelling === "simple" && (Math.abs(n.a) > 1 || RARE.has(spell(n)))) return sciName(m);
  return spell(n) + spelledOct(n, m);
}

// Stack spelled tones upward from a bass pitch, each the next matching key above the last.
export function stack(tones, bassMidi) {
  const out = [{ n: tones[0], m: bassMidi }];
  let prev = bassMidi;
  for (let i = 1; i < tones.length; i++) {
    let m = prev + 1;
    while (mod12(m) !== pc(tones[i])) m++;
    out.push({ n: tones[i], m });
    prev = m;
  }
  return out;
}

// Every placement of an ordered set of tones (bass first) that fits on 88 keys.
export function placements(tones) {
  const out = [];
  for (let o = -1; o <= 8; o++) {
    const bass = midiOf(tones[0], o);
    if (bass < LOW) continue;
    const v = stack(tones, bass);
    if (v[v.length - 1].m > HIGH) continue;
    out.push(v);
  }
  return out;
}

/* ---------------- chords ---------------- */

export const QUALITIES = {
  maj: { sym: "", word: "major", iv: [[0, 0], [2, 4], [4, 7]] },
  min: { sym: "m", word: "minor", iv: [[0, 0], [2, 3], [4, 7]] },
  dim: { sym: "°", word: "diminished", iv: [[0, 0], [2, 3], [4, 6]] },
  aug: { sym: "+", word: "augmented", iv: [[0, 0], [2, 4], [4, 8]] },
  sus2: { sym: "sus2", word: "sus2", iv: [[0, 0], [1, 2], [4, 7]] },
  sus4: { sym: "sus4", word: "sus4", iv: [[0, 0], [3, 5], [4, 7]] },
  maj7: { sym: "maj7", word: "major 7th", iv: [[0, 0], [2, 4], [4, 7], [6, 11]] },
  dom7: { sym: "7", word: "dominant 7th", iv: [[0, 0], [2, 4], [4, 7], [6, 10]] },
  min7: { sym: "m7", word: "minor 7th", iv: [[0, 0], [2, 3], [4, 7], [6, 10]] },
  hdim7: { sym: "m7♭5", word: "half-diminished 7th", iv: [[0, 0], [2, 3], [4, 6], [6, 10]] },
  dim7: { sym: "°7", word: "diminished 7th", iv: [[0, 0], [2, 3], [4, 6], [6, 9]] },
};
export const INVERSIONS = ["Root position", "1st inversion", "2nd inversion", "3rd inversion"];
export const INV_SHORT = ["Root", "1st", "2nd", "3rd"];

export const chordTones = (root, q) => QUALITIES[q].iv.map(([s, c]) => up(root, s, c));

// A chord: {root, q, inv, bass?}. `bass` is only set for a non-chord-tone bass (C/D).
export function orderedTones(c) {
  const t = chordTones(c.root, c.q);
  if (c.bass) {
    const i = t.findIndex((x) => pc(x) === pc(c.bass));
    if (i >= 0) return t.slice(i).concat(t.slice(0, i));
    return [c.bass, ...t];
  }
  const inv = c.inv || 0;
  return t.slice(inv).concat(t.slice(0, inv));
}

export function chordSymbol(c) {
  const t = chordTones(c.root, c.q);
  const base = spell(c.root) + QUALITIES[c.q].sym;
  if (c.bass) return base + "/" + spell(c.bass);
  if (c.inv) return base + "/" + spell(t[c.inv]);
  return base;
}

export function chordLongName(c) {
  const Q = QUALITIES[c.q];
  const word = ["maj", "min", "dim", "aug"].includes(c.q) ? `${spell(c.root)} ${Q.word}` : spell(c.root) + Q.sym;
  if (c.bass && !chordTones(c.root, c.q).some((x) => pc(x) === pc(c.bass))) return `${word} over ${spell(c.bass)}`;
  return c.inv ? `${word}, ${INVERSIONS[c.inv].toLowerCase()}` : word;
}

// Compare two ordered tone lists the way the spelling setting asks.
export function sameVoicing(a, b, spelling) {
  const key = spelling === "simple" ? (n) => String(pc(n)) : spell;
  if (key(a[0]) !== key(b[0])) return false;
  const sa = [...new Set(a.map(key))].sort().join(",");
  const sb = [...new Set(b.map(key))].sort().join(",");
  return sa === sb;
}

/* ---------------- scales ---------------- */

export const SCALES = {
  major: { word: "major", steps: [2, 2, 1, 2, 2, 2, 1] },
  natural: { word: "natural minor", steps: [2, 1, 2, 2, 1, 2, 2] },
  harmonic: { word: "harmonic minor", steps: [2, 1, 2, 2, 1, 3, 1] },
  melodic: { word: "melodic minor", steps: [2, 1, 2, 2, 2, 2, 1] },
};

// 8 spelled tones, root to root an octave up.
export function scaleTones(root, type) {
  const out = [root];
  let semis = 0;
  SCALES[type].steps.forEach((s, i) => {
    semis += s;
    out.push(up(root, i + 1, semis));
  });
  return out;
}

export function scalePlacements(root, type) {
  const tones = scaleTones(root, type);
  const cum = [0];
  SCALES[type].steps.forEach((s) => cum.push(cum[cum.length - 1] + s));
  const out = [];
  for (let o = -1; o <= 8; o++) {
    const start = midiOf(root, o);
    if (start < LOW || start + 12 > HIGH) continue;
    out.push(tones.map((n, i) => ({ n, m: start + cum[i] })));
  }
  return out;
}

// Quality of a stacked triad from its intervals.
export function triadQuality(t) {
  const i3 = mod12(pc(t[1]) - pc(t[0]));
  const i5 = mod12(pc(t[2]) - pc(t[0]));
  if (i3 === 4 && i5 === 7) return "maj";
  if (i3 === 3 && i5 === 7) return "min";
  if (i3 === 3 && i5 === 6) return "dim";
  if (i3 === 4 && i5 === 8) return "aug";
  return null;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
export function numeral(deg, q) {
  const r = ROMAN[deg];
  if (q === "maj") return r;
  if (q === "min") return r.toLowerCase();
  if (q === "dim") return r.toLowerCase() + "°";
  if (q === "aug") return r + "+";
  return r;
}

// Triad built on a scale degree (0-based) of a 7-note scale.
export function diatonicTriad(scale7, deg) {
  const t = [scale7[deg], scale7[(deg + 2) % 7], scale7[(deg + 4) % 7]];
  return { tones: t, q: triadQuality(t), root: t[0] };
}
