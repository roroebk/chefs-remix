# Changelog

All notable changes to **Chef's Remix v3** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
