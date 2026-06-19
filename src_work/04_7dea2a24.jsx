/* Chef's Remix v3 — FL-style File Browser: factory tree + linkable custom kit folders,
 * sample preview, and drag / double-click routing to Channel Rack rows.
 * Linked folders (real local directories via the File System Access API, or a simulated demo
 * kit) are appended directly into the factory library registry array (window.__FACTORY.children)
 * and behave identically to imported audio samples. */
(function () {
  var h = React.createElement, useState = React.useState;
  var I = window.Icons, FXMETA = window.FXMETA;
  var seq = 0; function uid() { return "s" + (++seq); }

  // a sample row maps to a synthesized voice (type) — preview & hot-swap use the engine
  function mk(name, type, opts) { opts = opts || {}; return { kind: "sample", id: uid(), name: name, type: type, tonal: !!opts.tonal, base: opts.base, previewSemis: opts.ps || 0, color: opts.color || "#8b9098" }; }
  function fold(name, children, color) { return { kind: "folder", id: uid(), name: name, color: color, children: children }; }

  // ---- factory stock library (the registry array linked folders get appended into) ----
  function factoryTree() {
    return fold("Factory Core", [
      fold("Drums", [
        fold("Kicks", [mk("Linear Kick.wav", "kick", { color: "#39ff14" }), mk("Punch Kick.wav", "kick", { ps: -2, color: "#39ff14" }), mk("Sub Kick.wav", "kick", { ps: -5, color: "#39ff14" })]),
        fold("Snares", [mk("Tight Snare.wav", "snare", { color: "#ff5cc8" }), mk("909 Clap.wav", "clap", { color: "#ff5cc8" })]),
        fold("Hi-Hats", [mk("Closed Hat.wav", "chat", { color: "#ffb338" }), mk("Open Hat.wav", "ohat", { color: "#ffb338" }), mk("Shaker.wav", "shaker", { color: "#ffb338" })]),
        fold("Percussion", [mk("Anvil Hit.wav", "anvil", { color: "#2ee6c8" }), mk("Rim Click.wav", "rim", { color: "#2ee6c8" })])
      ], "#39ff14"),
      fold("Bass & 808", [mk("Sub 808.wav", "sub", { tonal: true, base: 36, color: "#2ea6ff" }), mk("Reese Bass.wav", "reese", { tonal: true, base: 36, color: "#2ea6ff" })], "#39ff14"),
      fold("Synths", [mk("Glitch WT.wav", "glitch", { tonal: true, base: 60, color: "#b07bff" }), mk("Chord Pluck.wav", "pluck", { tonal: true, base: 48, color: "#c6ff3a" }), mk("Arp Pulse.wav", "arp", { tonal: true, base: 60, color: "#b07bff" }), mk("Lead Stab.wav", "lead", { tonal: true, base: 72, color: "#39ff14" })], "#39ff14"),
      fold("Vox & FX", [mk("Vocal Chop.wav", "vox", { tonal: true, base: 60, color: "#ff5470" }), mk("Noise Riser.wav", "riser", { color: "#cdd3da" })], "#39ff14")
    ], "#39ff14");
  }
  function getFactory() { return window.__FACTORY || (window.__FACTORY = factoryTree()); }
  // ---- Phase 3: Factory Asset Purge (LISTING ONLY) ----
  // New projects start with an empty, custom-ready library. We HIDE the stock "Factory Core" demo
  // entries (Drums / 808s / Synths / Kicks / Snares / Hi-Hats / …) from the sidebar listing + search
  // — but the factory metadata tree itself stays fully intact in window.__FACTORY (factoryTree is
  // still built and seeded). Nothing here deletes assets or breaks the type/base/sampleId metadata
  // that saved projects resolve their channel voices against (channels carry their own type, so a
  // saved project loads + plays regardless of what the browser lists). Only USER-linked folders
  // (userRoot) are surfaced as the visible library.
  function visibleRoots() { return getFactory().children.filter(function (n) { return n.userRoot; }); }

  // ---- generate a deep nested kit for a simulated (no real handle) folder link ----
  function genKit(alias) {
    var pre = (alias.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "KIT");
    function n(label, i) { return pre + " " + label + " " + ("0" + i).slice(-2) + ".wav"; }
    var A = "#ffb338";
    return fold(alias, [
      fold("Kicks", [mk(n("Kick", 1), "kick", { color: A }), mk(n("Kick", 2), "kick", { ps: -3, color: A }), mk(n("Kick", 3), "kick", { ps: 2, color: A })]),
      fold("Snares & Claps", [mk(n("Snare", 1), "snare", { color: A }), mk(n("Clap", 1), "clap", { color: A })]),
      fold("Hi-Hats", [mk(n("ClosedHat", 1), "chat", { color: A }), mk(n("OpenHat", 1), "ohat", { color: A }), mk(n("Shaker", 1), "shaker", { color: A })]),
      fold("Percussion", [mk(n("Perc", 1), "anvil", { color: A }), mk(n("Rim", 1), "rim", { color: A })]),
      fold("808 & Bass", [mk(n("808", 1), "sub", { tonal: true, base: 36, color: A }), mk(n("Reese", 1), "reese", { tonal: true, base: 36, color: A })]),
      fold("Melodic Loops", [mk(n("Pluck", 1), "pluck", { tonal: true, base: 48, color: A }), mk(n("Lead", 1), "lead", { tonal: true, base: 72, color: A }), mk(n("Glitch", 1), "glitch", { tonal: true, base: 60, color: A })])
    ], A);
  }

  function countSamples(node) { if (node.kind === "sample") return 1; var c = 0; node.children.forEach(function (k) { c += countSamples(k); }); return c; }

  // ---- read a real local directory (File System Access API) into a kit of real-File samples.
  // budgeted (cap ~500 files) and recursive; each sample carries its File so it decodes & plays
  // exactly like an imported audio sample. ----
  function collectDir(dirHandle, budget) {
    budget = budget || { n: 0 };
    var node = fold(dirHandle.name, [], "#ffb338");
    var it = dirHandle.values();
    function step() {
      return it.next().then(function (res) {
        if (res.done) return node;
        var entry = res.value;
        if (entry.kind === "file" && budget.n < 500 && MEDIA_RE.test(entry.name)) {
          budget.n++;
          return entry.getFile().then(function (file) {
            node.children.push({ kind: "sample", id: uid(), name: entry.name, type: "sampler", tonal: true, base: 60, previewSemis: 0, color: "#ffb338", userFile: true, file: file });
            return step();
          }, function () { return step(); });
        }
        if (entry.kind === "directory") return collectDir(entry, budget).then(function (sub) { if (countSamples(sub)) node.children.push(sub); return step(); });
        return step();
      });
    }
    return step();
  }

  // accepted import types — audio AND video containers (screen recordings: mp4/mov/mkv/webm).
  // decodeAudioData pulls the audio track out of video containers, so a screen-recording's sound
  // imports exactly like an audio file.
  var MEDIA_RE = /\.(wav|mp3|ogg|m4a|aac|flac|opus|aiff?|webm|mp4|m4v|mov|mkv)$/i;
  function isMedia(file) { return MEDIA_RE.test(file.name || "") || /^(audio|video)\//.test(file.type || ""); }

  var LS_KEY = "cr3-folders";
  // persist only the simulated (path-backed) folders — real File handles can't survive a reload.
  function persistRoots() {
    try {
      var roots = getFactory().children.filter(function (n) { return n.userRoot && n.persistable; });
      localStorage.setItem(LS_KEY, JSON.stringify(roots.map(function (k) { return { alias: k.name, path: k.path || "" }; })));
    } catch (e) {}
  }
  // seed persisted folders into the factory registry exactly once per session
  function seedPersisted() {
    var f = getFactory(); if (window.__FACTORY_SEEDED) return; window.__FACTORY_SEEDED = true;
    try {
      JSON.parse(localStorage.getItem(LS_KEY) || "[]").forEach(function (e) {
        var k = genKit(e.alias); k.path = e.path; k.userRoot = true; k.persistable = true; f.children.push(k);
      });
    } catch (e) {}
  }

  function fuzzy(name, q) { name = name.toLowerCase(); if (name.indexOf(q) >= 0) return true; var j = 0; for (var i = 0; i < name.length && j < q.length; i++) if (name[i] === q[j]) j++; return j === q.length; }
  function flatten(node, prefix, out) { if (node.kind === "sample") { out.push({ s: node, path: prefix }); return; } var p = prefix ? prefix + " / " + node.name : node.name; node.children.forEach(function (c) { flatten(c, p, out); }); }

  function LinkModal(props) {
    var p = useState("D:/Samples/Cyberpunk_Kit_v3"); var path = p[0], setPath = p[1];
    var a = useState("Cyberpunk Kit v3"); var alias = a[0], setAlias = a[1];
    var bs = useState(false); var busy = bs[0], setBusy = bs[1];
    var supported = typeof window.showDirectoryPicker === "function";
    function submit() { var al = alias.trim() || (path.split(/[\\/]/).filter(Boolean).pop() || "Custom Kit"); props.onLink(path.trim(), al); }
    function browse() {
      if (!supported) return;
      window.showDirectoryPicker().then(function (dir) {
        setBusy(true);
        collectDir(dir).then(function (node) {
          node.name = (alias.trim() || dir.name); node.color = "#ffb338";
          setBusy(false);
          if (!countSamples(node)) { props.toast && props.toast("No audio files found in that folder", h(I.X, null)); return; }
          props.onLinkReal(node);
        });
      })["catch"](function () { setBusy(false); });
    }
    return h("div", { className: "overlay", onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className: "modal", style: { width: 460 } },
        h("div", { className: "modal-head" },
          h("div", { className: "mi", style: { background: "color-mix(in srgb,#ffb338 18%, var(--surface-3))", color: "#ffb338" } }, h(I.Folder, null)),
          h("h3", null, "Link Extra Search Folder"),
          h("button", { className: "tbtn", style: { marginLeft: "auto", width: 32, height: 32 }, onClick: props.onClose }, h(I.X, { width: 16, height: 16 }))),
        h("div", { className: "modal-body" },
          h("p", { style: { fontSize: 11.5, color: "var(--dim)", marginBottom: 14, lineHeight: 1.5 } }, "Mount a folder of samples into the library. Files behave exactly like imported audio — preview, drag to a track, or double-click to load. Mounted folders are added straight into the library registry."),
          h("div", { className: "form-field" }, h("label", null, "Display Alias"), h("input", { className: "text-input", value: alias, onChange: function (e) { setAlias(e.target.value); }, placeholder: "My Drum Kit" })),
          supported
            ? h("button", { className: "byo-btn import", style: { width: "100%", height: 38, marginBottom: 4 }, disabled: busy, onClick: browse },
                h(I.Folder, { width: 15, height: 15 }), busy ? "Reading folder…" : "Browse Local Folder…")
            : h("div", { className: "form-field" }, h("label", null, "Directory Path"), h("input", { className: "text-input mono", value: path, spellCheck: false, onChange: function (e) { setPath(e.target.value); }, placeholder: "D:/Samples/My_Kit" }))),
        h("div", { className: "modal-foot" },
          h("button", { className: "btn ghost", onClick: props.onClose }, "Cancel"),
          h("button", { className: "btn primary", style: { background: "#ffb338", borderColor: "#ffb338", color: "#1f1300" }, onClick: submit },
            [h(I.Plus, { width: 16, height: 16, key: 1 }), supported ? "Mount Demo Kit" : "Mount Folder"]))));
  }

  function FileBrowser(props) {
    seedPersisted();
    var ctRef = React.useRef(null);   // single-click preview debounce — cancelled by a double-click (T4)
    var tb = useState("files"); var tab = tb[0], setTab = tb[1];
    var fr = useState(0); function rerender() { fr[1](function (x) { return x + 1; }); }
    var ex = useState(function () { var o = {}; var f = getFactory(); o[f.id] = true; (f.children || []).forEach(function (c) { if (/drum/i.test(c.name)) o[c.id] = true; }); return o; }); var expanded = ex[0], setExpanded = ex[1];
    var lm = useState(false); var showLink = lm[0], setShowLink = lm[1];
    var qs = useState(""); var query = qs[0], setQuery = qs[1];
    var melodyRef = React.useRef(null);                                     // hidden picker for "Add Melody File" (Fix 1)
    var mmRef = React.useRef(null);                                         // hidden picker for "Melody Maker" (Phase 5, single file)
    var factory = getFactory();

    // NOTE: the "Add File(s)" button + its picker/importFolder helper were removed per the FINAL
    // BUILD spec — sampler-style file import now lives solely on "Link Instrumental Folder", and
    // single melody/audio imports on "Add Melody File" (continuous Audio Lane). The Factory Core
    // library tree below is unaffected.

    // Fix 1 — "Add Melody File": dual-path ingestion. Unlike the removed Add File(s) (which made step/grid
    // sampler rows), a melody import goes straight onto the linear timeline as a continuous Audio
    // Lane clip (full-length waveform, no step block needed). Delegated to the host (engine.addMelodyFile).
    function addMelodies(fileList) {
      var files = Array.prototype.slice.call(fileList || []).filter(isMedia);
      if (!files.length) { props.toast && props.toast("No audio/video files to add", h(I.X, null)); return; }
      if (!props.onAddMelody) return;
      props.onAddMelody(files);
    }

    // Phase 5 — "Melody Maker": a single audio file (WAV/MP3) becomes a polyphonic pitch-shifting
    // sampler track (polySampler) you play across the Piano Roll. STRICTLY one file — folders route
    // to "Link Instrumental Folder", multi-select is rejected. The host decodes + creates the track.
    function addMelodyMaker(fileList) {
      var files = Array.prototype.slice.call(fileList || []).filter(isMedia);
      if (!files.length) { props.toast && props.toast("Pick a single audio file (WAV/MP3)", h(I.X, null)); return; }
      if (files.length > 1) { props.toast && props.toast("Melody Maker takes one file — use Link Instrumental Folder for folders", h(I.X, null)); return; }
      if (!props.onMelodyMaker) return;
      props.onMelodyMaker(files[0]);
    }

    // NOTE: the standalone "Import Audio" picker and sidebar "Record Mic" utility were retired —
    // local files now stream natively through the linked directory picker (Link Folder / Drum Kit),
    // and recording lives entirely on the main linear timeline (Rec Audio).

    function toggle(id) { setExpanded(function (m) { var n = Object.assign({}, m); n[id] = !n[id]; return n; }); }
    function expand(id) { setExpanded(function (m) { var n = Object.assign({}, m); n[getFactory().id] = true; n[id] = true; return n; }); }
    // simulated (path) link -> generated demo kit appended into the factory registry array
    function onLink(path, alias) {
      var kit = genKit(alias); kit.path = path; kit.userRoot = true; kit.persistable = true;
      factory.children.push(kit); persistRoots(); expand(kit.id); setShowLink(false); rerender();
      props.toast("Mounted " + alias, h(I.Folder, { width: 16, height: 16 }));
    }
    // real local folder -> kit of real Files appended into the factory registry array
    function onLinkReal(node) {
      node.userRoot = true; factory.children.push(node); expand(node.id); setShowLink(false); rerender();
      props.toast("Mounted " + node.name + " · " + countSamples(node) + " samples", h(I.Folder, { width: 16, height: 16 }));
    }
    function unlink(id, e) { e.stopPropagation(); factory.children = factory.children.filter(function (k) { return k.id !== id; }); persistRoots(); rerender(); }

    function sampleRow(node, pad, pathLabel) {
      return h("div", {
        key: node.id, className: "trow sample" + (node.userFile ? " userfile" : ""), style: { paddingLeft: pad }, draggable: true,
        title: node.name + " — click to preview · drag to a track · double-click to create a new track",
        // single-click previews (debounced so a double-click doesn't also fire a preview)
        onClick: function () { if (ctRef.current) clearTimeout(ctRef.current); ctRef.current = setTimeout(function () { ctRef.current = null; props.onPreview(node); }, 220); },
        // double-click auto-creates a new track loaded with this sample (T4)
        onDoubleClick: function () { if (ctRef.current) { clearTimeout(ctRef.current); ctRef.current = null; } (props.onCreateTrack || function (n) { props.onAssign(props.focus, n); })(node); },
        onDragStart: function (e) { window.__dragSample = node; e.dataTransfer.effectAllowed = "copy"; try { e.dataTransfer.setData("text/plain", node.name); } catch (er) {} },
        onDragEnd: function () { window.__dragSample = null; }
      },
        h("span", { className: "tcaret" }),
        h("span", { className: "swatch", style: { background: node.color } }),
        (function () {
          // Pass 5 T1: type glyph — note for melodic/tonal sounds, drum for percussive one-shots
          var mel = window.engine.classifyChannel(node) === "melodic";
          return h("span", { className: "ttype", style: { color: node.color }, title: mel ? "Melody (tonal)" : "Instrument (percussive)" }, h(mel ? I.Note : I.Drum, { width: 12, height: 12 }));
        })(),
        h("span", { className: "tname" }, node.name),
        pathLabel ? h("span", { className: "tpath" }, pathLabel) : null,
        h("span", { className: "tplay" }, h(I.Play, { width: 11, height: 11 })));
    }

    function renderNode(node, depth, inheritUser) {
      var open = !!expanded[node.id];
      if (node.kind === "folder") {
        var isUserRoot = !!node.userRoot;
        var rows = [h("div", { key: node.id, className: "trow folder" + (isUserRoot ? " user-root" : ""), style: { paddingLeft: 8 + depth * 13 }, onClick: function () { toggle(node.id); } },
          h("span", { className: "tcaret" }, open ? h(I.ChevD, { width: 12, height: 12 }) : h(I.Chevron, { width: 12, height: 12 })),
          h("span", { className: "ticon", style: { color: node.color || "var(--dim)" } }, h(I.Folder, { width: 14, height: 14 })),
          h("span", { className: "tname" }, node.name),
          isUserRoot ? h("button", { className: "tunlink", title: "Unmount", onClick: function (e) { unlink(node.id, e); } }, h(I.X, { width: 11, height: 11 })) : h("span", { className: "tcount mono" }, countSamples(node)))];
        if (open) node.children.forEach(function (c) { rows = rows.concat(renderNode(c, depth + 1, false)); });
        return rows;
      }
      return [sampleRow(node, 8 + depth * 13, null)];
    }

    var head = h("div", { className: "rail-head" },
      h("span", { className: "rail-logo", style: { color: "var(--accent)", display: "grid", placeItems: "center" } }, h(I.Folder, { width: 16, height: 16 })),
      h("span", { className: "ttl" }, "Browser"),
      h("button", { className: "cx", onClick: props.onCollapse }, props.collapsed ? h(I.Chevron, { width: 15, height: 15 }) : h(I.ChevL, { width: 15, height: 15 })));

    if (props.collapsed) return h("div", { className: "rail collapsed" }, head);

    var q = query.trim().toLowerCase();
    var body;
    if (q) {
      // Phase 3: search only the visible (user-linked) library; stock factory entries stay hidden.
      var all = []; visibleRoots().forEach(function (r) { flatten(r, "", all); });
      var hits = all.filter(function (x) { return fuzzy(x.s.name, q) || fuzzy(x.path.toLowerCase(), q); });
      body = h("div", { className: "brws" },
        h("div", { className: "tree-sec" }, hits.length + " RESULT" + (hits.length === 1 ? "" : "S")),
        h("div", { className: "tree" }, hits.length ? hits.map(function (x) { return sampleRow(x.s, 10, x.path); }) : h("div", { className: "tree-empty" }, "No samples match “" + query + "”")));
    } else if (tab === "files") {
      // Phase 7: drag-and-drop ingestion (dragover/drop/dragleave overlay) was removed — it was the
      // buggy path. Importing now goes solely through the explicit pickers below. The "Add File(s)"
      // button was removed entirely per the FINAL BUILD spec — only Link Instrumental Folder
      // (sampler channels) and Add Melody File (continuous Audio Lane) remain.
      body = h("div", { className: "brws" },
        h("div", { className: "fb-improw" },
          h("button", { className: "link-btn", style: { margin: 0, width: "auto", flex: 1 }, title: "Link an instrumental/drum folder as Sampler channels (16-step grid + Piano Roll + FX)", onClick: function () { setShowLink(true); } }, h(I.Folder, { width: 15, height: 15 }), "Link Instrumental Folder")),
        h("div", { className: "fb-improw" },
          h("button", { className: "link-btn", style: { margin: 0, width: "auto", flex: 1 }, title: "Import a melody/audio file as a continuous Audio Lane clip on the timeline (no step block)", onClick: function () { melodyRef.current && melodyRef.current.click(); } }, h(I.Wave, { width: 15, height: 15 }), "Add Melody File")),
        h("input", { type: "file", ref: melodyRef, accept: "audio/*,video/*", multiple: true, style: { display: "none" }, onChange: function (e) { addMelodies(e.target.files); e.target.value = ""; } }),
        h("div", { className: "fb-improw" },
          h("button", { className: "link-btn", style: { margin: 0, width: "auto", flex: 1 }, title: "Melody Maker: load one audio file (WAV/MP3) as a polyphonic pitch-shifting sampler — play it in key across the Piano Roll", onClick: function () { mmRef.current && mmRef.current.click(); } }, h(I.Note, { width: 15, height: 15 }), "Melody Maker")),
        h("input", { type: "file", ref: mmRef, accept: "audio/*", style: { display: "none" }, onChange: function (e) { addMelodyMaker(e.target.files); e.target.value = ""; } }),
        h("div", { className: "tree" },
          h("div", { className: "tree-sec" }, "LIBRARY"),
          // Phase 3: render only user-linked folders — the stock Factory Core listing is purged so
          // new projects start blank/custom-ready (the factory metadata still lives in __FACTORY).
          (function () {
            var roots = visibleRoots();
            if (!roots.length) return h("div", { className: "tree-empty" }, "Library is empty — “Link Instrumental Folder” to mount your own samples, or “Add Melody File” to drop audio onto the timeline.");
            var rows = []; roots.forEach(function (r) { rows = rows.concat(renderNode(r, 0, false)); });
            return rows;
          })()));
    } else if (tab === "inst") {
      body = h("div", { className: "brws" }, h("div", { className: "brws-grp" }, h("h5", null, "Instruments · " + props.channelDefs.length),
        props.channelDefs.map(function (c) { return h("div", { key: c.id, className: "brws-item" + (props.focus === c.id ? " sel" : ""), onClick: function () { props.onFocus(c.id); window.engine.trigger(c.id, 0); } }, h("span", { className: "ico", style: { color: c.color } }, h(I.Disc, { width: 15, height: 15 })), h("span", { className: "nm" }, c.label), h("span", { className: "tag" }, "M" + ("0" + c.route).slice(-2))); })));
    } else {
      body = h("div", { className: "brws" }, h("div", { className: "brws-grp" }, h("h5", null, "FX Plugins · 8"),
        ["bitcrush", "eq", "filter", "comp", "delay", "reverb", "chorus", "limiter"].map(function (t2) {
          // read window.FXMETA lazily — this module loads before fx-rack defines it, so the
          // captured `FXMETA` is undefined; fall back so the FX tab can never brick the app
          var fm = (window.FXMETA && window.FXMETA[t2]) || { color: "var(--accent)", label: t2 };
          return h("div", { key: t2, className: "brws-item" }, h("span", { className: "ico", style: { color: fm.color } }, h(I.Bolt, { width: 14, height: 14 })), h("span", { className: "nm" }, fm.label));
        })));
    }

    return h("div", { className: "rail" },
      head,
      h("div", { className: "fb-search" },
        h("span", { className: "fb-search-ic" }, h(I.Folder, { width: 12, height: 12 })),
        h("input", { className: "fb-search-input", value: query, spellCheck: false, placeholder: "Search library…", onChange: function (e) { setQuery(e.target.value); } }),
        query ? h("button", { className: "fb-search-x", onClick: function () { setQuery(""); } }, h(I.X, { width: 11, height: 11 })) : null),
      h("div", { className: "fb-tabs" },
        [["files", "Files"], ["inst", "Inst"], ["fx", "FX"]].map(function (x) { return h("button", { key: x[0], className: "fb-tab" + (tab === x[0] && !q ? " on" : ""), onClick: function () { setQuery(""); setTab(x[0]); } }, x[1]); })),
      body,
      showLink ? h(LinkModal, { onClose: function () { setShowLink(false); }, onLink: onLink, onLinkReal: onLinkReal, toast: props.toast }) : null);
  }

  window.FileBrowser = FileBrowser;
})();
