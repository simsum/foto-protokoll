(() => {
"use strict";
const $ = (s) => document.querySelector(s);
const PAGE = { A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Letter: [612, 792] };
const GRID = { 1: [1, 1, 1, 1], 2: [1, 2, 2, 1], 3: [1, 3, 3, 1], 4: [2, 2, 2, 2], 6: [2, 3, 3, 2] }; // [cols,rows] hoch, [cols,rows] quer
const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
let regionName;
try { regionName = new Intl.DisplayNames(["de"], { type: "region" }); } catch { regionName = null; }

/* ---------- Einstellungen ---------- */
const DEFAULTS = { fmt: "A4", orient: "p", per: 4, title: "Fotodokumentation", subtitle: "", pageNo: true,
  capDate: true, capPlace: true, capGps: true, capNote: true, capFile: false, coverOn: false, coverFacts: true, coverText: "", capNum: true, capMarks: true, logoOn: true, hashes: false, embed: true, cmp: false, cmpEdge: "2400", dpi: "150", placeMode: "auto" };
let cfg = { ...DEFAULTS };
try { const s = JSON.parse(localStorage.getItem("fotoprotokoll.cfg") || "null"); if (s) cfg = { ...cfg, ...s }; } catch {}
const saveCfg = () => { try { localStorage.setItem("fotoprotokoll.cfg", JSON.stringify(cfg)); } catch {} };
let logoData = null;
try { logoData = JSON.parse(localStorage.getItem("fotoprotokoll.logo") || "null"); } catch {}
function syncLogo() {
  const has = !!(logoData && logoData.data);
  $("#logoImg").hidden = !has; if (has) $("#logoImg").src = logoData.data;
  $("#logoDel").hidden = !has; $("#logoBtn").lastChild.textContent = has ? "Anderes Logo" : "Logo wählen";
  $("#logoPick").classList.toggle("off", false);
}
async function setLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    let w = img.naturalWidth || 600, h = img.naturalHeight || 200;
    const s = Math.min(1, 900 / Math.max(w, h)); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
    logoData = { data: c.toDataURL("image/png"), w, h };
    try { localStorage.setItem("fotoprotokoll.logo", JSON.stringify(logoData)); } catch { toast("Logo wird nur für diese Sitzung verwendet."); }
    cfg.logoOn = true; $("#logoOn").checked = true; saveCfg(); syncLogo(); render();
  } catch { toast("Das Logo konnte nicht gelesen werden. Bitte PNG, JPG oder SVG verwenden."); }
  finally { URL.revokeObjectURL(url); }
}

const textIds = ["title", "subtitle", "coverText"], selIds = ["fmt", "orient", "dpi", "placeMode", "cmpEdge"],
      chkIds = ["pageNo", "coverOn", "coverFacts", "capNum", "capDate", "capPlace", "capGps", "capNote", "capMarks", "capFile", "embed", "cmp", "logoOn", "hashes"];
function syncCover() {
  $("#coverSec").hidden = !cfg.coverOn;
  $("#coverFactsWrap").classList.toggle("off", !cfg.coverOn); $("#coverFacts").disabled = !cfg.coverOn;
}
function syncCmp() {
  syncCover();
  $("#cmpWrap").classList.toggle("off", !cfg.embed); $("#cmp").disabled = !cfg.embed;
  $("#cmpEdgeWrap").classList.toggle("off", !(cfg.embed && cfg.cmp)); $("#cmpEdge").disabled = !(cfg.embed && cfg.cmp);
}
function bindSettings() {
  textIds.forEach((k) => { const el = $("#" + k); el.value = cfg[k]; el.addEventListener("input", () => { cfg[k] = el.value; saveCfg(); render(); }); });
  selIds.forEach((k) => { const el = $("#" + k); el.value = cfg[k]; el.addEventListener("change", () => { cfg[k] = el.value; saveCfg(); if (k === "placeMode") reresolvePlaces(); render(); }); });
  chkIds.forEach((k) => { const el = $("#" + k); el.checked = !!cfg[k]; el.addEventListener("change", () => { cfg[k] = el.checked; saveCfg(); syncCmp(); render(); }); });
  syncCmp();
  const seg = $("#per");
  const sync = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === +cfg.per)));
  seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; cfg.per = +b.dataset.v; saveCfg(); sync(); render(); });
  sync();
}

/* ---------- Fotos ---------- */
let photos = [];
let uid = 0;

function parseExifDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s) ? null : { y: s.getFullYear(), m: s.getMonth() + 1, d: s.getDate(), H: s.getHours(), M: s.getMinutes(), S: s.getSeconds() };
  const m = String(s).match(/(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m || m[1] === "0000") return null;
  return { y: +m[1], m: +m[2], d: +m[3], H: +m[4], M: +m[5], S: +(m[6] || 0) };
}
const p2 = (n) => String(n).padStart(2, "0");
const fmtDate = (t) => t ? `${p2(t.d)}.${p2(t.m)}.${t.y}, ${p2(t.H)}:${p2(t.M)} Uhr` : "";
const dtKey = (t) => t ? t.y * 1e10 + t.m * 1e8 + t.d * 1e6 + t.H * 1e4 + t.M * 100 + t.S : Infinity;
const fmtGps = (g) => g ? `${Math.abs(g.lat).toFixed(5)}° ${g.lat >= 0 ? "N" : "S"}, ${Math.abs(g.lon).toFixed(5)}° ${g.lon >= 0 ? "E" : "W"}` : "";
const mapUrl = (g) => `https://www.openstreetmap.org/?mlat=${g.lat.toFixed(6)}&mlon=${g.lon.toFixed(6)}#map=18/${g.lat.toFixed(6)}/${g.lon.toFixed(6)}`;
function fmtSize(b) { return b >= 1048576 ? nf1.format(b / 1048576) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
const isHeic = (f) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

let heicLib = null;
function loadHeic() {
  if (heicLib) return heicLib;
  heicLib = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => (window.heic2any ? res(window.heic2any) : rej(new Error("heic2any fehlt")));
    s.onerror = () => rej(new Error("HEIC-Konverter nicht ladbar"));
    document.head.appendChild(s);
  });
  return heicLib;
}

async function decodable(p) {
  // liefert einen Blob, den der Browser dekodieren kann
  if (p.decoded) return p.decoded;
  try { const b = await createImageBitmap(p.file); b.close(); p.decoded = p.file; return p.file; }
  catch (e) {
    if (!isHeic(p.file)) throw e;
    const conv = await loadHeic();
    let out = await conv({ blob: p.file, toType: "image/jpeg", quality: 0.95 });
    if (Array.isArray(out)) out = out[0];
    p.decoded = out; return out;
  }
}

/* ---------- Ansicht: Drehen und Ausschnitt (die Originaldatei bleibt unverändert) ----------
   Markierungen liegen in Pixeln des ausgerichteten Originals (bw × bh). Drehung (rot, 0–3 × 90° im Uhrzeigersinn)
   und Ausschnitt (crop, in Pixeln des gedrehten Bildes) bestimmen nur, was in Vorschau und PDF zu sehen ist.
   p.w × p.h ist die Größe der Ansicht (gedreht und zugeschnitten) in Originalpixeln. */
const rotDims = (p) => (p.rot % 2 ? [p.bh, p.bw] : [p.bw, p.bh]);
const toRot = (p, x, y) => (p.rot === 1 ? [p.bh - y, x] : p.rot === 2 ? [p.bw - x, p.bh - y] : p.rot === 3 ? [y, p.bw - x] : [x, y]);
const fromRot = (p, x, y) => (p.rot === 1 ? [y, p.bh - x] : p.rot === 2 ? [p.bw - x, p.bh - y] : p.rot === 3 ? [p.bw - y, x] : [x, y]);
function viewBox(p, full) { const [rw, rh] = rotDims(p); return full || !p.crop ? { x: 0, y: 0, w: rw, h: rh } : p.crop; }
function applyView(p) { const v = viewBox(p); p.w = v.w; p.h = v.h; }
function mapMark(m, f) { const o = { ...m }; [o.x, o.y] = f(m.x, m.y); if (m.t === "arrow") [o.x2, o.y2] = f(m.x2, m.y2); return o; }
function viewMarks(p, full) {
  const v = viewBox(p, full), out = [];
  for (const m of p.marks || []) {
    const q = mapMark(m, (x, y) => { const [a, b] = toRot(p, x, y); return [a - v.x, b - v.y]; });
    if (q.x < 0 || q.y < 0 || q.x > v.w || q.y > v.h) continue; // außerhalb des Ausschnitts
    q.src = m; out.push(q);
  }
  return out;
}
function unviewMark(p, m, full) { const v = viewBox(p, full); return mapMark(m, (x, y) => fromRot(p, x + v.x, y + v.y)); }
const ROT_T = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]];
function drawView(g, bmp, p, w, h, full) {
  const v = viewBox(p, full), [a, b, c, d] = ROT_T[p.rot];
  g.save(); g.scale(w / v.w, h / v.h); g.translate(-v.x, -v.y);
  g.transform(a, b, c, d, p.rot === 1 ? p.bh : p.rot === 2 ? p.bw : 0, p.rot === 2 ? p.bh : p.rot === 3 ? p.bw : 0);
  g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0); g.restore();
}
async function paintThumb(p, bmp) {
  const s = Math.min(1, 640 / Math.max(p.w, p.h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(p.w * s)); c.height = Math.max(1, Math.round(p.h * s));
  drawView(c.getContext("2d"), bmp, p, c.width, c.height);
  return URL.createObjectURL(await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82)));
}
async function makeThumb(p) {
  const bmp = await createImageBitmap(await decodable(p));
  p.bw = bmp.width; p.bh = bmp.height; applyView(p);
  p.thumb = await paintThumb(p, bmp);
  bmp.close();
}
async function refreshView(p) {
  applyView(p); render();
  const my = (p.tv = (p.tv || 0) + 1);
  try {
    const bmp = await createImageBitmap(await decodable(p));
    const url = await paintThumb(p, bmp); bmp.close();
    if (my !== p.tv) { URL.revokeObjectURL(url); return; }
    const old = p.thumb; p.thumb = url;
    if (old) setTimeout(() => URL.revokeObjectURL(old), 1500);
  } catch (e) { console.warn(e); }
  render();
}
function rotateView(p, dir) { // dir: +1 im Uhrzeigersinn, -1 dagegen
  const [rw, rh] = rotDims(p), c = p.crop;
  if (c) p.crop = dir > 0 ? { x: rh - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: rw - c.x - c.w, w: c.h, h: c.w };
  p.rot = (p.rot + dir + 4) % 4;
  return refreshView(p);
}
function setCrop(p, c) {
  const [rw, rh] = rotDims(p);
  if (c) {
    const x = Math.max(0, Math.round(c.x)), y = Math.max(0, Math.round(c.y));
    c = { x, y, w: Math.min(rw - x, Math.round(c.w)), h: Math.min(rh - y, Math.round(c.h)) };
    if (c.w < rw * 0.05 || c.h < rh * 0.05 || (c.w >= rw && c.h >= rh)) c = null;
  }
  p.crop = c;
  return refreshView(p);
}

async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|tiff?)$/i.test(f.name));
  if (!list.length) { toast("Keine Bilddateien gefunden."); return; }
  if (photos.some((p) => p.sample)) { photos.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb)); photos = []; }
  const fresh = list.map((f) => ({ id: ++uid, file: f, name: f.name, size: f.size, dt: null, dtSrc: "", gps: null,
    place: "", placeSrc: "", note: "", thumb: "", w: 0, h: 0, bw: 0, bh: 0, rot: 0, crop: null, err: "", busy: true, marks: [] }));
  photos.push(...fresh);
  render();
  for (const p of fresh) {
    try {
      const tags = await exifr.parse(p.file, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"], reviveValues: false }).catch(() => null);
      p.dt = parseExifDate(tags && (tags.DateTimeOriginal || tags.CreateDate || tags.ModifyDate));
      p.dtSrc = p.dt ? "exif" : "";
      if (!p.dt && p.file.lastModified) { p.dt = parseExifDate(new Date(p.file.lastModified)); p.dtSrc = "datei"; }
      const g = await exifr.gps(p.file).catch(() => null);
      if (g && isFinite(g.latitude) && isFinite(g.longitude) && !(g.latitude === 0 && g.longitude === 0)) p.gps = { lat: g.latitude, lon: g.longitude };
    } catch {}
    try { await makeThumb(p); } catch (e) { p.err = isHeic(p.file) ? "HEIC nicht lesbar. Bitte als JPG exportieren." : "Bild nicht lesbar."; }
    try { p.sha = await sha256hex(new Uint8Array(await p.file.arrayBuffer())); } catch {}
    p.busy = false;
    render();
  }
  // neue Fotos chronologisch einsortieren (hinter bestehende)
  const old = photos.filter((p) => !fresh.includes(p));
  photos = [...old, ...fresh.sort((a, b) => dtKey(a.dt) - dtKey(b.dt))];
  render();
  fresh.forEach((p) => queuePlace(p));
}

/* ---------- Ort: OpenStreetMap + Offline ---------- */
let osmState = "unknown"; // unknown | ok | blocked
const osmCache = new Map();
let lastOsm = 0;
let placeChain = Promise.resolve();

function queuePlace(p) { placeChain = placeChain.then(() => resolvePlace(p)).catch(() => {}); }
function reresolvePlaces() { photos.forEach((p) => { if (p.placeSrc !== "manual") { p.place = ""; p.placeSrc = ""; queuePlace(p); } }); }

async function resolvePlace(p) {
  if (!p.gps || p.placeSrc === "manual" || !photos.includes(p)) return;
  if (cfg.placeMode === "off") { p.place = ""; p.placeSrc = ""; render(); return; }
  if (cfg.placeMode === "auto" && osmState !== "blocked") {
    const r = await osm(p.gps).catch(() => null);
    if (r) { p.place = r; p.placeSrc = "osm"; render(); return; }
  }
  const o = await offlinePlace(p.gps).catch(() => "");
  if (p.placeSrc !== "manual") { p.place = o; p.placeSrc = o ? "offline" : ""; }
  render();
}

async function osm(g) {
  const key = g.lat.toFixed(4) + "," + g.lon.toFixed(4);
  if (osmCache.has(key)) return osmCache.get(key);
  const wait = 1100 - (Date.now() - lastOsm);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOsm = Date.now();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=de&lat=${g.lat}&lon=${g.lon}`;
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    osmState = "ok";
    const a = j.address || {};
    const street = [a.road || a.pedestrian || a.footway || a.path || a.square || a.place, a.house_number].filter(Boolean).join(" ");
    const town = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || "";
    const part = a.suburb && town && a.suburb !== town ? `${town}-${a.suburb}` : town;
    let s = [street, [a.postcode, part].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (a.country_code && a.country_code !== "de" && a.country) s += ", " + a.country;
    s = s || j.display_name || "";
    osmCache.set(key, s);
    return s;
  } catch (e) {
    osmState = "blocked"; $("#osmNotice").hidden = false; throw e;
  } finally { clearTimeout(t); }
}

let orte = null;
function loadOrte() {
  if (orte) return orte;
  orte = (async () => {
    const b64 = $("#orte-data").textContent.trim();
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    const rows = text.split("\n"); const n = rows.length;
    const lat = new Float32Array(n), lon = new Float32Array(n), name = new Array(n), cc = new Array(n), grid = new Map();
    let la = 0, lo = 0;
    for (let i = 0; i < n; i++) {
      const r = rows[i].split("\t");
      la += +r[0]; lo += +r[1];
      lat[i] = la / 1000; lon[i] = lo / 1000; name[i] = r[2]; cc[i] = r[3];
      const k = Math.floor(lat[i]) * 1000 + Math.floor(lon[i]);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
    }
    return { lat, lon, name, cc, grid };
  })();
  return orte;
}
async function offlinePlace(g) {
  const O = await loadOrte();
  let best = -1, bd = Infinity;
  for (let ring = 1; ring <= 3 && best < 0; ring++) {
    const cy = Math.floor(g.lat), cx = Math.floor(g.lon);
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      const a = O.grid.get((cy + dy) * 1000 + (cx + dx)); if (!a) continue;
      for (const i of a) { const d = dist(g.lat, g.lon, O.lat[i], O.lon[i]); if (d < bd) { bd = d; best = i; } }
    }
  }
  if (best < 0) return "";
  const country = O.cc[best] === "DE" ? "" : (regionName ? regionName.of(O.cc[best]) : O.cc[best]);
  const where = bd < 1.5 ? O.name[best] : `bei ${O.name[best]} (${bd < 10 ? nf1.format(bd) : Math.round(bd)} km)`;
  return [where, country].filter(Boolean).join(", ");
}
function dist(a1, o1, a2, o2) {
  const R = 6371, r = Math.PI / 180;
  const x = (o2 - o1) * r * Math.cos(((a1 + a2) / 2) * r), y = (a2 - a1) * r;
  return Math.sqrt(x * x + y * y) * R;
}

/* ---------- Markierungen (Koordinaten in Pixeln des ausgerichteten Originals) ---------- */
function markGeom(m, p) {
  const base = Math.min(p.bw || p.w || 1000, p.bh || p.h || 750), sw = Math.max(2, base * 0.0085);
  const r = (n) => +n.toFixed(1);
  if (m.t === "num") return { sw, num: true, r: Math.max(m.r, sw * 3) };
  if (m.t === "circle") {
    const R = Math.max(m.r, sw * 2);
    return { sw, stroke: [`M${r(m.x - R)} ${r(m.y)}A${r(R)} ${r(R)} 0 1 0 ${r(m.x + R)} ${r(m.y)}A${r(R)} ${r(R)} 0 1 0 ${r(m.x - R)} ${r(m.y)}Z`], fill: [] };
  }
  const dx = m.x - m.x2, dy = m.y - m.y2, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const hl = Math.min(sw * 4.4, len * 0.6), hw = hl * 0.78;
  const bx = m.x - ux * hl, by = m.y - uy * hl, sx = m.x - ux * hl * 0.7, sy = m.y - uy * hl * 0.7;
  return { sw, stroke: [`M${r(m.x2)} ${r(m.y2)}L${r(sx)} ${r(sy)}`],
    fill: [`M${r(m.x)} ${r(m.y)}L${r(bx - uy * hw / 2)} ${r(by + ux * hw / 2)}L${r(bx + uy * hw / 2)} ${r(by - ux * hw / 2)}Z`] };
}
const haloOf = (c) => (c === "#FFC400" ? "#1A1A1A" : "#FFFFFF");
const numInk = (c) => (c === "#FFC400" ? "#1A1A1A" : "#FFFFFF");
const circlePath = (x, y, R) => { const r = (n) => +n.toFixed(1); return `M${r(x - R)} ${r(y)}A${r(R)} ${r(R)} 0 1 0 ${r(x + R)} ${r(y)}A${r(R)} ${r(R)} 0 1 0 ${r(x - R)} ${r(y)}Z`; };
function marksSvg(p, style = "", opt = {}) {
  const vm = viewMarks(p, opt.full); if (opt.extra) vm.push(opt.extra);
  if (!vm.length || !p.w) return "";
  const vb = viewBox(p, opt.full), nums = vm.filter((q) => q.t === "num");
  let a = "", b = "";
  for (const m of vm) {
    const g = markGeom(m, p), halo = haloOf(m.c), hw = g.sw * 2.2;
    if (g.num) {
      const n = nums.indexOf(m) + 1, fs = (g.r * 1.3).toFixed(1);
      a += `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${g.r.toFixed(1)}" fill="${halo}" fill-opacity=".85" stroke="${halo}" stroke-opacity=".85" stroke-width="${(g.sw * 2.4).toFixed(1)}"/>`;
      b += `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${g.r.toFixed(1)}" fill="${m.c}"/><text x="${m.x.toFixed(1)}" y="${m.y.toFixed(1)}" dy=".36em" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${fs}" fill="${numInk(m.c)}">${n}</text>`;
      continue;
    }
    g.stroke.forEach((d) => { a += `<path d="${d}" fill="none" stroke="${halo}" stroke-opacity=".85" stroke-width="${hw}" stroke-linecap="round"/>`; b += `<path d="${d}" fill="none" stroke="${m.c}" stroke-width="${g.sw}" stroke-linecap="round"/>`; });
    g.fill.forEach((d) => { a += `<path d="${d}" fill="${halo}" fill-opacity=".85" stroke="${halo}" stroke-opacity=".85" stroke-width="${hw - g.sw}" stroke-linejoin="round"/>`; b += `<path d="${d}" fill="${m.c}"/>`; });
  }
  return `<svg class="marks" viewBox="0 0 ${vb.w} ${vb.h}" preserveAspectRatio="none" style="${style}" aria-hidden="true">${a}${b}</svg>`;
}

/* ---------- Editor ---------- */
let edP = null, edTool = "circle", edColor = "#E3242B", edDraft = null, edUrl = "", edCrop = false, edRect = null;
try { const s = JSON.parse(localStorage.getItem("fotoprotokoll.ed") || "null"); if (s) { edTool = s.t || edTool; edColor = s.c || edColor; } } catch {}
function syncEdButtons() {
  $("#edTool").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === edTool)));
  $("#edColor").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === edColor)));
  try { localStorage.setItem("fotoprotokoll.ed", JSON.stringify({ t: edTool, c: edColor })); } catch {}
}
async function openEditor(p) {
  if (!p.w || p.err) { toast("Für dieses Foto gibt es keine Vorschau zum Markieren."); return; }
  edP = p; p.marks = p.marks || []; edCrop = false; edRect = null;
  if (!await decodable(p).catch(() => null)) return;
  $("#edName").textContent = "Foto " + photoNo(p) + " · " + p.name;
  syncEdButtons(); renderEdNotes();
  await edLoadImage();
  $("#editor").hidden = false;
  $("#edDone").focus();
}
// zeigt die Ansicht (gedreht und zugeschnitten) bzw. im Ausschnitt-Modus das ganze gedrehte Bild
async function edLoadImage() {
  const p = edP; if (!p) return;
  const jpg = await renderJpeg(p, 1800, 1800, edCrop).catch(() => null);
  if (!jpg || edP !== p) return;
  const url = URL.createObjectURL(new Blob([jpg], { type: "image/jpeg" }));
  if (edUrl) URL.revokeObjectURL(edUrl);
  edUrl = url; $("#edPic").src = url;
  const v = viewBox(p, edCrop);
  $("#edImg").style.aspectRatio = `${v.w} / ${v.h}`;
  $("#edSvg").setAttribute("viewBox", `0 0 ${v.w} ${v.h}`);
  $("#editor").classList.toggle("cropping", edCrop);
  $("#edCrop").setAttribute("aria-pressed", String(edCrop));
  $("#edCropReset").disabled = !p.crop;
  $("#edHint").hidden = edCrop; $("#edHintCrop").hidden = !edCrop;
  sizeEd(); drawEd(); renderEdNotes();
}
function closeEditor() {
  $("#editor").hidden = true; edDraft = null; edRect = null; edCrop = false; edStart = null;
  if (edUrl) { URL.revokeObjectURL(edUrl); edUrl = ""; }
  edP = null; render();
}
function cropOverlay() {
  const [rw, rh] = rotDims(edP), c = edRect || edP.crop; if (!c) return "";
  return `<path d="M0 0H${rw}V${rh}H0Z M${c.x} ${c.y}h${c.w}v${c.h}h${-c.w}Z" fill="rgba(0,0,0,.55)" fill-rule="evenodd"/>`
    + `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
}
function drawEd() {
  if (!edP) return;
  const html = marksSvg(edP, "", { full: edCrop, extra: edDraft });
  $("#edSvg").innerHTML = (html ? html.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") : "") + (edCrop ? cropOverlay() : "");
  $("#edUndo").disabled = !edP.marks.length; $("#edClear").disabled = !edP.marks.length;
}
function sizeEd() {
  if (!edP) return;
  const v = viewBox(edP, edCrop), n = NUMS(edP).length, extra = n ? 30 + 40 * Math.min(n, 4) : 0;
  $("#edImg").style.width = `min(100%, calc((100dvh - ${250 + extra}px) * ${(v.w / v.h).toFixed(4)}))`;
}
function renderEdNotes() {
  sizeEd();
  const box = $("#edNotes"), nums = NUMS(edP);
  box.hidden = !nums.length;
  box.innerHTML = nums.length ? `<span class="lbl">Notizen zu den Nummern</span>` + nums.map((m, k) =>
    `<div class="nrow"><span class="bdg2" style="background:${m.c};color:${numInk(m.c)}">${k + 1}</span><input type="text" id="mn-${k}" data-k="${k}" value="${esc(m.note || "")}" placeholder="Was ist hier? z. B. Stellantrieb fehlt" aria-label="Notiz zu Nummer ${k + 1}"><button class="icon del" type="button" data-k="${k}" aria-label="Nummer ${k + 1} entfernen">${ICON.del}</button></div>`).join("") : "";
}
$("#edNotes").addEventListener("input", (e) => { const k = e.target.dataset.k; if (k == null || !edP) return; NUMS(edP)[+k].note = e.target.value; });
$("#edNotes").addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (!b || !edP) return; const m = NUMS(edP)[+b.dataset.k]; edP.marks.splice(edP.marks.indexOf(m), 1); drawEd(); renderEdNotes(); });
function edPoint(e) {
  const rc = $("#edSvg").getBoundingClientRect(), v = viewBox(edP, edCrop);
  return { x: Math.max(0, Math.min(v.w, (e.clientX - rc.left) / rc.width * v.w)), y: Math.max(0, Math.min(v.h, (e.clientY - rc.top) / rc.height * v.h)) };
}
const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
function shapeFrom(a, b) {
  const base = Math.min(edP.w, edP.h), d = Math.hypot(b.x - a.x, b.y - a.y), drag = d > base * 0.02;
  if (edTool === "circle") return { t: "circle", x: a.x, y: a.y, r: drag ? d : base * 0.075, c: edColor };
  if (edTool === "num") return { t: "num", x: a.x, y: a.y, r: drag ? Math.min(base * 0.09, Math.max(base * 0.02, d)) : base * 0.036, c: edColor, note: "" };
  if (drag) return { t: "arrow", x: a.x, y: a.y, x2: b.x, y2: b.y, c: edColor };
  let vx = edP.w / 2 - a.x, vy = edP.h / 2 - a.y; const l = Math.hypot(vx, vy);
  if (l < base * 0.05) { vx = -1; vy = -1; } const n = Math.hypot(vx, vy);
  return { t: "arrow", x: a.x, y: a.y, x2: a.x + vx / n * base * 0.2, y2: a.y + vy / n * base * 0.2, c: edColor };
}
let edStart = null;
$("#edSvg").addEventListener("pointerdown", (e) => {
  if (!edP) return; e.preventDefault(); $("#edSvg").setPointerCapture(e.pointerId); edStart = edPoint(e);
  if (edCrop) { edRect = null; return; }
  edDraft = shapeFrom(edStart, edStart); drawEd();
});
$("#edSvg").addEventListener("pointermove", (e) => {
  if (!edStart) return;
  if (edCrop) { edRect = rectOf(edStart, edPoint(e)); drawEd(); return; }
  edDraft = shapeFrom(edStart, edPoint(e)); drawEd();
});
const edEnd = async (e) => {
  if (!edStart) return;
  if (edCrop) { // Ausschnitt übernehmen und zur bearbeiteten Ansicht zurück
    const r = rectOf(edStart, edPoint(e)); edStart = null; edRect = null;
    const [rw, rh] = rotDims(edP);
    if (r.w > rw * 0.05 && r.h > rh * 0.05) { edCrop = false; await setCrop(edP, r); await edLoadImage(); } else drawEd();
    return;
  }
  const m = shapeFrom(edStart, edPoint(e)); edP.marks.push(unviewMark(edP, m)); edStart = null; edDraft = null; drawEd(); if (m.t === "num") renderEdNotes();
};
$("#edSvg").addEventListener("pointerup", edEnd);
$("#edSvg").addEventListener("pointercancel", () => { edStart = null; edDraft = null; edRect = null; drawEd(); });
$("#edRotL").addEventListener("click", async () => { await rotateView(edP, -1); await edLoadImage(); });
$("#edRotR").addEventListener("click", async () => { await rotateView(edP, 1); await edLoadImage(); });
$("#edCrop").addEventListener("click", async () => { edCrop = !edCrop; edRect = null; await edLoadImage(); });
$("#edCropReset").addEventListener("click", async () => { edCrop = false; await setCrop(edP, null); await edLoadImage(); });
$("#edTool").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { edTool = b.dataset.v; syncEdButtons(); } });
$("#edColor").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { edColor = b.dataset.v; syncEdButtons(); } });
$("#edUndo").addEventListener("click", () => { edP.marks.pop(); drawEd(); renderEdNotes(); });
$("#edClear").addEventListener("click", () => { edP.marks = []; drawEd(); renderEdNotes(); });
$("#edDone").addEventListener("click", closeEditor);
$("#editor").addEventListener("click", (e) => { if (e.target.id === "editor") closeEditor(); });
document.addEventListener("keydown", (e) => {
  if ($("#editor").hidden) return;
  if (e.key === "Escape") closeEditor();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.target.tagName !== "INPUT") { e.preventDefault(); edP.marks.pop(); drawEd(); renderEdNotes(); }
});

/* ---------- Originale verkleinern (EXIF bleibt erhalten) ---------- */
function exifSegment(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let o = 2;
  while (o + 4 < bytes.length && bytes[o] === 0xff) {
    const mk = bytes[o + 1], len = (bytes[o + 2] << 8) | bytes[o + 3];
    if (mk === 0xda || mk === 0xd9) break;
    if (mk === 0xe1 && String.fromCharCode(...bytes.subarray(o + 4, o + 10)) === "Exif\0\0") return bytes.slice(o, o + 2 + len);
    o += 2 + len;
  }
  return null;
}
function resetOrientation(seg) {
  // Orientierung im IFD0 auf 1 setzen – das neue Bild ist bereits gedreht
  try {
    const dv = new DataView(seg.buffer, seg.byteOffset, seg.byteLength), t = 10;
    const le = dv.getUint16(t) === 0x4949, ifd = t + dv.getUint32(t + 4, le), n = dv.getUint16(ifd, le);
    for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (dv.getUint16(e, le) === 0x0112) dv.setUint16(e + 8, 1, le); }
  } catch {}
  return seg;
}
function buildExif(p) {
  const dt = p.dtSrc === "exif" ? p.dt : null, gps = p.gps;
  if (!dt && !gps) return null;
  const ab = new ArrayBuffer(400), dv = new DataView(ab);
  dv.setUint16(0, 0x4d4d); dv.setUint16(2, 42); dv.setUint32(4, 8);
  const n0 = 1 + (dt ? 1 : 0) + (gps ? 1 : 0);
  let pos = 8 + 2 + n0 * 12 + 4;
  const exifOff = pos; if (dt) pos += 2 + 12 + 4 + 20;
  const gpsOff = pos; if (gps) pos += 2 + 5 * 12 + 4 + 48;
  const ent = (at, tag, type, count, val) => { dv.setUint16(at, tag); dv.setUint16(at + 2, type); dv.setUint32(at + 4, count); if (type === 3) dv.setUint16(at + 8, val); else dv.setUint32(at + 8, val); };
  let e = 8; dv.setUint16(e, n0); e += 2;
  ent(e, 0x0112, 3, 1, 1); e += 12;
  if (dt) { ent(e, 0x8769, 4, 1, exifOff); e += 12; }
  if (gps) { ent(e, 0x8825, 4, 1, gpsOff); e += 12; }
  dv.setUint32(e, 0);
  if (dt) {
    const data = exifOff + 18, s = `${dt.y}:${p2(dt.m)}:${p2(dt.d)} ${p2(dt.H)}:${p2(dt.M)}:${p2(dt.S)}`;
    dv.setUint16(exifOff, 1); ent(exifOff + 2, 0x9003, 2, 20, data); dv.setUint32(exifOff + 14, 0);
    for (let i = 0; i < 19; i++) dv.setUint8(data + i, s.charCodeAt(i)); dv.setUint8(data + 19, 0);
  }
  if (gps) {
    const data = gpsOff + 66; let a = gpsOff; dv.setUint16(a, 5); a += 2;
    ent(a, 0, 1, 4, 0); dv.setUint8(a + 8, 2); dv.setUint8(a + 9, 3); a += 12;
    ent(a, 1, 2, 2, 0); dv.setUint8(a + 8, gps.lat >= 0 ? 78 : 83); a += 12;
    ent(a, 2, 5, 3, data); a += 12;
    ent(a, 3, 2, 2, 0); dv.setUint8(a + 8, gps.lon >= 0 ? 69 : 87); a += 12;
    ent(a, 4, 5, 3, data + 24); a += 12; dv.setUint32(a, 0);
    const dms = (at, v) => { v = Math.abs(v); const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60 * 1000);
      [[d, 1], [m, 1], [s, 1000]].forEach(([nu, de], i) => { dv.setUint32(at + i * 8, nu); dv.setUint32(at + i * 8 + 4, de); }); };
    dms(data, gps.lat); dms(data + 24, gps.lon);
  }
  const tiff = new Uint8Array(ab, 0, pos), seg = new Uint8Array(10 + pos);
  seg.set([0xff, 0xe1, ((pos + 8) >> 8) & 0xff, (pos + 8) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]); seg.set(tiff, 10);
  return seg;
}
async function compressOriginal(p, orig) {
  const edge = +cfg.cmpEdge || 2400;
  const bmp = await createImageBitmap(await decodable(p));
  const s = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  let jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82))).arrayBuffer());
  const ex = exifSegment(orig);
  const seg = ex ? resetOrientation(ex) : buildExif(p);
  if (seg && seg.length < 65000) { const out = new Uint8Array(jpg.length + seg.length); out.set(jpg.subarray(0, 2)); out.set(seg, 2); out.set(jpg.subarray(2), 2 + seg.length); jpg = out; }
  if (jpg.length > orig.length * 0.9) return null; // lohnt sich nicht
  const name = /\.jpe?g$/i.test(p.name) ? p.name : p.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { bytes: jpg, name, mime: "image/jpeg", compressed: true, px: `${c.width}×${c.height}` };
}
function estEmbedded(p) {
  if (!cfg.cmp || !p.bw) return p.size;
  const s = Math.min(1, (+cfg.cmpEdge || 2400) / Math.max(p.bw, p.bh));
  return Math.min(p.size, p.bw * p.bh * s * s * 0.2);
}

/* ---------- Layout (in pt, Ursprung oben links) ---------- */
/* ---------- Schrift-Metriken (identisch für Vorschau und PDF) ---------- */
const FM = { ready: false };
async function initFonts() {
  if (!window.PDFLib) return;
  try {
    const d = await PDFLib.PDFDocument.create();
    FM.R = await d.embedFont(PDFLib.StandardFonts.Helvetica);
    FM.B = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
    FM.C = await d.embedFont(PDFLib.StandardFonts.Courier);
    FM.I = await d.embedFont(PDFLib.StandardFonts.HelveticaOblique);
    FM.BI = await d.embedFont(PDFLib.StandardFonts.HelveticaBoldOblique);
    FM.charset = new Set(FM.R.getCharacterSet());
    FM.ready = true; render();
  } catch (e) { console.warn(e); }
}
const SUBST = { "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ı": "i", "→": "->", "←": "<-", "≈": "~", "≤": "<=", "≥": ">=", " ": " ", " ": " " };
function clean(s) {
  s = String(s);
  if (!FM.ready) return s;
  return [...s].map((ch) => {
    if (FM.charset.has(ch.codePointAt(0))) return ch;
    if (SUBST[ch]) return SUBST[ch];
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return [...base].every((c) => FM.charset.has(c.codePointAt(0))) ? base : "?";
  }).join("");
}
const tw = (s, f, size) => (FM.ready ? FM[f].widthOfTextAtSize(s, size) : String(s).length * size * (f === "C" ? 0.6 : 0.52));
function fitT(s, f, size, maxW) {
  s = clean(s); if (tw(s, f, size) <= maxW) return s;
  while (s.length > 1 && tw(s + "…", f, size) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}
function wrapT(s, f, size, maxW, maxLines) {
  const words = clean(s).split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi], t = cur ? cur + " " + w : w;
    if (tw(t, f, size) <= maxW) { cur = t; continue; }
    if (cur) lines.push(cur); cur = w;
    if (lines.length === maxLines - 1) { cur = words.slice(wi).join(" "); break; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l, i, a) => (i === a.length - 1 ? fitT(l, f, size, maxW) : l));
}

/* ---------- Markdown (Titelseite) ---------- */
function mdInline(s) {
  const runs = []; let b = false, it = false, buf = "";
  const push = () => { if (buf) { runs.push({ t: buf, b, i: it }); buf = ""; } };
  for (let k = 0; k < s.length;) {
    const ch = s[k], two = s.substr(k, 2);
    if (ch === "\\" && k + 1 < s.length && /[\\*_`#|\[\]-]/.test(s[k + 1])) { buf += s[k + 1]; k += 2; continue; }
    if (ch === "`") { const e = s.indexOf("`", k + 1); if (e > k + 1) { push(); runs.push({ t: s.slice(k + 1, e), c: true }); k = e + 1; continue; } }
    if (two === "**" || two === "__") {
      if (b || s.indexOf(two, k + 2) > k + 2) { push(); b = !b; k += 2; continue; }
      buf += two; k += 2; continue;
    }
    if (ch === "*" || ch === "_") {
      const inner = ch === "_" && /\w/.test(s[k - 1] || "") && /\w/.test(s[k + 1] || "");
      if (!inner && (it || (s.indexOf(ch, k + 1) > k + 1 && !/\s/.test(s[k + 1] || " ")))) { push(); it = !it; k++; continue; }
    }
    buf += ch; k++;
  }
  push();
  return runs;
}
const plainOf = (s) => mdInline(s).map((r) => r.t).join("");
function fontOf(r, bold) {
  if (r.c) return "C";
  const b = r.b || bold, i = r.i;
  return b && i ? "BI" : b ? "B" : i ? "I" : "R";
}
function layoutRich(runs, maxW, size, bold) {
  const toks = [];
  for (const r of runs) {
    const f = fontOf(r, bold);
    for (const part of clean(r.t).split(/(\s+)/)) if (part) { const sp = /^\s+$/.test(part); toks.push({ t: sp ? " " : part, f, sp }); }
  }
  const lines = []; let cur = [], w = 0;
  const flush = () => { while (cur.length && cur[cur.length - 1].sp) { w -= cur[cur.length - 1].w; cur.pop(); } lines.push({ segs: cur, w }); cur = []; w = 0; };
  for (const tk of toks) {
    tk.w = tw(tk.t, tk.f, size);
    if (tk.sp) { if (cur.length) { cur.push(tk); w += tk.w; } continue; }
    if (w + tk.w > maxW && cur.length) flush();
    if (tk.w > maxW) {
      let t = tk.t;
      while (t) {
        let n = t.length; while (n > 1 && tw(t.slice(0, n), tk.f, size) > maxW - w) n--;
        const piece = t.slice(0, n), pw = tw(piece, tk.f, size);
        cur.push({ t: piece, f: tk.f, w: pw }); w += pw; t = t.slice(n);
        if (t) flush();
      }
      continue;
    }
    cur.push(tk); w += tk.w;
  }
  if (cur.length || !lines.length) flush();
  return lines.map((l) => {
    let x = 0; const segs = [];
    for (const s of l.segs) { const last = segs[segs.length - 1]; if (last && last.f === s.f) last.t += s.t; else segs.push({ x, t: s.t, f: s.f }); x += s.w; }
    return { segs, w: l.w };
  });
}
function mdBlocks(text) {
  const L = String(text || "").replace(/\r/g, "").split("\n"), out = [];
  const row = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const lvlOf = (sp) => Math.min(2, Math.floor(sp.replace(/\t/g, "  ").length / 2));
  let i = 0, m;
  while (i < L.length) {
    const ln = L[i];
    if (!ln.trim()) { out.push({ t: "gap" }); i++; continue; }
    if ((m = ln.match(/^\s*(#{1,3})\s+(.*)$/))) { out.push({ t: "h", lvl: m[1].length, text: m[2].replace(/\s+#+\s*$/, "") }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { out.push({ t: "hr" }); i++; continue; }
    if (/^\s*\|/.test(ln) && i + 1 < L.length && /^\s*\|?\s*:?-{2,}/.test(L[i + 1])) {
      const head = row(ln); i += 2; const rows = [];
      while (i < L.length && /^\s*\|/.test(L[i])) rows.push(row(L[i++]));
      out.push({ t: "table", head, rows }); continue;
    }
    if ((m = ln.match(/^(\s*)[-*+]\s+(?:\[([ xX])\]\s*)?(.*)$/))) { out.push({ t: "li", lvl: lvlOf(m[1]), mark: m[2] != null ? (m[2].trim() ? "x" : "o") : "bullet", text: m[3] }); i++; continue; }
    if ((m = ln.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) { out.push({ t: "li", lvl: lvlOf(m[1]), mark: "num", num: m[2], text: m[3] }); i++; continue; }
    out.push({ t: "p", text: ln.replace(/\s{2,}$|\\$/, "") }); i++;
  }
  return out;
}
function factsOf() {
  const ds = photos.filter((p) => p.dt && p.dtSrc === "exif").map((p) => p.dt).sort((a, b) => dtKey(a) - dtKey(b));
  const day = (t) => `${p2(t.d)}.${p2(t.m)}.${t.y}`;
  let span = "–";
  if (ds.length) { const a = day(ds[0]), b = day(ds[ds.length - 1]); span = a === b ? a : `${a} – ${b}`; }
  const d = new Date();
  return [["FOTOS", String(photos.length)], ["AUFNAHMEZEITRAUM", span], ["ERSTELLT AM", `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`]];
}
function coverPages(W, H, hd) {
  const pages = [], x0 = M, wid = W - 2 * M, bottom = H - M - (cfg.pageNo ? FOOT : 0);
  let ops = [], y = M, fresh = false;
  pages.push({ W, H, ops, kind: "cover" });
  const need = (h) => { if (y + h > bottom) { ops = []; header(ops, W, hd); pages.push({ W, H, ops, kind: "cover" }); y = M + hd.headH; fresh = true; } };
  const emit = (line, x, ytop, size, lh, color) => line.segs.forEach((sg) => { if (sg.t) ops.push({ o: "t", x: x + sg.x, y: ytop + (lh - size) / 2, s: size, f: sg.f, c: color, t: sg.t }); });

  // Kopf der Titelseite
  if (hd.logo) {
    let lh = 46, lw = (lh * hd.logo.w) / hd.logo.h; if (lw > 190) { lw = 190; lh = (lw * hd.logo.h) / hd.logo.w; }
    ops.push({ o: "logo", x: W - M - lw, y: M, w: lw, h: lh });
  }
  y = M + 70;
  layoutRich([{ t: cfg.title || "Fotodokumentation" }], wid, 26, true).slice(0, 3).forEach((l) => { emit(l, x0, y, 26, 31, C_INK); y += 31; });
  if (cfg.subtitle) { y += 4; layoutRich([{ t: cfg.subtitle }], wid, 13, false).slice(0, 3).forEach((l) => { emit(l, x0, y, 13, 17, C_MUT); y += 17; }); }
  y += 16; ops.push({ o: "rect", x: x0, y, w: 44, h: 3, fill: C_ACC }); y += 3 + 20;
  if (cfg.coverFacts) {
    const f = factsOf(), cw = wid / 3;
    f.forEach(([k, v], i) => {
      ops.push({ o: "t", x: x0 + i * cw, y, s: 7, f: "B", c: C_MUT, t: k });
      ops.push({ o: "t", x: x0 + i * cw, y: y + 12, s: 10.5, f: "R", c: C_INK, t: fitT(v, "R", 10.5, cw - 10) });
    });
    y += 32; ops.push({ o: "rule", x1: x0, x2: W - M, y, thin: true }); y += 18;
  }

  // Markdown-Inhalt
  let first = true;
  for (const bl of mdBlocks(cfg.coverText)) {
    fresh = false;
    if (bl.t === "gap") { if (!first) y += 7; continue; }
    if (bl.t === "hr") { need(14); ops.push({ o: "rule", x1: x0, x2: W - M, y: y + 6 }); y += 14; first = false; continue; }
    if (bl.t === "h") {
      const size = [0, 18, 14, 11.5][bl.lvl], lh = size * 1.25, before = first ? 0 : [0, 10, 9, 7][bl.lvl];
      const lines = layoutRich(mdInline(bl.text), wid, size, true);
      need(before + lh * Math.min(2, lines.length) + 13.5); if (!fresh) y += before;
      lines.forEach((l) => { need(lh); emit(l, x0, y, size, lh, C_INK); y += lh; });
      y += 4; first = false; continue;
    }
    if (bl.t === "p") {
      layoutRich(mdInline(bl.text), wid, 10, false).forEach((l) => { need(13.5); emit(l, x0, y, 10, 13.5, C_INK); y += 13.5; });
      first = false; continue;
    }
    if (bl.t === "li") {
      const ind = 14 * bl.lvl, mw = bl.mark === "num" ? Math.max(14, tw(bl.num + ".", "R", 10) + 5) : 14, tx = x0 + ind + mw;
      layoutRich(mdInline(bl.text), wid - ind - mw, 10, false).forEach((l, k) => {
        need(13.5);
        if (k === 0) {
          if (bl.mark === "bullet") ops.push({ o: "t", x: x0 + ind + 2, y: y + 1.75, s: 10, f: "R", c: C_INK, t: bl.lvl ? "–" : "•" });
          else if (bl.mark === "num") ops.push({ o: "t", x: x0 + ind, y: y + 1.75, s: 10, f: "R", c: C_INK, t: bl.num + "." });
          else ops.push({ o: "box", x: x0 + ind, y: y + 2.5, s: 8.5, on: bl.mark === "x" });
        }
        emit(l, tx, y, 10, 13.5, C_INK); y += 13.5;
      });
      first = false; continue;
    }
    if (bl.t === "table") {
      const n = Math.max(bl.head.length, ...bl.rows.map((r) => r.length)), pad = 4, size = 9, lh = 11.5;
      const all = [bl.head, ...bl.rows];
      const nat = Array.from({ length: n }, (_, c) => Math.max(36, ...all.map((r, ri) => tw(clean(plainOf(r[c] || "")), ri ? "R" : "B", size) + 2 * pad + 2)));
      const sum = nat.reduce((a, b) => a + b, 0), cws = nat.map((v) => (v / sum) * wid);
      y += first ? 0 : 3;
      all.forEach((r, ri) => {
        const cells = cws.map((cw, c) => layoutRich(mdInline(r[c] || ""), cw - 2 * pad, size, ri === 0));
        const rh = Math.max(1, ...cells.map((c) => c.length)) * lh + 2 * pad;
        need(rh);
        if (ri === 0) { ops.push({ o: "rect", x: x0, y, w: wid, h: rh, fill: "#EEF1F0" }); ops.push({ o: "rule", x1: x0, x2: W - M, y }); }
        let cx = x0;
        cells.forEach((lines, c) => { lines.forEach((l, k) => emit(l, cx + pad, y + pad + k * lh, size, lh, C_INK)); cx += cws[c]; });
        y += rh; ops.push({ o: "rule", x1: x0, x2: W - M, y, thin: ri !== 0 });
      });
      y += 6; first = false; continue;
    }
  }
  return pages;
}

/* ---------- Seitenmodell (pt, Ursprung oben links) ---------- */
const M = 40, GAP = 16, FOOT = 20;
const C_INK = "#1E2324", C_MUT = "#6E7778", C_ACC = "#0B6B6B", C_RULE = "#C4CBCA";
const NUMS = (p) => viewMarks(p).filter((m) => m.t === "num").map((m) => m.src); // nur Nummern im sichtbaren Ausschnitt
const photoNo = (p) => photos.indexOf(p) + 1;

function pageSize() { let [W, H] = PAGE[cfg.fmt] || PAGE.A4; if (cfg.orient === "l") [W, H] = [H, W]; return [W, H]; }
function headInfo() {
  const logo = cfg.logoOn && logoData ? logoData : null;
  let lw = 0, lh = 0;
  if (logo) { lh = 34; lw = (lh * logo.w) / logo.h; if (lw > 150) { lw = 150; lh = (lw * logo.h) / logo.w; } }
  const textH = (cfg.title ? 19 : 0) + (cfg.subtitle ? 14 : 0);
  const headH = textH || lw ? Math.max(textH, lh + 2) + 12 : 0;
  return { logo, lw, lh, textH, headH };
}
function header(ops, W, hd) {
  const tmax = W - 2 * M - (hd.lw ? hd.lw + 14 : 0);
  if (cfg.title) ops.push({ o: "t", x: M, y: M, s: 15, f: "B", c: C_INK, t: fitT(cfg.title, "B", 15, tmax) });
  if (cfg.subtitle) ops.push({ o: "t", x: M, y: M + (cfg.title ? 19 : 0), s: 9.5, f: "R", c: C_MUT, t: fitT(cfg.subtitle, "R", 9.5, tmax) });
  if (hd.lw) ops.push({ o: "logo", x: W - M - hd.lw, y: M - 2, w: hd.lw, h: hd.lh });
  if (hd.headH) ops.push({ o: "rule", x1: M, x2: W - M, y: M + hd.headH - 7 });
}
function fitImage(cell, p) {
  const ar = p.w && p.h ? p.w / p.h : 4 / 3;
  let w = cell.w, h = w / ar;
  if (h > cell.boxH) { h = cell.boxH; w = h * ar; }
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.boxH - h), w, h }; // unten bündig über der Beschriftung
}
function pagesOf() { const per = +cfg.per, out = []; for (let i = 0; i < photos.length; i += per) out.push(photos.slice(i, i + per)); return out; }

function slotsFor(pg, cw) {
  const s = [];
  if (cfg.capNum || cfg.capDate) s.push({ k: "head", h: 12 });
  if (cfg.capPlace) s.push({ k: "place", h: 11 });
  if (cfg.capGps) s.push({ k: "gps", h: 10 });
  if (cfg.capNote) {
    const n = Math.min(3, Math.max(0, ...pg.map((p) => (p.note ? wrapT(p.note, "R", 8.5, cw, 3).length : 0))));
    if (n) s.push({ k: "note", h: n * 10.6 + 1, n });
  }
  if (cfg.capMarks) {
    const n = Math.min(8, Math.max(0, ...pg.map((p) => NUMS(p).length)));
    if (n) s.push({ k: "marks", h: n * 10.5 + 1, n });
  }
  if (cfg.capFile) s.push({ k: "file", h: 9.5 });
  return s;
}
function embText(p, e) {
  if (!cfg.embed) return p.name;
  if (e) return e.compressed ? `${e.name} · verkleinert auf ${fmtSize(e.size)} eingebettet` : `${p.name} · ${fmtSize(p.size)} eingebettet`;
  return p.name + (cfg.cmp ? " · verkleinert eingebettet" : " · " + fmtSize(p.size) + " eingebettet");
}
function caption(ops, s, p, x, y, w, embMap) {
  if (s.k === "head") {
    let cx = x;
    if (cfg.capNum) { const t = "Foto " + photoNo(p); ops.push({ o: "t", x: cx, y, s: 9, f: "B", c: C_ACC, t }); cx += tw(t, "B", 9); }
    if (cfg.capDate) {
      const d = p.dt ? fmtDate(p.dt) : "Aufnahmezeit unbekannt";
      if (cfg.capNum) { const t = fitT("  ·  " + d, "R", 9, x + w - cx); ops.push({ o: "t", x: cx, y, s: 9, f: "R", c: C_INK, t }); }
      else ops.push({ o: "t", x, y, s: 9, f: "B", c: C_INK, t: fitT(d, "B", 9, w) });
    }
  } else if (s.k === "place") {
    const t = p.place || (p.gps ? "" : "Ohne Standortdaten");
    if (t) ops.push({ o: "t", x, y, s: 8.5, f: "R", c: C_INK, t: fitT(t, "R", 8.5, w) });
  } else if (s.k === "gps") {
    if (p.gps) { const t = fitT("GPS " + fmtGps(p.gps), "R", 7.5, w); ops.push({ o: "t", x, y, s: 7.5, f: "R", c: C_ACC, t }); ops.push({ o: "link", x, y: y - 1, w: tw(t, "R", 7.5), h: 9.5, url: mapUrl(p.gps) }); }
  } else if (s.k === "note") {
    if (p.note) wrapT(p.note, "R", 8.5, w, s.n).forEach((t, k) => ops.push({ o: "t", x, y: y + k * 10.6, s: 8.5, f: "R", c: C_INK, t }));
  } else if (s.k === "marks") {
    NUMS(p).slice(0, s.n).forEach((m, k) => {
      const yy = y + k * 10.5;
      ops.push({ o: "badge", x: x + 4.3, y: yy + 3.6, r: 4.3, n: k + 1, c: m.c });
      if (m.note) ops.push({ o: "t", x: x + 12, y: yy, s: 8, f: "R", c: C_INK, t: fitT(m.note, "R", 8, w - 12) });
    });
  } else if (s.k === "file") {
    ops.push({ o: "t", x, y, s: 7, f: "R", c: C_MUT, t: fitT(embText(p, embMap && embMap.get(p)), "R", 7, w) });
  }
}
function hashPages(pages, W, H, hd, embMap) {
  const top = M + hd.headH, bottom = H - M - (cfg.pageNo ? FOOT : 0), wid = W - 2 * M;
  let ops = null, y = 0, first = true;
  const open = () => {
    ops = []; header(ops, W, hd); pages.push({ W, H, ops, kind: "hash" }); y = top;
    ops.push({ o: "t", x: M, y, s: 11, f: "B", c: C_INK, t: fitT("Prüfsummen der Originaldateien (SHA-256)" + (first ? "" : " – Fortsetzung"), "B", 11, wid) }); y += 17;
    if (first) {
      const intro = "Die Prüfsumme wird über die unveränderte Originaldatei gebildet. Stimmt sie mit der Prüfsumme einer vorliegenden Datei überein, ist diese Datei bitgenau das Original. "
        + "Prüfen unter Windows: certutil -hashfile <Datei> SHA256 – unter macOS/Linux: shasum -a 256 <Datei>";
      wrapT(intro, "R", 8, wid, 5).forEach((t) => { ops.push({ o: "t", x: M, y, s: 8, f: "R", c: C_MUT, t }); y += 10.5; });
      y += 8;
    }
    first = false;
  };
  photos.forEach((p) => {
    const e = embMap && embMap.get(p), comp = cfg.embed && cfg.cmp && (!e || e.compressed);
    const rowH = 11 + 10 + (comp ? 19 : 0) + 8;
    if (!ops || y + rowH > bottom) open();
    const no = "Foto " + photoNo(p);
    ops.push({ o: "t", x: M, y, s: 8.5, f: "B", c: C_INK, t: no });
    const meta = [p.name, fmtSize(p.size), p.dt ? fmtDate(p.dt) : ""].filter(Boolean).join("  ·  ");
    const nx = M + Math.max(44, tw(no, "B", 8.5) + 8);
    ops.push({ o: "t", x: nx, y, s: 8.5, f: "R", c: C_INK, t: fitT(meta, "R", 8.5, M + wid - nx) }); y += 11;
    ops.push({ o: "t", x: nx, y, s: 7.5, f: "C", c: C_INK, t: p.sha || "wird berechnet …" }); y += 10;
    if (comp) {
      ops.push({ o: "t", x: nx, y, s: 7, f: "R", c: C_MUT, t: fitT(e ? `Im PDF verkleinert eingebettet als ${e.name} (${fmtSize(e.size)}):` : "Im PDF verkleinert eingebettet, Prüfsumme wird beim Erstellen berechnet", "R", 7, M + wid - nx) }); y += 9.5;
      ops.push({ o: "t", x: nx, y, s: 7.5, f: "C", c: C_MUT, t: e && e.sha ? e.sha : "–" }); y += 9.5;
    }
    y += 3; ops.push({ o: "rule", x1: M, x2: W - M, y, thin: true }); y += 5;
  });
}
function buildModel(embMap) {
  const [W, H] = pageSize(), hd = headInfo();
  const g = GRID[cfg.per] || GRID[4];
  const [cols, rows] = cfg.orient === "l" ? [g[2], g[3]] : [g[0], g[1]];
  const top = M + hd.headH, bottom = H - M - (cfg.pageNo ? FOOT : 0);
  const cw = (W - 2 * M - (cols - 1) * GAP) / cols, ch = (bottom - top - (rows - 1) * GAP) / rows;
  const pages = cfg.coverOn ? coverPages(W, H, hd) : [];
  pagesOf().forEach((pg) => {
    const ops = []; header(ops, W, hd);
    const slots = slotsFor(pg, cw * 0.75), cap = 5 + slots.reduce((a, s) => a + s.h, 0);
    pg.forEach((p, i) => {
      const cell = { x: M + (i % cols) * (cw + GAP), y: top + Math.floor(i / cols) * (ch + GAP), w: cw, h: ch, boxH: Math.max(40, ch - cap) };
      const im = fitImage(cell, p);
      ops.push({ o: "img", p, ...im });
      if (cfg.embed) ops.push({ o: "clip", p, x: im.x + im.w + 2, y: im.y });
      const cx = Math.min(im.x, cell.x + cell.w * 0.25), cwid = cell.x + cell.w - cx;
      let y = cell.y + cell.boxH + 5;
      for (const s of slots) { caption(ops, s, p, cx, y, cwid, embMap); y += s.h; }
    });
    pages.push({ W, H, ops, kind: "photos" });
  });
  if (cfg.hashes && photos.length) hashPages(pages, W, H, hd, embMap);
  if (cfg.pageNo) {
    const d = new Date(), created = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
    pages.forEach((pm, i) => {
      const t = `Seite ${i + 1} von ${pages.length}`;
      pm.ops.push({ o: "t", x: M, y: H - M - 7, s: 7, f: "R", c: C_MUT, t: "Erstellt am " + created });
      pm.ops.push({ o: "t", x: W - M - tw(t, "R", 7), y: H - M - 7, s: 7, f: "R", c: C_MUT, t });
    });
  }
  return pages;
}

/* ---------- Rendering der Oberfläche ---------- */
const ICON = {
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5"/></svg>',
  del: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  mark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2.5 13.5l.8-3.3 7.6-7.6 2.5 2.5-7.6 7.6z M9.6 3.9l2.5 2.5"/></svg>',
  rotl: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 6.2A5 5 0 1 1 3 9.5M3 2.8v3.6h3.6"/></svg>',
  rotr: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 6.2A5 5 0 1 0 13 9.5M13 2.8v3.6H9.4"/></svg>',
  clip: '<svg viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8.5 5v6a2.5 2.5 0 0 1-5 0V3.8a1.8 1.8 0 0 1 3.6 0V10.5a.9.9 0 0 1-1.8 0V5"/></svg>',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let bigPage = -1;
let rafPending = false;
function render() { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; draw(); }); }

function draw() {
  const model = buildModel(null);
  const pagesEl = $("#pages");
  if (!photos.length) {
    pagesEl.innerHTML = '<div class="empty">Noch keine Fotos. Zieh Bilder in das Feld oben.</div>';
  } else {
    pagesEl.innerHTML = model.map((pm, pi) => `<figure class="pagewrap${bigPage === pi ? " big" : ""}" style="margin:0"><div class="sheet" data-page="${pi}" role="button" tabindex="0" aria-label="Seite ${pi + 1} vergrößern" style="aspect-ratio:${pm.W.toFixed(2)}/${pm.H.toFixed(2)}">${pageHtml(pm)}</div><figcaption>Seite ${pi + 1} · ${pm.kind === "hash" ? "Prüfsummen" : cfg.fmt + " " + (cfg.orient === "l" ? "quer" : "hoch")}</figcaption></figure>`).join("");
  }
  $("#pageInfo").textContent = photos.length ? `${model.length} ${model.length === 1 ? "Seite" : "Seiten"}` : "";

  // Liste – Eingabefelder mit Fokus nicht neu aufbauen
  const listEl = $("#list");
  const active = document.activeElement;
  const keepFocus = active && listEl.contains(active) && active.tagName === "INPUT" ? { id: active.id, s: active.selectionStart, e: active.selectionEnd } : null;
  $("#listHead").textContent = `Fotos (${photos.length})`;
  let nm = 0;
  listEl.innerHTML = photos.map((p, i) => {
    const chip = p.busy ? '<span class="chip">wird gelesen</span>'
      : !p.gps ? '<span class="chip warn">kein GPS</span>'
      : p.placeSrc === "osm" ? '<span class="chip ok">Ort: OpenStreetMap</span>'
      : p.placeSrc === "offline" ? '<span class="chip">Ort: offline, nächster Ort</span>'
      : p.placeSrc === "manual" ? '<span class="chip ok">Ort: manuell</span>'
      : cfg.placeMode === "off" ? "" : '<span class="chip">Ort wird gesucht</span>';
    const sample = p.sample ? '<span class="chip warn">Beispiel</span>' : "";
    const date = p.dt ? fmtDate(p.dt) + (p.dtSrc === "datei" ? " (Dateidatum)" : "") : "ohne Datum";
    return `<article class="card" data-id="${p.id}">
      ${p.thumb ? `<button type="button" class="tbtn" data-a="mark" aria-label="${esc(p.name)} markieren" style="aspect-ratio:${p.w}/${p.h}"><img class="thumb" alt="" src="${p.thumb}">${marksSvg(p)}<span class="mk">${(nm = viewMarks(p).length) ? nm + " Markierung" + (nm > 1 ? "en" : "") : "Markieren"}</span></button>` : `<div class="thumb missing">${esc(p.err || "lädt …")}</div>`}
      <div class="meta">
        <div class="top"><span class="fno">Foto ${i + 1}</span><span class="fname">${esc(p.name)}</span>${sample}${chip}</div>
        <div class="facts"><span>${esc(date)}</span><span>${fmtSize(p.size)}</span>${p.gps ? `<a href="${mapUrl(p.gps)}" target="_blank" rel="noopener">${fmtGps(p.gps)}</a>` : ""}</div>
        <div class="inputs">
          <input type="text" id="place-${p.id}" data-f="place" value="${esc(p.place)}" placeholder="Ort eintragen" aria-label="Ort für ${esc(p.name)}">
          <input type="text" id="note-${p.id}" data-f="note" value="${esc(p.note)}" placeholder="Bemerkung (optional)" aria-label="Bemerkung für ${esc(p.name)}">
        </div>
      </div>
      <div class="acts">
        <button class="icon" type="button" data-a="mark" aria-label="Markieren" title="Kreis oder Pfeil setzen" ${p.thumb ? "" : "disabled"}>${ICON.mark}</button>
        <button class="icon" type="button" data-a="rotl" aria-label="Links drehen" title="Links drehen" ${p.thumb ? "" : "disabled"}>${ICON.rotl}</button>
        <button class="icon" type="button" data-a="rotr" aria-label="Rechts drehen" title="Rechts drehen" ${p.thumb ? "" : "disabled"}>${ICON.rotr}</button>
        <button class="icon" type="button" data-a="up" aria-label="Nach oben" ${i === 0 ? "disabled" : ""}>${ICON.up}</button>
        <button class="icon" type="button" data-a="down" aria-label="Nach unten" ${i === photos.length - 1 ? "disabled" : ""}>${ICON.down}</button>
        <button class="icon del" type="button" data-a="del" aria-label="Entfernen">${ICON.del}</button>
      </div></article>`;
  }).join("");
  if (keepFocus) { const el = document.getElementById(keepFocus.id); if (el) { el.focus(); try { el.setSelectionRange(keepFocus.s, keepFocus.e); } catch {} } }

  $("#sampleBar").hidden = !photos.some((p) => p.sample);
  const orig = photos.reduce((s, p) => s + estEmbedded(p), 0);
  const dpi = +cfg.dpi;
  const est = model.reduce((s, pm) => s + pm.ops.reduce((t, op) => t + (op.o === "img" ? (op.w * dpi / 72) * (op.h * dpi / 72) * 0.17 : 0), 0), 0);
  const total = est + (cfg.embed ? orig : 0) + 4000;
  $("#stats").innerHTML = photos.length ? `<b>${photos.length}</b> Fotos · <b>${model.length}</b> S. · PDF ca. <b>${fmtSize(total)}</b>` : "";
}

/* ---------- Vorschau aus dem Seitenmodell ---------- */
function pageHtml(pm) {
  const pct = (v, of) => (v / of * 100).toFixed(3) + "%";
  const cq = (pt) => (pt / pm.W * 100).toFixed(3) + "cqw";
  const fam = { R: "", B: "font-weight:700;", I: "font-style:italic;", BI: "font-weight:700;font-style:italic;", C: 'font-family:"Courier New",Courier,monospace;' };
  let h = "";
  for (const op of pm.ops) {
    if (op.o === "t") h += `<div class="t" style="left:${pct(op.x, pm.W)};top:${pct(op.y, pm.H)};font-size:${cq(op.s)};color:${op.c};${fam[op.f]}">${esc(op.t)}</div>`;
    else if (op.o === "rule") h += `<div class="rule${op.thin ? " thin" : ""}" style="left:${pct(op.x1, pm.W)};top:${pct(op.y, pm.H)};width:${pct(op.x2 - op.x1, pm.W)}"></div>`;
    else if (op.o === "logo") h += `<img class="logo" alt="" src="${logoData.data}" style="left:${pct(op.x, pm.W)};top:${pct(op.y, pm.H)};width:${pct(op.w, pm.W)};height:${pct(op.h, pm.H)}">`;
    else if (op.o === "img") {
      const p = op.p, box = `left:${pct(op.x, pm.W)};top:${pct(op.y, pm.H)};width:${pct(op.w, pm.W)};height:${pct(op.h, pm.H)}`;
      h += p.thumb ? `<img class="ph" alt="" src="${p.thumb}" style="${box}">${marksSvg(p, box)}` : `<div class="ph missing" style="${box}">${p.busy ? "lädt …" : "keine Vorschau"}</div>`;
    } else if (op.o === "rect") h += `<div class="rc" style="left:${pct(op.x, pm.W)};top:${pct(op.y, pm.H)};width:${pct(op.w, pm.W)};height:${pct(op.h, pm.H)};background:${op.fill}"></div>`;
    else if (op.o === "box") h += `<span class="cb" style="left:${pct(op.x, pm.W)};top:${pct(op.y, pm.H)};width:${cq(op.s)};height:${cq(op.s)}">${op.on ? '<svg viewBox="0 0 8 8"><path d="M1.6 4.2 3.4 6 6.6 2" fill="none" stroke="#0B6B6B" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}</span>`;
    else if (op.o === "clip") h += `<span class="clip" style="left:${pct(op.x, pm.W)};top:${pct(op.y, pm.H)}">${ICON.clip}</span>`;
    else if (op.o === "badge") h += `<span class="bdg" style="left:${pct(op.x - op.r, pm.W)};top:${pct(op.y - op.r, pm.H)};width:${cq(op.r * 2)};height:${cq(op.r * 2)};font-size:${cq(op.r * 1.3)};background:${op.c};color:${numInk(op.c)}">${op.n}</span>`;
  }
  return h;
}

/* ---------- PDF aus dem Seitenmodell ---------- */
async function buildPdf(onProgress) {
  const { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFHexString, LineCapStyle } = PDFLib;
  const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const pdf = await PDFDocument.create();
  const ctx = pdf.context;
  pdf.setTitle(cfg.title || "Fotodokumentation");
  if (cfg.subtitle) pdf.setSubject(cfg.subtitle);
  pdf.setCreator("Foto-Protokoll"); pdf.setLanguage("de-DE");
  const F = { R: await pdf.embedFont(StandardFonts.Helvetica), B: await pdf.embedFont(StandardFonts.HelveticaBold), C: await pdf.embedFont(StandardFonts.Courier),
    I: await pdf.embedFont(StandardFonts.HelveticaOblique), BI: await pdf.embedFont(StandardFonts.HelveticaBoldOblique) };
  const n = photos.length;

  // 1) Prüfsummen und ggf. verkleinerte Fassungen vorbereiten
  const embMap = new Map();
  for (let i = 0; i < n; i++) {
    const p = photos[i];
    if (cfg.hashes && !p.sha) p.sha = await sha256hex(new Uint8Array(await p.file.arrayBuffer()));
    if (cfg.embed) {
      let e = { name: p.name, size: p.size, mime: p.file.type || (isHeic(p.file) ? "image/heic" : "application/octet-stream"), compressed: false };
      if (cfg.cmp) {
        const c = await compressOriginal(p, new Uint8Array(await p.file.arrayBuffer())).catch((err) => { console.warn(err); return null; });
        if (c) { e = { ...c, size: c.bytes.length }; if (cfg.hashes) e.sha = await sha256hex(c.bytes); }
      }
      embMap.set(p, e);
    }
    onProgress(((i + 1) / n) * 0.3);
  }

  // 2) Seiten zeichnen
  const model = buildModel(embMap);
  const dpi = +cfg.dpi, ef = [];
  let logoImg = null, done = 0;
  for (const pm of model) {
    const page = pdf.addPage([pm.W, pm.H]);
    const Y = (top, h = 0) => pm.H - top - h;
    const annots = [];
    for (const op of pm.ops) {
      if (op.o === "t") {
        if (op.t) page.drawText(op.t, { x: op.x, y: Y(op.y + op.s * 0.8), size: op.s, font: F[op.f], color: hex(op.c) });
      } else if (op.o === "rule") {
        page.drawLine({ start: { x: op.x1, y: Y(op.y) }, end: { x: op.x2, y: Y(op.y) }, thickness: op.thin ? 0.3 : 0.5, color: hex(C_RULE) });
      } else if (op.o === "rect") {
        page.drawRectangle({ x: op.x, y: Y(op.y, op.h), width: op.w, height: op.h, color: hex(op.fill) });
      } else if (op.o === "box") {
        page.drawRectangle({ x: op.x, y: Y(op.y, op.s), width: op.s, height: op.s, borderColor: hex(C_INK), borderWidth: 0.7 });
        if (op.on) page.drawSvgPath("M1.6 4.2 L3.4 6 L6.6 2", { x: op.x, y: Y(op.y), scale: op.s / 8, borderColor: hex(C_ACC), borderWidth: 1.4, borderLineCap: LineCapStyle.Round });
      } else if (op.o === "logo") {
        if (!logoImg) logoImg = await pdf.embedPng(logoData.data);
        page.drawImage(logoImg, { x: op.x, y: Y(op.y, op.h), width: op.w, height: op.h });
      } else if (op.o === "link") {
        annots.push(ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [op.x, Y(op.y + op.h), op.x + op.w, Y(op.y)], Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(op.url) } })));
      } else if (op.o === "badge") {
        page.drawCircle({ x: op.x, y: Y(op.y), size: op.r, color: hex(op.c) });
        const t = String(op.n), s = op.r * 1.25, w = F.B.widthOfTextAtSize(t, s);
        page.drawText(t, { x: op.x - w / 2, y: Y(op.y) - s * 0.36, size: s, font: F.B, color: hex(numInk(op.c)) });
      } else if (op.o === "img") {
        const p = op.p;
        let drawn = false;
        try {
          const img = await pdf.embedJpg(await renderJpeg(p, (op.w * dpi) / 72, (op.h * dpi) / 72));
          page.drawImage(img, { x: op.x, y: Y(op.y, op.h), width: op.w, height: op.h });
          drawn = true;
        } catch (e) { console.warn("Bild", p.name, e); }
        if (!drawn) {
          page.drawRectangle({ x: op.x, y: Y(op.y, op.h), width: op.w, height: op.h, color: rgb(0.94, 0.95, 0.95) });
          page.drawText("Bild nicht darstellbar – Original siehe Anhang", { x: op.x + 6, y: Y(op.y + op.h / 2), size: 7.5, font: F.R, color: hex(C_MUT) });
        }
        page.drawRectangle({ x: op.x, y: Y(op.y, op.h), width: op.w, height: op.h, borderColor: hex(C_RULE), borderWidth: 0.4 });
        if (drawn && p.marks && p.marks.length) drawMarksPdf(page, p, op, Y, F, hex, LineCapStyle);
        onProgress(0.3 + (++done / n) * 0.7);
      } else if (op.o === "clip") {
        const p = op.p, e = embMap.get(p);
        if (!e) continue;
        const bytes = e.compressed ? e.bytes : new Uint8Array(await p.file.arrayBuffer());
        const mod = new Date(p.file.lastModified || Date.now());
        const sref = ctx.register(ctx.stream(bytes, { Type: "EmbeddedFile", Subtype: e.mime, Params: { Size: bytes.length, ModDate: PDFString.fromDate(mod) } }));
        const desc = ["Foto " + photoNo(p), p.dt ? fmtDate(p.dt) : "", p.place, p.gps ? fmtGps(p.gps) : ""].filter(Boolean).join(" · ")
          + (e.compressed ? ` · verkleinert (${e.px}), Original ${fmtSize(p.size)}` : "")
          + (p.sha ? ` · SHA-256 Original: ${p.sha}` : "");
        const fs = ctx.register(ctx.obj({ Type: "Filespec", F: PDFString.of(clean(e.name)), UF: PDFHexString.fromText(e.name),
          EF: { F: sref, UF: sref }, Desc: PDFHexString.fromText(desc), AFRelationship: e.compressed ? "Alternative" : "Source" }));
        ef.push({ key: String(ef.length + 1).padStart(4, "0") + " " + e.name, fs });
        annots.push(ctx.register(ctx.obj({ Type: "Annot", Subtype: "FileAttachment", Rect: [op.x, Y(op.y, 16), op.x + 12, Y(op.y)], FS: fs, Name: "Paperclip",
          Contents: PDFHexString.fromText((e.compressed ? "Foto (verkleinert): " : "Originaldatei: ") + e.name + " (" + fmtSize(bytes.length) + ")"),
          T: PDFHexString.fromText("Foto-Protokoll"), C: [0.043, 0.42, 0.42], F: 24, P: page.ref })));
      }
    }
    if (annots.length) page.node.set(PDFName.of("Annots"), ctx.obj(annots));
  }
  if (ef.length) {
    const arr = [];
    ef.sort((a, b) => (a.key < b.key ? -1 : 1)).forEach((e) => arr.push(PDFHexString.fromText(e.key), e.fs));
    pdf.catalog.set(PDFName.of("Names"), ctx.obj({ EmbeddedFiles: ctx.obj({ Names: ctx.obj(arr) }) }));
    pdf.catalog.set(PDFName.of("AF"), ctx.obj(ef.map((e) => e.fs)));
  }
  return pdf.save({ useObjectStreams: true });
}

function drawMarksPdf(page, p, op, Y, F, hex, LineCapStyle) {
  const sc = op.w / p.w, o = { x: op.x, y: Y(op.y), scale: sc }, vm = viewMarks(p), nums = vm.filter((q) => q.t === "num");
  for (const pass of ["halo", "color"]) {
    for (const m of vm) {
      const g = markGeom(m, p), halo = pass === "halo", col = hex(halo ? haloOf(m.c) : m.c), opa = halo ? 0.85 : 1;
      if (g.num) {
        const d = circlePath(m.x, m.y, g.r);
        if (halo) page.drawSvgPath(d, { ...o, color: col, opacity: opa, borderColor: col, borderOpacity: opa, borderWidth: g.sw * 2.4 });
        else {
          page.drawSvgPath(d, { ...o, color: col });
          const t = String(nums.indexOf(m) + 1), s = g.r * 1.3 * sc, w = F.B.widthOfTextAtSize(t, s);
          page.drawText(t, { x: op.x + m.x * sc - w / 2, y: Y(op.y + m.y * sc) - s * 0.36, size: s, font: F.B, color: hex(numInk(m.c)) });
        }
        continue;
      }
      const w = halo ? g.sw * 2.2 : g.sw;
      g.stroke.forEach((d) => page.drawSvgPath(d, { ...o, borderColor: col, borderWidth: w, borderLineCap: LineCapStyle.Round, borderOpacity: opa }));
      g.fill.forEach((d) => halo
        ? page.drawSvgPath(d, { ...o, color: col, opacity: opa, borderColor: col, borderOpacity: opa, borderWidth: g.sw * 1.2, borderLineCap: LineCapStyle.Round })
        : page.drawSvgPath(d, { ...o, color: col }));
    }
  }
}

/* ---------- SHA-256 ---------- */
async function sha256hex(bytes) {
  let buf;
  if (window.crypto && crypto.subtle) { try { buf = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); } catch {} }
  if (!buf) buf = sha256js(bytes);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sha256js(msg) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const l = msg.length, nb = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(nb);
  b.set(msg); b[l] = 0x80;
  const dv = new DataView(b.buffer); dv.setUint32(nb - 8, Math.floor(l / 0x20000000)); dv.setUint32(nb - 4, (l << 3) >>> 0);
  const w = new Uint32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
}

async function renderJpeg(p, maxW, maxH, full) {
  const blob = await decodable(p);
  const bmp = await createImageBitmap(blob), v = viewBox(p, full);
  const s = Math.min(1, maxW / v.w, maxH / v.h);
  const w = Math.max(1, Math.round(v.w * s)), h = Math.max(1, Math.round(v.h * s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  drawView(g, bmp, p, w, h, full); bmp.close();
  const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
  return new Uint8Array(await out.arrayBuffer());
}

/* ---------- Speichern ---------- */
const downloadsP = window.claude && typeof window.claude.use === "function"
  ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
function fileName() {
  const base = (cfg.title || "Fotodokumentation").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "Fotodokumentation";
  const d = new Date();
  return `${base}_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.pdf`;
}
async function deliver(bytes) {
  const name = fileName();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const dl = await downloadsP;
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); toast(`${name} gespeichert.`); }
    catch (e) { toast(e && e.code === "declined" ? "Speichern abgebrochen." : "Speichern ist hier nicht möglich (" + ((e && e.code) || "Fehler") + ")."); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  toast(`${name} erstellt. <a href="${url}" target="_blank" rel="noopener">Öffnen</a>`, true, 9000);
}

/* ---------- Ereignisse ---------- */
let toastT;
function toast(msg, html = false, ms = 4000) {
  const t = $("#toast"); if (html) t.innerHTML = msg; else t.textContent = msg;
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

$("#make").addEventListener("click", async () => {
  if (!photos.length) { toast("Erst Fotos hinzufügen."); return; }
  if (photos.some((p) => p.busy)) { toast("Fotos werden noch gelesen, einen Moment."); return; }
  if (!window.PDFLib) { toast("Die PDF-Bibliothek konnte nicht geladen werden. Internetverbindung prüfen."); return; }
  const btn = $("#make"), bar = $("#progress"), fill = bar.querySelector("i");
  btn.disabled = true; bar.hidden = false; fill.style.width = "2%";
  try { const bytes = await buildPdf((f) => (fill.style.width = Math.round(f * 100) + "%")); await deliver(bytes); }
  catch (e) { console.error(e); toast("PDF konnte nicht erstellt werden: " + (e && e.message ? e.message : e)); }
  finally { btn.disabled = false; setTimeout(() => (bar.hidden = true), 600); }
});

$("#file").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } }));
["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { if (ev === "dragleave" && e.relatedTarget) return; drop.classList.remove("over"); }));
document.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

$("#list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const id = +b.closest(".card").dataset.id, i = photos.findIndex((p) => p.id === id); if (i < 0) return;
  if (b.dataset.a === "up" && i > 0) [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
  if (b.dataset.a === "down" && i < photos.length - 1) [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
  if (b.dataset.a === "mark") { openEditor(photos[i]); return; }
  if (b.dataset.a === "rotl" || b.dataset.a === "rotr") { rotateView(photos[i], b.dataset.a === "rotr" ? 1 : -1); return; }
  if (b.dataset.a === "del") { const [p] = photos.splice(i, 1); if (p.thumb) URL.revokeObjectURL(p.thumb); }
  render();
});
$("#list").addEventListener("input", (e) => {
  const el = e.target; if (!el.dataset.f) return;
  const p = photos.find((q) => q.id === +el.closest(".card").dataset.id); if (!p) return;
  p[el.dataset.f] = el.value;
  if (el.dataset.f === "place") p.placeSrc = el.value ? "manual" : "";
  renderPagesOnly();
});
let pagesT; function renderPagesOnly() { clearTimeout(pagesT); pagesT = setTimeout(render, 250); }
$("#pages").addEventListener("click", (e) => { const s = e.target.closest(".sheet"); if (!s) return; const i = +s.dataset.page; bigPage = bigPage === i ? -1 : i; render(); });
$("#pages").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("sheet")) { e.preventDefault(); e.target.click(); } });
$("#sortBtn").addEventListener("click", () => { photos.sort((a, b) => dtKey(a.dt) - dtKey(b.dt)); render(); });
$("#clearBtn").addEventListener("click", () => { photos.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb)); photos = []; bigPage = -1; render(); });

/* ---------- Beispielfotos ---------- */
async function samples() {
  const defs = [
    { name: "Beispiel_Verteiler_EG.jpg", dt: { y: 2026, m: 10, d: 7, H: 9, M: 14, S: 0 }, gps: { lat: 49.89176, lon: 10.88695 }, note: "Heizkreisverteiler EG, Stellantriebe montiert", hue: 200, kind: "pipes", marks: [{ t: "circle", x: 575, y: 228, r: 78, c: "#E3242B" }] },
    { name: "Beispiel_Technikraum.jpg", dt: { y: 2026, m: 10, d: 7, H: 9, M: 22, S: 0 }, gps: { lat: 49.89183, lon: 10.88702 }, note: "", hue: 30, kind: "room", marks: [{ t: "num", x: 420, y: 330, r: 34, c: "#E3242B", note: "Speicher ohne Typenschild" }, { t: "num", x: 810, y: 400, r: 34, c: "#E3242B", note: "Dämmung Anschluss fehlt" }] },
    { name: "Beispiel_Fassade_Nord.jpg", dt: { y: 2026, m: 10, d: 7, H: 10, M: 5, S: 0 }, gps: { lat: 49.93031, lon: 10.88044 }, note: "Durchführung Außenwand prüfen", hue: 160, kind: "facade", portrait: true, marks: [{ t: "arrow", x: 450, y: 1080, x2: 640, y2: 870, c: "#FFC400" }] },
    { name: "Beispiel_Schaltschrank.jpg", dt: { y: 2026, m: 10, d: 7, H: 10, M: 41, S: 0 }, gps: null, note: "", hue: 250, kind: "cabinet" },
  ];
  for (const d of defs) {
    const W = d.portrait ? 900 : 1200, H = d.portrait ? 1200 : 900;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, `hsl(${d.hue} 18% 78%)`); grd.addColorStop(1, `hsl(${d.hue} 14% 52%)`);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.lineCap = "round";
    if (d.kind === "pipes") {
      [["#b8423a", 0.32], ["#2f5f9e", 0.5]].forEach(([col, fy]) => { g.strokeStyle = col; g.lineWidth = 46; g.beginPath(); g.moveTo(80, H * fy); g.lineTo(W - 80, H * fy); g.stroke(); });
      for (let i = 0; i < 7; i++) { const x = 170 + i * 135; g.strokeStyle = "#d9dcdc"; g.lineWidth = 22; g.beginPath(); g.moveTo(x, H * 0.32); g.lineTo(x, H * 0.9); g.stroke(); g.fillStyle = "#3a3f40"; g.fillRect(x - 24, H * 0.2, 48, 60); }
    } else if (d.kind === "room") {
      g.fillStyle = "hsl(30 10% 35%)"; g.fillRect(0, H * 0.72, W, H); g.fillStyle = "#e7e4dc"; g.fillRect(W * 0.18, H * 0.22, W * 0.24, H * 0.5); g.fillRect(W * 0.5, H * 0.3, W * 0.3, H * 0.42);
      g.strokeStyle = "#8a8f90"; g.lineWidth = 18; g.beginPath(); g.moveTo(W * 0.3, H * 0.22); g.lineTo(W * 0.3, H * 0.06); g.lineTo(W * 0.95, H * 0.06); g.stroke();
    } else if (d.kind === "facade") {
      g.fillStyle = "hsl(160 6% 86%)"; g.fillRect(W * 0.08, H * 0.08, W * 0.84, H * 0.9);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) { g.fillStyle = "hsl(205 25% 38%)"; g.fillRect(W * (0.18 + k * 0.38), H * (0.14 + r * 0.21), W * 0.26, H * 0.13); }
      g.fillStyle = "#555"; g.beginPath(); g.arc(W * 0.5, H * 0.92, 26, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = "hsl(250 4% 82%)"; g.fillRect(W * 0.2, H * 0.08, W * 0.6, H * 0.86);
      for (let r = 0; r < 4; r++) { g.fillStyle = "#444a4c"; g.fillRect(W * 0.25, H * (0.14 + r * 0.19), W * 0.5, H * 0.04); for (let k = 0; k < 9; k++) { g.fillStyle = k % 3 ? "#d8d8d0" : "#2f6f5e"; g.fillRect(W * 0.26 + k * W * 0.054, H * (0.19 + r * 0.19), W * 0.04, H * 0.09); } }
    }
    g.fillStyle = "rgba(255,255,255,.82)"; g.font = `600 ${Math.round(W / 16)}px sans-serif`; g.fillText("BEISPIEL", W * 0.05, H * 0.95);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    const file = new File([blob], d.name, { type: "image/jpeg", lastModified: Date.now() });
    photos.push({ id: ++uid, file, name: d.name, size: blob.size, dt: d.dt, dtSrc: "exif", gps: d.gps, place: "", placeSrc: "", note: d.note,
      thumb: URL.createObjectURL(blob), w: W, h: H, bw: W, bh: H, rot: 0, crop: null, err: "", busy: false, sample: true, decoded: blob, marks: d.marks || [] });
  }
  render();
  for (const p of photos) if (p.sample) { p.sha = await sha256hex(new Uint8Array(await p.file.arrayBuffer())); queuePlace(p); }
  render();
}

bindSettings();
syncLogo();
$("#logoFile").addEventListener("change", (e) => { if (e.target.files[0]) setLogo(e.target.files[0]); e.target.value = ""; });
$("#logoDel").addEventListener("click", () => { logoData = null; try { localStorage.removeItem("fotoprotokoll.logo"); } catch {} syncLogo(); render(); });
$("#coverTpl").addEventListener("click", () => {
  const d = new Date(), today = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
  const tpl = `## Anlass\nKurze Beschreibung des Termins …\n\n**Datum:** ${today}\n**Ort:** …\n\n### Teilnehmer\n| Name | Firma | Funktion |\n|---|---|---|\n| … | … | … |\n| … | … | … |\n\n### Ergebnis\n- [x] Erledigter Punkt\n- [ ] Offener Punkt\n- [ ] Nächster Termin vereinbaren\n\n---\n*Fotos und Markierungen siehe folgende Seiten.*`;
  const ta = $("#coverText");
  ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, "") + "\n\n" + tpl : tpl;
  cfg.coverText = ta.value; saveCfg(); render(); ta.focus();
});
initFonts();
render();
samples();
})();
