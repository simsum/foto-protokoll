# Architektur

Das Tool ist bewusst eine einzige, eigenständige HTML-Datei ohne Framework und ohne Server. `scripts/build.mjs` setzt sie aus `src/` und `data/` zusammen.

## Ablauf

```
Fotos (File)  ──►  EXIF lesen (exifr)  ──►  Foto-Objekt  ──►  Seitenmodell  ──►  Vorschau (HTML)
                   Vorschaubild, SHA-256        │                   │
                   Ort (OSM / offline)           │                   └──►  PDF (pdf-lib)
                                                 └── Markierungen, Notizen, Ort (Editor / Liste)
```

### Foto-Objekt (`photos[]` in `app.js`)

| Feld | Inhalt |
|---|---|
| `file` | Originaldatei, wird nie verändert |
| `dt`, `dtSrc` | Aufnahmezeit als `{y,m,d,H,M,S}`, Quelle `exif` oder `datei` (Änderungsdatum) |
| `gps` | `{lat, lon}` oder `null` |
| `place`, `placeSrc` | Ortsangabe; Quelle `osm`, `offline` oder `manual` (manuelle Eingabe gewinnt immer) |
| `w`, `h`, `thumb`, `decoded` | Maße des gedrehten Bildes, Vorschau-URL, dekodierbarer Blob (HEIC → JPEG) |
| `marks` | Markierungen in Bildpixeln: `circle {x,y,r}`, `arrow {x,y (Spitze), x2,y2}`, `num {x,y,r,note}`, jeweils mit Farbe `c` |
| `note`, `sha` | Bemerkung, SHA-256 der Originaldatei |

### Seitenmodell (`buildModel()`)

Vorschau und PDF werden aus **einer** Seitenbeschreibung erzeugt, damit beide garantiert gleich aussehen. Ein Modell ist eine Liste von Seiten `{W, H, kind, ops}`. Maße sind in Punkt (1/72 Zoll), der Ursprung liegt oben links.

| Operation | Bedeutung |
|---|---|
| `t` | Text (`x`, `y` = Oberkante, Größe `s`, Schrift `f`: R, B, I, BI, C, Farbe `c`) |
| `img` | Foto mit Rahmen und Markierungen |
| `clip` | Büroklammer; im PDF wird hier der Anhang erzeugt |
| `link` | Klickbarer Bereich (GPS → OpenStreetMap) |
| `badge` | Nummernkreis in der Notizliste |
| `rule`, `rect`, `box` | Linie, gefülltes Rechteck, Checkbox |
| `logo` | Firmenlogo |

`pageHtml()` setzt die Operationen als absolut positionierte Elemente um (Schriftgrößen in `cqw`), `buildPdf()` zeichnet sie mit pdf-lib.

Textbreiten misst das Tool mit den Metriken der PDF-Standardschriften (Helvetica, Courier), die beim Start über pdf-lib geladen werden (`initFonts()`). Umbrüche in Vorschau und PDF sind deshalb identisch. Zeichen außerhalb von WinAnsi ersetzt `clean()` durch die nächstliegende Form.

Seitenarten in Reihenfolge: Titelseite(n) (`coverPages()`), Fotoseiten, Prüfsummenseite(n) (`hashPages()`). Die Fußzeile kommt zum Schluss, weil erst dann die Gesamtseitenzahl feststeht.

### PDF-Besonderheiten

- **Anhänge:** Jede Originaldatei wird als `EmbeddedFile`-Stream unkomprimiert gespeichert und zweifach verknüpft: über eine `FileAttachment`-Annotation (Büroklammer) und über den Namensbaum `/Names /EmbeddedFiles` (Anhang-Leiste). Zusätzlich gibt es einen `/AF`-Eintrag mit `AFRelationship` `Source` bzw. `Alternative`.
- **Verkleinerte Originale:** Neu kodiertes JPEG. Bei JPEG-Quellen wird das komplette EXIF-Segment (APP1) übernommen und nur die Orientierung auf 1 gesetzt. Bei HEIC und PNG schreibt `buildExif()` ein minimales EXIF mit Aufnahmezeit und GPS.
- **Markierungen** sind Vektorpfade (`drawSvgPath`) über dem Bild, nicht ins Bild gerechnet.

### Ortsermittlung

1. **OpenStreetMap Nominatim** (`reverse`, `zoom=18`): höchstens eine Anfrage pro Sekunde, Ergebnisse werden pro ~10 m zwischengespeichert. Schlägt die erste Anfrage fehl (offline, oder Sperre wie im Claude-Artifact), schaltet das Tool für die Sitzung auf offline um.
2. **Offline:** `data/orte.b64` ist gzip-komprimiertes TSV (rund 171.000 Orte). Es wird beim ersten Bedarf mit `DecompressionStream` entpackt und in ein 1°-Raster einsortiert. Ergebnis ist der nächstgelegene Ort; ab 1,5 km Entfernung als „bei …“.

### Speichern

- `localStorage`: `fotoprotokoll.cfg` (Einstellungen, Titel, Titelseitentext), `fotoprotokoll.logo`, `fotoprotokoll.ed` (zuletzt benutztes Werkzeug und Farbe).
- PDF-Download: in der Artifact-Umgebung über die `downloads`-Capability (`window.claude.use("downloads")`), sonst über einen normalen Download-Link.

## Varianten des Builds

| Datei | Zweck |
|---|---|
| `dist/Foto-Protokoll.html` | Vollständiges Dokument für lokale Nutzung und GitHub Pages |
| `dist/artifact.html` | Nur der Inhalt ohne `<html>`/`<head>`, für die Veröffentlichung als Claude-Artifact (mit Capability `downloads`) |

## Tests

`test/e2e.mjs` öffnet die gebaute Datei in Chromium, blockiert alle Netzwerkzugriffe außer den lokal ausgelieferten Bibliotheken und prüft:

- EXIF-Datum, Offline-Orte
- dass jede Originaldatei bitgenau im PDF steckt
- die SHA-256-Werte auf der Prüfsummenseite
- Titelseite mit Markdown, Fotonummern, Markierungsnotizen
- dass verkleinerte Originale das Aufnahmedatum behalten
