# Übergabe – Stand 08.10.2026 (v0.4.0)

## Was fertig ist

- Tool mit allen Funktionen aus dem [CHANGELOG](CHANGELOG.md): Fotos → PDF mit Datum, Uhrzeit, GPS, Ort, Fotonummern, Markierungen (Kreis, Pfeil, Nummer + Notiz), Firmenlogo, Titelseite mit Markdown, eingebettete (optional verkleinerte) Originale, SHA-256-Prüfsummenseite.
- Fertige Datei zum direkten Benutzen: `dist/Foto-Protokoll.html` (doppelklicken).
- Automatische Tests (`test/e2e.mjs`) – zuletzt alle bestanden.
- Doku: `README.md`, `docs/ARCHITEKTUR.md`, `CHANGELOG.md`, Entwicklungsnotizen in `CLAUDE.md`.
- Vorbereitet, aber noch nie auf GitHub gelaufen: `.github/workflows/ci.yml` (Tests) und `pages.yml` (Veröffentlichung als Webseite).

## Auf dem neuen Rechner einrichten

Voraussetzungen: [Node.js 22](https://nodejs.org/), Python 3, Git.

```bash
cd foto-protokoll
npm install
pip install pillow piexif
npm run fixtures
npx playwright install chromium
npm test
```

Mit Claude weiterarbeiten: Ordner `foto-protokoll` in Claude (Cowork oder Claude Code) öffnen bzw. verbinden. Claude liest dann `CLAUDE.md` mit allen Regeln und Erkenntnissen.

## Offene Punkte

1. **GitHub** – Konto war in der bisherigen Sitzung nicht verbunden. Entschieden: persönliches Konto, öffentlich, MIT-Lizenz.
   ```bash
   git init -b main
   git add .
   git commit -m "Foto-Protokoll v0.4.0"
   # leeres öffentliches Repository "foto-protokoll" auf github.com anlegen (ohne README), dann:
   git remote add origin https://github.com/simsum/foto-protokoll.git
   git push -u origin main
   ```
   Vorher überlegen, mit welcher E-Mail committet wird (`git config user.email`). Bei einem öffentlichen Repo bietet sich die GitHub-noreply-Adresse an (GitHub → Settings → Emails).
2. **GitHub Pages** einschalten: Repository → Settings → Pages → Source: „GitHub Actions“. Danach ist das Tool unter `https://simsum.github.io/foto-protokoll/` erreichbar, mit Straßenadressen über OpenStreetMap.
3. **Testen mit echten Daten:** iPhone-Fotos (HEIC) und die OpenStreetMap-Abfrage aus der lokalen Datei sind noch ungetestet.
4. **Claude-Artifact** auf claude.ai (privat, Version 4) entspricht v0.4.0. Bei Änderungen `dist/artifact.html` neu veröffentlichen (siehe `CLAUDE.md`). Link: https://claude.ai/artifact/Kaj9KAxqtwM9NciN4jzapa
