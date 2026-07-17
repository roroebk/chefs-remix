# Manual Device Test — Rec Audio Corrections + Clip Interactivity

Needs a **real mic + headphones**. Open the local build (`npm run preview`), click **Deploy Studio**,
switch to **Rec Audio**. Add a backing (Add Producer Track / Upload) and an audio lane (**Add Track**).

## 1. Headphone toggle relocation (decision 1)
- [ ] There is **no** headphone button in the top bar anymore.
- [ ] A headphone button sits in the **Transport lower row, beside the small Play/Stop buttons** (under
      the RECORD circle), same size. Default **OFF**.
- [ ] Toggle ON (grant mic) → with headphones you hear yourself; toast warns about speaker feedback.
      Behavior is otherwise identical to before.

## 2. Count-in freeze (decision 2)
- [ ] Drag the red line to (say) bar 3. Note the timer shows that bar's time and the red line's position.
- [ ] Press RECORD. During the 4-beat count-in: **the timer does not tick**, **the red line does not
      move**, and **nothing is captured** (no growing waveform). Only the 1‑2‑3‑4 number flashes.
- [ ] Backing plays through the count-in as a lead-in.
- [ ] On the downbeat after beat 4, all three engage together: capture starts, the timer begins counting
      up from the red line's position, the red line starts sweeping.

## 3. Movable red record line (decision 3)
- [ ] The red line is **always visible** on the lanes, even when idle.
- [ ] Click-drag it horizontally → it sets the punch-in position (snaps to grid) and does **not** move the
      purple playback position.
- [ ] Press RECORD → the count-in backing leads in **one bar before** the red line; capture starts exactly
      **at** the red line; the take's waveform grows from there.
- [ ] While recording, the red line is the write head and is **not draggable**; after Stop it's draggable again.
- [ ] Purple (playback) and red (record) lines stay visually distinct and behave independently.

## 4. Clip interactivity (decision 4)
- [ ] **Click** a recorded/imported clip → it shows a selection highlight.
- [ ] **Drag** it left/right along its own lane → it snaps to the grid; drop commits. (No cross-lane drag.)
- [ ] **Ctrl/⌘+C** then move the red line and **Ctrl/⌘+V** → a copy lands on the **same lane at the red
      line**; it's an independent clip that plays the same audio (shared buffer).
- [ ] Move/paste a clip so it **overlaps** another → the overlapped audio is sliced/replaced, and a single
      **Ctrl/⌘+Z** restores the lane to before the operation.
- [ ] Copy/paste does nothing while a text field/dropdown is focused.
- [ ] **Backing/Project** clips can't be selected, dragged, or copied (locked).

## 5. Lane height (decision 5)
- [ ] Audio lanes render at the compact Producer-row height; waveforms still scale correctly.
- [ ] The 50/50 tracking/plugins split and internal lane scroll are intact.

## 6. Regression
- [ ] Producer tab, exports, monitoring behavior, capture latency-alignment unchanged.

---
*Headless (Playwright) confirmed: toggle relocated to `.rz-mini` (top-bar instance gone); 44px lanes;
red line always present + draggable when idle, motionless during count-in, write-head while recording;
count-in timer static (frozen at the red-line position) with zero capture and hidden purple, all engaging
on the downbeat; take lands at the red line (bar ~2, latency-shifted); clip click-select, same-lane drag
with 1/16 snap, Ctrl+C/V paste at the red line (independent clip, shared buffer), overlap-through-recycle
with single-Ctrl+Z restore, backing inert; no duplicate React keys; Producer regression clean; 0 console
errors. Live-mic feel (monitoring, punch-in accuracy, drag feel) still needs this on-device pass.*
