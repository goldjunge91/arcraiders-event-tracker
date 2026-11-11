# ARC Raiders Map Conditions & Event Tracker

Automatisiertes System zum Speichern, Verfolgen und Analysieren von Map Conditions und Event-Timern für **ARC Raiders** (`arcraiders.com/de/map-conditions`).

## Übersicht: MongoDB vs. Convex

| Eigenschaft | Option A: GitHub Actions + MongoDB Atlas | Option B: Convex (Serverless Backend) |
| :--- | :--- | :--- |
| **Hosting** | 100% kostenlos (GitHub Actions + MongoDB Free M0) | 100% kostenlos (Convex Cloud Free Tier) |
| **Scheduler** | GitHub Actions Cron (`*/15 * * * *`) | Convex eingebaute Cron-Jobs (`crons.ts`) |
| **Live-Updates** | Polling oder REST / Query | Native WebSockets (Echtzeit-Reaktivität) |
| **Codebasis** | Python (`pymongo`, `urllib`) | TypeScript / JavaScript |
| **Setup-Aufwand** | ~5 Minuten (Secret in GitHub eintragen) | ~5 Minuten (`npx convex dev`) |

---

## Option A: GitHub Actions + MongoDB Atlas (Empfohlen für Python / Cron)

### 1. MongoDB Atlas vorbereiten
1. Kostenlosen Cluster auf [mongodb.com/atlas](https://www.mongodb.com/atlas) erstellen.
2. Einen Datenbank-User und Passwort anlegen.
3. Unter **Network Access** IP-Zugriff erlauben (`0.0.0.0/0`, da GitHub Actions Runner wechselnde IPs haben).
4. Connection String kopieren:
   ```text
   mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```

### 2. GitHub Repository einrichten
1. Den Code in dein GitHub-Repository pushen.
2. Im Repo auf **Settings** -> **Secrets and variables** -> **Actions** gehen.
3. Neues Secret erstellen:
   - **Name:** `MONGODB_URI`
   - **Value:** Dein MongoDB Atlas Connection String
4. Der GitHub Action Workflow (`.github/workflows/tracker.yml`) läuft ab jetzt automatisch **alle 15 Minuten**, parst die Events und speichert sie dedupliziert in MongoDB ab.
5. Du kannst ihn auch manuell unter **Actions** -> **ARC Raiders Event Tracker** -> **Run workflow** starten.

### 3. Lokaler Test
```bash
export MONGODB_URI="mongodb+srv://..."
python3 mongo_tracker.py
```

---

## Option B: Convex (Modernes Echtzeit-Backend)

Convex bietet ein reaktives Backend, bei dem Frontend-Clients (wie React, Next.js oder mobile Apps) sofort über Websockets benachrichtigt werden, sobald ein neues Event aktiv wird.

### 1. Convex initialisieren
Im Projektverzeichnis:
```bash
npm install convex
npx convex dev
```

### 2. Struktur
- [`convex/schema.ts`](convex/schema.ts): Tabellen-Definition mit Indizes auf `condition`, `map` und `startTime`.
- [`convex/events.ts`](convex/events.ts):
  - `upsertEvents`: Schreibt Events atomar und verhindert Duplikate.
  - `getActive`: Liefert alle aktuell aktiven Events.
  - `getUpcoming`: Liefert anstehende Timer sortiert nach Startzeit.
  - `getStats`: Berechnet Häufigkeiten und Durchschnittsdauer je Condition.
- [`convex/crons.ts`](convex/crons.ts): Führt automatisiert alle 15 Minuten den Abgleich aus.
