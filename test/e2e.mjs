// End-to-End-Test: öffnet dist/Foto-Protokoll.html in Chromium, erzeugt PDFs und prüft den Inhalt.
// Voraussetzungen: npm run build, npm run fixtures (Python: pillow, piexif), npx playwright install chromium
// Optional: CHROMIUM_PATH=/pfad/zu/chromium für eine vorinstallierte Browser-Binary.
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "test-output");
mkdirSync(out, { recursive: true });
const fixDir = join(root, "test/fixtures");
const fixtures = readdirSync(fixDir).filter((f) => /\.jpe?g$/i.test(f)).sort();
assert.ok(fixtures.length >= 3, "Fixtures fehlen – erst `npm run fixtures` ausführen");

/** Text aus einem pdf-lib-PDF ziehen: Content-Streams entpacken, <hex> Tj dekodieren. */
function pdfText(buf) {
  const s = buf.toString("latin1");
  let txt = "";
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = s.indexOf("endstream", start);
    try {
      const data = inflateSync(buf.subarray(start, end)).toString("latin1");
      for (const t of data.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) txt += Buffer.from(t[1], "hex").toString("latin1") + "\n";
    } catch { /* kein Flate-Stream */ }
  }
  return txt;
}
/** Rohinhalt plus alle entpackten Streams (Objekt-Streams enthalten z. B. die Annotationen). */
function pdfDump(buf) {
  const s = buf.toString("latin1");
  let all = s;
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = s.indexOf("endstream", start);
    try { all += "\n" + inflateSync(buf.subarray(start, end)).toString("latin1"); } catch { /* nicht komprimiert */ }
  }
  return all;
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function offline(page) {
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("pdf-lib.min.js")) return r.fulfill({ path: join(root, "node_modules/pdf-lib/dist/pdf-lib.min.js"), contentType: "text/javascript" });
    if (u.includes("exifr")) return r.fulfill({ path: join(root, "node_modules/exifr/dist/full.umd.js"), contentType: "text/javascript" });
    if (u.startsWith("file:")) return r.continue();
    return r.abort(); // offline testen: Google Fonts, OpenStreetMap
  });
}
async function session(page, setup) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await offline(page);
  await page.goto("file://" + resolve(root, "dist/Foto-Protokoll.html"));
  await page.waitForFunction(() => document.querySelectorAll(".card").length === 4);
  await setup(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#make")]);
  const file = join(out, (await dl.suggestedFilename()).replace(".pdf", `_${Date.now()}.pdf`));
  await dl.saveAs(file);
  assert.deepEqual(errors, [], "JavaScript-Fehler auf der Seite");
  return readFileSync(file);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 900 } });
let failures = 0;
async function test(name, fn) {
  const page = await ctx.newPage();
  try { await fn(page); console.log("ok  ", name); }
  catch (e) { failures++; console.error("FAIL", name, "\n     ", e.message); }
  finally { await page.close(); }
}

const addFixtures = async (page) => {
  await page.setInputFiles("#file", fixtures.map((f) => ({ name: f, mimeType: "image/jpeg", buffer: readFileSync(join(fixDir, f)) })));
  await page.waitForFunction((n) => document.querySelectorAll(".card").length === n && !document.querySelector(".chip")?.textContent.includes("gelesen"), fixtures.length);
  await page.waitForTimeout(1500); // Ortsermittlung (offline)
};

await test("Beispieldaten laden, Fotos lesen, Orte offline ermitteln", async (page) => {
  await offline(page);
  await page.goto("file://" + resolve(root, "dist/Foto-Protokoll.html"));
  await page.waitForFunction(() => document.querySelectorAll(".card").length === 4);
  await addFixtures(page);
  const places = await page.$$eval(".card input[data-f=place]", (els) => els.map((e) => e.value));
  assert.ok(places.includes("Bamberg"), "Bamberg nicht erkannt: " + places);
  assert.ok(places.some((p) => /Pisa/.test(p)), "Pisa nicht erkannt: " + places);
  const facts = await page.$$eval(".card .facts", (els) => els.map((e) => e.textContent).join(" | "));
  assert.match(facts, /13\.09\.2026, 17:40 Uhr/);
});

await test("PDF: Originale bitgenau eingebettet, Prüfsummen, Titelseite, Nummern", async (page) => {
  const pdf = await session(page, async (p) => {
    await addFixtures(p);
    await p.check("#hashes"); await p.check("#coverOn");
    await p.fill("#title", "Testprotokoll Heizung");
    await p.fill("#coverText", "## Teilnehmer\n| Name | Firma |\n|---|---|\n| Max | Aumasys |\n\n- [x] Verteiler geprüft\n- [ ] **Dämmung** offen");
    // nummerierte Markierung mit Notiz auf Foto 1
    await p.click(".card:nth-child(1) .tbtn");
    await p.click("#edTool button[data-v=num]");
    const box = await p.locator("#edSvg").boundingBox();
    await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await p.fill("#mn-0", "Fühler lose");
    await p.click("#edDone");
  });
  for (const f of fixtures) {
    const bytes = readFileSync(join(fixDir, f));
    assert.ok(pdf.indexOf(bytes) >= 0, `Original ${f} nicht bitgenau eingebettet`);
  }
  const text = pdfText(pdf);
  writeFileSync(join(out, "pdf-text.txt"), text);
  for (const f of fixtures) assert.ok(text.includes(sha(readFileSync(join(fixDir, f)))), `SHA-256 von ${f} fehlt`);
  for (const s of ["Testprotokoll Heizung", "Teilnehmer", "Aumasys", "Dämmung", "Foto 1", "Foto 4", "Fühler lose", "Bamberg", "Prüfsummen der Originaldateien (SHA-256)"])
    assert.ok(text.includes(s), `Text fehlt im PDF: ${s}`);
  const dump = pdfDump(pdf);
  assert.equal((dump.match(/\/Type \/EmbeddedFile\b/g) || []).length, fixtures.length + 1, "Anzahl Anhänge (Fotos + Projektdatei)");
  assert.ok(dump.includes("foto-protokoll-projekt.json"), "Projektdatei fehlt im PDF");
  assert.equal((dump.match(/\/Subtype \/FileAttachment/g) || []).length, fixtures.length, "Anzahl Büroklammern");
});

await test("PDF: verkleinerte Originale sind kleiner und behalten Datum/GPS", async (page) => {
  const pdf = await session(page, async (p) => {
    await addFixtures(p);
    await p.check("#cmp"); await p.selectOption("#cmpEdge", "1600"); await p.check("#capFile");
  });
  const total = fixtures.reduce((s, f) => s + readFileSync(join(fixDir, f)).length, 0);
  assert.ok(pdf.length < total, `PDF (${pdf.length}) nicht kleiner als Originale (${total})`);
  const text = pdfText(pdf);
  assert.ok(text.includes("verkleinert auf"), "Hinweis auf Verkleinerung fehlt");
  // EXIF-Kennungen der verkleinerten Fassung: Datum als ASCII im APP1-Segment
  assert.ok(pdf.indexOf(Buffer.from("2026:09:20 10:01:02")) >= 0, "Aufnahmedatum fehlt in verkleinerter Datei");
});

await test("Drehen und Ausschnitt: Markierungen folgen, Originale bleiben bitgenau", async (page) => {
  const card = ".card:nth-child(1)";
  const ratio = (sel) => page.$eval(sel, (el) => { const [a, b] = el.style.aspectRatio.split("/").map(Number); return a / b; });
  const markPos = async () => { await page.waitForSelector(`${card} svg.marks`); return markPos0(); };
  const markPos0 = () => page.$eval(`${card} svg.marks`, (svg) => {
    const [, , w, h] = svg.getAttribute("viewBox").split(" ").map(Number), c = svg.querySelector("circle");
    return { x: +c.getAttribute("cx") / w, y: +c.getAttribute("cy") / h };
  });
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
  const pdf = await session(page, async (p) => {
    await addFixtures(p);
    await p.uncheck("#cmp"); // Einstellung stammt aus dem vorigen Test (gemeinsamer localStorage)
    const r0 = await ratio(`${card} .tbtn`);
    // Nummer bei 40 % / 40 % setzen
    await p.click(`${card} .tbtn`);
    await p.click("#edTool button[data-v=num]");
    let box = await p.locator("#edSvg").boundingBox();
    await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await p.fill("#mn-0", "Fühler lose");
    await p.click("#edDone");
    near((await markPos()).x, 0.4, "Marke x vor Drehung"); near((await markPos()).y, 0.4, "Marke y vor Drehung");
    // rechts drehen: Seitenverhältnis kehrt sich um, Marke wandert nach (60 %, 40 %)
    await p.click(`${card} button[data-a=rotr]`);
    await p.waitForFunction(([sel, r]) => { const [a, b] = document.querySelector(sel).style.aspectRatio.split("/").map(Number); return Math.abs(a / b - 1 / r) < 0.01; }, [`${card} .tbtn`, r0]);
    await p.waitForTimeout(300);
    near((await markPos()).x, 0.6, "Marke x nach Drehung"); near((await markPos()).y, 0.4, "Marke y nach Drehung");
    // Ausschnitt links: Marke liegt außerhalb und verschwindet
    const crop = async (x0, x1) => {
      await p.click(`${card} .tbtn`);
      await p.click("#edCrop");
      await p.waitForFunction(() => document.querySelector("#edCrop").getAttribute("aria-pressed") === "true");
      await p.waitForTimeout(200);
      box = await p.locator("#edSvg").boundingBox();
      await p.mouse.move(box.x + box.width * x0, box.y + box.height * 0.1);
      await p.mouse.down(); await p.mouse.move(box.x + box.width * x1, box.y + box.height * 0.9, { steps: 5 }); await p.mouse.up();
      await p.waitForFunction(() => !document.querySelector("#edCropReset").disabled && document.querySelector("#edCrop").getAttribute("aria-pressed") === "false");
      await p.click("#edDone");
    };
    await crop(0.05, 0.45);
    assert.equal((await p.textContent(`${card} .tbtn .mk`)).trim(), "Markieren", "Marke sollte außerhalb des Ausschnitts liegen");
    // Ausschnitt rechts, Marke ist wieder sichtbar
    await crop(0.3, 0.95);
    assert.match(await p.textContent(`${card} .tbtn .mk`), /1 Markierung/);
    assert.ok((await ratio(`${card} .tbtn`)) > 0, "Seitenverhältnis");
    // der Ausschnitt wird größer aus dem Original gerechnet (nicht nur die 640 px des ganzen Fotos)
    const px = await p.$eval(`${card} img.thumb`, (im) => Math.max(im.naturalWidth, im.naturalHeight));
    assert.ok(px > 700, `Vorschau des Ausschnitts zu klein: ${px} px`);
  });
  for (const f of fixtures) assert.ok(pdf.indexOf(readFileSync(join(fixDir, f))) >= 0, `Original ${f} nicht bitgenau eingebettet`);
  assert.ok(pdfText(pdf).includes("Fühler lose"), "Notiz zur sichtbaren Marke fehlt im PDF");
});

// ---- PDF erneut öffnen: Einstellungen, Notizen, Markierungen, Drehung und Ausschnitt kommen zurück ----
async function openPdf(page, pdf) {
  await offline(page);
  await page.goto("file://" + resolve(root, "dist/Foto-Protokoll.html"));
  await page.waitForFunction(() => document.querySelectorAll(".card").length === 4);
  await page.setInputFiles("#file", [{ name: "projekt.pdf", mimeType: "application/pdf", buffer: pdf }]);
}
const cardNames = (page) => page.$$eval(".card .fname", (els) => els.map((e) => e.textContent.trim()));
const aspect = (page, sel) => page.$eval(sel, (el) => { const [a, b] = el.style.aspectRatio.split("/").map(Number); return a / b; });

await test("PDF erneut öffnen: alles wird aus den eingebetteten Originalen wiederhergestellt", async (page) => {
  const card = ".card:nth-child(1)";
  let names, ratio;
  const pdf = await session(page, async (p) => {
    await addFixtures(p);
    await p.uncheck("#cmp"); await p.check("#embed"); await p.check("#projData");
    await p.fill("#title", "Wiederherstellung Test"); await p.click("#per button[data-v='2']");
    await p.fill(".card:nth-child(2) input[data-f=note]", "Notiz zum zweiten Foto");
    await p.fill(`${card} input[data-f=place]`, "Teststraße 5, Bamberg");
    await p.click(`${card} button[data-a=rotr]`);
    await p.waitForTimeout(500);
    await p.click(`${card} .tbtn`); await p.click("#edTool button[data-v=num]");
    const box = await p.locator("#edSvg").boundingBox();
    await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await p.fill("#mn-0", "Fühler lose"); await p.click("#edDone");
    await p.waitForTimeout(300);
    names = await cardNames(p); ratio = await aspect(p, `${card} .tbtn`);
  });
  const p2 = await ctx.newPage();
  try {
    const errors = []; p2.on("pageerror", (e) => errors.push(e.message));
    await openPdf(p2, pdf);
    await p2.waitForFunction((n) => [...document.querySelectorAll(".card .fname")].map((e) => e.textContent.trim()).join("|") === n && ![...document.querySelectorAll(".card .chip")].some((c) => c.textContent.includes("wird gelesen")), names.join("|"));
    await p2.waitForTimeout(600);
    assert.equal(await p2.inputValue("#title"), "Wiederherstellung Test");
    assert.equal(await p2.getAttribute("#per button[data-v='2']", "aria-pressed"), "true");
    assert.equal(await p2.inputValue(".card:nth-child(2) input[data-f=note]"), "Notiz zum zweiten Foto");
    assert.equal(await p2.inputValue(`${card} input[data-f=place]`), "Teststraße 5, Bamberg");
    assert.ok(Math.abs((await aspect(p2, `${card} .tbtn`)) - ratio) < 0.01, "Drehung nicht wiederhergestellt");
    assert.match(await p2.textContent(`${card} .tbtn .mk`), /1 Markierung/);
    await p2.click(`${card} .tbtn`);
    assert.equal(await p2.inputValue("#mn-0"), "Fühler lose");
    await p2.click("#edDone");
    // wieder als PDF ausgeben: die Originale sind bitgenau enthalten
    const [dl] = await Promise.all([p2.waitForEvent("download"), p2.click("#make")]);
    const file = join(out, "wiederhergestellt_" + Date.now() + ".pdf"); await dl.saveAs(file);
    const pdf2 = readFileSync(file);
    for (const f of fixtures) assert.ok(pdf2.indexOf(readFileSync(join(fixDir, f))) >= 0, `Original ${f} nach Wiederherstellung nicht bitgenau`);
    assert.ok(pdfText(pdf2).includes("Fühler lose"), "Notiz fehlt im neuen PDF");
    assert.deepEqual(errors, [], "JavaScript-Fehler auf der Seite");
  } finally { await p2.close(); }
});

await test("PDF erneut öffnen ohne eingebettete Fotos: Zuordnung über die Prüfsumme", async (page) => {
  const pdf = await session(page, async (p) => {
    await addFixtures(p);
    await p.uncheck("#embed"); await p.check("#projData");
    await p.fill(".card:nth-child(2) input[data-f=note]", "Nur Daten, keine Fotos");
  });
  assert.ok(fixtures.every((f) => pdf.indexOf(readFileSync(join(fixDir, f))) < 0), "Fotos sollten nicht eingebettet sein");
  const p2 = await ctx.newPage();
  try {
    await openPdf(p2, pdf);
    await p2.waitForSelector("#toast:not([hidden])");
    assert.match(await p2.textContent("#toast"), /Zieh die Originalfotos/);
    await p2.setInputFiles("#file", fixtures.map((f) => ({ name: f, mimeType: "image/jpeg", buffer: readFileSync(join(fixDir, f)) })));
    await p2.waitForFunction((n) => document.querySelectorAll(".card").length === n && ![...document.querySelectorAll(".card .chip")].some((c) => /wird gelesen|Beispiel/.test(c.textContent)), fixtures.length);
    await p2.waitForTimeout(600);
    const notes = await p2.$$eval(".card input[data-f=note]", (els) => els.map((e) => e.value));
    assert.ok(notes.includes("Nur Daten, keine Fotos"), "Bemerkung nicht zugeordnet: " + notes);
  } finally { await p2.close(); }
});

await test("PDF ohne Projektdaten wird erkannt, Schalter 'Bearbeitungsdaten' abwählbar", async (page) => {
  const pdf = await session(page, async (p) => { await addFixtures(p); await p.uncheck("#projData"); });
  assert.ok(!pdfDump(pdf).includes("foto-protokoll-projekt.json"), "Projektdatei sollte fehlen");
  const p2 = await ctx.newPage();
  try {
    await openPdf(p2, pdf);
    await p2.waitForSelector("#toast:not([hidden])");
    assert.match(await p2.textContent("#toast"), /keine Bearbeitungsdaten/);
  } finally { await p2.close(); }
});

// ---- Wetter: Bright Sky (DWD) in Deutschland, Open-Meteo sonst (beide mit Testantworten) ----
const CORS = { "access-control-allow-origin": "*" };
async function wxMocks(page) {
  const calls = { bs: 0, om: 0 };
  await page.route(/api\.brightsky\.dev\//, (r) => {
    calls.bs++;
    const u = new URL(r.request().url()), lat = +u.searchParams.get("lat"), lon = +u.searchParams.get("lon"), ts = u.searchParams.get("date");
    if (!(lat > 47 && lat < 55.1 && lon > 5.8 && lon < 15.1)) return r.fulfill({ status: 404, contentType: "application/json", headers: CORS, body: JSON.stringify({ detail: "No sources match your criteria" }) });
    r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ weather: [{ timestamp: ts + ":00+02:00", source_id: 1, precipitation: 0.2, pressure_msl: 1012.8, sunshine: 0,
      temperature: 12.8, wind_direction: 240, wind_speed: 9, cloud_cover: 100, dew_point: 10.5, relative_humidity: 86, visibility: 64680, wind_gust_speed: 18.7, condition: "rain", icon: "rain" }],
      sources: [{ id: 1, station_name: "Bamberg", distance: 2806 }] }) });
  });
  await page.route(/open-meteo\.com\//, (r) => {
    calls.om++;
    const day = new URL(r.request().url()).searchParams.get("start_date"), hours = Array.from({ length: 24 }, (_, i) => `${day}T${String(i).padStart(2, "0")}:00`), col = (v) => hours.map(() => v);
    r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ hourly: { time: hours, temperature_2m: col(21.4), apparent_temperature: col(22.9), relative_humidity_2m: col(56),
      dew_point_2m: col(11.8), precipitation: col(0), snowfall: col(0), weather_code: col(3), pressure_msl: col(1013.1), cloud_cover: col(100), visibility: col(40500), wind_speed_10m: col(7),
      wind_direction_10m: col(162), wind_gusts_10m: col(20), sunshine_duration: col(1800), is_day: col(1) } }) });
  });
  return calls;
}
const wxValues = (page) => page.$$eval(".card input[data-f=weather]", (els) => els.map((e) => e.value));

await test("Wetter: DWD in Deutschland, Open-Meteo im Ausland, im PDF und nach dem erneuten Öffnen", async (page) => {
  let before;
  const pdf = await session(page, async (p) => {
    await wxMocks(p);
    await addFixtures(p);
    await p.uncheck("#cmp"); await p.check("#embed"); await p.check("#projData");
    await p.check("#capWeather");
    await p.waitForFunction(() => { const v = [...document.querySelectorAll(".card input[data-f=weather]")].map((e) => e.value); return v.some((x) => x.includes("DWD Station Bamberg (2,8 km)")) && v.some((x) => x.includes("Open-Meteo")); });
    before = await wxValues(p);
    const full = before.find((x) => x.includes("DWD"));
    for (const s of ["Wetter: Regen", "12,8 °C", "Wind 9 km/h aus WSW", "Böen 19 km/h", "Niederschlag 0,2 mm/h", "Luftfeuchte 86 %", "Taupunkt 10,5 °C", "Bewölkung 100 %", "Luftdruck 1013 hPa", "Sicht 64,7 km"])
      assert.ok(full.includes(s), `Wetterwert fehlt: ${s} in ${full}`);
    const om = before.find((x) => x.includes("Open-Meteo"));
    for (const s of ["Wetter: bedeckt", "21,4 °C (gefühlt 22,9 °C)", "Wind 7 km/h aus SSO", "Sonne 30 min/h"]) assert.ok(om.includes(s), `Wetterwert fehlt: ${s} in ${om}`);
    // kurzer Umfang
    await p.selectOption("#wxDetail", "short");
    await p.waitForFunction(() => [...document.querySelectorAll(".card input[data-f=weather]")].some((e) => e.value.includes("(DWD)") && !e.value.includes("Luftdruck")));
    await p.selectOption("#wxDetail", "full");
    await p.waitForFunction(() => [...document.querySelectorAll(".card input[data-f=weather]")].some((e) => e.value.includes("Luftdruck")));
    before = await wxValues(p);
    await p.waitForTimeout(400);
  });
  const text = pdfText(pdf);
  assert.ok(text.includes("Wetter: Regen"), "Wetter (DWD) fehlt im PDF");
  assert.ok(text.includes("Wetter: bedeckt"), "Wetter (Open-Meteo) fehlt im PDF");
  const p2 = await ctx.newPage();
  try {
    const calls = await wxMocks(p2);
    await openPdf(p2, pdf);
    await p2.waitForFunction((n) => [...document.querySelectorAll(".card input[data-f=weather]")].map((e) => e.value).join("|") === n, before.join("|"));
    await p2.waitForTimeout(800);
    assert.equal(calls.bs + calls.om, 0, "Wetter wurde nach dem Öffnen erneut abgefragt");
    assert.equal(await p2.isChecked("#capWeather"), true);
  } finally { await p2.close(); }
});

await test("Wetter: ohne Netz erscheint ein Hinweis, manuelle Eingabe bleibt", async (page) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await offline(page);
  await page.goto("file://" + resolve(root, "dist/Foto-Protokoll.html"));
  await page.waitForFunction(() => document.querySelectorAll(".card").length === 4);
  await addFixtures(page);
  await page.uncheck("#capWeather"); await page.check("#capWeather");
  await page.waitForSelector("#toast:not([hidden])");
  assert.match(await page.textContent("#toast"), /Wetterdaten sind hier nicht erreichbar/);
  const gpsCard = page.locator(".card", { hasText: "Ort:" }).first(); // eine Karte mit GPS
  await gpsCard.locator("input[data-f=weather]").fill("Wetter: trocken, 18 °C");
  await page.waitForTimeout(500);
  assert.equal(await gpsCard.locator("input[data-f=weather]").inputValue(), "Wetter: trocken, 18 °C", "manuelle Eingabe wurde überschrieben");
  assert.match(await gpsCard.textContent(), /Wetter: manuell/);
  assert.deepEqual(errors, [], "JavaScript-Fehler auf der Seite");
});

await test("Manipuliertes Projekt-PDF: Schadcode in den Daten wird nicht ausgeführt", async (page) => {
  const { PDFDocument } = await import("pdf-lib");
  const evil = "<img src=x onerror=window.__pwn=1>";
  const doc = await PDFDocument.create(); doc.addPage();
  await doc.attach(readFileSync(join(fixDir, fixtures[0])), "0001 a.jpg", { mimeType: "image/jpeg" });
  const proj = { app: "Foto-Protokoll", format: 1, cfg: { title: evil, fmt: "A99", per: 7, dpi: "1", capWeather: true, wxDetail: "<script>" }, logo: { data: "javascript:window.__pwn=1", w: 5, h: 5 },
    photos: [{ i: 0, name: evil + ".jpg", att: "0001", place: evil, placeSrc: "manual", note: evil, weather: evil, weatherSrc: "manual", wx: { src: "openmeteo", cond: evil, t: "<b>", station: evil }, rot: 9, crop: { x: -5, y: 0, w: 1e9, h: 5 },
      dt: { y: "<b>", m: 1, d: 1, H: 1, M: 1, S: 1 }, gps: { lat: "x", lon: 1 },
      marks: [{ t: "circle", x: 10, y: 10, r: 5, c: '"/><script>window.__pwn=1</script>' }, { t: "num", x: 5, y: 5, r: 5, c: "#E3242B", note: evil }, { t: "arrow", x: "a" }] }] };
  await doc.attach(Buffer.from(JSON.stringify(proj)), "foto-protokoll-projekt.json", { mimeType: "application/json" });
  const pdf = Buffer.from(await doc.save());
  await offline(page);
  await page.goto("file://" + resolve(root, "dist/Foto-Protokoll.html"));
  await page.waitForFunction(() => document.querySelectorAll(".card").length === 4);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setInputFiles("#file", [{ name: "x.pdf", mimeType: "application/pdf", buffer: pdf }]);
  await page.waitForFunction(() => document.querySelectorAll(".card").length === 1 && ![...document.querySelectorAll(".card .chip")].some((c) => c.textContent.includes("wird gelesen")));
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__pwn), undefined, "Schadcode wurde ausgeführt");
  assert.equal(await page.$$eval("#list img[src=x], #pages img[src=x], #list script", (e) => e.length), 0, "eingeschleustes Element im DOM");
  assert.match(await page.textContent(".card .fname"), /<img src=x/, "Name sollte als Text erscheinen");
  assert.match(await page.textContent(`.card .tbtn .mk`), /1 Markierung/, "nur die gültige Marke bleibt");
  assert.equal(await page.inputValue("#fmt"), "A4", "ungültiges Format nicht zurückgesetzt");
  assert.deepEqual(errors, [], "JavaScript-Fehler auf der Seite");
});

await browser.close();
if (failures) { console.error(`${failures} Test(s) fehlgeschlagen`); process.exit(1); }
console.log("Alle Tests bestanden.");
