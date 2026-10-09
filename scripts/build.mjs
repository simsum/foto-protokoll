// Baut aus src/ eine einzelne, eigenständige HTML-Datei.
//   dist/Foto-Protokoll.html  – vollständiges Dokument (lokal öffnen, GitHub Pages)
//   dist/artifact.html        – nur Inhalt ohne <html>/<head> (für die Veröffentlichung als Claude-Artifact)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const pkg = JSON.parse(read("package.json"));

const body = read("src/index.html")
  .replace("/*__STYLES__*/", () => read("src/styles.css").trimEnd())
  .replace("/*__APP__*/", () => read("src/app.js").trimEnd())
  .replace("__ORTE_B64__", () => read("data/orte.b64").trim())
  .replace("__VERSION__", "v" + pkg.version);

const head = '<!doctype html><html lang="de"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + "<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>"
  + "</head><body>";

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/artifact.html"), body);
writeFileSync(join(root, "dist/Foto-Protokoll.html"), head + body + "</body></html>\n");
console.log(`dist/ gebaut – v${pkg.version}, ${(body.length / 1e6).toFixed(2)} MB`);
