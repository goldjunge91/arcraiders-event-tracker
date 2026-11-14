# Umsetzungs- und Verifikationsbericht: Frequency & Server-Hours

## Stand

- Datum: 14.11.2026
- Arbeitskopie: `/Users/marco/.gemini/antigravity/scratch/arcraiders_tracker`, Branch `main`
- Ausgangs-Checkout dieser Nachbesserung: `eff0ccb`; der gemeldete Hash `f48ffb4` ist im aktuellen Repository kein Git-Objekt und erscheint auch nicht im Reflog. Deshalb lässt sich aus diesem Checkout keine konkrete CI-Prüfung dieses Hashes rekonstruieren. Der vorherige erreichbare Commit `eff0ccb` enthält die damaligen Prüfungen in seiner Commit-Nachricht.
- Datenquelle und Tracker unverändert: `data/events.json` und `mongo_tracker.py`

## Umsetzung

- `frequency-uptime.js` enthält den dependency-freien Berechnungs- und Filterkern. Er dedupliziert globale Slots, erkennt nur gültige gespeicherte Regionalzeitpaare und zählt `rotationSlots`, `regionalInstances` und `serverHours` getrennt.
- Der Umfang kann zwischen allen fünf Regionen und jeder einzelnen Region wechseln. Vollständige Regionaldaten skalieren damit nachvollziehbar von einem Slot beziehungsweise einer Server-Stunde pro Region auf fünf regionale Instanzen beziehungsweise fünf Server-Stunden. Fehlende regionale Paare werden nicht mit fünf Regionen aufgefüllt.
- Offsetlose globale Zeiten werden nur für Datensätze ohne regionale Zeitpaare als lokale Browserzeit verwendet. Regionale Epoch-Zeiten bilden die Auswertung; die Datumsgrenzen verwenden die lokale Browserzeitzone.
- `renderAll()` verwendet für Schedule-/Matrix-Statistiken dieselbe `scope: "ALL"`-Auswertung wie der Frequency-Kern. Zukunftsprüfungen und Zeiträume verwenden damit regionale Starts; nur unscoped Datensätze fallen auf ihre lokale globale Startzeit zurück.
- Die Timeline erzeugt absolute Stundenbegrenzungen aus `nowMs` und `Europe/Berlin`. Nur die Beschriftung wird in dieser Zeitzone formatiert. Laufende und beendete Stunden bleiben sichtbar; zukünftige Zellen bleiben leer.
- Der Frequency-Reiter heißt `Frequency & Server-Hours` und verwendet die Einheiten `Recorded rotation slots`, `Regional instances`, `Recorded server-hours` und dynamische `Maps represented`. Die Seite weist ausdrücklich darauf hin, dass dies keine Verfügbarkeitsmessung ist.
- Unscoped-Datensätze werden als Datenqualitätsfall angezeigt. Sie zählen im Umfang „All five regions“ höchstens als globaler Slot, nicht als regionale Instanz oder Server-Stunde; in einer Einzelregion werden sie nicht als Treffer gezählt. Partielle Regionaldaten zählen nur mit ihren bereits gestarteten, tatsächlich gespeicherten Regionalbereichen.
- Leere Conditions zeigen nur `No recorded slots in loaded history`; aus fehlenden Treffern wird kein `Off-Rotation`-Status abgeleitet. Der bestehende Tab `Concurrent Slots` bleibt entsprechend der ausdrücklich begrenzten Frequency-Aufgabe außerhalb dieser Änderung entfernt.

## Verifikation

Ausgeführt:

- `node --test tests/frequency-uptime.test.js` — **8 Tests bestanden**. Abgedeckt sind vollständige und fehlende Regionaldaten, Einzelregion/alle Regionen, laufende/beendete/zukünftige Slots, lokale `TODAY`-/`WEEK`-Grenzen, konkrete Tage ab dem Tracking-Beginn, Ausschluss des aktuellen und zukünftiger Tage sowie der leere Zustand ohne Off-Rotation-Aussage.
- `node --check frequency-uptime.js` — **bestanden**.
- `python3 -m py_compile mongo_tracker.py` — **bestanden**; die Tracker-Datei blieb unverändert.
- `git diff --check` — **bestanden**.
- Inline-Syntaxprüfung der HTML-Datei mit Node (`new Function` für das eingebettete Script) — **bestanden**.
- Lokaler HTTP-Smoke-Test mit `python3 -m http.server 8000 --bind 127.0.0.1` und Headless Chrome via Chrome DevTools Protocol — **bestanden**. Geprüft wurden leere Suche, `ARC Frigate`-Suche, `ALL`, `Europe`, `North America`, `South America`, `Oceania` und `Asia`, die sichtbaren Frequency-Einheiten und die lokale Browserzeitzone `Europe/Berlin`, weil dies die Zeitzone des Prüf-Browsers war. Die Werte unterschieden sich nachvollziehbar: `ALL` 339 Slots / 1441 regionale Instanzen / 1441 Server-Stunden, `Europe` 287 / 287 / 287, `North America` 261 / 261 / 261, `South America` 264 / 264 / 264, `Oceania` 322 / 322 / 322 und `Asia` 307 / 307 / 307. Die Suche lieferte für `ARC Frigate` 73 Slots / 73 regionale Instanzen / 73 Server-Stunden.
- Derselbe Browser-Smoke-Test bestätigte, dass kein Frequency-Datensatz mit regionalem Start in der Zukunft ausgewertet wurde, dass Live- und um sechs Stunden verschobene Timeline keine Zukunftsstunden darstellen, dass die Scope-Auswahl und `Recorded server-hours` sichtbar sind und dass kein `Off-Rotation`-Text gerendert wird.

Es wurden keine Abhängigkeiten, keine Datenmigration, kein Tracker-Lauf mit MongoDB und kein Push ausgeführt.
