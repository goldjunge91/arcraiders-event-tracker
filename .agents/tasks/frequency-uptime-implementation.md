# Umsetzungs- und Verifikationsbericht: Frequency & Server-Hours

## Stand

- Datum: 14.11.2026
- Arbeitskopie: `/Users/marco/.gemini/antigravity/scratch/arcraiders_tracker`, Branch `main`
- Datenquelle und Tracker unverändert: `data/events.json` und `mongo_tracker.py`

## Umsetzung

- `frequency-uptime.js` enthält jetzt einen dependency-freien Berechnungs- und Filterkern. Er dedupliziert globale Slots, erkennt nur gültige gespeicherte Regionalzeitpaare und zählt `rotationSlots`, `regionalInstances` und `serverHours` getrennt.
- Der Umfang kann zwischen allen fünf Regionen und jeder einzelnen Region wechseln. Bei vollständigen Daten gilt dadurch nachvollziehbar: 15 Rotationsslots, 75 regionale Instanzen und 75 aufgezeichnete Server-Stunden. Fehlende regionale Paare werden nicht mit fünf Regionen aufgefüllt.
- Offsetlose globale Zeiten werden nur für Datensätze ohne regionale Zeitpaare als lokale Browserzeit verwendet. Regionale Epoch-Zeiten bilden die Auswertung, die Datumsgrenzen verwenden die lokale Browserzeitzone.
- `ALL`, `TODAY` und `WEEK` enden bei der aktuellen Zeit. Zusätzlich werden konkrete lokale Tage ab dem frühesten aufgezeichneten Tag bis einschließlich des aktuellen lokalen Tages auswählbar gemacht. Tage und Slots mit Startzeit in der Zukunft werden weder in der Auswahl noch in Frequency, Statistik, Matrix oder Timeline berücksichtigt.
- Die Timeline zeigt nur vergangene und laufende Stunden. Vorwärtsnavigation und Zukunftsstatus wurden entfernt. Leere Conditions zeigen keinen inferierten `Off-Rotation`-Status.
- Der Frequency-Reiter heißt `Frequency & Server-Hours` und verwendet die Einheiten `Recorded rotation slots`, `Regional instances`, `Recorded server-hours` und dynamische `Maps represented`. Die Seite weist ausdrücklich darauf hin, dass dies keine Verfügbarkeitsmessung ist.
- Unscoped-Datensätze werden als Datenqualitätsfall angezeigt. Sie zählen im Umfang „All five regions“ höchstens als globaler Slot, nicht als regionale Instanz oder Server-Stunde; in einer Einzelregion werden sie nicht als Treffer gezählt. Partielle Regionaldaten zählen nur mit ihren bereits gestarteten, tatsächlich gespeicherten Regionalbereichen.
- Der Tab `Concurrent Slots` wurde vollständig entfernt. Der Map-Matrix-Untertitel beschreibt nun die tatsächliche Gruppierung aufgezeichneter Rotationen nach Condition und Map.

## Verifikation

Ausgeführt:

- `env NODE_OPTIONS= node --test tests/frequency-uptime.test.js` — **8 Tests bestanden**. Abgedeckt sind vollständige und fehlende Regionaldaten, Einzelregion/alle Regionen, laufende/beendete/zukünftige Slots, lokale `TODAY`-/`WEEK`-Grenzen, konkrete Tage ab dem Tracking-Beginn, Ausschluss des aktuellen und zukünftiger Tage sowie der leere Zustand ohne Off-Rotation-Aussage.
- `node --check frequency-uptime.js` — **bestanden**.
- `python3 -m py_compile mongo_tracker.py` — **bestanden**; die Tracker-Datei blieb unverändert.
- `git diff --check` — **bestanden**.
- Inline-Syntaxprüfung der HTML-Datei mit Node (`new Function` für das eingebettete Script) — **1 Inline-Script kompiliert**.
- Reale Snapshot-Prüfung mit dem neuen Kern: bei der lokalen Prüfzeit wurden nur gestartete Datensätze berücksichtigt; `getAvailableDateKeys` lieferte ausschließlich `2026-11-11` bis `2026-11-14`, nicht den im Snapshot enthaltenen 15.11.

Ein separater Browser-/Screenshot-Test war im Checkout nicht verfügbar. Es wurden keine Abhängigkeiten, keine Datenmigration, kein Tracker-Lauf mit MongoDB und kein Push ausgeführt.
