// Erzeugt die Bilder für die Dokumentation in docs/ (npm run build vorher).
import { chromium } from "playwright";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1360, height: 880 }, deviceScaleFactor: 1.5 });
await page.route("**/*", (r) => {
  const u = r.request().url();
  if (u.includes("pdf-lib.min.js")) return r.fulfill({ path: join(root, "node_modules/pdf-lib/dist/pdf-lib.min.js"), contentType: "text/javascript" });
  if (u.includes("exifr")) return r.fulfill({ path: join(root, "node_modules/exifr/dist/full.umd.js"), contentType: "text/javascript" });
  return u.startsWith("file:") ? r.continue() : r.abort();
});
await page.goto("file://" + resolve(root, "dist/Foto-Protokoll.html"));
await page.waitForTimeout(1500);
await page.screenshot({ path: join(root, "docs/oberflaeche.png") });

await page.addStyleTag({ content: ".bar{display:none!important}" }); // fixierte Kopfleiste würde Element-Screenshots überdecken
await page.click(".sheet[data-page='0']"); await page.waitForTimeout(300);
await page.locator(".pagewrap.big .sheet").screenshot({ path: join(root, "docs/beispielseite.png") });

await page.click(".card:nth-child(2) .tbtn"); await page.waitForTimeout(500);
await page.screenshot({ path: join(root, "docs/markieren.png") });
await page.click("#edDone");

await page.check("#coverOn");
await page.click("#coverTpl"); await page.waitForTimeout(400); // Seite 1 ist noch vergrößert und zeigt jetzt die Titelseite
await page.locator(".pagewrap.big .sheet").screenshot({ path: join(root, "docs/titelseite.png") });
await browser.close();
console.log("docs/*.png aktualisiert");
