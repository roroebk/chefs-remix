# Sprint B — Live Microphone Capture · Manual Device Test

Real microphone capture cannot be verified headless (no mic + `getUserMedia` needs a real
device + user gesture). The pipeline is verified headless with a synthetic stream; run these
steps once on a real device with a mic + headphones before deploying.

**Setup:** `npm run build && npm run preview`, open the preview URL, click **Deploy Studio**.
Use **headphones** (speakers can leak the backing into the mic). Switch the top-bar toggle to
**Rec Audio**.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Click **Add Track** in the Audio Tracking matrix | A new empty lane appears, selected, badge **REC TARGET**; readout: `Recording target: Audio 1` |
| 2 | Click the big **RECORD** circle (first time) | Browser prompts for mic permission. **Grant it.** |
| 3 | After granting | 1-bar count-in starts: button turns amber pulsing, shows **1→2→3→4**, label **COUNT-IN**, readout `Count-in n / 4`. You hear 4 metronome clicks (accented first beat) + any existing backing playing one bar before the capture point. |
| 4 | On the downbeat after the count-in | Button turns steady red (label **STOP**), readout `Recording: Audio 1`. A red waveform grows on the lane in real time as you play/sing. |
| 5 | Play/sing a phrase in time with the click, then click **RECORD** (now STOP) | Recording ends, transport stops. A take clip lands on the lane at the capture downbeat. Toast: `Take recorded → Audio 1 · Ctrl+Z to undo`. |
| 6 | **Alignment check:** play from the capture bar | What you recorded lines up with where you played it against the backing (latency-compensated — the clip is nudged slightly earlier; the exact offset is stored in `clip.meta.latencyOffsetSec`). |
| 7 | Press **Ctrl/Cmd+Z** | The take is removed and the lane returns to its pre-recording state. |
| 8 | Record again over an existing take (playhead inside it) | The overlapped region is destructively sliced/replaced by the new take; **one** Ctrl/Cmd+Z restores the whole prior lane state. |
| 9 | **Cancel:** press RECORD, then press it again (or **Stop**) during the count-in | Count-in aborts immediately — clicks stop, transport stops, no take is created, button returns to **RECORD**. |
| 10 | **Rapid press:** mash RECORD several times quickly from idle | Only one count-in starts (no double-arm, no stacked clicks, one permission prompt for the session). |
| 11 | **Feedback check:** with headphones OFF and speakers on, record | You should NOT hear your mic monitored through the output while recording (there is no monitoring path — input is never routed to the speakers). |
| 12 | **Deny path:** in a fresh session, block mic permission when prompted | Readout: `Microphone access denied — check browser settings`; no count-in, transport does not start. |
| 13 | Double-click the finished take on its lane | Opens the Waveform editor (trim/fade/split); the take behaves like any audio clip. |
| 14 | Mute the lane (M in the left TRACKS list) and play | The take is silenced with the lane. |
| 15 | Export → **Master Mix — Rec Audio** | The downloaded WAV includes the recorded take. |

**Browser notes:** Chrome/Edge give the best `getUserMedia` latency reporting. If a browser
hides `track.getSettings().latency`, a 12 ms default offset is used — if takes feel slightly
late/early on your device, that default is the value to tune (`armMicCapture`, file `00`).

**Not deployed.** After a clean device pass, deploy manually (`vercel --prod`).
