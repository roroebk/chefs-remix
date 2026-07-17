/* Chef's Remix v3 — Master Mixer: 16 insert strips, 8 FX slots, faders, meters,
 * + docked INSERT FX RACK editor panel (bypass / type dropdown / wet-dry). */
(function () {
  var h = React.createElement, useRef = React.useRef, useEffect = React.useEffect;
  var W = window.W, I = window.Icons;

  // live chromatic tuner ribbon driven by window.CR_PITCH[insId]
  function TunerRibbon(props) {
    var ref = useRef(null);
    useEffect(function () {
      var cv = ref.current; if (!cv) return; var ctx = cv.getContext("2d"); var raf;
      function resize() { var r = cv.getBoundingClientRect(); cv.width = Math.max(8, r.width * 2); cv.height = Math.max(8, r.height * 2); }
      resize();
      function draw() {
        if (cv.width < 8) resize();
        var Wd = cv.width, Hd = cv.height; ctx.clearRect(0, 0, Wd, Hd);
        var info = (window.CR_PITCH || {})[props.insId] || { note: -1, cents: 0, freq: 0 };
        var cw = Wd / 12; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold " + (Hd * 0.34) + "px Archivo, sans-serif";
        for (var i = 0; i < 12; i++) {
          var on = i === info.note;
          ctx.fillStyle = on ? "rgba(57,255,20,0.22)" : "rgba(255,255,255,0.03)"; ctx.fillRect(i * cw + 1, 3, cw - 2, Hd - 6);
          ctx.fillStyle = on ? "#39ff14" : "rgba(170,176,186,0.6)"; ctx.fillText(NOTES12[i], i * cw + cw / 2, Hd / 2);
        }
        if (info.note >= 0 && info.freq > 0) {
          var center = info.note * cw + cw / 2; var tx = center + Math.max(-1, Math.min(1, info.cents / 50)) * (cw / 2 - 2);
          ctx.fillStyle = "#ff8c2e"; ctx.fillRect(tx - 1.5, 1, 3, Hd - 2);
        }
        raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw); var ro = new ResizeObserver(resize); ro.observe(cv);
      return function () { cancelAnimationFrame(raf); ro.disconnect(); };
    }, [props.insId]);
    return h("canvas", { ref: ref, className: "tuner-ribbon" });
  }

  function PfKnob(props) {
    return h("div", { className: "pf-knob" },
      h(W.MicroKnob, { value: props.value, min: props.min, max: props.max, color: props.color || "#39ff14", onChange: props.onChange }),
      h("span", { className: "pf-klbl" }, props.label),
      h("span", { className: "pf-kval mono" }, props.fmt(props.value)));
  }

  var FXMETA = {
    bitcrush: { label: "Bitcrush", color: "#ff5cc8" }, filter: { label: "Filter", color: "#2ea6ff" },
    delay: { label: "Delay", color: "#b07bff" }, eq: { label: "EQ", color: "#39ff14" },
    comp: { label: "Comp", color: "#ffb338" }, reverb: { label: "Reverb", color: "#2ee6c8" },
    limiter: { label: "Limiter", color: "#ff5470" }, chorus: { label: "Chorus", color: "#6ad0ff" },
    pitchfix: { label: "Pitch Fix", color: "#39ff14" }
  };
  window.FXMETA = FXMETA;
  var FXOPTS = [["bitcrush", "Bitcrush"], ["eq", "Parametric EQ"], ["filter", "Filter"], ["comp", "Compressor"], ["delay", "Delay"], ["reverb", "Reverb"], ["chorus", "Chorus"], ["limiter", "Limiter"], ["pitchfix", "Pitch Fix (Auto-Tune)"]];
  var NOTES12 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var SCALEOPTS = [["chromatic", "Chromatic"], ["cmajor", "C Major"], ["aminor", "A Minor"]];

  function db(v) { if (v <= 0.001) return "-∞"; var d = 20 * Math.log10(v / 0.8); return (d >= 0 ? "+" : "") + d.toFixed(1); }

  function Strip(props) {
    var ins = props.ins;
    return h("div", { className: "strip" + (props.selected ? " sel" : ""), onClick: function () { props.onSelect(ins.id); } },
      h("div", { className: "strip-name", title: ins.name + " — insert M" + ("0" + ins.id).slice(-2) },
        h("span", null, ins.name),
        h("span", { className: "rc mono" }, "M" + ("0" + ins.id).slice(-2))),
      h("div", { className: "fx-stack" },
        ins.fx.map(function (s, i) {
          var meta = s.type ? FXMETA[s.type] : null;
          return h("div", {
            key: i, className: "fx-slot" + (s.type ? " filled" : "") + (s.bypass ? " bypass" : ""),
            style: meta ? { "--fxc": meta.color } : null,
            onClick: function (e) { e.stopPropagation(); props.onSelect(ins.id); props.onFxClick(ins.id, i); },
            title: meta ? meta.label + (s.bypass ? " (bypassed)" : "") : "Empty slot"
          }, meta ? [h("span", { className: "dot", key: 1 }), h("span", { className: "nm", key: 2 }, meta.label)] : h("span", { className: "nm", style: { color: "var(--faint)" } }, i + 1));
        })),
      h("div", { className: "strip-fader" },
        h("div", { className: "meter-pair" }, h(W.MeterBar, { id: ins.id, idx: 0 }), h(W.MeterBar, { id: ins.id, idx: 1 })),
        h(W.VFader, { value: ins.vol, onChange: function (v) { props.onVol(ins.id, v); } })),
      h("div", { className: "strip-foot" },
        h("div", { className: "db-read mono" }, db(ins.vol) + " dB"),
        h("div", { className: "pan-row" }, h(W.PanKnob, { value: ins.pan, onChange: function (v) { props.onPan(ins.id, v); } })),
        h("div", { className: "ms" },
          h("button", { className: "m" + (ins.mute ? " on" : ""), onClick: function (e) { e.stopPropagation(); props.onMute(ins.id); } }, "M"),
          h("button", { className: "s" + (ins.solo ? " on" : ""), onClick: function (e) { e.stopPropagation(); props.onSolo(ins.id); } }, "S"))));
  }

  function MasterStrip(props) {
    return h("div", { className: "strip master" },
      h("div", { className: "strip-name", style: { color: "var(--accent)" } }, "MASTER"),
      h("div", { className: "fx-stack" },
        h("div", { className: "fx-slot filled", style: { "--fxc": "#ff5470" } }, h("span", { className: "dot" }), h("span", { className: "nm" }, "Limiter")),
        h("div", { className: "fx-slot filled", style: { "--fxc": "#39ff14" } }, h("span", { className: "dot" }), h("span", { className: "nm" }, "Master EQ"))),
      h("div", { className: "strip-fader" },
        h("div", { className: "meter-pair" }, h(W.MeterBar, { master: true, idx: 0 }), h(W.MeterBar, { master: true, idx: 1 })),
        h(W.VFader, { value: props.master, onChange: props.onMasterVol })),
      h("div", { className: "strip-foot" },
        h("div", { className: "db-read mono", style: { color: "var(--accent)" } }, db(props.master) + " dB"),
        h("div", { className: "pan-row" }, h(W.PanKnob, { value: 0, onChange: function () { } }))));
  }

  // docked vertical FX editor for the selected insert
  function InsertFxRack(props) {
    var E = window.engine; var ins = E.inserts[props.selected]; if (!ins) return null;
    return h("div", { className: "ifx-rack" },
      h("div", { className: "ifx-head" },
        h("span", { className: "ifx-ttl" }, "INSERT FX RACK"),
        h("span", { className: "ifx-name mono" }, "M" + ("0" + props.selected).slice(-2) + " · " + ins.name)),
      h("div", { className: "ifx-slots" },
        ins.fx.map(function (s, i) {
          var meta = s.type ? FXMETA[s.type] : null; var mix = (s.params && s.params.mix != null) ? s.params.mix : 1;
          var lower;
          if (s.type === "pitchfix" && !s.bypass) {
            var pp = s.params;
            lower = h("div", { className: "ifx-pf" },
              h("div", { className: "ifx-pf-knobs" },
                h(PfKnob, { label: "RETUNE", value: pp.retune, min: 0, max: 100, color: "#39ff14", fmt: function (v) { return Math.round(v) + "ms"; }, onChange: function (v) { E.setFxParam(props.selected, i, "retune", v); props.onChange(); } }),
                h(PfKnob, { label: "CORRECT", value: pp.correction, min: 0, max: 1, color: "#2ea6ff", fmt: function (v) { return Math.round(v * 100) + "%"; }, onChange: function (v) { E.setFxParam(props.selected, i, "correction", v); props.onChange(); } }),
                h("div", { className: "pf-scale" },
                  h("span", { className: "pf-klbl" }, "SCALE"),
                  h("select", { className: "ifx-sel", value: pp.scale, onChange: function (e) { E.setFxParam(props.selected, i, "scale", e.target.value); props.onChange(); } },
                    SCALEOPTS.map(function (o) { return h("option", { key: o[0], value: o[0] }, o[1]); })))),
              h(TunerRibbon, { insId: props.selected }));
          } else {
            lower = h("div", { className: "ifx-wetrow" },
              h("span", { className: "ifx-wlbl" }, "DRY"),
              h("input", { className: "ifx-wet", type: "range", min: 0, max: 1, step: 0.01, disabled: !s.type, value: mix, onChange: function (e) { E.setFxParam(props.selected, i, "mix", parseFloat(e.target.value)); props.onChange(); } }),
              h("span", { className: "ifx-wlbl" }, "WET"),
              h("span", { className: "ifx-wval mono" }, s.type ? Math.round(mix * 100) + "%" : "—"));
          }
          return h("div", { key: i, className: "ifx-slot" + (s.type ? " filled" : "") + (s.bypass ? " byp" : "") + (s.type === "pitchfix" ? " pf" : ""), style: meta ? { "--fxc": meta.color } : null },
            h("div", { className: "ifx-row" },
              h("button", { className: "ifx-power" + (s.type && !s.bypass ? " on" : ""), disabled: !s.type, onClick: function () { if (s.type) { E.bypassFx(props.selected, i); props.onChange(); } }, title: s.bypass ? "Bypassed — click to enable" : "Active — click to bypass" }, h(I.Bolt, { width: 12, height: 12 })),
              h("span", { className: "ifx-num mono" }, i + 1),
              h("select", { className: "ifx-sel", value: s.type || "", onChange: function (e) { var v = e.target.value; if (!v) E.clearFxSlot(props.selected, i); else E.setFxSlot(props.selected, i, v); props.onChange(); } },
                h("option", { value: "" }, "— empty —"),
                FXOPTS.map(function (o) { return h("option", { key: o[0], value: o[0] }, o[1]); }))),
            lower);
        })));
  }

  // Phase 4/5: the focused-strip expanded view. Hosts the INSERT FX RACK for the currently
  // selected insert PLUS the relocated STEP MODULATION lanes (Velocity / Pitch / Pan / Release)
  // for the focused channel — the home the standalone TRACK FX panel used to provide. The two
  // are kept logically separate (insert effects vs. per-step note data) even in one container.
  function FocusStripView(props) {
    var E = window.engine, ch = props.focusCh;
    var route = ch ? ((E.channels[ch.id] && E.channels[ch.id].route) || ch.route) : null;
    var isStepCh = ch && !ch.audioLane && ch.type !== "audio";
    return h("div", { className: "focusview" },
      ch ? h("div", { className: "focusview-head" },
        h("span", { className: "fv-dot", style: { background: ch.color || "var(--accent)" } }),
        h("span", { className: "fv-name" }, ch.label),
        route ? h("span", { className: "fv-ins mono" }, "Track → M" + ("0" + route).slice(-2)) : null) : null,
      h(InsertFxRack, { selected: props.selected, onChange: props.onChange }),
      isStepCh ? h("div", { className: "fv-stepmod" },
        h("div", { className: "trackfx-modlbl" }, "STEP MODULATION · " + ch.label),
        window.GraphEditor ? h(window.GraphEditor, { ch: ch, pattern: props.pattern, rev: props.rev, playStep: props.playStep, onSet: props.onSetStep, embedded: true }) : null)
        : (ch ? h("div", { className: "fv-stepmod fv-audio" }, h("span", { className: "sub" }, "Audio lane — edit clips on the timeline (double-click a clip for the waveform editor).")) : null));
  }

  function Mixer(props) {
    var mxRef = useRef(null);
    // Phase 6: when the selected insert changes (a strip click, or a timeline track focused/
    // double-clicked which sets selected = that channel's route by id), scroll its strip into view.
    useEffect(function () {
      var cont = mxRef.current; if (!cont) return;
      var el = cont.querySelector(".strip.sel");
      if (el && el.scrollIntoView) { try { el.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" }); } catch (e) { el.scrollIntoView(); } }
    }, [props.selected]);
    return h("div", { className: "dash-mixer" },
      h("div", { className: "pane-head" },
        h("span", { className: "pt" }, "Mixer"),
        h("span", { className: "sub" }, props.inserts.length + " inserts · post-fader metering"),
        h("div", { className: "ph-act" }, h("span", { className: "sub mono" }, "M01–M16 · 00 = Master"))),
      h("div", { className: "mixer-body" },
        h("div", { className: "mixer", ref: mxRef },
          props.inserts.map(function (ins) {
            return h(Strip, { key: ins.id, ins: ins, selected: props.selected === ins.id, onSelect: props.onSelect, onVol: props.onVol, onPan: props.onPan, onMute: props.onMute, onSolo: props.onSolo, onFxClick: props.onFxClick });
          }),
          h(MasterStrip, { master: props.master, onMasterVol: props.onMasterVol })),
        h(FocusStripView, { selected: props.selected, focusCh: props.focusCh, pattern: props.pattern, rev: props.rev, playStep: props.playStep, onSetStep: props.onSetStep, onChange: props.onCommit })));
  }

  window.Mixer = Mixer;

  // ============================================================================
  // STUDIO RESTRUCTURE — single-track "Plugins" panel (window.StudioPlugins).
  // The dropdown-selected track's plugin chain renders as vertical expand/collapse blocks.
  // REAL controls act on live nodes (channel gain, engine.studioFx() 3-band EQ + Convolver
  // reverb, insert filt/comp/delay); values persist on def.pluginState (session-scoped).
  // STUB blocks (Pitch-Fix DSP / Saturation / Multiband / De-Esser / Spatial) render the full
  // param API + persist, visibly badged, and do NOT process audio (deferred to a later sprint).
  // ============================================================================
  var STUDIO_KEYS = NOTES12;
  var STUDIO_SCALES = [["chromatic", "Chromatic"], ["major", "Major"], ["minor", "Minor"], ["dorian", "Dorian"], ["mixolydian", "Mixolydian"]];
  var SCALE_PCS = { chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
  function isBacking(d) { return !!(d && (d.trackType === "backing" || d.backing || d.locked)); }
  function dbFmt(v) { return (v > 0 ? "+" : "") + v.toFixed(1) + "dB"; }
  function pctFmt(v) { return Math.round(v * 100) + "%"; }
  function hzFmt(v) { return v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "Hz"; }
  // snap a semitone offset to the nearest degree of the chosen scale (relative to key root)
  function nearestScale(semi, scale, keyRoot) {
    var pcs = SCALE_PCS[scale] || SCALE_PCS.chromatic;
    var kr = Math.max(0, STUDIO_KEYS.indexOf(keyRoot || "C"));
    var oct = Math.floor(semi / 12), pc = ((semi % 12) + 12) % 12;
    var best = pc, bestD = 99;
    pcs.forEach(function (x) { var a = (x + kr) % 12; var d = Math.min(Math.abs(a - pc), 12 - Math.abs(a - pc)); if (d < bestD) { bestD = d; best = a; } });
    return oct * 12 + best;
  }

  function RealKnob(props) {
    // click+drag (via W.RotaryKnob) AND mouse-wheel; numeric value shown under the dial + as a tooltip.
    function wheel(e) {
      // NOTE: React's onWheel is a passive listener — calling preventDefault() throws and aborts the
      // handler. We only stopPropagation (safe on passive) and adjust the value.
      if (props.onChange == null || props.disabled) return;
      e.stopPropagation();
      var min = props.min == null ? 0 : props.min, max = props.max == null ? 1 : props.max;
      var step = (max - min) * 0.03 * (e.deltaY < 0 ? 1 : -1);
      props.onChange(Math.max(min, Math.min(max, props.value + step)));
    }
    return h("div", { className: "dj-cell" + (props.disabled ? " off" : ""), onWheel: wheel, title: (props.label || "") + (props.fmt ? (" · " + props.fmt(props.value)) : "") },
      h("div", { className: "dj-knobwrap" },
        h(W.RotaryKnob, { value: props.value, min: props.min, max: props.max, size: 32, color: props.color || "var(--accent)", label: props.label, fmt: props.fmt, onChange: props.disabled ? function () {} : props.onChange })));
  }
  // compact vertical LED VU for a block header (reads window.CR_METER by insert id)
  function BlockVU(props) { return h("div", { className: "plg-bvu" }, h(W.MeterBar, { id: props.route, idx: 0 })); }
  // clip LED — lights red when the channel's post-fader level nears 0 dBFS
  function ClipLed(props) {
    var ref = useRef(null);
    useEffect(function () {
      var el = ref.current; if (!el) return; var raf;
      function tick() { var st = window.CR_METER || {}; var lvl = (st.inserts || {})[props.route] || 0; el.className = "plg-clip-led" + (lvl > 0.97 ? " clip" : lvl > 0.001 ? " lit" : ""); raf = requestAnimationFrame(tick); }
      raf = requestAnimationFrame(tick); return function () { cancelAnimationFrame(raf); };
    }, [props.route]);
    return h("span", { ref: ref, className: "plg-clip-led", title: "Clip indicator" });
  }

  // apply a track's persisted pluginState onto its live Web Audio nodes (real params only)
  function applyDelayTime(ins, div, bpm) {
    if (!ins) return; var q = 60 / Math.max(40, bpm || 140);
    var t = div === "1/4" ? q : div === "1/8" ? q / 2 : q / 4;
    try { ins.delay.delayTime.setTargetAtTime(Math.min(1.5, t), window.engine.ctx.currentTime, 0.01); } catch (e) { ins.delay.delayTime.value = Math.min(1.5, t); }
  }
  function applyStudioNodes(def, fx, ins, bpm) {
    if (!def || !def.pluginState) return; var E = window.engine, ps = def.pluginState;
    if (!E.channels[def.id]) return;
    try { E.setChannelVol(def.id, ps.inputGain); } catch (e) {}
    if (fx) { fx.low.gain.value = ps.eq.low; fx.mid.gain.value = ps.eq.mid; fx.high.gain.value = ps.eq.high; fx.wet.gain.value = ps.reverb.wet; try { E.setStudioReverbSize(def.id, ps.reverb.size); } catch (e2) {} }
    if (ins) { if (ps.eq.cutoff != null) ins.filt.frequency.value = ps.eq.cutoff; ins.comp.threshold.value = ps.compressor.threshold; ins.comp.ratio.value = ps.compressor.ratio; ins.fb.gain.value = ps.delay.fb; ins.wet.gain.value = ps.delay.mix; applyDelayTime(ins, ps.delay.div, bpm); }
  }

  // collapsible plugin block (console panel; optional per-block LED VU strip)
  function Block(props) {
    return h("div", { className: "plg-block" + (props.open ? " open" : " collapsed") + (props.wide ? " wide" : "") },
      h("div", { className: "plg-bhead", onClick: props.onToggle },
        h("span", { className: "plg-caret" }, props.open ? "▾" : "▸"),
        h("span", { className: "plg-btitle" }, props.title),
        props.badge ? h("span", { className: "plg-badge" }, props.badge) : null,
        (props.vu != null) ? h(BlockVU, { route: props.vu }) : null),
      props.open ? h("div", { className: "plg-bbody" + (props.disabled ? " disabled" : "") }, props.children) : null);
  }

  // interactive pitch-correction curve — domain-space {tick,pitch} points, projected at render.
  // Canvas draws grid + curve (linear|bezier); DOM handles are dragged. Points never store pixels.
  function PitchGraph(props) {
    var cref = useRef(null), boxRef = useRef(null);
    var pts = props.points || [];
    var WIN = 4 * 1920, LO = -24, HI = 24;                       // 4-bar window, ±2 octaves
    function tx(t) { return (t / WIN); }
    function ty(p) { return (HI - p) / (HI - LO); }
    function snapTick(t) { var s = props.triplet ? 80 : 120; return Math.round(t / s) * s; }   // 1/16 (or 1/16T when triplet)
    useEffect(function () {
      var cv = cref.current, box = boxRef.current; if (!cv || !box) return;
      var r = box.getBoundingClientRect(); cv.width = Math.max(8, r.width * 2); cv.height = Math.max(8, r.height * 2);
      var ctx = cv.getContext("2d"), Wd = cv.width, Hd = cv.height; ctx.clearRect(0, 0, Wd, Hd);
      ctx.strokeStyle = "rgba(123,92,255,0.14)"; ctx.lineWidth = 1;
      var sub = props.triplet ? 6 : 4;
      for (var b = 0; b <= 4 * sub; b++) { var x = (b / (4 * sub)) * Wd; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Hd); ctx.stroke(); }
      for (var s = LO; s <= HI; s += 6) { var y = ty(s) * Hd; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Wd, y); ctx.stroke(); }
      ctx.strokeStyle = "rgba(123,92,255,0.4)"; ctx.beginPath(); ctx.moveTo(0, ty(0) * Hd); ctx.lineTo(Wd, ty(0) * Hd); ctx.stroke();
      var sorted = pts.slice().sort(function (a, b2) { return a.tick - b2.tick; });
      if (sorted.length) {
        ctx.strokeStyle = "#c77dff"; ctx.lineWidth = 2; ctx.beginPath();
        sorted.forEach(function (pp, i) {
          var X = tx(pp.tick) * Wd, Y = ty(pp.pitch) * Hd;
          if (i === 0) { ctx.moveTo(X, Y); return; }
          if (props.interp === "bezier") { var pv = sorted[i - 1]; var PX = tx(pv.tick) * Wd, PY = ty(pv.pitch) * Hd, mx = (PX + X) / 2; ctx.bezierCurveTo(mx, PY, mx, Y, X, Y); }
          else ctx.lineTo(X, Y);
        });
        ctx.stroke();
      }
    }, [props.points, props.rev, props.interp, props.triplet]);
    function addPoint(e) {
      if (props.readOnly) return; if (e.target.getAttribute && e.target.getAttribute("data-h") != null) return;
      if (props.onEdit) props.onEdit();
      var box = boxRef.current.getBoundingClientRect();
      var t = snapTick(Math.max(0, Math.min(WIN, ((e.clientX - box.left) / box.width) * WIN)));
      var pitch = Math.round(HI - ((e.clientY - box.top) / box.height) * (HI - LO));
      var np = pts.concat([{ tick: t, pitch: Math.max(LO, Math.min(HI, pitch)), curve: props.interp || "linear" }]);
      props.onChange(np); if (props.onSelect) props.onSelect(np.length - 1);
    }
    function handleDown(i) { return function (e) { e.preventDefault(); e.stopPropagation(); if (props.onSelect) props.onSelect(i); if (props.readOnly) return; if (props.onEdit) props.onEdit();
      var box = boxRef.current.getBoundingClientRect();
      function mv(ev) { var t = snapTick(Math.max(0, Math.min(WIN, ((ev.clientX - box.left) / box.width) * WIN))); var pitch = Math.max(LO, Math.min(HI, Math.round(HI - ((ev.clientY - box.top) / box.height) * (HI - LO)))); props.onChange(pts.map(function (pp, idx) { return idx === i ? { tick: t, pitch: pitch, curve: pp.curve } : pp; })); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }; }
    function handleCtx(i) { return function (e) { e.preventDefault(); e.stopPropagation(); if (props.readOnly) return; if (props.onEdit) props.onEdit(); props.onChange(pts.filter(function (_, idx) { return idx !== i; })); if (props.onSelect) props.onSelect(-1); }; }
    return h("div", { className: "pitch-graph" + (props.readOnly ? " ro" : ""), ref: boxRef, onMouseDown: addPoint },
      h("canvas", { className: "pg-canvas", ref: cref }),
      pts.map(function (pp, i) { return h("div", { key: i, className: "pg-handle" + (props.selected === i ? " sel" : ""), "data-h": i, style: { left: (tx(pp.tick) * 100) + "%", top: (ty(pp.pitch) * 100) + "%" }, onMouseDown: handleDown(i), onContextMenu: handleCtx(i), title: "bar " + (pp.tick / 1920 + 1).toFixed(2) + " · " + (pp.pitch > 0 ? "+" : "") + pp.pitch + "st" }); }),
      pts.length ? null : h("span", { className: "pg-hint" }, "Click to add points · drag to move · right-click to delete"));
  }

  // Graph Mode editor: toolbar (interp / quantize / copy-paste / snapshot-undo) + PitchGraph + inspector
  function GraphEditor(props) {
    var pf = props.pf, backing = props.backing, put = props.put, g = pf.graph;
    var selS = React.useState(-1); var sel = selS[0], setSel = selS[1];
    var snapRef = useRef(null);                                  // one-level session snapshot for undo
    function setPts(np) { put(function () { g.points = np; }); }
    function snapshot() { snapRef.current = g.points.map(function (p) { return { tick: p.tick, pitch: p.pitch, curve: p.curve }; }); }
    var pt = (sel >= 0 && g.points[sel]) ? g.points[sel] : null;
    return h("div", { className: "pg-wrap" },
      h("div", { className: "pg-toolbar" },
        h("button", { className: "plg-tgl" + (g.interp === "bezier" ? " on" : ""), disabled: backing, onClick: function () { put(function () { g.interp = g.interp === "bezier" ? "linear" : "bezier"; }); }, title: "Interpolation between points" }, g.interp === "bezier" ? "Bezier" : "Linear"),
        h("button", { className: "plg-tgl", disabled: backing, onClick: function () { snapshot(); setPts(g.points.map(function (p) { return { tick: p.tick, pitch: Math.round(p.pitch), curve: p.curve }; })); }, title: "Round every point to the nearest semitone" }, "Quantize ½"),
        h("button", { className: "plg-tgl", disabled: backing, onClick: function () { snapshot(); setPts(g.points.map(function (p) { return { tick: p.tick, pitch: nearestScale(Math.round(p.pitch), pf.params.scale, pf.params.key), curve: p.curve }; })); }, title: "Snap every point to the selected scale" }, "Quantize Scale"),
        h("button", { className: "plg-tgl", disabled: backing || !g.points.length, onClick: function () { window.__pgClip = g.points.map(function (p) { return { tick: p.tick, pitch: p.pitch, curve: p.curve }; }); }, title: "Copy all points to the session clipboard" }, "Copy"),
        h("button", { className: "plg-tgl", disabled: backing || !window.__pgClip, onClick: function () { if (!window.__pgClip) return; snapshot(); setPts(window.__pgClip.map(function (p) { return { tick: p.tick, pitch: p.pitch, curve: p.curve }; })); }, title: "Paste points from the session clipboard" }, "Paste"),
        h("button", { className: "plg-tgl", disabled: backing || !snapRef.current, onClick: function () { if (snapRef.current) { setPts(snapRef.current); snapRef.current = null; setSel(-1); } }, title: "Undo the last graph edit (one level)" }, "↶ Undo"),
        h("button", { className: "plg-tgl", disabled: backing || !g.points.length, onClick: function () { snapshot(); setPts([]); setSel(-1); }, title: "Remove all points" }, "Clear"),
        h("span", { className: "plg-graphcount mono" }, g.points.length + " pts")),
      h(PitchGraph, { points: g.points, interp: g.interp, rev: props.rev, triplet: props.triplet, readOnly: backing, selected: sel, onSelect: setSel, onEdit: snapshot, onChange: setPts }),
      pt
        ? h("div", { className: "pg-inspector" },
            h("span", { className: "pg-inslbl" }, "POINT"),
            h("label", null, "tick ", h("input", { className: "pg-insinp mono", type: "number", step: 10, value: pt.tick, disabled: backing, onChange: function (e) { var t = Math.max(0, parseInt(e.target.value, 10) || 0); setPts(g.points.map(function (p, i) { return i === sel ? { tick: t, pitch: p.pitch, curve: p.curve } : p; })); } })),
            h("label", null, "pitch ", h("input", { className: "pg-insinp mono", type: "number", step: 1, value: pt.pitch, disabled: backing, onChange: function (e) { var pv = parseFloat(e.target.value) || 0; setPts(g.points.map(function (p, i) { return i === sel ? { tick: p.tick, pitch: pv, curve: p.curve } : p; })); } }), " st"),
            h("button", { className: "plg-tgl", disabled: backing, onClick: function () { snapshot(); setPts(g.points.filter(function (_, i) { return i !== sel; })); setSel(-1); } }, "Delete pt"))
        : h("div", { className: "pg-inspector muted" }, "Graph Mode — draw or drag points; saved to track state. DSP applies in a later sprint."));
  }

  function StudioPlugins(props) {
    var E = window.engine, tracks = props.tracks || [];
    var selDef = null; for (var i = 0; i < tracks.length; i++) { if (tracks[i].id === props.selected) selDef = tracks[i]; }
    if (!selDef) selDef = tracks[0] || null;
    var chId = selDef ? selDef.id : null;
    var backing = isBacking(selDef);
    var live = chId ? E.channels[chId] : null;
    var route = live ? live.route : (selDef ? selDef.route : 0);
    var ins = chId ? E.inserts[route] : null;
    var ps = selDef ? selDef.pluginState : null;
    var fxRef = useRef(null);
    var ddS = React.useState(false); var ddOpen = ddS[0], setDdOpen = ddS[1];
    var goS = React.useState(false); var graphOpen = goS[0], setGraphOpen = goS[1];   // Graph Mode full-panel overlay

    // on track switch: build the DSP chain (non-backing) and push persisted params onto the nodes
    useEffect(function () {
      setGraphOpen(false);
      if (!chId || backing) { fxRef.current = null; return; }
      var fx = E.studioFx(chId); fxRef.current = fx;
      applyStudioNodes(selDef, fx, ins, props.bpm);
    }, [chId]);
    useEffect(function () { if (chId && !backing && ins && ps) applyDelayTime(ins, ps.delay.div, props.bpm); }, [ps ? ps.delay.div : null, props.bpm, chId]);

    function commit() { if (props.commit) props.commit(); }
    // write a persisted param + optionally apply to a live node, then re-render
    function put(fn, apply) { if (backing) return; fn(); if (apply && fxRef.current !== undefined) apply(); commit(); }
    // no-scroll DJ-pad grid: every module is always expanded (no collapse); layout is a flex-wrap grid.
    function isOpen() { return true; }
    function toggle() {}

    // ---- header (dropdown = single authority for plugin focus AND record target) ----
    var header = h("div", { className: "plg-head" },
      h("span", { className: "pt" }, "Plugins"),
      h("div", { className: "plg-headright" },
        selDef ? h("span", { className: "plg-status" + (selDef.uiMuted ? " muted" : "") }, selDef.uiMuted ? "MUTED" : backing ? "READ ONLY" : "EDIT") : null,
        h("div", { className: "plg-dropdown" },
          h("button", { className: "plg-dd-btn", onClick: function () { setDdOpen(!ddOpen); } }, selDef ? (selDef.label + " · " + (backing ? "PROJECT" : "AUDIO")) : "No track", h("span", { className: "plg-dd-car" }, " ▾")),
          // M/✕ consolidated to the left TRACKS list — the dropdown only selects the track for the panel.
          ddOpen ? h("div", { className: "plg-dd-list" },
            tracks.length ? tracks.map(function (t) {
              var tb = isBacking(t);
              return h("div", { key: t.id, className: "plg-dd-row" + (t.id === chId ? " sel" : ""), onClick: function () { props.onSelect(t.id, true); setDdOpen(false); } },
                h("span", { className: "plg-dd-name" }, tb ? "🔒 " : "", t.label, h("span", { className: "plg-dd-type" }, tb ? "PROJECT" : "AUDIO")));
            }) : h("div", { className: "plg-dd-empty" }, "No tracks")) : null)));

    if (!selDef) return h("div", { className: "plugins-panel empty" }, header, h("div", { className: "plg-empty" }, "No track selected — Add Producer Track or Add Track to load a plugin chain."));

    var pf = ps.pitchFix;
    function dbOfGain(g) { return g <= 0.001 ? "-∞ dB" : ((20 * Math.log10(g) >= 0 ? "+" : "") + (20 * Math.log10(g)).toFixed(1) + " dB"); }
    var body = h("div", { className: "plg-body plg-grid" },
      backing ? h("div", { className: "plg-ro-note" }, "PROJECT — BACKING (READ ONLY) · Rendered mixdown; FX are baked in.",
        props.onReplace ? h("button", { className: "plg-tgl", disabled: props.bouncing, onClick: function () { props.onReplace(chId); }, title: "Re-bounce the current arrangement into this backing track" }, "↻ Replace backing") : null) : null,
      // Input Stage — Input Gain + dB readout + clip LED
      h(Block, { title: "Input Stage", open: isOpen("gain"), onToggle: function () { toggle("gain"); }, disabled: backing, vu: route },
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "GAIN", value: ps.inputGain, min: 0, max: 1.5, color: "#e0aaff", disabled: backing, fmt: function (v) { return Math.round(v * 100) + "%"; }, onChange: function (v) { put(function () { ps.inputGain = v; }, function () { try { E.setChannelVol(chId, v); } catch (e) {} }); } }),
          h("div", { className: "plg-inputmeta" },
            h("span", { className: "plg-dbread mono" }, dbOfGain(ps.inputGain)),
            h("div", { className: "plg-cliprow" }, h(ClipLed, { route: route }), h("span", { className: "plg-cliplbl" }, "CLIP"))))),
      // Pitch Fix (Auto | Graph) — Graph opens as a full-panel overlay (a pitch canvas can't share a grid cell)
      h(Block, { title: "Pitch Fix", open: isOpen("pitch"), onToggle: function () { toggle("pitch"); }, badge: "DSP pending", disabled: backing, wide: true },
        h("div", { className: "plg-seg" },
          ["auto", "graph"].map(function (m) { return h("button", { key: m, className: "plg-segbtn" + (pf.mode === m ? " on" : ""), disabled: backing, onClick: function () { put(function () { pf.mode = m; }); if (m === "graph") setGraphOpen(true); } }, m === "auto" ? "Auto" : "Graph"); })),
        pf.mode === "auto"
          ? h("div", null,
              h("div", { className: "dj-row" },
                h(RealKnob, { label: "RETUNE", value: pf.params.retuneSpeed, min: 0, max: 100, color: "#9d4edd", disabled: backing, fmt: function (v) { return Math.round(v) + "ms"; }, onChange: function (v) { put(function () { pf.params.retuneSpeed = v; }); } }),
                h(RealKnob, { label: "TIGHTEN", value: pf.params.tightness, min: 0, max: 1, color: "#9d4edd", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { pf.params.tightness = v; }); } })),
              h("div", { className: "key-scale" },
                h("select", { className: "ks-sel", value: pf.params.key, disabled: backing, onChange: function (e) { put(function () { pf.params.key = e.target.value; }); } }, STUDIO_KEYS.map(function (k) { return h("option", { key: k, value: k }, k); })),
                h("select", { className: "ks-sel", value: pf.params.scale, disabled: backing, onChange: function (e) { put(function () { pf.params.scale = e.target.value; }); } }, STUDIO_SCALES.map(function (s) { return h("option", { key: s[0], value: s[0] }, s[1]); }))))
          : h("button", { className: "plg-tgl plg-graph-open", disabled: backing, onClick: function () { setGraphOpen(true); }, title: "Open the pitch-correction graph editor" }, "✎ Edit Graph · " + pf.graph.points.length + " pts")),
      // Saturation / Drive (stub)
      h(Block, { title: "Saturation / Drive", open: isOpen("saturation", false), onToggle: function () { toggle("saturation", false); }, badge: "DSP pending", disabled: backing },
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "DRIVE", value: ps.saturation.drive, min: 0, max: 1, color: "#5a4a7a", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.saturation.drive = v; }); } }),
          h(RealKnob, { label: "MIX", value: ps.saturation.mix, min: 0, max: 1, color: "#5a4a7a", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.saturation.mix = v; }); } }))),
      // 3-Band EQ (real; baked 80 Hz HPF on the Low band)
      h(Block, { title: "3-Band EQ", open: isOpen("eq"), onToggle: function () { toggle("eq"); }, disabled: backing, vu: route, wide: true },
        h("div", { className: "plg-hpf" }, "HPF 80Hz (baked)"),
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "LOW", value: ps.eq.low, min: -18, max: 18, disabled: backing, fmt: dbFmt, onChange: function (v) { put(function () { ps.eq.low = v; }, function () { if (fxRef.current) fxRef.current.low.gain.value = v; }); } }),
          h(RealKnob, { label: "MID", value: ps.eq.mid, min: -18, max: 18, disabled: backing, fmt: dbFmt, onChange: function (v) { put(function () { ps.eq.mid = v; }, function () { if (fxRef.current) fxRef.current.mid.gain.value = v; }); } }),
          h(RealKnob, { label: "HIGH", value: ps.eq.high, min: -18, max: 18, disabled: backing, fmt: dbFmt, onChange: function (v) { put(function () { ps.eq.high = v; }, function () { if (fxRef.current) fxRef.current.high.gain.value = v; }); } }),
          h(RealKnob, { label: "CUTOFF", value: ps.eq.cutoff, min: 80, max: 20000, color: "#7b5cff", disabled: backing, fmt: hzFmt, onChange: function (v) { put(function () { ps.eq.cutoff = v; }, function () { if (ins) ins.filt.frequency.value = v; }); } }))),
      // Multi-Band Compressor (Threshold + Ratio real; Makeup persisted; multiband stub)
      h(Block, { title: "Multi-Band Compressor", open: isOpen("comp"), onToggle: function () { toggle("comp"); }, badge: "Multiband: DSP pending", disabled: backing, vu: route },
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "THRESH", value: ps.compressor.threshold, min: -60, max: 0, color: "#a78bfa", disabled: backing, fmt: function (v) { return Math.round(v) + "dB"; }, onChange: function (v) { put(function () { ps.compressor.threshold = v; }, function () { if (ins) ins.comp.threshold.value = v; }); } }),
          h(RealKnob, { label: "RATIO", value: ps.compressor.ratio, min: 1, max: 20, color: "#a78bfa", disabled: backing, fmt: function (v) { return v.toFixed(1) + ":1"; }, onChange: function (v) { put(function () { ps.compressor.ratio = v; }, function () { if (ins) ins.comp.ratio.value = v; }); } }),
          h(RealKnob, { label: "MAKEUP", value: ps.compressor.makeup, min: 0, max: 12, color: "#5a4a7a", disabled: backing, fmt: function (v) { return "+" + v.toFixed(1) + "dB"; }, onChange: function (v) { put(function () { ps.compressor.makeup = v; }); } })),
        h("button", { className: "plg-tgl" + (ps.compressor.multiband ? " on" : ""), disabled: backing, onClick: function () { put(function () { ps.compressor.multiband = !ps.compressor.multiband; }); } }, ps.compressor.multiband ? "Multiband ON" : "Multiband OFF")),
      // De-Esser (stub)
      h(Block, { title: "De-Esser", open: isOpen("deesser", false), onToggle: function () { toggle("deesser", false); }, badge: "DSP pending", disabled: backing },
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "AMOUNT", value: ps.deesser.amount, min: 0, max: 1, color: "#5a4a7a", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.deesser.amount = v; }); } }),
          h(RealKnob, { label: "FREQ", value: ps.deesser.freq, min: 2000, max: 12000, color: "#5a4a7a", disabled: backing, fmt: hzFmt, onChange: function (v) { put(function () { ps.deesser.freq = v; }); } }))),
      // Spatial FX (REAL — Convolver reverb Size/Wet + Width)
      h(Block, { title: "Spatial FX", open: isOpen("spatial", false), onToggle: function () { toggle("spatial", false); }, disabled: backing, vu: route },
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "SIZE", value: ps.reverb.size, min: 0.3, max: 5, color: "#9d4edd", disabled: backing, fmt: function (v) { return v.toFixed(1) + "s"; }, onChange: function (v) { put(function () { ps.reverb.size = v; }, function () { try { E.setStudioReverbSize(chId, v); } catch (e) {} }); } }),
          h(RealKnob, { label: "WET", value: ps.reverb.wet, min: 0, max: 0.6, color: "#9d4edd", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.reverb.wet = v; }, function () { if (fxRef.current) fxRef.current.wet.gain.value = v; }); } }),
          h(RealKnob, { label: "WIDTH", value: ps.spatial.width, min: 0, max: 1, color: "#5a4a7a", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.spatial.width = v; }); } }))),
      // Tempo-Synced Delay (real)
      h(Block, { title: "Tempo-Synced Delay", open: isOpen("delay", false), onToggle: function () { toggle("delay", false); }, disabled: backing, vu: route, wide: true },
        h("div", { className: "dj-divsel" }, ["1/4", "1/8", "1/16"].map(function (d) {
          var q = 60 / Math.max(40, props.bpm || 140), tms = Math.round((d === "1/4" ? q : d === "1/8" ? q / 2 : q / 4) * 1000);
          return h("button", { key: d, className: "dj-div" + (ps.delay.div === d ? " on" : ""), disabled: backing, title: tms + " ms", onClick: function () { put(function () { ps.delay.div = d; }, function () { if (ins) applyDelayTime(ins, d, props.bpm); }); } }, d);
        })),
        h("span", { className: "plg-delayread mono" }, (function () { var q = 60 / Math.max(40, props.bpm || 140), div = ps.delay.div, sec = div === "1/4" ? q : div === "1/8" ? q / 2 : q / 4; return Math.round(sec * 1000) + " ms · " + div + " (ping-pong)"; })()),
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "FDBK", value: ps.delay.fb, min: 0, max: 0.9, color: "#c77dff", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.delay.fb = v; }, function () { if (ins) ins.fb.gain.value = v; }); } }),
          h(RealKnob, { label: "WET", value: ps.delay.mix, min: 0, max: 1, color: "#c77dff", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.delay.mix = v; }, function () { if (ins) ins.wet.gain.value = v; }); } }))),
      // Master Send / Routing (real — insert route + output level)
      h(Block, { title: "Master Send / Routing", open: isOpen("master", false), onToggle: function () { toggle("master", false); }, disabled: backing, vu: route, wide: true },
        h("div", { className: "plg-route" },
          h("span", { className: "plg-routelbl" }, "OUTPUT INSERT"),
          h("select", { className: "ks-sel", value: route, disabled: backing, onChange: function (e) {
            var nr = parseInt(e.target.value, 10);
            put(function () { ps.routing.route = nr; }, function () {
              var c = E.channels[chId]; if (!c) return; c.route = nr; c.def.route = nr;
              if (c._studio) { try { c._studio.out.disconnect(); } catch (e2) {} c._studio.out.connect(E._insertInput(nr, chId)); }
              else { try { E.setRoute(chId, nr); } catch (e3) {} }
            });
          } }, E.insertDefs.map(function (d) { return h("option", { key: d.id, value: d.id }, "M" + ("0" + d.id).slice(-2) + " · " + d.name); }))),
        h("div", { className: "dj-row" },
          h(RealKnob, { label: "OUTPUT", value: ins ? ins.vol : (ps.routing.output || 0.8), min: 0, max: 1.1, color: "#e0aaff", disabled: backing, fmt: pctFmt, onChange: function (v) { put(function () { ps.routing.output = v; }, function () { try { E.setInsertVol(route, v); } catch (e) {} }); } }))));

    // Graph Mode full-panel overlay (within the Plugins bounds) with a Back control; grid restores on close.
    var graphOverlay = (graphOpen && !backing) ? h("div", { className: "plg-graph-overlay" },
      h("div", { className: "plg-graph-obar" },
        h("button", { className: "plg-graph-back", onClick: function () { setGraphOpen(false); } }, "← Back"),
        h("span", { className: "plg-graph-ottl" }, "Pitch Graph — draw pitch corrections"),
        h("span", { className: "plg-badge" }, "DSP pending")),
      h(GraphEditor, { pf: pf, rev: props.rev, backing: backing, put: put, triplet: props.triplet })) : null;

    return h("div", { className: "plugins-panel" + (backing ? " ro" : "") }, header,
      h("div", { className: "plg-vu" }, h(W.MeterBar, { id: route, idx: 0 }), h(W.MeterBar, { id: route, idx: 1 })),
      body, graphOverlay);
  }

  window.StudioPlugins = StudioPlugins;
  // exposed so the App's Save/Export restore can push a track's pluginState onto its live nodes
  window.__studioApply = function (def) { var E = window.engine, ch = E.channels[def.id]; if (!ch) return; var fx = isBacking(def) ? null : E.studioFx(def.id); applyStudioNodes(def, fx, E.inserts[(ch && ch.route) || def.route], E.tempo); };
})();
