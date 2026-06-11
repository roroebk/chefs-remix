/* Chef's Remix v3 — ULTRAVIOLET migration: recolor + repack the self-extracting bundle. */
const fs = require('fs'), zlib = require('zlib');

// --- canonical neon -> purple/ultraviolet map (case-insensitive hex) ---
const HEX = {
  '#39ff14': '#9d4edd', // primary green   -> electric violet
  '#2ea6ff': '#7b5cff', // blue            -> indigo-violet
  '#ff5cc8': '#c77dff', // pink            -> cyber orchid
  '#ffb338': '#e0aaff', // orange          -> light orchid
  '#2ee6c8': '#a78bfa', // teal            -> soft amethyst
  '#b07bff': '#b388ff', // (already purple)-> lavender
  '#ff5470': '#d16bff', // red-pink        -> magenta-violet
  '#c6ff3a': '#b388ff', // lime            -> lavender
  '#ff8c2e': '#d16bff', // orange 2        -> magenta-violet
  '#6ad0ff': '#a78bfa', // light blue      -> soft amethyst
  '#1a8f0a': '#5a189a', // dark-green grad -> deep violet
  '#07140a': '#10031f', // accent-ink      -> deep indigo ink
  '#1f1300': '#1a0b2e', // dark orange ink -> deep indigo
  '#eafff0': '#f5edff', // mint white      -> lavender white
  '#ffce7a': '#e0aaff', // amber tname     -> light orchid
};
// rgba triplets used in CSS glows/gradients
const RGB = { '57,255,20': '157,78,221', '46,166,255': '199,125,255' };

function recolor(s) {
  for (const [from, to] of Object.entries(HEX)) {
    s = s.replace(new RegExp(from, 'gi'), to);
  }
  for (const [from, to] of Object.entries(RGB)) {
    s = s.split(from).join(to);
  }
  return s;
}

// --- app script uuids in load order (vendor React/ReactDOM/Babel are NOT touched) ---
const ORDER = [
  '12484ed5-baa9-406f-9155-336de0b698b5','ca6cfff6-3e6e-4164-8c2b-afb41f11c660',
  'ff8b6a48-bf77-4cff-84be-e6d7af7b652d','cb6e4cf9-6bf0-4274-a9bc-b2d69a772361',
  '7dea2a24-cfdd-430a-ad83-5c83d66a448e','f6f41d1f-e3b9-4c5d-8465-60dbc5077d86',
  '0b5e1ce1-1a91-4a99-869a-bf6689240734','c1df0179-23a3-4698-adc3-b3658b5e9187',
  'e1274bed-b4d1-4703-9589-8e1215c457dc','86c6d1e5-e77f-42e7-8305-36849df599a9',
  '00b7e617-1049-4882-aa05-9089dca7f451'
];
// ff8b6a48 = tweaks-panel scaffold (own palette, leave untouched)
const SKIP_RECOLOR = new Set(['ff8b6a48-bf77-4cff-84be-e6d7af7b652d']);

const manifest = JSON.parse(fs.readFileSync('manifest_raw.txt', 'utf8'));

let changed = 0;
for (let i = 0; i < ORDER.length; i++) {
  const uuid = ORDER[i];
  const file = 'src_work/' + String(i).padStart(2, '0') + '_' + uuid.slice(0, 8) + '.jsx';
  let code = fs.readFileSync(file, 'utf8');
  if (!SKIP_RECOLOR.has(uuid)) code = recolor(code);
  const gz = zlib.gzipSync(Buffer.from(code, 'utf8'));
  manifest[uuid].data = gz.toString('base64');
  manifest[uuid].compressed = true;
  changed++;
}

// --- template: hand-edits already applied; now recolor remaining neon tokens ---
let template = fs.readFileSync('template_decoded.html', 'utf8');
template = recolor(template);

// Escape inner closing script tags so they don't prematurely terminate the
// <script type="__bundler/*"> host element (JSON.parse turns <\/script> back
// into </script>). Mirrors the loader's own resource-map escaping convention.
function embed(obj) { return JSON.stringify(obj).split('</script>').join('<\\/script>'); }
const templateJSON = embed(template);
const manifestJSON = embed(manifest);

// --- rebuild index.html: swap the manifest + template payload lines (located
// by their host <script> tags, so this is robust to head/line-count changes) ---
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
function payloadLine(marker) {
  const i = lines.findIndex(function (l) { return l.indexOf(marker) !== -1; });
  if (i === -1 || i + 1 >= lines.length) throw new Error('marker not found: ' + marker);
  return i + 1; // payload is the line immediately after the opening script tag
}
// match the opening host tag specifically (loader querySelector lines use
// 'script[type="..."]' and won't match '<script type="...">')
lines[payloadLine('<script type="__bundler/manifest">')] = manifestJSON;
lines[payloadLine('<script type="__bundler/template">')] = templateJSON;
fs.writeFileSync('index.html', lines.join('\n'));

console.log('recolored ' + changed + ' app scripts (skipped ' + SKIP_RECOLOR.size + ')');
console.log('manifest bytes:', manifestJSON.length, '| template bytes:', templateJSON.length);
console.log('index.html rebuilt:', fs.statSync('index.html').size, 'bytes');
