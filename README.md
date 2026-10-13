# Piano Drills

A desktop app for finding and naming notes, scales and chords across a full 88-key keyboard. It runs at **https://piano.jeremywalton.dev** on a Cloudflare Worker, and your progress syncs between computers through D1.

## How it works

- **16 levels**, easy to hard: notes, octaves, scales, chords in a key, triad inversions, sus chords, seventh chords and their inversions, and slash chords.
- **Two directions per level.** In *Play it*, the app names something and you click the keys. In *Name it*, keys are marked and you build the name from parts (root, quality, inversion or bass).
- **Drills cover the whole keyboard.** Chord and scale questions ask you to find the same chord or scale in every octave where it fits, in any order.
- **Misses get shown, then retried.** A wrong answer shows the correct keys nearest to where you played and sounds them. You play it yourself before moving on. Only first tries count toward the score.
- **Levels unlock** when you score 90% in either mode. A round is 10 questions, or 3 drills for chord and scale levels in Play it. To skip ahead, turn on **Settings → Unlock all levels**.
- **Shortcuts:** <kbd>Enter</kbd> checks or moves to the next question, <kbd>Space</kbd> plays the selection, <kbd>Esc</kbd> clears it.

## Files

```
public/
  index.html, css/app.css
  js/app.js        screens, quiz flow, settings
  js/levels.js     the 16 levels: question generators and grading
  js/theory.js     note spelling, chords, scales, inversions
  js/keyboard.js   the 88-key keyboard
  js/audio.js      synthesized piano sound
  js/store.js      local storage + sync client
  sw.js            offline support (bump VERSION on each deploy)
src/worker.js      sync API: /api/sync, /api/docs, /api/ping
wrangler.toml      Worker "practice-room", D1 binding, custom domain
```

## Deploy

From this folder:

```sh
npx wrangler deploy
```

It's the same Worker, domain, D1 database and `SYNC_KEY` as before, so there's nothing else to set up. The old practice-tracker data has been cleared from D1.

## Sync

In the app, open **Settings → Sync between computers** and enter your sync key. A browser that was already connected to the old app stays connected. The app syncs two documents:

- `progress`: best scores and round history. It merges across computers, so nothing is lost.
- `settings`: spelling, labels, volume and unlock-all. The latest change wins.

## Adding a level

Add an entry to `LEVELS` in `public/js/levels.js`. Its `gen()` returns:

- `targets` for Play it (one per octave for a drill)
- `show`, `fields` and `grade()` for Name it

Use `chordQuestion()` for anything chord-shaped. The keyboard input goes through one function (`onKey` in `app.js`), so MIDI input can feed the same path later.
