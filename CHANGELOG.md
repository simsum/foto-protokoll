# Changelog

Alle nennenswerten Änderungen. Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [0.7.0] – 2026-10-18

### Neu
- **Wetter zur Aufnahmezeit** (Einstellung „Wetter zur Aufnahmezeit“, standardmäßig aus): Aus GPS-Position und Aufnahmezeit holt das Tool das Wetter der nächsten vollen Stunde und setzt es als Zeile unter das Foto. Angezeigt werden Zustand, Temperatur (gefühlt), Wind mit Richtung und Böen, Niederschlag, Schnee, Luftfeuchte, Taupunkt, Bewölkung, Luftdruck, Sicht, Sonnenschein und die Quelle (bei DWD mit Stationsname und Entfernung).
- Quellen: Bei einer DWD-Station im Umkreis von 30 km [Bright Sky](https://brightsky.dev/) (Messwerte des Deutschen Wetterdienstes), sonst [Open-Meteo](https://open-meteo.com/) (Vorhersage-Schnittstelle bis rund 80 Tage zurück, ältere Tage aus dem ERA5-Archiv).
- Pro Foto ein Eingabefeld „Wetter“: von Hand änderbar, leer lassen ermittelt es neu. Umfang „Vollständig“ oder „Kurz“ wählbar.
- Das Wetter steht in den Bearbeitungsdaten im PDF und wird beim erneuten Öffnen ohne neue Abfrage wiederhergestellt.
- Ohne Netz oder im claude.ai-Artifact erscheint ein Hinweis, manuelle Eingabe geht weiter.

### Hinweise
- Es gehen Koordinaten und Datum an die Wetterdienste (nur wenn die Einstellung an ist). Open-Meteo ist kostenlos nur für nicht kommerzielle Nutzung.

## [0.6.0] – 2026-10-18

### Neu
- **PDF später weiterbearbeiten:** Das PDF enthält den Anhang `foto-protokoll-projekt.json` mit Einstellungen, Titelseitentext, Logo, Reihenfolge, Orten, Bemerkungen, Markierungen samt Notizen, Drehung und Ausschnitt. Ein solches PDF auf die Seite ziehen stellt alles wieder her, auch die Fotos aus den eingebetteten Originalen (bitgenau, die Prüfsummen bleiben gleich).
- Ohne eingebettete Originale kommen Einstellungen und Notizen zurück, die Fotos werden danach über ihre SHA-256 zugeordnet. Bei verkleinert eingebetteten Fotos gibt es nur die verkleinerte Fassung.
- Neue Einstellung „Bearbeitungsdaten im PDF speichern“ (standardmäßig an, abwählbar).
- Daten aus einem PDF gelten als unsicher: Alle Werte werden vor der Verwendung geprüft (Zahlen, Farben, Texte, Logo, Einstellungen). Ein Test mit einem manipulierten PDF stellt sicher, dass kein Code ausgeführt wird.

### Geändert
- Zum Öffnen eines Projekt-PDFs müssen vorher alle Fotos entfernt sein (Hinweis erscheint). Beispielfotos werden einfach ersetzt.

## [0.5.2] – 2026-10-12

### Neu
- Fußzeile im PDF: unter „Erstellt am …“ steht jetzt ein Link zum Projekt (github.com/simsum/foto-protokoll).
- `THIRD-PARTY-NOTICES.md` mit Lizenzen und Quellenangaben der Drittanbieter (u. a. GeoNames, CC BY 4.0).

## [0.5.1] – 2026-10-09

### Geändert
- Ein gewählter Ausschnitt wird in der Vorschau größer aus dem Original gerechnet und wirkt dadurch nicht mehr pixelig (bis höchstens zur Auflösung des Originals). Das PDF nutzte bereits die Originalpixel.
- Fotokarten: Die Aktionsbuttons (Markieren, Drehen, Verschieben, Entfernen) stehen jetzt in einer Reihe oben rechts statt untereinander. Auf dem Handy bleiben sie in einer eigenen Zeile unter der Karte.

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
