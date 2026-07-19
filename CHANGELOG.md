# Changelog

All notable changes to **Chef's Remix v3** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Evidence-Required Diagnostic — three persistent failures (recording delay · bar-range delete · punch-in bleed)
Reproduced each with runtime evidence before editing; Rule Zero confirmed both the local and deployed
builds already carried the prior fixes (so all three were "code present, behavior still wrong" — not a
ship gap). Engine (file 00, additive only — no scheduler/routing change) + App (file 10).
- **Failure 1 — recording delay (3rd escalation): FIXED.** Root cause found by driving the real capture
  flow with the `[CR rec-align]` trace: the default record position (red line in bar 1, incl. tick 0)
  used the `rollAtEngage` branch, which started the backing at engage with a `start()`/`seek()` look-ahead
  (+0.03s) the pre-armed capture `engageTime` never shared — so the backing sounded ~30–40 ms AFTER
  capture engaged (`engageGapMs -41`), while a bar-≥2 punch-in was already `+2`. Prior passes only fixed
  the pre-roll path. Fix (App `startCaptureFlow`): pre-schedule the backing so tick `start` first sounds
  at the SAME `engageTime` the capture is armed for. Verified: default-position `engageGapMs -41 → 0`;
  bar-3 punch-in unchanged at `+2`. The `[CR rec-align]` trace is now behind `window.CR_DEBUG_ALIGN`.
- **Failure 3 — punch-in bleed: FIXED.** An existing take sounding across the punch point had its buffer
  voice started at the pre-roll `seek` (before `_capLaneId`/`isMicCapturing`), and the schedule-time guard
  can't stop an already-started one-shot — so it played into the take (`takeVoicesLive=1` at engage). No
  per-lane voice kill existed. Added `Engine._killLaneVoicesFor(chId)` (mirrors `_killLaneVoices`, filters
  by a new `voice.ch` tag set in `_playBuffer`, threaded from the two timeline audio schedule sites);
  `startCaptureFlow` onEngage calls it on the target lane. Verified: old-take voices `1 → 0` at engage,
  other lanes untouched (`1`).
- **Failure 2 — bar-range delete: core verified functional + edge fixed.** Genuine right-drag reproduction
  showed the range→split→recycle path is correct (clip at 0 and mid-timeline both split cleanly). The one
  reproducible defect: the red punch-in line (a sibling of the lanes) intercepted right-drags begun on it,
  so no range was set and Delete fell through to whole-track delete (`deleteModal` opened). Fix (App):
  `studioRangeDown` resolves the lane body via `elementsFromPoint` (robust when the drag starts on a clip
  child or the playhead), the lane body carries `data-lane`, and the red-line `onMouseDown` forwards a
  right-button press to the range gesture. Verified: right-drag on the red line now creates a range +
  splits (no track-delete modal); normal range-delete and no-range whole-track delete both intact.
- Producer regression + full-session sweep: **0 console errors**. Local build only — not committed/deployed.

### Tracking & Editing Patch — Alignment Escalation · Scheduling · Punch-In · Undo/Redo
Six fixes (two escalations). Engine (file 00) + App (file 10) + CSS (template); no protected-core changes.
- **Fix 1 — Recording alignment (ESCALATION).** Prior pass dropped `baseLatency` + added an additive
  per-session CAL(ms) calibration — both verified correct/wired. Residual persisted because placement
  ASSUMED capture engaged exactly at the requested downbeat. Added `Engine.tickAtTime(clockTime)` +
  `captureStartedAt()`; `placeTake` now anchors on the ACTUAL engage tick (from the first captured
  sample's clock time) then applies `comp = measuredLatency + recCalibSec()`, and logs a compact
  `[CR rec-align]` instrumentation trace per take (requested vs engage tick, latency terms, applied
  comp, placed tick) so the residual is measured on-device, not guessed.
- **Fix 2 — Mid-position playback.** New `Engine._scheduleSpanningClips(P,time)`: starting/seeking to P
  now also fires any AUDIO clip already in progress at P from the correct buffer offset
  (`src.start(t, into+trim)`), so a clip started before P is no longer skipped. Called from `start()`
  (non-zero) and `seek()`; covers backing, audio lanes, and mirrored Producer timeline content.
- **Fix 3 — Scrub restacking.** `seek()` now atomically `_killLaneVoices()`+`_killSynthVoices()` (de-click)
  before re-seating, then reschedules spanning clips — no old voice survives a scrub; idempotent per seek
  so rapid scrubs can't stack. All scrub handlers already funnel through `seek`.
- **Fix 4 — Punch-in auto-mute.** `engine._capLaneId` (set by the App at capture engage, cleared on
  stop/cancel) + a guard in `_fireEvent`/`_scheduleSpanningClips` schedule-EXCLUDE the record target's
  prior clips while capture is ACTIVE. Playback-side only — clip data, user mute flags, and [M] untouched.
- **Fix 5 — Marquee parity + undo/redo stack.** `.sm-range` restyled to match the Producer `.tl-marquee`
  (flat accent fill + solid 1px accent border), keeping time-range semantics. The single-step session
  recycle became a bounded (cap 50) undo/redo STACK (`recycleRef`+`redoRef`, symmetric `reverseEntry`);
  new `studioRedo`; a new op clears the redo branch; ↶/↷ arrow buttons added to the Rec-Audio transport
  (disabled when empty, tooltips); Ctrl/⌘+Shift+Z / Ctrl/⌘+Y wired for Studio redo.
- **Fix 6 — Producer FX boost (ESCALATION).** The insert reverb reached live audio but was thin/quiet.
  Ported the Studio convolver's implementation to the Producer inserts (`_applyFx` + `renderMixdown`
  mirror + fxTail sizing): seconds-scaled impulse `_makeImpulse(0.6+size*4.4, 2.6)` (gentler tail) and a
  higher wet ceiling (`pow(wet/0.8,0.5)*2.4`, wet=0.8 → 2.4). `wet=0` stays exactly dry (zero-state +
  saved-project compatible). A/B render: 100%-wet tail RMS ≈ 0.031 / peak ≈ 0.20 over ~3.2s where the
  identical dry pattern is silent.
- Verified headless (Playwright on `vite preview` of dist): spanning fires/skips correctly, scrub kills+
  reschedules (no stacking), capture excludes target lane while others play, undo↔redo cycle + new-op-
  clears-redo + button disabled states, marquee CSS parity, dry-vs-wet A/B, Producer regression clean,
  **0 console errors**. Manual on-device script (Fix 1 calibration + Fix 3 scrub) at
  `MANUAL-TEST-TRACKING-EDITING-PATCH.md`. Local build only — no deploy.

### Added — Phase 5: Melody Maker (Polyphonic Pitch-Shifting Sampler)
- **New track type `track.kind = 'polySampler'`** — a sample-to-piano-roll melodic
  voice. Implemented as a *sound-source variant* of the existing synth voice, **not a
  second engine**: `_synthVoice` gained a single source branch — `opts.buffer` present
  → `AudioBufferSourceNode` resampled to pitch (`playbackRate = 2^((midi-60)/12)`, root
  C4/MIDI 60); absent → the existing oscillator. The buffer voice flows through the
  **same** ADSR gain envelope, the **same** voice-steal pool (`_synthVoices` /
  `_stealSynth`), the **same** de-click stop + `onended` slot-cleanup, and the **same**
  id-based mixer-insert routing. The FIFO oldest-first steal comparator was already
  source-agnostic, so no steal rewrite was needed. Buffer voices return their pool slot
  on `onended` and on steal (no leak past the 16-voice cap); one-shot to natural end
  (high notes end sooner = correct resampling).
- **`addPolySamplerTrack(name, buffer, raw)`** — decodes one file into a tonal lane
  (`type:"sampler"` for IDB rehydrate reuse, `kind:"polySampler"`, `base:60`, shared
  `synth` ADSR), persisted to IndexedDB. `_fire` checks `kind:"polySampler"` **first**
  (before the `type:"sampler"` branch) and routes it through `_synthVoice` with the
  channel's buffer; `renderMixdown` mirrors the same branch so exports include Melody
  Maker tracks. `previewNote` auditions polySampler notes through the reserved preview
  sub-pool (never steals a sustaining playback voice). `classifyChannel → "melodic"`;
  `kind` + `synth` round-trip serialize/hydrate (schema 4, additive).
- **`[Melody Maker]` sidebar button** (Files tab, below `[Add Melody File]`) — the single
  melodic entry point: a single-file picker (`accept="audio/*"`, no multi-select) that
  decodes the file and creates a polySampler track, landing on the timeline. Multi-select
  and non-audio are rejected (folders still route to `[Link Instrumental Folder]`). A
  track is only created once the buffer decodes — never sample-less.
- **`[Synth]` toolbar button removed** (and its `addSynth` handler, command-palette
  entry, and AddTrackBar option). The oscillator source stays in the engine but is
  dormant — no UI instantiates it. Melody Maker is now the melodic workflow.
- **polySampler double-click** always opens the **Piano Roll** regardless of clip
  presence (empty lane creates a midi clip + Piano Roll; an existing clip opens the
  Piano Roll directly, never the Waveform/Clip editor). Other track types unchanged.

### Added — Synth & Melody Creation Suite (4 phases)
- **Phase 1 — native polyphonic synth.** New track type `track.kind = 'synth'`
  alongside `'sampler'` / `'audioLane'`. `_synthVoice(ctx,…)` generates Saw /
  Triangle / Square `OscillatorNode` voices (A4 = 440Hz equal temperament) with a
  strict per-voice **ADSR** gain envelope (attack ~5ms click-free; release reuses
  the ≥8ms de-click floor so note-offs match the 808 contract — no voice is ever
  hard-stopped at non-zero gain). 16-voice **polyphony cap with voice-stealing**
  (`_stealSynth` de-clicks + drops the oldest voice). `_fire` and `renderMixdown`
  both branch on `kind:'synth'`; `pause`/`stop` de-click-kill live synth voices
  (`_killSynthVoices`). `addSynthTrack(name,wave)` appends a tonal synth lane on
  its own id-based insert; `synth` params + `kind` round-trip serialize/hydrate
  (still schema 4, additive). Entry points: header **▸ Synth** button, command
  palette, and the AddTrackBar picker.
- **Phase 2 — Piano Roll on empty-lane double-click.** Locked double-click
  disambiguation (branch on clip presence): double-clicking an **empty** melody
  lane creates a 1-bar MIDI clip there and opens the Piano Roll on it; an audio
  lane's empty area is a no-op; double-clicking an **active audio clip** opens the
  Waveform Editor (unchanged) — neither binding clobbers the other. Notes persist
  to the clip (absolute ticks) and the timeline scheduler fires the Phase-1 synth
  attacks in sync.
- **Phase 3 — Factory asset purge (listing only).** The stock "Factory Core"
  demo entries (Drums / 808s / Synths / Kicks / Snares / Hi-Hats / …) are hidden
  from the sidebar library listing **and** search, so new projects start blank /
  custom-ready. The factory **metadata tree stays fully intact** in
  `window.__FACTORY` (nothing deleted), and saved projects resolve their voices
  via their own channel `type`, so a project referencing factory samples still
  loads + plays. Only user-linked folders (`userRoot`) are surfaced.
- **Phase 4 — Playhead ↔ visualizer sample-offset sync.** `_draw` now drives the
  timeline playhead directly off the transport's audio-clock sample offset
  (`tick = point.tick + (now − point.time)/secPerTick`, capped one step ahead),
  giving smooth, sample-accurate 1:1 motion instead of the 1/16 step grid. `start`
  seeds the playhead anchor; `seek` (manual scrub / drag) re-anchors and drops
  stale schedule points so scrub + the existing screen-recording stream stay
  locked to the same playhead offset / zoom ratio.

### Added — Synth Suite master-prompt deltas
- **Reserved preview voice sub-pool.** Piano-Roll auditions now route through a
  dedicated preview bus (`_synthPrevBus` → master) and a separate small FIFO pool
  (`_prevVoices`, cap `_prevPoly = 4`, stolen by `_stealPrev`), never through
  `_synthVoices` / `_stealSynth` — so previewing a note while editing can **never
  steal a sustaining playback voice**. New `previewNote(chId,semis,vel)` fires a
  synth audition through the reserved pool (`_synthVoice(…,{preview:true})`); other
  tonal tracks fall back to the standard short audition.
- **Auditory preview in the Piano Roll.** Placing a note and dragging a note's
  pitch now fire an instant preview via the reserved pool, **debounced to one
  preview per semitone crossed** (not per mouse-move; the resize edge never
  previews). Wired only for tonal channels via the `onPreview` prop.
- **Measure-17 transport fix → infinite default.** Timeline `loop.on` now defaults
  **off** (constructor + hydrate fallback), so a fresh arrangement plays past bar 16
  / Measure 17 without wrapping — playback scales to `lengthTicks`. The loop-wrap
  mechanism is intact and still honored whenever a session sets `loop.on`.
- **Removed `[Load Demo]`.** The master-toolbar button, the command-palette entry,
  and the `loadDemo` / `buildDemo` handlers are gone (no orphaned listeners); the
  empty-timeline hint no longer references it. Engine `loadDemoChannels` is left
  intact (harmless, unreferenced).

### Changed — FINAL BUILD: linear-timeline refactor (schema 4)
- **Schema 3 → 4 migration.** `hydrate` now auto-migrates saved schema-3
  projects (banks / loop / activePattern) into the pure linear-clip model:
  every on-step / piano-roll note becomes an absolute-tick MIDI clip, then the
  banks are emptied so the live rack-mirror can't re-add them (no double-trigger).
  De-dup guard skips flattening a bank already represented by a real clip at
  bar 0. Migration also **heals duplicate / missing clip ids** and reseeds the
  clip-id counter, so loading clip-heavy projects no longer collides ids (which
  previously made split / clip-edit resolve the wrong clip + threw React key
  warnings). The "new" fixture (9 ch, 214 clips) loads + plays identically.
- **Timeline is the sole transport.** Engine default `playMode` is now
  `"timeline"` (absolute-tick scheduler); the Pattern [1]–[4] selector pills
  were removed from the Transport.
- **Step-mod relocated into the mixer.** The standalone TRACK FX panel was
  deleted; its INSERT FX RACK + STEP MODULATION (Velocity/Pitch/Pan/Release)
  lanes now live in the Mixer's focused-strip expanded view, which resolves the
  focused channel's insert strictly by route id.
- **Track focus.** Clicking a timeline lane header focuses the track, selects
  its insert by id, and scrolls/highlights that mixer strip.

### Added
- **Waveform editor (audio clips).** Double-click a linear audio clip to open a
  non-destructive modal: canvas waveform of the clip's windowed buffer, clip
  gain, fade-in/out, and split-at-position. Edits touch clip metadata only; the
  source buffer is never mutated (splits reference the same buffer).

### Fixed
- **Melody lanes no longer ring through pause.** Live `AudioBufferSourceNode`
  voices are tracked; on pause/stop they are de-click-ramped to zero over ~8ms
  then stopped (never a hard `stop(0)`), with a synchronous up-front clear so
  rapid play/pause/play can't leave overlapping voices.
- **File-sidebar drag-and-drop** (the buggy overlay + dragover/drop/dragleave
  listeners) was removed; import now goes through the explicit Add File(s) /
  Add Melody File pickers + Link Instrumental Folder (sidebar + library kept).

### Fixed
- **Playback now plays every instrument in the project.** Timeline mode only
  plays clips on the timeline, and rack/pattern content was mirrored there only
  on individual edits or when opening the Timeline tab — so loading a project
  (or any bulk-populated pattern) left instruments silent on play. Both
  transport start and the offline export now mirror all rack patterns to the
  timeline before building the playback/render list, so pressing play or
  exporting always sounds **all** instruments that have content. The sync is
  idempotent and leaves arranged/audio/recorded clips untouched. (`97eef1f`)
- **Export status label shows the real sample rate.** The "Export Mixdown"
  completion text was hardcoded to "44.1 kHz"; it now reflects the actual render
  rate (e.g. 48.0 kHz), matching the exported WAV. (`f164666`)

- **Timeline marquee selection works again.** Right-drag (and the Marquee tool)
  selects clips by **overlap** again instead of requiring the box to fully
  enclose a clip. Strict containment made selection impossible for the common
  case of stacked, multi-bar clips wider than the drag, so right-drag-to-select
  (and copy/paste) grabbed nothing.

### Hardened
- **Channel→insert routing is defensive against bad route ids.** Routing already
  resolves inserts strictly by id (robust to non-contiguous routes left by
  channel deletes — verified all channels stay audible with gaps), but an
  out-of-range route from a corrupt/old saved project could throw during wiring.
  A channel whose route has no matching insert now logs a warning and falls back
  to a master passthrough instead of crashing or going silent.

### Changed
- **Export length follows the actual arrangement.** Bounces now run for the real
  clip extent plus a tail instead of a fixed 32-bar minimum, so a short loop no
  longer exports ~60 s of trailing silence. (`e14a782`)
- **Export tail adapts to delay feedback.** The post-song tail is sized to the
  longest active delay's decay (floored at 1.8 s, capped at 12 s) instead of a
  fixed 1.8 s, so long delay/chorus tails are no longer truncated. (`e14a782`)
- **Offline insert compressor matches live.** Export-time inserts now use the
  same attack/release as live monitoring. (`e14a782`)

## [3.0.x] — 2026-06-12

### Fixed
- **Eliminated export distortion / clipping.** The offline bounce was missing the
  master soft-clip stage present in live playback, so stacked transients
  overshot the limiter and hard-clipped — exports sounded distorted and unlike
  the smooth real-time playback. The export master chain now mirrors live
  (gain → tanh soft-clip → brickwall limiter), and renders at the live context's
  sample rate (no resampling). Verified: a worst-case 16-track stack bounces with
  zero hard-clipped samples. (`bcc07a8`)

### Added
- **Dual-path melody ingestion + non-destructive clip split.** "Add Melody File"
  drops an imported audio file as a full-length audio-lane clip; clips can be
  split at the playhead (audio and MIDI). (`62cefab`)
- Per-step volume modulation and per-clip gain / fade handles. (`62cefab`)

### Changed
- **FX rack starts completely dry.** New sessions no longer preload reverb/delay/
  chorus racks; insert FX settings now persist with the project. (`62cefab`)
- **De-clicked sampler playback.** Voices ramp in/out (3 ms attack, ≥8 ms
  release) so low-frequency (808) samples no longer click on start/stop;
  untrimmed audio-lane clips play to their natural end. (`62cefab`)

## [3.0.x] — 2026-06-11

### Added
- Instrument/melody classification with melodic-clip waveform rendering on the
  timeline. (`ecee244`)

### Known limitations
- **Auto-Tune (`pitchfix`) is not applied to exports.** Live Auto-Tune runs on a
  real-time `ScriptProcessorNode`, which cannot process during offline rendering;
  faithful export requires an AudioWorklet rewrite (deferred). A track with
  Auto-Tune active will export uncorrected.
- `eq` / `reverb` / `limiter` insert FX types are not yet implemented (no-ops in
  both live and export).
