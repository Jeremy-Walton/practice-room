// The 88-key keyboard. Every key is a button; marks show selection and feedback.
import { LOW, HIGH, isBlack, simpleName, sciName, octOf, mod12 } from "./theory.js";

const MARKS = ["sel", "ok", "bad", "reveal", "show", "given"];
const FLAT_OF = { 1: "D♭", 3: "E♭", 6: "G♭", 8: "A♭", 10: "B♭" };
const SHARP_OF = { 1: "C♯", 3: "D♯", 6: "F♯", 8: "G♯", 10: "A♯" };

export function createKeyboard(root, { onKey }) {
  const whites = [];
  for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) whites.push(m);
  const W = whites.length; // 52
  const ww = 100 / W;
  const bw = ww * 0.6;
  const keys = new Map();

  const kb = document.createElement("div");
  kb.className = "kb";
  kb.setAttribute("role", "group");
  kb.setAttribute("aria-label", "Piano keyboard, 88 keys");

  for (let m = LOW; m <= HIGH; m++) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.m = m;
    b.className = "key " + (isBlack(m) ? "black" : "white");
    b.setAttribute("aria-label", sciName(m));
    b.innerHTML = `<span class="lab"></span><span class="mk" aria-hidden="true"></span>`;
    if (isBlack(m)) {
      const wi = whites.indexOf(m - 1);
      // Nudge black keys toward their real-piano positions within each group.
      const nudge = { 1: -0.12, 3: 0.12, 6: -0.16, 8: 0, 10: 0.16 }[mod12(m)] * bw;
      b.style.left = `${(wi + 1) * ww - bw / 2 + nudge}%`;
      b.style.width = `${bw}%`;
    } else {
      const i = whites.indexOf(m);
      b.style.left = `${i * ww}%`;
      b.style.width = `${ww}%`;
      if (mod12(m) === 0) b.classList.add("c");
    }
    keys.set(m, b);
    kb.appendChild(b);
  }

  kb.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".key");
    if (!b || e.button !== 0) return;
    e.preventDefault();
    onKey(+b.dataset.m);
  });
  // Keyboard users: Enter/Space on a focused key.
  kb.addEventListener("keydown", (e) => {
    const b = e.target.closest(".key");
    if (!b || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    onKey(+b.dataset.m);
  });

  root.appendChild(kb);

  function flash(m) {
    const b = keys.get(m);
    if (!b) return;
    b.classList.add("down");
    setTimeout(() => b.classList.remove("down"), 140);
  }

  function hold(m, on) {
    keys.get(m)?.classList.toggle("down", on);
  }

  return {
    flash,
    hold,
    // marks: Map(midi -> array of mark names)
    setMarks(marks) {
      for (const [m, b] of keys) {
        const want = marks.get(m) || [];
        for (const k of MARKS) b.classList.toggle(k, want.includes(k));
      }
    },
    setLabels(on, spelling) {
      kb.classList.toggle("labels", !!on);
      for (const [m, b] of keys) {
        const lab = b.querySelector(".lab");
        if (!on) { lab.textContent = ""; continue; }
        const p = mod12(m);
        if (isBlack(m)) lab.innerHTML = spelling === "simple" ? simpleName(m) : `${SHARP_OF[p]}<br>${FLAT_OF[p]}`;
        else lab.textContent = p === 0 ? "C" + octOf(m) : simpleName(m);
      }
    },
    scrollTo(m) {
      const b = keys.get(m);
      if (b) b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    },
  };
}
