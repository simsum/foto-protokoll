# Übergabe – Stand 09.10.2026 (v0.4.0)

## Was fertig ist

- Tool mit allen Funktionen aus dem [CHANGELOG](CHANGELOG.md): Fotos → PDF mit Datum, Uhrzeit, GPS, Ort, Fotonummern, Markierungen (Kreis, Pfeil, Nummer + Notiz), Firmenlogo, Titelseite mit Markdown, eingebettete (optional verkleinerte) Originale, SHA-256-Prüfsummenseite.
- Fertige Datei zum direkten Benutzen: `dist/Foto-Protokoll.html` (doppelklicken).
- Automatische Tests (`test/e2e.mjs`) – lokal und auf GitHub (`ci.yml`) bestanden.
- Doku: `README.md`, `docs/ARCHITEKTUR.md`, `CHANGELOG.md`, Entwicklungsnotizen in `CLAUDE.md`.
- Veröffentlicht auf GitHub: https://github.com/simsum/foto-protokoll
- Webseite über GitHub Pages: https://simsum.github.io/foto-protokoll/
- HEIC-Fotos (iPhone) auf der Webseite getestet, funktioniert.

## Entwicklungsrechner

Node.js, Git, Python 3 (mit `pillow`, `piexif`) und Playwright-Chromium sind installiert. Tests:

```bash
python test/make-fixtures.py   # nur nötig, wenn test/fixtures fehlt
npm test
```

Mit Claude weiterarbeiten: Ordner in Claude (Cowork oder Claude Code) öffnen. Claude liest `CLAUDE.md` mit allen Regeln und Erkenntnissen. Gepusht wird nur von diesem Rechner, siehe `CLAUDE.md`.

## Offene Punkte

1. **OpenStreetMap-Abfrage** aus der lokalen Datei (`file://`) ist noch nicht mit echtem Netz getestet. Auf der Webseite ist sie nutzbar.
2. **Claude-Artifact** auf claude.ai (privat, Version 4) entspricht v0.4.0. Bei Änderungen `dist/artifact.html` neu veröffentlichen (siehe `CLAUDE.md`). Link: https://claude.ai/artifact/Kaj9KAxqtwM9NciN4jzapa
