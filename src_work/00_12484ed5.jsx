/* Chef's Remix v3 — NEON_GRID engine
 * Real Web Audio core: look-ahead scheduler, swing math, per-channel routing into
 * mixer inserts, per-insert FX (bitcrush / filter / delay / comp), per-insert + master
 * metering, step-struct data model {on,vel,pan,pitch,len}, and piano-roll note list.
 */
(function () {
  "use strict";
  var STEPS = 16;
  // ---- linear-timeline time base (Phase 1) ----
  // PPQ = ticks per quarter note (DAW-standard integer grid; avoids float drift).
  // 4/4: 1 bar = 4 quarters = TICKS_PER_BAR; one 16th-step = TICKS_PER_STEP.
  var PPQ = 480, TICKS_PER_BAR = PPQ * 4, TICKS_PER_STEP = PPQ / 4, SNAP_TICKS = TICKS_PER_STEP;
  function m2f(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---- IndexedDB sample store -----------------------------------------------
  // Lightweight promise wrapper for persisting raw audio binaries (Blobs) keyed by
  // the sampler channel id, so imported files + mic takes survive refresh/close.
  // Every op is promise-based and self-contained; failures reject/resolve quietly so a
  // bad sample can never freeze engine boot (see _rehydrateSample error isolation).
  var IDB_NAME = "chefs_studio", IDB_STORE = "samples", IDB_VER = 1, _idbPromise = null;
  function idbOpen() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      var rq = window.indexedDB.open(IDB_NAME, IDB_VER);
      rq.onupgradeneeded = function () { var db = rq.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error || new Error("IndexedDB open failed")); };
    });
    return _idbPromise;
  }
  function idbPut(key, blob) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(blob, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error("idb put failed")); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly"), rq = tx.objectStore(IDB_STORE).get(key);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { reject(rq.error || new Error("idb get failed")); };
      });
    });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE)["delete"](key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    })["catch"](function () { return false; });
  }
  // global wrapper (IIFE style) for any other module that needs the store
  window.SampleDB = { put: idbPut, get: idbGet, del: idbDel };

  // ---- channel + insert definitions ----------------------------------------
  // type drives synthesis; route = insert id; base = root midi for tonal voices
  var CHANNELS = [
    { id: "kick", label: "Linear Kick", type: "kick", color: "#39ff14", route: 1, vol: 0.95, pan: 0, tonal: false, base: 0 },
    { id: "sub", label: "Sub-Bass", type: "sub", color: "#2ea6ff", route: 3, vol: 0.82, pan: 0, tonal: true, base: 36 },
    { id: "snare", label: "Snare", type: "snare", color: "#ff5cc8", route: 2, vol: 0.74, pan: 0, tonal: false, base: 0 },
    { id: "clap", label: "Clap 909", type: "clap", color: "#ff5cc8", route: 2, vol: 0.62, pan: 0.06, tonal: false, base: 0 },
    { id: "chat", label: "Closed Hat", type: "chat", color: "#ffb338", route: 4, vol: 0.46, pan: -0.12, tonal: false, base: 0 },
    { id: "ohat", label: "Open Hat", type: "ohat", color: "#ffb338", route: 4, vol: 0.4, pan: 0.18, tonal: false, base: 0 },
    { id: "anvil", label: "Anvil Perc", type: "anvil", color: "#2ee6c8", route: 5, vol: 0.5, pan: -0.3, tonal: false, base: 0 },
    { id: "rim", label: "Rim Click", type: "rim", color: "#2ee6c8", route: 5, vol: 0.48, pan: 0.34, tonal: false, base: 0 },
    { id: "glitch", label: "Glitch WT", type: "glitch", color: "#b07bff", route: 6, vol: 0.5, pan: 0.1, tonal: true, base: 60 },
    { id: "vox", label: "Vocal Chop", type: "vox", color: "#ff5470", route: 7, vol: 0.56, pan: 0, tonal: true, base: 60 },
    { id: "pluck", label: "Chord Plucks", type: "pluck", color: "#c6ff3a", route: 6, vol: 0.5, pan: -0.08, tonal: true, base: 48 },
    { id: "reese", label: "Reese Bass", type: "reese", color: "#2ea6ff", route: 3, vol: 0.46, pan: 0, tonal: true, base: 36 },
    { id: "arp", label: "Arp Pulse", type: "arp", color: "#b07bff", route: 6, vol: 0.44, pan: 0.22, tonal: true, base: 60 },
    { id: "lead", label: "Lead Stab", type: "lead", color: "#39ff14", route: 8, vol: 0.5, pan: 0, tonal: true, base: 72 },
    { id: "riser", label: "Noise Riser", type: "riser", color: "#cdd3da", route: 9, vol: 0.4, pan: 0, tonal: false, base: 0 },
    { id: "shaker", label: "Shaker", type: "shaker", color: "#ffb338", route: 4, vol: 0.34, pan: -0.24, tonal: false, base: 0 }
  ];

  // mixer inserts — one per track (1:1), id 1..16; 00 reserved name Master
  var INSERTS = [
    { id: 1, name: "KICK" }, { id: 2, name: "SUB" }, { id: 3, name: "SNARE" }, { id: 4, name: "CLAP" },
    { id: 5, name: "C-HAT" }, { id: 6, name: "O-HAT" }, { id: 7, name: "ANVIL" }, { id: 8, name: "RIM" },
    { id: 9, name: "GLITCH" }, { id: 10, name: "VOX" }, { id: 11, name: "PLUCK" }, { id: 12, name: "REESE" },
    { id: 13, name: "ARP" }, { id: 14, name: "LEAD" }, { id: 15, name: "RISER" }, { id: 16, name: "SHAKER" }
  ];
  // route every channel 1:1 to its own insert (M01..M16)
  CHANNELS.forEach(function (c, i) { c.route = i + 1; });

  // Per-step modulation (Fix 2): pitch = semitone offset, pan = -1..1, vol = dB offset.
  // Steps without edits keep 0/0/0 and behave exactly as before.
  function blankStep() { return { on: false, vel: 100, pan: 0, pitch: 0, len: 1, vol: 0 }; }
  // step-maps are added per-channel by addChannel(); a fresh bank starts empty.
  // lengthBars (Task 2): per-pattern length 1..32; step rows are sized 16*lengthBars.
  function blankPattern() { return { steps: {}, notes: [], lengthBars: 1 }; }
  // freshStepRow(bars) builds a row sized to the pattern length (default 1 bar = 16 steps)
  function freshStepRow(bars) { var n = STEPS * Math.max(1, bars || 1), a = []; for (var i = 0; i < n; i++) a.push(blankStep()); return a; }
  function patLen(bank) { return Math.max(1, Math.min(32, (bank && bank.lengthBars) || 1)); }

  function Engine() {
    this.ctx = null; this.master = null; this.masterAnalyser = null; this.limiter = null; this.noise = null;
    this.tempo = 140; this.swing = 0; this.isPlaying = false; this.playMode = "timeline";  // Phase 2: linear timeline is the sole live transport
    this.stepIndex = 0; this.songStep = 0; this.nextStepTime = 0;
    this.lookahead = 25; this.scheduleAhead = 0.12; this.timer = null; this.notesInQueue = [];
    this.channelDefs = []; this.insertDefs = INSERTS;          // blank slate — no instrument lanes until added
    this.channels = {}; this.inserts = {};
    this.banks = [blankPattern(), blankPattern(), blankPattern(), blankPattern()];
    this.activePattern = 0; this.focus = null; this._catalog = CHANNELS;   // factory defs for Add Track / demo
    this.userBuffers = {}; this._bufSeq = 0; this._micRec = null;          // decoded sampler buffers (import / mic)
    this._recState = null; this._recSeq = 0;                                // continuous timeline audio recording (MediaRecorder path)
    this._micStream = null; this._cap = null;                               // Sprint B: cached mic stream + live PCM capture state
    this._capLaneId = null;                                                 // Fix 4: record-target lane id (set by the App at capture engage) — its prior clips are schedule-excluded while capture is ACTIVE
    this._monitorOn = false;                                                // Rec-Audio enhancement: input-monitoring toggle (session state, defaults OFF)
    this._recCalibMs = 0;                                                   // Fix A: per-session recording-latency calibration (ms, default 0, additive)
    this._perfArmed = false; this._perfClips = {}; this._openNotes = {}; this._midiOn = false;  // MIDI/keyboard performance
    this._hist = { stack: [], idx: -1, lastJSON: null };                    // undo/redo snapshot history
    // arrangement (legacy pattern/bank model — still authoritative until the timeline is wired in)
    this.songBars = 32; this.loop = { start: 0, end: 16 }; this.blocks = []; this._bseq = 0;
    this.audioClips = [];
    // ---- linear timeline model (Phase 1, additive/dormant for now) ----
    // single continuous arrangement: absolute-tick clips on shared lanes. PPQ-based so snapping
    // is exact and clips stay movable/copyable as units (notes are stored relative to clip start).
    // Synth Suite (this batch): loop defaults OFF so a fresh arrangement plays past Measure 17
    // (bar 16) without wrapping/cutting — playback scales dynamically to lengthTicks. The wrap
    // mechanism in _scheduleTimeline still honors loop.on when a session explicitly sets it.
    this.timeline = { lengthTicks: 32 * TICKS_PER_BAR, loop: { startTick: 0, endTick: 16 * TICKS_PER_BAR, on: false }, clips: [], automation: {} };
    this._clipSeq = 0;
    this.PPQ = PPQ; this.TICKS_PER_BAR = TICKS_PER_BAR; this.TICKS_PER_STEP = TICKS_PER_STEP; this.SNAP_TICKS = SNAP_TICKS;
    this.onStep = null; this.onMeter = null; this._lastStep = -1; this.meterFps = 60; this._meterLast = 0;
    this.onPlayhead = null; this.playheadTick = 0; this._tlEvents = null; this._tlCursor = 0;   // timeline transport
    // Phase 8: live AudioBufferSourceNode voices spawned by _playBuffer (lane clips / samplers).
    // The transport doesn't otherwise track them, so pause/stop would leave long melody lanes
    // ringing. Held here so pause/stop can de-click-ramp + stop them synchronously.
    this._laneVoices = [];
    // ---- Synth Suite (Phase 1): native polyphonic oscillator synth ----
    // Live OscillatorNode voices for kind:'synth' tracks, tracked so pause/stop can de-click them
    // and so the polyphony cap (_synthPoly) can steal the oldest voice on dense patterns.
    this._synthVoices = []; this._synthPoly = 16;
    // Reserved PREVIEW voice sub-pool (Synth Suite, this batch): Piano-Roll auditions route here
    // through a distinct gain bus (_synthPrevBus -> master) and a separate small FIFO pool, NEVER
    // through _synthVoices/_stealSynth — so an audible preview while editing can never steal a
    // sustaining playback voice. Phase 2 (previewNote) consumes this.
    this._prevVoices = []; this._prevPoly = 4; this._synthPrevBus = null;
    // Phase 4: last sounded (tick,time) schedule point — the playhead UI interpolates off the
    // audio clock from here for sample-accurate 1:1 motion (not the 1/16 step grid).
    this._phPoint = null;
    // ---- Audition: scoped-range transport (this batch) ------------------------
    // ONE transport, ONE voice engine. Auditioning a Piano-Roll bar or a sample waveform reuses the
    // SAME look-ahead scheduler + voice pools, just bounded to a half-open tick window
    // [_scopeStart,_scopeEnd). Entering snapshots the global transport (playhead + play state) and
    // pauses it; exiting restores it exactly so an audition never loses the producer's place.
    // _scopeOwner ('piano'|'wave') makes the Phase-5 tab handoff an explicit ownership transfer.
    this._scopeActive = false; this._scopeStart = 0; this._scopeEnd = 0;
    this._scopeLoop = true; this._scopeSoloId = null; this._scopeOwner = null; this._scopeSnap = null;
    // single shared handle both the Piano Roll and Waveform tab bind to (never two instances)
    var self = this;
    this.scope = {
      enter: function (o) { return self.enterScope(o); },
      play: function () { return self.playScope(); },
      pause: function () { return self.pauseScope(); },
      exit: function () { return self.exitScope(); },
      stopScopeVoices: function () { return self.stopScopeVoices(); },
      setRange: function (s, e) { return self.setScopeRange(s, e); },
      setLoop: function (on) { return self.setScopeLoop(on); },
      setSolo: function (chId) { return self.setScopeSolo(chId); },
      scrub: function (tick) { return self.seek(tick); },
      isActive: function () { return self._scopeActive; },
      isPlaying: function () { return self._scopeActive && self.isPlaying; },
      owner: function () { return self._scopeOwner; },
      setOwner: function (o) { self._scopeOwner = o || null; }
    };
  }

  // ---- audio graph ----------------------------------------------------------
  Engine.prototype.init = function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC(); var ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.masterAnalyser = ctx.createAnalyser(); this.masterAnalyser.fftSize = 1024; this.masterAnalyser.smoothingTimeConstant = 0.6;
    // master chain: gain -> soft-clip (waveshaper) -> brickwall limiter -> analyser -> destination
    // the soft clipper tames inter-sample peaks so stacking many tracks / cranking FX knobs
    // saturates gently instead of hard digital clipping.
    this.softclip = ctx.createWaveShaper(); this.softclip.curve = this._softClipCurve(); this.softclip.oversample = "4x";
    this.master.connect(this.softclip); this.softclip.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser); this.masterAnalyser.connect(ctx.destination);

    var len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;

    var self = this;
    // inserts: in -> bit(waveshaper) -> filter(biquad) -> comp -> [dry + delay] -> fader -> pan -> analyser -> master
    INSERTS.forEach(function (def) {
      var input = ctx.createGain();
      var bit = ctx.createWaveShaper(); bit.curve = self._linearCurve();
      var filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 20000; filt.Q.value = 0.7;
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = 0; comp.ratio.value = 1; comp.attack.value = 0.005; comp.release.value = 0.15;
      var dry = ctx.createGain(); dry.gain.value = 1;
      var dl = ctx.createDelay(1.5); dl.delayTime.value = 0.3;
      var fb = ctx.createGain(); fb.gain.value = 0;
      var wet = ctx.createGain(); wet.gain.value = 0;
      // Fix 2 — real REVERB send (was a no-op: the "reverb" FX type had no node). Parallel convolver
      // off comp, mixed back at the fader. Buffer built lazily in _applyFx when a reverb slot activates
      // (sized by the Size param); rvWet stays 0 in the dry zero-state, so fresh sessions are unaffected.
      var conv = ctx.createConvolver();
      var rvWet = ctx.createGain(); rvWet.gain.value = 0;
      var fader = ctx.createGain(); fader.gain.value = 0.8;
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      var an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5;
      input.connect(bit); bit.connect(filt); filt.connect(comp);
      comp.connect(dry); comp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet);
      comp.connect(conv); conv.connect(rvWet);
      dry.connect(fader); wet.connect(fader); rvWet.connect(fader);
      fader.connect(an);
      if (pan) { an.connect(pan); pan.connect(self.master); } else { an.connect(self.master); }
      self.inserts[def.id] = {
        def: def, name: def.name, input: input, bit: bit, filt: filt, comp: comp,
        dry: dry, delay: dl, fb: fb, wet: wet, conv: conv, rvWet: rvWet, rvSize: -1, fader: fader, pan: pan, analyser: an,
        vol: 0.8, panVal: 0, mute: false, solo: false,
        fx: self._defaultFx(def.id), meterData: new Uint8Array(an.fftSize)
      };
    });

    // channels: gain -> panner -> insert.input (built per active lane; empty at boot)
    self.channelDefs.forEach(function (c) { self._wireChannel(c); });
    this._applyFxAll();
    this._meterLoop();
  };
  Engine.prototype.resume = function () { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); };

  Engine.prototype._linearCurve = function () { var n = 2, c = new Float32Array(n); c[0] = -1; c[1] = 1; return c; };
  // master soft-clip: tanh-shaped transfer curve (unity for small signals, smooth knee near ±1)
  Engine.prototype._softClipCurve = function () {
    var n = 2048, c = new Float32Array(n), k = 2.2;
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  };
  Engine.prototype._bitCurve = function (bits) {
    var n = 1024, c = new Float32Array(n), levels = Math.pow(2, bits);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * levels) / levels; }
    return c;
  };
  Engine.prototype._defaultFx = function (id) {
    // FX ZERO-STATE (Fix 2): a fresh session starts COMPLETELY DRY — every one of the 8 serial
    // slots is empty, so there are no pre-enabled reverb/delay/chorus/feedback sends and wet mix
    // is 0%. The insert graph already inits wet.gain=0 / fb.gain=0; with no delay/chorus slot,
    // _applyFx keeps them at 0. Saved sessions restore their own FX racks via hydrate (zero-state
    // defaults apply only when no saved state exists).
    var a = []; for (var i = 0; i < 8; i++) a.push({ type: null, bypass: false, params: {} });
    return a;
  };
  function defParams(t) {
    if (t === "bitcrush") return { bits: 6, mix: 0.7 };
    if (t === "filter") return { freq: 2200, q: 4, mode: "lowpass", mix: 1 };
    if (t === "delay") return { time: 0.28, fb: 0.34, wet: 0.28, mix: 0.3 };
    if (t === "eq") return { low: 0, mid: 1, high: 2, mix: 1 };
    if (t === "comp") return { thr: -18, ratio: 3, makeup: 2, mix: 1 };
    if (t === "reverb") return { size: 0.6, wet: 0.24, mix: 0.28 };
    if (t === "limiter") return { ceil: -0.3, mix: 1 };
    if (t === "chorus") return { rate: 1.5, depth: 0.4, mix: 0.4 };
    if (t === "pitchfix") return { retune: 18, correction: 0.85, scale: "chromatic", mix: 1 };
    return { mix: 1 };
  }

  // recompute the real FX node values from an insert's slot params (mix = wet/dry)
  Engine.prototype._applyFx = function (id) {
    var ins = this.inserts[id]; if (!ins) return;
    var bit = null, filt = null, delayish = null, comp = null, reverb = null;
    ins.fx.forEach(function (s) {
      if (!s.type || s.bypass) return;
      if (s.type === "bitcrush") bit = s;
      else if (s.type === "filter") filt = s;
      else if (s.type === "delay" || s.type === "chorus") delayish = s;
      else if (s.type === "comp") comp = s;
      else if (s.type === "reverb") reverb = s;
    });
    ins.bit.curve = bit ? this._bitCurve(bit.params.bits) : this._linearCurve();
    if (filt) { ins.filt.type = filt.params.mode; ins.filt.frequency.value = filt.params.freq; ins.filt.Q.value = filt.params.q; }
    else { ins.filt.type = "lowpass"; ins.filt.frequency.value = 20000; ins.filt.Q.value = 0.7; }
    if (comp) { ins.comp.threshold.value = comp.params.thr; ins.comp.ratio.value = comp.params.ratio; }
    else { ins.comp.threshold.value = 0; ins.comp.ratio.value = 1; }
    // Fix 2 — perceptual (exponential) wet mapping so the TOP of the range is dramatic. pow(x,0.6)
    // lifts the whole curve (a low knob is already clearly audible), and the ceiling multipliers push
    // high settings well past the old timid 0.6/0.85. Backward-compatible in ORDERING (monotonic, same
    // param meaning) — a louder wet at a given stored value is the intended audibility boost.
    if (delayish) {
      if (delayish.type === "chorus") { ins.delay.delayTime.value = 0.022; ins.fb.gain.value = 0.22; ins.wet.gain.value = Math.pow((delayish.params.mix != null ? delayish.params.mix : 0.4), 0.6) * 1.1; }
      else { ins.delay.delayTime.value = delayish.params.time; ins.fb.gain.value = Math.min(0.92, delayish.params.fb); ins.wet.gain.value = Math.pow((delayish.params.mix != null ? delayish.params.mix : delayish.params.wet), 0.6) * 1.25; }
    } else { ins.fb.gain.value = 0; ins.wet.gain.value = 0; }
    // reverb send (Fix 2): build/refresh the impulse when Size changes; perceptual wet -> DRENCHED at
    // the top. Uses the `wet` param (0..0.8) as primary, `size` for the tail length. Dry when absent.
    if (reverb) {
      var sz = reverb.params.size != null ? reverb.params.size : 0.6;
      // Fix 6 (ESCALATION — Producer reverb still weak): PORT the Studio convolver's implementation to the
      // Producer insert reverb so the SAME setting is comparably dramatic in both tabs. Two changes vs the
      // prior pass: (1) SECONDS-scaled tail with the gentler 2.6 decay used by studioFx(_makeImpulse(2.4,2.6))
      // — the old 1.6+sz*2.6 decay fell off too steeply, giving a thin, short tail that read as "no reverb";
      // (2) a higher wet ceiling so a given wet knob is unmistakably wet. The fader(0.8) the send sums into
      // is COMMON-MODE (it scales dry AND wet equally) so it never changed the wet:dry balance — the weakness
      // was the impulse + ceiling, not the fader. sz 0..1 -> 0.6s..5.0s (default 0.6 -> ~3.24s, ~Studio range).
      var revSecs = 0.6 + sz * 4.4;
      if (Math.abs(sz - ins.rvSize) > 0.001 || !ins.conv.buffer) { ins.conv.buffer = this._makeImpulse(revSecs, 2.6); ins.rvSize = sz; }
      var rw = reverb.params.wet != null ? reverb.params.wet : (reverb.params.mix != null ? reverb.params.mix * 0.8 : 0.24);
      ins.rvWet.gain.value = rw > 0 ? Math.pow(rw / 0.8, 0.5) * 2.4 : 0;   // wet=0.8 -> 2.4 send (drenched); wet=0 stays EXACTLY dry (zero-state preserved)
    } else { ins.rvWet.gain.value = 0; }
    // Pitch Fix (Auto-Tune)
    var pf = null; ins.fx.forEach(function (s) { if (s.type === "pitchfix" && !s.bypass) pf = s; });
    ins.pitchActive = !!pf;
    if (pf) { ins.pitchParams = pf.params; ins.pitchSmoothCoef = 0.0008 + (1 - Math.min(100, pf.params.retune) / 100) * 0.02; }
    this._ensurePitchNode(ins);
  };
  Engine.prototype._applyFxAll = function () { var self = this; INSERTS.forEach(function (d) { self._applyFx(d.id); }); };

  Engine.prototype.pat = function () { return this.banks[this.activePattern]; };
  Engine.prototype._audible = function (id) {
    var ch = this.channels[id]; if (!ch || ch.muted) return false;
    var anySolo = false, n; for (n in this.channels) if (this.channels[n].solo) { anySolo = true; break; }
    if (anySolo && !ch.solo) return false;
    var ins = this.inserts[ch.route]; if (ins && ins.mute) return false;
    var insSolo = false; for (var k in this.inserts) if (this.inserts[k].solo) { insSolo = true; break; }
    if (insSolo && ins && !ins.solo) return false;
    return true;
  };

  // ---- synthesis -------------------------------------------------------------
  Engine.prototype._voice = function (ctx, noise, type, t, out, semis, vel, durSec) {
    var v = (vel == null ? 100 : vel) / 127, r = Math.pow(2, (semis || 0) / 12);
    function g() { return ctx.createGain(); } function o(tp) { var x = ctx.createOscillator(); if (tp) x.type = tp; return x; }
    function nz() { var n = ctx.createBufferSource(); n.buffer = noise; return n; }
    if (type === "kick") {
      var ko = o(), kg = g(); ko.frequency.setValueAtTime(180 * r, t); ko.frequency.exponentialRampToValueAtTime(46 * r, t + 0.11);
      kg.gain.setValueAtTime(v, t); kg.gain.exponentialRampToValueAtTime(0.0008, t + 0.44); ko.connect(kg); kg.connect(out); ko.start(t); ko.stop(t + 0.46);
      var c = o("triangle"), cg = g(); c.frequency.setValueAtTime(1100 * r, t); cg.gain.setValueAtTime(0.45 * v, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03); c.connect(cg); cg.connect(out); c.start(t); c.stop(t + 0.04);
    } else if (type === "sub" || type === "reese") {
      var base = (type === "sub" ? 36 : 36) + semis, f = m2f(base);
      var s1 = o("sine"); s1.frequency.value = f; var sg = g(); var pk = (type === "reese" ? 0.5 : 0.85) * v;
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(pk, t + 0.012); sg.gain.setValueAtTime(pk, t + durSec * 0.6); sg.gain.exponentialRampToValueAtTime(0.0001, t + durSec);
      s1.connect(sg); sg.connect(out); s1.start(t); s1.stop(t + durSec + 0.05);
      if (type === "reese") { var s2 = o("sawtooth"); s2.frequency.value = f; s2.detune.value = 14; var s3 = o("sawtooth"); s3.frequency.value = f; s3.detune.value = -14; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; s2.connect(lp); s3.connect(lp); lp.connect(sg); s2.start(t); s3.start(t); s2.stop(t + durSec + 0.05); s3.stop(t + durSec + 0.05); }
    } else if (type === "snare") {
      var n = nz(); var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1500; var ng = g(); ng.gain.setValueAtTime(0.85 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18); n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.2);
      var to = o("triangle"), tg = g(); to.frequency.setValueAtTime(195, t); tg.gain.setValueAtTime(0.5 * v, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.11); to.connect(tg); tg.connect(out); to.start(t); to.stop(t + 0.12);
    } else if (type === "clap") {
      [0, 0.011, 0.022, 0.04].forEach(function (off, i) { var n = nz(); var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 0.9; var cg = g(); var tt = t + off; cg.gain.setValueAtTime((i === 3 ? 0.5 : 0.32) * v, tt); cg.gain.exponentialRampToValueAtTime(0.001, tt + (i === 3 ? 0.2 : 0.05)); n.connect(bp); bp.connect(cg); cg.connect(out); n.start(tt); n.stop(tt + 0.22); });
    } else if (type === "chat" || type === "shaker") {
      var n = nz(); var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = type === "shaker" ? 6000 : 8500; var ng = g(); var dec = type === "shaker" ? 0.05 : 0.045; ng.gain.setValueAtTime((type === "shaker" ? 0.35 : 0.5) * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dec); n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t); n.stop(t + dec + 0.02);
    } else if (type === "ohat") {
      var n = nz(); var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500; var ng = g(); ng.gain.setValueAtTime(0.45 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3); n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.32);
    } else if (type === "anvil") {
      [1, 1.41, 1.88, 2.51].forEach(function (mu, i) { var os = o("square"); os.frequency.value = 280 * mu * r; var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 6; var ag = g(); ag.gain.setValueAtTime((0.18 / (i + 1)) * v, t); ag.gain.exponentialRampToValueAtTime(0.001, t + 0.22); os.connect(bp); bp.connect(ag); ag.connect(out); os.start(t); os.stop(t + 0.24); });
    } else if (type === "rim") {
      var os = o("square"); os.frequency.value = 1700 * r; var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 8; var rg = g(); rg.gain.setValueAtTime(0.5 * v, t); rg.gain.exponentialRampToValueAtTime(0.001, t + 0.04); os.connect(bp); bp.connect(rg); rg.connect(out); os.start(t); os.stop(t + 0.05);
    } else if (type === "glitch") {
      var f = m2f(60 + semis); var os = o("sawtooth"); os.frequency.value = f; var sq = o("square"); sq.frequency.value = f * 1.005; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(700, t + durSec); lp.Q.value = 9; var gg = g(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.005); gg.gain.exponentialRampToValueAtTime(0.0001, t + durSec); os.connect(lp); sq.connect(lp); lp.connect(gg); gg.connect(out); os.start(t); sq.start(t); os.stop(t + durSec + 0.03); sq.stop(t + durSec + 0.03);
    } else if (type === "vox") {
      var f = m2f(60 + semis); var src = o("sawtooth"); src.frequency.value = f; var gg = g(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.03); gg.gain.setValueAtTime(0.3 * v, t + durSec * 0.5); gg.gain.exponentialRampToValueAtTime(0.0001, t + durSec);
      [[700, 8], [1100, 9], [2600, 10]].forEach(function (fm) { var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fm[0]; bp.Q.value = fm[1]; src.connect(bp); bp.connect(gg); }); gg.connect(out); src.start(t); src.stop(t + durSec + 0.05);
    } else if (type === "pluck") {
      // chord pluck: root + maj/min triad
      [0, 4, 7].forEach(function (iv) { var f = m2f(48 + semis + iv); var os = o("triangle"); os.frequency.value = f; var sw = o("sawtooth"); sw.frequency.value = f; sw.detune.value = 6; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(800, t + 0.4); var pg = g(); pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.14 * v, t + 0.006); pg.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.45, durSec)); os.connect(lp); sw.connect(lp); lp.connect(pg); pg.connect(out); os.start(t); sw.start(t); os.stop(t + durSec + 0.5); sw.stop(t + durSec + 0.5); });
    } else if (type === "arp") {
      var f = m2f(60 + semis); var os = o("square"); os.frequency.value = f; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200; lp.Q.value = 5; var gg = g(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.004); gg.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(durSec, 0.22)); os.connect(lp); lp.connect(gg); gg.connect(out); os.start(t); os.stop(t + 0.3);
    } else if (type === "lead") {
      var f = m2f(72 + semis); var a = o("sawtooth"); a.frequency.value = f; var b = o("sawtooth"); b.frequency.value = f; b.detune.value = 10; var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(1600, t + durSec); lp.Q.value = 4; var gg = g(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.24 * v, t + 0.01); gg.gain.setValueAtTime(0.2 * v, t + durSec * 0.6); gg.gain.exponentialRampToValueAtTime(0.0001, t + durSec); a.connect(lp); b.connect(lp); lp.connect(gg); gg.connect(out); a.start(t); b.start(t); a.stop(t + durSec + 0.05); b.stop(t + durSec + 0.05);
    } else if (type === "riser") {
      var n = nz(); n.loop = true; var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(9000, t + durSec); bp.Q.value = 2; var gg = g(); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(0.3 * v, t + durSec * 0.9); gg.gain.exponentialRampToValueAtTime(0.0001, t + durSec); n.connect(bp); bp.connect(gg); gg.connect(out); n.start(t); n.stop(t + durSec + 0.05);
    }
  };

  // play a decoded AudioBuffer (sampler voice). pitch via playbackRate, velocity via gain.
  // durSec/offsetSec (optional) trim playback to a clip window — used for tempo-bound chopping
  // on the timeline (both are derived from ticks via tickToSec, so they track the active BPM).
  Engine.prototype._playBuffer = function (ctx, buffer, t, out, semis, vel, durSec, offsetSec, opts) {
    if (!buffer) return;
    opts = opts || {};
    var src = ctx.createBufferSource(); src.buffer = buffer;
    var rate = Math.pow(2, (semis || 0) / 12); src.playbackRate.value = rate;
    var g = ctx.createGain();
    var baseGain = ((vel == null ? 100 : vel) / 127) * (opts.gain != null ? opts.gain : 1);
    var off = Math.max(0, offsetSec || 0);
    // natural play length of the remaining buffer at this rate. Fix 3: when durSec is falsy
    // (an untrimmed Audio-Lane clip), the boundary IS the buffer end — no measure/loop clamp.
    var natural = (buffer.duration - off) / rate;
    var playDur = (durSec && durSec > 0) ? Math.min(durSec, natural) : natural;
    if (!(playDur > 0)) playDur = natural;
    // Fix 4 de-click: never hard-stop a source at non-zero gain. Always ramp the voice gain to
    // ~0 over the last few ms (>= 8ms, or the clip's fade-out) and only stop after the ramp.
    // A short attack ramp also removes the leading transient click on low-freq (808) voices.
    var DECLICK = 0.008;
    var atk = Math.min(Math.max(opts.fadeIn || 0, 0.003), playDur * 0.5);
    var rel = Math.min(Math.max(opts.fadeOut || 0, DECLICK), playDur);
    var atkEnd = t + atk, relStart = t + Math.max(playDur - rel, atk);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(baseGain, atkEnd);
    g.gain.setValueAtTime(baseGain, relStart);
    g.gain.linearRampToValueAtTime(0.0001, t + playDur);
    src.connect(g); g.connect(out);
    src.start(t, off);
    try { src.stop(t + playDur + 0.02); } catch (e) {}   // tail past the release so the ramp completes
    // Phase 8: track LIVE voices only (never the offline render ctx) so pause/stop can silence them.
    if (ctx === this.ctx) {
      var self = this, voice = { src: src, gain: g };
      this._laneVoices.push(voice);
      src.onended = function () { var k = self._laneVoices.indexOf(voice); if (k >= 0) self._laneVoices.splice(k, 1); };
    }
  };
  // Phase 8: synchronously de-click + stop every live buffer voice (lane clips / sampler one-shots)
  // on transport pause/stop. Cancel scheduled gain, ramp to ~0 over 8ms, THEN stop — never a hard
  // stop(0) at non-zero gain (that reintroduces the 808-tail click). The array is cleared up front
  // so a rapid play/pause/play can't leave overlapping voices behind.
  Engine.prototype._killLaneVoices = function () {
    var ctx = this.ctx; if (!ctx) { this._laneVoices = []; return; }
    var now = ctx.currentTime, R = 0.008, vs = this._laneVoices;
    this._laneVoices = [];
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      try {
        var g = v.gain.gain;
        g.cancelScheduledValues(now);
        var cur = g.value; if (!(cur > 0.0001)) cur = 0.0001;
        g.setValueAtTime(cur, now);
        g.linearRampToValueAtTime(0.0001, now + R);
        v.src.onended = null;
        v.src.stop(now + R + 0.01);
      } catch (e) {}
    }
  };
  // ---- Synth Suite (Phase 1): native polyphonic oscillator synth -----------
  // A real-time synthesis source for kind:'synth' tracks. One OscillatorNode per note (Saw /
  // Triangle / Square), shaped by a strict per-voice ADSR gain envelope, routed into the same
  // id-based mixer channel as every other voice (out = ch.gain -> panner -> inserts[route]).
  // ctx is passed in (live this.ctx OR an OfflineAudioContext for export); live voices are tracked
  // for the polyphony cap + de-click on stop. midi = absolute MIDI note (A4 = 440Hz, equal temp).
  Engine.prototype._synthVoice = function (ctx, t, out, midi, vel, durSec, params, opts) {
    if (!out) return null;
    params = params || {};
    opts = opts || {};
    var preview = !!opts.preview;   // preview voices use the reserved sub-pool, not _synthVoices
    var wave = params.wave || "sawtooth";
    // ADSR (seconds / 0..1). attack ~5ms is click-free; release reuses the >=8ms de-click floor so
    // a synth note-off ramps to silence on the same contract as the 808 sampler voices.
    var A = Math.max(0.001, params.attack != null ? params.attack : 0.005);
    var D = Math.max(0.001, params.decay != null ? params.decay : 0.12);
    var S = Math.min(1, Math.max(0.0001, params.sustain != null ? params.sustain : 0.7));
    var R = Math.max(0.008, params.release != null ? params.release : 0.08);   // de-click floor
    var v = (vel == null ? 100 : vel) / 127;
    var hold = (durSec && durSec > 0) ? durSec : 0.25;
    var peak = Math.max(0.0008, v * 0.45);            // headroom: many voices may stack
    var sus = Math.max(0.0006, peak * S);
    // live polyphony cap with voice-stealing (skip for the offline bounce — no realtime CPU bound).
    // preview auditions cap their OWN reserved pool so they never steal a sustaining playback voice.
    if (ctx === this.ctx) { if (preview) this._stealPrev(); else this._stealSynth(); }
    // SOURCE BRANCH (Phase 5 Melody Maker): one voice engine, two sound sources. opts.buffer present
    // => polySampler (AudioBufferSourceNode resampled to pitch, playbackRate = 2^((midi-60)/12),
    // root C4/MIDI60); absent => native oscillator synth (dormant). The buffer node is stored as
    // `osc` so it flows through the SAME ADSR gain, voice-steal pool, de-click stop, and onended
    // slot-cleanup below with zero duplicated logic. One-shot to natural end falls out for free:
    // if the buffer ends before relEnd, onended fires early and returns the slot; high notes (rate>1)
    // end sooner — correct resampling. Loop only when a region is explicitly tagged.
    var buf = opts.buffer || null;
    var osc;
    if (buf) {
      osc = ctx.createBufferSource(); osc.buffer = buf;
      osc.playbackRate.setValueAtTime(Math.pow(2, (midi - 60) / 12), t);
      if (opts.loop) { osc.loop = true; }
    } else {
      osc = ctx.createOscillator(); osc.type = wave; osc.frequency.setValueAtTime(m2f(midi), t);
    }
    var g = ctx.createGain();
    var t0 = t, atkEnd = t0 + A, decEnd = atkEnd + D;
    var relStart = Math.max(t0 + hold, decEnd);       // ensure the decay segment always completes
    var relEnd = relStart + R;
    // ADSR: never hard-step; exponential ramps stay > 0 (WebAudio requirement) and end on a
    // de-click ramp so the voice is never cut at non-zero gain.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, atkEnd);          // Attack
    g.gain.exponentialRampToValueAtTime(sus, decEnd);           // Decay -> Sustain level
    g.gain.setValueAtTime(sus, relStart);                       // Sustain hold
    g.gain.exponentialRampToValueAtTime(0.0001, relEnd);        // Release (>= de-click)
    osc.connect(g); g.connect(out);
    osc.start(t0); try { osc.stop(relEnd + 0.02); } catch (e) {}
    if (ctx === this.ctx) {
      var voice = { osc: osc, gain: g, end: relEnd };
      var pool = preview ? this._prevVoices : this._synthVoices;
      pool.push(voice);
      osc.onended = function () { var k = pool.indexOf(voice); if (k >= 0) pool.splice(k, 1); };
    }
    return g;
  };
  // voice-stealing: while at/over the polyphony cap, de-click-ramp + stop the OLDEST live voice
  // (front of the queue) so dense patterns can't spawn unbounded oscillators / spike CPU.
  Engine.prototype._stealSynth = function () {
    var cap = this._synthPoly || 16, ctx = this.ctx;
    while (this._synthVoices.length >= cap) {
      var old = this._synthVoices.shift(); if (!old) break;
      try {
        var now = ctx.currentTime, gg = old.gain.gain, cur = gg.value; if (!(cur > 0.0001)) cur = 0.0001;
        gg.cancelScheduledValues(now); gg.setValueAtTime(cur, now); gg.exponentialRampToValueAtTime(0.0001, now + 0.008);
        old.osc.onended = null; old.osc.stop(now + 0.02);
      } catch (e) {}
    }
  };
  // preview-pool voice-stealing: identical FIFO de-click as _stealSynth but bounded by _prevPoly
  // and operating ONLY on _prevVoices, so previewing never touches a playback voice.
  Engine.prototype._stealPrev = function () {
    var cap = this._prevPoly || 4, ctx = this.ctx;
    while (this._prevVoices.length >= cap) {
      var old = this._prevVoices.shift(); if (!old) break;
      try {
        var now = ctx.currentTime, gg = old.gain.gain, cur = gg.value; if (!(cur > 0.0001)) cur = 0.0001;
        gg.cancelScheduledValues(now); gg.setValueAtTime(cur, now); gg.exponentialRampToValueAtTime(0.0001, now + 0.008);
        old.osc.onended = null; old.osc.stop(now + 0.02);
      } catch (e) {}
    }
  };
  // de-click + stop every live synth voice on transport pause/stop (mirrors _killLaneVoices).
  Engine.prototype._killSynthVoices = function () {
    var ctx = this.ctx; var vs = this._synthVoices; this._synthVoices = [];
    if (!ctx) return;
    var now = ctx.currentTime, R = 0.008;
    for (var i = 0; i < vs.length; i++) {
      try {
        var gg = vs[i].gain.gain, cur = gg.value; if (!(cur > 0.0001)) cur = 0.0001;
        gg.cancelScheduledValues(now); gg.setValueAtTime(cur, now); gg.exponentialRampToValueAtTime(0.0001, now + R);
        vs[i].osc.onended = null; vs[i].osc.stop(now + R + 0.01);
      } catch (e) {}
    }
  };
  // Per-step modulation node (Fix 2): wrap the voice destination with an optional gain (dB
  // offset) + stereo pan so a single step can be louder/quieter and panned without touching the
  // channel's own level/pan. Returns the node the voice should connect INTO. No-op when 0/0.
  Engine.prototype._modNode = function (dest, mod) {
    var node = dest;
    if (mod.pan && this.ctx.createStereoPanner) {
      var p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, mod.pan)); p.connect(dest); node = p;
    }
    if (mod.vol) {
      var g = this.ctx.createGain(); g.gain.value = Math.pow(10, mod.vol / 20); g.connect(node); node = g;
    }
    return node;
  };
  Engine.prototype._fire = function (chId, t, semis, vel, durSec, out, mod) {
    var ch = this.channels[chId]; if (!ch) return;
    // ROUTING: all voices via channel insert. `out` defaults to ch.gain (-> panner ->
    // inserts[route].input). A routeOverride clip passes a one-shot send node wired to a
    // different insert (still post channel-gain), so every voice still passes an insert FX chain.
    var dest = out || ch.gain;
    if (mod && (mod.pan || mod.vol)) dest = this._modNode(dest, mod);   // per-step pan/vol offsets
    // SCHED: single-fire guarantee — a tonal sampler voice (melodic/long sample) honors the
    // note/step length so it stops at its boundary instead of ringing on at full buffer length
    // and stacking under the next trigger (the "intense echo / slap-back" bug). Non-tonal
    // one-shots (drums) pass 0 -> full natural decay, unchanged.
    // SCHED: kind:'synth' tracks fire the native polyphonic oscillator synth (Phase 1) instead of
    // a sampler buffer or a fixed factory voice. midi = channel root (base) + the note's semis.
    // SCHED: kind:'polySampler' (Phase 5 Melody Maker) fires the SAME synth voice as kind:'synth'
    // but with a buffer source — one decoded sample resampled to each note's pitch. Checked FIRST
    // (its type is also "sampler" for IDB persistence, so it must short-circuit the sampler branch).
    if (ch.def.kind === "polySampler") { this._synthVoice(this.ctx, t, dest, (ch.def.base || 0) + (semis || 0), vel, durSec, ch.def.synth, { buffer: this.userBuffers[ch.def.bufferId] }); return; }
    if (ch.def.kind === "synth") { this._synthVoice(this.ctx, t, dest, (ch.def.base || 0) + (semis || 0), vel, durSec, ch.def.synth); return; }
    if (ch.def.type === "sampler") { this._playBuffer(this.ctx, this.userBuffers[ch.def.bufferId], t, dest, semis, vel, ch.def.tonal ? durSec : 0); return; }
    this._voice(this.ctx, this.noise, ch.def.type, t, dest, semis, vel, durSec);
  };
  Engine.prototype.trigger = function (chId, semis) {
    this.init(); this.resume(); var ch = this.channels[chId]; if (!ch) return;
    var dur = ch.def.tonal ? 0.5 : 0.2; this._fire(chId, this.ctx.currentTime, semis || 0, 110, dur);
  };
  // isolated one-shot preview of a browser sample (single voice; new preview cuts the old)
  Engine.prototype.previewSample = function (sample) {
    this.init(); this.resume();
    try { if (this._prev) this._prev.disconnect(); } catch (e) {}
    var g = this.ctx.createGain(); g.gain.value = 0.95; g.connect(this.master); this._prev = g;
    var dur = sample.tonal ? 0.7 : (sample.type === "ohat" || sample.type === "sub" || sample.type === "reese" || sample.type === "riser" ? 0.45 : 0.24);
    this._voice(this.ctx, this.noise, sample.type, this.ctx.currentTime, g, sample.previewSemis || 0, 114, dur);
  };
  // hot-swap a channel's underlying voice (sample buffer) without interrupting playback
  Engine.prototype.assignVoice = function (chId, sample) {
    this.init(); var ch = this.channels[chId]; if (!ch) return;
    ch.def.type = sample.type; ch.def.tonal = !!sample.tonal;
    if (sample.base != null) ch.def.base = sample.base;
    ch.def.label = sample.name.replace(/\.wav$/i, "");
    ch.def.sampleId = sample.id;
    for (var b = 0; b < this.banks.length; b++) this.syncRackClip(chId, b);   // root/tonal change -> re-pitch mirror clips
  };

  // ---- user audio: import + sampler lanes -----------------------------------
  // read a File/Blob -> ArrayBuffer -> decodeAudioData -> AudioBuffer (via the live ctx)
  Engine.prototype.decodeAudioFile = function (file, onOk, onErr) {
    this.init(); var self = this;
    var fr = new FileReader();
    fr.onload = function () {
      // decodeAudioData (callback form for widest browser support)
      try {
        self.ctx.decodeAudioData(fr.result, function (buf) { onOk && onOk(buf); }, function (e) { onErr && onErr(e || new Error("decode failed")); });
      } catch (e) { onErr && onErr(e); }
    };
    fr.onerror = function () { onErr && onErr(fr.error || new Error("file read failed")); };
    fr.readAsArrayBuffer(file);
  };
  // register a decoded buffer in live sample memory and spawn a sampler lane preloaded with it
  Engine.prototype.addSampler = function (name, audioBuffer, opts) {
    this.init(); opts = opts || {};
    var n = 1, id = "smp"; while (this.channels[id]) { id = "smp_" + (++n); }
    this.userBuffers[id] = audioBuffer;                 // live buffer keyed by channel id
    var maxRoute = 0; this.channelDefs.forEach(function (c) { if (c.route > maxRoute) maxRoute = c.route; });
    var route = Math.min(16, maxRoute + 1);
    var label = (name || "Sample").replace(/\.[a-z0-9]+$/i, "").slice(0, 22);
    var def = { id: id, label: label, type: "sampler", kind: "sampler", color: opts.color || "#C77DFF", route: route,
                vol: 0.9, pan: 0, tonal: opts.tonal !== false, base: opts.base != null ? opts.base : 60,
                bufferId: id, sampleId: id, userAudio: true, workspace: "producer" };
    this.channelDefs.push(def);
    this.banks.forEach(function (bk) { bk.steps[id] = freshStepRow(patLen(bk)); });
    this._wireChannel(def);
    this.focus = id;
    // persist the raw binary (Blob/File/ArrayBuffer) under the channel id — fire-and-forget,
    // error-isolated so a storage failure never blocks adding the track.
    if (opts.raw) {
      var blob = (opts.raw instanceof Blob) ? opts.raw : new Blob([opts.raw]);
      idbPut(id, blob)["catch"](function (e) { console.warn("[SampleDB] save failed for " + id + ":", e); });
    }
    return def;
  };
  // Phase 5 Melody Maker: a polyphonic pitch-shifting sampler track. Like addSampler (one decoded
  // buffer, IDB-persisted, tonal, root C4/MIDI60) but kind:"polySampler" so _fire routes it through
  // the shared synth voice's buffer source instead of a one-shot _playBuffer. type:"sampler" is
  // deliberate so hydrate's _rehydrateSample restores the buffer with no extra plumbing; the synth
  // ADSR object drives the per-note envelope shared with the (dormant) oscillator synth. A
  // polySampler is NEVER created without a buffer (the Melody Maker picker decodes a file first).
  Engine.prototype.addPolySamplerTrack = function (name, audioBuffer, raw) {
    this.init();
    var n = 1, id = "mel"; while (this.channels[id]) { id = "mel_" + (++n); }
    this.userBuffers[id] = audioBuffer;
    var maxRoute = 0; this.channelDefs.forEach(function (c) { if (c.route > maxRoute) maxRoute = c.route; });
    var route = Math.min(16, maxRoute + 1);
    var label = (name || "Melody").replace(/\.[a-z0-9]+$/i, "").slice(0, 22);
    var def = { id: id, label: label, type: "sampler", kind: "polySampler", color: "#9d4edd", route: route,
                vol: 0.9, pan: 0, tonal: true, base: 60, bufferId: id, sampleId: id, userAudio: true, workspace: "producer",
                synth: { wave: "sawtooth", attack: 0.005, decay: 0.12, sustain: 0.8, release: 0.12 } };
    this.channelDefs.push(def);
    this.banks.forEach(function (bk) { bk.steps[id] = freshStepRow(patLen(bk)); });
    this._wireChannel(def);
    this.focus = id;
    if (raw) {
      var blob = (raw instanceof Blob) ? raw : new Blob([raw]);
      idbPut(id, blob)["catch"](function (e) { console.warn("[SampleDB] save failed for " + id + ":", e); });
    }
    return def;
  };

  // ---- microphone capture (MediaRecorder -> decode -> sampler lane) ----------
  // handlers: { onStart, onStop(audioBuffer), onError(err) }
  Engine.prototype.recordMic = function (handlers) {
    this.init(); var self = this; handlers = handlers || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      handlers.onError && handlers.onError(new Error("Microphone capture unsupported in this browser")); return;
    }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      var mr = new MediaRecorder(stream), chunks = [];
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (tk) { tk.stop(); });            // release the mic
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || "audio/webm" });
        self.decodeAudioFile(blob, function (buf) { handlers.onStop && handlers.onStop(buf, blob); }, function (err) { handlers.onError && handlers.onError(err); });
      };
      self._micRec = mr; mr.start(); handlers.onStart && handlers.onStart();
    }).catch(function (e) { handlers.onError && handlers.onError(e); });
  };
  Engine.prototype.stopMic = function () { try { if (this._micRec && this._micRec.state !== "inactive") this._micRec.stop(); } catch (e) {} this._micRec = null; };
  Engine.prototype.isRecording = function () { return !!(this._micRec && this._micRec.state === "recording"); };

  // ---- continuous timeline audio recording (BandLab-style) ------------------
  // a dedicated audio lane that hosts recorded clips (no synthesis voice)
  // `workspace` tags the owning mode: Studio "Add Track" passes 'studio'; melody imports (addMelodyFile)
  // leave it default 'producer' so an imported melody lane stays in the Producer arrangement.
  Engine.prototype.addAudioTrack = function (name, workspace) {
    this.init();
    var n = 1, id = "rec"; while (this.channels[id]) { id = "rec_" + (++n); }
    var maxRoute = 0; this.channelDefs.forEach(function (c) { if (c.route > maxRoute) maxRoute = c.route; });
    var def = { id: id, label: name || ("Audio " + n), type: "audio", kind: "audioLane", color: "#C77DFF", route: Math.min(16, maxRoute + 1), vol: 0.9, pan: 0, tonal: false, base: 0, audioLane: true, workspace: workspace === "studio" ? "studio" : "producer" };
    this.channelDefs.push(def);
    this.banks.forEach(function (bk) { bk.steps[id] = freshStepRow(patLen(bk)); });
    this._wireChannel(def); this.focus = id;
    return def;
  };
  // ---- Fix 1: "Add Melody File" — continuous Audio Lane ingestion ------------
  // A melody import is NOT forced into a sampler/step track. It creates a dedicated Audio Lane
  // (kind:'audioLane') and drops a single linear clip that spans the file's TRUE length on the
  // timeline immediately, as a waveform. It schedules sample-accurately via the transport
  // (_fireEvent -> _playBuffer with offset), never via sequencer events / a step block. The clip
  // carries gain + non-destructive fade handles + is splittable (see splitClipAt).
  Engine.prototype.addMelodyFile = function (name, buffer, blob) {
    this.init(); if (!buffer) return null;
    var def = this.addAudioTrack((name || "Melody").replace(/\.[a-z0-9]+$/i, "").slice(0, 22));
    var bufId = "mel_" + (++this._recSeq);
    this.userBuffers[bufId] = buffer;
    var clip = { id: this._newClipId(), kind: "audio", ch: def.id, startTick: 0,
      lengthTicks: Math.max(this.SNAP_TICKS, this.secToTick(buffer.duration)),
      bufferId: bufId, offsetTicks: 0, name: def.label, peaks: this.computePeaks(buffer),
      gain: 1, fadeInTicks: 0, fadeOutTicks: 0, trimmed: false };   // untrimmed -> plays to natural end (no cap)
    this.timeline.clips.push(clip);
    this.recomputeTimelineLength();
    if (blob) { var b = (blob instanceof Blob) ? blob : new Blob([blob]); idbPut(bufId, b)["catch"](function (e) { console.warn("[SampleDB] melody save failed:", e); }); }
    this.focus = def.id; this._refreshTimelineEvents();
    return { def: def, clip: clip };
  };
  // ---- Fix 1: split / slice a timeline clip at an absolute tick (playhead or arbitrary) ------
  // Non-destructive: the left half keeps [start, cut), the right half takes [cut, end). Audio
  // halves advance offsetTicks so the waveform stays continuous; midi halves partition + rebase
  // their notes. Both halves are flagged trimmed (they now represent a windowed slice).
  Engine.prototype.splitClipAt = function (clipId, absTick) {
    var clips = this.timeline.clips, idx = -1;
    for (var i = 0; i < clips.length; i++) { if (clips[i].id === clipId) { idx = i; break; } }
    if (idx < 0) return null;
    var c = clips[idx], origLen = c.lengthTicks, rel = Math.round(absTick) - c.startTick;
    if (rel <= 0 || rel >= origLen) return null;                  // cut must land strictly inside
    var right = JSON.parse(JSON.stringify(c)); right.id = this._newClipId();
    c.lengthTicks = rel; c.trimmed = true; c.fadeOutTicks = 0;
    right.startTick = c.startTick + rel; right.lengthTicks = origLen - rel; right.trimmed = true; right.fadeInTicks = 0;
    if (c.kind === "audio") { right.offsetTicks = (c.offsetTicks || 0) + rel; }
    else {
      c.notes = (c.notes || []).filter(function (n) { return n.pitchTick < rel; });
      right.notes = (right.notes || []).filter(function (n) { return n.pitchTick >= rel; })
        .map(function (n) { return { pitchTick: n.pitchTick - rel, pitch: n.pitch, lenTicks: n.lenTicks, vel: n.vel }; });
    }
    clips.splice(idx + 1, 0, right);
    this._refreshTimelineEvents();
    return right.id;
  };
  // short metronome blip for the count-in (accented downbeat)
  Engine.prototype.metronomeClick = function (time, accent) {
    this.init(); var ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1200; g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.4 : 0.25, time + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    o.connect(g); g.connect(this.master); o.start(time); o.stop(time + 0.07);
    return o;   // returned so a cancellable count-in can stop a not-yet-started click
  };
  // shared: wire an obtained MediaStream into analyser (live waveform) + optional monitor +
  // MediaRecorder, then hold it in _recState. Used by both mic and screen/tab capture. Records
  // ONLY the audio track(s) — a screen-capture stream's video track is recorded-around (a separate
  // audio-only MediaStream is built) and stopped with the rest on finalize.
  Engine.prototype._beginStreamRecording = function (stream, laneId, startTick, opts) {
    var self = this; opts = opts || {};
    var audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      opts.onError && opts.onError(new Error("No audio in that source — re-share and tick “Share tab/system audio”")); return;
    }
    var audioStream = new MediaStream(audioTracks);           // strip video so MediaRecorder stays audio-only
    var src = self.ctx.createMediaStreamSource(audioStream);
    var an = self.ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    var monitorGain = null;
    if (opts.monitor) { monitorGain = self.ctx.createGain(); monitorGain.gain.value = 0.9; src.connect(monitorGain); monitorGain.connect(self.master); }
    var mr = new MediaRecorder(audioStream), chunks = [];
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    // if the user ends sharing via the browser's own "Stop sharing" bar, finalize gracefully
    try { audioTracks[0].addEventListener("ended", function () { if (self.isTimelineRecording()) opts.onAutoStop && opts.onAutoStop(); }); } catch (e) {}
    self._recState = { laneId: laneId, startTick: startTick, stream: stream, analyser: an, monitorGain: monitorGain, mr: mr, chunks: chunks, t0: self.ctx.currentTime, peaks: [] };
    mr.start(); opts.onStart && opts.onStart(an);
  };
  // begin capture: mic stream -> analyser (live waveform) + optional monitor -> recorder
  Engine.prototype.startTimelineRecording = function (laneId, startTick, opts) {
    this.init(); this.resume(); var self = this; opts = opts || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") { opts.onError && opts.onError(new Error("Recording unsupported")); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) { self._beginStreamRecording(stream, laneId, startTick, opts); })
      ["catch"](function (e) { opts.onError && opts.onError(e); });
  };
  // begin capture: screen / browser-tab / system AUDIO via getDisplayMedia. video:true is required
  // for the browser to offer the source picker; only the audio track is recorded. Monitor defaults
  // off (capturing system audio while monitoring to speakers would feed back).
  Engine.prototype.startScreenRecording = function (laneId, startTick, opts) {
    this.init(); this.resume(); var self = this; opts = opts || {};
    var md = navigator.mediaDevices;
    if (!md || !md.getDisplayMedia || typeof MediaRecorder === "undefined") { opts.onError && opts.onError(new Error("Screen audio capture unsupported in this browser")); return; }
    md.getDisplayMedia({ video: true, audio: true })
      .then(function (stream) { self._beginStreamRecording(stream, laneId, startTick, opts); })
      ["catch"](function (e) { opts.onError && opts.onError(e); });
  };
  Engine.prototype.isTimelineRecording = function () { return !!(this._recState && this._recState.mr && this._recState.mr.state === "recording"); };
  Engine.prototype.stopTimelineRecording = function (onDone, onError) {
    var st = this._recState; if (!st) { onError && onError(new Error("not recording")); return; }
    var self = this, durSec = this.ctx.currentTime - st.t0, peaks = st.peaks.slice();
    st.mr.onstop = function () {
      st.stream.getTracks().forEach(function (t) { t.stop(); });
      try { if (st.monitorGain) st.monitorGain.disconnect(); } catch (e) {}
      var blob = new Blob(st.chunks, { type: (st.chunks[0] && st.chunks[0].type) || "audio/webm" });
      self._finalizeRecording(st.laneId, st.startTick, blob, durSec, peaks, onDone, onError);
      self._recState = null;
    };
    try { st.mr.stop(); } catch (e) { self._recState = null; onError && onError(e); }
  };
  // decode the captured blob, persist it to IndexedDB, and drop a timeline audio clip at the playhead
  Engine.prototype._finalizeRecording = function (laneId, startTick, blob, durSec, peaks, onDone, onError) {
    var self = this, bufId = "rec_" + (++this._recSeq);
    this.decodeAudioFile(blob, function (buf) {
      self.userBuffers[bufId] = buf;
      // Task 4: prefer a true decoded min/max envelope over the coarse live RMS poll; fall back to
      // the polled peaks if the decode yielded nothing.
      var envelope = self.computePeaks(buf);
      var clip = { id: self._newClipId(), kind: "audio", ch: laneId, startTick: startTick,
        lengthTicks: Math.max(self.SNAP_TICKS, self.secToTick(durSec)), bufferId: bufId, offsetTicks: 0,
        name: "Take", peaks: (envelope && envelope.length) ? envelope : peaks };
      self.timeline.clips.push(clip);
      idbPut(bufId, blob)["catch"](function (e) { console.warn("[SampleDB] recording save failed:", e); });
      onDone && onDone(clip);
    }, function (e) { onError && onError(e); });
  };

  // ============================================================================
  // Sprint B — LIVE MICROPHONE CAPTURE (Studio Mode)
  // Real PCM capture replacing the Studio record stub. Sample-accurate engagement
  // via an AudioWorklet gated on the audio clock (ScriptProcessor fallback), writing
  // Float32 straight into a growing buffer. The input is connected through a 0-gain
  // node only (NO monitoring path -> feedback impossible by construction, rule 1).
  // Additive: leaves the MediaRecorder pipeline (_beginStreamRecording, used by the
  // file-09 screen capture) untouched.
  // ============================================================================
  Engine.prototype.getBPM = function () { return this.tempo; };   // transport BPM accessor (prompt contract; engine has no `transport` object)

  // worklet source (runs in AudioWorkletGlobalScope). Gates copying on the audio clock:
  // begins at `startTime`, ends at `stopTime`, posts each 128-sample quantum to the main thread.
  Engine.prototype._captureWorkletSrc = function () {
    return "class PcmCapture extends AudioWorkletProcessor{" +
      "constructor(){super();this._armed=false;this._started=false;this._startTime=0;this._stopTime=Infinity;" +
      "this.port.onmessage=(e)=>{var d=e.data||{};" +
      "if(d.cmd==='arm'){this._startTime=d.at||0;this._stopTime=Infinity;this._armed=true;this._started=false;}" +
      "else if(d.cmd==='stop'){this._stopTime=(d.at!=null)?d.at:currentTime;}" +
      "else if(d.cmd==='disarm'){this._armed=false;this._started=false;}};}" +
      "process(inputs){if(this._armed){var t=currentTime;" +
      "if(!this._started&&t>=this._startTime){this._started=true;this.port.postMessage({ev:'started',at:t});}" +
      "if(this._started&&t<this._stopTime){var ch=inputs[0]&&inputs[0][0];if(ch)this.port.postMessage(ch.slice(0));}" +
      "if(this._started&&t>=this._stopTime){this._armed=false;this._started=false;this.port.postMessage({ev:'stopped',at:t});}}" +
      "return true;}}registerProcessor('pcm-capture',PcmCapture);";
  };

  // Permission-FIRST (rule 4): obtain/verify the mic stream BEFORE anything else. Caches the granted
  // stream for the session; builds the capture node (worklet or ScriptProcessor fallback) wired
  // src -> node -> silent(gain 0) -> master. onReady(latencySec, sampleRate); onError(err).
  Engine.prototype.armMicCapture = function (opts) {
    this.init(); this.resume(); var self = this; opts = opts || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { opts.onError && opts.onError(new Error("Microphone unsupported")); return; }
    function proceed(stream) {
      // tear down any prior capture graph first (re-arm / monitor re-toggle) so source/monitor/silent
      // nodes never stack — otherwise an earlier monitor gain would stay wired to master (double-gain
      // when monitoring, and a node leak per re-arm). Pre-existing latent leak; fixed here since the
      // monitor tap makes it audible.
      if (self._cap) {
        try { self._cap.src.disconnect(); } catch (e) {}
        try { if (self._cap.node) self._cap.node.disconnect(); } catch (e) {}
        try { if (self._cap.silent) self._cap.silent.disconnect(); } catch (e) {}
        try { if (self._cap.monGain) self._cap.monGain.disconnect(); } catch (e) {}
      }
      self._micStream = stream;
      var track = stream.getAudioTracks()[0];
      var settings = (track && track.getSettings) ? track.getSettings() : {};
      // Fix A (alignment) — CAPTURE-SIDE latency ONLY. `baseLatency` is an OUTPUT-path delay; on playback
      // it delays the backing AND the take equally (common-mode), so folding it into the clip-placement
      // shift OVER-compensates and the take plays EARLY (the reported symptom). Compensate only the input/
      // capture-path delay — the amount by which a mic sample's audio-clock label lags the moment the sound
      // physically occurred. Browser-reported input latency is unreliable across devices, so a per-session
      // calibration offset (setRecCalib, ms) is ADDED to this at clip placement to trim the residual by ear.
      var latency = (typeof settings.latency === "number" && settings.latency > 0) ? settings.latency : 0.012;
      var src = self.ctx.createMediaStreamSource(stream);
      var silent = self.ctx.createGain(); silent.gain.value = 0; silent.connect(self.master);   // capture path sink: 0 gain => the CAPTURE branch never monitors
      // input MONITORING = a PARALLEL tap off the raw input source, PRE-capture-buffer (the capture node
      // reads from `src` independently), so toggling monitor mid-take can never alter the recorded audio.
      // input -> monGain (the toggle) -> master. Starts at the session monitor state (default 0/off).
      var monGain = self.ctx.createGain(); monGain.gain.value = self._monitorOn ? 1 : 0; src.connect(monGain); monGain.connect(self.master);
      self._cap = { src: src, silent: silent, monGain: monGain, node: null, chunks: [], frames: 0, qpeaks: [], sr: self.ctx.sampleRate, latency: latency, startedAt: 0, stopped: false, onEngage: null, onDone: null };
      function wireNode(node, isWorklet) {
        self._cap.node = node; self._cap.isWorklet = isWorklet;
        node.port ? (node.port.onmessage = onMsg) : (node.onaudioprocess = onSP);
        src.connect(node); node.connect(silent);
        opts.onReady && opts.onReady(latency, self.ctx.sampleRate);
      }
      function onMsg(e) {
        var d = e.data;
        if (d && d.ev === "started") { self._cap.startedAt = d.at; self._cap.onEngage && self._cap.onEngage(); return; }
        if (d && d.ev === "stopped") { self._assembleCapture(); return; }
        if (d && d.length != null) { self._cap.chunks.push(d); self._cap.frames += d.length; self._pushQPeak(d); }
      }
      // ScriptProcessor fallback: gate on the audio clock in the main thread.
      function onSP(ev) {
        var c = self._cap; if (!c || !c._armed) return;
        var t = self.ctx.currentTime, inp = ev.inputBuffer.getChannelData(0);
        if (!c._spStarted && t >= c._spStart) { c._spStarted = true; c.startedAt = t; c.onEngage && c.onEngage(); }
        if (c._spStarted && t < c._spStop) { var copy = new Float32Array(inp.length); copy.set(inp); c.chunks.push(copy); c.frames += copy.length; self._pushQPeak(copy); }
        if (c._spStarted && t >= c._spStop) { c._armed = false; self._assembleCapture(); }
      }
      if (self.ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        var url = URL.createObjectURL(new Blob([self._captureWorkletSrc()], { type: "application/javascript" }));
        self.ctx.audioWorklet.addModule(url).then(function () {
          URL.revokeObjectURL(url);
          try { wireNode(new AudioWorkletNode(self.ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }), true); }
          catch (e) { wireNode(self.ctx.createScriptProcessor(4096, 1, 1), false); }
        })["catch"](function () { wireNode(self.ctx.createScriptProcessor(4096, 1, 1), false); });
      } else {
        wireNode(self.ctx.createScriptProcessor(4096, 1, 1), false);
      }
    }
    // reuse a still-live cached stream (session cache, rule 4) — no re-prompt
    if (this._micStream && this._micStream.getAudioTracks().some(function (t) { return t.readyState === "live"; })) { proceed(this._micStream); return; }
    // Fix 1 — RAW signal for music tracking: echoCancellation/noiseSuppression/autoGainControl OFF.
    // With monitoring ON, the browser echo-canceller "hears" the monitored output as echo and
    // dynamically ducks/warps the mic track (corrupting BOTH the take and the monitor, since both read
    // this same processed track). AGC/NS additionally pump/gate a sung/played signal. A tracking DAW
    // wants the unprocessed input; acoustic speaker feedback stays a user-environment concern (headphones
    // warning covers it). Booleans (not {ideal:...}) so a UA that can't disable them rejects → onError.
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(proceed)["catch"](function (e) { opts.onError && opts.onError(e); });
  };

  // per-quantum max-abs -> live-waveform envelope source (downsampled at render by capturePeaks)
  Engine.prototype._pushQPeak = function (chunk) {
    var m = 0; for (var i = 0; i < chunk.length; i++) { var a = chunk[i] < 0 ? -chunk[i] : chunk[i]; if (a > m) m = a; }
    this._cap.qpeaks.push(m);
  };
  // arm capture to ENGAGE at audio-clock time `atTime` (sample-accurate downbeat). onEngage fires
  // from the node the instant copying begins; onDone(result) fires when the assembled buffer is ready.
  Engine.prototype.beginMicCapture = function (atTime, onEngage, onDone) {
    var c = this._cap; if (!c) return;
    c.onEngage = onEngage || null; c.onDone = onDone || null; c.chunks = []; c.frames = 0; c.qpeaks = []; c.stopped = false; c.startedAt = 0;
    if (c.isWorklet) { c._armed = true; c.node.port.postMessage({ cmd: "arm", at: atTime }); }
    else { c._armed = true; c._spStarted = false; c._spStart = atTime; c._spStop = Infinity; }
  };
  // true only once copying has actually ENGAGED (not merely armed during the count-in)
  Engine.prototype.isMicCapturing = function () { var c = this._cap; return !!(c && c._armed && !c.stopped && (c.isWorklet ? c.startedAt > 0 : c._spStarted)); };
  Engine.prototype.isMicArmed = function () { return !!(this._cap && this._cap._armed && !this._cap.stopped); };
  Engine.prototype.captureElapsed = function () { var c = this._cap; return (c && c.frames) ? c.frames / c.sr : 0; };
  // downsample the accumulated per-quantum peaks to `cols` buckets for the live growing waveform
  Engine.prototype.capturePeaks = function (cols) {
    var c = this._cap; if (!c || !c.qpeaks.length) return [];
    cols = cols || Math.min(600, c.qpeaks.length); var out = [], n = c.qpeaks.length;
    for (var i = 0; i < cols; i++) { var a = Math.floor(i / cols * n), b = Math.floor((i + 1) / cols * n), m = 0; for (var j = a; j < b; j++) if (c.qpeaks[j] > m) m = c.qpeaks[j]; out.push(m); }
    return out;
  };
  // stop capture; the node posts 'stopped' -> _assembleCapture builds the AudioBuffer + calls onDone.
  Engine.prototype.stopMicCapture = function (onDone) {
    var c = this._cap; if (!c) { onDone && onDone(null); return; }
    if (onDone) c.onDone = onDone;
    if (c.isWorklet) { c.node.port.postMessage({ cmd: "stop" }); }
    else { c._spStop = this.ctx.currentTime; if (!c._spStarted) this._assembleCapture(); }
  };
  // abort with NO clip produced (count-in cancel). Keeps the stream cached for the session.
  Engine.prototype.cancelMicCapture = function () {
    var c = this._cap; if (!c) return; c.stopped = true; c.onDone = null; c.onEngage = null;
    if (c.isWorklet && c.node) { try { c.node.port.postMessage({ cmd: "disarm" }); } catch (e) {} }
    else if (c) { c._armed = false; }
    c.chunks = []; c.frames = 0; c.qpeaks = [];
  };
  // assemble captured Float32 chunks into a mono AudioBuffer at the ctx sample rate, fire onDone.
  Engine.prototype._assembleCapture = function () {
    var c = this._cap; if (!c || c.stopped) return; c.stopped = true;
    var frames = c.frames, done = c.onDone; var res = null;
    if (frames > 0) {
      var buf = this.ctx.createBuffer(1, frames, c.sr), out = buf.getChannelData(0), off = 0;
      c.chunks.forEach(function (ch) { out.set(ch, off); off += ch.length; });
      res = { buffer: buf, durSec: frames / c.sr, latencySec: c.latency, startedAt: c.startedAt };
    }
    done && done(res);
  };
  // input-monitoring toggle (Rec-Audio enhancement, decision 2). Ramps the parallel monitor tap
  // (input -> monGain -> master) 0<->1 with an 8ms de-click. `on` is remembered on the engine so the
  // next armMicCapture re-applies it. The capture buffer is unaffected (it reads from a separate node).
  Engine.prototype.setMonitor = function (on) {
    this._monitorOn = !!on;
    var c = this._cap;
    if (c && c.monGain) { var t = this.ctx.currentTime; c.monGain.gain.cancelScheduledValues(t); c.monGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.008); }
  };
  Engine.prototype.isMonitorOn = function () { return !!this._monitorOn; };
  // Fix A (alignment) — per-session recording latency calibration (ms, default 0). ADDED to the measured
  // capture-side latency at clip placement (positive = shift the take EARLIER / more compensation, negative
  // = LATER / less). Exists because browser-reported latency is unreliable; the manual test script tunes it
  // by ear per device (record a click against the backing click, measure the gap in the WaveEditor, set this).
  Engine.prototype.setRecCalib = function (ms) { ms = +ms; this._recCalibMs = isFinite(ms) ? ms : 0; };
  Engine.prototype.getRecCalib = function () { return this._recCalibMs || 0; };
  Engine.prototype.recCalibSec = function () { return (this._recCalibMs || 0) / 1000; };
  // Fix 1 (alignment) — map an audio-clock time to a fractional playhead tick using the live playhead
  // anchor (_phPoint = {tick, time}, re-seeded on start/seek and constant-tempo linear between). Lets the
  // App place a take from the ACTUAL first-captured-sample clock time (_cap.startedAt) instead of ASSUMING
  // capture engaged exactly at the requested downbeat — removing the engage-gap (worklet quantum + arm
  // latency) that left takes mis-placed even after the prior baseLatency/calibration fix.
  Engine.prototype.tickAtTime = function (clockTime) {
    var pp = this._phPoint;
    if (!pp || !this.isPlaying) return this.playheadTick;
    return pp.tick + (clockTime - pp.time) / this.secPerTick();
  };
  // exact audio-clock time the first captured sample was copied (set by the capture node at engage)
  Engine.prototype.captureStartedAt = function () { return (this._cap && this._cap.startedAt) || 0; };
  // release the cached mic stream + capture nodes (session end / teardown)
  Engine.prototype.releaseMic = function () {
    var c = this._cap;
    if (c) { try { c.src.disconnect(); } catch (e) {} try { if (c.node) c.node.disconnect(); } catch (e) {} try { c.silent.disconnect(); } catch (e) {} try { if (c.monGain) c.monGain.disconnect(); } catch (e) {} }
    if (this._micStream) { try { this._micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    this._micStream = null; this._cap = null;
  };

  // ---- MIDI / keyboard performance input (Phase 4A) -------------------------
  // audition a note immediately (semis = offset from the channel's root)
  Engine.prototype.playLiveNote = function (chId, semis, vel) {
    this.init(); this.resume(); var ch = this.channels[chId]; if (!ch) return;
    this._fire(chId, this.ctx.currentTime, semis, vel || 100, ch.def.tonal ? 0.5 : 0.2);
  };
  // lazily-built reserved preview bus: a dedicated gain -> master (NOT a channel insert), so
  // preview auditions are isolated at the graph level from the arrangement mix.
  Engine.prototype._prevBus = function () {
    this.init();
    if (!this._synthPrevBus) { var g = this.ctx.createGain(); g.gain.value = 0.9; g.connect(this.master); this._synthPrevBus = g; }
    return this._synthPrevBus;
  };
  // audition a single note through the RESERVED preview sub-pool (Synth Suite Phase 2). semis =
  // offset from the channel root, matching _fire. Short (0.2s) so rapid edits don't pile up. A
  // synth track routes its preview through the reserved pool/bus (cannot steal playback voices);
  // any other tonal track falls back to the normal short audition.
  Engine.prototype.previewNote = function (chId, semis, vel) {
    this.init(); this.resume(); var ch = this.channels[chId]; if (!ch) return;
    if (ch.def.kind === "synth" || ch.def.kind === "polySampler") {
      var pOpts = { preview: true };
      if (ch.def.kind === "polySampler") pOpts.buffer = this.userBuffers[ch.def.bufferId];   // audition the sample, not an oscillator
      this._synthVoice(this.ctx, this.ctx.currentTime, this._prevBus(), (ch.def.base || 0) + (semis || 0), vel || 100, 0.2, ch.def.synth, pOpts);
      return;
    }
    this.playLiveNote(chId, semis, vel || 100);
  };
  Engine.prototype.armPerf = function (on) { this._perfArmed = !!on; };
  Engine.prototype.isPerfArmed = function () { return !!this._perfArmed; };
  // note-on: always auditions; also records into a timeline clip when armed + timeline is rolling
  Engine.prototype.perfNoteOn = function (chId, semis, vel) {
    this.playLiveNote(chId, semis, vel);
    if (!(this._perfArmed && this.isPlaying && this.playMode === "timeline")) return;
    var ch = this.channels[chId]; if (!ch) return;
    var start = this.snapTick(this.playheadTick);                 // quantize-on-record (1/16)
    var clip = this._perfClips[chId];
    if (!clip) { clip = { id: this._newClipId(), kind: "midi", ch: chId, startTick: 0, lengthTicks: TICKS_PER_BAR, notes: [], _perf: true }; this._perfClips[chId] = clip; this.timeline.clips.push(clip); }
    var note = { pitchTick: start, pitch: (ch.def.base || 0) + semis, lenTicks: TICKS_PER_STEP, vel: vel || 100 };
    clip.notes.push(note); this._openNotes[chId + ":" + semis] = note;
  };
  Engine.prototype.perfNoteOff = function (chId, semis) {
    var k = chId + ":" + semis, n = this._openNotes[k]; if (!n) return;
    n.lenTicks = Math.max(SNAP_TICKS, this.snapTick(this.playheadTick) - n.pitchTick); delete this._openNotes[k];
  };
  // close open notes + size recorded clips to whole bars (called on stop)
  Engine.prototype._finalizePerf = function () {
    var self = this;
    for (var k in this._openNotes) { var n = this._openNotes[k]; n.lenTicks = Math.max(SNAP_TICKS, self.snapTick(self.playheadTick) - n.pitchTick); }
    for (var id in this._perfClips) { var c = this._perfClips[id]; var end = 0; c.notes.forEach(function (nt) { end = Math.max(end, nt.pitchTick + nt.lenTicks); }); c.lengthTicks = Math.max(TICKS_PER_BAR, Math.ceil(end / TICKS_PER_BAR) * TICKS_PER_BAR); delete c._perf; }
    this._perfClips = {}; this._openNotes = {};
  };
  // Web MIDI: route external controller note-ons to the focused channel
  Engine.prototype.enableMIDI = function (onReady) {
    var self = this;
    if (!navigator.requestMIDIAccess) { onReady && onReady(false, "Web MIDI unsupported"); return; }
    navigator.requestMIDIAccess().then(function (access) {
      function bind(input) { input.onmidimessage = function (ev) { self._onMIDI(ev.data); }; }
      access.inputs.forEach(bind);
      access.onstatechange = function (e) { if (e.port && e.port.type === "input" && e.port.state === "connected") bind(e.port); };
      self._midiOn = true; onReady && onReady(true, access.inputs.size);
    })["catch"](function (e) { onReady && onReady(false, (e && e.message) || "denied"); });
  };
  Engine.prototype._onMIDI = function (data) {
    var status = data[0] & 0xf0, pitch = data[1], vel = data[2], ch = this.channels[this.focus]; if (!ch) return;
    var semis = pitch - (ch.def.base || 60);
    if (status === 0x90 && vel > 0) this.perfNoteOn(this.focus, semis, vel);
    else if (status === 0x80 || (status === 0x90 && vel === 0)) this.perfNoteOff(this.focus, semis);
  };

  // restore one sampler lane's audio from IndexedDB -> decode -> map onto the live buffer key.
  // Fully error-isolated: a missing/corrupt entry logs a warning and leaves the lane silent;
  // it never throws into hydrate(), so the rest of the project always loads cleanly.
  // ---- instrument/melody classification (Feature Pass 5) --------------------
  // single source of truth — every UI surface (browser glyphs, lane headers, clip rendering,
  // clip-editor label) calls these rather than re-deriving from type/tonal ad hoc.
  // a channel is percussive (one-shot drum voice) or melodic (tonal/pitched/sample).
  Engine.prototype.classifyChannel = function (id) {
    var def = (this.channels[id] && this.channels[id].def) || this.channelDefs.filter(function (c) { return c.id === id; })[0] || (id && id.type ? id : null);
    if (!def) return "percussive";
    var PERC = { kick: 1, snare: 1, clap: 1, chat: 1, ohat: 1, anvil: 1, rim: 1, shaker: 1 };
    if (PERC[def.type]) return "percussive";
    if (def.kind === "synth" || def.type === "synth") return "melodic";     // native synth = melodic (Piano Roll target)
    if (def.kind === "polySampler") return "melodic";                       // Melody Maker = pitched sample, Piano Roll target
    if (def.type === "audio" || def.type === "sampler") return "melodic";   // recorded/loaded sounds read as melodic
    return def.tonal ? "melodic" : "percussive";
  };
  // a pattern bank is drums (steps only) / melody (piano-roll notes only) / hybrid (both) / empty.
  Engine.prototype.classifyPattern = function (bankIndex) {
    var bank = this.banks[bankIndex]; if (!bank) return "empty";
    var hasSteps = false;
    for (var cid in bank.steps) { var col = bank.steps[cid]; if (!col) continue; for (var i = 0; i < col.length; i++) { if (col[i].on) { hasSteps = true; break; } } if (hasSteps) break; }
    var hasNotes = !!(bank.notes && bank.notes.length);
    if (hasSteps && hasNotes) return "hybrid";
    if (hasNotes) return "melody";
    if (hasSteps) return "drums";
    return "empty";
  };
  // synthesize a waveform-like peak envelope from a timeline clip's NOTES (no offline render):
  // each note contributes a velocity-scaled attack/decay bump across start..start+len; overlaps
  // stack, then normalize. Fast + deterministic — recomputed only when the notes change, never
  // serialized, never run in the playback loop. Reads clearly as a waveform, not a step grid.
  Engine.prototype.clipNotePeaks = function (clip, cols) {
    cols = cols || 256; var notes = (clip && clip.notes) || [], total = clip && clip.lengthTicks;
    if (!notes.length || !total) return [];
    var arr = []; for (var z = 0; z < cols; z++) arr.push(0);
    notes.forEach(function (n) {
      var s = (n.pitchTick || 0) / total, e = ((n.pitchTick || 0) + (n.lenTicks || 0)) / total;
      var vel = (n.vel == null ? 100 : n.vel) / 127;
      var c0 = Math.max(0, Math.floor(s * cols)), c1 = Math.min(cols - 1, Math.ceil(e * cols));
      for (var c = c0; c <= c1; c++) {
        var t = (c - c0) / Math.max(1, c1 - c0);                 // 0..1 along the note
        var env = Math.exp(-t * 2.2) * (1 - Math.exp(-t * 14)); // pluck-like attack/decay
        var v = vel * (0.45 + 0.55 * env);
        if (v > arr[c]) arr[c] = v;                              // peak stacking
      }
    });
    var mx = 0; for (var k = 0; k < cols; k++) if (arr[k] > mx) mx = arr[k];
    if (mx > 0) for (var k2 = 0; k2 < cols; k2++) arr[k2] /= mx;
    return arr;
  };

  // Task 4: downsampled peak envelope (max-abs amplitude per column) from a decoded AudioBuffer.
  // Computed ONCE then cached on clip.peaks (NOT serialized — recomputed on load); the timeline
  // re-buckets this cached array to any width, so the raw buffer is never re-walked on render.
  Engine.prototype.computePeaks = function (buffer, cols) {
    if (!buffer || !buffer.length) return [];
    cols = cols || 600; var data = buffer.getChannelData(0);
    var win = Math.max(1, Math.floor(data.length / cols)), out = [];
    for (var i = 0; i < cols; i++) {
      var start = i * win, end = Math.min(data.length, start + win), m = 0;
      for (var j = start; j < end; j++) { var a = data[j] < 0 ? -data[j] : data[j]; if (a > m) m = a; }
      out.push(m);
    }
    return out;
  };
  // recompute waveform peaks for any audio clip bound to a freshly-decoded buffer (load/undo)
  Engine.prototype._refreshClipPeaks = function (bufferKey, buf) {
    if (!this.timeline || !this.timeline.clips) return;
    var self = this;
    this.timeline.clips.forEach(function (c) {
      if (c.kind === "audio" && c.bufferId === bufferKey && (!c.peaks || !c.peaks.length)) c.peaks = self.computePeaks(buf);
    });
  };
  Engine.prototype._rehydrateSample = function (idbKey, bufferKey) {
    var self = this; bufferKey = bufferKey || idbKey;
    if (this.userBuffers[bufferKey]) return;                  // already in memory (e.g. undo) — skip IDB refetch
    idbGet(idbKey).then(function (blob) {
      if (!blob) { console.warn("[SampleDB] no stored audio for '" + idbKey + "' (lane stays silent)"); return; }
      var fr = new FileReader();
      fr.onload = function () {
        try {
          self.ctx.decodeAudioData(fr.result,
            function (buf) { self.userBuffers[bufferKey] = buf; self._refreshClipPeaks(bufferKey, buf); },
            function (e) { console.warn("[SampleDB] decode failed for '" + idbKey + "':", e); });
        } catch (e) { console.warn("[SampleDB] decode threw for '" + idbKey + "':", e); }
      };
      fr.onerror = function () { console.warn("[SampleDB] read failed for '" + idbKey + "'"); };
      fr.readAsArrayBuffer(blob);
    })["catch"](function (e) { console.warn("[SampleDB] lookup failed for '" + idbKey + "':", e); });
  };

  // ---- scheduler -------------------------------------------------------------
  Engine.prototype._stepDur = function () { return (60 / this.tempo) / 4; };

  // ---- linear-timeline helpers (Phase 1) ------------------------------------
  Engine.prototype.secPerTick = function () { return (60 / this.tempo) / PPQ; };
  Engine.prototype.tickToSec = function (tick) { return tick * this.secPerTick(); };
  Engine.prototype.secToTick = function (sec) { return Math.round(sec / this.secPerTick()); };
  Engine.prototype.tickToBarBeat = function (tick) {
    var bar = Math.floor(tick / TICKS_PER_BAR), beat = Math.floor((tick % TICKS_PER_BAR) / PPQ), sub = Math.floor((tick % PPQ) / TICKS_PER_STEP);
    return { bar: bar, beat: beat, sub: sub };
  };
  Engine.prototype.snapTick = function (tick, free) { return free ? Math.round(tick) : Math.round(tick / SNAP_TICKS) * SNAP_TICKS; };
  Engine.prototype._newClipId = function () { return "clip_" + (++this._clipSeq); };

  // re-flatten the event list + re-seat the cursor mid-playback, so timeline edits (rack sync,
  // trims, moves) are heard live without having to stop and restart the transport.
  Engine.prototype._refreshTimelineEvents = function () {
    if (this.playMode !== "timeline" || !this.isPlaying) return;
    this._tlEvents = this.timelineEvents();
    this._tlCursor = this._cursorForTick(this.playheadTick);
  };
  // move the timeline playhead (scrub / click-to-position). keeps the scheduler cursor in sync
  // so playback continues correctly from the new position whether or not transport is running.
  Engine.prototype.seek = function (tick) {
    this.init(); tick = Math.max(0, Math.round(tick || 0));
    this.playheadTick = tick;
    if (this.playMode === "timeline") {
      if (!this._tlEvents) this._tlEvents = this.timelineEvents();
      this._tlCursor = this._cursorForTick(tick);
      if (this.isPlaying) {
        // Fix 3 (scrub restacking): atomically stop EVERY currently-sounding lane + synth voice with a
        // de-click ramp BEFORE re-seating, so no voice from the old position survives the jump (the old
        // code only moved the cursor and let ringing buffers keep sounding -> stacking on every scrub).
        this._killLaneVoices(); this._killSynthVoices();
        this.nextStepTime = this.ctx.currentTime + 0.03;   // re-anchor look-ahead
        // Phase 4: drop stale schedule points + re-seat the playhead anchor at the seek target so
        // the audio-clock-driven playhead snaps cleanly instead of drifting from the old position.
        this.notesInQueue = []; this._phPoint = { tick: tick, time: this.nextStepTime };
        // Fix 2: resume any clip already in progress at the new position from the correct buffer offset,
        // in sync. seek starts no repeating voices, so this kill+reschedule is idempotent per seek —
        // rapid successive scrubs cannot stack.
        this._scheduleSpanningClips(tick, this.nextStepTime);
      }
    }
    if (this.onPlayhead) this.onPlayhead(tick);
  };
  // Fix 2 (mid-position playback) — when playback starts or the playhead jumps to position P, fire any
  // AUDIO clip that SPANS P (started before P and still sounding) from the correct buffer offset, so it
  // sounds mid-clip and in sync. The per-tick scheduler only fires an event on its EXACT start tick, so a
  // clip whose start is behind P would otherwise be skipped entirely (dropped track). One-shot pass:
  // clips whose start is >= P are still handled by the normal scheduler (no double-trigger). Covers backing,
  // audio lanes, and mirrored Producer content played through the timeline; also the count-in one-bar
  // lead-in that lands mid-clip (it seeks there). Sustained MIDI/synth notes are out of scope (transient).
  Engine.prototype._scheduleSpanningClips = function (P, time) {
    if (this.playMode !== "timeline") return;
    var evs = this._tlEvents || (this._tlEvents = this.timelineEvents());
    var scoped = this._scopeActive;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.kind !== "audio") continue;
      var buf = this.userBuffers[ev.bufferId]; if (!buf) continue;
      var startT = ev.absTick;
      // sounding length: trimmed/split clips stop on their grid boundary; an untrimmed clip runs to the
      // buffer's natural end (mirrors _fireEvent's durSec logic).
      var lenT = ev.trimmed ? (ev.lenTicks || 0)
        : this.secToTick(buf.duration - this.tickToSec(ev.offsetTicks || 0));
      if (!(startT < P && P < startT + lenT)) continue;            // only clips already in progress at P
      if (!this._audible(ev.ch) || !this._inModeScope(ev.ch)) continue;
      if (this._capLaneId && ev.ch === this._capLaneId && this.isMicCapturing()) continue;   // Fix 4: don't resume the record target's old take
      if (scoped && this._scopeSoloId && ev.ch !== this._scopeSoloId) continue;              // honor a scoped audition solo
      var ch = this.channels[ev.ch]; if (!ch) continue;
      var send = this._overrideSend(ch, ev.routeOverride);
      var into = this.tickToSec(P - startT);                       // seconds already elapsed into the clip
      var offSec = this.tickToSec(ev.offsetTicks || 0) + into;     // static trim + the mid-clip offset
      var dur = ev.trimmed ? Math.max(0.02, this.tickToSec(ev.lenTicks) - into) : 0;   // 0 = play to natural end
      // fadeIn:0 — the clip's attack already elapsed before P; _playBuffer still applies a 3ms de-click.
      this._playBuffer(this.ctx, buf, time, send || ch.gain, 0, 100, dur, offSec,
        { gain: ev.gain, fadeIn: 0, fadeOut: this.tickToSec(ev.fadeOutTicks || 0) });
    }
  };
  // one-shot preview of an already-decoded buffer (mirrors previewSample for real user files)
  Engine.prototype.previewBuffer = function (buffer) {
    this.init(); this.resume();
    try { if (this._prev) this._prev.disconnect(); } catch (e) {}
    var g = this.ctx.createGain(); g.gain.value = 0.95; g.connect(this.master); this._prev = g;
    this._playBuffer(this.ctx, buffer, this.ctx.currentTime, g, 0, 114);
  };

  // ---- Channel Rack <-> Timeline unification --------------------------------
  // Mirror a channel's step row (+ piano-roll notes) for a given pattern bank into a single
  // "rack" clip on the linear timeline. Idempotent: keyed by (_rack, ch, pattern) so repeated
  // calls update one clip in place. Pattern N lands on bar N, so the four banks read left-to-right.
  Engine.prototype.syncRackClip = function (chId, bankIndex) {
    if (bankIndex == null) bankIndex = this.activePattern;
    var bank = this.banks[bankIndex]; if (!bank) return;
    var chDef = null; this.channelDefs.forEach(function (d) { if (d.id === chId) chDef = d; });
    if (!chDef || chDef.audioLane) return;                       // audio lanes hold recorded takes, not steps
    var base = chDef.base || 0, tonal = chDef.tonal, notes = [];
    var row = bank.steps[chId] || [];
    for (var i = 0; i < row.length; i++) {
      var st = row[i];
      if (st && st.on) notes.push({ pitchTick: i * TICKS_PER_STEP, pitch: base + (tonal ? (st.pitch || 0) : 0), lenTicks: Math.max(1, (st.len || 1)) * TICKS_PER_STEP, vel: st.vel });
    }
    (bank.notes || []).forEach(function (nt) { if (nt.ch === chId) notes.push({ pitchTick: Math.round(nt.start * TICKS_PER_STEP), pitch: nt.pitch, lenTicks: Math.max(1, Math.round(nt.len * TICKS_PER_STEP)), vel: nt.vel }); });
    var idx = -1, clips = this.timeline.clips;
    for (var j = 0; j < clips.length; j++) { if (clips[j]._rack && clips[j].ch === chId && clips[j].pattern === bankIndex) { idx = j; break; } }
    if (!notes.length) { if (idx >= 0) clips.splice(idx, 1); this._refreshTimelineEvents(); return; }
    var end = 0; notes.forEach(function (n) { var e = n.pitchTick + n.lenTicks; if (e > end) end = e; });
    var lenTicks = Math.max(TICKS_PER_BAR, Math.ceil(end / TICKS_PER_BAR) * TICKS_PER_BAR);
    // all pattern banks stack at bar 0 so the rack sequences layer simultaneously on the timeline
    if (idx >= 0) { clips[idx].notes = notes; clips[idx].lengthTicks = lenTicks; clips[idx].startTick = 0; }
    else clips.push({ id: "rack_" + chId + "_" + bankIndex, kind: "midi", ch: chId, startTick: 0, lengthTicks: lenTicks, notes: notes, _rack: true, pattern: bankIndex });
    if (this.timeline.lengthTicks < lenTicks) this.timeline.lengthTicks = lenTicks;
    this._refreshTimelineEvents();
  };
  // rebuild every rack clip across all banks/channels (used on entering the Timeline)
  Engine.prototype.syncAllRackClips = function () {
    var self = this;
    for (var b = 0; b < this.banks.length; b++) this.channelDefs.forEach(function (d) { self.syncRackClip(d.id, b); });
  };

  // flatten timeline.clips -> sorted absolute-tick event list for the scheduler/marquee.
  // each event: { absTick, ch, kind:'note'|'audio', pitch, lenTicks, vel, bufferId, offsetTicks, clipId }
  Engine.prototype.timelineEvents = function () {
    var evs = [];
    this.timeline.clips.forEach(function (clip) {
      var ro = clip.routeOverride || null;   // Task 4: per-clip FX route override (independent insert)
      if (clip.kind === "audio") {
        evs.push({ absTick: clip.startTick, ch: clip.ch, kind: "audio", bufferId: clip.bufferId, offsetTicks: clip.offsetTicks || 0, lenTicks: clip.lengthTicks, clipId: clip.id, routeOverride: ro,
          gain: clip.gain != null ? clip.gain : 1, fadeInTicks: clip.fadeInTicks || 0, fadeOutTicks: clip.fadeOutTicks || 0, trimmed: !!clip.trimmed });
      } else {
        (clip.notes || []).forEach(function (n) {
          evs.push({ absTick: clip.startTick + n.pitchTick, ch: clip.ch, kind: "note", pitch: n.pitch, lenTicks: n.lenTicks, vel: n.vel, clipId: clip.id, routeOverride: ro });
        });
      }
    });
    evs.sort(function (a, b) { return a.absTick - b.absTick; });
    return evs;
  };

  // Pass 3 T2: song length is DERIVED from clips, not stored. = max(32 bars, furthest clip end
  // rounded up to an 8-bar chunk). Grows when a clip extends past the current end, shrinks back
  // toward 32 when clips move/trim inward, never below 32. Idempotent — safe to call each render.
  Engine.prototype.recomputeTimelineLength = function () {
    var TPB = TICKS_PER_BAR, min = 32 * TPB, chunk = 8 * TPB, end = 0;
    this.timeline.clips.forEach(function (c) { var e = (c.startTick || 0) + (c.lengthTicks || 0); if (e > end) end = e; });
    this.timeline.lengthTicks = end > min ? Math.ceil(end / chunk) * chunk : min;
    return this.timeline.lengthTicks;
  };
  Engine.prototype.songLengthBars = function () { return Math.round(this.recomputeTimelineLength() / TICKS_PER_BAR); };

  // NON-DESTRUCTIVE migration: build timeline.clips from the legacy banks + blocks arrangement.
  // (leaves banks/blocks untouched; used to port saved sessions and as the Phase-1 data-model proof)
  Engine.prototype.migrateBanksToTimeline = function () {
    var self = this, clips = [];
    function clipFromPattern(bankIndex, ch, startTick) {
      var bank = self.banks[bankIndex]; if (!bank) return null;
      var notes = [];
      var row = bank.steps[ch.id] || [];
      for (var i = 0; i < row.length; i++) { var st = row[i]; if (st && st.on) notes.push({ pitchTick: i * TICKS_PER_STEP, pitch: (ch.base || 0) + (st.pitch || 0), lenTicks: Math.max(1, (st.len || 1)) * TICKS_PER_STEP, vel: st.vel }); }
      (bank.notes || []).forEach(function (nt) { if (nt.ch === ch.id) notes.push({ pitchTick: Math.round(nt.start * TICKS_PER_STEP), pitch: nt.pitch, lenTicks: Math.max(1, Math.round(nt.len * TICKS_PER_STEP)), vel: nt.vel }); });
      if (!notes.length) return null;
      return { id: self._newClipId(), kind: "midi", ch: ch.id, startTick: startTick, lengthTicks: TICKS_PER_BAR, notes: notes };
    }
    // one MIDI clip per (arrangement block × channel that has content in that pattern)
    (this.blocks || []).forEach(function (blk) {
      self.channelDefs.forEach(function (ch) { var c = clipFromPattern(blk.pattern, ch, blk.bar * TICKS_PER_BAR); if (c) clips.push(c); });
    });
    // legacy audio clips (playlist) -> timeline audio clips
    (this.audioClips || []).forEach(function (ac) {
      clips.push({ id: self._newClipId(), kind: "audio", ch: ac.lane, startTick: ac.startBar * TICKS_PER_BAR, lengthTicks: ac.lengthBars * TICKS_PER_BAR, bufferId: ac.bufferId || null, offsetTicks: 0, name: ac.name });
    });
    this.timeline.clips = clips;
    this.timeline.lengthTicks = Math.max(this.songBars, 1) * TICKS_PER_BAR;
    return clips;
  };
  Engine.prototype._scheduleStepData = function (bankIndex, stepInBar, time) {
    var self = this, bank = this.banks[bankIndex]; if (!bank) return; var sd = this._stepDur();
    self.channelDefs.forEach(function (c) {
      var col = bank.steps[c.id]; if (!col) return; var st = col[stepInBar]; if (!st || !st.on) return; if (!self._audible(c.id)) return;
      var swingOff = (stepInBar % 2 === 1) ? self.swing * sd * 0.5 : 0;
      var dur = c.tonal ? Math.max(st.len * sd * 0.95, 0.12) : sd;
      self._fire(c.id, time + swingOff, st.pitch, st.vel, dur, null, { vol: st.vol || 0, pan: st.pan || 0 });
    });
    // piano-roll notes
    bank.notes.forEach(function (nt) {
      if (Math.floor(nt.start) !== stepInBar) return; if (!self._audible(nt.ch)) return;
      var ch = self.channels[nt.ch]; if (!ch || !ch.def.tonal) return;
      var swingOff = (stepInBar % 2 === 1) ? self.swing * sd * 0.5 : 0;
      var semis = nt.pitch - ch.def.base;
      self._fire(nt.ch, time + swingOff, semis, nt.vel, Math.max(nt.len * sd * 0.95, 0.12));
    });
  };

  Engine.prototype._scheduler = function () {
    if (this.playMode === "timeline") { this._scheduleTimeline(); return; }
    var sd = this._stepDur();
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAhead) {
      var time = this.nextStepTime, uiStep, uiBar = -1;
      if (this.playMode === "pattern") {
        // loop over the active pattern's full length (16 steps * lengthBars), not a fixed bar
        var patSteps = STEPS * patLen(this.banks[this.activePattern]);
        this._scheduleStepData(this.activePattern, this.stepIndex, time);
        uiStep = this.stepIndex; this.notesInQueue.push({ time: time, step: uiStep, bar: -1 });
        this.stepIndex = (this.stepIndex + 1) % patSteps;
      } else {
        var loopLen = Math.max(1, this.loop.end - this.loop.start), total = loopLen * STEPS;
        var local = this.songStep % total, bar = this.loop.start + Math.floor(local / STEPS), sib = local % STEPS;
        for (var i = 0; i < this.blocks.length; i++) { if (this.blocks[i].bar === bar) this._scheduleStepData(this.blocks[i].pattern, sib, time); }
        uiStep = sib; uiBar = bar; this.notesInQueue.push({ time: time, step: uiStep, bar: uiBar });
        this.songStep = (this.songStep + 1) % total;
      }
      this.nextStepTime += sd;
    }
  };
  // ---- linear-timeline scheduler (Phase 1, Step 2) --------------------------
  // continuous-tick look-ahead over the flattened, sorted event list. fires through the
  // same _fire / _playBuffer voice layer as the pattern scheduler — only the timing source differs.
  Engine.prototype._cursorForTick = function (tick) {
    var evs = this._tlEvents || []; for (var i = 0; i < evs.length; i++) if (evs[i].absTick >= tick) return i; return evs.length;
  };
  // build a one-shot send node for a clip's routeOverride (Task 4): voice -> sendGain(channel vol)
  // -> inserts[routeOverride].input. Gives that block its own independent FX rack while keeping
  // the channel's gain/level. Returns null when no valid override (caller falls back to ch.gain).
  Engine.prototype._overrideSend = function (ch, routeOverride) {
    if (!routeOverride) return null;
    var ins = this.inserts[routeOverride]; if (!ins) return null;
    var g = this.ctx.createGain(); g.gain.value = ch.vol != null ? ch.vol : 1;
    // ROUTING: all voices via channel insert (override target)
    g.connect(ins.input);
    return g;
  };
  // Mode-scoped audibility (Layout/Scoped delta): ONE shared clock; the scheduler only SOUNDS the
  // active tab's channel set. Producer → everything except backing (steps/synth/polySampler/samplers/
  // melody audio lanes). Rec Audio → backing/Project + audio lanes only. uiMuted tracks excluded.
  // ---- workspace isolation (Studio Isolation build) -------------------------
  // Every track def carries an explicit `workspace` tag ('producer' | 'studio') set at creation.
  // This is the SINGLE source of truth for which mode owns a track — voice-`type` cannot tell a
  // Producer melody-import audio lane (addMelodyFile) from a Studio rec lane (addAudioTrack): both
  // are type:'audio'/kind:'audioLane'. Producer and Studio read cleanly-separated collections via
  // producerDefs()/studioDefs() (one physical id-keyed array underneath; banks/clips/routes/inserts
  // stay untouched). _workspaceOf() has a legacy fallback for any def predating the tag.
  Engine.prototype._workspaceOf = function (d) {
    if (!d) return "producer";
    if (d.workspace === "producer" || d.workspace === "studio") return d.workspace;
    if (d.trackType === "backing" || d.backing || d.locked) return "studio";   // backing always Studio
    return "producer";
  };
  Engine.prototype.producerDefs = function () { var self = this; return this.channelDefs.filter(function (d) { return self._workspaceOf(d) === "producer"; }); };
  Engine.prototype.studioDefs = function () { var self = this; return this.channelDefs.filter(function (d) { return self._workspaceOf(d) === "studio"; }); };

  // Set `engine._recMode` from the App (false = Producer, true = Rec Audio). Never forks the transport.
  // Mode scope now reads the workspace tag directly (cleanly-separated sources), not a type heuristic.
  Engine.prototype._inModeScope = function (id) {
    var ch = this.channels[id]; if (!ch) return true; var d = ch.def; if (!d) return true;
    if (d.uiMuted) return false;                                   // muted tracks stay excluded
    return this._workspaceOf(d) === (this._recMode ? "studio" : "producer");
  };
  Engine.prototype._fireEvent = function (ev, time) {
    if (!this._audible(ev.ch)) return;
    if (!this._inModeScope(ev.ch)) return;                        // mode-scoped: only the active tab's content sounds
    // Fix 4 (punch-in auto-mute): while a mic capture is ACTIVELY recording onto a target lane, that
    // lane's PRE-EXISTING clips are excluded from playback scheduling so the old take isn't heard under
    // the new one (backing + other lanes play normally). Playback-side only — clip data, the user's mute
    // flags, and the [M] button are all untouched; normal scheduling resumes when _capLaneId clears on stop.
    if (this._capLaneId && ev.ch === this._capLaneId && this.isMicCapturing()) return;
    var ch = this.channels[ev.ch]; if (!ch) return;
    var send = this._overrideSend(ch, ev.routeOverride);   // null unless the clip overrides its route
    if (ev.kind === "audio") {
      // Fix 3: an Audio-Lane clip is clamped to its tick-window ONLY when the user explicitly
      // trimmed/split it — then a chop stops exactly on its grid boundary (tempo-locked, no drift).
      // An untrimmed clip (e.g. a full melody import) passes durSec=0 so playback runs to the
      // buffer's true duration — no measure/loop truncation. Per-clip gain + fades ride along.
      // ROUTING: all voices via channel insert
      var dur = ev.trimmed ? this.tickToSec(ev.lenTicks) : 0;
      this._playBuffer(this.ctx, this.userBuffers[ev.bufferId], time, send || ch.gain, 0, 100,
        dur, this.tickToSec(ev.offsetTicks || 0),
        { gain: ev.gain, fadeIn: this.tickToSec(ev.fadeInTicks || 0), fadeOut: this.tickToSec(ev.fadeOutTicks || 0) });
      return;
    }
    var semis = ev.pitch - (ch.def.base || 0);
    this._fire(ev.ch, time, semis, ev.vel, Math.max(ev.lenTicks * this.secPerTick() * 0.95, 0.08), send);
  };
  Engine.prototype._scheduleTimeline = function () {
    var spt = this.secPerTick(), evs = this._tlEvents || [];
    // Scoped audition (this batch) reuses this exact loop, only the boundaries differ: the window
    // is [startB, endB) and looping/solo come from the scope, not timeline.loop.
    var scoped = this._scopeActive;
    var loopOn = scoped ? this._scopeLoop : this.timeline.loop.on;
    var startB = scoped ? this._scopeStart : (this.timeline.loop.on ? this.timeline.loop.startTick : 0);
    var endB = scoped ? this._scopeEnd : (this.timeline.loop.on ? this.timeline.loop.endTick : this.timeline.lengthTicks);
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAhead) {
      var tick = this.playheadTick, time = this.nextStepTime, cur = this._tlCursor;
      // Fix 3: STRICT half-open interval — fire only when startB <= tick < endB. Never fire AT endB,
      // so the boundary note can't double-trigger on the wrap (and the loop seam stays sample-clean).
      // The lower bound is enforced only in scoped mode; global playback keeps its original behavior.
      if (tick < endB && (!scoped || tick >= startB)) {
        while (cur < evs.length && evs[cur].absTick === tick) {
          var ev = evs[cur];
          // track-solo audition: in scoped mode with a soloId, only that channel sounds
          if (!(scoped && this._scopeSoloId && ev.ch !== this._scopeSoloId)) this._fireEvent(ev, time);
          cur++;
        }
        this._tlCursor = cur;
        if (tick % TICKS_PER_STEP === 0) { this.notesInQueue.push({ time: time, step: tick, bar: -1, tl: true }); this._applyAutomation(tick, time); } // playhead UI + automation (1/16 granularity)
      }
      this.playheadTick++; this.nextStepTime += spt;
      if (this.playheadTick >= endB) {
        if (loopOn) { this.playheadTick = startB; this._tlCursor = this._cursorForTick(startB); }
        else if (scoped) { this.pauseScope(); this.playheadTick = startB; if (this.onPlayhead) this.onPlayhead(startB); break; }
        else { this.pause(); break; }
      }
    }
  };

  // ---- timeline automation (Phase 4B): volume / pan / FX-cutoff curves ----
  // linear-interpolate a sorted point list {tick,value(0..1)} at an absolute tick
  Engine.prototype._sampleCurve = function (pts, tick) {
    if (!pts || !pts.length) return null;
    if (tick <= pts[0].tick) return pts[0].value;
    var last = pts[pts.length - 1]; if (tick >= last.tick) return last.value;
    for (var i = 1; i < pts.length; i++) { if (tick <= pts[i].tick) { var a = pts[i - 1], b = pts[i], f = (tick - a.tick) / Math.max(1, b.tick - a.tick); return a.value + (b.value - a.value) * f; } }
    return last.value;
  };
  // ramp the live AudioParams toward each lane's automation value at this step
  Engine.prototype._applyAutomation = function (tick, time) {
    var auto = this.timeline.automation; if (!auto) return;
    for (var laneId in auto) {
      var ch = this.channels[laneId]; if (!ch) continue; var ps = auto[laneId];
      for (var param in ps) {
        var v = this._sampleCurve(ps[param], tick); if (v == null) continue;
        try {
          if (param === "volume") ch.gain.gain.linearRampToValueAtTime(v * 1.1, time + 0.02);
          else if (param === "pan") { if (ch.panner) ch.panner.pan.linearRampToValueAtTime(v * 2 - 1, time + 0.02); }
          else if (param === "cutoff") { var ins = this.inserts[ch.route]; if (ins && ins.filt) ins.filt.frequency.linearRampToValueAtTime(80 * Math.pow(200, v), time + 0.02); }
        } catch (e) {}
      }
    }
  };
  // restore static param values when transport stops (so automation doesn't "stick")
  Engine.prototype._resetParams = function () {
    var self = this;
    this.channelDefs.forEach(function (d) { var ch = self.channels[d.id]; if (!ch) return; try { ch.gain.gain.cancelScheduledValues(0); ch.gain.gain.value = ch.vol; if (ch.panner) { ch.panner.pan.cancelScheduledValues(0); ch.panner.pan.value = ch.pan; } } catch (e) {} });
    this._applyFxAll();
  };

  Engine.prototype.start = function (mode) {
    this.init(); this.resume(); if (mode) this.playMode = mode; if (this.isPlaying) return;
    this.isPlaying = true; this.notesInQueue = [];
    if (this.playMode === "pattern") this.stepIndex = 0;
    // PLAYBACK PARITY: mirror every channel's current rack pattern onto the timeline before
    // building the event list. Bulk-population paths (loadDemoChannels/buildDemo, hydrate of
    // pre-mirror saves) fill `banks` directly without per-edit syncRackClip, so without this an
    // instrument's pattern exists but has no timeline clip -> it stays silent in timeline mode.
    // Idempotent (updates _rack clips in place, drops empty ones), and leaves arranged/audio clips
    // untouched — so pressing play always plays ALL instruments that have content.
    else if (this.playMode === "timeline") { this.syncAllRackClips(); this.recomputeTimelineLength(); this._tlEvents = this.timelineEvents(); this.playheadTick = this.timeline.loop.on ? this.timeline.loop.startTick : 0; this._tlCursor = this._cursorForTick(this.playheadTick); }
    else this.songStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06; var self = this;
    // Phase 4: seed the playhead anchor (tick + the ctx time it will sound) so _draw can project
    // the live position straight off the audio clock from frame one.
    this._phPoint = { tick: this.playheadTick, time: this.nextStepTime };
    // Fix 2: if the transport starts at a non-zero position (e.g. loop start), resume clips already in
    // progress there from the correct buffer offset — same catch-up pass the scrub/seek path uses.
    if (this.playMode === "timeline" && this.playheadTick > 0) this._scheduleSpanningClips(this.playheadTick, this.nextStepTime);
    this.timer = setInterval(function () { self._scheduler(); }, this.lookahead); this._draw();
  };
  Engine.prototype.pause = function () { this.isPlaying = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } this._killLaneVoices(); this._killSynthVoices(); };   // Phase 8: silence ringing lane + synth voices with a de-click ramp
  Engine.prototype.stop = function () { this._finalizePerf(); this._resetParams(); this.pause(); this.stepIndex = 0; this.songStep = 0; this.playheadTick = 0; this._lastStep = -1; this._phPoint = null; if (this.onStep) this.onStep(-1, -1); if (this.onPlayhead) this.onPlayhead(-1); };
  Engine.prototype.setMode = function (mode) { if (this.playMode === mode) return; this.playMode = mode; if (this.isPlaying) { this.pause(); this.start(mode); } };

  // ---- Audition: scoped-range transport lifecycle (this batch) ---------------
  // enterScope snapshots the global transport, pauses it, and arms a half-open [start,end) window.
  // The same _scheduler/_scheduleTimeline + _fire/_synthVoice voice layer drives it — no 2nd engine.
  Engine.prototype.enterScope = function (opts) {
    this.init(); this.resume(); opts = opts || {};
    // snapshot the producer's place BEFORE pausing so exitScope can restore it exactly
    this._scopeSnap = { playheadTick: this.playheadTick, isPlaying: this.isPlaying, playMode: this.playMode };
    this.pause();                                  // de-clicks global voices; scope + global never sound together
    this.playMode = "timeline";
    var s = Math.max(0, Math.round(opts.startTick || 0));
    var e = Math.round(opts.endTick != null ? opts.endTick : s + TICKS_PER_BAR);
    if (e <= s) e = s + TICKS_PER_BAR;
    this._scopeStart = s; this._scopeEnd = e;
    this._scopeLoop = opts.loop !== false;         // audition loops by default
    this._scopeSoloId = opts.soloId || null;
    this._scopeOwner = opts.owner || null;
    this._scopeActive = true;
    this.syncAllRackClips();                        // hear rack/pattern content in the window too
    this._tlEvents = this.timelineEvents();
    this.playheadTick = s; this._tlCursor = this._cursorForTick(s);
    if (this.onPlayhead) this.onPlayhead(s);
  };
  // play/pause the scoped window (drives the same setInterval scheduler as the global transport)
  Engine.prototype.playScope = function () {
    if (!this._scopeActive) return; this.init(); this.resume(); if (this.isPlaying) return;
    this.isPlaying = true; this.notesInQueue = [];
    this.playheadTick = this._scopeStart; this._tlEvents = this.timelineEvents();
    this._tlCursor = this._cursorForTick(this._scopeStart);
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this._phPoint = { tick: this.playheadTick, time: this.nextStepTime };
    var self = this; this.timer = setInterval(function () { self._scheduler(); }, this.lookahead); this._draw();
  };
  Engine.prototype.pauseScope = function () {
    this.isPlaying = false; if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.stopScopeVoices();
  };
  // live window/loop/solo updates while scoped — read by _scheduleTimeline within ~one lookahead tick.
  Engine.prototype.setScopeRange = function (startTick, endTick) {
    this._scopeStart = Math.max(0, Math.round(startTick || 0));
    this._scopeEnd = Math.max(this._scopeStart + 1, Math.round(endTick || (this._scopeStart + TICKS_PER_BAR)));
    if (this._scopeActive) {
      this.playheadTick = this._scopeStart; this._tlCursor = this._cursorForTick(this._scopeStart);
      if (this.isPlaying) { this.nextStepTime = this.ctx.currentTime + 0.03; this.notesInQueue = []; this._phPoint = { tick: this._scopeStart, time: this.nextStepTime }; }
    }
  };
  Engine.prototype.setScopeLoop = function (on) { this._scopeLoop = !!on; };
  Engine.prototype.setScopeSolo = function (chId) { this._scopeSoloId = chId || null; };
  // synchronous de-click + stop of every scoped voice — reuses the existing 8ms ramps. Called by
  // exitScope AND by the Phase-5 tab handoff (window.engine.scope.stopScopeVoices()) so a Piano-Roll
  // loop can never survive under a Waveform scrub (zombie buffer).
  Engine.prototype.stopScopeVoices = function () { this._killLaneVoices(); this._killSynthVoices(); };
  // leave scoped mode and restore the global transport EXACTLY (playhead + play state).
  Engine.prototype.exitScope = function () {
    if (!this._scopeActive && !this._scopeSnap) return;
    this.pauseScope();
    this._scopeActive = false; this._scopeOwner = null; this._scopeSoloId = null;
    var snap = this._scopeSnap; this._scopeSnap = null;
    if (!snap) return;
    this.playMode = snap.playMode; this.playheadTick = snap.playheadTick;
    if (this.playMode === "timeline") { this._tlEvents = this.timelineEvents(); this._tlCursor = this._cursorForTick(this.playheadTick); }
    if (snap.isPlaying) {
      // resume global playback at the restored tick (start() would reset the playhead to 0/loop-start)
      this.init(); this.resume(); this.isPlaying = true; this.notesInQueue = [];
      this.syncAllRackClips(); this.recomputeTimelineLength();
      this._tlEvents = this.timelineEvents(); this._tlCursor = this._cursorForTick(this.playheadTick);
      this.nextStepTime = this.ctx.currentTime + 0.06;
      this._phPoint = { tick: this.playheadTick, time: this.nextStepTime };
      var self = this; this.timer = setInterval(function () { self._scheduler(); }, this.lookahead); this._draw();
    } else if (this.onPlayhead) this.onPlayhead(this.playheadTick);
  };
  Engine.prototype._draw = function () {
    var self = this; if (!this.isPlaying) return; var now = this.ctx.currentTime, cur = null;
    while (this.notesInQueue.length && this.notesInQueue[0].time <= now) { cur = this.notesInQueue.shift(); }
    if (this.playMode === "timeline") {
      // Phase 4: drive the playhead directly off the transport's audio-clock sample offset — the
      // single source of truth — instead of the 1/16 step grid. Each sounded step point (cur) is an
      // EXACT (tick, ctx-time) pair; between points we project linearly from the audio clock
      // (tick = point.tick + (now - point.time)/secPerTick), giving smooth, sample-accurate 1:1
      // motion. Capped at one step ahead so a loop-wrap / look-ahead can't overshoot the point.
      if (cur && cur.tl) this._phPoint = { tick: cur.step, time: cur.time };
      var pp = this._phPoint;
      if (pp && this.onPlayhead) {
        var spt = this.secPerTick();
        var live = pp.tick + (now - pp.time) / spt;
        if (live < pp.tick) live = pp.tick;                              // before this point sounds
        if (live > pp.tick + TICKS_PER_STEP) live = pp.tick + TICKS_PER_STEP;
        this.onPlayhead(live);
      }
    } else if (cur && (cur.step !== this._lastStep || cur.bar >= 0)) { this._lastStep = cur.step; if (this.onStep) this.onStep(cur.step, cur.bar); }
    requestAnimationFrame(function () { self._draw(); });
  };

  // ---- metering --------------------------------------------------------------
  Engine.prototype._rms = function (an, data) { an.getByteTimeDomainData(data); var s = 0; for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; s += v * v; } return Math.min(1, Math.sqrt(s / data.length) * 2.6); };
  Engine.prototype._meterLoop = function () {
    var self = this, mdata = new Uint8Array(this.masterAnalyser.fftSize);
    function loop(ts) {
      var interval = self.meterFps >= 60 ? 0 : 1000 / self.meterFps;
      if (ts - self._meterLast >= interval) {
        self._meterLast = ts;
        var levels = {}; for (var k in self.inserts) { var ins = self.inserts[k]; levels[k] = self._rms(ins.analyser, ins.meterData); }
        var ml = self._rms(self.masterAnalyser, mdata);
        if (self.onMeter) self.onMeter({ inserts: levels, master: ml });
        self._detectPitches();
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  };
  Engine.prototype.setMeterFps = function (f) { this.meterFps = f; };

  // ---- edits -----------------------------------------------------------------
  Engine.prototype.setTempo = function (b) { this.tempo = clamp(b, 40, 240); };
  Engine.prototype.setSwing = function (v) { this.swing = clamp(v, 0, 1); };
  Engine.prototype.setMaster = function (v) { this.init(); this.master.gain.value = v; };
  Engine.prototype.setActivePattern = function (i) { this.init(); this.activePattern = i; };
  Engine.prototype.setFocus = function (id) { this.focus = id; };
  Engine.prototype.step = function (chId, i) { return this.pat().steps[chId][i]; };
  Engine.prototype.toggleStep = function (chId, i) { this.init(); var s = this.pat().steps[chId][i]; s.on = !s.on; this.syncRackClip(chId); return s.on; };
  Engine.prototype.setStepParam = function (chId, i, key, val) { this.init(); var s = this.pat().steps[chId][i]; s[key] = val; this.syncRackClip(chId); };
  Engine.prototype.clearPattern = function () { this.init(); var self = this, p = this.activePattern, bars = patLen(this.banks[p]), bk = blankPattern(); bk.lengthBars = bars; this.channelDefs.forEach(function (c) { bk.steps[c.id] = freshStepRow(bars); }); this.banks[p] = bk; this.channelDefs.forEach(function (c) { self.syncRackClip(c.id, p); }); };
  // Task 2: set a pattern's length in bars (1..32). Grows/shrinks every channel's step row,
  // appending fresh blank steps when growing (never silently truncating recorded steps —
  // shrinking keeps the trailing data so re-growing restores it). Re-mirrors rack clips.
  Engine.prototype.setPatternLength = function (bars, bankIndex) {
    this.init(); var self = this;
    if (bankIndex == null) bankIndex = this.activePattern;
    var bank = this.banks[bankIndex]; if (!bank) return;
    bars = Math.max(1, Math.min(32, Math.round(bars || 1)));
    bank.lengthBars = bars; var want = STEPS * bars;
    this.channelDefs.forEach(function (c) {
      var row = bank.steps[c.id]; if (!row) { row = bank.steps[c.id] = freshStepRow(bars); return; }
      while (row.length < want) row.push(blankStep());      // grow: append blanks (data-preserving)
      // shrink only the live-played range; keep tail steps in the array so re-growing restores them
    });
    this.channelDefs.forEach(function (c) { self.syncRackClip(c.id, bankIndex); });
    if (this.activePattern === bankIndex && this.stepIndex >= want) this.stepIndex = 0;
  };
  Engine.prototype.getPatternLength = function (bankIndex) { return patLen(this.banks[bankIndex == null ? this.activePattern : bankIndex]); };
  Engine.prototype.setChannelVol = function (id, v) { this.init(); this.channels[id].vol = v; this.channels[id].gain.gain.value = v; };
  Engine.prototype.setChannelPan = function (id, v) { this.init(); this.channels[id].pan = v; if (this.channels[id].panner) this.channels[id].panner.pan.value = v; };
  Engine.prototype.muteCh = function (id) { this.init(); this.channels[id].muted = !this.channels[id].muted; return this.channels[id].muted; };
  Engine.prototype.soloCh = function (id) { this.init(); this.channels[id].solo = !this.channels[id].solo; return this.channels[id].solo; };
  Engine.prototype.setRoute = function (id, route) { this.init(); var ch = this.channels[id]; ch.route = route; ch.def.route = route; var tgt = this._insertInput(route, id); if (ch.panner) { ch.panner.disconnect(); ch.panner.connect(tgt); } else { ch.gain.disconnect(); ch.gain.connect(tgt); } };

  // ---- dynamic instrument lanes ---------------------------------------------
  // build the audio nodes for one channel def: gain -> panner -> insert.input
  // build the live audio nodes for one channel def and wire to its insert
  // ROUTING: resolve a channel's insert strictly BY ID (this.inserts is keyed by insert id, never
  // positional) — robust to non-contiguous route ids left by channel deletes. Defensive: if a
  // route has no matching insert (e.g. an out-of-range route from a corrupt/old saved project),
  // warn and fall back to a master passthrough so the channel stays audible instead of throwing
  // (which would break boot/hydrate) or going silent.
  Engine.prototype._insertInput = function (route, chId) {
    var ins = this.inserts[route];
    if (ins) return ins.input;
    console.warn("[routing] channel '" + chId + "' route " + route + " has no matching insert — falling back to master passthrough");
    return this.master;
  };
  Engine.prototype._wireChannel = function (c) {
    var ctx = this.ctx;
    var g = ctx.createGain(); g.gain.value = c.vol;
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    var target = this._insertInput(c.route, c.id);
    if (p) { p.pan.value = c.pan; g.connect(p); p.connect(target); } else g.connect(target);
    this.channels[c.id] = { def: c, gain: g, panner: p, vol: c.vol, pan: c.pan, muted: false, solo: false, route: c.route };
  };

  // ---- Studio Mode (Build 1): additive per-channel DSP ----------------------
  // NONE of this touches the scheduler / voice / scope core. It only ADDS signal-
  // routing nodes, spliced with the same disconnect->reconnect idiom setRoute uses.
  //
  // Synthesize a decaying-noise stereo impulse response for the ConvolverNode reverb.
  // `seconds` ~ perceived room size; `decay` shapes the tail (higher = shorter).
  Engine.prototype._makeImpulse = function (seconds, decay) {
    this.init(); var ctx = this.ctx, rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * (seconds || 2)));
    var ir = ctx.createBuffer(2, len, rate), dk = (decay == null ? 2.5 : decay);
    for (var c = 0; c < 2; c++) {
      var ch = ir.getChannelData(c);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, dk);
    }
    return ir;
  };
  // Idempotent per-channel Studio DSP handle. Builds ONLY the nodes the insert lacks
  // (3-band EQ: lowshelf/peaking/highshelf, + a ConvolverNode reverb with dry/wet sends)
  // and SPLICES them between the channel's output tail and its insert input using the
  // exact disconnect->reconnect pattern from setRoute (proven-safe, no graph corruption).
  // Input Gain -> channels[id].gain, Cutoff -> inserts[route].filt, Comp -> inserts[route].comp,
  // Delay -> inserts[route].delay/fb/wet are wired to the EXISTING nodes (no new graph), so the
  // DJ strip's real controls all act on live Web Audio nodes.
  Engine.prototype.studioFx = function (chId) {
    this.init(); var ch = this.channels[chId]; if (!ch) return null;
    if (ch._studio) return ch._studio;
    var ctx = this.ctx;
    // baked 80 Hz high-pass (always on — removes sub-rumble from tracked audio; UI shows "HPF 80Hz")
    var hpf = ctx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = 80; hpf.Q.value = 0.7;
    var low = ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 120; low.gain.value = 0;
    var mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 0.9; mid.gain.value = 0;
    var high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 6000; high.gain.value = 0;
    var conv = ctx.createConvolver(); conv.buffer = this._makeImpulse(2.4, 2.6);
    var wet = ctx.createGain(); wet.gain.value = 0;
    var dry = ctx.createGain(); dry.gain.value = 1;
    var out = ctx.createGain(); out.gain.value = 1;
    // hpf -> low -> mid -> high -> (dry + conv->wet) -> out
    hpf.connect(low); low.connect(mid); mid.connect(high);
    high.connect(dry); high.connect(conv); conv.connect(wet);
    dry.connect(out); wet.connect(out);
    // splice the channel tail (panner if present, else gain) through the chain into the insert
    var tail = ch.panner || ch.gain, tgt = this._insertInput(ch.route, chId);
    try { tail.disconnect(); } catch (e) {}
    tail.connect(hpf); out.connect(tgt);
    ch._studio = { hpf: hpf, low: low, mid: mid, high: high, conv: conv, wet: wet, dry: dry, out: out };
    return ch._studio;
  };
  // Set reverb "size" by regenerating the impulse (call sparingly, e.g. on pointer-up).
  Engine.prototype.setStudioReverbSize = function (chId, seconds) {
    var ch = this.channels[chId]; if (!ch || !ch._studio) return;
    ch._studio.conv.buffer = this._makeImpulse(Math.max(0.2, seconds || 2.4), 2.6);
  };
  // Coarse 0..1 output level from the channel's insert analyser (Studio VU convenience).
  Engine.prototype.channelLevel = function (chId) {
    var ch = this.channels[chId]; if (!ch) return 0;
    var ins = this.inserts[ch.route]; if (!ins || !ins.analyser) return 0;
    var d = ins.meterData || new Uint8Array(ins.analyser.fftSize);
    ins.analyser.getByteFrequencyData(d);
    var s = 0; for (var i = 0; i < d.length; i++) s += d[i];
    return Math.min(1, (s / d.length) / 160);
  };

  // append a new track from a catalog voice type; allocate route = max(route)+1 (NOT length)
  Engine.prototype.addChannel = function (catalogType) {
    this.init();
    var src = null;
    this._catalog.forEach(function (c) { if (c.type === catalogType && !src) src = c; });
    if (!src) src = this._catalog[0];
    // unique id
    var n = 1, id = src.type; while (this.channels[id]) { id = src.type + "_" + (++n); }
    // route allocation: max existing route + 1, capped at 16, so deletions never cause collisions
    var maxRoute = 0; this.channelDefs.forEach(function (c) { if (c.route > maxRoute) maxRoute = c.route; });
    var route = Math.min(16, maxRoute + 1);
    var def = { id: id, label: src.label + (n > 1 ? " " + n : ""), type: src.type, color: src.color,
                route: route, vol: src.vol, pan: 0, tonal: src.tonal, base: src.base, sampleId: src.id, workspace: "producer" };
    this.channelDefs.push(def);
    // add a fresh step row for this channel in EVERY bank
    this.banks.forEach(function (bk) { bk.steps[id] = freshStepRow(patLen(bk)); });
    this._wireChannel(def);
    this.focus = id;
    return def;
  };

  // Synth Suite (Phase 1): append a native polyphonic SYNTH track (kind:'synth'). It carries an
  // editable ADSR + waveform preset and is tonal so it routes into the Piano Roll + classifies as
  // melodic. Wired into its own id-based mixer insert (route = max+1, capped 16) like any track.
  Engine.prototype.addSynthTrack = function (name, wave) {
    this.init();
    var n = 1, id = "syn"; while (this.channels[id]) { id = "syn_" + (++n); }
    var maxRoute = 0; this.channelDefs.forEach(function (c) { if (c.route > maxRoute) maxRoute = c.route; });
    var def = { id: id, label: name || ("Synth" + (n > 1 ? " " + n : "")), type: "synth", kind: "synth", color: "#9d4edd",
                route: Math.min(16, maxRoute + 1), vol: 0.7, pan: 0, tonal: true, base: 60, workspace: "producer",
                synth: { wave: wave || "sawtooth", attack: 0.005, decay: 0.12, sustain: 0.7, release: 0.08 } };
    this.channelDefs.push(def);
    this.banks.forEach(function (bk) { bk.steps[id] = freshStepRow(patLen(bk)); });
    this._wireChannel(def);
    this.focus = id;
    return def;
  };

  // delete a track: DISCONNECT FIRST, then splice, then purge ALL banks. Routes stay pinned.
  Engine.prototype.removeChannel = function (id) {
    var ch = this.channels[id];
    // 1) disconnect live nodes FIRST (prevents orphaned audio / leak)
    if (ch) {
      try { if (ch.panner) ch.panner.disconnect(); } catch (e) {}
      try { ch.gain.disconnect(); } catch (e) {}
      delete this.channels[id];
    }
    // keep the decoded buffer in memory (so Undo can restore a deleted track within the session);
    // only drop its persisted IndexedDB copy, and not during a hydrate/undo rebuild.
    if (this.userBuffers[id] && !this._hydrating) idbDel(id);
    // 2) splice from the live track list
    this.channelDefs = this.channelDefs.filter(function (c) { return c.id !== id; });
    // 3) purge this channel's data from EVERY pattern bank (steps + piano-roll notes) + timeline clips
    this.banks.forEach(function (bk) {
      delete bk.steps[id];
      bk.notes = bk.notes.filter(function (nt) { return nt.ch !== id; });
    });
    this.timeline.clips = this.timeline.clips.filter(function (c) { return c.ch !== id; });
    if (this.timeline.automation) delete this.timeline.automation[id];
    // 4) repair focus if we deleted the focused channel
    if (this.focus === id) this.focus = this.channelDefs.length ? this.channelDefs[0].id : null;
    // NOTE: remaining channels keep their original route numbers (pinned) — inserts untouched.
  };

  // populate the demo project on demand (was previously auto-run at boot in app.jsx)
  Engine.prototype.loadDemoChannels = function () {
    this.init(); var self = this;
    // reset to a clean catalog-based project
    this.channelDefs.slice().forEach(function (c) { self.removeChannel(c.id); });
    this._catalog.forEach(function (c) {
      var def = { id: c.id, label: c.label, type: c.type, color: c.color, route: c.route,
                  vol: c.vol, pan: c.pan, tonal: c.tonal, base: c.base, sampleId: c.id, workspace: "producer" };
      self.channelDefs.push(def);
      self.banks.forEach(function (bk) { if (!bk.steps[c.id]) bk.steps[c.id] = freshStepRow(patLen(bk)); });
      self._wireChannel(def);
    });
    if (this.channelDefs.length) this.focus = this.channelDefs[0].id;
  };

  // wipe to a completely blank project (disconnects nodes, clears samples/IDB, banks, timeline)
  Engine.prototype.newProject = function () {
    this.init(); var self = this;
    this.channelDefs.slice().forEach(function (c) { self.removeChannel(c.id); });  // disconnect + purge sampler IDB
    this.banks = [blankPattern(), blankPattern(), blankPattern(), blankPattern()];
    this.blocks = []; this.audioClips = []; this.timeline.clips = []; this.timeline.automation = {};
    this.focus = null; this.activePattern = 0;
    this.setTempo(140); this.setSwing(0.16); this.setMaster(0.9);
  };
  // insert edits
  Engine.prototype.setInsertVol = function (id, v) { this.init(); var ins = this.inserts[id]; ins.vol = v; ins.fader.gain.value = ins.mute ? 0 : v; };
  Engine.prototype.setInsertPan = function (id, v) { this.init(); var ins = this.inserts[id]; ins.panVal = v; if (ins.pan) ins.pan.pan.value = v; };
  Engine.prototype.muteInsert = function (id) { this.init(); var ins = this.inserts[id]; ins.mute = !ins.mute; ins.fader.gain.value = ins.mute ? 0 : ins.vol; return ins.mute; };
  Engine.prototype.soloInsert = function (id) { this.init(); var ins = this.inserts[id]; ins.solo = !ins.solo; return ins.solo; };
  Engine.prototype.setFxSlot = function (id, slot, type) { this.init(); var s = this.inserts[id].fx[slot]; s.type = type; s.bypass = false; s.params = defParams(type); this._applyFx(id); };
  Engine.prototype.clearFxSlot = function (id, slot) { this.init(); var s = this.inserts[id].fx[slot]; s.type = null; s.params = {}; this._applyFx(id); };
  Engine.prototype.bypassFx = function (id, slot) { this.init(); var s = this.inserts[id].fx[slot]; s.bypass = !s.bypass; this._applyFx(id); return s.bypass; };
  Engine.prototype.setFxParam = function (id, slot, key, val) { this.init(); this.inserts[id].fx[slot].params[key] = val; this._applyFx(id); };
  // ---- per-clip FX recall: snapshot an insert's full 8-slot rack, or restore one onto an insert.
  // A timeline clip can bind a snapshot (clip.fx); double-clicking the clip recalls it onto the
  // lane's shared insert (default = no snapshot = shares the track chain). This keeps the existing
  // 1:1 channel->insert audio graph intact (no per-clip nodes), so the look-ahead scheduler still
  // routes every voice through the insert FX chain exactly as before — nothing is bypassed.
  Engine.prototype.getInsertFx = function (id) { var ins = this.inserts[id]; if (!ins) return null; return JSON.parse(JSON.stringify(ins.fx)); };
  Engine.prototype.setInsertFx = function (id, arr) {
    this.init(); var ins = this.inserts[id]; if (!ins || !arr) return;
    for (var i = 0; i < 8; i++) { var s = arr[i] || { type: null, bypass: false, params: {} }; ins.fx[i] = { type: s.type || null, bypass: !!s.bypass, params: Object.assign({}, s.params || {}) }; }
    this._applyFx(id);
  };
  // Task 4: per-clip FX route override. routeOverride = insert id (1..16) or null (inherit
  // the channel's normal insert). When set, the scheduler sends that clip's voices through
  // inserts[routeOverride] (see _fireEvent/_overrideSend), giving the block an independent rack.
  Engine.prototype.setClipRoute = function (clipId, routeOverride) {
    this.init(); var clip = null;
    this.timeline.clips.forEach(function (c) { if (c.id === clipId) clip = c; });
    if (!clip) return;
    if (routeOverride && this.inserts[routeOverride]) clip.routeOverride = routeOverride; else delete clip.routeOverride;
    this._refreshTimelineEvents();
    return clip.routeOverride || null;
  };
  // arrangement
  Engine.prototype.addBlock = function (pattern, bar, lane) { this.init(); this.blocks = this.blocks.filter(function (b) { return !(b.bar === bar && b.lane === lane); }); var id = "b" + (++this._bseq); this.blocks.push({ id: id, pattern: pattern, bar: bar, lane: lane }); return id; };
  Engine.prototype.removeBlock = function (id) { this.blocks = this.blocks.filter(function (b) { return b.id !== id; }); };
  Engine.prototype.setLoop = function (s, e) { this.loop.start = clamp(s, 0, this.songBars - 1); this.loop.end = clamp(e, this.loop.start + 1, this.songBars); };
  // piano roll
  Engine.prototype.addNote = function (ch, pitch, start, len, vel) { this.init(); var id = "n" + (++this._bseq); this.pat().notes.push({ id: id, ch: ch, pitch: pitch, start: start, len: len, vel: vel || 100 }); this.syncRackClip(ch); return id; };
  Engine.prototype.removeNote = function (id) { var p = this.pat(); var n = p.notes.filter(function (x) { return x.id === id; })[0]; p.notes = p.notes.filter(function (x) { return x.id !== id; }); if (n) this.syncRackClip(n.ch); };
  Engine.prototype.updateNote = function (id, patch) { var n = this.pat().notes.find(function (x) { return x.id === id; }); if (n) { Object.assign(n, patch); this.syncRackClip(n.ch); } };

  // Task 6: live per-insert microphone input (enableMic/disableMic) was removed — external
  // tooling handles audio input now. Timeline take-recording (recordMic / startTimelineRecording)
  // is a separate path and remains.

  // ---- Pitch Fix (Auto-Tune) -------------------------------------------------
  var SCALES = { chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], cmajor: [0, 2, 4, 5, 7, 9, 11], aminor: [9, 11, 0, 2, 4, 5, 7] };
  function nearestScaleMidi(midi, scaleKey) {
    var set = SCALES[scaleKey] || SCALES.chromatic; var best = null, bd = 1e9;
    for (var oct = -1; oct <= 1; oct++) { for (var i = 0; i < set.length; i++) { var base = Math.round(midi / 12) * 12 + oct * 12 + set[i]; var d = Math.abs(base - midi); if (d < bd) { bd = d; best = base; } } }
    return best == null ? Math.round(midi) : best;
  }
  // insert/remove the crossfade pitch-shift ScriptProcessor between comp and dry/delay
  Engine.prototype._ensurePitchNode = function (ins) {
    var active = ins.pitchActive;
    if (active && !ins.pitch) {
      if (!this.ctx.createScriptProcessor) return;
      var sp = this.ctx.createScriptProcessor(1024, 1, 1);
      var R = 4096, ring = new Float32Array(R), wp = 0, rp = 0; ins._ratioSmooth = 1;
      sp.onaudioprocess = function (e) {
        var inp = e.inputBuffer.getChannelData(0), out = e.outputBuffer.getChannelData(0), n = inp.length;
        if (!ins.pitchActive) { out.set(inp); return; }
        var tgt = ins.pitchRatioTarget || 1, sm = ins._ratioSmooth || 1, a = ins.pitchSmoothCoef || 0.01;
        if (Math.abs(tgt - 1) < 0.001 && Math.abs(sm - 1) < 0.001) { out.set(inp); for (var q = 0; q < n; q++) { ring[wp] = inp[q]; wp++; if (wp >= R) wp -= R; } rp = wp; return; }
        for (var i = 0; i < n; i++) {
          sm += (tgt - sm) * a; ring[wp] = inp[i];
          var p2 = rp + R / 2; if (p2 >= R) p2 -= R;
          var d1 = (wp - rp + R) % R, w1 = d1 / (R / 2); if (w1 > 1) w1 = 2 - w1; if (w1 < 0) w1 = 0;
          var d2 = (wp - p2 + R) % R, w2 = d2 / (R / 2); if (w2 > 1) w2 = 2 - w2; if (w2 < 0) w2 = 0;
          var s = w1 + w2; if (s < 1e-4) s = 1;
          var i1 = Math.floor(rp), f1 = rp - i1, i1b = (i1 + 1) % R, v1 = ring[i1] * (1 - f1) + ring[i1b] * f1;
          var i2 = Math.floor(p2), f2 = p2 - i2, i2b = (i2 + 1) % R, v2 = ring[i2] * (1 - f2) + ring[i2b] * f2;
          out[i] = (v1 * w1 + v2 * w2) / s;
          rp += sm; if (rp >= R) rp -= R; if (rp < 0) rp += R; wp++; if (wp >= R) wp -= R;
        }
        ins._ratioSmooth = sm;
      };
      ins.pitch = sp;
      ins.detAnalyser = this.ctx.createAnalyser(); ins.detAnalyser.fftSize = 2048; ins._detData = new Float32Array(2048);
      try { ins.comp.disconnect(); } catch (e) {}
      ins.comp.connect(sp); sp.connect(ins.dry); sp.connect(ins.delay); ins.comp.connect(ins.detAnalyser);
    } else if (!active && ins.pitch) {
      try { ins.pitch.disconnect(); ins.pitch.onaudioprocess = null; } catch (e) {}
      try { ins.comp.disconnect(); } catch (e) {}
      ins.comp.connect(ins.dry); ins.comp.connect(ins.delay);
      ins.pitch = null; ins.detAnalyser = null;
      if (window.CR_PITCH) delete window.CR_PITCH[ins.def.id];
    }
  };
  // autocorrelation pitch detection for active pitchfix inserts -> window.CR_PITCH
  Engine.prototype._detectPitches = function () {
    if (!window.CR_PITCH) window.CR_PITCH = {};
    for (var k in this.inserts) {
      var ins = this.inserts[k]; if (!ins.pitchActive || !ins.detAnalyser) continue;
      var buf = ins._detData; ins.detAnalyser.getFloatTimeDomainData(buf);
      var sr = this.ctx.sampleRate, freq = autoCorrelate(buf, sr);
      if (freq <= 0) { window.CR_PITCH[ins.def.id] = { freq: 0, note: -1, cents: 0 }; ins.pitchRatioTarget = 1; continue; }
      var midi = 69 + 12 * Math.log(freq / 440) / Math.LN2;
      var nearestChrom = Math.round(midi), cents = (midi - nearestChrom) * 100;
      var p = ins.pitchParams || { correction: 0.85, scale: "chromatic" };
      var target = nearestScaleMidi(midi, p.scale);
      var corrCents = -(midi - target) * 100 * (p.correction == null ? 0.85 : p.correction);
      ins.pitchRatioTarget = Math.pow(2, corrCents / 1200);
      window.CR_PITCH[ins.def.id] = { freq: freq, note: ((nearestChrom % 12) + 12) % 12, cents: cents, target: ((target % 12) + 12) % 12 };
    }
  };
  function autoCorrelate(buf, sr) {
    var n = buf.length, rms = 0; for (var i = 0; i < n; i++) rms += buf[i] * buf[i]; rms = Math.sqrt(rms / n);
    if (rms < 0.008) return -1;
    var r1 = 0, r2 = n - 1, thres = 0.2;
    for (var i = 0; i < n / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (var i = 1; i < n / 2; i++) if (Math.abs(buf[n - i]) < thres) { r2 = n - i; break; }
    var b = buf.slice(r1, r2), m = b.length, c = new Float32Array(m);
    for (var lag = 0; lag < m; lag++) { var sum = 0; for (var j = 0; j < m - lag; j++) sum += b[j] * b[j + lag]; c[lag] = sum; }
    var d = 0; while (d < m - 1 && c[d] > c[d + 1]) d++;
    var maxv = -1, maxp = -1; for (var i = d; i < m; i++) if (c[i] > maxv) { maxv = c[i]; maxp = i; }
    if (maxp <= 0) return -1;
    var x1 = c[maxp - 1] || 0, x2 = c[maxp], x3 = c[maxp + 1] || 0, aa = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    var T = aa ? maxp - bb / (2 * aa) : maxp; var f = sr / T;
    return (f > 50 && f < 2000) ? f : -1;
  }

  // ---- offline mixdown render -> 16-bit stereo WAV ---------------------------
  Engine.prototype.renderMixdown = function (onProgress, onDone, soloId) {
    var self = this; this.init();
    // PLAYBACK PARITY: mirror all rack patterns onto the timeline first (same as start()), so a
    // bounce taken before the user ever pressed play / entered the Timeline still includes every
    // instrument that has content — the export must match what live playback now plays.
    this.syncAllRackClips();
    // EXPORT: offline graph mirrors live routing — bounce the TIMELINE arrangement (not the
    // legacy empty blocks, which produced silence) over the derived song length.
    // SR MATCH: render at the LIVE context's sample rate so decoded sampler/recorded buffers
    // (which were decoded at the hardware rate, e.g. 48000) need zero resampling — avoids the
    // extra SRC stage and keeps the bounce sample-accurate against monitoring. WAV header below
    // writes buffer.sampleRate, so a 48k render yields a valid 48k file.
    var sr = (this.ctx && this.ctx.sampleRate) ? this.ctx.sampleRate : 44100;
    // EXPORT LENGTH (D1): bounce the ACTUAL arrangement extent, not recomputeTimelineLength()'s
    // 32-bar canvas floor (that minimum is for the editor; using it here padded short loops with
    // ~60s of trailing silence). Clip ends bound every scheduled event — MIDI notes live inside
    // clips, untrimmed audio clips have lengthTicks=secToTick(duration); note releases ride the
    // tail below. Computed locally so we never mutate live timeline state during a render.
    var songTicks = 0;
    this.timeline.clips.forEach(function (c) { var e = (c.startTick || 0) + (c.lengthTicks || 0); if (e > songTicks) songTicks = e; });
    // RENDER TAIL (D2): size the post-song tail to the longest active delay's decay-to--60dB
    // instead of a fixed 1.8s (which clipped aggressive delay/chorus feedback). Floor at 1.8s so
    // note releases always fit, hard-cap at 12s so runaway feedback can't balloon the buffer.
    // Same delayish detection as the insert builder below; must run before octx (dur sets length).
    var fxTail = 0;
    this.insertDefs.forEach(function (def) {
      var live = self.inserts[def.id]; if (!live) return;
      live.fx.forEach(function (s) {
        if (!s.type || s.bypass) return;
        if (s.type === "delay") {
          var t = s.params.time || 0.3, fb = Math.min(0.95, Math.max(0, s.params.fb || 0));
          var reps = fb > 0.01 ? (3 / Math.log10(1 / fb)) : 1;   // repeats to ~ -60 dB
          var tl = t * reps; if (tl > fxTail) fxTail = tl;
        } else if (s.type === "chorus") { if (0.1 > fxTail) fxTail = 0.1; }
        else if (s.type === "reverb") { var rt = 0.6 + (s.params.size != null ? s.params.size : 0.6) * 4.4; if (rt > fxTail) fxTail = rt; }   // Fix 6: reverb tail rings out in the bounce (matches the longer parity impulse; capped at 12s below)
      });
    });
    var tail = Math.min(12, Math.max(1.8, fxTail + 0.3));
    var dur = this.tickToSec(songTicks) + tail;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { onDone && onDone(null); return; }
    var octx = new OAC(2, Math.ceil(sr * dur), sr);
    var nb = octx.createBuffer(1, sr, sr), nd = nb.getChannelData(0); for (var i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
    var master = octx.createGain(); master.gain.value = this.master.gain.value;
    // MASTER CHAIN PARITY (the regression fix): the LIVE master is gain -> SOFT-CLIP -> limiter
    // (see init(): _softClipCurve, oversample "4x"). The offline render previously skipped the
    // soft-clip and ran gain -> limiter, so stacked transients overshot the limiter's 2ms attack
    // and hard-clipped -> the "distorted / clipping / different from smooth playback" export bug.
    // Reconstruct the identical tanh soft-clipper here so the bounce matches monitoring exactly.
    var softclip = octx.createWaveShaper(); softclip.curve = this._softClipCurve(); softclip.oversample = "4x";
    // limiter settings are kept IDENTICAL to the live limiter (-2 / 0 / 20 / 0.002 / 0.12) on
    // purpose — matching live monitoring is the goal, so we do NOT retune it to a different ceiling.
    var lim = octx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    master.connect(softclip); softclip.connect(lim); lim.connect(octx.destination);
    var insIn = {};
    this.insertDefs.forEach(function (def) {
      var live = self.inserts[def.id];
      var input = octx.createGain();
      var bit = octx.createWaveShaper(); var comp = octx.createDynamicsCompressor();
      comp.attack.value = 0.005; comp.release.value = 0.15;   // F1: match live insert init (was WebAudio defaults 0.003/0.25)
      var filt = octx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 20000; filt.Q.value = 0.7;
      var dry = octx.createGain(); var dl = octx.createDelay(1.5); var fb = octx.createGain(); var wet = octx.createGain();
      var conv = octx.createConvolver(); var rvWet = octx.createGain(); rvWet.gain.value = 0;   // Fix 2: mirror the live reverb send offline
      var fader = octx.createGain(); fader.gain.value = live.mute ? 0 : live.vol;
      var pan = octx.createStereoPanner ? octx.createStereoPanner() : null; if (pan) pan.pan.value = live.panVal;
      var bitS = null, filtS = null, delayish = null, compS = null, reverbS = null;
      live.fx.forEach(function (s) { if (!s.type || s.bypass) return; if (s.type === "bitcrush") bitS = s; else if (s.type === "filter") filtS = s; else if (s.type === "delay" || s.type === "chorus") delayish = s; else if (s.type === "comp") compS = s; else if (s.type === "reverb") reverbS = s; });
      bit.curve = bitS ? self._bitCurve(bitS.params.bits) : self._linearCurve();
      if (filtS) { filt.type = filtS.params.mode; filt.frequency.value = filtS.params.freq; filt.Q.value = filtS.params.q; }
      if (compS) { comp.threshold.value = compS.params.thr; comp.ratio.value = compS.params.ratio; } else { comp.threshold.value = 0; comp.ratio.value = 1; }
      dry.gain.value = 1;
      // Fix 2: identical perceptual wet mapping as _applyFx so the bounce matches monitoring.
      if (delayish) { if (delayish.type === "chorus") { dl.delayTime.value = 0.022; fb.gain.value = 0.22; wet.gain.value = Math.pow((delayish.params.mix != null ? delayish.params.mix : 0.4), 0.6) * 1.1; } else { dl.delayTime.value = delayish.params.time; fb.gain.value = Math.min(0.92, delayish.params.fb); wet.gain.value = Math.pow((delayish.params.mix != null ? delayish.params.mix : delayish.params.wet), 0.6) * 1.25; } } else { fb.gain.value = 0; wet.gain.value = 0; }
      if (reverbS) { var rsz = reverbS.params.size != null ? reverbS.params.size : 0.6; conv.buffer = self._makeImpulse(0.6 + rsz * 4.4, 2.6); var rvw = reverbS.params.wet != null ? reverbS.params.wet : (reverbS.params.mix != null ? reverbS.params.mix * 0.8 : 0.24); rvWet.gain.value = rvw > 0 ? Math.pow(rvw / 0.8, 0.5) * 2.4 : 0; }   // Fix 6: identical parity mapping as _applyFx so the bounce matches monitoring
      input.connect(bit); bit.connect(filt); filt.connect(comp);
      comp.connect(dry); comp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet);
      comp.connect(conv); conv.connect(rvWet);
      dry.connect(fader); wet.connect(fader); rvWet.connect(fader); fader.connect(pan || master); if (pan) pan.connect(master);
      insIn[def.id] = input;
    });
    var chOut = {};
    this.channelDefs.forEach(function (c) {
      var lc = self.channels[c.id]; var g = octx.createGain(); g.gain.value = lc.vol;
      var p = octx.createStereoPanner ? octx.createStereoPanner() : null;
      if (p) { p.pan.value = lc.pan; g.connect(p); p.connect(insIn[lc.route]); } else g.connect(insIn[lc.route]);
      chOut[c.id] = g;
    });
    // EXPORT: offline graph mirrors live routing — per-clip routeOverride sends a channel's
    // voices to a different insert input (same as _overrideSend live). Cached per (ch:route).
    var ovSend = {};
    function outFor(chId, routeOverride) {
      if (!routeOverride || !insIn[routeOverride]) return chOut[chId];
      var k = chId + ":" + routeOverride; if (ovSend[k]) return ovSend[k];
      var lc = self.channels[chId]; var g = octx.createGain(); g.gain.value = lc ? lc.vol : 1;
      g.connect(insIn[routeOverride]); ovSend[k] = g; return g;
    }
    // schedule every flattened timeline event at its absolute-tick time, through the full
    // channel -> (override?) insert -> master chain mirrored above.
    this.timelineEvents().forEach(function (ev) {
      if (soloId && ev.ch !== soloId) return;                 // stem render: isolate one track
      if (!self._audible(ev.ch)) return;
      var c = self.channels[ev.ch]; if (!c) return;
      if (self._workspaceOf(c.def) !== "producer") return;    // ISOLATION: Producer bounce/master renders Producer content only

      var time = self.tickToSec(ev.absTick);
      var out = outFor(ev.ch, ev.routeOverride);
      if (ev.kind === "audio") { var adur = ev.trimmed ? self.tickToSec(ev.lenTicks) : 0; self._playBuffer(octx, self.userBuffers[ev.bufferId], time, out, 0, 100, adur, self.tickToSec(ev.offsetTicks || 0), { gain: ev.gain, fadeIn: self.tickToSec(ev.fadeInTicks || 0), fadeOut: self.tickToSec(ev.fadeOutTicks || 0) }); return; }
      var semis = ev.pitch - (c.def.base || 0);
      var d = Math.max(ev.lenTicks * self.secPerTick() * 0.95, 0.08);
      // Synth Suite (Phase 1): bounce kind:'synth' tracks through the same ADSR oscillator voice as
      // live playback (offline ctx -> no live-voice tracking / stealing), so the export matches.
      if (c.def.kind === "polySampler") self._synthVoice(octx, time, out, ev.pitch, ev.vel, d, c.def.synth, { buffer: self.userBuffers[c.def.bufferId] });
      else if (c.def.kind === "synth") self._synthVoice(octx, time, out, ev.pitch, ev.vel, d, c.def.synth);
      else if (c.def.type === "sampler") self._playBuffer(octx, self.userBuffers[c.def.bufferId], time, out, semis, ev.vel);
      else self._voice(octx, nb, c.def.type, time, out, semis, ev.vel, d);
    });
    var t0 = Date.now(), est = Math.max(2500, dur * 240);
    var prog = setInterval(function () { var el = Date.now() - t0; onProgress && onProgress(Math.min(0.985, 1 - Math.exp(-el / est * 2.2))); }, 60);
    octx.startRendering().then(function (rendered) { clearInterval(prog); onProgress && onProgress(1); onDone && onDone(self._encodeWav(rendered)); }).catch(function (e) { clearInterval(prog); console.error(e); onDone && onDone(null); });
  };
  Engine.prototype._encodeWav = function (buffer) {
    var nc = Math.min(2, buffer.numberOfChannels), len = buffer.length, bytes = len * nc * 2 + 44;
    var ab = new ArrayBuffer(bytes), v = new DataView(ab), pos = 0;
    function u16(d) { v.setUint16(pos, d, true); pos += 2; } function u32(d) { v.setUint32(pos, d, true); pos += 4; } function str(s) { for (var j = 0; j < s.length; j++) v.setUint8(pos++, s.charCodeAt(j)); }
    str("RIFF"); u32(bytes - 8); str("WAVE"); str("fmt "); u32(16); u16(1); u16(nc); u32(buffer.sampleRate); u32(buffer.sampleRate * nc * 2); u16(nc * 2); u16(16); str("data"); u32(bytes - 44);
    var chans = []; for (var c = 0; c < nc; c++) chans.push(buffer.getChannelData(c));
    for (var i = 0; i < len; i++) for (var c = 0; c < nc; c++) { var s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true); pos += 2; }
    return new Blob([ab], { type: "audio/wav" });
  };

  // ---- Rec Audio master (dual-export): offline-render the Studio session — backing/Project +
  // every UNMUTED audio lane — each through its session studio plugin chain (real: input gain,
  // baked 80Hz HPF + 3-band EQ, cutoff, compressor, tempo-delay, convolver reverb; stubbed DSP
  // passes through cleanly). Muted lanes excluded. Reads def.pluginState (the UI model on the def;
  // safe defaults if absent). Mirrors renderMixdown's master chain + tail sizing + _encodeWav.
  Engine.prototype.renderRecAudioMaster = function (onProgress, onDone) {
    var self = this; this.init();
    var sr = (this.ctx && this.ctx.sampleRate) ? this.ctx.sampleRate : 44100;
    var bpm = this.tempo || 140, spb = 60 / Math.max(40, bpm);
    var lanes = this.channelDefs.filter(function (c) { return self._workspaceOf(c) === "studio" && !c.uiMuted; });
    var clipsByLane = {}, songTicks = 0, maxDelayTail = 0, any = false;
    lanes.forEach(function (c) {
      var cl = self.timeline.clips.filter(function (x) { return x.ch === c.id && x.kind === "audio"; });
      clipsByLane[c.id] = cl;
      cl.forEach(function (x) { var e = (x.startTick || 0) + (x.lengthTicks || 0); if (e > songTicks) songTicks = e; any = true; });
      var ps = c.pluginState; if (ps && ps.delay && ps.delay.mix > 0.001) { var t = ps.delay.div === "1/4" ? spb : ps.delay.div === "1/8" ? spb / 2 : spb / 4; var fb = Math.min(0.95, ps.delay.fb || 0); var reps = fb > 0.01 ? 3 / Math.log10(1 / fb) : 1; var tl = t * reps; if (tl > maxDelayTail) maxDelayTail = tl; }
    });
    if (!any) { onDone && onDone(null); return; }
    var dur = this.tickToSec(songTicks) + Math.min(12, Math.max(1.8, maxDelayTail + 0.3));
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { onDone && onDone(null); return; }
    var octx = new OAC(2, Math.ceil(sr * dur), sr);
    var master = octx.createGain(); master.gain.value = this.master.gain.value;
    var softclip = octx.createWaveShaper(); softclip.curve = this._softClipCurve(); softclip.oversample = "4x";
    var lim = octx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    master.connect(softclip); softclip.connect(lim); lim.connect(octx.destination);
    lanes.forEach(function (c) {
      var ps = c.pluginState || {}, eq = ps.eq || {}, comp = ps.compressor || {}, dly = ps.delay || {}, rev = ps.reverb || {};
      var inGain = ps.inputGain != null ? ps.inputGain : (self.channels[c.id] ? self.channels[c.id].vol : 0.9);
      var chan = octx.createGain(); chan.gain.value = inGain;
      var hpf = octx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = 80; hpf.Q.value = 0.7;
      var low = octx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 120; low.gain.value = eq.low || 0;
      var mid = octx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 0.9; mid.gain.value = eq.mid || 0;
      var high = octx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 6000; high.gain.value = eq.high || 0;
      var conv = octx.createConvolver(); conv.buffer = self._makeImpulse(rev.size || 2.4, 2.6);
      var rdry = octx.createGain(); rdry.gain.value = 1; var rwet = octx.createGain(); rwet.gain.value = rev.wet || 0; var rsum = octx.createGain();
      var filt = octx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = eq.cutoff != null ? eq.cutoff : 20000; filt.Q.value = 0.7;
      var cmp = octx.createDynamicsCompressor(); cmp.attack.value = 0.005; cmp.release.value = 0.15; cmp.threshold.value = comp.threshold != null ? comp.threshold : 0; cmp.ratio.value = comp.ratio != null ? comp.ratio : 1;
      var ddry = octx.createGain(); ddry.gain.value = 1; var dl = octx.createDelay(1.5); var dfb = octx.createGain(); var dwet = octx.createGain();
      var dsec = dly.div === "1/4" ? spb : dly.div === "1/8" ? spb / 2 : spb / 4; dl.delayTime.value = Math.min(1.5, dsec); dfb.gain.value = Math.min(0.95, dly.fb || 0); dwet.gain.value = dly.mix || 0;
      var fader = octx.createGain(); fader.gain.value = (ps.routing && ps.routing.output != null) ? ps.routing.output : (self.inserts[c.route] ? self.inserts[c.route].vol : 0.8);
      chan.connect(hpf); hpf.connect(low); low.connect(mid); mid.connect(high);
      high.connect(rdry); high.connect(conv); conv.connect(rwet); rdry.connect(rsum); rwet.connect(rsum);
      rsum.connect(filt); filt.connect(cmp);
      cmp.connect(ddry); cmp.connect(dl); dl.connect(dfb); dfb.connect(dl); dl.connect(dwet);
      ddry.connect(fader); dwet.connect(fader); fader.connect(master);
      (clipsByLane[c.id] || []).forEach(function (clip) {
        var adur = clip.trimmed ? self.tickToSec(clip.lengthTicks) : 0;
        self._playBuffer(octx, self.userBuffers[clip.bufferId], self.tickToSec(clip.startTick || 0), chan, 0, 100, adur, self.tickToSec(clip.offsetTicks || 0), { gain: clip.gain, fadeIn: self.tickToSec(clip.fadeInTicks || 0), fadeOut: self.tickToSec(clip.fadeOutTicks || 0) });
      });
    });
    var t0 = Date.now(), est = Math.max(2500, dur * 240);
    var prog = setInterval(function () { var el = Date.now() - t0; onProgress && onProgress(Math.min(0.985, 1 - Math.exp(-el / est * 2.2))); }, 60);
    octx.startRendering().then(function (rendered) { clearInterval(prog); onProgress && onProgress(1); onDone && onDone(self._encodeWav(rendered)); }).catch(function (e) { clearInterval(prog); console.error(e); onDone && onDone(null); });
  };

  // ---- multitrack stem export: render each lane solo, package as a (store) ZIP ----
  Engine.prototype._stemName = function (label, i) { return ("0" + (i + 1)).slice(-2) + "_" + String(label || "track").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 24) + ".wav"; };
  Engine.prototype.renderStems = function (onProgress, onDone) {
    var self = this, defs = this.producerDefs();   // ISOLATION: stems are the Producer arrangement, one WAV per Producer track
    if (!defs.length) { onDone && onDone(null); return; }
    var stems = [], i = 0;
    function next() {
      if (i >= defs.length) { self._zipStems(stems, onDone); return; }
      var d = defs[i];
      self.renderMixdown(function (p) { onProgress && onProgress((i + p) / defs.length); }, function (blob) {
        if (blob) stems.push({ name: self._stemName(d.label, i), blob: blob });
        i++; next();
      }, d.id);
    }
    next();
  };
  Engine.prototype._zipStems = function (stems, onDone) {
    if (!stems.length) { onDone && onDone(null); return; }
    var bufs = [], done = 0;
    stems.forEach(function (s, idx) {
      s.blob.arrayBuffer().then(function (ab) { bufs[idx] = { name: s.name, data: new Uint8Array(ab) }; if (++done === stems.length) onDone && onDone(makeStoreZip(bufs)); });
    });
  };
  // minimal dependency-free ZIP (store / no compression) — WAVs are already uncompressed
  var _crcTable = null;
  function crc32(buf) {
    if (!_crcTable) { _crcTable = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); _crcTable[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) crc = (_crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0; return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function makeStoreZip(files) {
    function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
    function u32(v) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }
    function enc(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0xff); return a; }
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nm = enc(f.name), data = f.data, crc = crc32(data), sz = data.length;
      var local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0), nm);
      parts.push(new Uint8Array(local)); parts.push(data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nm)));
      offset += local.length + sz;
    });
    var cdSize = 0; central.forEach(function (c) { cdSize += c.length; });
    var eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    return new Blob(parts.concat(central).concat([eocd]), { type: "application/zip" });
  }

  // ---- session serialization (PARAMETERS ONLY — never live audio nodes) ------
  var SCHEMA = 4;            // v4 (FINAL BUILD): linear timeline is authoritative; banks liquidated on load
  // ---- Phase 1: schema 3 -> 4 load-time migrator (pattern banks -> pure linear clips) ----
  // Non-destructively converts a saved schema-3 project (banks / loop / activePattern) into the
  // schema-4 linear model: every channel's on-step / piano-roll content becomes an absolute-tick
  // MIDI timeline clip, the banks are then emptied so the live _rack mirror can never re-add them
  // (that would double-trigger every note). DE-DUP GUARD: a bank is NOT flattened for a channel
  // that is already represented by a real (non-_rack) clip at bar 0 — so a project carrying BOTH
  // bank steps and timeline clips migrates without duplicates. Operates on the raw data object
  // (no live nodes), so it is safe to run before the rest of hydrate().
  Engine.prototype._migrateV3toV4 = function (data) {
    var TPB = TICKS_PER_BAR, TPS = TICKS_PER_STEP;
    data.timeline = data.timeline || { clips: [], loop: { startTick: 0, endTick: 16 * TPB, on: false }, lengthTicks: 32 * TPB, automation: {} };
    // drop transient rack-mirror clips — bank content is re-materialized as permanent clips below
    var clips = (data.timeline.clips || []).filter(function (c) { return !c._rack; });
    var chDefs = data.channels || [], seq = 0;
    (data.banks || []).forEach(function (bank, bIdx) {
      if (!bank || !bank.steps) return;
      chDefs.forEach(function (ch) {
        if (ch.audioLane || ch.type === "audio") return;                 // audio lanes carry takes, not steps
        var row = bank.steps[ch.id] || [], notes = [];
        for (var i = 0; i < row.length; i++) { var st = row[i]; if (st && st.on) notes.push({ pitchTick: i * TPS, pitch: (ch.base || 0) + (ch.tonal ? (st.pitch || 0) : 0), lenTicks: Math.max(1, (st.len || 1)) * TPS, vel: st.vel }); }
        (bank.notes || []).forEach(function (nt) { if (nt.ch === ch.id) notes.push({ pitchTick: Math.round(nt.start * TPS), pitch: nt.pitch, lenTicks: Math.max(1, Math.round(nt.len * TPS)), vel: nt.vel }); });
        if (!notes.length) return;
        // de-dup: already represented by a real clip for this channel at bar 0 -> skip
        if (clips.some(function (c) { return c.ch === ch.id && c.kind === "midi" && (c.startTick || 0) === 0; })) return;
        var end = 0; notes.forEach(function (n) { var e = n.pitchTick + n.lenTicks; if (e > end) end = e; });
        clips.push({ id: "mig" + (bIdx) + "_" + ch.id + "_" + (seq++), kind: "midi", ch: ch.id, startTick: 0, lengthTicks: Math.max(TPB, Math.ceil(end / TPB) * TPB), notes: notes });
      });
      // liquidate: empty the bank so syncAllRackClips() can't re-mirror it on play (no double-trigger)
      bank.steps = {}; bank.notes = [];
    });
    data.timeline.clips = clips;
    data.schema = 4;
    return data;
  };
  Engine.prototype.serialize = function () {
    var self = this;
    return {
      schema: SCHEMA,
      tempo: this.tempo, swing: this.swing, master: this.master ? this.master.gain.value : 0.9,
      activePattern: this.activePattern, focus: this.focus,
      channels: this.channelDefs.map(function (c) {
        var live = self.channels[c.id] || {};
        return { id: c.id, label: c.label, type: c.type, kind: c.kind || (c.type === "audio" ? "audioLane" : "sampler"), audioLane: !!c.audioLane, color: c.color, route: c.route,
                 workspace: self._workspaceOf(c),
                 base: c.base, tonal: c.tonal, sampleId: c.sampleId, bufferId: c.bufferId, userAudio: !!c.userAudio, synth: c.synth || null,
                 vol: live.vol != null ? live.vol : c.vol, pan: live.pan != null ? live.pan : c.pan,
                 muted: !!live.muted, solo: !!live.solo };
      }),
      banks: this.banks.map(function (bk) {
        var steps = {};
        for (var id in bk.steps) steps[id] = bk.steps[id].map(function (s) {
          return { on: s.on, vel: s.vel, pan: s.pan, pitch: s.pitch, len: s.len, vol: s.vol || 0 };
        });
        return { steps: steps, lengthBars: patLen(bk), notes: bk.notes.map(function (n) { return { ch: n.ch, pitch: n.pitch, start: n.start, len: n.len, vel: n.vel }; }) };
      }),
      inserts: Object.keys(this.inserts).map(function (k) {
        var ins = self.inserts[k];
        // Fix 2 persistence: store the full 8-slot FX rack so param edits survive reload. Small
        // (<2KB/insert), so it rides the existing localStorage autosave; restored exactly in hydrate.
        return { id: ins.def.id, vol: ins.vol, panVal: ins.panVal, mute: ins.mute, solo: ins.solo,
                 fx: ins.fx.map(function (s) { return { type: s.type || null, bypass: !!s.bypass, params: s.params || {} }; }) };
      }),
      timeline: { clips: this.timeline.clips, loop: this.timeline.loop, lengthTicks: this.timeline.lengthTicks, automation: this.timeline.automation }
    };
  };

  // rebuild engine state + FRESH audio nodes from saved params. Returns true on success.
  Engine.prototype.hydrate = function (data) {
    if (!data) return false;
    // Phase 1: accept v4 natively; auto-migrate v3 saves (incl. the "new" fixture) to v4 in place.
    if (data.schema === 3) { try { data = this._migrateV3toV4(data); } catch (e) { console.error("[migrate v3->v4] failed:", e); return false; } }
    if (data.schema !== SCHEMA) return false;            // unknown/older schema -> caller boots empty
    this.init();
    this._hydrating = true;                               // guard: blocks autosave mid-rebuild
    var self = this;
    try {
      this.tempo = data.tempo; this.swing = data.swing;
      if (this.master) this.master.gain.value = data.master;
      this.activePattern = data.activePattern || 0;
      // tear down any existing channels
      this.channelDefs.slice().forEach(function (c) { self.removeChannel(c.id); });
      // rebuild banks (step structs + notes)
      this.banks = (data.banks || []).map(function (bk) {
        var p = { steps: {}, notes: (bk.notes || []).slice(), lengthBars: Math.max(1, Math.min(32, bk.lengthBars || 1)) };
        for (var id in bk.steps) p.steps[id] = bk.steps[id].map(function (s) {
          return { on: !!s.on, vel: s.vel, pan: s.pan, pitch: s.pitch, len: s.len, vol: s.vol || 0 };
        });
        return p;
      });
      while (this.banks.length < 4) this.banks.push(blankPattern());
      // rebuild channels + fresh nodes
      (data.channels || []).forEach(function (c) {
        var isAudioLane = c.type === "audio" || !!c.audioLane || c.kind === "audioLane";
        // workspace migration: new saves carry `workspace` verbatim. Legacy saves (no tag) are routed —
        // non-audio kinds -> producer; an audio lane is producer only if it already carries an audio clip
        // (a melody import always does; a Studio rec lane is empty since RECORD is stubbed) else studio.
        // Backing lanes are corrected to studio by restoreStudioSave() after hydrate.
        var ws = (c.workspace === "producer" || c.workspace === "studio") ? c.workspace
               : (!isAudioLane ? "producer"
                  : ((data.timeline && data.timeline.clips || []).some(function (cl) { return cl.ch === c.id && cl.kind === "audio"; }) ? "producer" : "studio"));
        var def = { id: c.id, label: c.label, type: c.type, kind: c.kind || (c.type === "audio" ? "audioLane" : "sampler"), color: c.color, route: c.route,
                    vol: c.vol, pan: c.pan, tonal: c.tonal, base: c.base, sampleId: c.sampleId, workspace: ws,
                    bufferId: c.bufferId || c.id, userAudio: !!c.userAudio, audioLane: isAudioLane,
                    synth: (c.kind === "synth" || c.type === "synth" || c.kind === "polySampler") ? (c.synth || { wave: "sawtooth", attack: 0.005, decay: 0.12, sustain: 0.7, release: 0.08 }) : null };
        self.channelDefs.push(def);
        self.banks.forEach(function (bk) { if (!bk.steps[c.id]) bk.steps[c.id] = freshStepRow(patLen(bk)); });
        self._wireChannel(def);
        var live = self.channels[c.id];
        if (live) { live.muted = !!c.muted; live.solo = !!c.solo;
          self.setChannelVol(c.id, c.vol); self.setChannelPan(c.id, c.pan); }
        // sampler lane backed by user audio: async-restore its buffer from IndexedDB
        if (def.type === "sampler" && def.userAudio) self._rehydrateSample(def.id, def.bufferId);
      });
      // restore insert levels
      (data.inserts || []).forEach(function (s) {
        var ins = self.inserts[s.id]; if (!ins) return;
        ins.mute = !!s.mute; ins.solo = !!s.solo;
        // Fix 2: restore the saved FX rack exactly (zero-state dry defaults applied only when a
        // save has no fx array, e.g. pre-Fix-2 sessions).
        if (s.fx && s.fx.length) {
          ins.fx = s.fx.map(function (slot) { return slot ? { type: slot.type || null, bypass: !!slot.bypass, params: slot.params || {} } : { type: null, bypass: false, params: {} }; });
          while (ins.fx.length < 8) ins.fx.push({ type: null, bypass: false, params: {} });
          self._applyFx(s.id);
        }
        self.setInsertVol(s.id, s.vol); self.setInsertPan(s.id, s.panVal);
      });
      this.focus = data.focus && this.channels[data.focus] ? data.focus : (this.channelDefs[0] && this.channelDefs[0].id) || null;
      // restore linear-timeline clips (additive; absent in pre-timeline saves)
      if (data.timeline && data.timeline.clips) {
        this.timeline.clips = data.timeline.clips;
        if (data.timeline.loop) this.timeline.loop = data.timeline.loop;
        if (data.timeline.lengthTicks) this.timeline.lengthTicks = data.timeline.lengthTicks;
        this.timeline.automation = data.timeline.automation || {};
        // reseed the clip-id counter past every loaded "clip_N" id so newly created clips (melody
        // import / split / record) can never collide with a loaded id — a collision would make
        // splitClipAt / clip-edit / setClipRoute resolve the WRONG clip by id (latent before v4,
        // now routine since whole projects load as clips).
        var maxSeq = this._clipSeq || 0;
        this.timeline.clips.forEach(function (c) { var m = /^clip_(\d+)$/.exec(c.id || ""); if (m) { var v = parseInt(m[1], 10); if (v > maxSeq) maxSeq = v; } });
        // HEAL duplicate / missing clip ids (older saves written before the counter was reseeded
        // could contain colliding ids -> React key collisions + wrong-clip edits). Reassign any
        // repeat or blank id to a fresh unique one. Idempotent for already-unique projects.
        var seenIds = {};
        this.timeline.clips.forEach(function (c) {
          if (!c.id || seenIds[c.id]) { c.id = "clip_" + (++maxSeq); }
          seenIds[c.id] = true;
        });
        this._clipSeq = maxSeq;
        // restore recorded/imported audio-clip buffers from IndexedDB (async, error-isolated)
        this.timeline.clips.forEach(function (c) { if (c.kind === "audio" && c.bufferId) self._rehydrateSample(c.bufferId, c.bufferId); });
      } else { this.timeline.clips = []; }
      return true;
    } catch (e) {
      console.error("[hydrate] failed:", e);
      return false;
    } finally {
      this._hydrating = false;                            // release guard no matter what
    }
  };
  Engine.prototype.isHydrating = function () { return !!this._hydrating; };

  // ---- undo / redo: debounced full-project snapshots (built on serialize/hydrate) ----
  var HIST_CAP = 120;
  Engine.prototype.histInit = function () { var j = JSON.stringify(this.serialize()); this._hist = { stack: [JSON.parse(j)], idx: 0, lastJSON: j }; };
  Engine.prototype.histCheckpoint = function () {
    if (this._hydrating) return; var H = this._hist;
    var j = JSON.stringify(this.serialize()); if (j === H.lastJSON) return;     // nothing actually changed
    H.stack = H.stack.slice(0, H.idx + 1); H.stack.push(JSON.parse(j));
    if (H.stack.length > HIST_CAP) H.stack.shift();
    H.idx = H.stack.length - 1; H.lastJSON = j;
  };
  Engine.prototype.canUndo = function () { return this._hist.idx > 0; };
  Engine.prototype.canRedo = function () { return this._hist.idx < this._hist.stack.length - 1; };
  Engine.prototype._applyHist = function (s) { this._hist.lastJSON = JSON.stringify(s); this.hydrate(JSON.parse(JSON.stringify(s))); };
  Engine.prototype.undo = function () { var H = this._hist; if (H.idx <= 0) return false; H.idx--; this._applyHist(H.stack[H.idx]); return true; };
  Engine.prototype.redo = function () { var H = this._hist; if (H.idx >= H.stack.length - 1) return false; H.idx++; this._applyHist(H.stack[H.idx]); return true; };

  window.engine = new Engine();
})();
