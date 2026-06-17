/* Chef's Remix v3 — Playlist arranger (pattern-reference blocks + audio clips) */
(function () {
  var h = React.createElement;
  var W = window.W, I = window.Icons;
  var BARS = 32;
  var PATCOL = ["#39ff14", "#2ea6ff", "#ff5cc8", "#ffb338"];
  var LANES = [
    { id: 0, name: "Drums", type: "pat" }, { id: 1, name: "Bassline", type: "pat" },
    { id: 2, name: "Synths", type: "pat" }, { id: 3, name: "Lead / FX", type: "pat" },
    { id: 10, name: "Vocals", type: "audio" }, { id: 11, name: "Adlibs", type: "audio" }
  ];

  function Playlist(props) {
    function cells(lane) {
      var arr = []; for (var b = 0; b < BARS; b++) { (function (b) {
        arr.push(h("div", { key: b, className: "pl-cell" + ((b + 1) % 4 === 0 ? " bar4" : ""), onMouseDown: function (e) { e.preventDefault(); props.onPaint(b, lane); }, onMouseEnter: function (e) { if (e.buttons === 1) props.onPaint(b, lane); } }));
      })(b); } return arr;
    }
    return h("div", { className: "pl" },
      h("div", { className: "pl-toolbar" },
        h("span", { className: "sub", style: { fontWeight: 700, color: "var(--text-hi)" } }, "PLAYLIST"),
        h("span", { style: { fontSize: 11, color: "var(--dim)", marginLeft: 8 } }, "Brush"),
        h("div", { className: "brush-grp" },
          [0, 1, 2, 3].map(function (p) { return h("button", { key: p, className: "brush" + (props.brush === p ? " on" : ""), style: { "--bc": PATCOL[p] }, onClick: function () { props.setBrush(p); } }, "P" + (p + 1)); }),
          h("button", { className: "brush erase" + (props.brush === "erase" ? " on" : ""), onClick: function () { props.setBrush("erase"); } }, "ERASE")),
        h("span", { style: { marginLeft: "auto", fontSize: 11, color: "var(--faint)" } }, "Blocks are references — edit a pattern and every placed block updates · " + BARS + " bars")),
      h("div", { className: "pl-scroll" },
        // bar ruler
        h("div", { className: "pl-lane", style: { height: 22, position: "sticky", top: 0, zIndex: 4, background: "var(--surface-1)" } },
          h("div", { className: "pl-lane-head", style: { height: 22, fontSize: 9.5, color: "var(--faint)", letterSpacing: "0.1em" } }, "BAR"),
          h("div", { className: "pl-track", style: { gridTemplateColumns: "repeat(" + BARS + ",1fr)" } },
            (function () { var a = []; for (var b = 0; b < BARS; b++) a.push(h("div", { key: b, className: "pl-cell" + ((b + 1) % 4 === 0 ? " bar4" : ""), style: { fontFamily: "var(--mono)", fontSize: 9, color: "var(--faint)", display: "flex", alignItems: "center", paddingLeft: 4 } }, (b % 4 === 0) ? (b + 1) : "")); return a; })(),
            h("div", { className: "pl-loop", style: { left: (props.loop.start / BARS * 100) + "%", width: ((props.loop.end - props.loop.start) / BARS * 100) + "%" } }),
            props.playBar >= 0 ? h("div", { className: "pl-playhead", style: { left: (props.playBar / BARS * 100) + "%" } }) : null)),
        LANES.map(function (lane) {
          return h("div", { key: lane.id, className: "pl-lane" + (lane.type === "audio" ? " audio" : "") },
            h("div", { className: "pl-lane-head" }, lane.name),
            h("div", { className: "pl-track", style: { gridTemplateColumns: "repeat(" + BARS + ",1fr)" } },
              cells(lane.id),
              lane.type === "pat"
                ? props.blocks.filter(function (bl) { return bl.lane === lane.id; }).map(function (bl) {
                  return h("div", { key: bl.id, className: "pl-block", style: { left: (bl.bar / BARS * 100) + "%", width: "calc(" + (100 / BARS) + "% - 2px)", background: "linear-gradient(180deg, color-mix(in srgb," + PATCOL[bl.pattern] + " 55%, #111), color-mix(in srgb," + PATCOL[bl.pattern] + " 28%, #111))" }, onMouseDown: function (e) { e.preventDefault(); e.stopPropagation(); props.onRemove(bl.id, bl.bar, bl.lane); } }, "P" + (bl.pattern + 1));
                })
                : props.audioClips.filter(function (c) { return c.lane === lane.id; }).map(function (c) {
                  return h("div", { key: c.id, className: "pl-clip", style: { left: (c.startBar / BARS * 100) + "%", width: "calc(" + (c.lengthBars / BARS * 100) + "% - 2px)" } }, h(W.ClipWave, { seed: c.seed, color: "rgba(46,166,255,0.6)" }), h("span", { className: "cn" }, c.name));
                }),
              props.playBar >= 0 ? h("div", { className: "pl-playhead", style: { left: (props.playBar / BARS * 100) + "%" } }) : null));
        })));
  }
  window.Playlist = Playlist;

  // ===========================================================================
  // Linear Timeline (Phase 1, Step 3) — one shared clock, absolute-tick clips.
  // Reads/writes window.engine.timeline.clips directly; engine hooks stay dormant.
  // ===========================================================================
  var TL_HEAD = 130, TL_RULER = 24, TL_LANE = 36;
  // Feature Pass 5: per-clip note-waveform cache (kept OFF the clip object so it's never serialized;
  // recomputed lazily only when a clip's notes actually change — keyed by a cheap notes signature,
  // so render/scroll/playback never recompute, and an edit auto-refreshes on the next render).
  var _clipPeakCache = {};
  function clipWavePeaks(clip) {
    var notes = clip.notes || [];
    var sig = 0; for (var i = 0; i < notes.length; i++) { var n = notes[i]; sig += (n.pitchTick || 0) + (n.lenTicks || 0) + (n.vel || 0) * 7 + (n.pitch || 0) * 31; }
    var key = clip.lengthTicks + "|" + notes.length + "|" + sig;
    var c = _clipPeakCache[clip.id];
    if (c && c.key === key) return c.peaks;
    var peaks = window.engine.clipNotePeaks(clip, 256);
    _clipPeakCache[clip.id] = { key: key, peaks: peaks };
    return peaks;
  }
  function Timeline(props) {
    var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;
    var E = window.engine, PPQ = E.PPQ, TPB = E.TICKS_PER_BAR, SNAP = E.SNAP_TICKS;
    var zs = useState(48); var ppb = zs[0], setPpb = zs[1];        // px per quarter-note (zoom)
    var ss = useState([]); var sel = ss[0], setSel = ss[1];        // selected clip ids
    var ms = useState(null); var mq = ms[0], setMq = ms[1];        // marquee rect (content coords)
    var rr = useState(0); function refresh() { rr[1](function (v) { return v + 1; }); }
    var scrollRef = useRef(null);
    var rps = useState("idle"); var recPhase = rps[0], setRecPhase = rps[1];   // idle | countin | recording
    var rks = useState(null); var recKind = rks[0], setRecKind = rks[1];        // 'mic' | 'screen' | null
    var cis = useState(0); var countBeat = cis[0], setCountBeat = cis[1];
    var mns = useState(false); var monitor = mns[0], setMonitor = mns[1];
    var rcs = useState(null); var recClip = rcs[0], setRecClip = rcs[1];        // live growing clip
    var recRef = useRef({ raf: 0, t0: 0, an: null, data: null, lane: null, start: 0 });
    var auS = useState({}); var autoMap = auS[0], setAutoMap = auS[1];     // laneId -> 'volume'|'pan'|'cutoff'
    var amS = useState(null); var autoMenu = amS[0], setAutoMenu = amS[1];  // laneId with open param menu
    var lanes = props.channels || [];
    var clips = E.timeline.clips;
    // Pass 3 T2: derive song length from clips each render (grows past 32 bars as clips extend,
    // shrinks back toward 32 — never below). recomputeTimelineLength enforces the 32-bar floor.
    var totalTicks = E.recomputeTimelineLength();
    var bars = Math.ceil(totalTicks / TPB);
    function t2x(t) { return (t / PPQ) * ppb; }
    function x2t(x) { return (x / ppb) * PPQ; }
    // ---- Adaptive snapping: the grid subdivides as you zoom in (1/4 -> 1/8 -> 1/16 -> 1/32),
    // picking the finest division whose on-screen spacing stays readable (>= ~11px). All values
    // are tick-based, so snapping/trims stay locked to the project tempo with no float drift.
    function snapTicks() {
      var q = ppb;                              // px per quarter note
      if (q >= 96) return PPQ / 8;              // 1/32
      if (q >= 48) return PPQ / 4;              // 1/16
      if (q >= 24) return PPQ / 2;              // 1/8
      return PPQ;                               // 1/4
    }
    function snapLabel() { var s = snapTicks(); return s === PPQ / 8 ? "1/32" : s === PPQ / 4 ? "1/16" : s === PPQ / 2 ? "1/8" : "1/4"; }
    function snap(t, free) { var S = snapTicks(); return free ? Math.round(t) : Math.round(t / S) * S; }
    function laneIndex(ch) { for (var i = 0; i < lanes.length; i++) if (lanes[i].id === ch) return i; return -1; }
    // cumulative content-space vertical bounds per lane id. Each lane is TL_LANE tall; an open
    // automation strip (AH) below a lane shifts everything beneath it, so marquee hit-testing must
    // measure geometry rather than assume uniform rows.
    function laneBounds() { var y = 0, m = {}; lanes.forEach(function (l) { m[l.id] = { top: y, bottom: y + TL_LANE }; y += TL_LANE; if (autoMap[l.id]) y += AH; }); return m; }
    function commit() { refresh(); props.onCommit && props.onCommit(); }
    var contentW = t2x(totalTicks);
    var playX = (props.playheadTick != null && props.playheadTick >= 0) ? t2x(props.playheadTick) : -1;

    // ---- Ctrl + MouseWheel: zoom anchored under the cursor ----
    function onWheel(e) {
      if (!e.ctrlKey) return; e.preventDefault();
      var cont = scrollRef.current, rect = cont.getBoundingClientRect(), s = tlScale() || 1;
      var mx = (e.clientX - rect.left) / s + cont.scrollLeft - TL_HEAD, tUnder = x2t(mx);   // T5: unscale before mixing layout px
      var f = e.deltaY < 0 ? 1.15 : 1 / 1.15, np = Math.max(4, Math.min(220, ppb * f));
      setPpb(np);
      requestAnimationFrame(function () { cont.scrollLeft = (tUnder / PPQ) * np - ((e.clientX - rect.left) / s - TL_HEAD); });
    }
    // ---- coordinate mapping (content space: 0 = first body px, ruler/head subtracted) ----
    // T5 fix: the whole .stage is rendered under a CSS scale() transform, so getBoundingClientRect
    // returns SCALED viewport px while scrollLeft / TL_HEAD / t2x all work in unscaled layout px.
    // The old code subtracted a layout-space TL_HEAD from a scaled delta — landing scrubs ~a bar
    // early. Divide the viewport delta by the live scale (rect.width / offsetWidth) before mixing.
    function tlScale() { var c = scrollRef.current; return c && c.offsetWidth ? c.getBoundingClientRect().width / c.offsetWidth : 1; }
    function coords(e) {
      var cont = scrollRef.current, rect = cont.getBoundingClientRect(), s = tlScale() || 1;
      return { x: (e.clientX - rect.left) / s + cont.scrollLeft - TL_HEAD, y: (e.clientY - rect.top) / s + cont.scrollTop - TL_RULER };
    }
    // ---- playhead scrubbing: move the vertical indicator to a clicked/dragged time position ----
    function scrubTo(e) { var x = coords(e).x; if (x < 0) x = 0; props.onScrub && props.onScrub(Math.max(0, snap(x2t(x), e.altKey))); }
    function dragScrub(e) {
      e.preventDefault(); scrubTo(e);
      function mv(ev) { scrubTo(ev); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    function onRulerDown(e) { if (e.button !== 0) return; dragScrub(e); }
    function onPlayheadDown(e) { if (e.button !== 0) return; e.stopPropagation(); dragScrub(e); }   // click-hold the line to scrub
    // ---- empty-body interactions: right-drag (or Marquee tool) = marquee select; plain left-click = snap playhead here ----
    function onBodyDown(e, lane) {
      var isMarquee = (e.button === 2) || (e.button === 0 && props.tool === "marquee");
      if (!isMarquee) { if (e.button === 0) dragScrub(e); return; }   // arrow tool: click empty space snaps the playhead
      e.preventDefault();
      var p0 = coords(e);
      function mv(ev) { var p = coords(ev); setMq({ x0: Math.min(p0.x, p.x), y0: Math.min(p0.y, p.y), x1: Math.max(p0.x, p.x), y1: Math.max(p0.y, p.y) }); }
      function up(ev) {
        window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
        // normalize the rect (works for all four drag directions) in CONTENT space, then select by
        // OVERLAP (standard DAW marquee): a clip is selected if its rect intersects the marquee at
        // all on BOTH axes. Strict containment required the box to fully enclose a clip, which made
        // selection impossible for the common case of stacked, multi-bar rack clips (wider than the
        // drag) — a right-drag then selected nothing. Lane vertical bounds are measured cumulatively
        // so open (variable-height) automation strips don't drift the test.
        var p = coords(ev);
        var x1 = x2t(Math.min(p0.x, p.x)), x2 = x2t(Math.max(p0.x, p.x));
        var y1 = Math.min(p0.y, p.y), y2 = Math.max(p0.y, p.y);
        var lb = laneBounds();
        var hit = []; clips.forEach(function (c) {
          var b = lb[c.ch]; if (!b) return;
          var clipLeft = c.startTick, clipRight = c.startTick + c.lengthTicks;
          if (clipLeft < x2 && clipRight > x1 && b.top < y2 && b.bottom > y1) hit.push(c.id);
        });
        setSel(hit); setMq(null);
      }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // ---- clip left-drag move (snapped). If the clip is part of a multi-clip marquee selection,
    // the whole group moves together, preserving each clip's relative offset. ----
    function onClipDown(e, clip) {
      if (e.button !== 0) return; e.stopPropagation();
      var group;
      if (sel.indexOf(clip.id) >= 0 && sel.length > 1) { group = selectedClips(); }   // drag an already-selected member -> move the group
      else { var ns = e.shiftKey ? sel.concat([clip.id]) : [clip.id]; setSel(ns); group = e.shiftKey ? clips.filter(function (c) { return ns.indexOf(c.id) >= 0; }) : [clip]; }
      var sx = e.clientX, leadOrig = clip.startTick;
      var origs = group.map(function (c) { return { c: c, start: c.startTick }; });
      var minStart = Math.min.apply(null, origs.map(function (o) { return o.start; }));
      function mv(ev) {
        var delta = Math.max(0, snap(leadOrig + x2t(ev.clientX - sx), ev.altKey)) - leadOrig;   // snap the lead clip
        if (minStart + delta < 0) delta = -minStart;                                            // clamp group at tick 0
        origs.forEach(function (o) { o.c.startTick = o.start + delta; });
        refresh();
      }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); commit(); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // ---- clip right-edge trim (chop/shorten). Boundaries snap to the adaptive, tempo-bound grid. ----
    function onClipResize(e, clip) {
      if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
      var minLen = snapTicks();
      function mv(ev) { var endTick = snap(x2t(coords(ev).x), ev.altKey); clip.lengthTicks = Math.max(minLen, endTick - clip.startTick); refresh(); }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); commit(); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // ---- Fix 1: non-destructive audio-clip fade handles (drag the top corners). Lengths are
    // stored in ticks (tempo-locked) and clamped so in+out never exceed the clip. ----
    function onFadeDrag(e, clip, which) {
      if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
      var origin = clip.startTick;
      function mv(ev) {
        var t = x2t(coords(ev).x);
        if (which === "in") { var v = Math.max(0, t - origin); clip.fadeInTicks = Math.min(v, clip.lengthTicks - (clip.fadeOutTicks || 0)); }
        else { var v2 = Math.max(0, (origin + clip.lengthTicks) - t); clip.fadeOutTicks = Math.min(v2, clip.lengthTicks - (clip.fadeInTicks || 0)); }
        refresh();
      }
      function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); commit(); }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    }
    // ---- Fix 1: per-clip gain via mouse-wheel over an audio clip (0..200%). ----
    function onClipWheel(e, clip) {
      if (e.ctrlKey) return;                                  // ctrl+wheel stays zoom
      e.preventDefault(); e.stopPropagation();
      var g = (clip.gain != null ? clip.gain : 1) + (e.deltaY < 0 ? 0.05 : -0.05);
      clip.gain = Math.max(0, Math.min(2, Math.round(g * 100) / 100)); commit();
    }
    // ---- double-click empty lane body -> create a 1-bar clip ----
    function onLaneDbl(e, lane) {
      if (!e.target.classList.contains("tl-body")) return;
      var tick = snap(coords(e).x >= 0 ? x2t(coords(e).x) : 0);
      var clip = { id: E._newClipId(), kind: "midi", ch: lane.id, startTick: Math.max(0, tick), lengthTicks: TPB, notes: [] };
      clips.push(clip); setSel([clip.id]); commit();
    }
    // ---- clipboard + delete (global keys, ignored in text fields) ----
    function selectedClips() { return clips.filter(function (c) { return sel.indexOf(c.id) >= 0; }); }
    function doCopy() { var s = selectedClips(); if (!s.length) return; var minT = Math.min.apply(null, s.map(function (c) { return c.startTick; })); window.__tlClipboard = s.map(function (c) { return { clip: JSON.parse(JSON.stringify(c)), rel: c.startTick - minT }; }); }
    function doPaste() { var cb = window.__tlClipboard; if (!cb || !cb.length) return; var at = snap(props.playheadTick >= 0 ? props.playheadTick : 0), ids = []; cb.forEach(function (it) { var nc = JSON.parse(JSON.stringify(it.clip)); nc.id = E._newClipId(); nc.startTick = at + it.rel; clips.push(nc); ids.push(nc.id); }); setSel(ids); commit(); }
    function doDelete() { if (!sel.length) return; E.timeline.clips = clips.filter(function (c) { return sel.indexOf(c.id) < 0; }); setSel([]); commit(); }
    // ---- Fix 1: split/slice at the playhead. Splits the selection (or, if nothing is selected,
    // whatever clips the playhead passes through). Each clip cut into two at the playhead tick. ----
    function doSplit() {
      var at = props.playheadTick; if (at == null || at < 0) return;
      var targets = sel.length ? selectedClips() : clips.filter(function (c) { return c.startTick < at && (c.startTick + c.lengthTicks) > at; });
      var ids = [];
      targets.forEach(function (c) { var nid = E.splitClipAt(c.id, at); if (nid) ids.push(nid); });
      if (ids.length) { setSel(ids); commit(); }
    }
    useEffect(function () {
      function onKey(e) {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        var ctrl = e.ctrlKey || e.metaKey, k = (e.key || "").toLowerCase();
        if (ctrl && k === "c") { doCopy(); }
        else if (ctrl && k === "v") { e.preventDefault(); doPaste(); }
        else if (k === "delete" || k === "backspace") { doDelete(); }
        else if (k === "s" && !ctrl) { e.preventDefault(); doSplit(); }   // Fix 1: split at playhead
      }
      window.addEventListener("keydown", onKey);
      return function () { window.removeEventListener("keydown", onKey); };
    });

    // adaptive grid drawn as layered repeating gradients (subdivision + beat + bar) — scales with
    // zoom with zero extra DOM nodes. pxSnap/pxBeat/pxBar come straight from the tick->px map.
    function gridBg() {
      var pxSnap = Math.max(2, t2x(snapTicks())), pxBeat = t2x(PPQ), pxBar = t2x(TPB);
      var sub = "repeating-linear-gradient(90deg, var(--hairline-2) 0 1px, transparent 1px " + pxSnap + "px)";
      var beat = "repeating-linear-gradient(90deg, var(--hairline-2) 0 1px, transparent 1px " + pxBeat + "px)";
      var bar = "repeating-linear-gradient(90deg, var(--hairline) 0 1px, transparent 1px " + pxBar + "px)";
      var tint = "linear-gradient(180deg, rgba(157,78,221,0.025), transparent)";
      return [sub, beat, bar, tint].join(", ");
    }
    function peakBars(peaks, w, color) {
      if (!peaks || !peaks.length) return null;
      var n = Math.max(1, Math.min(peaks.length, Math.floor(w / 2))), step = peaks.length / n, a = [];
      for (var i = 0; i < n; i++) { var p = peaks[Math.floor(i * step)] || 0; var st = { left: (i * 2) + "px", height: Math.max(8, p * 100) + "%" }; if (color) { st.background = color; } a.push(h("div", { key: i, className: "tl-wavebar", style: st })); }
      return a;
    }
    function clipEl(c, lane) {
      var x = t2x(c.startTick), w = Math.max(7, t2x(c.lengthTicks)), seld = sel.indexOf(c.id) >= 0, isAudio = c.kind === "audio";
      // Feature Pass 5: a MELODIC midi clip (tonal channel, has notes) renders a real waveform —
      // the same visual language as recorded/imported audio — instead of the note-dot preview.
      // Percussive midi clips keep the note-dot read; audio clips are untouched.
      var melodic = !isAudio && (c.notes && c.notes.length) && window.engine.classifyChannel(c.ch) === "melodic";
      var inner = isAudio
        ? h("div", { className: "tl-clip-wave" }, peakBars(c.peaks, w))
        : melodic
          ? h("div", { className: "tl-clip-wave melodic" }, peakBars(clipWavePeaks(c), w, lane.color || "var(--accent)"))
          : h("div", { className: "tl-clip-notes" }, (c.notes || []).map(function (n, ni) {
              var yy = 3 + ((23 - (((n.pitch || 0) % 24))) / 24) * (TL_LANE - 16);
              return h("div", { key: ni, className: "tl-note", style: { left: t2x(n.pitchTick), width: Math.max(2, t2x(n.lenTicks) - 1), top: yy } });
            }));
      var gainPct = Math.round((c.gain != null ? c.gain : 1) * 100);
      return h("div", { key: c.id, className: "tl-clip" + (seld ? " sel" : "") + (isAudio ? " audio" : "") + (melodic ? " melodic" : ""),
        style: { left: x, width: w, background: isAudio ? null : "color-mix(in srgb," + (lane.color || "var(--accent)") + " 26%, var(--surface-2))", borderColor: lane.color || "var(--accent)" },
        onMouseDown: function (e) { onClipDown(e, c); },
        onWheel: isAudio ? function (e) { onClipWheel(e, c); } : null,
        onDoubleClick: function (e) { e.stopPropagation(); (props.onEditClip || props.onOpenClipFx) && (props.onEditClip ? props.onEditClip(c) : props.onOpenClipFx(c)); },
        title: lane.label + (isAudio ? " audio take · scroll = gain · drag top corners = fade in/out" : " clip") + " · dbl-click → Clip Editor (Steps/Notes/FX)" + (isAudio ? "" : " · ✎ edit notes") + " · drag right edge to chop/trim" },
        h("span", { className: "tl-clip-lbl" }, (isAudio ? (c.name || "Take") : lane.label) + (isAudio && gainPct !== 100 ? "  " + gainPct + "%" : "")),
        (isAudio && (c.fadeInTicks || 0) > 0 ? h("div", { className: "tl-fade-ramp in", style: { width: Math.max(2, t2x(c.fadeInTicks)) } }) : null),
        (isAudio && (c.fadeOutTicks || 0) > 0 ? h("div", { className: "tl-fade-ramp out", style: { width: Math.max(2, t2x(c.fadeOutTicks)) } }) : null),
        (isAudio ? h("div", { className: "tl-fade-h in", title: "Fade in", onMouseDown: function (e) { onFadeDrag(e, c, "in"); } }) : null),
        (isAudio ? h("div", { className: "tl-fade-h out", title: "Fade out", onMouseDown: function (e) { onFadeDrag(e, c, "out"); } }) : null),
        (c.fx ? h("span", { className: "tl-clip-fxdot", title: "This clip has bound per-clip FX" }) : null),
        (c.routeOverride ? h("span", { className: "tl-clip-fxbadge", title: "Custom FX → Insert M" + ("0" + c.routeOverride).slice(-2) }, "FX" + c.routeOverride) : null),
        inner,
        (!isAudio ? h("button", { className: "tl-clip-notesbtn", title: "Edit notes (Piano Roll)", onMouseDown: function (e) { e.stopPropagation(); }, onClick: function (e) { e.stopPropagation(); props.onOpenClip && props.onOpenClip(c); }, onDoubleClick: function (e) { e.stopPropagation(); } }, "✎") : null),
        h("div", { className: "tl-clip-trim", title: "Trim / chop to grid (" + snapLabel() + ")", onMouseDown: function (e) { onClipResize(e, c); }, onDoubleClick: function (e) { e.stopPropagation(); } }));
    }
    function recordingClipEl(rc) {
      var x = t2x(rc.startTick), w = Math.max(7, t2x(rc.lengthTicks));
      return h("div", { className: "tl-clip audio recording", style: { left: x, width: w } }, h("div", { className: "tl-clip-wave" }, peakBars(rc.peaks, w)), h("span", { className: "tl-clip-lbl" }, "● REC"));
    }
    // ---- automation lanes (Phase 4B) ----
    var AH = 54;
    function autoData(laneId, param) { var a = E.timeline.automation; return (a[laneId] && a[laneId][param]) || []; }
    function setAutoData(laneId, param, pts) { var a = E.timeline.automation; if (!a[laneId]) a[laneId] = {}; pts.sort(function (p, q) { return p.tick - q.tick; }); a[laneId][param] = pts; commit(); }
    function chooseAuto(laneId, param) { var m = {}; for (var k in autoMap) m[k] = autoMap[k]; if (param) m[laneId] = param; else delete m[laneId]; setAutoMap(m); setAutoMenu(null); }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function autoStripEl(lane) {
      var param = autoMap[lane.id]; if (!param) return null;
      var pts = autoData(lane.id, param);
      function yFromVal(v) { return (1 - v) * (AH - 10) + 5; }
      function valFromY(y) { return clamp01(1 - (y - 5) / (AH - 10)); }
      function addPoint(e) { if (e.button !== 0) return; var r = e.currentTarget.getBoundingClientRect(); var np = pts.slice(); np.push({ tick: Math.max(0, snap(x2t(e.clientX - r.left))), value: valFromY(e.clientY - r.top) }); setAutoData(lane.id, param, np); }
      function dragPoint(e, idx) {
        e.stopPropagation(); if (e.button !== 0) return; var svg = e.currentTarget.ownerSVGElement;
        function mv(ev) { var r = svg.getBoundingClientRect(); var np = pts.slice(); np[idx] = { tick: Math.max(0, snap(x2t(ev.clientX - r.left), ev.altKey)), value: valFromY(ev.clientY - r.top) }; setAutoData(lane.id, param, np); }
        function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
        window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
      }
      function delPoint(e, idx) { e.preventDefault(); e.stopPropagation(); var np = pts.slice(); np.splice(idx, 1); setAutoData(lane.id, param, np); }
      var poly = pts.map(function (p) { return t2x(p.tick) + "," + yFromVal(p.value); }).join(" ");
      return h("div", { className: "tl-row tl-autorow", style: { height: AH } },
        h("div", { className: "tl-head tl-autohead", style: { width: TL_HEAD } }, h("span", { className: "tl-autolbl" }, param), h("span", { className: "tl-autohint" }, "click add · drag move · right-click del")),
        h("svg", { className: "tl-autobody", style: { width: contentW, height: AH }, width: contentW, height: AH, onMouseDown: addPoint, onContextMenu: function (e) { e.preventDefault(); } },
          pts.length > 1 ? h("polyline", { className: "tl-autoline", points: poly }) : null,
          pts.map(function (p, i) { return h("circle", { key: i, className: "tl-autopt", cx: t2x(p.tick), cy: yFromVal(p.value), r: 4, onMouseDown: function (e) { dragPoint(e, i); }, onContextMenu: function (e) { delPoint(e, i); } }); })));
    }

    // ---- continuous audio recording: arm -> 1-bar count-in -> capture -> clip ----
    function ensureAudioLane() {
      var ex = lanes.filter(function (l) { return l.audioLane; })[0]; if (ex) return ex.id;
      var def = E.addAudioTrack(); props.onCommit && props.onCommit(); return def.id;
    }
    function pollLevel() {
      var rs = recRef.current; if (!rs.an) return;
      rs.an.getByteTimeDomainData(rs.data);
      var s = 0; for (var i = 0; i < rs.data.length; i++) { var v = (rs.data[i] - 128) / 128; s += v * v; }
      var rms = Math.min(1, Math.sqrt(s / rs.data.length) * 2.4);
      rs.peaks = rs.peaks || []; rs.peaks.push(rms);
      var elapsed = E.ctx.currentTime - rs.t0;
      setRecClip({ startTick: rs.start, lengthTicks: Math.max(SNAP, E.secToTick(elapsed)), peaks: rs.peaks.slice(), ch: rs.lane });
      rs.raf = requestAnimationFrame(pollLevel);
    }
    function beginRecording() {
      var lane = ensureAudioLane(); var startTick = snap(props.playheadTick >= 0 ? props.playheadTick : 0);
      E.startTimelineRecording(lane, startTick, {
        monitor: monitor,
        onStart: function (an) {
          var rs = recRef.current; rs.an = an; rs.data = new Uint8Array(an.fftSize); rs.t0 = E.ctx.currentTime; rs.peaks = []; rs.lane = lane; rs.start = startTick;
          setRecKind("mic"); setRecPhase("recording"); rs.raf = requestAnimationFrame(pollLevel);
        },
        onError: function (err) { setRecPhase("idle"); setRecKind(null); props.onToast && props.onToast("Mic error: " + ((err && err.message) || "denied")); }
      });
    }
    // screen / tab / system AUDIO capture — no count-in (the browser's source picker breaks timing);
    // records straight onto an audio lane at the playhead the moment a source is chosen.
    function beginScreenRecording() {
      if (recPhase !== "idle") return;
      var lane = ensureAudioLane(); var startTick = snap(props.playheadTick >= 0 ? props.playheadTick : 0);
      E.startScreenRecording(lane, startTick, {
        monitor: false,
        onStart: function (an) {
          var rs = recRef.current; rs.an = an; rs.data = new Uint8Array(an.fftSize); rs.t0 = E.ctx.currentTime; rs.peaks = []; rs.lane = lane; rs.start = startTick;
          setRecKind("screen"); setRecPhase("recording"); rs.raf = requestAnimationFrame(pollLevel);
        },
        onError: function (err) { setRecPhase("idle"); setRecKind(null); props.onToast && props.onToast("Screen capture: " + ((err && err.message) || "cancelled")); },
        onAutoStop: function () { stopRecordFlow(); }   // user clicked the browser's "Stop sharing"
      });
    }
    function onScreenClick() { if (recPhase === "recording" && recKind === "screen") stopRecordFlow(); else beginScreenRecording(); }
    function startRecordFlow() {
      if (recPhase !== "idle") return;
      setRecPhase("countin"); setCountBeat(0);
      var beatSec = 60 / E.tempo, now = E.ctx.currentTime;
      for (var i = 0; i < 4; i++) E.metronomeClick(now + i * beatSec, i === 0);   // audible 1-bar count-in
      var bt = 0; var iv = setInterval(function () { bt++; setCountBeat(bt); if (bt >= 4) { clearInterval(iv); beginRecording(); } }, beatSec * 1000);
    }
    function stopRecordFlow() {
      var rs = recRef.current; if (rs.raf) cancelAnimationFrame(rs.raf); rs.an = null;
      E.stopTimelineRecording(function (clip) {
        setRecPhase("idle"); setRecKind(null); setRecClip(null); commit();
        props.onToast && props.onToast("Recorded take · " + Math.round((clip.lengthTicks / TPB) * 10) / 10 + " bars");
      }, function () { setRecPhase("idle"); setRecKind(null); setRecClip(null); });
    }
    function onRecClick() { if (recPhase === "recording") stopRecordFlow(); else if (recPhase === "idle") startRecordFlow(); }

    var rulerMarks = []; for (var bi = 0; bi < bars; bi++) rulerMarks.push(h("div", { key: bi, className: "tl-barlabel" + (bi % 4 === 0 ? " q" : ""), style: { left: t2x(bi * TPB), width: t2x(TPB) } }, bi + 1));

    return h("div", { className: "tl" },
      h("div", { className: "tl-toolbar" },
        h("span", { className: "tl-title" }, "TIMELINE"),
        h("button", { className: "tl-rec" + (recKind === "mic" ? " on" : ""), onClick: onRecClick, disabled: recKind === "screen", title: "Record microphone audio onto the timeline (1-bar count-in)" },
          h("span", { className: "tl-rec-dot" }), (recKind === "mic" && recPhase === "recording") ? "Stop" : recPhase === "countin" ? "Count-in…" : "Rec Audio"),
        h("button", { className: "tl-rec screen" + (recKind === "screen" ? " on" : ""), onClick: onScreenClick, disabled: recPhase !== "idle" && recKind !== "screen", title: "Capture audio from a screen, window, or browser tab — choose a source and tick “Share audio”" },
          h(I.Monitor, { width: 13, height: 13 }), recKind === "screen" ? "Stop" : "Rec Screen"),
        h("button", { className: "tl-mon" + (monitor ? " on" : ""), onClick: function () { setMonitor(!monitor); }, title: "Input monitoring (use headphones to avoid feedback)" },
          h(I.Mic, { width: 12, height: 12 }), monitor ? "Monitor: On" : "Monitor: Off"),
        h("div", { className: "tl-tools" },
          h("button", { className: "tl-tool" + (props.tool !== "marquee" ? " on" : ""), title: "Arrow tool (V)", onClick: function () { props.onSetTool && props.onSetTool("arrow"); } }, "▸"),
          h("button", { className: "tl-tool" + (props.tool === "marquee" ? " on" : ""), title: "Marquee tool (M) — left-drag selects", onClick: function () { props.onSetTool && props.onSetTool("marquee"); } }, "▢"),
          h("button", { className: "tl-tool", title: "Split at playhead (S) — slices the selected clip(s), or whatever the playhead crosses", onClick: doSplit }, "✂")),
        h("span", { className: "tl-hint" }, "Click empties / drag the playhead to scrub · marquee a group then drag any clip to move all · trim a clip's right edge"),
        h("span", { className: "tl-snapchip", title: "Adaptive grid — subdivides automatically as you zoom" }, "GRID ", h("b", null, snapLabel())),
        h("div", { className: "tl-zoom" }, h("span", { className: "lbl" }, "ZOOM"),
          h("input", { type: "range", className: "slider", min: 4, max: 200, step: 1, value: ppb, onChange: function (e) { setPpb(parseFloat(e.target.value)); } }),
          h("span", { className: "mono" }, Math.round(ppb) + "px/♪")),
        sel.length ? h("span", { className: "tl-selcount" }, sel.length + " selected") : null),
      h("div", { className: "tl-scroll", ref: scrollRef, onWheel: onWheel, onContextMenu: function (e) { e.preventDefault(); } },
        h("div", { className: "tl-inner", style: { width: (TL_HEAD + contentW) + "px" } },
          h("div", { className: "tl-row tl-rulerrow", style: { height: TL_RULER } },
            h("div", { className: "tl-head", style: { width: TL_HEAD } }, "BARS"),
            h("div", { className: "tl-rulerbody scrub", style: { width: contentW }, onMouseDown: onRulerDown }, rulerMarks,
              playX >= 0 ? h("div", { className: "tl-playhead grab", style: { left: playX }, onMouseDown: onPlayheadDown }, h("div", { className: "tl-playhead-grip" })) : null)),
          lanes.length ? lanes.map(function (lane) {
            var laneClips = clips.filter(function (c) { return c.ch === lane.id; });
            var row = h("div", { className: "tl-row", style: { height: TL_LANE } },
              h("div", { className: "tl-head", style: { width: TL_HEAD } },
                h("span", { className: "tl-led", style: { background: lane.color } }),
                (function () {
                  // instrument/melody glyph — drum for percussive lanes, note for melodic (Pass 5 T1)
                  var mel = E.classifyChannel(lane.id) === "melodic";
                  return h("span", { className: "tl-typeglyph", title: mel ? "Melody (tonal)" : "Instrument (percussive)", style: { color: lane.color } }, h(mel ? I.Note : I.Drum, { width: 12, height: 12 }));
                })(),
                h("span", { className: "tl-lname" }, lane.label),
                // inline track mix controls — mute + volume, bound straight to the engine channel state
                (function () {
                  var st = E.channels[lane.id]; if (!st) return null;
                  return h("div", { className: "tl-mix" },
                    h("button", { className: "tl-mute" + (st.muted ? " on" : ""), title: "Mute track", onClick: function (e) { e.stopPropagation(); E.muteCh(lane.id); commit(); } }, "M"),
                    h(W.MicroKnob, { value: st.vol, min: 0, max: 1, color: lane.color, title: "Volume", onChange: function (v) { E.setChannelVol(lane.id, v); commit(); } }),
                    // single track-deletion entry point in the timeline-first UI -> E.removeChannel
                    // (disconnect nodes, splice channelDefs, purge every bank + timeline clips, repair focus)
                    h("button", { className: "tl-del", title: "Delete track", onClick: function (e) { e.stopPropagation(); props.onDeleteTrack && props.onDeleteTrack(lane.id); } }, h(I.Trash, { width: 12, height: 12 })));
                })(),
                h("button", { className: "tl-autobtn" + (autoMap[lane.id] ? " on" : ""), title: "Automation lane (volume / pan / cutoff)", onClick: function (e) { e.stopPropagation(); setAutoMenu(autoMenu === lane.id ? null : lane.id); } }, "≈"),
                autoMenu === lane.id ? h("div", { className: "tl-automenu" },
                  ["volume", "pan", "cutoff"].map(function (pp) { return h("button", { key: pp, className: autoMap[lane.id] === pp ? "on" : "", onClick: function () { chooseAuto(lane.id, pp); } }, pp.charAt(0).toUpperCase() + pp.slice(1)); }),
                  h("button", { className: "off", onClick: function () { chooseAuto(lane.id, null); } }, "Off")) : null),
              h("div", { className: "tl-body", style: { width: contentW, backgroundImage: gridBg() }, onMouseDown: function (e) { onBodyDown(e, lane); }, onDoubleClick: function (e) { onLaneDbl(e, lane); } },
                laneClips.map(function (c) { return clipEl(c, lane); }),
                (recClip && recClip.ch === lane.id) ? recordingClipEl(recClip) : null,
                playX >= 0 ? h("div", { className: "tl-playhead", style: { left: playX } }) : null));
            return h(React.Fragment, { key: lane.id }, row, autoStripEl(lane));
          }) : h("div", { className: "tl-empty" }, "No lanes yet — add a track, “Load Demo”, or hit Rec Audio to record a take."),
          mq ? h("div", { className: "tl-marquee", style: { left: TL_HEAD + mq.x0, top: TL_RULER + mq.y0, width: mq.x1 - mq.x0, height: mq.y1 - mq.y0 } }) : null,
          recPhase === "countin" ? h("div", { className: "tl-countin" }, h("div", { className: "tl-countin-ring", key: countBeat }), h("div", { className: "tl-countin-num" }, "COUNT-IN " + Math.min(4, countBeat + 1) + " / 4")) : null)));
  }
  window.Timeline = Timeline;
})();
