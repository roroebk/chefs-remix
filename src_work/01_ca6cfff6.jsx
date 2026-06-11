/* Chef's Remix v3 — icon set (stroke 1.7, 24px viewbox) */
(function () {
  var h = React.createElement;
  function svg(p, kids) { if (Array.isArray(kids)) kids = kids.map(function (k, i) { return k && !k.key ? React.cloneElement(k, { key: "ic" + i }) : k; }); return h("svg", Object.assign({ width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "strokeWidth": 1.7, "strokeLinecap": "round", "strokeLinejoin": "round" }, p), kids); }
  function P(d) { return h("path", { d: d }); }
  var I = {
    Play: function (p) { return svg(p, h("path", { d: "M7 5l13 7-13 7V5z", fill: "currentColor", stroke: "none" })); },
    Stop: function (p) { return svg(p, h("rect", { x: 6, y: 6, width: 12, height: 12, rx: 2, fill: "currentColor", stroke: "none" })); },
    Rec: function (p) { return svg(p, h("circle", { cx: 12, cy: 12, r: 6, fill: "currentColor", stroke: "none" })); },
    Logo: function (p) { return svg(p, [h("path", { key: 1, d: "M5 14a7 7 0 0114 0", fill: "currentColor", stroke: "none" }), h("rect", { key: 2, x: 4, y: 14, width: 16, height: 4, rx: 1, fill: "currentColor", stroke: "none" }), h("circle", { key: 3, cx: 8.5, cy: 8.5, r: 1.1, fill: "#0e1014", stroke: "none" }), h("circle", { key: 4, cx: 15.5, cy: 8.5, r: 1.1, fill: "#0e1014", stroke: "none" })]); },
    Rack: function (p) { return svg(p, [P("M3 6h18"), P("M3 12h18"), P("M3 18h18"), h("circle", { key: 1, cx: 8, cy: 6, r: 1.3, fill: "currentColor" }), h("circle", { key: 2, cx: 14, cy: 12, r: 1.3, fill: "currentColor" }), h("circle", { key: 3, cx: 10, cy: 18, r: 1.3, fill: "currentColor" })]); },
    Piano: function (p) { return svg(p, [h("rect", { key: 1, x: 3, y: 5, width: 18, height: 14, rx: 1.5 }), P("M8 5v9M13 5v9M18 5v9")]); },
    Timeline: function (p) { return svg(p, [P("M3 7h7v4H3zM12 13h9v4h-9zM6 13h3v4H6z")]); },
    Mixer: function (p) { return svg(p, [P("M6 4v16M12 4v16M18 4v16"), h("circle", { key: 1, cx: 6, cy: 9, r: 2 }), h("circle", { key: 2, cx: 12, cy: 14, r: 2 }), h("circle", { key: 3, cx: 18, cy: 7, r: 2 })]); },
    Download: function (p) { return svg(p, [P("M12 3v12M7 11l5 4 5-4M5 20h14")]); },
    X: function (p) { return svg(p, P("M6 6l12 12M18 6L6 18")); },
    Check: function (p) { return svg(p, P("M4 12l5 5L20 6")); },
    Reset: function (p) { return svg(p, [P("M3 12a9 9 0 109-9 9 9 0 00-6.4 2.7L3 8"), P("M3 4v4h4")]); },
    Sparkle: function (p) { return svg(p, P("M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z")); },
    Chevron: function (p) { return svg(p, P("M9 6l6 6-6 6")); },
    ChevL: function (p) { return svg(p, P("M15 6l-6 6 6 6")); },
    ChevD: function (p) { return svg(p, P("M6 9l6 6 6-6")); },
    Plus: function (p) { return svg(p, P("M12 5v14M5 12h14")); },
    Layers: function (p) { return svg(p, [P("M12 3l9 5-9 5-9-5 9-5z"), P("M3 13l9 5 9-5")]); },
    Book: function (p) { return svg(p, [P("M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"), P("M4 19a2 2 0 012-2h13")]); },
    Bolt: function (p) { return svg(p, P("M13 3L5 13h6l-1 8 8-10h-6l1-8z")); },
    Wave: function (p) { return svg(p, P("M3 12h2l2-6 3 14 3-18 3 12 2-2h3")); },
    Disc: function (p) { return svg(p, [h("circle", { key: 1, cx: 12, cy: 12, r: 9 }), h("circle", { key: 2, cx: 12, cy: 12, r: 2.4, fill: "currentColor" })]); },
    Knob: function (p) { return svg(p, [h("circle", { key: 1, cx: 12, cy: 12, r: 8 }), P("M12 5v4")]); },
    Note: function (p) { return svg(p, [h("circle", { key: 1, cx: 7, cy: 17, r: 3 }), P("M10 17V5l9-2v12"), h("circle", { key: 2, cx: 16, cy: 15, r: 3 })]); },
    Folder: function (p) { return svg(p, P("M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z")); },
    Mic: function (p) { return svg(p, [h("rect", { key: 1, x: 9, y: 3, width: 6, height: 11, rx: 3 }), P("M5 11a7 7 0 0014 0M12 18v3")]); },
    Monitor: function (p) { return svg(p, [h("rect", { key: 1, x: 3, y: 4, width: 18, height: 12, rx: 2 }), P("M8 20h8M12 16v4")]); },
    Slider: function (p) { return svg(p, [P("M4 8h10M18 8h2M4 16h2M10 16h10"), h("circle", { key: 1, cx: 16, cy: 8, r: 2.2, fill: "currentColor" }), h("circle", { key: 2, cx: 8, cy: 16, r: 2.2, fill: "currentColor" })]); },
    Dice: function (p) { return svg(p, [h("rect", { key: 1, x: 4, y: 4, width: 16, height: 16, rx: 3 }), h("circle", { key: 2, cx: 9, cy: 9, r: 1.2, fill: "currentColor" }), h("circle", { key: 3, cx: 15, cy: 15, r: 1.2, fill: "currentColor" }), h("circle", { key: 4, cx: 15, cy: 9, r: 1.2, fill: "currentColor" }), h("circle", { key: 5, cx: 9, cy: 15, r: 1.2, fill: "currentColor" })]); },
    Trash: function (p) { return svg(p, [P("M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13h10l1-13")]); }
  };
  window.Icons = I;
})();
