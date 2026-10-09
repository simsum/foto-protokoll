# Changelog

Alle nennenswerten Änderungen. Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [0.5.1] – 2026-10-09

### Geändert
- Ein gewählter Ausschnitt wird in der Vorschau größer aus dem Original gerechnet und wirkt dadurch nicht mehr pixelig (bis höchstens zur Auflösung des Originals). Das PDF nutzte bereits die Originalpixel.

## [0.5.0] – 2026-10-09

### Neu
- **Fotos drehen:** Links/rechts drehen in 90°-Schritten, direkt an der Fotokarte und im Markieren-Fenster. Gilt für Vorschau und PDF.
- **Ausschnitt:** Im Markieren-Fenster per „Ausschnitt“ ein Rechteck aufziehen. Das Foto erscheint in Vorschau und PDF nur noch mit diesem Bereich, „Ausschnitt aufheben“ stellt es wieder her.
- Markierungen bleiben in den Pixeln des Originals gespeichert und folgen Drehung und Ausschnitt. Markierungen und Nummern außerhalb des Ausschnitts werden nicht angezeigt und stehen nicht in der Notizliste.
- Die eingebetteten Originale bleiben unverändert (nicht gedreht, nicht zugeschnitten).

## [0.4.0] – 2026-10-08

### Neu
- Optionale **Titelseite** mit großem Titel, Logo, Eckdaten (Anzahl Fotos, Aufnahmezeitraum, Erstelldatum) und freiem Text mit Markdown: Überschriften, fett, kursiv, Code, Listen, Checkboxen, Tabellen, Trennlinien. Langer Text läuft auf Folgeseiten weiter.
- „Vorlage einfügen“ für eine typische Begehung (Anlass, Teilnehmer-Tabelle, Ergebnis-Checkliste).
- Versionsnummer und Quellennachweise (GeoNames, OpenStreetMap) in der Oberfläche.

## [0.3.0] – 2026-10-07

### Neu
- **Fotonummern** („Foto 3“) in Beschriftung, Fotoliste und Prüfsummenseite.
- **Nummerierte Markierungen** ①②③ mit Notiz je Nummer, als Liste unter dem Foto.
- **Firmenlogo** rechts oben in der Kopfzeile, wird im Browser gemerkt.
- **Prüfsummenseite (SHA-256)** für alle Originaldateien und gegebenenfalls deren verkleinerte Fassung.

### Geändert
- Vorschau und PDF entstehen aus demselben Seitenmodell und sehen dadurch identisch aus.
- Der Platz für Bemerkungen passt sich pro Seite dem Inhalt an.

## [0.2.0] – 2026-10-07

### Neu
- **Markieren** mit Kreis und Pfeil in drei Farben, als Vektorgrafik im PDF.
- **Originale verkleinern** vor dem Einbetten (1600, 2400 oder 3200 px). EXIF-Daten bleiben erhalten, die Orientierung wird korrigiert.

## [0.1.0] – 2026-10-07

### Neu
- Erste Version: Fotos per Drag & Drop, Seitenformat und Raster wählbar, Beschriftung mit Datum, Uhrzeit, Ort und GPS.
- Ort über OpenStreetMap Nominatim oder offline aus der eingebauten GeoNames-Ortsliste.
- Originaldateien als PDF-Anhang mit Büroklammer am Foto, GPS-Zeile als Kartenlink.
- iPhone-Fotos (HEIC) über heic2any.
