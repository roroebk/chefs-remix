/* Chef's Remix v3 — Piano Roll (draw/move/resize notes, adaptive zoom-snap, velocity) */
(function () {
  var h = React.createElement, useRef = React.useRef, useState = React.useState, useEffect = React.useEffect;
  var LANE = 15, NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };

  function PianoRoll(props) {
    var ch = props.ch; var zoomState = useState(40); var zoom = zoomState[0], setZoom = zoomState[1];  // px per 1/16 step
    var trackRef = useRef(null);
    var lo = ch.base - 12, hi = ch.base + 24, semis = hi - lo; // 3 octaves
    var rows = []; for (var p = hi; p >= lo; p--) rows.push(p);
    var notes = props.pattern.notes.filter(function (n) { return n.ch === ch.id; });
    // STEPS spans the full edited region (one bar = 16 steps). When editing a multi-bar timeline
    // clip the host passes the clip's length so the grid + columns expand to match instead of
    // clipping at bar 1; the plain pattern view stays at 16.
    var STEPS = Math.max(16, Math.round(props.steps || 16));
    var totalH = semis * LANE, gridW = STEPS * zoom;

    // ---- Adaptive snapping (no manual snap buttons): the grid divisions subdivide automatically
    // as you zoom in — 1/4 -> 1/8 -> 1/16 -> 1/32. Units below are 1/16-steps (16 = one bar). ----
    // Phase 3: when props.triplet is on, the grid switches to triplet divisions ALONGSIDE the duple
    // ones. Standard triplet spacing in 1/16-step units: 1/8T = 1.333 step (PPQ/3), 1/16T = 0.667
    // step (PPQ/6) — matching the Timeline grid. Existing notes keep their absolute positions; only
    // new placement/resize snaps to the division.
    var trip = !!props.triplet;
    function snapStep() {
      if (trip) return zoom >= 32 ? (2 / 3) : (4 / 3);   // 1/16T : 1/8T
      return zoom >= 64 ? 0.5 : zoom >= 32 ? 1 : zoom >= 16 ? 2 : 4;
    }
    function snapLabel() {
      if (trip) return zoom >= 32 ? "1/16T" : "1/8T";
      var s = snapStep(); return s === 0.5 ? "1/32" : s === 1 ? "1/16" : s === 2 ? "1/8" : "1/4";
    }
    function snapV(x) { var s = snapStep(); return Math.max(0, Math.round(x / s) * s); }
    // T5 fix: the stage is under a CSS scale() transform, so getBoundingClientRect is in scaled
    // viewport px. xToStep divides by colW (also scaled) so scale cancels — but yToPitch divided a
    // scaled delta by the UNSCALED LANE constant, landing notes ~2 rows off. Derive the row height
    // from the measured rect (rowH = totalHeight/rowCount) so it's in the same units as the delta.
    function geo() { var r = trackRef.current.getBoundingClientRect(); return { r: r, colW: r.width / STEPS, rowH: r.height / semis }; }
    function xToStep(clientX) { var g = geo(); return (clientX - g.r.left) / g.colW; }
    function yToPitch(clientY) { var g = geo(); var idx = Math.floor((clientY - g.r.top) / g.rowH); return hi - idx; }

    function onTrackDown(e) {
      if (e.button === 2) return; e.preventDefault();
      var start = snapV(xToStep(e.clientX)); var pitch = yToPitch(e.clientY); var len = snapStep();
      var id = props.onAddNote(ch.id, pitch, start, len);
      props.onPreview && props.onPreview(pitch);   // audition the placed note (reserved preview pool)
      function mv(ev) { var l = snapV(xToStep(ev.clientX) - start); props.onUpdateNote(id, { len: Math.max(snapStep(), l || snapStep()) }); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); props.commit(); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    function onNoteDown(e, n) {
      e.preventDefault(); e.stopPropagation(); if (e.button === 2) { props.onRemoveNote(n.id); props.commit(); return; }
      var resize = e.target.classList.contains("rs");
      var sx = xToStep(e.clientX), origStart = n.start, origLen = n.len, origPitch = n.pitch, sy = e.clientY;
      var lastPrev = origPitch;   // debounce preview to one audition per semitone crossed (not per mousemove)
      function mv(ev) {
        if (resize) { var nl = origLen + (xToStep(ev.clientX) - sx); props.onUpdateNote(n.id, { len: Math.max(snapStep(), snapV(nl)) }); }
        else {
          var ns = snapV(origStart + (xToStep(ev.clientX) - sx)); var dp = Math.round((sy - ev.clientY) / LANE);
          var np = Math.max(lo, Math.min(hi, origPitch + dp));
          props.onUpdateNote(n.id, { start: ns, pitch: np });
          if (np !== lastPrev) { lastPrev = np; props.onPreview && props.onPreview(np); }   // preview only on pitch change
        }
      }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); props.commit(); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }

    // ---- Audition (this batch): play/loop/solo the edited region (or a ruler-dragged loop region)
    // in isolation. All controls bind to the host's shared scoped-transport handle (props.audition);
    // there is NO second engine. Default range = the whole edited region; a ruler region overrides it.
    var au = props.audition || null;
    var lrState = useState(null); var loopRegion = lrState[0], setLoopRegion = lrState[1];   // {a,b} in 1/16 steps
    function pushRange(reg) {
      if (!au) return;
      if (reg) au.setRange(Math.min(reg.a, reg.b), Math.max(reg.a, reg.b));
      else au.setRange(0, STEPS);   // default = the bar/clip under edit
    }
    function onRulerDown(e) {
      if (!au) return; e.preventDefault(); e.stopPropagation();
      var a = snapV(xToStep(e.clientX)), moved = false;
      function mv(ev) { var b = snapV(xToStep(ev.clientX)); if (Math.abs(b - a) >= snapStep()) { moved = true; setLoopRegion({ a: a, b: b }); } }
      function up(ev) {
        window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
        if (!moved) { setLoopRegion(null); pushRange(null); }   // click (no drag) clears the region
        else { var b = snapV(xToStep(ev.clientX)); var reg = { a: Math.min(a, b), b: Math.max(a, b) }; if (reg.b <= reg.a) reg.b = reg.a + snapStep(); setLoopRegion(reg); pushRange(reg); }
      }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    function toggleAudition() { if (!au) return; if (au.active) au.stop(); else { pushRange(loopRegion); au.play(); } }

    // gridlines at the active (zoom-derived) division, with beat/bar emphasis (float-tolerant for triplets)
    var step = snapStep(); var glines = [];
    for (var st = 0; st <= STEPS + 1e-6; st += step) {
      var nearBar = Math.abs(st / 16 - Math.round(st / 16)) < 1e-6, nearBeat = Math.abs(st / 4 - Math.round(st / 4)) < 1e-6;
      glines.push({ x: Math.min(1, st / STEPS), cls: nearBar ? "bar" : nearBeat ? "beat" : "sub" });
    }

    return h("div", { className: "pl" },
      h("div", { className: "pl-toolbar" },
        h("span", { className: "sub", style: { fontWeight: 700, color: "var(--text-hi)" } }, "PIANO ROLL"),
        h("span", { className: "badge", style: { background: "color-mix(in srgb," + ch.color + " 18%, var(--surface-3))", color: ch.color } }, ch.label),
        h("span", { className: "tl-snapchip", title: "Adaptive grid — subdivides automatically as you zoom in" }, "GRID ", h("b", null, snapLabel())),
        au ? h("span", { className: "pr-audition", title: "Audition this region in isolation (drag the ruler to set a loop region)" },
          h("button", { className: "pr-aud play" + (au.active ? " on" : ""), title: au.active ? "Stop audition" : "Play audition", onClick: toggleAudition }, au.active ? "■" : "▶"),
          h("button", { className: "pr-aud" + (au.loop ? " on" : ""), title: "Loop the audition range", onClick: function () { au.setLoop(!au.loop); } }, "⟳"),
          h("button", { className: "pr-aud" + (au.solo ? " on" : ""), title: "Solo this track while auditioning", onClick: function () { au.setSolo(!au.solo); } }, "S")) : null,
        props.onSetLength ? h("span", { className: "pr-lenpick", title: "Pattern length in bars" },
          h("span", { className: "lbl" }, "LENGTH"),
          [1, 2, 4, 8, 16, 32].map(function (b) {
            return h("button", { key: b, className: "pr-lenbtn" + (props.lengthBars === b ? " on" : ""), onClick: function () { props.onSetLength(b); } }, b);
          })) : null,
        h("div", { className: "tl-zoom", style: { marginLeft: 12, flex: "none" } },
          h("span", { className: "lbl" }, "ZOOM"),
          h("input", { type: "range", className: "slider", style: { width: 130 }, min: 12, max: 96, step: 1, value: zoom, onChange: function (e) { setZoom(parseFloat(e.target.value)); } }),
          h("span", { className: "mono" }, zoom + "px")),
        h("span", { style: { marginLeft: "auto", fontSize: 11, color: "var(--faint)" } }, "Drag empty to draw · drag body to move · right-edge to resize · right-click to delete")),
      h("div", { className: "pr" },
        h("div", { className: "pr-scroll", style: { display: "flex" } },
          h("div", { style: { position: "sticky", left: 0, zIndex: 5, width: 64, flex: "none", height: totalH, background: "var(--surface-1)", borderRight: "1px solid var(--hairline)" } },
            rows.map(function (p, i) {
              var pc = p % 12; var isC = pc === 0; var black = BLACK[pc];
              return h("div", { key: p, className: "pr-key " + (black ? "black" : "white") + (isC ? " croot" : ""), style: { top: i * LANE, height: LANE } }, isC ? "C" + (Math.floor(p / 12) - 1) : (black ? "" : NOTE_NAMES[pc]));
            })),
          h("div", { ref: trackRef, className: "pr-grid", style: { position: "relative", width: gridW, flex: "none", height: totalH, cursor: "crosshair" }, onMouseDown: onTrackDown, onContextMenu: function (e) { e.preventDefault(); } },
            rows.map(function (p, i) { var pc = p % 12; return h("div", { key: "l" + p, className: "pr-lane" + (BLACK[pc] ? " black" : "") + (pc === 0 ? " croot" : ""), style: { top: i * LANE, height: LANE } }); }),
            glines.map(function (g, i) { return h("div", { key: "g" + i, className: "pr-gl " + g.cls, style: { left: (g.x * 100) + "%" } }); }),
            (au && loopRegion) ? h("div", { className: "pr-loopreg", style: { left: (Math.min(loopRegion.a, loopRegion.b) / STEPS * 100) + "%", width: (Math.abs(loopRegion.b - loopRegion.a) / STEPS * 100) + "%" } }) : null,
            au ? h("div", { className: "pr-ruler", onMouseDown: onRulerDown, title: "Drag to set an audition loop region · click to clear" }) : null,
            props.playStep >= 0 ? h("div", { className: "pl-playhead", style: { left: (props.playStep / STEPS * 100) + "%" } }) : null,
            notes.map(function (n) {
              var top = (hi - n.pitch) * LANE; var left = n.start / STEPS * 100; var w = n.len / STEPS * 100;
              return h("div", {
                key: n.id, className: "pr-note", style: { top: top + 1, height: LANE - 2, left: left + "%", width: "calc(" + w + "% - 1px)", "--ncol": ch.color, opacity: 0.55 + 0.45 * (n.vel / 127) },
                onMouseDown: function (e) { onNoteDown(e, n); }, onContextMenu: function (e) { e.preventDefault(); props.onRemoveNote(n.id); props.commit(); }
              }, h("div", { className: "rs" }));
            })))));
  }
  window.PianoRoll = PianoRoll;
})();
