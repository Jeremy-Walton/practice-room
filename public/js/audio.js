// A small synthesized piano: a few harmonics with a struck-string envelope.
let ctx = null;
let master = null;
let volume = 0.7;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function voice(m, when, level) {
  const f = freq(m);
  const dur = Math.max(0.9, 3.2 - (m - 21) * 0.03);
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.min(12000, f * 9), when);
  lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 3), when + dur * 0.6);
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(level, when + 0.006);
  out.gain.exponentialRampToValueAtTime(level * 0.35, when + 0.25);
  out.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  lp.connect(out).connect(master);
  [[1, 1, "triangle"], [2, 0.35, "sine"], [3, 0.12, "sine"], [4, 0.06, "sine"]].forEach(([h, g, type]) => {
    if (f * h > 16000) return;
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = f * h;
    o.detune.value = (Math.random() - 0.5) * 4;
    og.gain.value = g;
    o.connect(og).connect(lp);
    o.start(when);
    o.stop(when + dur + 0.05);
  });
}

// Play keys together, or one after another (arpeggio / scale).
export function play(midis, { arp = false, gap = 0.16 } = {}) {
  if (!midis || !midis.length || !ensure()) return;
  const sorted = [...midis].sort((a, b) => a - b);
  const t0 = ctx.currentTime + 0.01;
  const level = arp ? 0.32 : 0.32 / Math.sqrt(sorted.length);
  sorted.forEach((m, i) => voice(m, arp ? t0 + i * gap : t0, level));
}
