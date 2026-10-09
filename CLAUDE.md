# Hinweise für die Weiterentwicklung

Diese Datei liest Claude (Claude Code / Cowork) automatisch, wenn im Projektordner gearbeitet wird.

## Arbeitsweise

- Sprache von Oberfläche, Kommentaren, Doku und Commit-Nachrichten: Deutsch.
- Quellcode liegt in `src/` (HTML-Gerüst, CSS, JS). `dist/` wird mit `npm run build` erzeugt und **mit eingecheckt**, damit sich die fertige Datei direkt herunterladen lässt.
- Vor jedem Commit `npm test` ausführen (baut automatisch). Bei sichtbaren Änderungen die Bilder in `docs/` mit `node test/screenshots.mjs` neu erzeugen.
- Version in `package.json` erhöhen und `CHANGELOG.md` ergänzen. Die Versionsnummer erscheint unten in der Seitenleiste.
- Architektur: siehe `docs/ARCHITEKTUR.md`.

## Feste Regeln

- Vorschau und PDF entstehen **immer** aus dem gemeinsamen Seitenmodell (`buildModel()` → `pageHtml()` / `buildPdf()`). Keine zweite Layout-Logik einführen.
- Originaldateien werden nie verändert. Markierungen nur als Vektor im PDF, nie ins Bild oder ins eingebettete Original.
- Externe Bibliotheken nur als einzelnes UMD-Skript von cdnjs, jsDelivr oder unpkg (Bedingung der Claude-Artifact-Variante). Alles andere inline.
- Neue Funktionen sind optional und abschaltbar; Einstellungen wandern in `DEFAULTS` und werden über `bindSettings()` gemerkt.

## Erkenntnisse und Stolpersteine

- **Claude-Artifact (claude.ai):** Die Seite läuft dort mit strenger CSP. `fetch` zu fremden Servern (OpenStreetMap) ist blockiert. Deshalb gibt es die Offline-Ortsliste, und das Tool schaltet nach dem ersten Fehlschlag automatisch um. Downloads gehen nur über die Capability `downloads` (`window.claude.use("downloads")`), `<a download>` ist dort wirkungslos. Veröffentlicht wird `dist/artifact.html` (ohne `<html>`/`<head>`) mit `capabilities: {downloads: true}`.
- **Lokal / GitHub Pages:** OpenStreetMap Nominatim funktioniert (CORS erlaubt), liefert Straße, Hausnummer und PLZ. Nutzungsregeln: max. 1 Anfrage/s, Quellenangabe © OpenStreetMap ist in der Oberfläche vorhanden. Aus `file://` heraus ist das noch nicht mit echtem Netz getestet.
- **PDF-Anhänge:** Der PDF-Viewer von Chrome und Edge zeigt eingebettete Dateien nicht an. Acrobat, Foxit, PDF-XChange und Firefox zeigen sie an. Anhänge werden doppelt verknüpft (Annotation `FileAttachment` + `/Names /EmbeddedFiles`).
- **pdf-lib:** Standardschriften kennen nur WinAnsi. `clean()` ersetzt andere Zeichen (ł → l, → → ->), sonst wirft `drawText`. `drawSvgPath` skaliert auch die Linienbreite mit `scale`. Annotationen landen mit `useObjectStreams` in komprimierten Objekt-Streams (wichtig für Tests).
- **EXIF:** Datum über `exifr.parse(..., {reviveValues:false})` als Rohtext lesen, sonst verschiebt die Zeitzone die Uhrzeit. `createImageBitmap` wendet die EXIF-Orientierung automatisch an; beim Verkleinern deshalb Orientierung im übernommenen EXIF auf 1 setzen.
- **HEIC (iPhone):** Chrome kann HEIC nicht dekodieren; heic2any wird bei Bedarf von jsDelivr nachgeladen. Mit echten iPhone-Fotos auf der Webseite getestet, funktioniert.
- **`localStorage`** bei `file://`: In Chrome teilen sich alle lokalen Dateien einen Speicher. Der zuletzt benutzte Titel erscheint wieder; das ist so gewollt (bewusst so belassen).
- **Preview-Text:** `.sheet .t` braucht `white-space: pre`, sonst schrumpfen Mehrfach-Leerzeichen („Foto 1  ·  Datum“).
- **Playwright-Tests:** `setInputFiles` mit Dateipfaden verliert Dateien mit Umlauten im Namen → Dateien als `{name, mimeType, buffer}` übergeben. In der Cowork-Sandbox liegt Chromium unter `/opt/pw-browsers/chromium` (`CHROMIUM_PATH=… npm test`).
- **Ortsliste:** GeoNames-Daten (CC BY 4.0) aus dem npm-Paket `cities.json`, Namen teils englisch („Copenhagen“). Nur Orte, keine Straßen – Straßen gehen nur online.

## Repository und Veröffentlichung

- GitHub: https://github.com/simsum/foto-protokoll (öffentlich, MIT). Webseite über GitHub Pages: https://simsum.github.io/foto-protokoll/ (Workflow `pages.yml`, veröffentlicht `dist/Foto-Protokoll.html` bei jedem Push auf `main`). `ci.yml` führt die Tests aus.
- Es wird nur von diesem Rechner aus gepusht, direkt auf `main`. Commit-Adresse (nur in diesem Repo gesetzt): GitHub-noreply von `simsum`.
- `git push` läuft über einen Terminal-Tab der App (Anmeldung über den Git Credential Manager im Browser); aus der Werkzeug-Shell sind keine Login-Abfragen möglich.
- Der Projektordner liegt in Resilio Sync. Bewusst ohne Ausschlussliste belassen.

## Windows

- Node und Git sind installiert, in bereits offenen Terminals ggf. neu starten (PATH).
- `npm run fixtures` ruft `python3` auf und scheitert unter Windows am Microsoft-Store-Alias. Stattdessen `python test/make-fixtures.py` ausführen (benötigt `pillow` und `piexif`).
