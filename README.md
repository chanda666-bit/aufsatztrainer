# Aufsatz-Trainer 5. Klasse – Online Starter

Dieses Starterpaket enthält:
- `frontend/index.html` – einfache Weboberfläche
- `backend/server.js` – Express-Server mit OpenAI-Anbindung
- `backend/.env.example` – Beispiel für Umgebungsvariablen
- `backend/package.json` – Abhängigkeiten

## Ziel
Ein kindgerechter Aufsatz-Trainer, der Texte online korrigiert und Satz für Satz erklärt, warum etwas verbessert wurde.

## Sicherheit
Der OpenAI API Key gehört **nur** in die `.env` auf dem Server und **nie** direkt in die HTML-Datei.

## Schnellstart lokal

1. Terminal im Ordner `backend` öffnen
2. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
3. `.env.example` zu `.env` kopieren
4. Deinen echten OpenAI API Key in `.env` eintragen
5. Server starten:
   ```bash
   npm run dev
   ```
6. Browser öffnen:
   - `http://localhost:3000`

## Empfohlene nächste Ausbaustufen
- Schülerkonten
- Verlauf in Datenbank
- Eltern-/Lehreransicht
- Themenbibliothek
- PDF-Berichte
- Rechtschreib- und Konzentrationsstatistik

## Deployment-Idee
- Frontend + Backend zusammen auf Render, Railway oder VPS
- Später Datenbank: PostgreSQL oder Supabase

