# Atlas V4

Vollständig testbare Web-Version von Atlas.

## Dateien
- `index.html` – Oberfläche
- `css/style.css` – Design
- `js/app.js` – Hauptlogik
- `js/storage.js` – Speicherung im Browser
- `js/yahoo.js` – Yahoo-Kursabruf mit CORS-Proxys
- `js/journal.js` – Journal und PDF-Export
- `js/challenge.js` – 1-Mio-Challenge

## Testen über GitHub Pages
1. Dateien in dein Repository hochladen.
2. GitHub: Settings → Pages.
3. Source: Deploy from branch.
4. Branch: main, Folder: /root.
5. Save.
6. Danach den GitHub-Pages-Link öffnen.

## Hinweis Yahoo
Yahoo Finance blockiert direkte Browser-Anfragen oft per CORS. Deshalb nutzt diese Version öffentliche CORS-Proxys. Falls die temporär ausfallen, kann der aktuelle Kurs manuell im Eingabe-Screen eingetragen werden.
