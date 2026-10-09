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
| `bw`, `bh` | Maße des ausgerichteten Originals (EXIF-Orientierung bereits angewendet) |
| `rot`, `crop` | Drehung (0–3 × 90° im Uhrzeigersinn) und Ausschnitt `{x,y,w,h}` in Pixeln des gedrehten Bildes oder `null` |
| `w`, `h`, `thumb`, `decoded` | Maße der Ansicht (gedreht und zugeschnitten, in Originalpixeln), Vorschau-URL der Ansicht, dekodierbarer Blob (HEIC → JPEG) |
| `marks` | Markierungen in Pixeln des Originals (`bw` × `bh`), unabhängig von Drehung und Ausschnitt: `circle {x,y,r}`, `arrow {x,y (Spitze), x2,y2}`, `num {x,y,r,note}`, jeweils mit Farbe `c` |
| `note`, `sha` | Bemerkung, SHA-256 der Originaldatei |

### Drehen und Ausschnitt

Die Originaldatei und die Markierungen werden nie verändert. `rot` und `crop` bestimmen nur die **Ansicht**:

- `drawView()` zeichnet die Ansicht (Drehmatrix, dann Ausschnitt) auf ein Canvas. Vorschau (`paintThumb()`), PDF-Bild (`renderJpeg()`) und Editor nutzen dieselbe Funktion.
- `viewMarks()` rechnet Markierungen vom Original in die Ansicht um (`toRot()`, Versatz um den Ausschnitt) und lässt solche aus, deren Mittelpunkt außerhalb liegt. `unviewMark()` rechnet neu gesetzte Markierungen zurück.
- `NUMS(p)` liefert nur sichtbare Nummern; Beschriftung und Notizliste im PDF stimmen damit mit dem Bild überein.
- Beim Drehen wird ein vorhandener Ausschnitt mitgedreht (`rotateView()`). `p.w` × `p.h` ist die Ansicht und bestimmt Seitenverhältnis und Platz im Layout.
- `paintThumb()` rechnet das Vorschaubild bei einem Ausschnitt größer (Faktor aus dem Verhältnis ganzes Bild zu Ausschnitt, höchstens 1920 px und nie über die Originalpixel), damit der Ausschnitt in der Vorschau scharf bleibt. Das PDF nutzt über `renderJpeg()` ohnehin die Originalpixel.
- Die eingebetteten Originale (auch verkleinerte) werden nicht gedreht oder zugeschnitten.

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
- Drehen und Ausschnitt: Markierungen wandern mit, liegen sie außerhalb, verschwindet die Nummer samt Notiz, die Originale bleiben bitgenau
