# Atlas V4

Testbare Web-Version von Atlas mit getrennten Dateien.

## Start

Öffne `index.html` lokal im Browser oder lade den gesamten Ordner in GitHub hoch.

## Dateien

- `index.html` – Oberfläche und Screens
- `css/style.css` – Design
- `js/storage.js` – Speicherung im Browser per localStorage
- `js/yahoo.js` – Yahoo-Kursabruf mit Proxy-Fallback
- `js/journal.js` – Journal, Trade-Abschluss, PDF-Export
- `js/challenge.js` – 1-Mio-Challenge
- `js/app.js` – Hauptlogik

## Hinweis Yahoo

Yahoo Finance blockiert je nach Browser/Hosting direkte Anfragen. Deshalb versucht Atlas zuerst Yahoo direkt und danach einen Proxy-Fallback. Falls beides blockiert wird, bleibt die manuelle Kurseingabe im Eingabe-Screen nutzbar.
