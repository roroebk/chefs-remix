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

  function blankStep() { return { on: false, vel: 100, pan: 0, pitch: 0, len: 1 }; }
  // step-maps are added per-channel by addChannel(); a fresh bank starts empty.
  // lengthBars (Task 2): per-pattern length 1..32; step rows are sized 16*lengthBars.
  function blankPattern() { return { steps: {}, notes: [], lengthBars: 1 }; }
  // freshStepRow(bars) builds a row sized to the pattern length (default 1 bar = 16 steps)
  function freshStepRow(bars) { var n = STEPS * Math.max(1, bars || 1), a = []; for (var i = 0; i < n; i++) a.push(blankStep()); return a; }
  function patLen(bank) { return Math.max(1, Math.min(32, (bank && bank.lengthBars) || 1)); }

  function Engine() {
    this.ctx = null; this.master = null; this.masterAnalyser = null; this.limiter = null; this.noise = null;
    this.tempo = 140; this.swing = 0; this.isPlaying = false; this.playMode = "pattern";
    this.stepIndex = 0; this.songStep = 0; this.nextStepTime = 0;
    this.lookahead = 25; this.scheduleAhead = 0.12; this.timer = null; this.notesInQueue = [];
    this.channelDefs = []; this.insertDefs = INSERTS;          // blank slate — no instrument lanes until added
    this.channels = {}; this.inserts = {};
    this.banks = [blankPattern(), blankPattern(), blankPattern(), blankPattern()];
    this.activePattern = 0; this.focus = null; this._catalog = CHANNELS;   // factory defs for Add Track / demo
    this.userBuffers = {}; this._bufSeq = 0; this._micRec = null;          // decoded sampler buffers (import / mic)
    this._recState = null; this._recSeq = 0;                                // continuous timeline audio recording
    this._perfArmed = false; this._perfClips = {}; this._openNotes = {}; this._midiOn = false;  // MIDI/keyboard performance
    this._hist = { stack: [], idx: -1, lastJSON: null };                    // undo/redo snapshot history
    // arrangement (legacy pattern/bank model — still authoritative until the timeline is wired in)
    this.songBars = 32; this.loop = { start: 0, end: 16 }; this.blocks = []; this._bseq = 0;
    this.audioClips = [];
    // ---- linear timeline model (Phase 1, additive/dormant for now) ----
    // single continuous arrangement: absolute-tick clips on shared lanes. PPQ-based so snapping
    // is exact and clips stay movable/copyable as units (notes are stored relative to clip start).
    this.timeline = { lengthTicks: 32 * TICKS_PER_BAR, loop: { startTick: 0, endTick: 16 * TICKS_PER_BAR, on: true }, clips: [], automation: {} };
    this._clipSeq = 0;
    this.PPQ = PPQ; this.TICKS_PER_BAR = TICKS_PER_BAR; this.TICKS_PER_STEP = TICKS_PER_STEP; this.SNAP_TICKS = SNAP_TICKS;
    this.onStep = null; this.onMeter = null; this._lastStep = -1; this.meterFps = 60; this._meterLast = 0;
    this.onPlayhead = null; this.playheadTick = 0; this._tlEvents = null; this._tlCursor = 0;   // timeline transport
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
      var fader = ctx.createGain(); fader.gain.value = 0.8;
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      var an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5;
      input.connect(bit); bit.connect(filt); filt.connect(comp);
      comp.connect(dry); comp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet);
      dry.connect(fader); wet.connect(fader);
      fader.connect(an);
      if (pan) { an.connect(pan); pan.connect(self.master); } else { an.connect(self.master); }
      self.inserts[def.id] = {
        def: def, name: def.name, input: input, bit: bit, filt: filt, comp: comp,
        dry: dry, delay: dl, fb: fb, wet: wet, fader: fader, pan: pan, analyser: an,
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
    // 8 serial slots; type or null. preload several inserts with active racks
    function pad(arr) { while (arr.length < 8) arr.push(null); return arr; }
    var racks = {
      1: pad([{ type: "eq" }, { type: "comp" }, { type: "limiter" }]),           // KICK
      2: pad([{ type: "filter" }, { type: "comp" }, { type: "eq" }]),            // SUB
      3: pad([{ type: "eq" }, { type: "comp" }, { type: "reverb" }]),            // SNARE
      4: pad([{ type: "eq" }, { type: "reverb" }, { type: "delay" }]),           // CLAP
      5: pad([{ type: "eq" }, { type: "filter" }]),                              // C-HAT
      6: pad([{ type: "eq" }, { type: "reverb" }]),                              // O-HAT
      9: pad([{ type: "bitcrush" }, { type: "filter" }, { type: "delay" }, { type: "eq" }]), // GLITCH
      10: pad([{ type: "eq" }, { type: "delay" }, { type: "reverb" }, { type: "chorus" }]),  // VOX
      11: pad([{ type: "chorus" }, { type: "eq" }, { type: "delay" }]),          // PLUCK
      14: pad([{ type: "bitcrush" }, { type: "delay" }, { type: "reverb" }]),    // LEAD
      15: pad([{ type: "filter" }, { type: "reverb" }, { type: "delay" }])       // RISER
    };
    var base = racks[id] || pad([{ type: "eq" }]);
    return base.map(function (s) {
      if (!s) return { type: null, bypass: false, params: {} };
      return { type: s.type, bypass: false, params: defParams(s.type) };
    });
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
    var bit = null, filt = null, delayish = null, comp = null;
    ins.fx.forEach(function (s) {
      if (!s.type || s.bypass) return;
      if (s.type === "bitcrush") bit = s;
      else if (s.type === "filter") filt = s;
      else if (s.type === "delay" || s.type === "chorus") delayish = s;
      else if (s.type === "comp") comp = s;
    });
    ins.bit.curve = bit ? this._bitCurve(bit.params.bits) : this._linearCurve();
    if (filt) { ins.filt.type = filt.params.mode; ins.filt.frequency.value = filt.params.freq; ins.filt.Q.value = filt.params.q; }
    else { ins.filt.type = "lowpass"; ins.filt.frequency.value = 20000; ins.filt.Q.value = 0.7; }
    if (comp) { ins.comp.threshold.value = comp.params.thr; ins.comp.ratio.value = comp.params.ratio; }
    else { ins.comp.threshold.value = 0; ins.comp.ratio.value = 1; }
    if (delayish) {
      if (delayish.type === "chorus") { ins.delay.delayTime.value = 0.022; ins.fb.gain.value = 0.18; ins.wet.gain.value = (delayish.params.mix != null ? delayish.params.mix : 0.4) * 0.6; }
      else { ins.delay.delayTime.value = delayish.params.time; ins.fb.gain.value = delayish.params.fb; ins.wet.gain.value = (delayish.params.mix != null ? delayish.params.mix : delayish.params.wet) * 0.85; }
    } else { ins.fb.gain.value = 0; ins.wet.gain.value = 0; }
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
  Engine.prototype._playBuffer = function (ctx, buffer, t, out, semis, vel, durSec, offsetSec) {
    if (!buffer) return;
    var src = ctx.createBufferSource(); src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (semis || 0) / 12);
    var g = ctx.createGain(); g.gain.value = (vel == null ? 100 : vel) / 127;
    src.connect(g); g.connect(out);
    var off = Math.max(0, offsetSec || 0);
    // playbackRate scales how much source material a clip-window of durSec consumes
    if (durSec && durSec > 0) src.start(t, off, durSec * src.playbackRate.value); else src.start(t, off);
  };
  Engine.prototype._fire = function (chId, t, semis, vel, durSec, out) {
    var ch = this.channels[chId]; if (!ch) return;
    // ROUTING: all voices via channel insert. `out` defaults to ch.gain (-> panner ->
    // inserts[route].input). A routeOverride clip passes a one-shot send node wired to a
    // different insert (still post channel-gain), so every voice still passes an insert FX chain.
    var dest = out || ch.gain;
    // SCHED: single-fire guarantee — a tonal sampler voice (melodic/long sample) honors the
    // note/step length so it stops at its boundary instead of ringing on at full buffer length
    // and stacking under the next trigger (the "intense echo / slap-back" bug). Non-tonal
    // one-shots (drums) pass 0 -> full natural decay, unchanged.
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
    var def = { id: id, label: label, type: "sampler", color: opts.color || "#C77DFF", route: route,
                vol: 0.9, pan: 0, tonal: opts.tonal !== false, base: opts.base != null ? opts.base : 60,
                bufferId: id, sampleId: id, userAudio: true };
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
  Engine.prototype.addAudioTrack = function (name) {
    this.init();
    var n = 1, id = "rec"; while (this.channels[id]) { id = "rec_" + (++n); }
    var maxRoute = 0; this.channelDefs.forEach(function (c) { if (c.route > maxRoute) maxRoute = c.route; });
    var def = { id: id, label: name || ("Audio " + n), type: "audio", color: "#C77DFF", route: Math.min(16, maxRoute + 1), vol: 0.9, pan: 0, tonal: false, base: 0, audioLane: true };
    this.channelDefs.push(def);
    this.banks.forEach(function (bk) { bk.steps[id] = freshStepRow(patLen(bk)); });
    this._wireChannel(def); this.focus = id;
    return def;
  };
  // short metronome blip for the count-in (accented downbeat)
  Engine.prototype.metronomeClick = function (time, accent) {
    this.init(); var ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1200; g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.4 : 0.25, time + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    o.connect(g); g.connect(this.master); o.start(time); o.stop(time + 0.07);
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

  // ---- MIDI / keyboard performance input (Phase 4A) -------------------------
  // audition a note immediately (semis = offset from the channel's root)
  Engine.prototype.playLiveNote = function (chId, semis, vel) {
    this.init(); this.resume(); var ch = this.channels[chId]; if (!ch) return;
    this._fire(chId, this.ctx.currentTime, semis, vel || 100, ch.def.tonal ? 0.5 : 0.2);
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
      if (this.isPlaying) this.nextStepTime = this.ctx.currentTime + 0.03;   // re-anchor look-ahead
    }
    if (this.onPlayhead) this.onPlayhead(tick);
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
        evs.push({ absTick: clip.startTick, ch: clip.ch, kind: "audio", bufferId: clip.bufferId, offsetTicks: clip.offsetTicks || 0, lenTicks: clip.lengthTicks, clipId: clip.id, routeOverride: ro });
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
      self._fire(c.id, time + swingOff, st.pitch, st.vel, dur);
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
  Engine.prototype._fireEvent = function (ev, time) {
    if (!this._audible(ev.ch)) return;
    var ch = this.channels[ev.ch]; if (!ch) return;
    var send = this._overrideSend(ch, ev.routeOverride);   // null unless the clip overrides its route
    if (ev.kind === "audio") {
      // clip length + offset are stored in ticks, so the audible window stays locked to the
      // current tempo — a chopped/shortened clip stops exactly on its grid boundary (no drift).
      // ROUTING: all voices via channel insert
      this._playBuffer(this.ctx, this.userBuffers[ev.bufferId], time, send || ch.gain, 0, 100,
        this.tickToSec(ev.lenTicks), this.tickToSec(ev.offsetTicks || 0));
      return;
    }
    var semis = ev.pitch - (ch.def.base || 0);
    this._fire(ev.ch, time, semis, ev.vel, Math.max(ev.lenTicks * this.secPerTick() * 0.95, 0.08), send);
  };
  Engine.prototype._scheduleTimeline = function () {
    var spt = this.secPerTick(), loop = this.timeline.loop, evs = this._tlEvents || [];
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAhead) {
      var tick = this.playheadTick, time = this.nextStepTime, cur = this._tlCursor;
      while (cur < evs.length && evs[cur].absTick === tick) { this._fireEvent(evs[cur], time); cur++; }
      this._tlCursor = cur;
      if (tick % TICKS_PER_STEP === 0) { this.notesInQueue.push({ time: time, step: tick, bar: -1, tl: true }); this._applyAutomation(tick, time); } // playhead UI + automation (1/16 granularity)
      this.playheadTick++; this.nextStepTime += spt;
      if (loop.on && this.playheadTick >= loop.endTick) { this.playheadTick = loop.startTick; this._tlCursor = this._cursorForTick(loop.startTick); }
      else if (!loop.on && this.playheadTick >= this.timeline.lengthTicks) { this.pause(); break; }
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
    else if (this.playMode === "timeline") { this.recomputeTimelineLength(); this._tlEvents = this.timelineEvents(); this.playheadTick = this.timeline.loop.on ? this.timeline.loop.startTick : 0; this._tlCursor = this._cursorForTick(this.playheadTick); }
    else this.songStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06; var self = this;
    this.timer = setInterval(function () { self._scheduler(); }, this.lookahead); this._draw();
  };
  Engine.prototype.pause = function () { this.isPlaying = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } };
  Engine.prototype.stop = function () { this._finalizePerf(); this._resetParams(); this.pause(); this.stepIndex = 0; this.songStep = 0; this.playheadTick = 0; this._lastStep = -1; if (this.onStep) this.onStep(-1, -1); if (this.onPlayhead) this.onPlayhead(-1); };
  Engine.prototype.setMode = function (mode) { if (this.playMode === mode) return; this.playMode = mode; if (this.isPlaying) { this.pause(); this.start(mode); } };
  Engine.prototype._draw = function () {
    var self = this; if (!this.isPlaying) return; var now = this.ctx.currentTime, cur = null;
    while (this.notesInQueue.length && this.notesInQueue[0].time <= now) { cur = this.notesInQueue.shift(); }
    if (cur && cur.tl) { if (this.onPlayhead) this.onPlayhead(cur.step); }
    else if (cur && (cur.step !== this._lastStep || cur.bar >= 0)) { this._lastStep = cur.step; if (this.onStep) this.onStep(cur.step, cur.bar); }
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
  Engine.prototype.setRoute = function (id, route) { this.init(); var ch = this.channels[id]; ch.route = route; ch.def.route = route; var tgt = this.inserts[route].input; if (ch.panner) { ch.panner.disconnect(); ch.panner.connect(tgt); } else { ch.gain.disconnect(); ch.gain.connect(tgt); } };

  // ---- dynamic instrument lanes ---------------------------------------------
  // build the audio nodes for one channel def: gain -> panner -> insert.input
  // build the live audio nodes for one channel def and wire to its insert
  Engine.prototype._wireChannel = function (c) {
    var ctx = this.ctx;
    var g = ctx.createGain(); g.gain.value = c.vol;
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    var target = this.inserts[c.route].input;
    if (p) { p.pan.value = c.pan; g.connect(p); p.connect(target); } else g.connect(target);
    this.channels[c.id] = { def: c, gain: g, panner: p, vol: c.vol, pan: c.pan, muted: false, solo: false, route: c.route };
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
                route: route, vol: src.vol, pan: 0, tonal: src.tonal, base: src.base, sampleId: src.id };
    this.channelDefs.push(def);
    // add a fresh step row for this channel in EVERY bank
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
                  vol: c.vol, pan: c.pan, tonal: c.tonal, base: c.base, sampleId: c.id };
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
    // EXPORT: offline graph mirrors live routing — bounce the TIMELINE arrangement (not the
    // legacy empty blocks, which produced silence) over the derived song length.
    var sr = 44100;
    var songTicks = this.recomputeTimelineLength();
    var dur = this.tickToSec(songTicks) + 1.8;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { onDone && onDone(null); return; }
    var octx = new OAC(2, Math.ceil(sr * dur), sr);
    var nb = octx.createBuffer(1, sr, sr), nd = nb.getChannelData(0); for (var i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
    var master = octx.createGain(); master.gain.value = this.master.gain.value;
    var lim = octx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    master.connect(lim); lim.connect(octx.destination);
    var insIn = {};
    this.insertDefs.forEach(function (def) {
      var live = self.inserts[def.id];
      var input = octx.createGain();
      var bit = octx.createWaveShaper(); var comp = octx.createDynamicsCompressor();
      var filt = octx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 20000; filt.Q.value = 0.7;
      var dry = octx.createGain(); var dl = octx.createDelay(1.5); var fb = octx.createGain(); var wet = octx.createGain();
      var fader = octx.createGain(); fader.gain.value = live.mute ? 0 : live.vol;
      var pan = octx.createStereoPanner ? octx.createStereoPanner() : null; if (pan) pan.pan.value = live.panVal;
      var bitS = null, filtS = null, delayish = null, compS = null;
      live.fx.forEach(function (s) { if (!s.type || s.bypass) return; if (s.type === "bitcrush") bitS = s; else if (s.type === "filter") filtS = s; else if (s.type === "delay" || s.type === "chorus") delayish = s; else if (s.type === "comp") compS = s; });
      bit.curve = bitS ? self._bitCurve(bitS.params.bits) : self._linearCurve();
      if (filtS) { filt.type = filtS.params.mode; filt.frequency.value = filtS.params.freq; filt.Q.value = filtS.params.q; }
      if (compS) { comp.threshold.value = compS.params.thr; comp.ratio.value = compS.params.ratio; } else { comp.threshold.value = 0; comp.ratio.value = 1; }
      dry.gain.value = 1;
      if (delayish) { if (delayish.type === "chorus") { dl.delayTime.value = 0.022; fb.gain.value = 0.18; wet.gain.value = (delayish.params.mix != null ? delayish.params.mix : 0.4) * 0.6; } else { dl.delayTime.value = delayish.params.time; fb.gain.value = delayish.params.fb; wet.gain.value = (delayish.params.mix != null ? delayish.params.mix : delayish.params.wet) * 0.85; } } else { fb.gain.value = 0; wet.gain.value = 0; }
      input.connect(bit); bit.connect(filt); filt.connect(comp);
      comp.connect(dry); comp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet);
      dry.connect(fader); wet.connect(fader); fader.connect(pan || master); if (pan) pan.connect(master);
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
      var time = self.tickToSec(ev.absTick);
      var out = outFor(ev.ch, ev.routeOverride);
      if (ev.kind === "audio") { self._playBuffer(octx, self.userBuffers[ev.bufferId], time, out, 0, 100, self.tickToSec(ev.lenTicks), self.tickToSec(ev.offsetTicks || 0)); return; }
      var semis = ev.pitch - (c.def.base || 0);
      var d = Math.max(ev.lenTicks * self.secPerTick() * 0.95, 0.08);
      if (c.def.type === "sampler") self._playBuffer(octx, self.userBuffers[c.def.bufferId], time, out, semis, ev.vel);
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

  // ---- multitrack stem export: render each lane solo, package as a (store) ZIP ----
  Engine.prototype._stemName = function (label, i) { return ("0" + (i + 1)).slice(-2) + "_" + String(label || "track").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 24) + ".wav"; };
  Engine.prototype.renderStems = function (onProgress, onDone) {
    var self = this, defs = this.channelDefs.slice();
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
  var SCHEMA = 3;
  Engine.prototype.serialize = function () {
    var self = this;
    return {
      schema: SCHEMA,
      tempo: this.tempo, swing: this.swing, master: this.master ? this.master.gain.value : 0.9,
      activePattern: this.activePattern, focus: this.focus,
      channels: this.channelDefs.map(function (c) {
        var live = self.channels[c.id] || {};
        return { id: c.id, label: c.label, type: c.type, color: c.color, route: c.route,
                 base: c.base, tonal: c.tonal, sampleId: c.sampleId, bufferId: c.bufferId, userAudio: !!c.userAudio,
                 vol: live.vol != null ? live.vol : c.vol, pan: live.pan != null ? live.pan : c.pan,
                 muted: !!live.muted, solo: !!live.solo };
      }),
      banks: this.banks.map(function (bk) {
        var steps = {};
        for (var id in bk.steps) steps[id] = bk.steps[id].map(function (s) {
          return { on: s.on, vel: s.vel, pan: s.pan, pitch: s.pitch, len: s.len };
        });
        return { steps: steps, lengthBars: patLen(bk), notes: bk.notes.map(function (n) { return { ch: n.ch, pitch: n.pitch, start: n.start, len: n.len, vel: n.vel }; }) };
      }),
      inserts: Object.keys(this.inserts).map(function (k) {
        var ins = self.inserts[k];
        return { id: ins.def.id, vol: ins.vol, panVal: ins.panVal, mute: ins.mute, solo: ins.solo };
      }),
      timeline: { clips: this.timeline.clips, loop: this.timeline.loop, lengthTicks: this.timeline.lengthTicks, automation: this.timeline.automation }
    };
  };

  // rebuild engine state + FRESH audio nodes from saved params. Returns true on success.
  Engine.prototype.hydrate = function (data) {
    if (!data || data.schema !== SCHEMA) return false;   // schema mismatch -> caller boots empty
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
          return { on: !!s.on, vel: s.vel, pan: s.pan, pitch: s.pitch, len: s.len };
        });
        return p;
      });
      while (this.banks.length < 4) this.banks.push(blankPattern());
      // rebuild channels + fresh nodes
      (data.channels || []).forEach(function (c) {
        var def = { id: c.id, label: c.label, type: c.type, color: c.color, route: c.route,
                    vol: c.vol, pan: c.pan, tonal: c.tonal, base: c.base, sampleId: c.sampleId,
                    bufferId: c.bufferId || c.id, userAudio: !!c.userAudio };
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
        self.setInsertVol(s.id, s.vol); self.setInsertPan(s.id, s.panVal);
      });
      this.focus = data.focus && this.channels[data.focus] ? data.focus : (this.channelDefs[0] && this.channelDefs[0].id) || null;
      // restore linear-timeline clips (additive; absent in pre-timeline saves)
      if (data.timeline && data.timeline.clips) {
        this.timeline.clips = data.timeline.clips;
        if (data.timeline.loop) this.timeline.loop = data.timeline.loop;
        if (data.timeline.lengthTicks) this.timeline.lengthTicks = data.timeline.lengthTicks;
        this.timeline.automation = data.timeline.automation || {};
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
