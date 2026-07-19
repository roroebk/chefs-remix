# Manual on-device test — Diagnostic session: three persistent failures

Headless Playwright verified all three fixes (see the diagnostic report / CHANGELOG). The two items
below still deserve a human + real microphone + headphones because latency and audible bleed only
show on real hardware. Open the local build (`npx vite preview` of `dist/`) → **Rec Audio** tab.

---

## Failure 1 — Recording alignment (updated calibration procedure)

**What changed:** takes recorded at the **default red line (start of the song / anywhere in bar 1)** used
to land ~30–40 ms EARLY, because the backing transport started a beat-fraction *after* the mic capture
engaged. The backing downbeat and capture engage now share one clock instant, so the default position
aligns as well as a mid-song punch-in. Headless measurement: `engageGapMs` went **-41 ms → 0 ms** at the
default red line (a bar-3 punch-in was already +2 ms and is unchanged).

**Enable the alignment trace first (it is OFF by default now):**

```js
// in the browser DevTools console:
window.CR_DEBUG_ALIGN = true
```

Then per take you'll see one line:

```
[CR rec-align] { bpm, requestedTick, engageStartedAt, engageTick, engageGapMs,
                 measuredLatencyMs, calibMs, appliedCompMs, placedTick, placedVsRequestedMs }
```

**Procedure:**
1. Load a **Project** backing with an obvious beat (click/kick on every beat).
2. **Add Track**, select it (REC TARGET). Put on **headphones** (keep the mic off the speakers).
3. Leave the **red record line at 0** (this is the case that used to be wrong — test it specifically).
4. Press **RECORD**; on the 4-beat count-in, tap a pen/clap exactly on each beat, keep tapping on the beat.
5. Stop. Read `engageGapMs` (should be ~0) and open the take in the **Waveform** editor.
6. Compare tapped transients to the backing gridline:
   - Taps **LATE** (right of the beat) → increase **CAL (ms)** (positive = shift takes earlier).
   - Taps **EARLY** (left) → decrease **CAL (ms)** (negative = later).
7. Re-record until transients sit on the grid (≤ ~10 ms). CAL is per-device, persists for the session.
   Repeat step 3 with the red line at **bar 3** — it should need the *same* CAL now (alignment is
   consistent across positions, which it was not before this fix).

**Pass:** default-position takes align with the backing by eye/ear; the same CAL works at any punch-in.

---

## Failure 3 — Punch-in over an existing take (no bleed)

**What changed:** recording over a lane that already has a take no longer lets the OLD take play under
the new one during capture. (The old take's voice was started during the count-in/pre-roll, before the
schedule-time mute engaged, and kept ringing into the take. It is now stopped the instant capture starts.)

**Procedure:**
1. On an audio lane, record (or place) a take that spans several bars.
2. Move the **red record line** into the MIDDLE of that take (punch-in), select the lane.
3. Press **RECORD** and perform. Through the count-in you may still hear the old take (that's the lead-in);
   **the moment recording engages, the old take must go silent** — you should hear only the backing +
   your new performance, never the previous take underneath.
4. Stop. The new take overwrites the punched region; one **Ctrl/⌘+Z** restores the lane's prior state.

**Pass:** no audible copy of the previous take during capture; backing and other lanes keep playing.

---

## Failure 2 — Bar-range delete (quick manual sanity; verified headless)

Range-delete was verified working in Playwright, incl. the fix for the case below. Quick check:
1. Right-click-**drag** across part of a take to select a time range (dashed/tinted band).
2. Press **Delete** → only that range is removed (clip splits, gap left); **Ctrl/⌘+Z** restores.
3. Repeat with the range starting **right on the red punch-in line** — it must still select a range and
   split (previously the line swallowed the drag and Delete removed the whole track).

**Pass:** Delete with an active range splits at the range edges; only Delete with **no** range prompts to
delete the whole track.

---

_Local build only — not committed, not deployed (per the diagnostic session's no-deploy constraint)._
