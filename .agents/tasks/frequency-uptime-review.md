# Review-Nachweis: Frequency & Server-Hours

## Nachprüfung

Geprüft wurden der aktuelle Arbeitsstand aus `eff0ccb`, die Nachbesserungen in `index.html`, der Berechnungskern, der Umsetzungsbericht und der lokale Browser-Smoke-Test. Das Gate steht auf `APPROVED`.

- Die gemeinsame Quelle für Schedule und Matrix wird jetzt aus `FrequencyUptime.buildFrequencyView(..., { scope: "ALL" })` abgeleitet. Dadurch werden regionale Zukunftsstarts nach demselben Modell wie Frequency ausgeschlossen; unscoped Datensätze verwenden nur den dokumentierten lokalen globalen Fallback.
- Die Timeline berechnet absolute Stundenbegrenzungen aus `nowMs` und dem Zeitzonen-Offset. `Europe/Berlin` wird nur für die Anzeige formatiert, nicht als lokale Zeichenkette erneut geparst.
- Der vorgeschriebene HTTP-Smoke-Test lief über `python3 -m http.server 8000 --bind 127.0.0.1` und Headless Chrome. Er deckte leere Suche, `ARC Frigate`-Suche, `ALL`, Europe, North America, South America, Oceania und Asia, sichtbare Einheiten, Zukunftsausschluss sowie Live- und verschobene Timeline ab. Alle Checks bestanden.
- Die frühere Finding-ID `TAB_SCOPE_001` wird nicht als Änderung übernommen: Der Concurrent-Slots-Bereich bleibt entsprechend der ausdrücklich auf Frequency begrenzten Aufgabe außerhalb des Scopes. Es wurde kein anderer Tab wiederhergestellt oder zusätzlich verändert.

## Verifikation

- `node --test tests/frequency-uptime.test.js`: 8 bestanden.
- `node --check frequency-uptime.js`: bestanden.
- `python3 -m py_compile mongo_tracker.py`: bestanden.
- `git diff --check`: bestanden.
- Inline-Syntaxprüfung des eingebetteten HTML-Scripts: bestanden.
- HTTP-Smoke-Test mit Headless Chrome: bestanden.

Verdikt: APPROVED.
