/* Chef's Remix v3 — NEON_GRID — app shell, wiring, demo project, tweaks */
(function () {
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
  var E = window.engine, I = window.Icons, W = window.W, FXMETA = window.FXMETA;
  // musical-typing map: physical key code -> semitone offset from the focused channel's root
  var KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15 };

  var TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "gridScale": "default",
    "meterFps": "60",
    "glow": 1,
    "beatContrast": 1
  }/*EDITMODE-END*/;

  function useToasts() { var s = useState([]); function push(m, ic) { var id = Date.now() + Math.random(); s[1](function (x) { return x.concat([{ id: id, m: m, ic: ic }]); }); setTimeout(function () { s[1](function (x) { return x.filter(function (y) { return y.id !== id; }); }); }, 2600); } return [s[0], push]; }

  // ---------- FX editor modal ----------
  var FXTYPES = ["bitcrush", "filter", "delay", "eq", "comp", "reverb", "limiter", "chorus", "pitchfix"];
  var FXPARAMS = {
    bitcrush: [["bits", "Bits", 1, 12, 1], ["mix", "Mix", 0, 1, 0.01]],
    filter: [["freq", "Freq", 80, 16000, 10], ["q", "Reso", 0.3, 18, 0.1]],
    delay: [["time", "Time", 0.02, 0.8, 0.01], ["fb", "Feedback", 0, 0.85, 0.01], ["wet", "Wet", 0, 0.8, 0.01]],
    eq: [["low", "Low", -12, 12, 0.5], ["mid", "Mid", -12, 12, 0.5], ["high", "High", -12, 12, 0.5]],
    comp: [["thr", "Thresh", -48, 0, 1], ["ratio", "Ratio", 1, 16, 0.5], ["makeup", "Makeup", 0, 12, 0.5]],
    reverb: [["size", "Size", 0, 1, 0.01], ["wet", "Wet", 0, 0.8, 0.01], ["mix", "Dry/Wet", 0, 1, 0.01]],
    limiter: [["ceil", "Ceiling", -6, 0, 0.1]],
    chorus: [["rate", "Rate", 0.1, 8, 0.1], ["depth", "Depth", 0, 1, 0.01], ["mix", "Dry/Wet", 0, 1, 0.01]],
    pitchfix: [["retune", "Retune", 0, 100, 1], ["correction", "Correct", 0, 1, 0.01]]
  };
  function FXModal(props) {
    var ins = E.inserts[props.id]; var slot = ins.fx[props.slot]; var rs = useState(0); var bump = function () { rs[1](function (x) { return x + 1; }); };
    var meta = slot.type ? FXMETA[slot.type] : null;
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "modal", style: { width: 420 } },
        h("div", { className: "modal-head" },
          h("div", { className: "mi", style: meta ? { background: "color-mix(in srgb," + meta.color + " 18%, var(--surface-3))", color: meta.color } : null }, h(I.Bolt, null)),
          h("h3", null, ins.name + " · Slot " + (props.slot + 1)),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose }, h(I.X, { width: 16, height: 16 }))),
        h("div", { className: "modal-body" },
          props.clip ? h("div", { className: "fx-clipbar" },
            h("span", { className: "fx-clipbar-lbl" }, "Per-clip FX · ", h("b", null, props.clip.fx ? "bound to clip" : "shared with track")),
            h("button", { className: "mini-btn", title: "Snapshot this insert's full rack onto the clip", onClick: function () { props.clip.fx = E.getInsertFx(props.id); bump(); props.commit && props.commit(); } }, "Bind current FX → clip"),
            props.clip.fx ? h("button", { className: "mini-btn", title: "Drop the snapshot; clip reverts to the shared track chain", onClick: function () { delete props.clip.fx; bump(); props.commit && props.commit(); } }, "Unbind") : null) : null,
          h("div", { className: "fx-typegrid" },
            FXTYPES.map(function (t) { return h("button", { key: t, className: slot.type === t ? "on" : "", onClick: function () { E.setFxSlot(props.id, props.slot, t); bump(); props.commit(); } }, FXMETA[t].label); })),
          slot.type ? h("div", { style: { marginTop: 4 } },
            h("div", { style: { display: "flex", gap: 8, marginBottom: 6 } },
              h("button", { className: "mini-btn", onClick: function () { E.bypassFx(props.id, props.slot); bump(); props.commit(); } }, slot.bypass ? "Bypassed" : "Active"),
              h("button", { className: "mini-btn", onClick: function () { E.clearFxSlot(props.id, props.slot); bump(); props.commit(); props.onClose(); } }, [h(I.Trash, { width: 13, height: 13, key: 1 }), " Remove"])),
            h("div", { className: "fx-knobs" }, (FXPARAMS[slot.type] || []).map(function (p) {
              var v = slot.params[p[0]];
              var isInt = p[4] >= 1;
              return h(W.RotaryKnob, {
                key: p[0], label: p[1], value: v, min: p[2], max: p[3], size: 54,
                color: meta ? meta.color : "var(--accent)",
                fmt: function (val) { return isInt ? String(Math.round(val)) : Number(val).toFixed(2); },
                onChange: function (val) { E.setFxParam(props.id, props.slot, p[0], isInt ? Math.round(val) : val); bump(); }
              });
            }))) : h("p", { style: { color: "var(--dim)", fontSize: 12, marginTop: 8 } }, "Select a plugin to load into this insert slot.")),
        h("div", { className: "modal-foot" }, h("button", { className: "btn primary", onClick: props.onClose }, "Done"))));
  }

  // ---------- transport ----------
  function Transport(props) {
    return h("div", { className: "transport" },
      h("div", { className: "brand" }, h("div", { className: "logo" }, h(I.Logo, { width: 22, height: 22 })),
        h("div", null, h("h1", null, "CHEF'S REMIX"), h("div", { className: "proj" }, "NEON_GRID_V3_PROD"))),
      h("div", { className: "t-group" },
        h("button", { className: "tbtn play" + (props.playing ? " on" : ""), onClick: props.onPlay }, props.playing ? h(I.Stop, null) : h(I.Play, null)),
        h("button", { className: "tbtn", onClick: props.onStop, title: "Stop" }, h(I.Stop, { width: 16, height: 16 })),
        h("button", { className: "tbtn rec", title: "Record (armed)" }, h(I.Rec, { width: 14, height: 14 }))),
      h("div", { className: "t-group" },
        h("div", { className: "readout clock" }, h("span", { className: "lbl" }, "Position"), h("span", { className: "val mono" }, props.pos))),
      h("div", { className: "t-group" },
        h("div", { className: "readout" }, h("span", { className: "lbl" }, "Tempo"),
          h("span", { className: "val mono", style: { cursor: "ns-resize" }, onMouseDown: W.useVDrag(function () { return props.bpm; }, function (v) { props.onBpm(Math.round(v)); }, { min: 40, max: 240, sens: 0.004 }) }, props.bpm, h("span", { className: "u" }, "BPM")))),
      h("div", { className: "t-group" },
        h("div", { className: "knob-wrap" }, h("span", { className: "lbl", style: { writingMode: "horizontal-tb" } }, "SWING"),
          h("input", { className: "slider swing-mini", type: "range", min: 0, max: 1, step: 0.01, value: props.swing, onChange: function (e) { props.onSwing(parseFloat(e.target.value)); } }),
          h("span", { className: "mono", style: { fontSize: 12, color: "var(--accent)", width: 34 } }, Math.round(props.swing * 100) + "%"))),
      h("div", { className: "t-group spectrum-wrap" }, h(W.SpectrumAnalyzer, null)),
      h("button", { className: "btn", onClick: props.onExport }, [h(I.Download, { width: 16, height: 16, key: 1 }), "Export"]));
  }

  // ---------- export modal ----------
  // ---------- render / export modal (OfflineAudioContext mixdown) ----------
  function RenderModal(props) {
    var ph = useState("idle"); var phase = ph[0], setPhase = ph[1];
    var pg = useState(0); var prog = pg[0], setProg = pg[1];
    var wt = useState("mix"); var what = wt[0], setWhat = wt[1];
    function dl(blob, name) { var u = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 800); }
    function render() {
      setWhat("mix"); setPhase("rendering"); setProg(0);
      if (E.isPlaying) { E.pause(); props.onStopped && props.onStopped(); }
      E.renderMixdown(function (p) { setProg(p); }, function (blob) {
        if (!blob) { setPhase("error"); props.toast("Render failed", h(I.X, null)); return; }
        setProg(1); setPhase("done"); dl(blob, "chefs-remix-mix.wav"); props.toast("Mixdown exported · chefs-remix-mix.wav", h(I.Check, null));
      });
    }
    function renderStems() {
      setWhat("stems"); setPhase("rendering"); setProg(0);
      if (E.isPlaying) { E.pause(); props.onStopped && props.onStopped(); }
      E.renderStems(function (p) { setProg(p); }, function (zip) {
        if (!zip) { setPhase("error"); props.toast("No tracks to export as stems", h(I.X, null)); return; }
        setProg(1); setPhase("done"); dl(zip, "chefs-remix-stems.zip"); props.toast("Stems exported · chefs-remix-stems.zip", h(I.Check, null));
      });
    }
    function saveProjectJson() { dl(new Blob([JSON.stringify(E.serialize(), null, 2)], { type: "application/json" }), "chefs-remix-project.json"); props.toast("Project saved · chefs-remix-project.json", h(I.Check, null)); props.onClose(); }
    var rendering = phase === "rendering" || phase === "done";
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget && phase !== "rendering") props.onClose(); } },
      h("div", { className: "modal", style: { width: 460 } },
        h("div", { className: "modal-head" }, h("div", { className: "mi" }, h(I.Download, null)), h("h3", null, "Export Mixdown"),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose, disabled: phase === "rendering" }, h(I.X, { width: 16, height: 16 }))),
        h("div", { className: "modal-body" },
          rendering
            ? h("div", { className: "render-box" },
                h("div", { className: "render-title mono" }, phase === "done" ? (what === "stems" ? "STEMS COMPLETE" : "MIXDOWN COMPLETE") : (what === "stems" ? "RENDERING STEMS (ZIP)…" : "RENDERING MIXDOWN (WAV)…")),
                h("div", { className: "render-bar" }, h("div", { className: "render-fill", style: { width: Math.round(prog * 100) + "%" } })),
                h("div", { className: "render-sub mono" }, Math.round(prog * 100) + "%  ·  " + (((E.ctx && E.ctx.sampleRate) || 44100) / 1000).toFixed(1) + " kHz · 16-bit" + (what === "stems" ? " · per-track WAV" : " stereo")))
            : h("div", null,
                h("p", { style: { fontSize: 12, color: "var(--dim)", lineHeight: 1.5, marginBottom: 14 } }, "Bounce the arrangement through an OfflineAudioContext — the full master mix, or each track as a separate WAV zipped for your studio."),
                h("div", { className: "eopt-row" },
                  h("button", { className: "btn primary", style: { flex: 1, justifyContent: "center", height: 44 }, onClick: render }, [h(I.Wave, { width: 16, height: 16, key: 1 }), "Master Mix (WAV)"]),
                  h("button", { className: "btn", style: { flex: 1, justifyContent: "center", height: 44 }, onClick: renderStems }, [h(I.Layers, { width: 16, height: 16, key: 1 }), "Stems (ZIP)"]),
                  h("button", { className: "btn ghost", style: { height: 44 }, onClick: saveProjectJson }, [h(I.Book, { width: 15, height: 15, key: 1 }), "Save Project (.json)"])))),
        phase === "done" ? h("div", { className: "modal-foot" }, h("button", { className: "btn primary", onClick: props.onClose }, "Done")) : null));
  }

  // ---------- studio deployment gateway (splash) ----------
  // Full-viewport cinematic gate. The "Deploy Studio" gesture unlocks the Web Audio
  // context (init is idempotent; resume() satisfies the browser user-gesture rule),
  // then fades out to reveal the DAW. Core scheduler / routing are untouched.
  function Splash(props) {
    var ref = useRef(null);
    function launch() {
      try { E.init(); E.resume(); } catch (e) { /* context already live */ }
      var el = ref.current;
      if (el) el.classList.add("closing");
      setTimeout(props.onLaunch, 620);
    }
    var bars = [];
    for (var i = 0; i < 11; i++) bars.push(h("i", { key: i, style: { animationDelay: (i * 0.08) + "s" } }));
    var rows = [
      ["System Check", "OK"], ["Web Audio Engine", "Ready"],
      ["Sample Buffers · 16 Tracks", "Loaded"], ["Look-Ahead Scheduler", "Armed"]
    ];
    return h("div", { className: "splash", ref: ref },
      h("div", { className: "splash-inner" },
        h("div", { className: "splash-radar" },
          h("div", { className: "ring r1" }), h("div", { className: "ring r2" }), h("div", { className: "ring r3" }),
          h("div", { className: "sweep" }), h("div", { className: "pulse" }), h("div", { className: "core" })),
        h("div", { className: "splash-title" }, "CHEF'S ", h("b", null, "REMIX")),
        h("div", { className: "splash-tag" }, "NEON_GRID · V3 · STUDIO ENGINE"),
        h("div", { className: "splash-wave" }, bars),
        h("div", { className: "splash-check" }, rows.map(function (r, k) {
          return h("div", { className: "row", key: k }, h("span", null, r[0]), h("span", { className: "ok" }, "▸ " + r[1]));
        })),
        h("button", { className: "splash-deploy", onClick: launch }, "Deploy Studio"),
        h("div", { className: "splash-hint" }, "Click to initialize audio context")));
  }

  // voice-type picker for appending tracks (types map to the engine's factory catalog)
  function AddTrackBar(props) {
    var TYPES = [
      { type: "kick", label: "Kick (Perc)" }, { type: "snare", label: "Snare (Perc)" },
      { type: "chat", label: "Hat (Perc)" }, { type: "sub", label: "Sub Bass (Mel)" },
      { type: "pluck", label: "Chord Pluck (Mel)" }, { type: "lead", label: "Lead (Mel)" },
      { type: "vox", label: "Vocal (Mel)" }, { type: "synth", label: "Synth — Polyphonic (Mel)" }
    ];
    var open = useState(false); var isOpen = open[0], setOpen = open[1];
    return h("div", { className: "addtrack-bar" },
      h("button", { className: "addtrack-cta", onClick: function () { setOpen(!isOpen); } }, "+ Add Track"),
      isOpen ? h("div", { className: "addtrack-menu" }, TYPES.map(function (t) {
        return h("button", { key: t.type, className: "addtrack-opt", onClick: function () { props.onAdd(t.type); setOpen(false); } }, t.label);
      })) : null);
  }

  // header Project dropdown — New / Export-Import .json / Local Slots (localStorage)
  function ProjectMenu(props) {
    var useState = React.useState, useRef = React.useRef;
    var o = useState(false); var open = o[0], setOpen = o[1];
    var nm = useState(""); var name = nm[0], setName = nm[1];
    var fileRef = useRef(null);
    function toggle() { var nx = !open; setOpen(nx); if (nx && props.onOpen) props.onOpen(); }
    return h("div", { className: "proj-menu" },
      h("button", { className: "hdr-btn", onClick: toggle, title: "Project: new / save slots / export / import" }, "Project ▾"),
      open ? h("div", { className: "proj-dd" },
        h("button", { className: "proj-item", onClick: function () { setOpen(false); props.onNew(); } }, "✦  New Clean Project"),
        h("div", { className: "proj-sec" }, "FILE"),
        h("button", { className: "proj-item", onClick: function () { setOpen(false); props.onExport(); } }, "⤓  Export Project (.json)"),
        h("button", { className: "proj-item", onClick: function () { if (fileRef.current) fileRef.current.click(); } }, "⤒  Import Project…"),
        h("input", { type: "file", accept: "application/json,.json", ref: fileRef, style: { display: "none" }, onChange: function (e) { var f = e.target.files[0]; e.target.value = ""; setOpen(false); if (f) props.onImportFile(f); } }),
        h("div", { className: "proj-sec" }, "LOCAL SLOTS"),
        h("div", { className: "proj-saverow" },
          h("input", { className: "proj-slotname", placeholder: "slot name…", value: name, onChange: function (e) { setName(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter" && name.trim()) { props.onSaveSlot(name.trim()); setName(""); } } }),
          h("button", { className: "proj-save", onClick: function () { if (name.trim()) { props.onSaveSlot(name.trim()); setName(""); } } }, "Save")),
        (props.slots && props.slots.length) ? props.slots.map(function (s) {
          return h("div", { className: "proj-slot", key: s },
            h("button", { className: "proj-slot-load", onClick: function () { setOpen(false); props.onLoadSlot(s); } }, s),
            h("button", { className: "proj-slot-del", title: "Delete slot", onClick: function () { props.onDeleteSlot(s); } }, "✕"));
        }) : h("div", { className: "proj-empty" }, "No saved slots yet")) : null);
  }

  // ⌘K command palette — fuzzy-filtered, keyboard-driven action launcher
  function CommandPalette(props) {
    var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;
    var qs = useState(""); var q = qs[0], setQ = qs[1];
    var is = useState(0); var idx = is[0], setIdx = is[1];
    var inputRef = useRef(null);
    useEffect(function () { if (inputRef.current) inputRef.current.focus(); }, []);
    var ql = q.trim().toLowerCase();
    var list = props.commands.filter(function (c) { return !ql || c.label.toLowerCase().indexOf(ql) >= 0 || (c.hint && c.hint.toLowerCase().indexOf(ql) >= 0); });
    function run(c) { props.onClose(); if (c) setTimeout(c.run, 0); }
    function onKey(e) {
      if (e.key === "Escape") { props.onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(list.length - 1, idx + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(0, idx - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); run(list[idx]); }
    }
    return h("div", { className: "cmdp-overlay", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "cmdp" },
        h("input", { className: "cmdp-input", ref: inputRef, placeholder: "Type a command…", value: q, onChange: function (e) { setQ(e.target.value); setIdx(0); }, onKeyDown: onKey }),
        h("div", { className: "cmdp-list" }, list.length ? list.map(function (c, i) {
          return h("button", { key: c.id, className: "cmdp-item" + (i === idx ? " sel" : ""), onMouseEnter: function () { setIdx(i); }, onClick: function () { run(c); } }, h("span", { className: "cmdp-lbl" }, c.label), c.hint ? h("span", { className: "cmdp-hint" }, c.hint) : null);
        }) : h("div", { className: "cmdp-empty" }, "No matching commands")),
        h("div", { className: "cmdp-foot" }, "↑↓ navigate · ↵ run · esc close")));
  }

  // shown in the piano-roll / graph panes when the rack has no focused lane
  function EmptyPane(props) {
    return h("div", { className: "empty-pane" },
      h("div", { className: "ep-ic" }, h(I.Plus, { width: 22, height: 22 })),
      h("div", { className: "ep-t" }, props.title || "No instruments yet"),
      h("div", { className: "ep-s" }, props.sub || "Click “+ Add Track” in the Channel Rack to begin."));
  }

  // ---------- Clip Editor overlay (Task 4): Steps / Notes / FX tabs for one timeline clip ----------
  // Steps  = on/off grid over the clip's note array (toggles a note at the channel root per step)
  // Notes  = the per-clip Piano Roll (edits ONLY this clip's notes, via the tick<->step adapter)
  // FX     = route override: inherit the channel insert (default) or send this block through a
  //          custom insert with its own independent FX rack (E.setClipRoute).
  function ClipEditor(props) {
    var clip = props.clip, chDef = props.chDef, api = props.api, commit = props.commit;
    var tb = useState(clip.kind === "audio" ? "fx" : "notes"); var tab = tb[0], setTab = tb[1];
    var rs = useState(0); var bump = function () { rs[1](function (x) { return x + 1; }); commit && commit(); };
    var TPS = E.TICKS_PER_STEP, bars = Math.max(1, Math.ceil(clip.lengthTicks / TPS / 16)), steps = bars * 16;
    var isAudio = clip.kind === "audio";
    var route = (E.channels[clip.ch] && E.channels[clip.ch].route) || null;
    function stepOn(i) { return (clip.notes || []).some(function (n) { return Math.round(n.pitchTick / TPS) === i; }); }
    function toggleStep(i) {
      if (stepOn(i)) { clip.notes = (clip.notes || []).filter(function (n) { return Math.round(n.pitchTick / TPS) !== i; }); }
      else { clip.notes = clip.notes || []; clip.notes.push({ id: clip.id + ":s" + (clip._nseq = (clip._nseq || 0) + 1), pitchTick: i * TPS, pitch: chDef.base || 60, lenTicks: TPS, vel: 100 }); }
      bump();
    }
    var TABS = (isAudio ? [] : [{ id: "steps", l: "Steps" }, { id: "notes", l: "Notes" }]).concat([{ id: "fx", l: "FX" }]);
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "modal clip-editor", style: { width: 720, maxWidth: "92vw" } },
        h("div", { className: "modal-head" },
          h("div", { className: "mi" }, h(I.Layers, null)),
          h("h3", null, "Clip Editor · ", chDef.label,
            h("span", { className: "ce-classbadge", title: "Pattern classification" }, isAudio ? "Audio" : (E.classifyChannel(clip.ch) === "melodic" ? "Melody" : "Drums")),
            h("span", { className: "sub", style: { marginLeft: 8 } }, bars + (bars === 1 ? " bar" : " bars"))),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose }, h(I.X, { width: 16, height: 16 }))),
        h("div", { className: "ce-tabs" }, TABS.map(function (t) { return h("button", { key: t.id, className: "ce-tab" + (tab === t.id ? " on" : ""), onClick: function () { setTab(t.id); } }, t.l); })),
        h("div", { className: "modal-body", style: { minHeight: 280 } },
          tab === "steps" ? h("div", { className: "ce-steps" },
            h("p", { className: "sub", style: { marginBottom: 8 } }, "Step grid for this clip (root note per step). Use Notes for full pitch control."),
            h("div", { className: "ce-stepgrid", style: { gridTemplateColumns: "repeat(" + Math.min(steps, 16) + ", 1fr)" } },
              Array.apply(null, { length: steps }).map(function (_, i) {
                return h("button", { key: i, className: "ce-step" + (stepOn(i) ? " on" : "") + (i % 4 === 0 ? " beat" : ""), onClick: function () { toggleStep(i); } });
              }))) : null,
          tab === "notes" ? h(window.PianoRoll, { ch: chDef, pattern: api.toPattern(clip), steps: steps, playStep: -1, rev: rs[0], onAddNote: api.add(clip), onUpdateNote: api.upd(clip), onRemoveNote: api.rem(clip), commit: bump }) : null,
          tab === "fx" ? h("div", { className: "ce-fx" },
            h("div", { className: "ce-fxmode" },
              h("label", { className: "ce-radio" + (!clip.routeOverride ? " on" : "") },
                h("input", { type: "radio", checked: !clip.routeOverride, onChange: function () { E.setClipRoute(clip.id, null); bump(); } }),
                " Inherit channel FX ", h("span", { className: "sub" }, route ? "(Insert M" + ("0" + route).slice(-2) + ")" : "")),
              h("label", { className: "ce-radio" + (clip.routeOverride ? " on" : "") },
                h("input", { type: "radio", checked: !!clip.routeOverride, onChange: function () { E.setClipRoute(clip.id, clip.routeOverride || route || 1); bump(); } }),
                " Custom FX → Insert ",
                h("select", { className: "ce-inssel", disabled: !clip.routeOverride, value: clip.routeOverride || route || 1, onChange: function (e) { E.setClipRoute(clip.id, parseInt(e.target.value, 10)); bump(); } },
                  E.insertDefs.map(function (d) { return h("option", { key: d.id, value: d.id }, "M" + ("0" + d.id).slice(-2) + " · " + d.name); })))),
            (function () {
              var insId = clip.routeOverride || route; var ins = insId && E.inserts[insId]; if (!ins) return null;
              return h("div", { className: "ce-fxrack" },
                h("div", { className: "sub", style: { margin: "10px 0 6px" } }, (clip.routeOverride ? "Independent rack · " : "Shared track rack · ") + "Insert M" + ("0" + insId).slice(-2)),
                h("div", { className: "ce-slotrow" }, ins.fx.map(function (s, si) {
                  return h("button", { key: si, className: "ce-slot" + (s.type ? " filled" : "") + (s.bypass ? " byp" : ""), title: "Slot " + (si + 1) + (s.type ? " · " + (FXMETA[s.type] ? FXMETA[s.type].label : s.type) : " · empty"),
                    onClick: function () { props.onOpenFx(insId, si, clip); } }, s.type ? (FXMETA[s.type] ? FXMETA[s.type].label : s.type) : (si + 1));
                })));
            })(),
            !isAudio && E.banks[E.activePattern].steps[chDef.id] ? h("div", { className: "ce-stepmod" },
              h("div", { className: "trackfx-modlbl" }, "STEP MODULATION"),
              h(window.GraphEditor, { ch: chDef, pattern: E.banks[E.activePattern], rev: rs[0], playStep: -1, embedded: true, onSet: function (id, i, k, v) { E.setStepParam(id, i, k, v); bump(); } })) : null) : null),
        h("div", { className: "modal-foot" }, h("button", { className: "btn primary", onClick: props.onClose }, "Done"))));
  }

  // Phase 5: the standalone TRACK FX panel was deleted — its INSERT FX RACK + STEP MODULATION
  // lanes now live inside the Mixer's focused-strip expanded view (FocusStripView, file 07),
  // which resolves the focused channel's insert strictly by route id.

  // ---------- Phase 10: non-destructive waveform editor (audio clips) ----------
  // Opens on double-click of a linear audio clip. Reads the clip's raw AudioBuffer, draws a
  // downsampled peak waveform on a <canvas>, and edits ONLY clip metadata — clip gain, fade-in /
  // fade-out, and split-at-position. The source buffer is never mutated; a split creates a new
  // clip object referencing the same buffer with adjusted in/out points (engine.splitClipAt).
  function WaveEditor(props) {
    var clip = props.clip, cref = useRef(null);
    var rs = useState(0); var bump = function () { rs[1](function (x) { return x + 1; }); props.commit && props.commit(); };
    var buf = E.userBuffers[clip.bufferId];
    var bufDur = buf ? buf.duration : 0;
    var offsetSec = E.tickToSec(clip.offsetTicks || 0);
    var clipDurSec = clip.trimmed ? E.tickToSec(clip.lengthTicks) : Math.max(0, bufDur - offsetSec);
    var sp = useState(0.5); var splitPos = sp[0], setSplitPos = sp[1];   // 0..1 within the clip window
    function gain() { return clip.gain != null ? clip.gain : 1; }
    function fadeFrac(t) { return clipDurSec > 0 ? Math.max(0, Math.min(0.5, E.tickToSec(t || 0) / clipDurSec)) : 0; }
    useEffect(function () {
      var cv = cref.current; if (!cv) return; var ctx = cv.getContext("2d");
      var r = cv.getBoundingClientRect(), Wd = cv.width = Math.max(8, Math.floor(r.width * 2)), Hd = cv.height = Math.max(8, Math.floor(r.height * 2));
      ctx.clearRect(0, 0, Wd, Hd);
      ctx.fillStyle = "rgba(157,78,221,0.06)"; ctx.fillRect(0, 0, Wd, Hd);
      var peaks = (clip.peaks && clip.peaks.length) ? clip.peaks : (buf ? E.computePeaks(buf, 600) : []);
      var n = peaks.length, mid = Hd / 2, g = gain();
      if (n && bufDur > 0) {
        // only the windowed slice [offset, offset+dur] of the buffer is what this clip plays
        var i0 = Math.floor((offsetSec / bufDur) * n), i1 = Math.max(i0 + 1, Math.floor(((offsetSec + clipDurSec) / bufDur) * n));
        var span = Math.max(1, i1 - i0);
        ctx.strokeStyle = "rgba(157,78,221,0.95)"; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var x = 0; x < Wd; x++) {
          var pi = i0 + Math.floor((x / Wd) * span); if (pi < 0 || pi >= n) continue;
          var a = Math.min(1, peaks[pi] * g);
          ctx.moveTo(x + 0.5, mid - a * mid * 0.96); ctx.lineTo(x + 0.5, mid + a * mid * 0.96);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(Wd, mid); ctx.stroke();
      // fade wedges
      var fi = fadeFrac(clip.fadeInTicks) * Wd, fo = fadeFrac(clip.fadeOutTicks) * Wd;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      if (fi > 0) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(fi, 0); ctx.lineTo(0, Hd); ctx.closePath(); ctx.fill(); }
      if (fo > 0) { ctx.beginPath(); ctx.moveTo(Wd, 0); ctx.lineTo(Wd - fo, 0); ctx.lineTo(Wd, Hd); ctx.closePath(); ctx.fill(); }
      // split marker
      var sx = splitPos * Wd; ctx.strokeStyle = "#ffb338"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, Hd); ctx.stroke();
    }, [rs[0], clip.id, clip.gain, clip.fadeInTicks, clip.fadeOutTicks, clip.lengthTicks, clip.offsetTicks, splitPos]);
    function setGain(v) { clip.gain = v; bump(); }
    function setFadeIn(frac) { clip.fadeInTicks = Math.round(E.secToTick(frac * clipDurSec)); bump(); }
    function setFadeOut(frac) { clip.fadeOutTicks = Math.round(E.secToTick(frac * clipDurSec)); bump(); }
    function doSplit() {
      var absTick = clip.startTick + Math.round(splitPos * clip.lengthTicks);
      var rid = E.splitClipAt(clip.id, absTick);
      if (rid) { props.commit && props.commit(); props.toast && props.toast("Clip split into 2"); props.onClose(); }
      else { props.toast && props.toast("Split point must be inside the clip"); }
    }
    function reset() { clip.gain = 1; clip.fadeInTicks = 0; clip.fadeOutTicks = 0; bump(); }
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "modal wave-editor", style: { width: 760, maxWidth: "94vw" } },
        h("div", { className: "modal-head" },
          h("div", { className: "mi" }, h(I.Wave, null)),
          h("h3", null, "Waveform Editor · ", clip.name || "Audio Clip",
            h("span", { className: "sub", style: { marginLeft: 8 } }, clipDurSec.toFixed(2) + "s" + (clip.trimmed ? " · trimmed" : " · full"))),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose }, h(I.X, { width: 16, height: 16 }))),
        h("div", { className: "modal-body" },
          buf ? h("canvas", { ref: cref, className: "wave-canvas", style: { width: "100%", height: 200 } })
              : h(EmptyPane, { title: "Audio still loading", sub: "The clip's buffer is being restored — reopen in a moment." }),
          h("div", { className: "wave-ctrls" },
            h("div", { className: "wave-ctl" }, h("label", null, "Clip Gain"), h("input", { type: "range", min: 0, max: 2, step: 0.01, value: gain(), onChange: function (e) { setGain(parseFloat(e.target.value)); } }), h("span", { className: "mono" }, Math.round(gain() * 100) + "%")),
            h("div", { className: "wave-ctl" }, h("label", null, "Fade In"), h("input", { type: "range", min: 0, max: 0.5, step: 0.01, value: fadeFrac(clip.fadeInTicks), onChange: function (e) { setFadeIn(parseFloat(e.target.value)); } }), h("span", { className: "mono" }, Math.round(E.tickToSec(clip.fadeInTicks || 0) * 1000) + "ms")),
            h("div", { className: "wave-ctl" }, h("label", null, "Fade Out"), h("input", { type: "range", min: 0, max: 0.5, step: 0.01, value: fadeFrac(clip.fadeOutTicks), onChange: function (e) { setFadeOut(parseFloat(e.target.value)); } }), h("span", { className: "mono" }, Math.round(E.tickToSec(clip.fadeOutTicks || 0) * 1000) + "ms")),
            h("div", { className: "wave-ctl" }, h("label", null, "Split At"), h("input", { type: "range", min: 0, max: 1, step: 0.001, value: splitPos, onChange: function (e) { setSplitPos(parseFloat(e.target.value)); } }), h("button", { className: "btn", onClick: doSplit }, "✂ Split"))),
          h("p", { className: "sub", style: { marginTop: 4 } }, "Non-destructive — edits change clip metadata only; the source audio is never modified.")),
        h("div", { className: "modal-foot" },
          h("button", { className: "btn", onClick: reset }, "Reset"),
          h("button", { className: "btn primary", onClick: props.onClose }, "Done"))));
  }

  // ---------- app ----------
  function App() {
    var tw = window.useTweaks(TWEAK_DEFAULTS); var t = tw[0], setTweak = tw[1];
    var lh = useState(false); var launched = lh[0], setLaunched = lh[1];
    var vw = useState("timeline"); var view = vw[0], setView = vw[1];   // Pass 3 T1: boot into Timeline
    var pl = useState(false); var playing = pl[0], setPlaying = pl[1];
    var bp = useState(E.tempo); var bpm = bp[0], setBpm = bp[1];
    var sw = useState(E.swing); var swing = sw[0], setSwing = sw[1];
    var mv = useState(E.master ? E.master.gain.value : 0.9); var master = mv[0], setMaster = mv[1];
    var ap = useState(E.activePattern); var active = ap[0], setActive = ap[1];
    var fo = useState(E.focus); var focus = fo[0], setFocus = fo[1];
    var lastTonal = useRef(null);
    var si = useState(2); var selIns = si[0], setSelIns = si[1];
    var rv = useState(0); var rev = rv[0];
    var ptk = useState(-1); var playTick = ptk[0], setPlayTick = ptk[1];   // timeline playhead (ticks)
    var mtS = useState(false); var musTyping = mtS[0], setMusTyping = mtS[1];   // ASDF musical typing
    var miS = useState(false); var midiOn = miS[0], setMidiOn = miS[1];         // Web MIDI enabled
    var paS = useState(false); var perfArm = paS[0], setPerfArm = paS[1];       // note-record arm
    var musRef = useRef(false), octRef = useRef(0);                             // live mirrors for the global key handler
    var cpS = useState(false); var paletteOpen = cpS[0], setPaletteOpen = cpS[1];
    var tlS = useState("arrow"); var toolMode = tlS[0], setToolMode = tlS[1];   // timeline tool: arrow | marquee
    var saveTimer = useRef(null), histTimer = useRef(null);
    // debounced autosave (500ms) — serializes PARAMS only, skipped while the engine is hydrating
    function scheduleSave() {
      if (E.isHydrating()) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(function () {
        try { localStorage.setItem("chefs_studio_session", JSON.stringify(E.serialize())); }
        catch (e) { console.warn("[session] save failed:", e); }
      }, 500);
    }
    // debounced undo checkpoint (450ms) — coalesces drags into one history entry
    function scheduleCheckpoint() { if (E.isHydrating()) return; if (histTimer.current) clearTimeout(histTimer.current); histTimer.current = setTimeout(function () { E.histCheckpoint(); }, 450); }
    function doUndo() { if (E.undo()) { syncFromEngine(); bump(); toast("Undo", h(I.Reset, { width: 16, height: 16 })); } }
    function doRedo() { if (E.redo()) { syncFromEngine(); bump(); toast("Redo", h(I.Reset, { width: 16, height: 16 })); } }
    var bump = function () { rv[1](function (x) { return x + 1; }); scheduleSave(); scheduleCheckpoint(); };
    var lc = useState(false); var railCol = lc[0], setRailCol = lc[1];
    var ecS = useState(null); var editClip = ecS[0], setEditClip = ecS[1];   // clip being isolated in the Piano Roll
    var ceS = useState(null); var clipEdit = ceS[0], setClipEdit = ceS[1];   // clip open in the Clip Editor overlay (Task 4)
    var weS = useState(null); var waveClip = weS[0], setWaveClip = weS[1];   // Phase 10: audio clip open in the Waveform Editor
    var ps = useState(-1); var playStep = ps[0], setPlayStep = ps[1];
    var pbar = useState(-1); var playBar = pbar[0], setPlayBar = pbar[1];
    var fx = useState(null); var fxModal = fx[0], setFxModal = fx[1];
    var exm = useState(false); var showEx = exm[0], setShowEx = exm[1];
    var T = useToasts(); var toasts = T[0], toast = T[1];

    useEffect(function () {
      E.onStep = function (step, bar) { setPlayStep(step); if (bar >= 0) setPlayBar(bar); else setPlayBar(-1); };
      E.onPlayhead = function (tick) { setPlayTick(tick); };
      E.onMeter = function (data) { window.CR_METER = data; };
      window.__glow = 1;
      function fit() { var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); var st = document.querySelector(".stage"); if (st) st.style.transform = "translate(" + ((window.innerWidth - 1920 * s) / 2) + "px," + ((window.innerHeight - 1080 * s) / 2) + "px) scale(" + s + ")"; }
      fit(); window.addEventListener("resize", fit);
      function onKey(e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        var ctrlK = e.ctrlKey || e.metaKey;
        if (ctrlK && e.code === "KeyK") { e.preventDefault(); setPaletteOpen(true); return; }
        if (ctrlK && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
        if (ctrlK && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
        // single-key tool/transport hotkeys (R arm · V arrow · M marquee) — not musical keys
        if (!ctrlK && !e.altKey && !e.shiftKey) {
          if (e.code === "KeyR") { e.preventDefault(); var nx = !E.isPerfArmed(); E.armPerf(nx); setPerfArm(nx); return; }
          if (e.code === "KeyV") { setToolMode("arrow"); return; }
          if (e.code === "KeyM") { setToolMode("marquee"); return; }
        }
        // musical typing (ASDF row plays the focused track; Z/X shift octave)
        if (musRef.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (e.code === "KeyZ") { octRef.current = Math.max(-3, octRef.current - 1); e.preventDefault(); return; }
          if (e.code === "KeyX") { octRef.current = Math.min(3, octRef.current + 1); e.preventDefault(); return; }
          var sm = KEYMAP[e.code];
          if (sm != null) { e.preventDefault(); if (!e.repeat && E.focus) E.perfNoteOn(E.focus, sm + octRef.current * 12, 100); return; }
        }
        if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      }
      function onKeyUp(e) { if (!musRef.current) return; var sm = KEYMAP[e.code]; if (sm != null && E.focus) E.perfNoteOff(E.focus, sm + octRef.current * 12); }
      window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
      bump(); E.histInit();
      return function () { window.removeEventListener("resize", fit); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
    }, []);

    useEffect(function () {
      var r = document.documentElement;
      r.style.setProperty("--gs", t.gridScale === "compact" ? "0.85" : "1");
      r.style.setProperty("--glow", String(t.glow)); window.__glow = t.glow;
      r.style.setProperty("--beat-contrast", String(t.beatContrast));
      E.setMeterFps(t.meterFps === "30" ? 30 : 60);
    }, [t.gridScale, t.glow, t.beatContrast, t.meterFps]);

    var mode = view === "timeline" ? "timeline" : "pattern";
    useEffect(function () {
      // entering the Timeline: seed clips from the current project if it's empty (non-destructive),
      // then mirror the Channel Rack steps into unified clips so the rack + arrangement stay in sync.
      if (view === "timeline") {
        if (E.timeline.clips.length === 0) E.migrateBanksToTimeline();
        E.syncAllRackClips();
      }
      E.setMode(mode); setPlaying(E.isPlaying);
    }, [view]);

    function togglePlay() { if (E.isPlaying) { E.pause(); setPlaying(false); setPlayStep(-1); } else { E.start(mode); setPlaying(true); } }
    function stop() { E.stop(); setPlaying(false); setPlayStep(-1); setPlayBar(-1); }
    function pattern(i) { E.setActivePattern(i); setActive(i); bump(); }
    function doFocus(id) { setEditClip(null); setFocus(id); E.setFocus(id); var ch = E.channels[id]; if (ch) { if (ch.def.tonal) lastTonal.current = id; if (ch.route) setSelIns(ch.route); } }   // Phase 6: focusing a track selects its insert (by id) -> Mixer scrolls/highlights that strip

    function toggleStep(id, i) { E.toggleStep(id, i); bump(); }
    function setStep(id, i, k, v) { E.setStepParam(id, i, k, v); bump(); }
    function setVol(id, v) { E.setChannelVol(id, v); bump(); }
    function setPan(id, v) { E.setChannelPan(id, v); bump(); }
    function setRoute(id, v) { E.setRoute(id, v); bump(); }
    function muteCh(id) { E.muteCh(id); bump(); }
    function soloCh(id) { E.soloCh(id); bump(); }

    function insVol(id, v) { E.setInsertVol(id, v); bump(); }
    function insPan(id, v) { E.setInsertPan(id, v); bump(); }
    function insMute(id) { E.muteInsert(id); bump(); }
    function insSolo(id) { E.soloInsert(id); bump(); }
    // Task 6: per-insert live mic input removed (external tooling handles audio input now).

    // ---- per-clip Piano Roll adapter: bridge a timeline clip's tick-notes <-> the
    // step-based Piano Roll, editing ONLY that clip's note array (not the channel pattern) ----
    var TPS = E.TICKS_PER_STEP;
    function clipToPattern(clip) {
      clip.notes.forEach(function (n) { if (n.id == null) n.id = clip.id + ":n" + (clip._nseq = (clip._nseq || 0) + 1); });
      return { notes: clip.notes.map(function (n) { return { id: n.id, ch: clip.ch, pitch: n.pitch, start: n.pitchTick / TPS, len: Math.max(1, n.lenTicks / TPS), vel: n.vel }; }) };
    }
    function clipAddNote(clip) { return function (chId, pitch, start, len) { var id = clip.id + ":n" + (clip._nseq = (clip._nseq || 0) + 1); clip.notes.push({ id: id, pitchTick: Math.round(start * TPS), pitch: pitch, lenTicks: Math.max(1, Math.round(len * TPS)), vel: 100 }); bump(); return id; }; }
    function clipUpdNote(clip) { return function (id, patch) { var n = clip.notes.filter(function (x) { return x.id === id; })[0]; if (!n) return; if (patch.start != null) n.pitchTick = Math.max(0, Math.round(patch.start * TPS)); if (patch.len != null) n.lenTicks = Math.max(1, Math.round(patch.len * TPS)); if (patch.pitch != null) n.pitch = patch.pitch; if (patch.vel != null) n.vel = patch.vel; bump(); }; }
    function clipRemNote(clip) { return function (id) { clip.notes = clip.notes.filter(function (x) { return x.id !== id; }); bump(); }; }

    // real local-folder files preview/assign identically to imported audio: decode -> buffer.
    function previewSample(s) { if (s && s.userFile && s.file) { E.decodeAudioFile(s.file, function (buf) { E.previewBuffer(buf); }, function () {}); } else E.previewSample(s); }
    function assignSample(chId, s) {
      if (!s) return;
      if (s.userFile && s.file) {   // linked-folder audio behaves like Import Audio: spawn a sampler lane
        E.decodeAudioFile(s.file, function (buf) { var def = E.addSampler(s.name, buf, { raw: s.file }); setFocus(E.focus); E.setFocus(E.focus); bump(); toast("Loaded " + def.label, h(I.Wave, { width: 16, height: 16 })); }, function () { toast("Couldn't decode " + s.name, h(I.X, null)); });
        return;
      }
      var prev = E.channels[chId].def.label; E.assignVoice(chId, s); bump(); toast(prev + " → " + s.name.replace(/\.wav$/i, ""), h(I.Disc, { width: 16, height: 16 }));
    }
    function dropSample(chId) { var s = window.__dragSample; window.__dragSample = null; if (s) assignSample(chId, s); }
    // T4: browser double-click — spawn a NEW track loaded with the clicked sample, then bump so it
    // shows up immediately in the rack data, mixer, and timeline lane headers.
    function createTrackFromSample(s) {
      if (!s) return;
      if (s.userFile && s.file) {   // real local file -> decode -> sampler lane (same as Import Audio)
        E.decodeAudioFile(s.file, function (buf) { var def = E.addSampler(s.name, buf, { raw: s.file }); setFocus(E.focus); E.setFocus(E.focus); bump(); toast("Added " + def.label, h(I.Plus, { width: 16, height: 16 })); }, function () { toast("Couldn't decode " + s.name, h(I.X, null)); });
        return;
      }
      var d = E.addChannel(s.type);   // allocate route = max+1 + step rows in all banks
      E.assignVoice(d.id, s);         // load the clicked voice/preset onto the new track
      setFocus(E.focus); E.setFocus(E.focus); if (d.tonal) lastTonal.current = d.id; bump();
      toast("Added " + d.label, h(I.Plus, { width: 16, height: 16 }));
    }

    // double-clicking a timeline clip focuses the FX Plugin Rack for that clip's lane (its mixer
    // insert). If the clip has bound per-clip FX (clip.fx), recall it onto the insert first; else
    // it shares the track's chain. Opens the FX modal on the first active slot.
    function openClipFx(clip) {
      var ch = E.channels[clip.ch];
      if (!ch) { toast("No mixer route for this lane", h(I.X, null)); return; }
      var route = ch.route;
      if (clip.fx) E.setInsertFx(route, clip.fx);
      setSelIns(route);
      var ins = E.inserts[route]; var slot = 0;
      for (var i = 0; i < ins.fx.length; i++) { if (ins.fx[i].type) { slot = i; break; } }
      setFxModal({ id: route, slot: slot, clip: clip });
      bump();
    }

    // dynamic lane add / delete (delete purges step+note data and disconnects audio nodes in the engine)
    function addTrack(type) { var d = (type === "synth") ? E.addSynthTrack() : E.addChannel(type); setFocus(E.focus); E.setFocus(E.focus); if (d.tonal) lastTonal.current = d.id; bump(); toast("Added " + d.label, h(I.Plus, { width: 16, height: 16 })); }
    // Synth Suite (Phase 1/2): append a native polyphonic synth track and land on the Timeline so
    // the user can immediately double-click its empty lane to open the Piano Roll and draw notes.
    function addSynth() { setView("timeline"); var d = E.addSynthTrack(); setFocus(E.focus); E.setFocus(E.focus); lastTonal.current = d.id; bump(); toast("Added " + d.label + " — double-click its lane to draw notes", h(I.Piano, { width: 16, height: 16 })); }
    function deleteTrack(id) { var ch = E.channels[id]; var label = ch ? ch.def.label : "Track"; E.removeChannel(id); if (lastTonal.current === id) lastTonal.current = null; setFocus(E.focus); E.setFocus(E.focus); bump(); toast(label + " removed", h(I.Trash, { width: 16, height: 16 })); }
    // ---- project controls (Phase 1: New / Slots / Export-Import) ----
    var SLOT_IDX = "chefs_project_slots", SLOT_PREFIX = "chefs_slot:";
    var slS = useState(function () { try { return JSON.parse(localStorage.getItem(SLOT_IDX) || "[]"); } catch (e) { return []; } });
    var slots = slS[0], setSlots = slS[1];
    function refreshSlots() { try { setSlots(JSON.parse(localStorage.getItem(SLOT_IDX) || "[]")); } catch (e) { setSlots([]); } }
    function syncFromEngine() { setBpm(E.tempo); setSwing(E.swing); setMaster(E.master ? E.master.gain.value : 0.9); setActive(E.activePattern); setFocus(E.focus); }
    function newProject() { E.newProject(); try { localStorage.removeItem("chefs_studio_session"); } catch (e) {} syncFromEngine(); setView("timeline"); bump(); toast("New clean project", h(I.Reset, { width: 16, height: 16 })); }
    function exportProject() {
      try {
        var blob = new Blob([JSON.stringify(E.serialize())], { type: "application/json" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "chefs-remix-project.json"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast("Exported project .json", h(I.Download, { width: 16, height: 16 }));
      } catch (e) { toast("Export failed", h(I.X, null)); }
    }
    function importProjectFile(file) {
      var fr = new FileReader();
      fr.onload = function () { try { var data = JSON.parse(fr.result); if (E.hydrate(data)) { syncFromEngine(); bump(); toast("Project imported", h(I.Check, { width: 16, height: 16 })); } else toast("Incompatible project file", h(I.X, null)); } catch (e) { toast("Invalid project file", h(I.X, null)); } };
      fr.onerror = function () { toast("Couldn't read file", h(I.X, null)); };
      fr.readAsText(file);
    }
    function saveSlot(nm2) { try { localStorage.setItem(SLOT_PREFIX + nm2, JSON.stringify(E.serialize())); var idx = JSON.parse(localStorage.getItem(SLOT_IDX) || "[]"); if (idx.indexOf(nm2) < 0) idx.push(nm2); localStorage.setItem(SLOT_IDX, JSON.stringify(idx)); setSlots(idx); toast("Saved “" + nm2 + "”", h(I.Check, { width: 16, height: 16 })); } catch (e) { toast("Slot save failed (storage full?)", h(I.X, null)); } }
    function loadSlot(nm2) { try { var raw = localStorage.getItem(SLOT_PREFIX + nm2); if (raw && E.hydrate(JSON.parse(raw))) { syncFromEngine(); bump(); toast("Loaded “" + nm2 + "”", h(I.Check, { width: 16, height: 16 })); } else toast("Slot unreadable", h(I.X, null)); } catch (e) { toast("Load failed", h(I.X, null)); } }
    function deleteSlot(nm2) { try { localStorage.removeItem(SLOT_PREFIX + nm2); var idx = JSON.parse(localStorage.getItem(SLOT_IDX) || "[]").filter(function (n) { return n !== nm2; }); localStorage.setItem(SLOT_IDX, JSON.stringify(idx)); setSlots(idx); } catch (e) {} }

    // derived state
    var channelState = {}; E.channelDefs.forEach(function (c) { var ch = E.channels[c.id]; channelState[c.id] = { route: ch.route, vol: ch.vol, pan: ch.pan, muted: ch.muted, solo: ch.solo }; });
    var litMap = {}; if (playing && playStep >= 0 && mode === "pattern") { E.channelDefs.forEach(function (c) { litMap[c.id] = E.banks[active].steps[c.id][playStep].on; }); }
    var routeCount = {}; E.channelDefs.forEach(function (c) { routeCount[c.route] = (routeCount[c.route] || 0) + 1; });
    var insertState = E.insertDefs.map(function (d) { var ins = E.inserts[d.id]; return { id: d.id, name: d.name, vol: ins.vol, pan: ins.panVal, mute: ins.mute, solo: ins.solo, micOn: !!ins.micOn, fx: ins.fx.map(function (s) { return { type: s.type, bypass: s.bypass }; }), routeCount: routeCount[d.id] || 0 }; });

    var focusCh = (focus && E.channels[focus]) ? E.channels[focus].def : null;
    var prCh = focusCh && focusCh.tonal ? focusCh
      : ((lastTonal.current && E.channels[lastTonal.current]) ? E.channels[lastTonal.current].def : focusCh);

    function setTool(t) { setToolMode(t); }
    function toggleArm() { var nx = !E.isPerfArmed(); E.armPerf(nx); setPerfArm(nx); }
    var commands = [
      { id: "play", label: playing ? "Stop" : "Play", hint: "Space", run: togglePlay },
      { id: "undo", label: "Undo", hint: "Ctrl+Z", run: doUndo },
      { id: "redo", label: "Redo", hint: "Ctrl+Y", run: doRedo },
      { id: "add", label: "Add Track", run: function () { addTrack("kick"); } },
      { id: "add-synth", label: "Add Synth Track (Polyphonic)", run: addSynth },
      { id: "new", label: "New Clean Project", run: newProject },
      { id: "export", label: "Export… (Mixdown / Stems)", run: function () { setShowEx(true); } },
      { id: "save", label: "Export Project (.json)", run: exportProject },
      { id: "keys", label: "Toggle Musical Typing", hint: "⌨", run: function () { var nx = !musTyping; setMusTyping(nx); musRef.current = nx; } },
      { id: "arm", label: "Toggle Note Record Arm", hint: "R", run: toggleArm },
      { id: "midi", label: "Enable MIDI Input", run: function () { E.enableMIDI(function (ok, info) { if (ok) { setMidiOn(true); toast("MIDI ready · " + info + " input(s)", h(I.Piano, { width: 16, height: 16 })); } else toast("MIDI: " + info, h(I.X, null)); }); } },
      { id: "v-timeline", label: "Go to Timeline", run: function () { setView("timeline"); } },
      { id: "tool-arrow", label: "Arrow Tool", hint: "V", run: function () { setTool("arrow"); } },
      { id: "tool-marquee", label: "Marquee Tool", hint: "M", run: function () { setTool("marquee"); } }
    ];

    // Timeline-first (Pass 3 T1): Channel Rack + Piano Roll are no longer top-level nav entries —
    // both components still render inside the Clip Editor (Steps / Notes) and the per-clip Piano Roll.
    var TABS = [{ id: "timeline", label: "Timeline", ic: I.Timeline }];
    var editingClip = (editClip && E.timeline.clips.indexOf(editClip) >= 0) ? editClip : null;   // guard against deleted/undone clips

    return h(React.Fragment, null,
      h("div", { className: "stage" },
        h(Transport, { playing: playing, bpm: bpm, swing: swing, master: master, active: active, pos: posStr(playStep, playBar, mode), onPlay: togglePlay, onStop: stop, onBpm: function (v) { E.setTempo(v); setBpm(v); }, onSwing: function (v) { E.setSwing(v); setSwing(v); }, onPattern: pattern, onExport: function () { setShowEx(true); } }),
        h("div", { className: "workspace" },
          h(window.FileBrowser, { collapsed: railCol, onCollapse: function () { setRailCol(!railCol); }, channelDefs: E.channelDefs, focus: focus, onFocus: doFocus, onPreview: previewSample, onAssign: assignSample, onCreateTrack: createTrackFromSample, toast: toast, onTrackAdded: function () { setFocus(E.focus); E.setFocus(E.focus); bump(); },
            onAddMelody: function (files) {
              // Fix 1: decode each melody file -> full-length Audio Lane clip on the timeline.
              var total = files.length, ok = 0;
              files.forEach(function (f) {
                E.decodeAudioFile(f, function (buf) {
                  E.addMelodyFile(f.name, buf, f); ok++;
                  setView("timeline"); setFocus(E.focus); bump();
                  toast("Added melody: " + f.name + " (" + ok + "/" + total + ")", h(I.Wave, { width: 16, height: 16 }));
                }, function () { toast("Could not decode " + f.name, h(I.X, { width: 16, height: 16 })); });
              });
            } }),
          h("div", { className: "stage-main" },
            h("div", { className: "tabs" },
              TABS.map(function (tb) { return h("button", { key: tb.id, className: "tab" + (view === tb.id ? " on" : ""), onClick: function () { setView(tb.id); setEditClip(null); } }, h("span", { className: "ti" }, h(tb.ic, { width: 16, height: 16 })), tb.label); }),
              h("button", { className: "hdr-btn", title: "Add a native polyphonic Synth track — then double-click its timeline lane to draw notes in the Piano Roll", onClick: addSynth }, [h(I.Piano, { width: 14, height: 14, key: "i" }), " Synth"]),
              h(ProjectMenu, { onNew: newProject, onExport: exportProject, onImportFile: importProjectFile, onSaveSlot: saveSlot, onLoadSlot: loadSlot, onDeleteSlot: deleteSlot, slots: slots, onOpen: refreshSlots }),
              h("button", { className: "hdr-btn", title: "Undo (Ctrl+Z)", onClick: doUndo }, "↶"),
              h("button", { className: "hdr-btn", title: "Redo (Ctrl+Y)", onClick: doRedo }, "↷"),
              h("button", { className: "hdr-btn" + (musTyping ? " on" : ""), title: "Musical typing — ASDF row plays the focused track (Z/X = octave)", onClick: function () { var nx = !musTyping; setMusTyping(nx); musRef.current = nx; } }, "⌨ Keys"),
              h("button", { className: "hdr-btn" + (midiOn ? " on" : ""), title: "Enable MIDI controller input", onClick: function () { if (midiOn) return; E.enableMIDI(function (ok, info) { if (ok) { setMidiOn(true); toast("MIDI ready · " + info + " input(s)", h(I.Piano, { width: 16, height: 16 })); } else { toast("MIDI: " + info, h(I.X, null)); } }); } }, "MIDI"),
              h("button", { className: "hdr-btn" + (perfArm ? " on" : ""), title: "Arm note recording — play (keys/MIDI) while the Timeline rolls to capture notes", onClick: function () { var nx = !perfArm; setPerfArm(nx); E.armPerf(nx); } }, "● Arm"),
              h("div", { className: "auth" + (playing ? " live" : "") }, h("span", { className: "pulse" }), playing ? [h("span", { key: 1 }, "Playing "), h("b", { key: 2 }, "timeline")] : "Stopped")),
            h("div", { className: "center" },
              h("div", { className: "top-pane" },
                h("div", { className: "pane-head" },
                  h("span", { className: "pt" }, view === "rack" ? "Channel Rack" : view === "piano" ? (editingClip ? "Piano Roll · Clip" : "Piano Roll") : "Timeline"),
                  h("span", { className: "badge" }, "LINEAR"),
                  h("span", { className: "sub" }, "Absolute-tick arrangement · " + bpm + " BPM"),
                  view === "rack" ? h("div", { className: "ph-act" },
                    h("button", { className: "mini-btn", onClick: function () { E.clearPattern(); bump(); toast("Pattern " + (active + 1) + " cleared", h(I.Reset, null)); } }, [h(I.Reset, { width: 13, height: 13, key: 1 }), "Clear"]),
                    h("button", { className: "mini-btn", onClick: function () { randomize(active, bump, toast); } }, [h(I.Dice, { width: 13, height: 13, key: 1 }), "Spice"])) : null),
                view === "rack" ? h(React.Fragment, null,
                    h(window.ChannelRack, { channels: E.channelDefs, pattern: E.banks[active], state: channelState, focus: focus, litMap: litMap, playStep: mode === "pattern" ? playStep : -1, onFocus: doFocus, onToggle: toggleStep, onVol: setVol, onPan: setPan, onRoute: setRoute, onMute: muteCh, onSolo: soloCh, onDropSample: dropSample, onDelete: deleteTrack }),
                    h(AddTrackBar, { onAdd: addTrack }))
                  : view === "piano" ? (
                      editingClip
                        ? h(window.PianoRoll, { ch: (E.channels[editingClip.ch] && E.channels[editingClip.ch].def) || prCh, pattern: clipToPattern(editingClip), steps: Math.max(16, Math.ceil(editingClip.lengthTicks / TPS / 16) * 16), playStep: -1, rev: rev, onAddNote: clipAddNote(editingClip), onUpdateNote: clipUpdNote(editingClip), onRemoveNote: clipRemNote(editingClip), onPreview: function (p) { var d = E.channels[editingClip.ch] && E.channels[editingClip.ch].def; if (d && d.tonal) E.previewNote(editingClip.ch, p - (d.base || 0), 100); }, commit: bump })
                        : prCh
                          ? h(window.PianoRoll, { ch: prCh, pattern: E.banks[active], steps: E.getPatternLength(active) * 16, lengthBars: E.getPatternLength(active), onSetLength: function (b) { E.setPatternLength(b, active); bump(); }, playStep: mode === "pattern" ? playStep : -1, rev: rev, onAddNote: function (c, p, s, l) { return E.addNote(c, p, s, l); }, onUpdateNote: function (id, patch) { E.updateNote(id, patch); }, onRemoveNote: function (id) { E.removeNote(id); }, onPreview: function (p) { if (prCh && prCh.tonal) E.previewNote(prCh.id, p - (prCh.base || 0), 100); }, commit: bump })
                          : h(EmptyPane, { title: "No tonal instrument", sub: "Add a melodic track (it routes here automatically)." }))
                    : h(window.Timeline, { channels: E.channelDefs, playheadTick: playTick, tool: toolMode, onSetTool: setToolMode, onCommit: bump, onDeleteTrack: deleteTrack, onFocusStrip: doFocus, onScrub: function (tick) { E.seek(tick); setPlayTick(tick); }, onOpenClip: function (clip) { doFocus(clip.ch); setView("piano"); setEditClip(clip); }, onOpenClipFx: openClipFx, onEditClip: function (clip) { doFocus(clip.ch); setClipEdit(clip); }, onOpenWave: function (clip) { doFocus(clip.ch); setWaveClip(clip); }, onToast: function (m) { toast(m, h(I.Mic, { width: 16, height: 16 })); } })),
              h("div", { className: "dashboard" },
                h(window.Mixer, { inserts: insertState, selected: selIns, master: master, focusCh: focusCh, pattern: E.banks[active], rev: rev, playStep: mode === "pattern" ? playStep : -1, onSetStep: setStep, onSelect: setSelIns, onVol: insVol, onPan: insPan, onMute: insMute, onSolo: insSolo, onMasterVol: function (v) { E.setMaster(v); setMaster(v); }, onFxClick: function (id, slot) { setFxModal({ id: id, slot: slot }); }, onCommit: bump }))))),
        (clipEdit && E.timeline.clips.indexOf(clipEdit) >= 0) ? h(ClipEditor, {
          clip: clipEdit, chDef: (E.channels[clipEdit.ch] && E.channels[clipEdit.ch].def) || prCh, commit: bump,
          api: { toPattern: clipToPattern, add: clipAddNote, upd: clipUpdNote, rem: clipRemNote },
          onOpenFx: function (insId, slot, clip) { setFxModal({ id: insId, slot: slot, clip: clip }); },
          onClose: function () { setClipEdit(null); } }) : null,
        (waveClip && E.timeline.clips.indexOf(waveClip) >= 0) ? h(WaveEditor, {
          clip: waveClip, commit: bump, toast: function (m) { toast(m, h(I.Wave, { width: 16, height: 16 })); },
          onClose: function () { setWaveClip(null); } }) : null,
        fxModal ? h(FXModal, { id: fxModal.id, slot: fxModal.slot, clip: fxModal.clip, onClose: function () { setFxModal(null); }, commit: bump }) : null,
        showEx ? h(RenderModal, { onClose: function () { setShowEx(false); }, onStopped: function () { setPlaying(false); setPlayStep(-1); }, toast: toast }) : null,
        h("div", { className: "toast-wrap" }, toasts.map(function (x) { return h("div", { className: "toast", key: x.id }, h("span", { className: "ti" }, x.ic), x.m); }))),
      h(window.TweaksPanel, null,
        h(window.TweakSection, { label: "Workspace Density" }),
        h(window.TweakRadio, { label: "UI Grid Scale", value: t.gridScale, options: ["compact", "default"], onChange: function (v) { setTweak("gridScale", v); } }),
        h(window.TweakRadio, { label: "VU Meter Refresh", value: t.meterFps, options: ["30", "60"], onChange: function (v) { setTweak("meterFps", v); } }),
        h(window.TweakSection, { label: "Neon Skin" }),
        h(window.TweakSlider, { label: "Glow Intensity", value: t.glow, min: 0, max: 2, step: 0.1, onChange: function (v) { setTweak("glow", v); } }),
        h(window.TweakSlider, { label: "Beat-Block Contrast", value: t.beatContrast, min: 0.2, max: 2.4, step: 0.1, onChange: function (v) { setTweak("beatContrast", v); } })),
      paletteOpen ? h(CommandPalette, { commands: commands, onClose: function () { setPaletteOpen(false); } }) : null,
      launched ? null : h(Splash, { onLaunch: function () { setLaunched(true); } }));
  }

  function posStr(step, bar, mode) {
    if (mode === "song") { if (bar < 0) return "01 : 1"; return ("0" + (bar + 1)).slice(-2) + " : " + (Math.floor((step < 0 ? 0 : step) / 4) + 1); }
    if (step < 0) return "01 : 1"; return "01 : " + (Math.floor(step / 4) + 1) + "." + (step % 4 + 1);
  }
  function randomize(active, bump, toast) {
    var b = E.banks[active];
    E.channelDefs.forEach(function (c) { for (var i = 0; i < 16; i++) { var st = b.steps[c.id][i]; var pr = c.type === "chat" || c.type === "shaker" ? 0.55 : c.type === "kick" ? 0.3 : c.type === "arp" ? 0.5 : 0.22; st.on = Math.random() < pr; st.vel = 60 + Math.floor(Math.random() * 67); if (c.tonal && st.on) st.pitch = [0, 0, 3, 5, 7, 7, 10, 12][Math.floor(Math.random() * 8)] - (c.type === "sub" || c.type === "reese" ? 0 : 0); } });
    bump(); toast("Pattern " + (active + 1) + " spiced up", h(I.Sparkle, null));
  }

  // Boot: restore the saved session if present & valid, else start on a blank slate.
  // Runs before render so App's useState seeds (E.tempo / E.focus / …) reflect restored values.
  E.init();
  (function () {
    var ok = false;
    try {
      var raw = localStorage.getItem("chefs_studio_session");
      if (raw) { ok = E.hydrate(JSON.parse(raw)); if (!ok) localStorage.removeItem("chefs_studio_session"); }
    } catch (e) {
      console.warn("[session] load failed, booting empty:", e);
      try { localStorage.removeItem("chefs_studio_session"); } catch (e2) {}
    }
    if (!ok) { E.setActivePattern(0); E.setTempo(140); E.setSwing(0.16); E.setMaster(0.9); }
  })();
  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
