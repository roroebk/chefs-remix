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
    function snapStep() { return zoom >= 64 ? 0.5 : zoom >= 32 ? 1 : zoom >= 16 ? 2 : 4; }
    function snapLabel() { var s = snapStep(); return s === 0.5 ? "1/32" : s === 1 ? "1/16" : s === 2 ? "1/8" : "1/4"; }
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

    // gridlines at the active (zoom-derived) division, with beat/bar emphasis
    var step = snapStep(); var glines = [];
    for (var st = 0; st <= STEPS; st += step) { glines.push({ x: st / STEPS, cls: st % 16 === 0 ? "bar" : (st % 4 === 0 ? "beat" : "sub") }); }

    return h("div", { className: "pl" },
      h("div", { className: "pl-toolbar" },
        h("span", { className: "sub", style: { fontWeight: 700, color: "var(--text-hi)" } }, "PIANO ROLL"),
        h("span", { className: "badge", style: { background: "color-mix(in srgb," + ch.color + " 18%, var(--surface-3))", color: ch.color } }, ch.label),
        h("span", { className: "tl-snapchip", title: "Adaptive grid — subdivides automatically as you zoom in" }, "GRID ", h("b", null, snapLabel())),
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
