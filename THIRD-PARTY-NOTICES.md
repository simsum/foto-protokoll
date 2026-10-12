# Drittanbieter-Hinweise

Foto-Protokoll selbst steht unter der [MIT-Lizenz](LICENSE). Das Tool nutzt die folgenden Bibliotheken und Daten Dritter.

## In `dist/Foto-Protokoll.html` enthalten

### Ortsliste (GeoNames)

Die eingebaute Offline-Ortsliste (`data/orte.b64`, erzeugt mit `npm run build:orte`) stammt aus dem npm-Paket [`cities.json`](https://github.com/lutangar/cities.json) und damit aus den Daten von [GeoNames](https://www.geonames.org/). Die Daten wurden gekürzt und umkodiert (nur Orte mit Name, Land und Koordinaten).

- Lizenz: [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- Quelle: GeoNames, https://www.geonames.org/

## Zur Laufzeit aus dem Netz geladen (nicht Teil des Repositorys)

Diese Bibliotheken werden beim Öffnen von einem CDN nachgeladen. Ihre Lizenzen verlangen, dass Copyright- und Lizenzhinweis erhalten bleiben; das geschieht in den jeweils ausgelieferten Dateien.

| Bibliothek | Version | Lizenz | Quelle |
|---|---|---|---|
| pdf-lib (inkl. `@pdf-lib/standard-fonts`, `@pdf-lib/upng`) | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib |
| pako (Abhängigkeit von pdf-lib) | 1.0.x | MIT und Zlib | https://github.com/nodeca/pako |
| exifr | 7.1.3 | MIT | https://github.com/MikeKovarik/exifr |
| heic2any (nur bei HEIC-Fotos) | 0.0.4 | MIT | https://github.com/alexcorvi/heic2any |

## Kartendaten und Dienste

- Adressen aus GPS-Koordinaten: © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, abgefragt über Nominatim (Daten unter [ODbL](https://opendatacommons.org/licenses/odbl/)). Es werden nur Koordinaten übertragen.

## Nur für Entwicklung und Tests

| Paket | Lizenz |
|---|---|
| playwright | Apache-2.0 |
| tslib (Abhängigkeit) | 0BSD |
| cities.json | CC BY 4.0 |

Diese Pakete werden nicht ausgeliefert, mit Ausnahme der oben genannten Ortsdaten.
