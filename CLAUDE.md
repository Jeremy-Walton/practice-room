# CLAUDE.md: Piano Drills

Context for continuing work on this project. Jeremy (the owner) is a senior Rails/React/JS developer who is learning piano. He's past the basics and wants to drill **chords and melody / keyboard theory**, not follow a method book.

## What this is

**Piano Drills** is a desktop web app (installable as a PWA) for finding and naming notes, scales and chords across a full 88-key keyboard.

- Live at **https://piano.jeremywalton.dev**
- Served by a Cloudflare Worker named `practice-room`, with static assets in `public/` and a small sync API in `src/worker.js`
- No build step and no framework: plain ES modules, HTML and CSS

### History (so you don't repeat it)

The project started as a "Suzuki-style practice tracker" (daily practice wizard, song path, streaks). Jeremy then asked to **scrap everything except the deployment** and rebuild it as the current quiz-focused desktop app. Don't reintroduce the practice tracker, the Suzuki book repertoire, or mobile-first layouts unless he asks. Use only free resources; he doesn't own any method books.

## Product decisions (from an interview with Jeremy, Oct 2026)

- **Desktop-first.** Full 88-key keyboard (A0–C8). Every key is clickable, and clicking a key both sounds it and toggles its selection.
- **Every level supports both directions,** and the user picks which when starting:
  - *Play it*: the prompt names something; you click the keys, then Check.
  - *Name it*: keys are marked; you build the answer from parts (root letter, accidental, quality, inversion, bass, scale type, numeral). This builder is preferred over multiple choice.
- **Chord and scale questions are multi-step drills.** You find the same chord or scale in **every octave that fits** on the keyboard, in any order. The goal is recognizing it anywhere on the piano. Octave chips track progress, and found keys stay marked green.
- **Wrong answers: "show it, then retry".** Reveal the correct keys **nearest to where the user played** (closest octave), play the sound, then require the user to play it before continuing. Only first tries count toward the score.
- **Sound:** keys sound on click, the answer sounds on reveal, and there are Play (block) and Arpeggiate buttons for the current selection.
- **Unlocking:** each level unlocks at **90%** in either mode. A round is 10 questions, or 3 drills (`DRILL_ROUND`) for chord and scale levels in Play it, because each drill is about 5–7 checks. Settings has an "Unlock all levels" toggle.
- **Spelling setting:** theory-correct by default (F♯ in D major, E♯ where it belongs), with a "simple" toggle. In simple mode, enharmonic answers are accepted and rare names (E♯, B♯, C♭, F♭, double accidentals) display as common ones.
- **Note labels on keys:** off by default, with a toggle.
- **MIDI:** "maybe later". All input flows through `onKey(m)` in `app.js`, so Web MIDI can call the same function.
- **Sync:** keep D1 sync via the sync key so progress follows him between computers.

## The level ladder (`public/js/levels.js`)

1. White keys
2. Black keys
3. Exact notes (E5, middle C = C4)
4. Every instance of a note
5. Octave jumps (1–3 octaves above or below a marked key)
6. Major scales
7. Natural minor scales
8. Harmonic & melodic minor (melodic is ascending)
9. Triads in major keys (I ii iii IV V vi vii°)
10. Triads in minor keys (natural, plus V and vii° from harmonic)
11. Major & minor triads with inversions
12. Diminished & augmented with inversions
13. Sus2 & sus4 (root position)
14. Seventh chords (maj7, 7, m7, m7♭5, °7)
15. Seventh chord inversions
16. Slash chords (inversions as slash, plus a non-chord bass: M2, P4, m7 above the root)

Chord voicings are **close position**: the bass first, then each tone stacked at the next matching key above. Levels 1–5 are single-step. Levels 6–16 are drills in Play it.

Possible future levels Jeremy might want: add9/6/m6/9 chords, modes, intervals, ear training, chord progressions, key signatures.

## Code map

```
public/index.html        shell: header, sidebar (#levels), stage (#stage), piano (#keys), settings <dialog>
public/css/app.css       all styles; tokens on :root with a prefers-color-scheme dark block
public/js/theory.js      spelled notes {l,a}, MIDI math, chords (QUALITIES), inversions, scales, placements
public/js/levels.js      LEVELS[]: each has gen({spelling}) returning a question (see below)
public/js/app.js         views (intro | quiz | results), quiz flow, scoring, unlocks, settings, shortcuts
public/js/keyboard.js    88 absolutely positioned key buttons; setMarks(Map midi→[marks]); setLabels()
public/js/audio.js       Web Audio "piano" (harmonics + envelope); play(midis, {arp})
public/js/store.js       localStorage + sync client; mergeProgress()
public/sw.js             service worker: network-first, cache fallback; bump VERSION on deploy
src/worker.js            /api/ping, GET /api/sync?since=, POST /api/docs; Bearer SYNC_KEY; doc ids progress|settings
wrangler.toml            Worker "practice-room", assets ./public, D1 binding DB, custom domain piano.jeremywalton.dev
migrations/0001_init.sql docs(id, body JSON, updated_at, server_at): already applied in production
```

### The question object returned by `gen()`

- `title`, `sub`: the Play it prompt
- `targets: [{notes:[{n,m}]}]`: acceptable key sets. `any: true` means any one target completes the question; `drill: true` means every target must be found.
- `given: [midi]`: reference keys (for Octave jumps)
- `nameTitle`, `nameSub`, `show: [{n,m}]`, `fields: [{id,label,opts,def}]`, `grade(ans, spelling)`, `answer`: Name it
- `key`: used to avoid repeat questions within a round
- `arp: true`: scales play as an arpeggio

Use `chordQuestion(c, {...})` for anything chord-shaped. A chord is `{root, q, inv, bass?}`, and `bass` is only for a non-chord-tone bass.

### Marks on keys

`sel` (selected, blue), `ok` / `found` (green ✓), `bad` (red ×), `reveal` (amber ring, pulsing), `show` (Name it, blue), `given` (purple ★), `fixed` (amber ✓, found after a miss). Each state has a shape as well as a color.

### Data and sync

- localStorage keys: `pd-progress`, `pd-settings`, `pd-sync-since`, `pd-meta`, `pd-dirty`. The sync key is stored as **`spr-sync-key`**; that name is kept from the old app so connected browsers stayed connected.
- `progress` = `{levels: {[levelId]: {play|name: {best, rounds, lastAt}}}, history: [{id, at, level, mode, correct, total}]}`. It's merged across devices (max best, union history).
- `settings` = `{spelling, labels, volume, unlockAll}`. The latest change wins, judged by `updated_at`.
- A "reset progress" button wouldn't work with merge sync, because the max-merge would bring scores back. That's why there isn't one.

## Cloudflare

- Account has a D1 database **`practice-room`**, id `b64cd50d-f342-4b69-bf11-baba60d8c2b7`, region ENAM. It has one table, `docs`.
- The secret `SYNC_KEY` is set on the Worker. Jeremy has the key; never print or store it.
- The domain `jeremywalton.dev` is on the same account, and the custom domain is configured in `wrangler.toml`.
- **Deploy:** `npx wrangler deploy` from this folder. Jeremy runs it himself (see the limits below).
- Inspect data: `npm run db:peek`, or the Cloudflare Developer Platform connector (`d1_database_query`).

## Working on this from Claude (cloud sessions)

- **Claude cannot deploy.** The Cloudflare connector can read Workers and query/manage D1/KV/R2, but it can't upload code. The shell on Jeremy's Mac is a Linux sandbox with no route to Cloudflare and no wrangler login. Make the change, test it, write the files into the folder, then ask Jeremy to run `npx wrangler deploy`.
- Jeremy's folder: `~/Workspace/practice-room` (in the device sandbox it's `$HOME/mnt/practice-room`). The sandbox can't delete files until permission is granted, and tar can't overwrite existing files there. Copy files with `cat src > dest` instead.
- The cloud workspace has Chromium for Playwright at `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`; use that path (the plain `chromium` binary rejects old headless mode). `npm i playwright@1.48.2`.
- Local full-stack test: `wrangler dev --local` with `.dev.vars` containing `SYNC_KEY=...`. Remove the `[[routes]]` block for local runs, and apply the migration with `--local`.
- **Don't run `pkill -f "wrangler dev"` from the Bash tool.** The pattern matches the tool's own shell and kills it (exit 144). Kill by PID from a script file instead.
- `window.__pd.state()` exposes `{view, levelIdx, R, Q}` read-only for automated tests.

## Gotchas already hit

- **Don't name a top-level function `top`** (or other `window` properties like `name`, `status`, `parent`). In a classic script it collides with `window.top` and breaks the page. That happened in the old app.
- Generators filter out chords and scales that would need double sharps or flats (`maxAcc > 1`), such as B+ and G♯ harmonic minor.
- White keys are partly covered by black keys. In tests, click white keys near the bottom (about 88% of their height).
- Score counts only what's been checked (first tries). Drill targets each count once.

## Style and preferences

- Plain, direct UI copy. No emoji as decoration.
- Palette: green accent `#1f6b58` / `#5cc2a3` (dark), ivory and ebony keys on a dark case with a felt strip. Fonts: Newsreader (display), Figtree (body), JetBrains Mono (numbers).
- Keep it dependency-free and buildless unless there's a strong reason to change that.
- When unsure about product direction, Jeremy prefers being asked short multiple-choice questions, interview style, before a big build.
