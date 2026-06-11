/* Chef's Remix v3 — Step Parameter Graph Editor (canvas, multi-parameter).
 * Tabs: Velocity (green bars) · Pitch (cyan center columns) · Pan (violet L/R split) · Release (orange decay curves). */
(function () {
  var h = React.createElement, useRef = React.useRef, useEffect = React.useEffect, useState = React.useState;

  var PARAMS = {
    velocity: { key: "vel", min: 0, max: 127, def: 100, kind: "bars", color: "#39ff14", fmt: function (v) { return Math.round(v); } },
    pitch: { key: "pitch", min: -12, max: 12, def: 0, kind: "center", color: "#2ea6ff", fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v) + "st"; } },
    pan: { key: "pan", min: -1, max: 1, def: 0, kind: "center", color: "#b07bff", fmt: function (v) { return v === 0 ? "C" : (v > 0 ? "R" : "L") + Math.round(Math.abs(v) * 100); } },
    release: { key: "len", min: 0, max: 4, def: 1, kind: "release", color: "#ff8c2e", fmt: function (v) { return v.toFixed(2) + "×"; } }
  };
  var ORDER = ["velocity", "pitch", "pan", "release"];

  function GraphEditor(props) {
    var ref = useRef(null), wrapRef = useRef(null);
    var tabState = useState("velocity"); var tab = tabState[0], setTab = tabState[1];
    var hoverState = useState(-1); var hoverCol = hoverState[0], setHover = hoverState[1];
    var ch = props.ch; var steps = props.pattern.steps[ch.id]; var P = PARAMS[tab];

    function draw() {
      var cv = ref.current; if (!cv) return; var wrap = wrapRef.current; var r = wrap.getBoundingClientRect();
      var dpr = 2; cv.width = r.width * dpr; cv.height = r.height * dpr; var ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); var W = r.width, H = r.height;
      ctx.clearRect(0, 0, W, H);
      var colW = W / 16, pad = 6; var col = P.color; var glow = window.__glow || 1;
      // beat blocks + downbeat lines
      for (var i = 0; i < 16; i++) {
        var even = Math.floor(i / 4) % 2 === 0;
        ctx.fillStyle = even ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.01)";
        ctx.fillRect(i * colW, 0, colW, H);
        if (i % 4 === 0) { ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fillRect(i * colW, 0, 1, H); }
      }
      var midY = H / 2;
      if (P.kind === "center") {
        ctx.strokeStyle = "color-mix" ? "rgba(255,255,255,0.28)" : "#fff"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
        if (tab === "pan") { ctx.fillStyle = "rgba(176,123,255,0.55)"; ctx.font = "9px JetBrains Mono, monospace"; ctx.fillText("R", 3, 11); ctx.fillText("L", 3, H - 4); }
      }
      // playhead column tint
      if (props.playStep >= 0) { ctx.fillStyle = "rgba(57,255,20,0.12)"; ctx.fillRect(props.playStep * colW, 0, colW, H); }

      for (var i = 0; i < 16; i++) {
        var st = steps[i]; var v = st[P.key]; var frac = (v - P.min) / (P.max - P.min);
        var x = i * colW + pad / 2; var bw = colW - pad; var active = st.on;
        ctx.globalAlpha = active ? 1 : 0.32; ctx.fillStyle = active ? col : "#8b9098";
        ctx.shadowBlur = active ? 8 * glow : 0; ctx.shadowColor = col;
        if (P.kind === "bars") {
          var bh = frac * (H - 6); ctx.fillRect(x, H - bh, bw, bh);
          ctx.shadowBlur = 0; ctx.globalAlpha = active ? 1 : 0.4; ctx.fillStyle = active ? "#eafff0" : "rgba(255,255,255,0.3)"; ctx.fillRect(x, H - bh - 1, bw, 2);
        } else if (P.kind === "center") {
          var val = frac * 2 - 1; var topY = midY - val * (H / 2 - 4);
          if (val >= 0) ctx.fillRect(x, topY, bw, midY - topY); else ctx.fillRect(x, midY, bw, topY - midY);
          ctx.shadowBlur = 0; ctx.globalAlpha = active ? 1 : 0.4; ctx.fillStyle = active ? "#fff" : "rgba(255,255,255,0.3)"; ctx.fillRect(x, topY - 1, bw, 2);
        } else { // release: orange decay curve, longer/taller = slower decay
          var rel = frac; var n = 26; ctx.beginPath(); ctx.moveTo(x, H);
          for (var s2 = 0; s2 <= n; s2++) { var tt = s2 / n; var yy = H - (H - 5) * Math.exp(-tt * 5.5 / (0.35 + rel * 2.2)); ctx.lineTo(x + tt * bw, yy); }
          ctx.lineTo(x + bw, H); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        if (hoverCol === i) { ctx.fillStyle = "#e8eaed"; ctx.font = "10px JetBrains Mono, monospace"; var label = P.fmt(v); var tw = ctx.measureText(label).width; ctx.fillText(label, Math.min(x, W - tw - 2), 12); }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    useEffect(draw, [tab, ch.id, props.rev, props.playStep, hoverCol]);
    // T5: never read-measure AND write-layout (canvas.width/height inside draw) synchronously in
    // the observer callback — that reflow re-fires the observer => "ResizeObserver loop completed
    // with undelivered notifications" and the panel fails to render. Measure in the callback,
    // mutate/redraw in a rAF, and bail when the size is unchanged (kills fractional-px ping-pong).
    useEffect(function () {
      var roPending = false, lastW = 0, lastH = 0;
      var ro = new ResizeObserver(function (entries) {
        if (roPending) return; roPending = true;
        var cr = entries[0].contentRect, w = cr.width, hgt = cr.height;
        requestAnimationFrame(function () {
          roPending = false;
          if (w === lastW && hgt === lastH) return;   // equality guard — no grow/shrink loop
          lastW = w; lastH = hgt; draw();
        });
      });
      if (wrapRef.current) ro.observe(wrapRef.current);
      return function () { ro.disconnect(); };
    }, [tab, ch.id, props.rev]);

    function colFromX(clientX) { var r = ref.current.getBoundingClientRect(); return Math.max(0, Math.min(15, Math.floor((clientX - r.left) / (r.width / 16)))); }
    function valFromY(clientY) { var r = ref.current.getBoundingClientRect(); var f = 1 - (clientY - r.top) / r.height; f = Math.max(0, Math.min(1, f)); return P.min + f * (P.max - P.min); }

    function onDown(e) {
      e.preventDefault(); if (e.button === 2) return;
      var shift = e.shiftKey; var startCol = colFromX(e.clientX), startVal = valFromY(e.clientY);
      props.onSet(ch.id, startCol, P.key, startVal); setHover(startCol);
      function mv(ev) {
        var c = colFromX(ev.clientX), val = valFromY(ev.clientY);
        if (shift) { var a = Math.min(startCol, c), b = Math.max(startCol, c); for (var k = a; k <= b; k++) { var t = (c === startCol) ? val : (k - startCol) / (c - startCol); var iv = startVal + (val - startVal) * t; props.onSet(ch.id, k, P.key, iv); } }
        else props.onSet(ch.id, c, P.key, val);
        setHover(c);
      }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); setHover(-1); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    function onCtx(e) { e.preventDefault(); props.onSet(ch.id, colFromX(e.clientX), P.key, P.def); }

    return h("div", { className: "dash-graph" + (props.embedded ? " embedded" : "") },
      // embedded inside the merged Track FX panel (T6): skip the redundant standalone header
      props.embedded ? null : h("div", { className: "pane-head" },
        h("span", { className: "pt" }, "Graph Editor"),
        h("span", { className: "badge", style: { background: "color-mix(in srgb," + ch.color + " 18%, var(--surface-3))", color: ch.color } }, ch.label),
        h("span", { className: "sub" }, "per-step shaping")),
      h("div", { className: "ge-tabs" },
        ORDER.map(function (t) { return h("button", { key: t, className: "ge-tab" + (tab === t ? " on" : ""), style: tab === t ? { color: PARAMS[t].color, borderColor: "color-mix(in srgb," + PARAMS[t].color + " 45%, var(--hairline))" } : null, onClick: function () { setTab(t); } }, t.charAt(0).toUpperCase() + t.slice(1)); })),
      h("div", { className: "ge-body" },
        h("div", { className: "ge-canvas-wrap", ref: wrapRef },
          h("canvas", { ref: ref, onMouseDown: onDown, onContextMenu: onCtx, style: { cursor: "ns-resize" } })),
        h("div", { className: "ge-foot" },
          h("span", { className: "hint" }, h("kbd", null, "drag"), "set"),
          h("span", { className: "hint" }, h("kbd", null, "shift"), "line"),
          h("span", { className: "hint" }, h("kbd", null, "right-click"), "reset"),
          h("span", { className: "focuslbl", style: { color: P.color } }, "◆ " + tab.toUpperCase()))));
  }

  window.GraphEditor = GraphEditor;
})();
