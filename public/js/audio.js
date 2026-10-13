// Piano sound: recordings of a Yamaha C5 grand (Salamander Grand Piano, CC-BY 3.0), one every
// 3 semitones, pitch-shifted to fill the gaps. Velocity (0..1) changes loudness and brightness.
// Until the recordings load, a small synthesized voice plays instead.
let ctx = null;
let master = null;
let noise = null;
let volume = 0.7;

const ROOTS = Array.from({ length: 30 }, (_, i) => 21 + i * 3);
const sampleUrl = (m) => {
  const name = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" }[m % 12];
  return `/samples/${name}${Math.floor(m / 12) - 1}.mp3`;
};
const raw = new Map();      // midi -> ArrayBuffer, fetched before the audio context exists
const buffers = new Map();  // midi -> AudioBuffer

ROOTS.forEach((m) => {
  fetch(sampleUrl(m)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) { raw.set(m, b); if (ctx) decode(m); } }).catch(() => {});
});

function decode(m) {
  const b = raw.get(m);
  if (!b || buffers.has(m)) return;
  raw.delete(m);
  ctx.decodeAudioData(b).then((buf) => buffers.set(m, buf)).catch(() => {});
}

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
  for (const m of [...raw.keys()]) decode(m);
  return ctx;
}

// Browsers only start audio after a gesture, and MIDI messages are not one.
["pointerdown", "keydown"].forEach((t) => document.addEventListener(t, ensure, { once: true, capture: true }));
export const unlockAudio = ensure;

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function synthVoice(m, when, vel) {
  const f = freq(m);
  const v = Math.max(0.02, Math.min(1, vel));
  const level = 0.34 * Math.pow(v, 1.6) + 0.012;
  const out = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.value = Math.max(-0.6, Math.min(0.6, (m - 64) / 50)); out.connect(pan).connect(master); }
  else out.connect(master);

  const tauFund = 0.8 + 3.2 * Math.pow(0.5, (m - 21) / 30);
  const B = 0.00008 + Math.pow((m - 21) / 87, 3) * 0.0025;
  const count = Math.min(14, Math.floor(15000 / f));
  const parts = [];
  let total = 0;
  for (let n = 1; n <= count; n++) {
    const strike = Math.max(0.12, Math.abs(Math.sin(Math.PI * n * 0.13))); // hammer hits 13% along the string
    const a = (strike / Math.pow(n, 0.9)) * Math.pow(0.45 + 0.55 * v, (n - 1) * 0.55);
    parts.push({ n, a });
    total += a;
  }
  const oscs = [];
  const end = when + Math.min(12, tauFund * 6);
  for (const { n, a } of parts) {
    const amp = (a / total) * level * 3.2;
    const tau = tauFund / (1 + 0.55 * (n - 1));
    const strings = n <= 3 ? 2 : 1; // two slightly detuned strings give the slow shimmer of a real note
    for (let s = 0; s < strings; s++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = n * f * Math.sqrt(1 + B * n * n);
      if (s) o.detune.value = 1.4 * n;
      const A = amp / strings;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(A, when + 0.003);
      g.gain.setTargetAtTime(A * 0.5, when + 0.003, 0.09);
      g.gain.setTargetAtTime(0, when + 0.45, tau);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(end);
      oscs.push(o);
    }
  }
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  const ng = ctx.createGain();
  src.buffer = noise;
  bp.type = "bandpass";
  bp.frequency.value = Math.max(300, Math.min(5000, f * 3));
  bp.Q.value = 0.8;
  ng.gain.setValueAtTime(level * 0.9 * (0.3 + v), when);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  src.connect(bp).connect(ng).connect(out);
  src.start(when);

  return {
    release() {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.setTargetAtTime(0, t, 0.09);
      for (const o of oscs) { try { o.stop(t + 0.8); } catch { /* already stopped */ } }
    },
  };
}

function sampleVoice(m, when, vel, ring) {
  const root = Math.max(21, Math.min(108, 21 + Math.round((m - 21) / 3) * 3));
  const buf = buffers.get(root);
  if (!buf) return null;
  const v = Math.max(0.02, Math.min(1, vel));
  const src = ctx.createBufferSource();
  const tone = ctx.createBiquadFilter();
  const out = ctx.createGain();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, (m - root) / 12);
  tone.type = "lowpass";
  tone.frequency.value = 1800 + 16000 * Math.pow(v, 1.4); // soft keys sound darker
  out.gain.value = 0.1 + 0.9 * Math.pow(v, 1.5);
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  src.connect(tone).connect(out);
  if (pan) { pan.pan.value = Math.max(-0.3, Math.min(0.3, (m - 64) / 90)); out.connect(pan).connect(master); }
  else out.connect(master);
  src.start(when);
  if (ring) out.gain.setTargetAtTime(0, when + ring, 0.7);
  return {
    release() {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.setTargetAtTime(0, t, 0.12);
      try { src.stop(t + 1.2); } catch { /* already stopped */ }
    },
  };
}

// `ring`: seconds before a scheduled note starts to fade, so notes in a quiz don't pile up.
const voice = (m, when, vel, ring = 0) => sampleVoice(m, when, vel, ring) || synthVoice(m, when, vel);

// Play keys together, or one after another (arpeggio / scale).
export function play(midis, { arp = false, gap = 0.16, vel = 0.75 } = {}) {
  if (!midis || !midis.length || !ensure()) return;
  const sorted = [...midis].sort((a, b) => a - b);
  const t0 = ctx.currentTime + 0.01;
  const scale = arp ? 1 : 1 / Math.sqrt(sorted.length);
  sorted.forEach((m, i) => voice(m, arp ? t0 + i * gap : t0, vel * scale, 3));
}

// Live playing: a note rings until its key is released. The sustain pedal holds released notes.
const held = new Map();
const sustained = new Set();
let pedalDown = false;

export function noteOn(m, vel = 0.75) {
  if (!ensure()) return;
  held.get(m)?.release();
  held.set(m, voice(m, ctx.currentTime + 0.005, vel));
  sustained.delete(m);
}

export function noteOff(m) {
  if (!held.has(m)) return;
  if (pedalDown) { sustained.add(m); return; }
  held.get(m).release();
  held.delete(m);
}

export function pedal(down) {
  pedalDown = down;
  if (down) return;
  for (const m of sustained) { held.get(m)?.release(); held.delete(m); }
  sustained.clear();
}
