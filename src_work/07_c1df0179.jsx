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
})();
