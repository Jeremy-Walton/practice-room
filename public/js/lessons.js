// A short lesson for each level: a few points and mini-keyboard diagrams.
// Note strings: "E4:3*" = note, ":" degree label shown on the key, "*" = lowest note (bass).
import { LOW, HIGH } from "./theory.js";

const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FLAT_OF_SHARP = { "C♯": "D♭", "D♯": "E♭", "F♯": "G♭", "G♯": "A♭", "A♯": "B♭" };
const isBlackPc = (p) => [1, 3, 6, 8, 10].includes(p);

function parse(str) {
  const x = /^([A-G])([♯♭]?)(\d)(?::([^*]+))?(\*)?$/.exec(str);
  if (!x) throw new Error("Bad lesson note: " + str);
  const acc = x[2] === "♯" ? 1 : x[2] === "♭" ? -1 : 0;
  return { m: 12 * (+x[3] + 1) + BASE[x[1]] + acc, name: x[1] + x[2] + x[3], deg: x[4] || "", bass: !!x[5], base: x[1] + x[2] };
}

const KW = 26, KH = 84, BW = 16, BH = 52, TOP = 26;

function diagram({ notes, steps = [], from, to, label }) {
  const marks = notes.split(" ").map(parse);
  const lo = Math.min(...marks.map((k) => k.m)), hi = Math.max(...marks.map((k) => k.m));
  let a = from ? parse(from).m : lo, b = to ? parse(to).m : hi;
  while (isBlackPc(a % 12) || a < LOW) a--;
  while (isBlackPc(b % 12) || b > HIGH) b++;
  const count = () => { let n = 0; for (let m = a; m <= b; m++) if (!isBlackPc(m % 12)) n++; return n; };
  while (!to && count() < 8 && b < HIGH) { b++; while (isBlackPc(b % 12)) b++; }

  const whiteIdx = new Map();
  let w = 0;
  for (let m = a; m <= b; m++) if (!isBlackPc(m % 12)) whiteIdx.set(m, w++);
  const cx = (m) => (isBlackPc(m % 12) ? whiteIdx.get(m - 1) * KW + KW : whiteIdx.get(m) * KW + KW / 2);
  const extra = marks.some((k) => k.bass) ? 44 : marks.some((k) => FLAT_OF_SHARP[k.base] && !k.deg) ? 36 : marks.some((k) => isBlackPc(k.m % 12) && k.deg) ? 34 : 24;
  const W = w * KW, H = TOP + KH + extra;

  let svg = `<svg class="mini" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${label}">`;
  for (const [m, i] of whiteIdx) svg += `<rect class="wk" x="${i * KW + .5}" y="${TOP}" width="${KW - 1}" height="${KH}" rx="3"/>`;
  for (let m = a; m <= b; m++) if (isBlackPc(m % 12) && whiteIdx.has(m - 1) && whiteIdx.has(m + 1)) svg += `<rect class="bk" x="${cx(m) - BW / 2}" y="${TOP}" width="${BW}" height="${BH}" rx="2"/>`;

  marks.forEach((k, i) => {
    const black = isBlackPc(k.m % 12), x = cx(k.m), y = TOP + (black ? BH : KH) - (black ? 12 : 14), r = black ? 7 : 9;
    svg += `<circle class="dot${k.bass ? " bass" : ""}" cx="${x}" cy="${y}" r="${r}"/>`;
    if (k.deg) svg += `<text class="dg${k.bass ? " bass" : ""}" x="${x}" y="${y + 3.5}" font-size="${black ? 8.5 : 10}">${k.deg}</text>`;
    const ny = TOP + KH + 15 + (black && k.deg ? 12 : 0);
    svg += `<text class="nm" x="${x}" y="${ny}">${k.name}</text>`;
    const alt = FLAT_OF_SHARP[k.base];
    if (alt && !k.deg) svg += `<text class="nm alt" x="${x}" y="${ny + 13}">${alt}${k.name.slice(-1)}</text>`;
    if (k.bass) svg += `<text class="nm tag" x="${x}" y="${ny + 15}">bass</text>`;
    if (i > 0 && steps[i - 1]) {
      const x1 = cx(marks[i - 1].m) + 3, x2 = x - 3;
      svg += `<path class="st" d="M${x1} ${TOP - 4}V${TOP - 10}H${x2}V${TOP - 4}"/><text class="stt" x="${(x1 + x2) / 2}" y="${TOP - 14}">${steps[i - 1]}</text>`;
    }
  });
  return svg + "</svg>";
}

const INV = (c) => [
  { cap: "Root position: root in the bass", notes: c[0], focus: 0 },
  { cap: "1st inversion: 3rd in the bass", notes: c[1], focus: 1 },
  { cap: "2nd inversion: 5th in the bass", notes: c[2], focus: 2 },
];
const C_INV = INV(["C4:1* E4:3 G4:5", "E4:3* G4:5 C5:1", "G4:5* C5:1 E5:3"]);
const focusOn = (list, i) => list.map((d, k) => ({ ...d, dim: k !== i }));

const MAJOR_STEPS = ["W", "W", "H", "W", "W", "W", "H"];
const GAPS = "Gap trick: root position is 3rd + 3rd (evenly stacked). In 1st inversion the big gap is at the top. In 2nd inversion it is at the bottom.";

export const LESSONS = {
  "notes-white": {
    points: ["The white keys use the letters A to G, then repeat.", "C is the white key just left of each group of two black keys.", "F is the white key just left of each group of three."],
    demos: [{ cap: "C to C", notes: "C4 D4 E4 F4 G4 A4 B4 C5" }],
  },
  "notes-black": {
    points: ["Each black key sits between two white keys.", "It is the sharp (♯) of the note to its left and the flat (♭) of the note to its right.", "So one black key has two names: C♯ is also D♭."],
    demos: [{ cap: "The five black keys", notes: "C♯4 D♯4 F♯4 G♯4 A♯4", from: "C4", to: "C5" }],
  },
  "oct-specific": {
    points: ["The octave number goes up at every C. B3 is just below C4.", "Middle C is C4, near the middle of the keyboard.", "The keyboard runs from A0 at the far left to C8 at the far right."],
    demos: [{ cap: "Three C's: C3, middle C (C4), C5", notes: "C3 C4 C5" }],
  },
  "oct-every": {
    points: ["The same note repeats every 12 keys (7 white plus 5 black).", "Look for its place in the pattern of black keys, then find it in every octave."],
    demos: [{ cap: "Every C", notes: "C3 C4 C5" }, { cap: "Every E", notes: "E3 E4 E5" }],
  },
  "oct-interval": {
    points: ["An octave up or down is the same letter, 12 keys away.", "Count 8 white keys, counting both ends, or look for the same spot in the black-key pattern."],
    demos: [{ cap: "One octave", notes: "E3 E4", steps: ["octave"] }, { cap: "Two octaves", notes: "E3 E4 E5", steps: ["octave", "octave"] }],
  },
  "scale-major": {
    points: [
      "Every major scale follows the same pattern: W W H W W W H.",
      "W is a whole step: skip one key, white or black. H is a half step: the very next key.",
      "C major is all white keys. Other major scales use black keys to keep the same pattern.",
    ],
    demos: [
      { cap: "C major", notes: "C4:1 D4:2 E4:3 F4:4 G4:5 A4:6 B4:7 C5:8", steps: MAJOR_STEPS },
      { cap: "G major (F♯ keeps the pattern)", notes: "G4:1 A4:2 B4:3 C5:4 D5:5 E5:6 F♯5:7 G5:8", steps: MAJOR_STEPS },
    ],
  },
  "tri-root": {
    points: [
      "A triad is three notes: the root (1), the 3rd and the 5th. In a scale, play every other note: 1, 3, 5.",
      "Major triad: root to 3rd is 4 half steps, 3rd to 5th is 3.",
      "Minor triad: the same, but the middle note is lowered one key (3 then 4).",
    ],
    demos: [
      { cap: "C major: C E G", notes: "C4:1 E4:3 G4:5" },
      { cap: "C minor: C E♭ G", notes: "C4:1 E♭4:♭3 G4:5" },
    ],
  },
  "tri-1st": {
    points: [
      "1st inversion: 1 note moves from the bottom to the top. The root goes up and the 3rd is now lowest.",
      "Same three notes in a new order. C major becomes E G C.",
      "Name it by the bass note: 3rd in the bass is 1st inversion.",
    ],
    demos: focusOn(C_INV, 1),
  },
  "tri-2nd": {
    points: [
      "2nd inversion: 2 notes move from the bottom to the top. The root and 3rd go up, and the 5th is now lowest.",
      "C major becomes G C E.",
      "Name it by the bass note: 5th in the bass is 2nd inversion.",
    ],
    demos: focusOn(C_INV, 2),
  },
  "tri-inv": {
    points: ["Root position has the root at the bottom. 1st inversion has the 3rd at the bottom. 2nd inversion has the 5th at the bottom.", GAPS],
    demos: C_INV,
  },
  "key-major": {
    points: [
      "Build a triad on each note of a major scale by stacking every other scale note.",
      "The pattern is the same in every key: I ii iii IV V vi vii°.",
      "Capitals are major, lowercase are minor, and ° is diminished.",
    ],
    demos: [
      { cap: "I: C major", notes: "C4:1 E4:3 G4:5" },
      { cap: "ii: D minor", notes: "D4:1 F4:♭3 A4:5" },
      { cap: "vii°: B diminished", notes: "B3:1 D4:♭3 F4:♭5" },
    ],
  },
  "tri-dimaug": {
    points: ["Diminished: two minor 3rds stacked (3 + 3 half steps). It sounds tense.", "Augmented: two major 3rds stacked (4 + 4 half steps). It sounds open and unsettled.", "They keep the same inversion rules as major and minor."],
    demos: [
      { cap: "C diminished: C E♭ G♭", notes: "C4:1 E♭4:♭3 G♭4:♭5" },
      { cap: "C augmented: C E G♯", notes: "C4:1 E4:3 G♯4:♯5" },
    ],
  },
  sus: {
    points: ["Sus means suspended: the 3rd is replaced.", "sus2 swaps the 3rd for the 2nd. sus4 swaps it for the 4th.", "Neither is major or minor, because there is no 3rd."],
    demos: [
      { cap: "Csus2: C D G", notes: "C4:1 D4:2 G4:5" },
      { cap: "Csus4: C F G", notes: "C4:1 F4:4 G4:5" },
    ],
  },
  "scale-natural": {
    points: [
      "Natural minor pattern: W H W W H W W.",
      "It has the same notes as the major scale that starts on its 3rd. A minor uses the same keys as C major.",
      "Compared with major, the 3rd, 6th and 7th are lowered one key.",
    ],
    demos: [{ cap: "A natural minor", notes: "A4:1 B4:2 C5:3 D5:4 E5:5 F5:6 G5:7 A5:8", steps: ["W", "H", "W", "W", "H", "W", "W"] }],
  },
  "scale-hm": {
    points: [
      "Harmonic minor raises the 7th by one key. That makes a big 1½ step (W+H) between the 6th and 7th.",
      "Melodic minor (going up) raises both the 6th and 7th.",
    ],
    demos: [
      { cap: "A harmonic minor", notes: "A4:1 B4:2 C5:3 D5:4 E5:5 F5:6 G♯5:7 A5:8", steps: ["W", "H", "W", "W", "H", "W+H", "H"] },
      { cap: "A melodic minor (up)", notes: "A4:1 B4:2 C5:3 D5:4 E5:5 F♯5:6 G♯5:7 A5:8", steps: ["W", "H", "W", "W", "W", "W", "H"] },
    ],
  },
  "key-minor": {
    points: [
      "Natural minor triads: i ii° III iv v VI VII.",
      "Harmonic minor raises the 7th, so V becomes major and vii° is diminished. These two are the common borrowed chords.",
    ],
    demos: [
      { cap: "i: A minor", notes: "A4:1 C5:♭3 E5:5" },
      { cap: "V: E major (from harmonic minor)", notes: "E4:1 G♯4:3 B4:5" },
      { cap: "vii°: G♯ diminished", notes: "G♯4:1 B4:♭3 D5:♭5" },
    ],
  },
  "sev-root": {
    points: [
      "A seventh chord adds a 4th note, the 7th, on top of a triad: 1, 3, 5, 7.",
      "maj7: major triad plus a major 7th. 7: major triad plus a flat 7th. m7: minor triad plus a flat 7th.",
      "m7♭5 is minor with a flat 5th. °7 is a diminished triad with a double-flat 7th (the same key as a 6th).",
    ],
    demos: [
      { cap: "Cmaj7", notes: "C4:1 E4:3 G4:5 B4:7" },
      { cap: "C7", notes: "C4:1 E4:3 G4:5 B♭4:♭7" },
      { cap: "Cm7", notes: "C4:1 E♭4:♭3 G4:5 B♭4:♭7" },
    ],
  },
  "sev-inv": {
    points: [
      "Name the inversion by the bass note: 3rd is 1st inversion, 5th is 2nd inversion, 7th is 3rd inversion.",
      "Each inversion moves one more note from the bottom to the top.",
    ],
    demos: [
      { cap: "1st inversion: 3rd in the bass", notes: "E4:3* G4:5 B4:7 C5:1" },
      { cap: "2nd inversion: 5th in the bass", notes: "G4:5* B4:7 C5:1 E5:3" },
      { cap: "3rd inversion: 7th in the bass", notes: "B3:7* C4:1 E4:3 G4:5" },
    ],
  },
  slash: {
    points: [
      "A slash chord is written chord / bass. C/E means a C chord with E in the bass.",
      "If the bass is a chord note, it is just an inversion: C/E is 1st inversion, C/G is 2nd.",
      "If the bass is not in the chord, like C/D, play the bass note under the whole chord.",
    ],
    demos: [
      { cap: "C/E: 1st inversion", notes: "E4:3* G4:5 C5:1" },
      { cap: "C/D: D is not in the chord", notes: "D4:2* C5:1 E5:3 G5:5" },
    ],
  },
};

export function lessonHTML(id, open) {
  const L = LESSONS[id];
  if (!L) return "";
  const demos = L.demos.map((d) => `<figure class="demo${d.dim ? " dim" : ""}">${diagram({ ...d, label: d.cap })}<figcaption>${d.cap}</figcaption></figure>`).join("");
  return `<details class="lesson"${open ? " open" : ""}><summary>Quick lesson</summary>
    <ul>${L.points.map((p) => `<li>${p}</li>`).join("")}</ul>
    <div class="demos">${demos}</div></details>`;
}
