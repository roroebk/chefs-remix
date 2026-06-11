/* Chef's Remix v3 — Dense Channel Rack (22px rows, beat-block coloring, playhead) */
(function () {
  var h = React.createElement, useState = React.useState;
  var W = window.W, I = window.Icons;

  function RouteCell(props) {
    var down = W.useVDrag(function () { return props.route; }, function (v) { props.onRoute(Math.round(v)); }, { min: 1, max: 16, sens: 0.012 });
    return h("div", { className: "cr-route", onMouseDown: down, title: "Mixer route → M" + ("0" + props.route).slice(-2) + " (drag vertically)" },
      h("span", { className: "mono" }, "M" + ("0" + props.route).slice(-2)));
  }

  function StepGrid(props) {
    var ch = props.ch, steps = props.steps, playStep = props.playStep;
    var cells = [];
    for (var i = 0; i < 16; i++) {
      (function (i) {
        var st = steps[i] || { on: false, vel: 100 }; var block = Math.floor(i / 4); var even = block % 2 === 0; var down = i % 4 === 0;
        var cls = "step " + (even ? "blkA" : "blkB") + (down ? " down" : "");
        var style = {};
        if (st.on) {
          cls += " on"; var a = 0.5 + 0.5 * (st.vel / 127);
          style.background = "color-mix(in srgb, " + ch.color + " " + Math.round(a * 100) + "%, transparent)";
          style["--stepc"] = ch.color;
        }
        cells.push(h("div", {
          key: i, className: cls, style: style,
          onMouseDown: function (e) { e.preventDefault(); props.onToggle(ch.id, i); },
          onContextMenu: function (e) { e.preventDefault(); props.onToggle(ch.id, i); }
        }));
      })(i);
    }
    var playcol = playStep >= 0 ? h("div", { className: "playcol on", style: { left: "calc(" + (playStep / 16 * 100) + "% + 2px)" } }) : null;
    return h("div", { className: "steps", style: { gridTemplateColumns: "repeat(16,1fr)" } }, cells, playcol);
  }

  function ChanRow(props) {
    var ch = props.ch, c = props.state;
    var ov = useState(false); var over = ov[0], setOver = ov[1];
    return h("div", {
      className: "chan-row" + (props.focused ? " focus" : "") + (over ? " drop" : ""), "data-screen-label": "track:" + ch.label,
      onDragOver: function (e) { if (window.__dragSample) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!over) setOver(true); } },
      onDragLeave: function () { if (over) setOver(false); },
      onDrop: function (e) { e.preventDefault(); setOver(false); props.onDropSample(ch.id); }
    },
      h("div", { className: "cr-label", onClick: function () { props.onFocus(ch.id); }, title: ch.label + " — click to focus graph editor" },
        h("span", { className: "cr-led", style: { background: ch.color, boxShadow: props.lit ? "0 0 7px " + ch.color : "none", opacity: props.lit ? 1 : 0.5 } }),
        h("span", { className: "cr-name" }, ch.label)),
      h("div", { className: "cr-ms" },
        h("button", { className: "m" + (c.muted ? " on" : ""), onClick: function () { props.onMute(ch.id); }, title: "Mute" }, "M"),
        h("button", { className: "s" + (c.solo ? " on" : ""), onClick: function () { props.onSolo(ch.id); }, title: "Solo" }, "S")),
      h("div", { className: "cr-micro" },
        h(W.MicroKnob, { value: c.vol, min: 0, max: 1, color: ch.color, title: "Vol", onChange: function (v) { props.onVol(ch.id, v); } }),
        h(W.MicroKnob, { value: c.pan, min: -1, max: 1, color: "var(--accent-3)", title: "Pan", onChange: function (v) { props.onPan(ch.id, v); } })),
      h(RouteCell, { route: c.route, onRoute: function (v) { props.onRoute(ch.id, v); } }),
      h(StepGrid, { ch: ch, steps: props.steps, playStep: props.playStep, onToggle: props.onToggle }),
      h("button", { className: "cr-del", title: "Delete track (removes audio nodes + all pattern data)",
        onClick: function (e) { e.stopPropagation(); props.onDelete(ch.id); } },
        I && I.Trash ? h(I.Trash, null) : "✕"));
  }

  function ChannelRack(props) {
    var beats = [];
    for (var i = 0; i < 16; i++) {
      var q = i % 4 === 0;
      beats.push(h("div", { key: i, className: "rl-beat" + (q ? " q" : "") }, q ? String(i / 4 + 1) : (i % 4 === 2 ? "·" : "")));
    }
    return h("div", { className: "rack" },
      h("div", { className: "rack-ruler" },
        h("div", { className: "rl-pad" }),
        h("div", { className: "rl-grid", style: { gridTemplateColumns: "repeat(16,1fr)" } }, beats)),
      props.channels.map(function (ch) {
        var st = props.state[ch.id];
        return h(ChanRow, {
          key: ch.id, ch: ch, state: st, steps: props.pattern.steps[ch.id] || [],
          focused: props.focus === ch.id, lit: props.litMap[ch.id], playStep: props.playStep,
          onFocus: props.onFocus, onToggle: props.onToggle, onVol: props.onVol, onPan: props.onPan,
          onRoute: props.onRoute, onMute: props.onMute, onSolo: props.onSolo, onDropSample: props.onDropSample,
          onDelete: props.onDelete
        });
      }));
  }

  window.ChannelRack = ChannelRack;
})();
