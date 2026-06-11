/* Chef's Remix v3 — widgets: micro-knobs, canvas meters, faders, waveforms */
(function () {
  var h = React.createElement, useRef = React.useRef, useEffect = React.useEffect, useState = React.useState;

  // generic vertical-drag hook
  function useVDrag(get, set, opts) {
    opts = opts || {};
    return function (e) {
      e.preventDefault(); e.stopPropagation();
      var startY = e.clientY, start = get(), fine = e.altKey;
      function mv(ev) {
        var dy = startY - ev.clientY; var sens = (opts.sens || 0.005) * (fine ? 0.18 : 1);
        var range = (opts.max - opts.min);
        set(Math.max(opts.min, Math.min(opts.max, start + dy * sens * range)));
      }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    };
  }

  // micro rotary knob (rack) — svg, 17px
  function MicroKnob(props) {
    var v = props.value, min = props.min == null ? 0 : props.min, max = props.max == null ? 1 : props.max;
    var frac = (v - min) / (max - min); var ang = -135 + frac * 270; var rad = ang * Math.PI / 180;
    var cx = 8.5, cy = 8.5, r = 6.4;
    var x2 = cx + Math.sin(rad) * r * 0.74, y2 = cy - Math.cos(rad) * r * 0.74;
    var down = useVDrag(function () { return props.value; }, props.onChange, { min: min, max: max, sens: 0.006 });
    var startA = (-135) * Math.PI / 180, endA = ang * Math.PI / 180;
    function arc(a0, a1) { var p0x = cx + Math.sin(a0) * r, p0y = cy - Math.cos(a0) * r, p1x = cx + Math.sin(a1) * r, p1y = cy - Math.cos(a1) * r; var large = (a1 - a0) > Math.PI ? 1 : 0; return "M" + p0x.toFixed(2) + " " + p0y.toFixed(2) + " A" + r + " " + r + " 0 " + large + " 1 " + p1x.toFixed(2) + " " + p1y.toFixed(2); }
    return h("div", { className: "mk", onMouseDown: down, title: props.title },
      h("svg", { width: 17, height: 17, viewBox: "0 0 17 17" },
        h("path", { d: arc(-135 * Math.PI / 180, 135 * Math.PI / 180), stroke: "#2a2f38", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
        h("path", { d: arc(startA, endA), stroke: props.color || "var(--accent)", strokeWidth: 2, fill: "none", strokeLinecap: "round" }),
        h("line", { x1: cx, y1: cy, x2: x2, y2: y2, stroke: "var(--text-hi)", strokeWidth: 1.4, strokeLinecap: "round" })
      )
    );
  }

  // pan knob (mixer) — 26px
  function PanKnob(props) {
    var v = props.value; var ang = v * 135; var rad = ang * Math.PI / 180; var cx = 13, cy = 13, r = 9.5;
    var x2 = cx + Math.sin(rad) * r * 0.7, y2 = cy - Math.cos(rad) * r * 0.7;
    var down = useVDrag(function () { return props.value; }, props.onChange, { min: -1, max: 1, sens: 0.006 });
    return h("div", { style: { width: 26, height: 26, cursor: "ns-resize" }, onMouseDown: down, onDoubleClick: function () { props.onChange(0); }, title: "Pan " + (v === 0 ? "C" : (v > 0 ? "R" : "L") + Math.round(Math.abs(v) * 100)) },
      h("svg", { width: 26, height: 26, viewBox: "0 0 26 26" },
        h("circle", { cx: cx, cy: cy, r: r, fill: "#16191f", stroke: "#2a2f38", strokeWidth: 1.5 }),
        h("line", { x1: cx, y1: cy, x2: x2, y2: y2, stroke: Math.abs(v) < 0.02 ? "var(--accent-3)" : "var(--text-hi)", strokeWidth: 1.6, strokeLinecap: "round" }),
        h("line", { x1: cx, y1: 2.5, x2: cx, y2: 4.5, stroke: "var(--faint)", strokeWidth: 1 })
      )
    );
  }

  // canvas segmented meter — reads window.CR_METER
  function MeterBar(props) {
    var ref = useRef(null);
    useEffect(function () {
      var cv = ref.current; if (!cv) return; var ctx = cv.getContext("2d");
      var raf, peak = 0, peakT = 0;
      function resize() { var r = cv.getBoundingClientRect(); cv.width = Math.max(4, r.width * 2); cv.height = Math.max(10, r.height * 2); }
      resize();
      function draw(ts) {
        if (cv.width < 4) resize();
        var store = window.CR_METER || {}; var lvl = props.master ? (store.master || 0) : ((store.inserts || {})[props.id] || 0);
        lvl = lvl * (0.85 + (props.idx === 1 ? 0.1 : 0)); // tiny L/R variance for realism
        var W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0a0c0f"; ctx.fillRect(0, 0, W, H);
        var seg = 22, gap = H / seg;
        if (lvl > peak) { peak = lvl; peakT = ts; }
        if (ts - peakT > 1100) peak = Math.max(lvl, peak - 0.012);
        for (var i = 0; i < seg; i++) {
          var f = (i + 1) / seg; var y = H - (i + 1) * gap; var on = f <= lvl;
          var col = f > 0.92 ? "#e74c3c" : f > 0.78 ? "#f1c40f" : "#2ecc71";
          ctx.fillStyle = on ? col : "rgba(255,255,255,0.045)";
          ctx.fillRect(1, y + 1, W - 2, gap - 1.5);
        }
        var py = H - peak * H; ctx.fillStyle = "#fff"; ctx.fillRect(1, Math.max(0, py - 1), W - 2, 2);
        raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw);
      var ro = new ResizeObserver(resize); ro.observe(cv);
      return function () { cancelAnimationFrame(raf); ro.disconnect(); };
    }, [props.id, props.master, props.idx]);
    return h("canvas", { ref: ref });
  }

  // vertical fader (mixer)
  function VFader(props) {
    var ref = useRef(null);
    function down(e) {
      e.preventDefault(); var track = ref.current; var rect = track.getBoundingClientRect();
      function set(cy) { var f = 1 - (cy - rect.top) / rect.height; props.onChange(Math.max(0, Math.min(1.1, f * 1.1))); }
      set(e.clientY);
      function mv(ev) { set(ev.clientY); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    var pct = Math.min(1, props.value / 1.1); var unityPct = 0.8 / 1.1;
    return h("div", { className: "fader-col" },
      h("div", { className: "fader-track", ref: ref, onMouseDown: down, onDoubleClick: function () { props.onChange(0.8); } },
        h("div", { className: "fader-fill", style: { height: (pct * 100) + "%" } }),
        h("div", { className: "fader-0db", style: { bottom: (unityPct * 100) + "%" } }),
        h("div", { className: "fader-cap", style: { bottom: "calc(" + (pct * 100) + "% - 4px)" } })
      )
    );
  }

  // mini static waveform for audio clips
  function ClipWave(props) {
    var ref = useRef(null);
    useEffect(function () {
      var cv = ref.current; if (!cv) return; var r = cv.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2;
      var ctx = cv.getContext("2d"); var W = cv.width, H = cv.height, mid = H / 2;
      var seed = props.seed || 1; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
      ctx.fillStyle = props.color || "rgba(46,166,255,0.7)"; var bars = Math.floor(W / 3);
      for (var i = 0; i < bars; i++) { var env = Math.sin((i / bars) * Math.PI) * 0.7 + 0.3; var a = (rnd() * 0.8 + 0.2) * env * mid * 0.92; ctx.fillRect(i * 3, mid - a, 2, a * 2); }
    }, [props.seed]);
    return h("canvas", { ref: ref });
  }

  // DJ-style radial rotary knob — vertical drag rotates the dial min..max (270° sweep),
  // neon arc fill + rotating indicator line. Used for FX parameter editing.
  function RotaryKnob(props) {
    var v = props.value, min = props.min == null ? 0 : props.min, max = props.max == null ? 1 : props.max;
    var frac = Math.max(0, Math.min(1, (v - min) / (max - min)));
    var ang = -135 + frac * 270;
    var S = props.size || 48, c = S / 2, r = S / 2 - 6;
    var rad = ang * Math.PI / 180, x2 = c + Math.sin(rad) * r * 0.6, y2 = c - Math.cos(rad) * r * 0.6;
    function arc(a0, a1) { var p0x = c + Math.sin(a0) * r, p0y = c - Math.cos(a0) * r, p1x = c + Math.sin(a1) * r, p1y = c - Math.cos(a1) * r; var large = (a1 - a0) > Math.PI ? 1 : 0; return "M" + p0x.toFixed(2) + " " + p0y.toFixed(2) + " A" + r + " " + r + " 0 " + large + " 1 " + p1x.toFixed(2) + " " + p1y.toFixed(2); }
    var down = useVDrag(function () { return props.value; }, props.onChange, { min: min, max: max, sens: 0.006 });
    var col = props.color || "var(--accent)";
    return h("div", { className: "rk", onMouseDown: down, onDoubleClick: props.onReset || null, title: (props.label || "") + " — drag vertically" },
      h("svg", { className: "rk-svg", width: S, height: S, viewBox: "0 0 " + S + " " + S },
        h("circle", { cx: c, cy: c, r: r - 1, fill: "var(--surface-0)", stroke: "var(--hairline)", strokeWidth: 1 }),
        h("path", { d: arc(-135 * Math.PI / 180, 135 * Math.PI / 180), stroke: "#2a2f38", strokeWidth: 3, fill: "none", strokeLinecap: "round" }),
        h("path", { d: arc(-135 * Math.PI / 180, ang * Math.PI / 180), stroke: col, strokeWidth: 3, fill: "none", strokeLinecap: "round", style: { filter: "drop-shadow(0 0 calc(4px * var(--glow)) " + col + ")" } }),
        h("line", { x1: c, y1: c, x2: x2, y2: y2, stroke: "var(--text-hi)", strokeWidth: 2, strokeLinecap: "round" }),
        h("circle", { cx: c, cy: c, r: 2.2, fill: col })),
      props.label ? h("div", { className: "rk-lbl" }, props.label) : null,
      props.fmt ? h("div", { className: "rk-val mono" }, props.fmt(v)) : null);
  }

  // master spectrum analyzer — reads window.engine.masterAnalyser, glowing ultraviolet bars
  function SpectrumAnalyzer(props) {
    var ref = useRef(null);
    useEffect(function () {
      var cv = ref.current; if (!cv) return; var ctx = cv.getContext("2d"); var raf, data = null;
      function resize() { var r = cv.getBoundingClientRect(); cv.width = Math.max(8, r.width * 2); cv.height = Math.max(8, r.height * 2); }
      resize();
      function draw() {
        raf = requestAnimationFrame(draw);
        var W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
        var an = window.engine && window.engine.masterAnalyser; if (!an) return;
        if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
        var bars = 56, useBins = Math.floor(data.length * 0.72), step = Math.max(1, Math.floor(useBins / bars)), bw = W / bars;
        for (var i = 0; i < bars; i++) {
          var sum = 0; for (var j = 0; j < step; j++) sum += data[i * step + j] || 0;
          var val = (sum / step) / 255, bh = Math.pow(val, 0.82) * H;
          var grad = ctx.createLinearGradient(0, H, 0, H - bh);
          grad.addColorStop(0, "#7B5CFF"); grad.addColorStop(1, "#E0AAFF");
          ctx.fillStyle = grad; ctx.shadowColor = "#9D4EDD"; ctx.shadowBlur = 7;
          ctx.fillRect(i * bw + 1, H - bh, Math.max(1, bw - 2), bh);
        }
      }
      draw();
      var ro = new ResizeObserver(resize); ro.observe(cv);
      return function () { cancelAnimationFrame(raf); ro.disconnect(); };
    }, []);
    return h("canvas", { className: "spectrum", ref: ref });
  }

  window.W = { MicroKnob: MicroKnob, PanKnob: PanKnob, MeterBar: MeterBar, VFader: VFader, ClipWave: ClipWave, useVDrag: useVDrag, RotaryKnob: RotaryKnob, SpectrumAnalyzer: SpectrumAnalyzer };
})();
