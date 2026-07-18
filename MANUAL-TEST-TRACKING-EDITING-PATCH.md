# Manual on-device test — Tracking & Editing Patch

Headless verification can't exercise a real microphone or the audible result of a scrub.
These two need a person, a mic, and headphones. Everything else was verified in Playwright.

Open the local build (`npx vite preview` of `dist/`, or the deployed app) → **Rec Audio** tab.

---

## Fix 1 — Recording alignment (calibration procedure)

**Goal:** a recorded take should line up with the backing groove to within ~10 ms.

1. Load a **Project** backing (Add Producer Track / Upload) with an obvious beat (a click or kick on every beat is ideal).
2. **Add Track**, select it (it becomes the REC TARGET).
3. Put on **headphones** (so the mic doesn't capture the speakers). Optionally toggle **monitor** (headphone icon) off/on — either is fine for this test.
4. Drag the **red record line** to a bar boundary a few bars in.
5. Press **RECORD**. On the 4-beat count-in, tap a pen on the desk (or clap) exactly on each backing beat.
6. Press stop. Open your browser **DevTools console** — you'll see one line per take:

   ```
   [CR rec-align] { bpm, requestedTick, engageStartedAt, engageTick, engageGapMs,
                    measuredLatencyMs, calibMs, appliedCompMs, placedTick, placedVsRequestedMs }
   ```

7. Double-click the take to open the **Waveform** editor. Compare each tapped transient against the
   backing beat gridline:
   - **Taps land LATE** (to the right of the beat) → increase **CAL (ms)** (positive shifts takes earlier).
   - **Taps land EARLY** (to the left) → decrease **CAL (ms)** (negative shifts later).
8. Re-record and repeat until the taps sit on the gridline (≤ ~10 ms). The CAL value is per-device and
   persists for the session. `engageGapMs` in the log shows the residual the new engage-tick model already
   removed; `appliedCompMs` is what CAL + measured latency applied.

**Pass:** after one or two CAL adjustments, recorded transients align with the backing beat by eye/ear.

---

## Fix 3 — Scrub does not stack voices

**Goal:** dragging the playhead during playback never leaves old audio ringing under the new position.

1. In **Rec Audio**, have a backing/Project lane plus at least one audio-lane take with sustained content
   (a held note or a busy loop works best).
2. Press **Play**. While it's playing, grab the **purple playhead** (or the ruler) and drag it back and
   forth quickly several times across the clips.
3. **Listen:**
   - Each jump should cut the currently-sounding audio and resume cleanly from the new position
     **mid-clip, in sync** with the backing — no doubled/overlapping copies, no smearing.
   - Rapid successive scrubs must not pile voices on top of each other or get louder.
4. Also verify **Fix 2** here: drag the playhead into the MIDDLE of a long clip and release — the clip
   should sound from that point (not silence until the next clip starts).

**Pass:** scrubbing is clean — one voice per lane, mid-clip resume in sync, no stacking or runaway buildup.

---

_All other fixes (2 spanning-schedule, 4 punch-in auto-mute, 5 undo/redo + marquee parity, 6 reverb A/B)
were verified headless in Playwright — see the CHANGELOG entry. Local build only; not deployed._
