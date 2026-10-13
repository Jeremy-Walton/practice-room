// Ways to play besides clicking: the computer keyboard and Web MIDI. Both call onNote(midi).
import { LOW, HIGH } from "./theory.js";

// Physical key codes, so the layout works on any keyboard language.
// Values are semitones above the octave's C.
const SEMITONE = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

export function createInput({ onNote, onOctave, onMidiStatus }) {
  let typing = true;
  let octave = 4;
  let access = null;

  const inField = (t) => t.closest && t.closest("input, textarea, select, dialog");

  document.addEventListener("keydown", (e) => {
    if (!typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || inField(e.target)) return;
    const digit = /^Digit([1-8])$/.exec(e.code);
    if (digit) { octave = +digit[1]; onOctave(octave); return; }
    const s = SEMITONE[e.code];
    if (s === undefined) return;
    const m = 12 * (octave + 1) + s;
    if (m < LOW || m > HIGH) return;
    e.preventDefault();
    onNote(m);
  });

  function onMessage(e) {
    const [status, note, vel] = e.data;
    if ((status & 0xf0) !== 0x90 || !vel) return; // note-on only; note-off and velocity 0 are ignored
    if (note >= LOW && note <= HIGH) onNote(note);
  }

  function report() {
    const names = [...access.inputs.values()].filter((i) => i.state === "connected").map((i) => i.name);
    onMidiStatus(names.length ? "Connected: " + names.join(", ") : "No controller found. Plug one in.");
  }

  function hook() {
    for (const i of access.inputs.values()) i.onmidimessage = onMessage;
    report();
  }

  return {
    get octave() { return octave; },
    setTyping(on) { typing = !!on; },
    async setMidi(on) {
      if (!on) {
        if (access) for (const i of access.inputs.values()) i.onmidimessage = null;
        onMidiStatus("Off");
        return;
      }
      if (!navigator.requestMIDIAccess) { onMidiStatus("This browser doesn't support MIDI. Try Chrome or Edge."); return; }
      try {
        access = access || await navigator.requestMIDIAccess();
        access.onstatechange = hook;
        hook();
      } catch {
        onMidiStatus("MIDI access was blocked. Allow it in the site settings.");
      }
    },
  };
}
