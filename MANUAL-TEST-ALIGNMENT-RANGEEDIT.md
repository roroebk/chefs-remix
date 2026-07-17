# Manual Test — Recording Alignment Fix + Bar-Range Clip Editing

Headless Playwright covered engine math, the calibration API, and the full Fix-B gesture/undo flow.
The two things that need a **real microphone + ears** are below (Fix A alignment + calibration).
Run against the local build (`npm run preview`) or the deployed site.

---

## Fix A — Recording alignment + latency calibration (needs a real mic + headphones)

### Why this needs a device test
Browser-reported input latency is unreliable across machines. The build now compensates only the
**capture-side** delay (input latency), not output latency — output latency is common-mode and cancels
on playback. Any residual is trimmed by the per-session **CAL (ms)** control in the Record bar.

### A1. Baseline alignment
1. Open the app → **Rec Audio** tab. Put on **headphones** (so the mic doesn't pick up the backing).
2. Add or bounce a **Project** backing track with a clear, steady beat (a 4-on-the-floor kick is ideal).
3. Select an editable audio lane (dropdown / lane click) as the record target.
4. Leave **CAL** at `0`. Press **RECORD** — a 4-beat count-in plays, then capture engages on the downbeat.
5. Clap or play a percussive hit exactly ON several backing beats. Stop.
6. Double-click the take → the Waveform editor. Zoom in on a transient and compare its position to the
   grid / to the backing beat.

**Expected:** the take sits *in the pocket* — neither noticeably early nor late. If it's off, calibrate.

### A2. Calibration procedure (the required fallback)
1. Record a take of steady claps against the backing click (as in A1).
2. In the Waveform editor, measure the offset between a clapped transient and the beat it targets:
   - **Take is LATE** (transient sits to the RIGHT of the beat) → increase **CAL** (positive ms shifts
     takes earlier).
   - **Take is EARLY** (transient sits LEFT of the beat) → decrease **CAL** (negative ms shifts later).
   - Rough starting step: if the transient is ~1 grid-cell late at the current zoom, nudge CAL by the
     equivalent milliseconds (at 120 BPM one 1/16 ≈ 125 ms; usually the residual is only a few ms).
3. Set **CAL** to the measured offset in ms. **Re-record** the same clap test.
4. Repeat until the transient lands on the beat.

**Acceptance:** after calibration, on-device offset ≤ ~10 ms. The applied offset is stored per take in
`clip.meta` (`latencyOffsetSec` = measured capture latency + calibration; `measuredLatencySec`, `calibMs`
recorded alongside). CAL is session-scoped (resets on reload) and additive — it never double-applies.

### A3. Regression — monitoring, count-in, exports
- Toggle the headphone **monitor** in the Record bar mini-row: you hear your mic live; the recorded
  buffer is unaffected (monitor is a parallel tap). Feedback warning applies — use headphones.
- Count-in is always a full 4 beats (1-2-3-4 flash), backing + capture engage together on the downbeat.
- Export → **Master Mix — Rec Audio** includes the take through its studio chain.

---

## Fix B — Bar-range selection / copy / paste / delete inside lanes (mouse-testable)

All of this is verified headless, but confirm the feel by hand:

1. **Rec Audio** tab, a lane with an audio take on it.
2. **Right-click and drag** horizontally across the lane → a hatched, dashed-edged **range** highlight
   appears (distinct from the solid clip-select box). It snaps to the 1/16 grid, or 1/16-triplet when the
   **T³** toggle (Producer timeline toolbar) is on. Range is per-lane; **Project/backing lanes ignore it.**
3. **Delete / Backspace** with a range active → only the range is removed: intersected clips split at the
   boundaries (new clips sharing the same buffer, audio offset advanced), leaving a **gap**. Whole-lane
   pre-state is recycled → **one Ctrl/Cmd+Z restores** it.
4. **Ctrl/Cmd+C** copies the range's in-range segments. **Ctrl/Cmd+V** pastes them at the **red record
   line** on the same lane — independent clips, buffers shared; overlap overwrites through the recycle
   rule (one Ctrl+Z restores).
5. **Escape**, a click elsewhere, or completing an op **clears** the range.
6. **Left-click** a clip still selects the whole clip; **left-drag** still moves it; whole-clip Ctrl+C/V
   still work. Left-click select and right-drag range are visually distinct and mutually exclusive.
7. Shortcuts are suppressed while the CAL input (or any input/dropdown) is focused.

**Acceptance:** range ops affect only the selected range on the one lane; undo is single-step; prior
whole-clip interactions and the Producer tab are unchanged.
