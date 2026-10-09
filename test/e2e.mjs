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
  assert.equal((dump.match(/\/Type \/EmbeddedFile\b/g) || []).length, fixtures.length, "Anzahl Anhänge");
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

await browser.close();
if (failures) { console.error(`${failures} Test(s) fehlgeschlagen`); process.exit(1); }
console.log("Alle Tests bestanden.");
