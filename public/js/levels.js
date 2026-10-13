// The level ladder: each level generates questions that work both ways.
//   Play it: the prompt names something; you click the keys (targets).
//   Name it: keys are shown; you build the name from parts (fields + grade).
// A chord or scale has one target per octave and any one of them counts.

import {
  N, spell, pc, mod12, isBlack, octOf, LOW, HIGH, LETTERS, midiOf, simpleName,
  QUALITIES, INV_SHORT, INVERSIONS, up, chordTones, orderedTones, placements, chordSymbol, chordLongName, sameVoicing,
  SCALES, scaleTones, scalePlacements, diatonicTriad, numeral, maxAcc, display,
} from "./theory.js";

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];

const MAJ_ROOTS = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"].map(N);
const MIN_ROOTS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"].map(N);
const MINORISH = ["min", "dim", "min7", "hdim7", "dim7"];
const rootsFor = (q) => (MINORISH.includes(q) ? MIN_ROOTS : MAJ_ROOTS);

/* ---------- answer-builder fields ---------- */
const F = {
  letter: (label = "Note") => ({ id: "letter", label, opts: [...LETTERS].map((t, v) => ({ v, t })) }),
  acc: (label = "Accidental") => ({ id: "acc", label, def: 0, opts: [{ v: -1, t: "♭" }, { v: 0, t: "♮" }, { v: 1, t: "♯" }] }),
  octave: () => ({ id: "octave", label: "Octave", opts: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => ({ v, t: String(v) })) }),
  quality: (qs) => ({ id: "q", label: "Quality", opts: qs.map((v) => ({ v, t: qualityLabel(v) })) }),
  inv: (n) => ({ id: "inv", label: "Inversion", def: 0, opts: INV_SHORT.slice(0, n).map((t, v) => ({ v, t: v ? `${t} inversion · ${BASS_DEGREE[v]} in bass` : "Root position" })) }),
  bassLetter: () => ({ id: "bl", label: "Bass note", opts: [...LETTERS].map((t, v) => ({ v, t })) }),
  bassAcc: () => ({ id: "ba", label: "Bass accidental", def: 0, opts: [{ v: -1, t: "♭" }, { v: 0, t: "♮" }, { v: 1, t: "♯" }] }),
  scale: (types) => ({ id: "scale", label: "Scale", opts: types.map((v) => ({ v, t: SCALES[v].word })) }),
  numeral: (list) => ({ id: "num", label: "Chord", opts: list.map((v) => ({ v, t: v })) }),
  apart: () => ({ id: "apart", label: "Distance", opts: [{ v: 1, t: "1 octave" }, { v: 2, t: "2 octaves" }, { v: 3, t: "3 octaves" }, { v: 0, t: "Not the same note" }] }),
};
function qualityLabel(q) {
  return { maj: "Major", min: "Minor", dim: "Diminished °", aug: "Augmented +", sus2: "sus2", sus4: "sus4",
    maj7: "maj7", dom7: "7", min7: "m7", hdim7: "m7♭5", dim7: "°7" }[q];
}
const BASS_DEGREE = ["root", "3rd", "5th", "7th"];
const DEGREE_NAME = { 0: "root", 1: "2nd", 2: "3rd", 3: "4th", 4: "5th", 6: "7th" };
const STEP_WORD = { 1: "H", 2: "W", 3: "W+H" };
const ansNote = (ans) => ({ l: ans.letter, a: ans.acc ?? 0 });

const notesText = (notes, spelling) => notes.map((x) => display(x.n, x.m, spelling)).join(" – ");

// Choose a placement in the middle of the keyboard for "Name it" questions.
function middlePlacement(list) {
  const mid = list.filter((v) => v[0].m >= 36 && v[v.length - 1].m <= 88);
  return pick(mid.length ? mid : list);
}

const WHITE_LETTER = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const SHARP_LETTER = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
const FLAT_LETTER = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
const sharpOf = (p) => ({ l: SHARP_LETTER[p], a: 1 });
const flatOf = (p) => ({ l: FLAT_LETTER[p], a: -1 });
// A spelled name for a lone key: naturals as-is, black keys as sharp or flat at random.
function noteSpelling(m) {
  const p = mod12(m);
  if (!isBlack(m)) return { l: WHITE_LETTER[p], a: 0 };
  return Math.random() < 0.5 ? sharpOf(p) : flatOf(p);
}
function lonely(m, spelling) {
  if (spelling === "simple") return N(simpleName(m));
  return noteSpelling(m);
}
const allOf = (p) => { const out = []; for (let m = LOW; m <= HIGH; m++) if (mod12(m) === p) out.push(m); return out; };

/* ---------- chord question builder (shared by most chord levels) ---------- */
function chordQuestion(c, { fields, title, sub, spelling, prefix = "" }) {
  const tones = orderedTones(c);
  const list = placements(tones);
  const show = middlePlacement(list);
  const sym = chordSymbol(c);
  const iv = QUALITIES[c.q].iv;
  const degrees = tones.map((_, k) => DEGREE_NAME[iv[((c.inv || 0) + k) % iv.length][0]]);
  const order = degrees.join(", ");
  const how = c.inv ? `${INVERSIONS[c.inv]}: ${degrees[0]} in the bass` : "Root position";
  return {
    key: sym + c.q + (c.inv || 0),
    title: title || `Play ${chordLongName(c)}`,
    sub: sub || `${how} (low to high: ${order}) · any octave`,
    targets: list.map((v) => ({ notes: v })),
    nameTitle: `${prefix}Name this chord`,
    nameSub: "Build the name from its parts",
    show,
    fields,
    answer: `${sym} · ${chordLongName(c)} (${notesText(show, spelling)})`,
    grade(ans, sp) {
      if (ans.letter == null || !ans.q) return false;
      const a = { root: ansNote(ans), q: ans.q, inv: ans.inv || 0 };
      if (ans.bl != null) a.bass = { l: ans.bl, a: ans.ba ?? 0 }, a.inv = 0;
      const at = orderedTones(a);
      if (a.inv >= at.length) return false;
      return sameVoicing(at, tones, sp);
    },
  };
}

function randomChord(qs, invs) {
  for (let i = 0; i < 50; i++) {
    const q = pick(qs);
    const root = pick(rootsFor(q));
    const t = chordTones(root, q);
    if (maxAcc(t) > 1) continue;
    const inv = pick(invs.filter((x) => x < t.length));
    return { root, q, inv };
  }
  return { root: N("C"), q: "maj", inv: 0 };
}

/* ---------- the ladder ---------- */
export const LEVELS = [
  {
    id: "notes-white", group: "Notes", title: "White keys",
    desc: "Find and name the natural notes, C through B, anywhere on the keyboard.",
    gen({ spelling }) {
      const l = rand(7), n = { l, a: 0 }, p = pc(n);
      const all = allOf(p);
      const show = pick(all.filter((m) => m >= 36 && m <= 84));
      return {
        key: "w" + l, any: true, title: `Click any ${spell(n)}`, sub: "Any octave",
        targets: all.map((m) => ({ notes: [{ n, m }] })),
        nameTitle: "Name this note", show: [{ n, m: show }],
        fields: [F.letter(), F.acc()], answer: spell(n),
        grade: (a) => a.letter != null && pc(ansNote(a)) === p,
      };
    },
  },
  {
    id: "notes-black", group: "Notes", title: "Black keys",
    desc: "Sharps and flats. On its own, a black key can go by either name.",
    gen({ spelling }) {
      const p = pick([1, 3, 6, 8, 10]);
      const all = allOf(p);
      const n = lonely(all[0], spelling);
      const show = pick(all.filter((m) => m >= 36 && m <= 84));
      const both = `${spell(sharpOf(p))} / ${spell(flatOf(p))}`;
      return {
        key: "b" + p + n.a, any: true, title: `Click any ${spell(n)}`, sub: "Any octave",
        targets: all.map((m) => ({ notes: [{ n, m }] })),
        nameTitle: "Name this note", show: [{ n, m: show }],
        fields: [F.letter(), F.acc()], answer: both,
        grade: (a) => a.letter != null && pc(ansNote(a)) === p,
      };
    },
  },
  {
    id: "oct-specific", group: "Octaves", title: "Exact notes",
    desc: "Find a note in a specific octave. Middle C is C4; octaves start on C.",
    gen({ spelling }) {
      const m = LOW + rand(HIGH - LOW + 1);
      const n = lonely(m, spelling);
      const label = spell(n) + octOf(m);
      return {
        key: "o" + m, title: `Click ${label}`, sub: "Middle C is C4",
        targets: [{ notes: [{ n, m }] }],
        nameTitle: "Name this note and its octave", show: [{ n, m }],
        fields: [F.letter(), F.acc(), F.octave()], answer: label,
        grade: (a) => a.letter != null && a.octave != null && midiOf(ansNote(a), a.octave) === m,
      };
    },
  },
  {
    id: "oct-every", group: "Octaves", title: "Every instance",
    desc: "Find a note everywhere it appears, from the bottom of the keyboard to the top.",
    gen({ spelling }) {
      const p = rand(12);
      const all = allOf(p);
      const n = lonely(all[0], spelling);
      const notes = all.map((m) => ({ n, m }));
      return {
        key: "e" + p, title: `Click every ${spell(n)}`, sub: `All ${all.length} of them, then check`,
        targets: [{ notes }],
        nameTitle: "Which note is marked everywhere?", show: notes,
        fields: [F.letter(), F.acc()], answer: spelling === "simple" ? simpleName(p) : spell(n),
        grade: (a) => a.letter != null && pc(ansNote(a)) === p,
      };
    },
  },
  {
    id: "oct-interval", group: "Octaves", title: "Octave jumps",
    desc: "The same note one, two or three octaves above or below a marked key.",
    gen({ spelling }) {
      let base, k, dir;
      do { base = LOW + rand(HIGH - LOW + 1); k = 1 + rand(3); dir = Math.random() < 0.5 ? 1 : -1; }
      while (base + dir * 12 * k < LOW || base + dir * 12 * k > HIGH);
      const n = lonely(base, spelling);
      const target = base + dir * 12 * k;
      // Name it: sometimes the pair is close to an octave but not the same note.
      let other = target, apart = k;
      if (Math.random() < 0.3) {
        const off = pick([-2, -1, 1, 2]);
        if (other + off >= LOW && other + off <= HIGH) { other += off; apart = 0; }
      }
      const words = k === 1 ? "1 octave" : `${k} octaves`;
      return {
        key: `j${base}${k}${dir}${apart}`,
        title: `Click the note ${words} ${dir > 0 ? "above" : "below"} the marked key`,
        sub: `The marked key is ${spell(n)}${octOf(base)}`,
        given: [base],
        targets: [{ notes: [{ n, m: target }] }],
        nameTitle: "How far apart are the two marked keys?", show: [{ n, m: base }, { n: lonely(other, spelling), m: other }],
        fields: [F.apart()],
        answer: apart ? `Same note, ${apart === 1 ? "1 octave" : apart + " octaves"} apart` : `Not the same note (${simpleName(base)} and ${simpleName(other)})`,
        grade: (a) => a.apart === apart,
      };
    },
  },
  scaleLevel("scale-major", "Major scales", "All twelve major scales, one octave up from the root.", ["major"]),
  chordLevel("tri-root", "Triads", "Major & minor triads", "Root, 3rd and 5th. Major has a 4-then-3 half-step pattern; minor swaps it to 3-then-4.", ["maj", "min"], [0], 0),
  chordLevel("tri-1st", "Triads", "1st inversion", "Move the root from the bottom to the top. The 3rd is now the lowest note.", ["maj", "min"], [1], 3),
  chordLevel("tri-2nd", "Triads", "2nd inversion", "Move the root and the 3rd to the top. The 5th is now the lowest note.", ["maj", "min"], [2], 3),
  chordLevel("tri-inv", "Triads", "Triad inversions mixed", "Root position, 1st inversion (3rd in the bass) and 2nd inversion (5th in the bass), all mixed together.", ["maj", "min"], [0, 1, 2], 3),
  {
    id: "key-major", group: "Triads in a key", title: "Triads in major keys",
    desc: "I ii iii IV V vi vii°: the seven triads built on a major scale.",
    gen({ spelling }) {
      let key, sc;
      do { key = pick(MAJ_ROOTS); sc = scaleTones(key, "major").slice(0, 7); } while (maxAcc(sc) > 1);
      const deg = rand(7);
      const t = diatonicTriad(sc, deg);
      const num = numeral(deg, t.q);
      const c = { root: t.root, q: t.q, inv: 0 };
      const q = chordQuestion(c, {
        spelling, fields: [F.numeral(["I", "ii", "iii", "IV", "V", "vi", "vii°"])],
        title: `In ${spell(key)} major, play the ${num} chord`, sub: "Root position, in any octave",
        prefix: `In ${spell(key)} major: `,
      });
      q.key = spell(key) + num;
      q.nameTitle = `In ${spell(key)} major, which chord is this?`;
      q.answer = `${num} = ${chordSymbol(c)} (${notesText(q.show, spelling)})`;
      q.grade = (a) => a.num === num;
      return q;
    },
  },
  chordLevel("tri-dimaug", "More chords", "Diminished & augmented", "Stacked minor 3rds and stacked major 3rds, with their inversions.", ["dim", "aug"], [0, 1, 2], 3),
  chordLevel("sus", "More chords", "Sus2 & sus4", "The 3rd replaced by the 2nd or the 4th. Root position.", ["sus2", "sus4"], [0], 0),
  scaleLevel("scale-natural", "Natural minor scales", "The relative minor of each major key: same notes, starting on the 6th.", ["natural"]),
  scaleLevel("scale-hm", "Harmonic & melodic minor", "Harmonic raises the 7th. Melodic (ascending) raises the 6th and 7th.", ["harmonic", "melodic"]),
  {
    id: "key-minor", group: "Minor keys", title: "Triads in minor keys",
    desc: "i ii° III iv v VI VII, plus V and vii° borrowed from harmonic minor.",
    gen({ spelling }) {
      for (;;) {
        const key = pick(MIN_ROOTS);
        const nat = scaleTones(key, "natural").slice(0, 7);
        const har = scaleTones(key, "harmonic").slice(0, 7);
        if (maxAcc(nat) > 1 || maxAcc(har) > 1) continue;
        const choice = pick([0, 1, 2, 3, 4, 5, 6, "V", "vii"]);
        const fromHarm = choice === "V" || choice === "vii";
        const deg = choice === "V" ? 4 : choice === "vii" ? 6 : choice;
        const t = diatonicTriad(fromHarm ? har : nat, deg);
        const num = numeral(deg, t.q);
        const c = { root: t.root, q: t.q, inv: 0 };
        const q = chordQuestion(c, {
          spelling, fields: [F.numeral(["i", "ii°", "III", "iv", "v", "V", "VI", "VII", "vii°"])],
          title: `In ${spell(key)} minor, play the ${num} chord`,
          sub: fromHarm ? "From harmonic minor (raised 7th) · root position, any octave" : "Root position, in any octave",
        });
        q.key = spell(key) + "m" + num;
        q.nameTitle = `In ${spell(key)} minor, which chord is this?`;
        q.answer = `${num} = ${chordSymbol(c)} (${notesText(q.show, spelling)})`;
        q.grade = (a) => a.num === num;
        return q;
      }
    },
  },
  chordLevel("sev-root", "Beyond triads", "Seventh chords", "maj7, 7, m7, m7♭5 and °7 in root position.", ["maj7", "dom7", "min7", "hdim7", "dim7"], [0], 0),
  chordLevel("sev-inv", "Beyond triads", "Seventh chord inversions", "1st, 2nd and 3rd inversion: the 3rd, 5th or 7th in the bass.", ["maj7", "dom7", "min7", "hdim7", "dim7"], [1, 2, 3], 4),
  {
    id: "slash", group: "Beyond triads", title: "Slash chords",
    desc: "Inversions written as slash chords (C/E), and chords over a non-chord bass (C/D, F/G, C/B♭).",
    gen({ spelling }) {
      for (;;) {
        const q = Math.random() < 0.7 ? "maj" : "min";
        const root = pick(rootsFor(q));
        const t = chordTones(root, q);
        let c;
        if (Math.random() < 0.5) c = { root, q, inv: pick([1, 2]) };
        else c = { root, q, inv: 0, bass: pick([[1, 2], [3, 5], [6, 10]].map(([s, x]) => up(root, s, x))) };
        const all = c.bass ? [...t, c.bass] : t;
        if (maxAcc(all) > 1) continue;
        const sym = chordSymbol(c);
        const tones = orderedTones(c);
        const bassName = spell(tones[0]);
        const q2 = chordQuestion(c, {
          spelling, fields: [F.letter("Chord root"), F.acc(), F.quality(["maj", "min"]), F.bassLetter(), F.bassAcc()],
          title: `Play ${sym}`, sub: `${spell(root)} ${QUALITIES[q].word} over ${bassName} in the bass · any octave`,
        });
        q2.key = sym;
        return q2;
      }
    },
  },
];

function chordLevel(id, group, title, desc, qs, invs, invFields) {
  return {
    id, group, title, desc,
    gen({ spelling }) {
      const c = randomChord(qs, invs);
      const fields = [F.letter("Root"), F.acc(), F.quality(qs)];
      if (invFields) fields.push(F.inv(invFields));
      return chordQuestion(c, { spelling, fields });
    },
  };
}

function scaleLevel(id, title, desc, types) {
  return {
    id, group: types.includes("major") ? "Major scale" : "Minor scales", title, desc, arp: true,
    gen({ spelling }) {
      let root, type, tones;
      const pool = types.includes("major") ? MAJ_ROOTS : MIN_ROOTS;
      do { root = pick(pool); type = pick(types); tones = scaleTones(root, type); } while (maxAcc(tones) > 1);
      const list = scalePlacements(root, type);
      const show = middlePlacement(list);
      const word = SCALES[type].word;
      const fields = [F.letter("Starting note"), F.acc()];
      if (types.length > 1) fields.push(F.scale(types));
      return {
        key: spell(root) + type, arp: true,
        title: `Play ${spell(root)} ${word}`, sub: `Pattern ${SCALES[type].steps.map((x) => STEP_WORD[x]).join(" ")} · 8 notes up from ${spell(root)}, any octave`,
        targets: list.map((v) => ({ notes: v })),
        nameTitle: types.length > 1 ? "Name this scale" : `Name this ${word} scale`, nameSub: "It starts on the lowest marked key",
        show, fields,
        answer: `${spell(root)} ${word}: ${notesText(show, spelling)}`,
        grade(a, sp) {
          if (a.letter == null) return false;
          const r = ansNote(a);
          const okRoot = sp === "simple" ? pc(r) === pc(root) : r.l === root.l && r.a === root.a;
          return okRoot && (types.length === 1 || a.scale === type);
        },
      };
    },
  };
}

