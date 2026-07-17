# Manual Device Test — Rec Audio Enhancements

Monitoring, dual playheads, session timer + ruler, and auto-fit lanes need a **real microphone and
headphones** to test the feel — the headless pass verified logic/rendering but not live-mic behavior.

**Setup:** open the local build (`npm run preview`), click **Deploy Studio**, switch to **Rec Audio**.
Put on **headphones** before enabling monitoring. Add a backing track (Add Producer Track, or Upload
Audio) and at least one audio lane (**Add Track**).

---

## 1. Input monitoring (decision 2)
- [ ] Headphone button sits in the top transport bar, next to Play/Stop/Rec, same size. Default **OFF**.
- [ ] Click it → browser prompts for mic permission (first time). Grant it. Button turns purple/pulsing.
- [ ] With headphones on, **you hear your own voice** in real time. A toast warns to use headphones.
- [ ] Speak while toggling monitor ON/OFF repeatedly — audio routing follows the toggle; no glitch/click.
- [ ] Turn monitoring **OFF**, reload the page → it comes back **OFF** (session-only, always defaults off).
- [ ] ⚠️ Take headphones off and enable monitoring near speakers → expect feedback (this is the warned-about
      inherent behavior; confirms the monitor path is truly live). Re-mute immediately.

## 2. Recording + playback together (decision 1)
- [ ] Select an audio lane, hit **RECORD**. After the 4-beat count-in, **the backing track plays** while
      you record — you hear/track against it.
- [ ] Sing/talk over the backing. On **Stop**, play the take back: it contains **only your voice**, with no
      backing-track bleed baked into it.
- [ ] Repeat with **monitoring ON during the take** → the recorded take still contains only the mic, and
      toggling monitor mid-take does not change what got recorded.

## 3. Dual playheads (decision 3)
- [ ] While **recording**, a **RED** line sweeps the lanes at the write position; the growing take draws
      under it. No purple line is visible.
- [ ] On **Play** (not recording), a **PURPLE** line sweeps. No red line.
- [ ] Grab the purple line and **drag** it — playback position scrubs live; release sets the position. Scrub
      while playing → playback relocates. (Same feel as the Producer timeline scrub.)
- [ ] Never both colors at once.

## 4. Session timer + ruler (decision 4)
- [ ] Digital **MM:SS.cs** counter at the far left of the bottom transport zone counts up during both
      playback and recording, and reflects the scrubbed position; resets to 00:00.00 on Stop.
- [ ] The ruler above the bottom bar reads **00:00** on the left and the **session length** on the right.
- [ ] A progress head on the ruler tracks the transport (purple playing / red recording).
- [ ] **Click/drag anywhere on the ruler** scrubs — same transport move as dragging the purple playhead.

## 5. Auto-fit lanes + live rescale (decision 5)
- [ ] The whole session fits the visible lane width — the backing spans the lanes; a short take sits at its
      correct time position. A vertical x lines up to the same time on every lane. No horizontal page scroll.
- [ ] Record a take **longer than the current session length**: as it grows past the end, the whole view
      (all lanes + ruler + both playheads) **re-fits smoothly**, without per-frame jitter.

## 6. Regression (unchanged)
- [ ] Producer tab, Export (Producer / Rec Audio master), Undo (Ctrl/Cmd+Z on a deleted track), and capture
      latency-alignment all behave exactly as before.

---
*Headless (Playwright) already confirmed: monitor gain 0→1→0 with no capture bleed (buffer RMS = pure tone
with monitor ON), playback continues through capture engagement, purple/red playhead state-switching, timer
+ ruler wiring, auto-fit clip positioning (backing 0→100%, bar-4 take at 25%/18.75%), ruler+playhead scrub
via one shared handler, and throttled live re-fit during a growing take. 0 console errors.*
