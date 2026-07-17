# Manual Device Test — Monitoring Fix · Producer FX Boost · Count-In Restoration

Fixes 1 and 3 need a **real microphone + headphones**. Open the local build (`npm run preview`),
click **Deploy Studio**.

## Fix 1 — Monitoring-ON recording is clean (raw signal)
Rec Audio → add a lane, select it, put on **headphones**, turn the headphone monitor **ON**.
- [ ] Sing/play while monitoring. The monitored sound is clean — **no ducking, warbling, or dropouts**
      (previously echo-cancellation warped it when monitoring was on).
- [ ] Record a take with monitor **ON**, another with monitor **OFF**. Play both back: the monitor-ON
      take sounds **equal quality** to monitor-OFF — no AGC pumping or noise-gate artifacts baked in.
- [ ] (If your browser can't disable the processing it will prompt/deny — the mic error toast appears
      instead of a corrupted take.)

## Fix 2 — Producer FX are dramatically audible
Producer tab → focus a track with a pattern playing → open its insert FX rack.
- [ ] Add **Reverb**, raise **Wet** toward the top: the track becomes **unmistakably drenched** in a long
      tail (previously reverb did nothing — it was a no-op). Toggling it on/off is now obvious.
- [ ] Raise **Size** → the tail lengthens.
- [ ] Add **Delay** and push **Wet/Feedback** → clearly more present than before.
- [ ] **Fresh session is still fully dry** — no FX until you add a slot.
- [ ] Export → Producer Master Mix: the reverb/delay are present in the bounce (matches what you heard).

## Fix 3 — Count-in restored (all BPMs, all punch-in positions)
- [ ] With the red line at the **default (start)**, press RECORD → a full **4-beat count-in** (four clicks,
      1‑2‑3‑4 flash). Recording begins on the downbeat after beat 4 (not instantly).
- [ ] Drag the red line to **bar 3+**, press RECORD → the backing plays a **one-bar lead-in** into the red
      line; capture engages exactly at the line; the red line sweeps from there.
- [ ] During the count-in: **timer frozen**, **nothing captured**, **red line still** — only the 1‑2‑3‑4
      number animates.
- [ ] Try several BPMs (e.g. 90, 128, 160) — the clicks stay locked to the tempo.
- [ ] Press RECORD (or Stop) during the count-in → it **aborts cleanly**; pressing again starts a fresh
      count-in with no doubled clicks/timers.

## Regression
- [ ] Clip interactivity (select/drag/copy-paste), red-line drag, exports, workspace isolation, and undo
      all behave as before.

---
*Headless (Playwright) confirmed: getUserMedia now requests `{echoCancellation:false, noiseSuppression:false,
autoGainControl:false}` at the real call; reverb send wired (wet 0.8 → gain 1.7 "drenched", dry zero-state
holds, A/B tail RMS 0 → 0.0022 where it was silent), delay wet boosted (0.5 → 0.607), all mirrored in the
export path; count-in restored to 4 beats with the default red line at 0 (progression 1‑2‑3‑4, no capture
during count-in, take placed at the downbeat), lead-in branch engages at the line, clean cancel with no stray
timers; Producer regression clean; 0 console errors. Live-mic behavior (Fixes 1 & 3 feel) needs this on-device pass.*
