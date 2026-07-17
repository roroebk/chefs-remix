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
        h("button", { className: "tbtn rec", title: "Record — Rec Audio mode" }, h(I.Rec, { width: 14, height: 14 }))),
      h("div", { className: "t-group" },
        h("div", { className: "readout clock" }, h("span", { className: "lbl" }, "Position"), h("span", { className: "val mono" }, props.pos))),
      h("div", { className: "t-group" },
        h("div", { className: "readout" }, h("span", { className: "lbl" }, "Tempo"),
          h("span", { className: "val mono", style: { cursor: "ns-resize" }, onMouseDown: W.useVDrag(function () { return props.bpm; }, function (v) { props.onBpm(Math.round(v)); }, { min: 40, max: 240, sens: 0.004 }) }, props.bpm, h("span", { className: "u" }, "BPM")))),
      h("div", { className: "t-group" },
        h("div", { className: "knob-wrap" }, h("span", { className: "lbl", style: { writingMode: "horizontal-tb" } }, "SWING"),
          h("input", { className: "slider swing-mini", type: "range", min: 0, max: 1, step: 0.01, value: props.swing, onChange: function (e) { props.onSwing(parseFloat(e.target.value)); } }),
          h("span", { className: "mono", style: { fontSize: 12, color: "var(--accent)", width: 34 } }, Math.round(props.swing * 100) + "%"))),
      h("div", { className: "t-group" },
        h("div", { className: "mode-toggle", title: "Switch between the beatmaking workspace and the audio-tracking Studio" },
          h("button", { className: "mt-opt" + (props.studio ? "" : " on"), onClick: function () { if (props.studio) props.onToggleStudio(false); } }, "Producer"),
          h("button", { className: "mt-opt rec" + (props.studio ? " on" : ""), onClick: function () { if (!props.studio) props.onToggleStudio(true); } }, h(I.Rec, { width: 12, height: 12 }), "Rec Audio"))),
      h("div", { className: "t-group spectrum-wrap" }, h(W.SpectrumAnalyzer, null)),
      h(ExportMenu, { onProducer: props.onProducerMaster, onRecAudio: props.onRecAudioMaster, exporting: props.exporting, exportProg: props.exportProg, recAvailable: props.recAvailable }));
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

  // top-bar Export → two-target master-mix dropdown (Producer / Rec Audio). Reentry-guarded via the
  // App's `exporting` state; the busy item shows inline progress; Rec Audio disabled when empty.
  function ExportMenu(props) {
    var o = useState(false); var open = o[0], setOpen = o[1];
    var busy = props.exporting;   // "producer" | "recaudio" | null
    return h("div", { className: "export-menu" },
      h("button", { className: "btn", onClick: function () { setOpen(!open); }, title: "Export a master mix (WAV)" }, [h(I.Download, { width: 16, height: 16, key: 1 }), "Export ▾"]),
      open ? h("div", { className: "export-dd" },
        h("div", { className: "export-sec" }, "MASTER MIX (WAV)"),
        h("button", { className: "export-item", disabled: !!busy, onClick: function () { props.onProducer(); } },
          busy === "producer" ? ("Producer — rendering " + Math.round(props.exportProg * 100) + "%") : "Master Mix — Producer"),
        h("button", { className: "export-item", disabled: !!busy || !props.recAvailable, title: props.recAvailable ? "Backing + unmuted audio lanes through their plugin chains" : "Nothing to mix yet", onClick: function () { if (props.recAvailable && !busy) props.onRecAudio(); } },
          busy === "recaudio" ? ("Rec Audio — rendering " + Math.round(props.exportProg * 100) + "%") : "Master Mix — Rec Audio")) : null);
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
      { type: "vox", label: "Vocal (Mel)" }
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
    var readOnly = !!props.readOnly, embedded = !!props.embedded, au = props.audition || null;
    var rs = useState(0); var bump = function () { rs[1](function (x) { return x + 1; }); props.commit && props.commit(); };
    // Phase 4 Fix 1: a polySampler clip has no own bufferId — the Waveform tab shows the channel's
    // SOURCE sample (props.srcBufferId) READ-ONLY (no split/slice/fade/gain). Audio-Lane clips edit
    // their own windowed buffer exactly as before.
    var srcMode = (clip.bufferId == null && props.srcBufferId != null);
    var buf = E.userBuffers[srcMode ? props.srcBufferId : clip.bufferId];
    var bufDur = buf ? buf.duration : 0;
    var offsetSec = srcMode ? 0 : E.tickToSec(clip.offsetTicks || 0);
    var clipDurSec = srcMode ? bufDur : (clip.trimmed ? E.tickToSec(clip.lengthTicks) : Math.max(0, bufDur - offsetSec));
    var sp = useState(0.5); var splitPos = sp[0], setSplitPos = sp[1];   // 0..1 within the clip window
    function gain() { return clip.gain != null ? clip.gain : 1; }
    function fadeFrac(t) { return clipDurSec > 0 ? Math.max(0, Math.min(0.5, E.tickToSec(t || 0) / clipDurSec)) : 0; }
    useEffect(function () {
      var cv = cref.current; if (!cv) return; var ctx = cv.getContext("2d");
      var r = cv.getBoundingClientRect(), Wd = cv.width = Math.max(8, Math.floor(r.width * 2)), Hd = cv.height = Math.max(8, Math.floor(r.height * 2));
      ctx.clearRect(0, 0, Wd, Hd);
      ctx.fillStyle = "rgba(157,78,221,0.06)"; ctx.fillRect(0, 0, Wd, Hd);
      var peaks = (!srcMode && clip.peaks && clip.peaks.length) ? clip.peaks : (buf ? E.computePeaks(buf, 600) : []);
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
      if (!readOnly) {
        // fade wedges
        var fi = fadeFrac(clip.fadeInTicks) * Wd, fo = fadeFrac(clip.fadeOutTicks) * Wd;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        if (fi > 0) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(fi, 0); ctx.lineTo(0, Hd); ctx.closePath(); ctx.fill(); }
        if (fo > 0) { ctx.beginPath(); ctx.moveTo(Wd, 0); ctx.lineTo(Wd - fo, 0); ctx.lineTo(Wd, Hd); ctx.closePath(); ctx.fill(); }
        // split marker
        var sx = splitPos * Wd; ctx.strokeStyle = "#ffb338"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, Hd); ctx.stroke();
      }
      // Phase 5: audition playhead — green line projected at the scoped-transport position within the window
      if (props.playFrac != null && props.playFrac >= 0 && props.playFrac <= 1) {
        var px = props.playFrac * Wd; ctx.strokeStyle = "#39d98a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, Hd); ctx.stroke();
      }
    }, [rs[0], clip.id, clip.gain, clip.fadeInTicks, clip.fadeOutTicks, clip.lengthTicks, clip.offsetTicks, splitPos, readOnly, srcMode, props.playFrac]);
    function setGain(v) { if (readOnly) return; clip.gain = v; bump(); }
    function setFadeIn(frac) { if (readOnly) return; clip.fadeInTicks = Math.round(E.secToTick(frac * clipDurSec)); bump(); }
    function setFadeOut(frac) { if (readOnly) return; clip.fadeOutTicks = Math.round(E.secToTick(frac * clipDurSec)); bump(); }
    function doSplit() {
      if (readOnly) return;
      var absTick = clip.startTick + Math.round(splitPos * clip.lengthTicks);
      var rid = E.splitClipAt(clip.id, absTick);
      if (rid) { props.commit && props.commit(); props.toast && props.toast("Clip split into 2"); if (!embedded) props.onClose(); }
      else { props.toast && props.toast("Split point must be inside the clip"); }
    }
    function reset() { if (readOnly) return; clip.gain = 1; clip.fadeInTicks = 0; clip.fadeOutTicks = 0; bump(); }
    function onCanvasScrub(e) { if (!au) return; var r = e.currentTarget.getBoundingClientRect(); au.scrub(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }
    var auBar = au ? h("div", { className: "wave-audbar" },
      h("button", { className: "pr-aud play" + (au.active ? " on" : ""), title: au.active ? "Stop audition" : "Play audition", onClick: function () { au.active ? au.stop() : au.play(); } }, au.active ? "■" : "▶"),
      h("button", { className: "pr-aud" + (au.loop ? " on" : ""), title: "Loop the audition", onClick: function () { au.setLoop(!au.loop); } }, "⟳"),
      h("span", { className: "sub", style: { marginLeft: 8 } }, readOnly ? "Read-only · Melody Maker source sample · click the wave to scrub" : "Click the waveform to scrub")) : null;
    var canvas = buf ? h("canvas", { ref: cref, className: "wave-canvas", style: { width: "100%", height: 200, cursor: au ? "text" : "default" }, onClick: onCanvasScrub })
                     : h(EmptyPane, { title: "Audio still loading", sub: "The clip's buffer is being restored — reopen in a moment." });
    var ctrls = h("div", { className: "wave-ctrls" },
      h("div", { className: "wave-ctl" }, h("label", null, "Clip Gain"), h("input", { type: "range", min: 0, max: 2, step: 0.01, value: gain(), disabled: readOnly, onChange: function (e) { setGain(parseFloat(e.target.value)); } }), h("span", { className: "mono" }, Math.round(gain() * 100) + "%")),
      h("div", { className: "wave-ctl" }, h("label", null, "Fade In"), h("input", { type: "range", min: 0, max: 0.5, step: 0.01, value: fadeFrac(clip.fadeInTicks), disabled: readOnly, onChange: function (e) { setFadeIn(parseFloat(e.target.value)); } }), h("span", { className: "mono" }, Math.round(E.tickToSec(clip.fadeInTicks || 0) * 1000) + "ms")),
      h("div", { className: "wave-ctl" }, h("label", null, "Fade Out"), h("input", { type: "range", min: 0, max: 0.5, step: 0.01, value: fadeFrac(clip.fadeOutTicks), disabled: readOnly, onChange: function (e) { setFadeOut(parseFloat(e.target.value)); } }), h("span", { className: "mono" }, Math.round(E.tickToSec(clip.fadeOutTicks || 0) * 1000) + "ms")),
      h("div", { className: "wave-ctl" }, h("label", null, "Split At"), h("input", { type: "range", min: 0, max: 1, step: 0.001, value: splitPos, disabled: readOnly, onChange: function (e) { setSplitPos(parseFloat(e.target.value)); } }), h("button", { className: "btn", disabled: readOnly, onClick: doSplit }, "✂ Split")));
    if (embedded) {
      // re-hosted INSIDE the dual-tab panel's Waveform tab (no overlay/modal chrome of its own)
      return h("div", { className: "wave-embed" }, auBar, canvas, readOnly ? null : ctrls,
        h("p", { className: "sub", style: { marginTop: 4 } }, readOnly ? "Melody Maker source — pitched playback is edited in the Piano Roll tab; this view is read-only." : "Non-destructive — edits change clip metadata only; the source audio is never modified."));
    }
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "modal wave-editor", style: { width: 760, maxWidth: "94vw" } },
        h("div", { className: "modal-head" },
          h("div", { className: "mi" }, h(I.Wave, null)),
          h("h3", null, "Waveform Editor · ", clip.name || "Audio Clip",
            h("span", { className: "sub", style: { marginLeft: 8 } }, clipDurSec.toFixed(2) + "s" + (clip.trimmed ? " · trimmed" : " · full"))),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose }, h(I.X, { width: 16, height: 16 }))),
        h("div", { className: "modal-body" }, canvas, ctrls,
          h("p", { className: "sub", style: { marginTop: 4 } }, "Non-destructive — edits change clip metadata only; the source audio is never modified.")),
        h("div", { className: "modal-foot" },
          h("button", { className: "btn", onClick: reset }, "Reset"),
          h("button", { className: "btn primary", onClick: props.onClose }, "Done"))));
  }

  // ---------- Dual-tab editor panel (this batch) ----------
  // ONE container hosting a Piano Roll tab + a Waveform tab. Routing: MIDI/synth → Piano Roll only;
  // audio → Waveform only; polySampler → Piano-Roll-focused with a clickable Waveform tab (the source
  // sample, read-only). Both tabs audition through the SAME shared scoped-transport handle (E.scope):
  // entering the panel snapshots+pauses the global transport, exiting restores the producer's place.
  function DualEditor(props) {
    var clip = props.clip, chDef = props.chDef || {}, api = props.api;
    var TPS = E.TICKS_PER_STEP;
    var isAudio = clip.kind === "audio";
    var isPoly = !isAudio && chDef.kind === "polySampler";
    var bars = Math.max(1, Math.ceil((clip.lengthTicks || TPS * 16) / TPS / 16)), steps = bars * 16;
    var tabs = isAudio ? [{ id: "wave", l: "Waveform" }]
             : isPoly ? [{ id: "piano", l: "Piano Roll" }, { id: "wave", l: "Waveform" }]
             : [{ id: "piano", l: "Piano Roll" }];
    var tab = tabs.some(function (t) { return t.id === props.tab; }) ? props.tab : tabs[0].id;
    var rs = useState(0); var bump = function () { rs[1](function (x) { return x + 1; }); props.commit && props.commit(); };
    var auS = useState(false); var auditioning = auS[0], setAuditioning = auS[1];
    var loopS = useState(true); var loopOn = loopS[0], setLoopOn = loopS[1];
    var soloS = useState(false); var soloOn = soloS[0], setSoloOn = soloS[1];
    // enter scoped mode on open (snapshot + pause global), exit on close (restore exact place)
    useEffect(function () {
      E.scope.enter({ startTick: clip.startTick, endTick: clip.startTick + steps * TPS, loop: true, soloId: null, owner: tab === "wave" ? "wave" : "piano" });
      return function () { E.scope.exit(); };
    }, []);
    // keep the play button honest if a one-shot (loop-off) audition reaches the end
    useEffect(function () { if (!auditioning) return; var iv = setInterval(function () { if (!E.scope.isPlaying()) setAuditioning(false); }, 120); return function () { clearInterval(iv); }; }, [auditioning]);
    var audition = {
      active: auditioning, loop: loopOn, solo: soloOn,
      play: function () { E.scope.play(); setAuditioning(true); },
      stop: function () { E.scope.pause(); setAuditioning(false); },
      setLoop: function (on) { E.scope.setLoop(on); setLoopOn(on); },
      setSolo: function (on) { E.scope.setSolo(on ? clip.ch : null); setSoloOn(on); },
      setRange: function (s, e) { E.scope.setRange(clip.startTick + Math.round(s * TPS), clip.startTick + Math.round(e * TPS)); },
      scrub: function (frac) { E.scope.scrub(clip.startTick + Math.round(frac * clip.lengthTicks)); }
    };
    // Phase 5 Fix 2: explicit ownership handoff — synchronously stop + clear the scoped voices BEFORE
    // the newly-focused tab binds, so a Piano-Roll loop can't survive under a Waveform scrub.
    function switchTab(id) {
      if (id === tab) return;
      try { window.engine.scope.stopScopeVoices(); } catch (e) {}
      setAuditioning(false);
      E.scope.setOwner(id === "wave" ? "wave" : "piano");
      props.setTab(id);
    }
    var playStep = (auditioning && props.playTick != null && props.playTick >= 0) ? ((props.playTick - clip.startTick) / TPS) : -1;
    var srcBufId = isPoly ? chDef.bufferId : null;
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "modal dual-editor", style: { width: 880, maxWidth: "95vw" } },
        h("div", { className: "modal-head" },
          h("div", { className: "mi" }, h(I.Piano || I.Note || I.Layers, null)),
          h("h3", null, "Editor · ", chDef.label || "Clip",
            h("span", { className: "ce-classbadge", title: "Track type" }, isAudio ? "Audio" : isPoly ? "Melody Maker" : (E.classifyChannel(clip.ch) === "melodic" ? "Melody" : "Drums")),
            h("span", { className: "sub", style: { marginLeft: 8 } }, bars + (bars === 1 ? " bar" : " bars"))),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose }, h(I.X, { width: 16, height: 16 }))),
        tabs.length > 1 ? h("div", { className: "de-tabs" }, tabs.map(function (t) { return h("button", { key: t.id, className: "de-tab" + (tab === t.id ? " on" : ""), onClick: function () { switchTab(t.id); } }, t.l); })) : null,
        h("div", { className: "modal-body", style: { minHeight: 300 } },
          tab === "piano" ? h(window.PianoRoll, { ch: chDef, pattern: api.toPattern(clip), steps: steps, playStep: playStep, rev: rs[0], triplet: props.triplet, audition: audition, onAddNote: api.add(clip), onUpdateNote: api.upd(clip), onRemoveNote: api.rem(clip), onPreview: function (p) { if (chDef.tonal) E.previewNote(clip.ch, p - (chDef.base || 0), 100); }, commit: bump }) : null,
          tab === "wave" ? h(WaveEditor, { clip: clip, embedded: true, readOnly: isPoly, srcBufferId: srcBufId, audition: audition, playFrac: (playStep >= 0 && steps > 0) ? (playStep / steps) : -1, commit: bump, toast: props.toast, onClose: props.onClose }) : null),
        h("div", { className: "modal-foot" }, h("button", { className: "btn primary", onClick: props.onClose }, "Done"))));
  }

  // ============================================================================
  // STUDIO MODE — audio-tracking suite that swaps in beneath the top bar when
  // [Rec Audio] is active. Shares the single transport (never mount-binds it).
  // RESTRUCTURE: left Track Source · center-top lane matrix · center-bottom compact
  // Record bar + single-track "Plugins" panel (file 07, window.StudioPlugins).
  // ============================================================================

  // ---- Studio track model (session-scoped, additive — no engine schema change) ----
  // The prompt's model `type` is stored as `def.trackType` to avoid colliding with the
  // engine's voice-`type` (kick/sampler/audio/…). Backing tracks stay clip-driven; the
  // engine def.type/kind are untouched. pluginState/meta live on the def; they survive
  // dropdown switches / arming / re-renders (reset on full reload — session-scoped).
  function defaultPluginState() {
    return {
      inputGain: 1,
      pitchFix: { mode: "auto", params: { retuneSpeed: 40, tightness: 0.5, scale: "chromatic", key: "C", bypass: false }, graph: { points: [], interp: "linear" } },
      saturation: { drive: 0, mix: 0 },
      eq: { low: 0, mid: 0, high: 0, cutoff: 20000 },
      compressor: { threshold: 0, ratio: 1, makeup: 0, multiband: false },
      deesser: { amount: 0, freq: 6000 },
      spatial: { width: 0, x: 0.5, y: 0.5 },
      delay: { div: "1/8", fb: 0.25, mix: 0 },
      reverb: { size: 2.4, wet: 0 },
      routing: { route: null, output: 1 }
    };
  }
  // lazily attach the model to a channel def (idempotent). Called wherever Studio reads tracks.
  function ensureStudioModel(def) {
    if (!def) return def;
    if (!def.trackType) def.trackType = (def.backing || def.locked) ? "backing" : "audio";
    if (!def.pluginState) def.pluginState = defaultPluginState();
    if (def.sourceFileId === undefined) def.sourceFileId = def.bufferId || null;
    if (def.deletedAt === undefined) def.deletedAt = null;
    if (!def.meta) def.meta = { created: 0, source: def.trackType === "backing" ? "bounced" : "recorded", readOnly: def.trackType === "backing" };
    return def;
  }
  function isBackingDef(def) { return !!(def && (def.trackType === "backing" || def.backing || def.locked)); }
  // Studio track list: backing tracks sorted FIRST (top), then editable audio lanes.
  function studioTracks(channelDefs) {
    var lanes = channelDefs.filter(function (c) { return c.type === "audio" || c.kind === "audioLane"; }).map(ensureStudioModel);
    return lanes.slice().sort(function (a, b) { return (isBackingDef(b) ? 1 : 0) - (isBackingDef(a) ? 1 : 0); });
  }

  // long read-only waveform for a Studio lane (draws a clip's precomputed peaks)
  function LaneWave(props) {
    var ref = useRef(null);
    useEffect(function () {
      var cv = ref.current; if (!cv) return;
      var r = cv.getBoundingClientRect(); cv.width = Math.max(8, r.width * 2); cv.height = Math.max(8, r.height * 2);
      var ctx = cv.getContext("2d"), Wd = cv.width, Hd = cv.height, mid = Hd / 2;
      ctx.clearRect(0, 0, Wd, Hd);
      var peaks = props.peaks || []; if (!peaks.length) return;
      ctx.strokeStyle = props.color || "rgba(157,78,221,0.95)"; ctx.lineWidth = 1; ctx.beginPath();
      for (var x = 0; x < Wd; x++) { var pi = Math.floor((x / Wd) * peaks.length); var a = Math.min(1, (peaks[pi] || 0)); ctx.moveTo(x + 0.5, mid - a * mid * 0.94); ctx.lineTo(x + 0.5, mid + a * mid * 0.94); }
      ctx.stroke();
    }, [props.peaks, props.rev, props.w]);
    return h("canvas", { className: "lane-wave", ref: ref });
  }

  // MM:SS clock (ruler labels — no ms)
  function fmtClock(sec) { if (!(sec > 0)) sec = 0; var m = Math.floor(sec / 60), s = Math.floor(sec % 60); return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s); }

  // Rec-Audio session timer (decision 4): MM:SS.cs, driven off the transport clock. Updates imperatively
  // via rAF while active (playing/recording) so it never forces a per-frame React re-render; when idle it
  // reflects the current transport position (playheadTick), so a scrub/stop shows the new position.
  function StudioTimer(props) {
    var ref = useRef(null);
    useEffect(function () {
      var el = ref.current; if (!el) return;
      function fmt(sec) { if (!(sec > 0)) sec = 0; var m = Math.floor(sec / 60), s = Math.floor(sec % 60), cs = Math.floor(sec * 100) % 100; return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s) + "." + (cs < 10 ? "0" + cs : cs); }
      function pos() { var pt = window.engine.playheadTick; return pt >= 0 ? window.engine.tickToSec(pt) : 0; }
      var raf = 0, dead = false;
      function loop() { if (dead) return; el.textContent = fmt(pos()); raf = requestAnimationFrame(loop); }
      // active (play/record) = live rAF off the transport clock. Otherwise show the frozen `staticSec`
      // (count-in freezes at the red-line position; idle reflects the current transport position).
      if (props.active) loop(); else el.textContent = fmt(props.staticSec != null ? props.staticSec : pos());
      return function () { dead = true; if (raf) cancelAnimationFrame(raf); };
    }, [props.active, props.staticSec, props.rev, props.playTick]);
    return h("div", { className: "studio-timer mono", ref: ref, "aria-label": "Session time" }, "00:00.00");
  }

  // Rec-Audio timeline ruler (decision 4): 00:00 → session max. Progress + head sync with the transport;
  // click/drag the track scrubs via the SAME shared handler the lane playhead uses. Turns red while a take
  // is recording (write-position), purple during/after playback. `fitTicks` is the shared auto-fit scale.
  function StudioRuler(props) {
    var trackRef = useRef(null);
    var fit = Math.max(1, props.fitTicks || 1);
    var totalSec = window.engine.tickToSec(fit);
    var recording = props.recording;
    var recFrac = (recording && props.recPos >= 0) ? Math.max(0, Math.min(1, props.recPos / fit)) : -1;
    var playFrac = (!recording && props.playTick >= 0) ? Math.max(0, Math.min(1, props.playTick / fit)) : -1;
    var step = totalSec > 120 ? 20 : totalSec > 60 ? 10 : totalSec > 20 ? 5 : totalSec > 8 ? 2 : 1;
    var marks = []; for (var s = step; s < totalSec - 0.01; s += step) marks.push(s);
    function down(e) { props.dragScrub(e, function (ev) { var r = trackRef.current.getBoundingClientRect(); return (ev.clientX - r.left) / Math.max(1, r.width); }); }
    return h("div", { className: "studio-ruler" },
      h("span", { className: "sr-gutter mono" }, "00:00"),
      h("div", { className: "sr-track", ref: trackRef, onMouseDown: down, title: "Session timeline — click or drag to scrub" },
        marks.map(function (mk, i) { return h("div", { key: i, className: "sr-mark", style: { left: (mk / totalSec * 100) + "%" } }, h("span", { className: "sr-mlbl mono" }, fmtClock(mk))); }),
        recFrac >= 0 ? h("div", { className: "sr-prog rec", style: { width: (recFrac * 100) + "%" } }) : (playFrac >= 0 ? h("div", { className: "sr-prog", style: { width: (playFrac * 100) + "%" } }) : null),
        recFrac >= 0 ? h("div", { className: "sr-head rec", style: { left: (recFrac * 100) + "%" } }) : (playFrac >= 0 ? h("div", { className: "sr-head", style: { left: (playFrac * 100) + "%" } }) : null)),
      h("span", { className: "sr-gutter right mono" }, fmtClock(totalSec)));
  }

  // left panel: track-source manager (Import section hidden in Rec Audio; lives in Producer only)
  function TrackSourceManager(props) {
    var upRef = useRef(null);
    var tracks = props.tracks;
    return h("div", { className: "studio-tracks" },
      h("div", { className: "st-head" }, h("span", { className: "st-ttl" }, "TRACK SOURCE"), h("span", { className: "st-sub" }, "Rec Audio")),
      h("div", { className: "st-sect" },
        h("div", { className: "st-lbl" }, "PROJECT / BACKING"),
        props.bouncing
          ? h("div", { className: "st-prog" }, h("div", { className: "st-prog-fill", style: { width: Math.round(props.bounceProg * 100) + "%" } }), h("span", { className: "st-prog-t mono" }, "Bouncing… " + Math.round(props.bounceProg * 100) + "%"))
          : h("button", { className: "st-btn primary", onClick: props.onBounce, title: "Render the current Producer arrangement to a single stereo mix and load it as a locked Project track" }, h(I.Download, { width: 15, height: 15 }), "Add Producer Track"),
        h("button", { className: "st-btn", onClick: function () { upRef.current && upRef.current.click(); }, title: "Upload a WAV/MP3 as a locked Project track" }, h(I.Wave, { width: 15, height: 15 }), "Upload Audio (WAV/MP3)"),
        h("input", { ref: upRef, type: "file", accept: "audio/*", style: { display: "none" }, onChange: function (e) { if (e.target.files && e.target.files[0]) props.onUpload(e.target.files[0]); e.target.value = ""; } })),
      h("div", { className: "st-sect grow" },
        h("div", { className: "st-lbl" }, "TRACKS · " + tracks.length),
        tracks.length
          ? tracks.map(function (c) {
              var backing = isBackingDef(c); var muted = !!c.uiMuted;
              // M/✕ live ONLY here (the far-left TRACKS list). Backing rows: [M] + [↻ re-bounce] (no ✕).
              return h("div", { key: c.id, className: "st-track" + (props.selected === c.id ? " sel" : "") + (backing ? " locked" : "") + (muted ? " muted" : ""), onClick: function () { props.onSelect(c.id, true); } },
                h("span", { className: "st-tdot", style: { background: c.color || "var(--accent)" } }),
                h("span", { className: "st-tname" }, c.label),
                backing ? h("span", { className: "st-tlock", title: "Locked Project track" }, "🔒") : null,
                h("button", { className: "sm-mute" + (muted ? " on" : ""), "aria-label": muted ? "Unmute track" : "Mute track", onClick: function (e) { e.stopPropagation(); props.onMute(c.id); }, title: muted ? "Unmute (M)" : "Mute (M)" }, "M"),
                backing
                  ? h("button", { className: "sm-replace", disabled: props.bouncing, "aria-label": "Replace backing", onClick: function (e) { e.stopPropagation(); props.onReplace(c.id); }, title: "Replace backing (re-bounce the current arrangement in place)" }, "↻")
                  : h("button", { className: "sm-del", "aria-label": "Delete track", onClick: function (e) { e.stopPropagation(); props.onDelete(c.id); }, title: "Delete track (Del)" }, "✕"));
            })
          : h("div", { className: "st-empty" }, "No tracks yet — Add Producer Track or Add Track.")));
  }

  // center-top: audio-lane matrix (read-only waveforms) + Add Track. Selecting a lane makes it the
  // record target + Plugins focus (dropdown = single authority; no arming).
  function AudioLaneMatrix(props) {
    var lanes = props.tracks;
    var fit = Math.max(1, props.fitTicks || 1);
    var lanesRef = useRef(null);
    // frac (0..1) of the lane CONTENT column (after the 220px head + 12px pad each side) from a clientX.
    // Matches the playhead-line CSS mapping below so the line sits exactly under the pointer.
    function laneFrac(clientX) {
      var el = lanesRef.current; if (!el) return 0;
      var r = el.getBoundingClientRect(), left = r.left + 12 + 220, right = r.right - 12, w = Math.max(1, right - left);
      return Math.max(0, Math.min(1, (clientX - left) / w));
    }
    function pct(t) { return (Math.max(0, t) / fit * 100) + "%"; }
    // playhead x within .sm-lanes (padding box): content starts at 12+220=232px, ends at 100%-12px.
    function phLeft(frac) { return { left: "calc(232px + (100% - 244px) * " + Math.max(0, Math.min(1, frac)) + ")" }; }
    var recording = props.recPhase === "recording";
    var countin = props.recPhase === "countin";
    var recPos = (recording && props.recPreview) ? (props.recPreview.startTick + props.recPreview.lengthTicks) : -1;
    // RED record line (decision 3): ALWAYS present. While recording it's the moving write head (recPos,
    // not draggable); otherwise it sits at the punch-in position (recStartTick) and is draggable — but
    // NOT during count-in (decision 2: red holds still until the downbeat). PURPLE (decision 3) = playback
    // position, scrubbable, shown only during/after playback — hidden during count-in + recording. The
    // two lines are distinct and can coexist when idle (red = punch-in, purple = last playback position).
    var redTick = recording ? (recPos >= 0 ? recPos : (props.recStartTick || 0)) : (props.recStartTick || 0);
    var redDraggable = !recording && !countin;
    var showPurple = !recording && !countin && props.playTick != null && props.playTick >= 0;
    return h("div", { className: "studio-matrix" },
      h("div", { className: "sm-head" },
        h("span", { className: "pt" }, "Audio Tracking"),
        h("span", { className: "sub" }, "Drag the red line to set punch-in · select a track, then RECORD · " + lanes.length + " lane" + (lanes.length === 1 ? "" : "s")),
        h("button", { className: "sm-addtrack", onClick: props.onAddTrack }, h(I.Plus, { width: 14, height: 14 }), "Add Track")),
      h("div", { className: "sm-lanes", ref: lanesRef, onContextMenu: function (e) { e.preventDefault(); },
          onMouseDown: function (e) { if (e.button === 0 && e.target.classList.contains("sm-lanes")) props.onSelectClip(null); } },
        showPurple ? h("div", { className: "sm-playhead play", style: phLeft(props.playTick / fit), title: "Playback position — drag to scrub",
          onMouseDown: function (e) { props.dragScrub(e, function (ev) { return laneFrac(ev.clientX); }); } }) : null,
        h("div", { className: "sm-playhead rec" + (redDraggable ? " grab" : ""), style: phLeft(redTick / fit),
          title: recording ? "Recording — write position" : "Record-start (punch-in) — drag to move",
          onMouseDown: redDraggable ? function (e) { props.dragRed(e, function (ev) { return laneFrac(ev.clientX); }); } : null }),
        lanes.length
          ? lanes.map(function (c) {
              var clips = E.timeline.clips.filter(function (cl) { return cl.ch === c.id && cl.kind === "audio"; });
              var backing = isBackingDef(c);
              var muted = !!c.uiMuted;
              var live = props.recPreview && props.recPreview.ch === c.id ? props.recPreview : null;
              var rs = props.rangeSel; var rng = (rs && rs.ch === c.id && rs.endTick > rs.startTick) ? rs : null;   // Fix B: this lane's active range
              return h("div", { key: c.id, className: "sm-lane" + (props.selected === c.id ? " sel" : "") + (backing ? " locked" : "") + (muted ? " muted" : ""), onClick: function () { props.onSelect(c.id, true); }, onDoubleClick: function () { if (clips[0] && !backing && props.onOpenTake) props.onOpenTake(clips[0]); } },
                h("div", { className: "sm-lanehead" },
                  h("span", { className: "sm-dot", style: { background: c.color || "var(--accent)" } }),
                  h("span", { className: "sm-lname" }, c.label),
                  // M/✕/↻ consolidated to the left TRACKS list — lane headers keep only name + (backing) badge.
                  backing
                    ? h("span", { className: "sm-badge lock", title: "PROJECT — BACKING (READ ONLY) · Rendered mixdown. To update, re-bounce or upload a new backing." }, "PROJECT — BACKING")
                    : (props.selected === c.id ? h("span", { className: "sm-badge sel", title: "Selected — the RECORD target" }, "REC TARGET") : null)),
                // auto-fit lane body: every clip is time-positioned by the SHARED scale (left/width = % of
                // fitTicks), so a given x = the same timestamp on every lane. No horizontal overflow.
                h("div", { className: "sm-lanebody" + ((clips.length || live) ? "" : " empty") + (rng ? " ranging" : ""),
                    // Fix B — right-drag anywhere on a (non-backing) lane body selects a snapped TIME RANGE
                    // on THAT lane; onContextMenu is suppressed so the browser menu never eats the gesture.
                    onMouseDown: backing ? null : function (e) { if (e.button === 2) { e.preventDefault(); props.onRangeDown(e, c.id); } },
                    onContextMenu: backing ? null : function (e) { e.preventDefault(); },
                    onClick: function (e) { if (!clips.length && !live && !backing) { e.stopPropagation(); props.onSelect(c.id, true); } } },
                  clips.map(function (cl) {
                    // interactive clip (decision 4): click select · drag move (same lane, snapped) · Ctrl+C/V.
                    // Backing/Project clips are inert (no mousedown handler, no selection).
                    return h("div", { key: cl.id, className: "sm-clip" + (backing ? " backing" : "") + (!backing && props.selClip === cl.id ? " sel" : ""), style: { left: pct(cl.startTick), width: pct(cl.lengthTicks) },
                      onMouseDown: backing ? null : function (e) { props.onClipDown(e, cl); } },
                      h(LaneWave, { peaks: cl.peaks, color: backing ? "rgba(199,125,255,0.9)" : "rgba(157,78,221,0.95)", rev: props.rev + ":" + fit }));
                  }),
                  live ? h("div", { className: "sm-clip live", style: { left: pct(live.startTick), width: pct(live.lengthTicks) } }, h(LaneWave, { peaks: live.peaks, color: "rgba(255,59,107,0.95)", rev: (live.peaks || []).length })) : null,
                  // Fix B — active time-range highlight (this lane only); visually distinct from clip select.
                  rng ? h("div", { className: "sm-range", style: { left: pct(rng.startTick), width: pct(Math.max(0, rng.endTick - rng.startTick)) } }) : null,
                  (!clips.length && !live) ? h("span", { className: "sm-emptyhint" }, backing ? "Backing track" : "Empty lane — select as record target") : null));
            })
          : h("div", { className: "sm-noneyet" }, "No audio lanes. Add a track or Add Producer Track to start tracking.")));
  }

  // bottom bar LEFT zone: large circular Record with animated sound-wave rings (dominant element),
  // RECORD label beneath; mini Play/Stop + master VU + record-target readout subordinate.
  // RECORD gating (locked decision 5): enabled whenever the dropdown-selected track is an editable,
  // unlocked track. A backing selection disables RECORD ("read-only") — the ONLY remaining gate, since
  // the dropdown legitimately lists locked backing entries and a truly ungated RECORD could route a
  // take into the baked reference mix. Selection replaces arming as the record target.
  function RecordBar(props) {
    var d = props.selected && E.channels[props.selected] ? E.channels[props.selected].def : null;
    var backing = isBackingDef(d);
    var canRec = !!d && !backing;
    var phase = props.recPhase || "idle";                     // 'idle' | 'countin' | 'recording'
    var active = phase !== "idle";                            // count-in or recording in progress
    // idle: enabled only for an editable selected target. During count-in/recording the button is
    // always active (a press stops/cancels). States: idle-hot / pending (count-in) / recording.
    var clickable = active || canRec;
    var stateCls = phase === "recording" ? " rec-on" : phase === "countin" ? " pending" : (canRec ? " hot" : "");
    var title = phase === "recording" ? "Stop recording" : phase === "countin" ? "Cancel count-in" : (canRec ? ("Record to " + d.label) : backing ? "Backing track is read-only" : "Select a track to enable recording");
    var readout = props.recErr ? props.recErr
      : phase === "recording" ? ("Recording: " + (d ? d.label : "") )
      : phase === "countin" ? ("Count-in " + Math.min(4, props.countBeat || 1) + " / 4 — get ready…")
      : canRec ? ("Recording target: " + d.label) : backing ? "Backing track is read-only" : "Select a track";
    // timer: live rAF while playing/recording; FROZEN at the red-line position during count-in
    // (decision 2); idle reflects the current transport position.
    var timerLive = props.playing || phase === "recording";
    var timerStatic = phase === "countin" ? E.tickToSec(props.recStartTick || 0)
      : (props.playTick != null && props.playTick >= 0 ? E.tickToSec(props.playTick) : 0);
    return h("div", { className: "rec-zone" + (active ? " active" : "") },
      h("div", { className: "rz-header" },
        h("span", { className: "rz-ttl" }, "TRANSPORT"),
        h(StudioTimer, { active: timerLive, staticSec: timerStatic, rev: props.rev, playTick: props.playTick })),
      h("div", { className: "rec-center" },
        h("div", { className: "rec-circle-wrap" + stateCls },
          h("span", { className: "rec-ring r1" }), h("span", { className: "rec-ring r2" }), h("span", { className: "rec-ring r3" }),
          h("button", { className: "rec-circle" + stateCls, disabled: !clickable, onClick: function () { if (clickable) props.onRecord(); }, title: title, "aria-label": "Record" },
            phase === "countin" ? h("span", { className: "rec-count-num" }, String(Math.min(4, props.countBeat || 1))) : h("span", { className: "rec-circle-dot" }))),
        h("div", { className: "rec-circle-label" }, phase === "recording" ? "STOP" : phase === "countin" ? "COUNT-IN" : "RECORD")),
      h("div", { className: "rz-foot" },
        h("div", { className: "rz-mini" },
          h("button", { className: "rz-play" + (props.playing ? " on" : ""), onClick: props.onPlay, title: props.playing ? "Pause" : "Play", "aria-label": props.playing ? "Pause" : "Play" }, props.playing ? h(I.Stop, { width: 12, height: 12 }) : h(I.Play, { width: 12, height: 12 })),
          h("button", { className: "rz-stop", onClick: props.onStop, title: "Stop", "aria-label": "Stop" }, h(I.Stop, { width: 10, height: 10 })),
          // input-monitoring toggle (decision 1: moved here, beside Play/Stop, same size). Parallel mic
          // tap -> master; default OFF; ON warns about speaker feedback. Behavior unchanged from before.
          h("button", { className: "rz-mon" + (props.monitor ? " on" : ""), onClick: props.onToggleMonitor, "aria-label": "Toggle input monitoring",
            title: props.monitor ? "Input monitoring ON — you hear your mic input (use headphones)" : "Monitor input — hear your mic in real time. Use headphones; monitoring through speakers will feed back." }, h(I.Headphones, { width: 13, height: 13 })),
          h("div", { className: "rz-vu" }, h(W.MeterBar, { master: true, idx: 0 }), h(W.MeterBar, { master: true, idx: 1 })),
          // Fix A — recording-latency calibration (ms). Trims residual take alignment by ear per device;
          // additive to the measured capture latency at placement. Positive = shift takes earlier.
          h("label", { className: "rz-calib", title: "Recording latency calibration (ms). Positive nudges recorded takes earlier, negative later. Tune per device with the manual test." },
            "CAL", h("input", { type: "number", step: 1, value: props.calibMs || 0, onChange: function (e) { props.onSetCalib && props.onSetCalib(e.target.value); }, "aria-label": "Recording latency calibration in milliseconds" }), "ms")),
        h("div", { className: "rz-state" + (props.recErr ? " err" : "") }, readout)));
  }

  function StudioMode(props) {
    var tracks = studioTracks(props.channelDefs);
    return h("div", { className: "studio" },
      h(TrackSourceManager, { tracks: tracks, selected: props.selected, bouncing: props.bouncing, bounceProg: props.bounceProg, onBounce: props.onBounce, onUpload: props.onUpload, onSelect: props.onSelect, onMute: props.onMute, onDelete: props.onDelete, onReplace: props.onReplace }),
      h("div", { className: "studio-center" },
        h(AudioLaneMatrix, { tracks: tracks, selected: props.selected, playing: props.playing, playTick: props.playTick, rev: props.rev, fitTicks: props.fitTicks, recPhase: props.recPhase, recPreview: props.recPreview, recStartTick: props.recStartTick, selClip: props.selClip, rangeSel: props.rangeSel, onRangeDown: props.onRangeDown, dragScrub: props.dragScrub, dragRed: props.dragRed, onClipDown: props.onClipDown, onSelectClip: props.onSelectClip, onSelect: props.onSelect, onAddTrack: props.onAddTrack, onOpenTake: props.onOpenTake }),
        h(StudioRuler, { fitTicks: props.fitTicks, playTick: props.playTick, recording: props.recPhase === "recording", recPos: (props.recPreview ? (props.recPreview.startTick + props.recPreview.lengthTicks) : -1), dragScrub: props.dragScrub }),
        h("div", { className: "studio-bottombar" },
        h(RecordBar, { selected: props.selected, onRecord: props.onRecord, playing: props.playing, onPlay: props.onPlay, onStop: props.onStop, recPhase: props.recPhase, countBeat: props.countBeat, recErr: props.recErr, rev: props.rev, playTick: props.playTick, recStartTick: props.recStartTick, monitor: props.monitor, onToggleMonitor: props.onToggleMonitor, calibMs: props.calibMs, onSetCalib: props.onSetCalib }),
        window.StudioPlugins
          ? h(window.StudioPlugins, { tracks: tracks, selected: props.selected, bpm: props.bpm, rev: props.rev, triplet: props.triplet, bouncing: props.bouncing, onSelect: props.onSelect, onMute: props.onMute, onDelete: props.onDelete, onReplace: props.onReplace, commit: props.commit })
          : null)));
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
    var deS = useState(null); var dualClip = deS[0], setDualClip = deS[1];    // unified dual-tab editor (Piano Roll | Waveform)
    var dtS = useState("piano"); var dualTab = dtS[0], setDualTab = dtS[1];   // active tab in the dual editor
    var trS = useState(false); var triplet = trS[0], setTriplet = trS[1];     // Phase 3: triplet grid toggle (shared by Timeline + Piano Roll)
    var ps = useState(-1); var playStep = ps[0], setPlayStep = ps[1];
    var pbar = useState(-1); var playBar = pbar[0], setPlayBar = pbar[1];
    var fx = useState(null); var fxModal = fx[0], setFxModal = fx[1];
    var exm = useState(false); var showEx = exm[0], setShowEx = exm[1];
    var exM = useState(null); var exporting = exM[0], setExporting = exM[1];   // "producer" | "recaudio" | null
    var exP = useState(0); var exportProg = exP[0], setExportProg = exP[1];
    var T = useToasts(); var toasts = T[0], toast = T[1];
    // Studio Mode (Build 1): [Producer] | [Rec Audio] layout switch beneath the top bar
    var stM = useState(false); var studio = stM[0], setStudio = stM[1];
    var stSel = useState(null); var studioSel = stSel[0], setStudioSel = stSel[1];   // selected Studio track (chId) — also the record target (dropdown = single authority)
    var stB = useState(false); var bouncing = stB[0], setBouncing = stB[1];
    var stBp = useState(0); var bounceProg = stBp[0], setBounceProg = stBp[1];
    var stDc = useState(null); var delConfirm = stDc[0], setDelConfirm = stDc[1];     // pending delete-confirm {id,label}
    // Sprint B live mic capture: single cancellable flow state
    var rpS = useState("idle"); var recPhase = rpS[0], setRecPhase = rpS[1];          // 'idle' | 'countin' | 'recording'
    var cbS = useState(0); var countBeat = cbS[0], setCountBeat = cbS[1];             // 1..4 count-in flash
    var rpvS = useState(null); var recPreview = rpvS[0], setRecPreview = rpvS[1];     // live growing take {ch,startTick,lengthTicks,peaks}
    var reS = useState(null); var recErr = reS[0], setRecErr = reS[1];                // transient capture error readout
    var recFlowRef = useRef({ raf: 0, timers: [], captureTick: 0, engageTime: 0, cancelled: false });
    var recycleRef = useRef([]);                                                       // session recycle buffer for soft-deleted tracks
    var monS = useState(false); var monitor = monS[0], setMonitor = monS[1];           // input-monitoring toggle (session state, always OFF on load — decision 2)
    var rcaS = useState(0); var recCalib = rcaS[0], setRecCalibState = rcaS[1];         // Fix A: recording-latency calibration mirror (ms; authority is engine._recCalibMs)
    // studio auto-fit: one shared time->width scale (session max ticks, with headroom). fitTicksRef
    // mirrors the state so the recording rAF poll reads a fresh value without re-subscribing.
    var ftS = useState(0); var fitTicks = ftS[0], setFitTicks = ftS[1];
    var fitTicksRef = useRef(0);
    var rsS = useState(0); var recStartTick = rsS[0], setRecStartTick = rsS[1];         // movable RED record-start / punch-in position (ticks) — decision 3
    var scS = useState(null); var selClip = scS[0], setSelClip = scS[1];                // selected Studio clip id — decision 4
    var studioClipboard = useRef(null);                                                // session clip clipboard (deep-copied clip, shared buffer) — decision 4
    var rgsS = useState(null); var rangeSel = rgsS[0], setRangeSel = rgsS[1];           // Fix B: active per-lane time range {ch,startTick,endTick} (right-drag)
    var studioRangeClip = useRef(null);                                                // Fix B: range clipboard {ch, span, items:[segments]} (buffers shared)
    var studioClipMode = useRef("clip");                                               // Fix B: which clipboard Ctrl+V uses — 'clip' | 'range'
    var studioKbdRef = useRef({});                                                     // live mirror for the global key handler (Studio shortcuts)

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
        // Studio shortcuts (M mute · Del delete · Ctrl/Cmd+Z undo soft-delete) — take precedence
        // over the Producer hotkeys while Rec Audio is active; input-focus already guarded above.
        var sk = studioKbdRef.current;
        if (sk && sk.studio) {
          if (ctrlK && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); sk.undo(); return; }
          if (ctrlK && e.code === "KeyC") { e.preventDefault(); sk.copy(); return; }        // range OR clip copy (Fix B / decision 4)
          if (ctrlK && e.code === "KeyV") { e.preventDefault(); sk.paste(); return; }        // range OR clip paste at the red line
          if (!ctrlK && !e.altKey && !e.shiftKey) {
            if (e.code === "Escape" && sk.range) { e.preventDefault(); sk.clearRange(); return; }   // Fix B: Escape clears the range
            if (e.code === "KeyM") { e.preventDefault(); if (sk.sel) sk.mute(sk.sel); return; }
            // Fix B: a live range deletes ONLY the range (split + gap); otherwise Del removes the track (prior behavior).
            if (e.code === "Delete" || e.code === "Backspace") { e.preventDefault(); if (sk.range) sk.delRange(); else if (sk.sel) sk.del(sk.sel); return; }
          }
        }
        if (ctrlK && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
        if (ctrlK && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
        // single-key tool hotkeys (V arrow · M marquee) — not musical keys
        if (!ctrlK && !e.altKey && !e.shiftKey) {
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
      return function () { window.removeEventListener("resize", fit); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); try { E.releaseMic(); } catch (e) {} };
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

    function togglePlay() { if (E.scope.isActive()) return; if (E.isPlaying) { E.pause(); setPlaying(false); setPlayStep(-1); } else { E.start(mode); setPlaying(true); } }   // ignore global transport while an audition scope owns playback
    function stop() { if (E.scope.isActive()) return; E.stop(); setPlaying(false); setPlayStep(-1); setPlayBar(-1); }
    // open a clip in the unified dual-tab editor: audio -> Waveform tab; midi/synth/polySampler -> Piano Roll tab
    function openDual(clip) { if (!clip) return; doFocus(clip.ch); setDualTab(clip.kind === "audio" ? "wave" : "piano"); setDualClip(clip); }
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
    function addTrack(type) { var d = E.addChannel(type); setFocus(E.focus); E.setFocus(E.focus); if (d.tonal) lastTonal.current = d.id; bump(); toast("Added " + d.label, h(I.Plus, { width: 16, height: 16 })); }
    // Phase 5: addSynth() and the [Synth] UI entry points were removed — melodic tracks come from
    // Melody Maker (polySampler). engine.addSynthTrack / the oscillator voice remain, dormant.
    function deleteTrack(id) { var ch = E.channels[id]; var label = ch ? ch.def.label : "Track"; E.removeChannel(id); if (lastTonal.current === id) lastTonal.current = null; setFocus(E.focus); E.setFocus(E.focus); bump(); toast(label + " removed", h(I.Trash, { width: 16, height: 16 })); }

    // ---- Studio Mode wiring (Build 1) --------------------------------------
    // Silence-on-switch: synchronously de-click/kill any sounding voices via the SHARED scope handle
    // BEFORE the layout state flips, so no prior-mode audio bleeds under the new screen. Reuses the
    // existing engine.scope lifecycle — no parallel mechanism. The transport itself stays unified.
    function toggleStudio(next) { try { E.scope.stopScopeVoices(); } catch (e) {} E._recMode = next; setStudio(next); }   // mode-scoped playback: engine sounds only the active tab's channel set
    // input-monitoring toggle (decision 2). Turning ON arms the mic (permission-first) if not already
    // armed, then routes the parallel monitor tap to master; the capture buffer is never touched.
    function toggleMonitor() {
      if (monitor) { E.setMonitor(false); setMonitor(false); return; }
      function engage() { E.setMonitor(true); setMonitor(true); toast("Input monitoring ON — use headphones (speakers will feed back)", h(I.Headphones, { width: 16, height: 16 })); }
      if (E._cap && E._cap.monGain) { engage(); return; }               // mic already armed this session — just route
      E.armMicCapture({ onReady: engage, onError: function () { toast("Microphone access denied — check browser settings", h(I.X, null)); } });
    }
    // Fix A — set the per-session recording-latency calibration (ms). Additive to the measured capture
    // latency at clip placement; positive shifts takes earlier. Engine owns the value; state mirrors it.
    function setRecCalibration(ms) { var v = Math.round(+ms || 0); E.setRecCalib(v); setRecCalibState(v); }

    // ---- Rec-Audio auto-fit scale + shared scrub (decisions 3, 4, 5) --------------------------
    // session max ticks across the Studio tracks' clips (end of the longest clip / backing), floored to
    // 4 bars so an empty session still has a sane width.
    function studioSessionTicks() {
      var ids = {}; E.studioDefs().forEach(function (d) { ids[d.id] = 1; });
      var max = 0;
      E.timeline.clips.forEach(function (c) { if (ids[c.ch]) { var e = (c.startTick || 0) + (c.lengthTicks || 0); if (e > max) max = e; } });
      return Math.max(max, E.TICKS_PER_BAR * 4);
    }
    // one shared scale for lanes + ruler + playheads. Idle: fit the session exactly (bar-rounded). While a
    // take records (growing:true) grow only, with 20% headroom in bar chunks, and ONLY when the content
    // nears the current edge — so a long take re-fits a handful of times, never per animation frame.
    function refitStudio(opts) {
      var base = studioSessionTicks();
      if (opts && opts.extra && opts.extra > base) base = opts.extra;
      var next;
      if (opts && opts.growing) {
        var cur = fitTicksRef.current || 0;
        if (cur > 0 && base <= cur * 0.98) return cur;                  // still fits — no reflow this frame
        next = Math.ceil((base * 1.2) / E.TICKS_PER_BAR) * E.TICKS_PER_BAR;
      } else {
        next = Math.ceil(base / E.TICKS_PER_BAR) * E.TICKS_PER_BAR;
      }
      if (next !== fitTicksRef.current) { fitTicksRef.current = next; setFitTicks(next); }
      return fitTicksRef.current;
    }
    // shared seek: fraction (0..1) of the fitted session -> engine seek + playhead state. SAME path as the
    // Producer scrub (E.seek + setPlayTick) — not a forked transport.
    function studioSeekFrac(frac) {
      var maxT = fitTicksRef.current || studioSessionTicks();
      var tick = Math.max(0, Math.round(Math.max(0, Math.min(1, frac)) * maxT));
      E.seek(tick); setPlayTick(tick);
    }
    // reused drag-scrub loop (mirrors file-09 dragScrub): mousedown -> live scrub -> release. `fracFn(ev)`
    // maps a pointer event to a 0..1 fraction (lane content column, or the ruler track).
    function studioDragScrub(e, fracFn) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      function apply(ev) { studioSeekFrac(fracFn(ev)); }
      apply(e);
      function mv(ev) { apply(ev); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // keep the shared scale synced to the session while idle (clips added/removed, mode entered, undo).
    useEffect(function () { if (studio && recPhase !== "recording") refitStudio(); }, [rev, studio, recPhase]);
    // lightweight re-render during a live drag (no autosave/checkpoint — commit() at drop does that).
    function forceRender() { rv[1](function (x) { return x + 1; }); }

    // ---- movable RED record-start line (decision 3): drag sets the punch-in tick (NOT the transport) ---
    // idle-only; snapped to the 1/16 grid; clamped to [0, fit]. Reuses the same drag-loop shape as scrub.
    function studioDragRed(e, fracFn) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      function apply(ev) { var maxT = fitTicksRef.current || studioSessionTicks(); var f = Math.max(0, Math.min(1, fracFn(ev))); setRecStartTick(Math.max(0, E.snapTick(Math.round(f * maxT)))); }
      apply(e);
      function mv(ev) { apply(ev); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }

    // ---- shared overlap semantic (decision 4): overwrite [startTick,endTick) on a lane, slicing/dropping
    // overlapped clips (excluding `excludeId`), returning the pre-state `before` snapshot for the recycle
    // buffer + the surviving `kept` clips. Factored out of placeTake so RECORD, clip-move, and paste share
    // ONE destructive-through-recycle rule (rule 2 / one consistent overlap semantic everywhere).
    function overwriteLaneRegion(laneId, startTick, endTick, excludeId) {
      var before = E.timeline.clips.filter(function (c) { return c.ch === laneId; }).map(function (c) { return JSON.parse(JSON.stringify(c)); });
      var kept = [];
      E.timeline.clips.forEach(function (c) {
        if (c.ch !== laneId) { kept.push(c); return; }      // other lanes: untouched
        if (c.id === excludeId) { return; }                 // the moved clip itself: caller re-adds it
        var cs = c.startTick || 0, ce = cs + (c.lengthTicks || 0);
        if (ce <= startTick || cs >= endTick) { kept.push(c); return; }            // no overlap -> keep
        if (cs < startTick) { var L = JSON.parse(JSON.stringify(c)); L.id = E._newClipId(); L.lengthTicks = startTick - cs; kept.push(L); }
        if (ce > endTick) { var R = JSON.parse(JSON.stringify(c)); R.id = E._newClipId(); R.startTick = endTick; R.lengthTicks = ce - endTick; if (R.kind === "audio") R.offsetTicks = (R.offsetTicks || 0) + (endTick - cs); kept.push(R); }
        // fully-covered clips are dropped (preserved in `before` for undo)
      });
      return { before: before, kept: kept };
    }

    // ---- Producer-style clip interactivity on Rec-Audio lanes (decision 4) ---------------------------
    // Click selects; left-drag moves the clip along ITS OWN lane, snapped, live; drop commits with the
    // shared overlap/recycle rule. Reuses the file-09 onClipDown drag-loop pattern (mousedown->mv->up).
    // Backing/Project lanes are inert (guarded by the caller).
    function studioClipDown(e, clip) {
      if (e.button !== 0) return; e.stopPropagation();
      setSelClip(clip.id); setRangeSel(null);                          // clip-select clears any active range (modes are exclusive)
      var el = e.currentTarget.closest(".sm-lanes"); if (!el) return;
      var r = el.getBoundingClientRect(), contentW = Math.max(1, (r.right - 12) - (r.left + 232));
      var maxT = fitTicksRef.current || studioSessionTicks();
      var sx = e.clientX, orig = clip.startTick;
      var pre = E.timeline.clips.filter(function (c) { return c.ch === clip.ch; }).map(function (c) { return JSON.parse(JSON.stringify(c)); });
      var moved = false;
      function mv(ev) {
        var dTick = (ev.clientX - sx) / contentW * maxT;
        var nt = Math.max(0, E.snapTick(orig + dTick));
        if (nt !== clip.startTick) { clip.startTick = nt; moved = moved || nt !== orig; forceRender(); }
      }
      function up() {
        window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
        if (!moved) return;                                             // pure click = select only
        var res = overwriteLaneRegion(clip.ch, clip.startTick, clip.startTick + clip.lengthTicks, clip.id);
        E.timeline.clips = res.kept.concat([clip]);                     // moved clip survives; others sliced
        recycleRef.current.push({ type: "record", laneId: clip.ch, before: pre, newClipId: clip.id });
        E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
        bump();
      }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // Ctrl/Cmd+C — copy the selected clip (deep copy incl. bufferId; buffer stays shared on paste).
    function studioCopyClip() {
      if (!selClip) return; var c = E.timeline.clips.find(function (x) { return x.id === selClip; });
      var d = c && E.channels[c.ch] ? E.channels[c.ch].def : null;
      if (!c || (d && isBackingDef(d))) return;                        // backing clips aren't copyable
      studioClipboard.current = JSON.parse(JSON.stringify(c)); studioClipMode.current = "clip";
      toast("Clip copied · Ctrl+V to paste at the red line", h(I.Note, { width: 16, height: 16 }));
    }
    // Ctrl/Cmd+V — paste onto the SAME lane at the red-line position (confirmed default). New id, shared
    // buffer (non-destructive copy); overlap resolves through the recycle buffer (one Ctrl+Z restores).
    function studioPasteClip() {
      var src = studioClipboard.current; if (!src) return;
      var d = E.channels[src.ch] ? E.channels[src.ch].def : null;
      if (!d || isBackingDef(d)) { toast("That lane is locked", h(I.X, null)); return; }
      var start = Math.max(0, recStartTick), len = src.lengthTicks, end = start + len;
      var res = overwriteLaneRegion(src.ch, start, end, null);
      var nc = JSON.parse(JSON.stringify(src)); nc.id = E._newClipId(); nc.startTick = start;   // shares src.bufferId (buffer reused)
      E.timeline.clips = res.kept.concat([nc]);
      recycleRef.current.push({ type: "record", laneId: src.ch, before: res.before, newClipId: nc.id });
      E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
      setSelClip(nc.id); setStudioSel(src.ch); bump();
      toast("Clip pasted · Ctrl+Z to undo", h(I.Note, { width: 16, height: 16 }));
    }
    // ================= Fix B: bar-range selection / copy / paste / delete inside audio lanes =============
    // Studio-view grid snap: 1/16 by default, 1/16-triplet when the shared triplet toggle is on. Mirrors
    // the Producer marquee's snap discipline (file 09) adapted to the fit-scaled single-lane coordinates.
    function studioSnap(tick) {
      var S = triplet ? Math.round(E.PPQ / 6) : E.SNAP_TICKS;          // PPQ/6 = 1/16T ; SNAP_TICKS = 1/16
      return Math.max(0, Math.round(tick / S) * S);
    }
    // Right-drag across a NON-backing lane body selects a snapped TIME RANGE on THAT lane (per-lane this
    // build). Reuses the file-09 marquee gesture shape (right-button drag, live rect, normalize on release);
    // coordinates come from the lane body's own rect (each lane is its own fit-scaled track).
    function studioRangeDown(e, laneId) {
      if (e.button !== 2) return;
      e.preventDefault(); e.stopPropagation();
      var d = E.channels[laneId] ? E.channels[laneId].def : null;
      if (!d || isBackingDef(d)) return;                               // backing/Project lanes are inert
      setSelClip(null);                                                // range + clip selection are mutually exclusive
      var body = e.currentTarget, r = body.getBoundingClientRect();
      var maxT = fitTicksRef.current || studioSessionTicks();
      function tickAt(ev) { var f = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width))); return studioSnap(f * maxT); }
      var a = tickAt(e);
      function apply(ev) { var b = tickAt(ev); setRangeSel({ ch: laneId, startTick: Math.min(a, b), endTick: Math.max(a, b) }); }
      apply(e);
      function mv(ev) { apply(ev); }
      function up(ev) {
        window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
        if (Math.abs(tickAt(ev) - a) < E.SNAP_TICKS / 2) setRangeSel(null);   // a click (no real drag) selects nothing
      }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // Delete ONLY the selected range: split intersected clips at the range boundaries (same non-destructive
    // slice math as splitClipAt / overwriteLaneRegion), drop the middle, leave a gap. The lane's pre-state
    // goes to the recycle buffer so one Ctrl/Cmd+Z restores it.
    function deleteRange() {
      var rng = rangeSel; if (!rng || rng.endTick <= rng.startTick) { setRangeSel(null); return; }
      var d = E.channels[rng.ch] ? E.channels[rng.ch].def : null;
      if (!d || isBackingDef(d)) { setRangeSel(null); return; }
      var res = overwriteLaneRegion(rng.ch, rng.startTick, rng.endTick, null);
      E.timeline.clips = res.kept;                                     // gap left where the range was
      recycleRef.current.push({ type: "record", laneId: rng.ch, before: res.before, newClipId: null });
      E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
      setRangeSel(null); setSelClip(null); bump();
      toast("Range deleted · Ctrl+Z to undo", h(I.X, { width: 16, height: 16 }));
    }
    // Copy the in-range portions of intersected clips as independent segments (buffers SHARED), stored
    // relative to the range start so paste can re-anchor them at the red line.
    function studioCopyRange() {
      var rng = rangeSel; if (!rng || rng.endTick <= rng.startTick) return;
      var items = [];
      E.timeline.clips.forEach(function (c) {
        if (c.ch !== rng.ch || c.kind !== "audio") return;
        var cs = c.startTick || 0, ce = cs + (c.lengthTicks || 0);
        var s = Math.max(cs, rng.startTick), en = Math.min(ce, rng.endTick);
        if (en <= s) return;                                           // no overlap with the range
        var seg = JSON.parse(JSON.stringify(c));
        seg.startOffset = s - rng.startTick;                           // position of this segment within the copied span
        seg.lengthTicks = en - s;
        seg.offsetTicks = (c.offsetTicks || 0) + (s - cs);             // window into the shared buffer
        items.push(seg);
      });
      if (!items.length) { toast("Range is empty — nothing to copy", h(I.X, null)); return; }
      studioRangeClip.current = { ch: rng.ch, span: rng.endTick - rng.startTick, items: items };
      studioClipMode.current = "range";
      toast(items.length + " segment" + (items.length === 1 ? "" : "s") + " copied · Ctrl+V pastes at the red line", h(I.Note, { width: 16, height: 16 }));
    }
    // Paste the copied range at the red line on the SOURCE lane (confirmed default). Segments become
    // independent clips (new ids) sharing the source buffers; the pasted span overwrites overlapped
    // material through the recycle rule (one Ctrl/Cmd+Z restores).
    function studioPasteRange() {
      var rc = studioRangeClip.current; if (!rc || !rc.items.length) return;
      var d = E.channels[rc.ch] ? E.channels[rc.ch].def : null;
      if (!d || isBackingDef(d)) { toast("That lane is locked", h(I.X, null)); return; }
      var base = Math.max(0, recStartTick), span = Math.max(E.SNAP_TICKS, rc.span);
      var res = overwriteLaneRegion(rc.ch, base, base + span, null);
      var added = rc.items.map(function (seg) {
        var nc = JSON.parse(JSON.stringify(seg)); nc.id = E._newClipId(); nc.startTick = base + (seg.startOffset || 0); delete nc.startOffset; return nc;
      });
      E.timeline.clips = res.kept.concat(added);
      recycleRef.current.push({ type: "record", laneId: rc.ch, before: res.before, newClipId: null });
      E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
      setStudioSel(rc.ch); setRangeSel(null); bump();
      toast("Range pasted · Ctrl+Z to undo", h(I.Note, { width: 16, height: 16 }));
    }
    // Ctrl+C / Ctrl+V dispatch: a range takes precedence over a whole-clip selection; paste follows the
    // clipboard that was last filled. Whole-clip copy/paste (prior build) is untouched when no range exists.
    function studioCopy() { if (rangeSel) studioCopyRange(); else studioCopyClip(); }
    function studioPaste() { if (studioClipMode.current === "range" && studioRangeClip.current) studioPasteRange(); else studioPasteClip(); }
    // load a decoded buffer as a locked "Project" backing track (bounce OR upload). Always labeled
    // "Project"; type:'backing' (trackType), locked/read-only. Backing tracks stack (append) — never
    // a lane-0 race — and render sorted-first in the Studio views.
    function loadBacking(source, buf, blob) {
      var r = E.addMelodyFile("Project", buf, blob);
      if (r && r.def) {
        r.def.workspace = "studio";   // backing is Studio-owned (addMelodyFile defaults its lane to producer)
        r.def.backing = true; r.def.locked = true; r.def.trackType = "backing";
        r.def.meta = { created: 0, source: source, readOnly: true };
        ensureStudioModel(r.def);
        setStudioSel(r.def.id);        // a backing selection is a manual, read-only focus
      }
      setView("timeline"); setFocus(E.focus); bump();
      toast("Project track loaded", h(I.Wave, { width: 16, height: 16 }));
    }
    // "Add Producer Track" — bounce the CURRENTLY loaded arrangement via renderMixdown (no state swap).
    // Reentry-guarded by `bouncing` (button shows progress + disables for the render duration).
    function bounceCurrent() {
      if (bouncing) return;
      setBouncing(true); setBounceProg(0);
      E.renderMixdown(function (pr) { setBounceProg(pr); }, function (blob) {
        setBouncing(false);
        if (!blob) { toast("Bounce failed", h(I.X, null)); return; }
        E.decodeAudioFile(blob, function (buf) { loadBacking("bounced", buf, blob); }, function () { toast("Could not decode bounce", h(I.X, null)); });
      });
    }
    // Option B — upload a WAV/MP3 as the backing track
    function uploadBacking(file) {
      E.decodeAudioFile(file, function (buf) { loadBacking("uploaded", buf, file); }, function () { toast("Could not decode " + file.name, h(I.X, null)); });
    }
    // Replace Backing — re-bounce the current arrangement and swap the backing clip's buffer IN PLACE
    // (same channel id / route / clip id). Reentry-guarded; synchronous stop first. No delete+recreate.
    function replaceBacking(id) {
      if (bouncing) return;
      var ch = E.channels[id]; if (!ch) return;
      var clip = E.timeline.clips.filter(function (cl) { return cl.ch === id && cl.kind === "audio"; })[0];
      if (!clip) { toast("No backing clip to replace", h(I.X, null)); return; }
      studioStop();                                          // de-click if the backing is sounding
      setBouncing(true); setBounceProg(0);
      E.renderMixdown(function (pr) { setBounceProg(pr); }, function (blob) {
        setBouncing(false);
        if (!blob) { toast("Re-bounce failed", h(I.X, null)); return; }
        E.decodeAudioFile(blob, function (buf) {
          E.userBuffers[clip.bufferId] = buf;                // atomic in-place swap
          clip.peaks = E.computePeaks(buf);
          clip.lengthTicks = Math.max(E.SNAP_TICKS, E.secToTick(buf.duration));
          clip.trimmed = false; clip.offsetTicks = 0;
          if (blob instanceof Blob) { try { E.SampleDB && E.SampleDB.put(clip.bufferId, blob); } catch (e) {} }
          E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
          bump(); toast("Backing replaced (re-bounced)", h(I.Wave, { width: 16, height: 16 }));
        }, function () { toast("Could not decode re-bounce", h(I.X, null)); });
      });
    }
    // reuse the FileBrowser import flows from the Studio panel via a transient picker
    function pickFiles(accept, multiple, cb) { var inp = document.createElement("input"); inp.type = "file"; inp.accept = accept; if (multiple) inp.multiple = true; inp.onchange = function () { if (inp.files && inp.files.length) cb(inp.files); }; inp.click(); }
    function studioAddMelody() { pickFiles("audio/*,video/*", true, function (files) { Array.prototype.forEach.call(files, function (f) { E.decodeAudioFile(f, function (buf) { E.addMelodyFile(f.name, buf, f); setView("timeline"); setFocus(E.focus); bump(); toast("Added melody: " + f.name, h(I.Wave, { width: 16, height: 16 })); }, function () { toast("Could not decode " + f.name, h(I.X, null)); }); }); }); }
    function studioMelodyMaker() { pickFiles("audio/*", false, function (files) { var f = files[0]; E.decodeAudioFile(f, function (buf) { var d = E.addPolySamplerTrack(f.name, buf, f); setView("timeline"); setFocus(E.focus); E.setFocus(E.focus); lastTonal.current = d.id; bump(); toast("Melody Maker: " + d.label, h(I.Note, { width: 16, height: 16 })); }, function () { toast("Could not decode " + f.name, h(I.X, null)); }); }); }
    // Add a Studio audio lane (workspace:'studio' — never mirrors into the Producer grid). The new lane
    // becomes the selected track, which is also the record target (dropdown = single authority).
    function addAudioLaneTrack() { var d = E.addAudioTrack(undefined, "studio"); setStudioSel(d.id); setFocus(E.focus); E.setFocus(E.focus); bump(); toast("Added " + d.label + " — selected as record target", h(I.Plus, { width: 16, height: 16 })); }
    // ---- Sprint B: live microphone capture flow (replaces the stub) ------------
    // Single cancellable state machine: idle -> (permission) -> countin -> recording -> place clip.
    // ONE transport: the count-in starts mode-scoped playback one bar early; capture engages sample-
    // accurately on the next downbeat via the engine worklet gate. RECORD press routes here.
    var TPB = E.TICKS_PER_BAR;
    function toggleRecord() {
      if (recPhase === "recording") { finishCapture(); return; }
      if (recPhase === "countin") { cancelCapture("Recording cancelled"); return; }   // 2nd press aborts count-in
      startCaptureFlow();
    }
    function startCaptureFlow() {
      var flow = recFlowRef.current;
      if (flow.busy) return;                                   // no double-arm on rapid presses
      var d = studioSel && E.channels[studioSel] ? E.channels[studioSel].def : null;
      if (!d) { setRecErr("Select a track to enable recording"); return; }
      if (isBackingDef(d)) { setRecErr("Backing track is read-only"); return; }
      flow.busy = true; flow.cancelled = false; flow.timers = []; flow.oscs = []; flow.laneId = studioSel;
      setRecErr(null);
      // PERMISSION-FIRST (rule 4): verify the mic BEFORE the count-in starts.
      E.armMicCapture({
        onReady: function (latency) {
          if (flow.cancelled) { flow.busy = false; return; }
          // capture point = the RED record-start line (decision 3). Capture engages exactly AT the line
          // and the write head sweeps from there.
          var start = Math.max(0, recStartTick);
          flow.captureTick = start; flow.latency = latency;
          var beatSec = 60 / E.getBPM();                       // 60000/BPM ms per beat
          studioStop(); if (E.isPlaying) E.pause();
          // COUNT-IN (Fix 3) — ALWAYS a full 4-beat, tempo-synced count-in. The prior pass tied the beat
          // count to the lead-in DISTANCE, so a red line at the default 0 gave 0 beats + immediate engage
          // (count-in destroyed). Now: if there's a full bar before the line, the backing rolls now as a
          // one-bar lead-in and capture engages when the playhead reaches the line (4 beats later). If the
          // line sits inside bar 1 (incl. the default 0), the count-in is clicks-only and the backing +
          // capture start TOGETHER on the downbeat. Either way it's 4 clicks + a 1-2-3-4 flash.
          var t0, engageTime, rollAtEngage;
          if (start >= TPB) {
            E.start("timeline"); E.seek(start - TPB);          // roll from one bar before; start() resets, seek re-anchors _phPoint
            t0 = (E._phPoint && E._phPoint.time) || (E.ctx.currentTime + 0.06);
            engageTime = t0 + 4 * beatSec;                     // playhead reaches `start` exactly here
            rollAtEngage = false;
          } else {
            t0 = E.ctx.currentTime + 0.12;                     // clicks only; transport idle through the count-in
            engageTime = t0 + 4 * beatSec;
            rollAtEngage = true;
          }
          for (var i = 0; i < 4; i++) flow.oscs.push(E.metronomeClick(t0 + i * beatSec, i === 0));   // 4 tempo-synced clicks
          // arm sample-accurate engagement; onEngage fires from the capture node the instant copying begins
          E.beginMicCapture(engageTime, function () {
            if (flow.cancelled) return;
            if (rollAtEngage) { E.start("timeline"); E.seek(start); }   // backing begins WITH capture on the downbeat
            setCountBeat(0); setRecPhase("recording");
            var poll = function () {
              if (recFlowRef.current.cancelled || !E.isMicCapturing()) return;
              var st = Math.max(0, flow.captureTick - E.secToTick(flow.latency + E.recCalibSec()));   // Fix A: match placeTake (capture latency + calibration)
              var len = Math.max(E.SNAP_TICKS, E.secToTick(E.captureElapsed()));
              setRecPreview({ ch: flow.laneId, startTick: st, lengthTicks: len, peaks: E.capturePeaks(600) });
              refitStudio({ growing: true, extra: st + len });          // live re-fit when the take extends the session (throttled inside)
              recFlowRef.current.raf = requestAnimationFrame(poll);
            };
            recFlowRef.current.raf = requestAnimationFrame(poll);
          }, null);
          setRecPhase("countin"); setCountBeat(1);
          for (var b = 1; b <= 4; b++) (function (bb) {                 // always the full 1-2-3-4 flash
            flow.timers.push(setTimeout(function () { if (!recFlowRef.current.cancelled) setCountBeat(bb); }, (bb - 1) * beatSec * 1000));
          })(b);
        },
        onError: function () {
          flow.busy = false; setRecPhase("idle"); setCountBeat(0);
          setRecErr("Microphone access denied — check browser settings");
          toast("Microphone access denied — check browser settings", h(I.X, null));
        }
      });
    }
    function finishCapture() {
      var flow = recFlowRef.current;
      if (flow.raf) cancelAnimationFrame(flow.raf);
      E.stopMicCapture(function (result) {
        E.stop(); setPlaying(false); setPlayStep(-1); setPlayBar(-1);
        setRecPhase("idle"); setRecPreview(null); setCountBeat(0); flow.busy = false;
        if (!result || !result.buffer) { toast("Nothing captured", h(I.X, null)); return; }
        placeTake(flow.laneId, flow.captureTick, result);
      });
    }
    function cancelCapture(msg) {
      var flow = recFlowRef.current; flow.cancelled = true; flow.busy = false;
      flow.timers.forEach(function (t) { clearTimeout(t); }); flow.timers = [];
      (flow.oscs || []).forEach(function (o) { try { o.stop(); } catch (e) {} }); flow.oscs = [];
      if (flow.raf) cancelAnimationFrame(flow.raf);
      E.cancelMicCapture();
      if (E.isPlaying) E.stop();
      setPlaying(false); setPlayStep(-1); setPlayBar(-1);
      setRecPhase("idle"); setCountBeat(0); setRecPreview(null);
      if (msg) toast(msg, h(I.X, null));
    }
    // place the captured buffer as a clip: latency-shifted, DESTRUCTIVELY overwriting overlapped clip
    // data on the target lane — but the whole lane's prior state goes to the session recycle buffer so
    // one Ctrl/Cmd+Z restores it (destructive on the timeline, recoverable in session; rule 2).
    function placeTake(laneId, captureTick, result) {
      var bufId = "cap_" + (++E._recSeq);
      E.userBuffers[bufId] = result.buffer;
      var comp = (result.latencySec || 0) + E.recCalibSec();                            // Fix A: capture-side latency + session calibration
      var startTick = Math.max(0, captureTick - E.secToTick(comp));                     // latency compensation (rule 6)
      var lengthTicks = Math.max(E.SNAP_TICKS, E.secToTick(result.durSec));
      var endTick = startTick + lengthTicks;
      var before = E.timeline.clips.filter(function (c) { return c.ch === laneId; }).map(function (c) { return JSON.parse(JSON.stringify(c)); });
      var kept = [];
      E.timeline.clips.forEach(function (c) {
        if (c.ch !== laneId) { kept.push(c); return; }
        var cs = c.startTick || 0, ce = cs + (c.lengthTicks || 0);
        if (ce <= startTick || cs >= endTick) { kept.push(c); return; }   // no overlap -> keep
        if (cs < startTick) { var left = JSON.parse(JSON.stringify(c)); left.id = E._newClipId(); left.lengthTicks = startTick - cs; kept.push(left); }
        if (ce > endTick) { var right = JSON.parse(JSON.stringify(c)); right.id = E._newClipId(); right.startTick = endTick; right.lengthTicks = ce - endTick; if (right.kind === "audio") right.offsetTicks = (right.offsetTicks || 0) + (endTick - cs); kept.push(right); }
        // fully-covered clips are dropped (preserved in `before` for undo)
      });
      var clip = { id: E._newClipId(), kind: "audio", ch: laneId, startTick: startTick, lengthTicks: lengthTicks,
        bufferId: bufId, offsetTicks: 0, name: "Take", peaks: E.computePeaks(result.buffer), gain: 1,
        fadeInTicks: 0, fadeOutTicks: 0, trimmed: true,
        meta: { source: "mic", latencyOffsetSec: comp, measuredLatencySec: result.latencySec || 0, calibMs: E.getRecCalib(), capturedAt: Date.now() } };
      kept.push(clip); E.timeline.clips = kept;
      recycleRef.current.push({ type: "record", laneId: laneId, before: before, newClipId: clip.id });
      try { var blob = E._encodeWav(result.buffer); if (E.SampleDB) E.SampleDB.put(bufId, blob); } catch (e) {}
      E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
      setStudioSel(laneId); setFocus(E.focus); bump();
      var lbl = E.channels[laneId] && E.channels[laneId].def ? E.channels[laneId].def.label : "track";
      toast("Take recorded → " + lbl + " · Ctrl+Z to undo", h(I.Mic, { width: 16, height: 16 }));
    }
    function linkFolderFromStudio() { setStudio(false); setRailCol(false); toast("Link folders from the Producer library (sidebar)", h(I.Folder, { width: 16, height: 16 })); }

    // ---- Studio Restructure handlers -------------------------------------------
    // context-change audio safety: stop scoped voices synchronously BEFORE any UI state change.
    function studioStop() { try { E.scope.stopScopeVoices(); } catch (e) {} }
    // Track selection is the SINGLE authority: it drives both the Plugins panel focus AND the record
    // target. A track-row / lane / dropdown click routes here (synchronous stop first, as always).
    function selectStudioTrack(id, manual) { studioStop(); setStudioSel(id); doFocus(id); }
    // [M] mute — de-click gain ramp (never a hard cut); toggles def.uiMuted; works on all tracks.
    function toggleStudioMute(id) {
      studioStop();
      var ch = E.channels[id]; if (!ch) return;
      var d = ch.def; d.uiMuted = !d.uiMuted;
      try { var t = E.ctx.currentTime; ch.gain.gain.cancelScheduledValues(t); ch.gain.gain.setTargetAtTime(d.uiMuted ? 0.0001 : (ch.vol || d.vol || 0.9), t, 0.01); } catch (e) {}
      bump();
    }
    // [✕] delete — confirmation modal, then ONE atomic synchronous sequence (no intermediate renders).
    function requestDeleteStudioTrack(id) {
      var ch = E.channels[id]; if (!ch) return;
      if (isBackingDef(ch.def)) return;                 // delete hidden/blocked on backing
      setDelConfirm({ id: id, label: ch.def.label });
    }
    function confirmDeleteStudioTrack() {
      var pending = delConfirm; if (!pending) return;
      var id = pending.id, ch = E.channels[id]; if (!ch) { setDelConfirm(null); return; }
      var label = ch.def.label;
      studioStop();                                     // 1) stop scoped voices + de-click
      // 2) compute the next selection BEFORE removal (next editable track, else null). Because
      // selection IS the record target, this is also the record-target fallback on delete.
      var remaining = studioTracks(E.studioDefs()).filter(function (c) { return c.id !== id; });
      var nextEditable = remaining.filter(function (c) { return !isBackingDef(c); })[0] || remaining[0];
      var nextSel = nextEditable ? nextEditable.id : null;
      // 4) SOFT delete — capture {def, clips, buffers} to the session recycle buffer, then detach.
      var clips = E.timeline.clips.filter(function (cl) { return cl.ch === id; });
      var buffers = {}; clips.forEach(function (c) { if (c.bufferId && E.userBuffers[c.bufferId]) buffers[c.bufferId] = E.userBuffers[c.bufferId]; });
      ch.def.deletedAt = Date.now();
      recycleRef.current.push({ type: "delete", def: ch.def, clips: clips.map(function (c) { return JSON.parse(JSON.stringify(c)); }), buffers: buffers });
      E.removeChannel(id);                              // engine keeps userBuffers in memory
      E.timeline.clips = E.timeline.clips.filter(function (cl) { return cl.ch !== id; });
      if (lastTonal.current === id) lastTonal.current = null;
      // 5) single UI commit
      setStudioSel(nextSel); setFocus(E.focus); E.setFocus(E.focus);
      setDelConfirm(null); bump();
      toast(label + " deleted · Ctrl+Z to undo", h(I.Trash, { width: 16, height: 16 }));
    }
    // Undo the last soft-delete — reattach the track (new lane), restore its buffers + clips + model.
    function studioUndo() {
      var rec = recycleRef.current.pop(); if (!rec) { toast("Nothing to undo", h(I.Reset, null)); return; }
      studioStop();
      // record-overwrite undo: drop the new take + restore the lane's pre-recording clip state (rule 2)
      if (rec.type === "record") {
        E.timeline.clips = E.timeline.clips.filter(function (c) { return c.ch !== rec.laneId; }).concat(rec.before);
        E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
        setStudioSel(rec.laneId); setFocus(E.focus); E.setFocus(E.focus); bump();
        toast("Recording undone — take removed, track restored", h(I.Reset, { width: 16, height: 16 }));
        return;
      }
      var od = rec.def;
      var nd = E.addAudioTrack(od.label, "studio");     // fresh lane: bank rows + wired nodes + id (Studio-owned)
      nd.workspace = "studio";
      nd.trackType = od.trackType; nd.pluginState = od.pluginState; nd.meta = od.meta;
      nd.backing = od.backing; nd.locked = od.locked; nd.uiMuted = od.uiMuted; nd.deletedAt = null;
      if (od.color) nd.color = od.color;
      rec.clips.forEach(function (c) {
        if (c.bufferId && rec.buffers[c.bufferId]) E.userBuffers[c.bufferId] = rec.buffers[c.bufferId];
        var nc = JSON.parse(JSON.stringify(c)); nc.ch = nd.id; E.timeline.clips.push(nc);
      });
      E.recomputeTimelineLength(); if (E._refreshTimelineEvents) E._refreshTimelineEvents();
      setStudioSel(nd.id); setFocus(E.focus); E.setFocus(E.focus); bump();
      toast("Restored " + nd.label, h(I.Reset, { width: 16, height: 16 }));
    }
    // ---- project controls (Phase 1: New / Slots / Export-Import) ----
    var SLOT_IDX = "chefs_project_slots", SLOT_PREFIX = "chefs_slot:";
    var slS = useState(function () { try { return JSON.parse(localStorage.getItem(SLOT_IDX) || "[]"); } catch (e) { return []; } });
    var slots = slS[0], setSlots = slS[1];
    function refreshSlots() { try { setSlots(JSON.parse(localStorage.getItem(SLOT_IDX) || "[]")); } catch (e) { setSlots([]); } }
    function syncFromEngine() { setBpm(E.tempo); setSwing(E.swing); setMaster(E.master ? E.master.gain.value : 0.9); setActive(E.activePattern); setFocus(E.focus); }
    function newProject() { E.newProject(); try { localStorage.removeItem("chefs_studio_session"); } catch (e) {} syncFromEngine(); setView("timeline"); bump(); toast("New clean project", h(I.Reset, { width: 16, height: 16 })); }
    // ---- dual master export (WAV download; no track insertion) ----
    function dlBlob(blob, name) { var u = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 800); }
    // Producer master = renderMixdown (arrangement bounce) → WAV. Does NOT insert a track.
    function exportProducerMaster() {
      if (exporting) return;
      try { E.scope.stopScopeVoices(); } catch (e) {}
      if (E.isPlaying) { E.pause(); setPlaying(false); setPlayStep(-1); }
      setExporting("producer"); setExportProg(0);
      E.renderMixdown(function (p) { setExportProg(p); }, function (blob) {
        setExporting(null); setExportProg(0);
        if (!blob) { toast("Producer master failed", h(I.X, null)); return; }
        dlBlob(blob, "chefs-remix-producer-master.wav"); toast("Producer master · chefs-remix-producer-master.wav", h(I.Check, null));
      });
    }
    // Rec Audio master = offline render of backing + unmuted audio lanes through their plugin chains → WAV.
    function exportRecAudioMaster() {
      if (exporting) return;
      try { E.scope.stopScopeVoices(); } catch (e) {}
      if (E.isPlaying) { E.pause(); setPlaying(false); setPlayStep(-1); }
      setExporting("recaudio"); setExportProg(0);
      E.renderRecAudioMaster(function (p) { setExportProg(p); }, function (blob) {
        setExporting(null); setExportProg(0);
        if (!blob) { toast("Nothing to mix yet", h(I.X, null)); return; }
        dlBlob(blob, "chefs-remix-recaudio-master.wav"); toast("Rec Audio master · chefs-remix-recaudio-master.wav", h(I.Check, null));
      });
    }
    // Phase 7: serialize the session Studio pluginState (+ muted, trackType) alongside the engine
    // project on EXPLICIT save only. Autosave (scheduleSave) stays untouched → no reload persistence.
    function serializeWithStudio() {
      var data = E.serialize(); data.studio = {};
      E.studioDefs().forEach(function (c) {
        if (c.pluginState) data.studio[c.id] = { pluginState: c.pluginState, muted: !!c.uiMuted, trackType: c.trackType };
      });
      return data;
    }
    // restore Studio state onto matching defs after a hydrate; re-apply to live nodes.
    function restoreStudioSave(data) {
      if (!data || !data.studio) return;
      Object.keys(data.studio).forEach(function (id) {
        var ch = E.channels[id]; if (!ch) return; var s = data.studio[id];
        ensureStudioModel(ch.def);
        ch.def.workspace = "studio";   // any track carrying Studio state is Studio-owned (corrects legacy backing migration)
        if (s.pluginState) ch.def.pluginState = s.pluginState;
        if (s.trackType) { ch.def.trackType = s.trackType; if (s.trackType === "backing") { ch.def.backing = true; ch.def.locked = true; } }
        ch.def.uiMuted = !!s.muted;
        try { if (window.__studioApply) window.__studioApply(ch.def); } catch (e) {}
        if (ch.def.uiMuted) { try { ch.gain.gain.setTargetAtTime(0.0001, E.ctx.currentTime, 0.01); } catch (e2) {} }
      });
    }
    function exportProject() {
      try {
        var blob = new Blob([JSON.stringify(serializeWithStudio())], { type: "application/json" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "chefs-remix-project.json"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast("Exported project .json", h(I.Download, { width: 16, height: 16 }));
      } catch (e) { toast("Export failed", h(I.X, null)); }
    }
    function importProjectFile(file) {
      var fr = new FileReader();
      fr.onload = function () { try { var data = JSON.parse(fr.result); if (E.hydrate(data)) { restoreStudioSave(data); syncFromEngine(); bump(); toast("Project imported", h(I.Check, { width: 16, height: 16 })); } else toast("Incompatible project file", h(I.X, null)); } catch (e) { toast("Invalid project file", h(I.X, null)); } };
      fr.onerror = function () { toast("Couldn't read file", h(I.X, null)); };
      fr.readAsText(file);
    }
    function saveSlot(nm2) { try { localStorage.setItem(SLOT_PREFIX + nm2, JSON.stringify(serializeWithStudio())); var idx = JSON.parse(localStorage.getItem(SLOT_IDX) || "[]"); if (idx.indexOf(nm2) < 0) idx.push(nm2); localStorage.setItem(SLOT_IDX, JSON.stringify(idx)); setSlots(idx); toast("Saved “" + nm2 + "”", h(I.Check, { width: 16, height: 16 })); } catch (e) { toast("Slot save failed (storage full?)", h(I.X, null)); } }
    function loadSlot(nm2) { try { var raw = localStorage.getItem(SLOT_PREFIX + nm2); if (raw) { var data = JSON.parse(raw); if (E.hydrate(data)) { restoreStudioSave(data); syncFromEngine(); bump(); toast("Loaded “" + nm2 + "”", h(I.Check, { width: 16, height: 16 })); } else toast("Slot unreadable", h(I.X, null)); } else toast("Slot unreadable", h(I.X, null)); } catch (e) { toast("Load failed", h(I.X, null)); } }
    function deleteSlot(nm2) { try { localStorage.removeItem(SLOT_PREFIX + nm2); var idx = JSON.parse(localStorage.getItem(SLOT_IDX) || "[]").filter(function (n) { return n !== nm2; }); localStorage.setItem(SLOT_IDX, JSON.stringify(idx)); setSlots(idx); } catch (e) {} }

    // derived state — Producer surfaces read the Producer collection ONLY (isolation). Studio lanes
    // never appear in the rack/mixer/route-count.
    var producerDefs = E.producerDefs();
    var channelState = {}; producerDefs.forEach(function (c) { var ch = E.channels[c.id]; channelState[c.id] = { route: ch.route, vol: ch.vol, pan: ch.pan, muted: ch.muted, solo: ch.solo }; });
    var litMap = {}; if (playing && playStep >= 0 && mode === "pattern") { producerDefs.forEach(function (c) { litMap[c.id] = E.banks[active].steps[c.id][playStep].on; }); }
    var routeCount = {}; producerDefs.forEach(function (c) { routeCount[c.route] = (routeCount[c.route] || 0) + 1; });
    var insertState = E.insertDefs.map(function (d) { var ins = E.inserts[d.id]; return { id: d.id, name: d.name, vol: ins.vol, pan: ins.panVal, mute: ins.mute, solo: ins.solo, micOn: !!ins.micOn, fx: ins.fx.map(function (s) { return { type: s.type, bypass: s.bypass }; }), routeCount: routeCount[d.id] || 0 }; });

    // Rec Audio master availability: any unmuted audio lane with an audio clip (backing counts).
    var recAudioAvailable = E.studioDefs().some(function (c) { return !c.uiMuted && E.timeline.clips.some(function (cl) { return cl.ch === c.id && cl.kind === "audio"; }); });

    var focusCh = (focus && E.channels[focus]) ? E.channels[focus].def : null;
    var prCh = focusCh && focusCh.tonal ? focusCh
      : ((lastTonal.current && E.channels[lastTonal.current]) ? E.channels[lastTonal.current].def : focusCh);

    function setTool(t) { setToolMode(t); }
    var commands = [
      { id: "play", label: playing ? "Stop" : "Play", hint: "Space", run: togglePlay },
      { id: "undo", label: "Undo", hint: "Ctrl+Z", run: doUndo },
      { id: "redo", label: "Redo", hint: "Ctrl+Y", run: doRedo },
      { id: "add", label: "Add Track", run: function () { addTrack("kick"); } },
      { id: "new", label: "New Clean Project", run: newProject },
      { id: "export", label: "Export… (Mixdown / Stems)", run: function () { setShowEx(true); } },
      { id: "save", label: "Export Project (.json)", run: exportProject },
      { id: "keys", label: "Toggle Musical Typing", hint: "⌨", run: function () { var nx = !musTyping; setMusTyping(nx); musRef.current = nx; } },
      { id: "midi", label: "Enable MIDI Input", run: function () { E.enableMIDI(function (ok, info) { if (ok) { setMidiOn(true); toast("MIDI ready · " + info + " input(s)", h(I.Piano, { width: 16, height: 16 })); } else toast("MIDI: " + info, h(I.X, null)); }); } },
      { id: "v-timeline", label: "Go to Timeline", run: function () { setView("timeline"); } },
      { id: "tool-arrow", label: "Arrow Tool", hint: "V", run: function () { setTool("arrow"); } },
      { id: "tool-marquee", label: "Marquee Tool", hint: "M", run: function () { setTool("marquee"); } }
    ];

    // Timeline-first (Pass 3 T1): Channel Rack + Piano Roll are no longer top-level nav entries —
    // both components still render inside the Clip Editor (Steps / Notes) and the per-clip Piano Roll.
    var TABS = [{ id: "timeline", label: "Timeline", ic: I.Timeline }];
    var editingClip = (editClip && E.timeline.clips.indexOf(editClip) >= 0) ? editClip : null;   // guard against deleted/undone clips

    // live mirror for the global key handler (Studio M/Del/R/Ctrl+Z shortcuts)
    studioKbdRef.current = { studio: studio, sel: studioSel, range: !!rangeSel, mute: toggleStudioMute, del: requestDeleteStudioTrack, delRange: deleteRange, clearRange: function () { setRangeSel(null); }, undo: studioUndo, copy: studioCopy, paste: studioPaste };
    E._recMode = studio;   // mode-scoped playback filter (Producer=false, Rec Audio=true)

    return h(React.Fragment, null,
      h("div", { className: "stage" },
        h(Transport, { playing: playing, bpm: bpm, swing: swing, master: master, active: active, pos: posStr(playStep, playBar, mode), studio: studio, onToggleStudio: toggleStudio, onPlay: togglePlay, onStop: stop, onBpm: function (v) { E.setTempo(v); setBpm(v); }, onSwing: function (v) { E.setSwing(v); setSwing(v); }, onPattern: pattern, onProducerMaster: exportProducerMaster, onRecAudioMaster: exportRecAudioMaster, exporting: exporting, exportProg: exportProg, recAvailable: recAudioAvailable }),
        studio
          ? h(StudioMode, { channelDefs: E.studioDefs(), bpm: bpm, playing: playing, playTick: playTick, rev: rev, triplet: triplet, selected: studioSel, bouncing: bouncing, bounceProg: bounceProg, commit: bump, onPlay: togglePlay, onStop: stop,
              fitTicks: fitTicks, dragScrub: studioDragScrub, dragRed: studioDragRed, recStartTick: recStartTick, onSelectClip: function (v) { setSelClip(v); if (!v) setRangeSel(null); }, selClip: selClip, onClipDown: studioClipDown,
              rangeSel: rangeSel, onRangeDown: studioRangeDown,
              monitor: monitor, onToggleMonitor: toggleMonitor, calibMs: recCalib, onSetCalib: setRecCalibration,
              recPhase: recPhase, countBeat: countBeat, recPreview: recPreview, recErr: recErr,
              onSelect: selectStudioTrack, onAddTrack: addAudioLaneTrack, onRecord: toggleRecord, onOpenTake: openDual,
              onMute: toggleStudioMute, onDelete: requestDeleteStudioTrack, onReplace: replaceBacking, onBounce: bounceCurrent, onUpload: uploadBacking })
          : h("div", { className: "workspace" },
          h(window.FileBrowser, { collapsed: railCol, onCollapse: function () { setRailCol(!railCol); }, channelDefs: producerDefs, focus: focus, onFocus: doFocus, onPreview: previewSample, onAssign: assignSample, onCreateTrack: createTrackFromSample, toast: toast, onTrackAdded: function () { setFocus(E.focus); E.setFocus(E.focus); bump(); },
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
            },
            onMelodyMaker: function (f) {
              // Phase 5 Melody Maker: decode one file -> a polyphonic pitch-shifting sampler
              // (polySampler) track, then land on the timeline so its lane can be double-clicked to
              // open the Piano Roll and play the sample in key. A track is only created once the
              // buffer decodes (no sample-less polySampler).
              E.decodeAudioFile(f, function (buf) {
                var d = E.addPolySamplerTrack(f.name, buf, f);
                setView("timeline"); setFocus(E.focus); E.setFocus(E.focus); lastTonal.current = d.id; bump();
                toast("Melody Maker: " + d.label + " — double-click its lane to draw notes", h(I.Note, { width: 16, height: 16 }));
              }, function () { toast("Could not decode " + f.name, h(I.X, { width: 16, height: 16 })); });
            } }),
          h("div", { className: "stage-main" },
            h("div", { className: "tabs" },
              TABS.map(function (tb) { return h("button", { key: tb.id, className: "tab" + (view === tb.id ? " on" : ""), onClick: function () { setView(tb.id); setEditClip(null); } }, h("span", { className: "ti" }, h(tb.ic, { width: 16, height: 16 })), tb.label); }),
              // Phase 5: the standalone [Synth] toolbar button was removed — Melody Maker (sidebar) is
              // the single melodic entry point. The oscillator source stays in the engine, dormant
              // (no UI instantiates it). Intended, not an oversight.
              h(ProjectMenu, { onNew: newProject, onExport: exportProject, onImportFile: importProjectFile, onSaveSlot: saveSlot, onLoadSlot: loadSlot, onDeleteSlot: deleteSlot, slots: slots, onOpen: refreshSlots }),
              h("button", { className: "hdr-btn", title: "Undo (Ctrl+Z)", onClick: doUndo }, "↶"),
              h("button", { className: "hdr-btn", title: "Redo (Ctrl+Y)", onClick: doRedo }, "↷"),
              h("button", { className: "hdr-btn" + (musTyping ? " on" : ""), title: "Musical typing — ASDF row plays the focused track (Z/X = octave)", onClick: function () { var nx = !musTyping; setMusTyping(nx); musRef.current = nx; } }, "⌨ Keys"),
              h("button", { className: "hdr-btn" + (midiOn ? " on" : ""), title: "Enable MIDI controller input", onClick: function () { if (midiOn) return; E.enableMIDI(function (ok, info) { if (ok) { setMidiOn(true); toast("MIDI ready · " + info + " input(s)", h(I.Piano, { width: 16, height: 16 })); } else { toast("MIDI: " + info, h(I.X, null)); } }); } }, "MIDI"),
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
                    h(window.ChannelRack, { channels: producerDefs, pattern: E.banks[active], state: channelState, focus: focus, litMap: litMap, playStep: mode === "pattern" ? playStep : -1, onFocus: doFocus, onToggle: toggleStep, onVol: setVol, onPan: setPan, onRoute: setRoute, onMute: muteCh, onSolo: soloCh, onDropSample: dropSample, onDelete: deleteTrack }),
                    h(AddTrackBar, { onAdd: addTrack }))
                  : view === "piano" ? (
                      editingClip
                        ? h(window.PianoRoll, { ch: (E.channels[editingClip.ch] && E.channels[editingClip.ch].def) || prCh, pattern: clipToPattern(editingClip), steps: Math.max(16, Math.ceil(editingClip.lengthTicks / TPS / 16) * 16), playStep: -1, rev: rev, onAddNote: clipAddNote(editingClip), onUpdateNote: clipUpdNote(editingClip), onRemoveNote: clipRemNote(editingClip), onPreview: function (p) { var d = E.channels[editingClip.ch] && E.channels[editingClip.ch].def; if (d && d.tonal) E.previewNote(editingClip.ch, p - (d.base || 0), 100); }, commit: bump })
                        : prCh
                          ? h(window.PianoRoll, { ch: prCh, pattern: E.banks[active], steps: E.getPatternLength(active) * 16, lengthBars: E.getPatternLength(active), onSetLength: function (b) { E.setPatternLength(b, active); bump(); }, playStep: mode === "pattern" ? playStep : -1, rev: rev, onAddNote: function (c, p, s, l) { return E.addNote(c, p, s, l); }, onUpdateNote: function (id, patch) { E.updateNote(id, patch); }, onRemoveNote: function (id) { E.removeNote(id); }, onPreview: function (p) { if (prCh && prCh.tonal) E.previewNote(prCh.id, p - (prCh.base || 0), 100); }, commit: bump })
                          : h(EmptyPane, { title: "No tonal instrument", sub: "Add a melodic track (it routes here automatically)." }))
                    : h(window.Timeline, { channels: producerDefs, playheadTick: playTick, tool: toolMode, onSetTool: setToolMode, triplet: triplet, onSetTriplet: setTriplet, onCommit: bump, onDeleteTrack: deleteTrack, onFocusStrip: doFocus, onScrub: function (tick) { E.seek(tick); setPlayTick(tick); }, onOpenClip: openDual, onOpenClipFx: openClipFx, onEditClip: openDual, onOpenWave: openDual, onToast: function (m) { toast(m, h(I.Mic, { width: 16, height: 16 })); } })),
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
        (dualClip && E.timeline.clips.indexOf(dualClip) >= 0) ? h(DualEditor, {
          clip: dualClip, chDef: (E.channels[dualClip.ch] && E.channels[dualClip.ch].def) || prCh, commit: bump,
          api: { toPattern: clipToPattern, add: clipAddNote, upd: clipUpdNote, rem: clipRemNote },
          triplet: triplet, playTick: playTick, tab: dualTab, setTab: setDualTab,
          toast: function (m) { toast(m, h(I.Wave, { width: 16, height: 16 })); },
          onClose: function () { setDualClip(null); } }) : null,
        fxModal ? h(FXModal, { id: fxModal.id, slot: fxModal.slot, clip: fxModal.clip, onClose: function () { setFxModal(null); }, commit: bump }) : null,
        showEx ? h(RenderModal, { onClose: function () { setShowEx(false); }, onStopped: function () { setPlaying(false); setPlayStep(-1); }, toast: toast }) : null,
        delConfirm ? h("div", { className: "modal-scrim", onClick: function () { setDelConfirm(null); } },
          h("div", { className: "confirm-modal", onClick: function (e) { e.stopPropagation(); } },
            h("div", { className: "cm-ttl" }, "Delete track “" + delConfirm.label + "”?"),
            h("div", { className: "cm-body" }, "This will remove the track and its audio from the session. This action can be undone while the session is open."),
            h("div", { className: "cm-acts" },
              h("button", { className: "cm-btn", onClick: function () { setDelConfirm(null); } }, "Cancel"),
              h("button", { className: "cm-btn danger", onClick: confirmDeleteStudioTrack }, "Delete")))) : null,
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
    E.producerDefs().forEach(function (c) { for (var i = 0; i < 16; i++) { var st = b.steps[c.id][i]; var pr = c.type === "chat" || c.type === "shaker" ? 0.55 : c.type === "kick" ? 0.3 : c.type === "arp" ? 0.5 : 0.22; st.on = Math.random() < pr; st.vel = 60 + Math.floor(Math.random() * 67); if (c.tonal && st.on) st.pitch = [0, 0, 3, 5, 7, 7, 10, 12][Math.floor(Math.random() * 8)] - (c.type === "sub" || c.type === "reese" ? 0 : 0); } });
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
