# Analyse des Reiters „Frequency & Uptime“

## Zusammenfassung

Der Reiter mischt derzeit drei verschiedene Zählebenen: globale Rotationsdatensätze, regionale Instanzen und aufsummierte Event-Stunden. Die Bezeichnungen erklären diese Ebenen nicht eindeutig. Besonders irreführend ist **„Total Tracked Uptime“**: Der Wert ist keine Uptime- oder Verfügbarkeitsquote und wird auch nicht über die fünf Regionen multipliziert, sondern summiert `durationMinutes` genau einmal je Datensatz. Ebenso ist **„Active Map Sectors“** im Frontend fest auf `7` gesetzt und beschreibt weder den aktuellen noch den gefilterten Umfang.

Im untersuchten Snapshot ergeben sich bei leerer Suche und dem voreingestellten Filter `ALL` **413 Rotationsdatensätze**, **2.065 angezeigte Server-Runs** und **413 h** angezeigte „Uptime“. Davon enthalten 396 Datensätze fünf regionale Zeitbereiche; bei 17 Datensätzen ohne regionale Zeitbereiche setzt der Code pauschal fünf Runs an. Der Datenbestand reicht von **11.11.2026 08:00** bis **15.11.2026 10:00** und umfasst damit nur gut vier Tage, obwohl die Oberfläche „All Multi-Month History“ und die Dokumentation eine mehrmonatige Historie versprechen. Außerdem liegen Datensätze am 14.11. bereits über die aktuelle Zeit hinaus vor und werden im Filter `ALL` mitgezählt.

Die wichtigste Verbesserung ist eine klare Trennung: **„Recorded rotation slots“** als primäre Häufigkeit, **„Regional instances“** als sekundäre Abdeckung und **„Recorded event-hours“** statt „Uptime“. Auf jeder Ansicht müssen Zeitraum, Referenzzeitzone, aktive Filter und Datenqualität sichtbar sein. „Off-Rotation“ sollte nicht als Ersatz für „keine Daten im gewählten Zeitraum“ verwendet werden.

## Untersuchungsumfang und Arbeitsstand

Untersucht wurden die statische Frontend-Datei, der Datenexport und die Datenquelle:

- `index.html`, insbesondere das Markup von `view-frequency`, die Filter in der Kopfzeile sowie `renderAll()` und `loadRemoteHistory()`.
- `data/events.json` als aktuell eingebetteter und exportierter Snapshot.
- `mongo_tracker.py` als Erzeuger des Eventmodells und Synchronisierer von `data/events.json` und `index.html`.
- `README.md`, `requirements.txt` und `.github/workflows/tracker.yml` für Architektur und Prüfweg.

Das Repository ist eine statische Einzeldatei ohne `package.json`, Frontend-Testordner, Storybook oder Screenshot-Artefakte. Der dokumentierte Automatisierungsweg führt nur den Python-Tracker in GitHub Actions aus (`.github/workflows/tracker.yml:27-43`). Es gibt keine vorhandenen Tests für die Frontend-Berechnungen. Die Untersuchung hat außer diesem geforderten Bericht keine Quelldatei verändert, keinen Commit erstellt und keinen Server gestartet.

## Gesicherte Beobachtungen mit Quellen

### 1. Aufbau und Filterwirkung

Der Reiter wird über `setTab('frequency')` angezeigt (`index.html:164-170`, `index.html:421-438`). Die globalen Bedienelemente stehen oberhalb aller Reiter (`index.html:137-152`):

- `ALL`: „All Multi-Month History“
- `TODAY`: „Today (Active & Next)“
- `WEEK`: „Past 7 Days“
- Freitextsuche für Condition oder Map

`renderAll()` wendet Suche und Zeitraum gemeinsam auf `rawEvents` an (`index.html:728-750`). Dadurch beeinflussen beide Bedienelemente auch die KPIs und Balken des Frequency-Reiters, obwohl der Reiter selbst den aktiven Filter und seine resultierende Zeitspanne nicht noch einmal ausweist.

Die Filterlogik ist nicht vollständig deckungsgleich mit den Beschriftungen:

- `TODAY` prüft nur, ob `new Date(e.startTime).toDateString()` dem lokalen heutigen Datum entspricht. „Active & Next“ bedeutet also nicht „aktuell laufend plus nächste Rotation“.
- `WEEK` nimmt nur Datensätze zwischen jetzt und sieben Tagen in der Vergangenheit auf; zukünftige Datensätze werden ausgeschlossen.
- `ALL` enthält auch bekannte zukünftige Termine.
- `startTime` und `endTime` im JSON sind Strings ohne `Z` oder UTC-Offset, zum Beispiel `data/events.json:3-11`. `new Date(e.startTime)` wird dadurch browserabhängig als lokale Zeit interpretiert. Die regionalen Zeitbereiche werden dagegen als Epoch-Millisekunden gespeichert und mit einer ausdrücklich genannten Zeitzone formatiert.

### 2. Sichtbare Elemente und ihre tatsächliche Bedeutung

Das Markup des Reiters liegt in `index.html:264-318`.

| Aktuelle Beschriftung | Tatsächliche Berechnung | Problem für die Interpretation |
|---|---|---|
| `Total Rotations Tracked` | `filtered.length` | Eine Zahl pro Event-Datensatz, nicht eine Zahl pro Region. Die Identität entspricht praktisch `condition + map + startTime`, die auch der Mongo-Unique-Index verwendet (`mongo_tracker.py:261-264`). |
| Badge `Server-Runs` | Summe der erkannten regionalen Arrays je Datensatz | Ein „Run“ ist nicht erklärt. Bei keinem gültigen regionalen Array werden pauschal fünf Runs angenommen (`index.html:868-881`). |
| `Total Tracked Uptime` | Summe von `(durationMinutes || 60) / 60` je Datensatz | Das sind aufsummierte Event-Stunden. Es gibt weder einen Verfügbarkeitsnenner noch eine Ausfallmessung. Die fünf Regionen werden für diese Zahl nicht vervielfacht (`index.html:863-874`). |
| `Active Map Sectors` | Der DOM-Startwert `7`; in `renderAll()` nicht aktualisiert | Der Wert ist unabhängig von Suche und Zeitraum. „Active“ suggeriert aktuelles Geschehen, obwohl die Datenanalyse historische Datensätze zählt (`index.html:285-289`, `index.html:728-1001`). |
| `Tracked Since` | Fester Text `Nov 11, 2026` | Nicht aus dem Datensatz berechnet und ohne Enddatum, Datenstand oder Zeitzone (`index.html:291-294`). |
| Condition-Balken | `serverRuns` pro Condition; Balkenbreite relativ zum Maximum der Conditions | Die sichtbare Prozentzahl ist der Anteil an allen Server-Runs, nicht der Anteil an allen Rotationsslots. Die Stunden daneben zählen wieder nur Event-Datensätze (`index.html:914-945`). |
| Map-Balken | Datensätze je Map; Prozentzahl ist Anteil an `filtered.length` | Die Map-Ansicht verwendet einen anderen Nenner als die Condition-Ansicht und zählt keine regionalen Instanzen (`index.html:947-976`). |

Die aktuelle Arbeitskopie enthält bereits eine Textanpassung im Condition-Card-Titel: `Condition Occurrence & Regional Instances` mit dem Hinweis auf regionale Instanzen und eindeutige 1-Stunden-Slots (`index.html:299-306`). Das klärt den Nenner aber noch nicht vollständig, weil die Zeilen weiterhin `serverRuns`, `slots`, Prozent und Stunden ohne gemeinsame Legende nebeneinander darstellen.

Die Berechnungen sind im Quelltext konkret:

```text
pro Datensatz:
  durationHours = (durationMinutes || 60) / 60
  conditionSlots[condition] += 1
  conditionHours[condition] += durationHours
  regionCount = Anzahl regionaler Arrays mit Länge 2
  wenn regionCount == 0: regionCount = 5
  conditionServerRuns[condition] += regionCount
  totalServerRuns += regionCount

Condition-Prozent = conditionServerRuns / totalServerRuns
Condition-Balkenbreite = conditionServerRuns / max(conditionServerRuns)
Map-Prozent = mapCount / totalFilteredEvents
Map-Balkenbreite = mapCount / max(mapCount)
```

Die Condition-Liste wird um alle 18 bekannten Conditions ergänzt (`index.html:343-365`). Sobald eine Condition im aktuell gefilterten Ergebnis null Datensätze hat, erhält sie das Label `Off-Rotation` und wird ausgegraut (`index.html:904-945`). Im Timeline-Code bedeutet `Off-Rotation` dagegen „nicht im gesamten `rawEvents`-Datensatz vorhanden“ (`index.html:529-592`). Derselbe Begriff hat damit in zwei Ansichten unterschiedliche Voraussetzungen.

### 3. Werte im aktuellen Snapshot

`data/events.json` und `EMBEDDED_DATASET` in `index.html` enthalten nach Prüfung denselben Snapshot mit 413 eindeutigen Objekten. Die Einträge haben durchgehend `durationMinutes: 60`; es gibt 13 tatsächlich vorkommende Conditions und sieben Maps.

Bei `ALL` und leerer Suche werden damit aktuell berechnet:

| Kennzahl | Wert | Herleitung |
|---|---:|---|
| Rotationsdatensätze / Slots | 413 | Alle JSON-Objekte; keine doppelten Schlüssel `condition + map + startTime` gefunden. |
| Explizite regionale Instanzen | 1.980 | 396 Datensätze mit je fünf regionalen Zeitpaaren. |
| Angezeigte Server-Runs | 2.065 | 1.980 explizite Instanzen plus 17 × 5 pauschale Fallback-Runs. |
| Angezeigte „Uptime“ | 413 h | 413 Datensätze × 60 Minuten, Regionen nicht multipliziert. |
| Maps im KPI | 7 | Zufällig passend zum Snapshot, aber hart codiert. |
| Zeitbereich der Daten | 11.11.2026 08:00 bis 15.11.2026 10:00 | Minimum `startTime`, Maximum `endTime`; Zeitraum etwa 4,08 Tage. |

Die 17 Datensätze ohne `regionTimestamps` stammen alle vom 11.11.2026. Das Datenmodell sieht regionale Zeitpaare grundsätzlich vor (`data/events.json:11-35`; Erzeugung in `mongo_tracker.py:169-186`), aber die UI unterscheidet nicht zwischen „fünf Regionen belegt“ und „fünf Regionen angenommen“.

Die Condition-Rangfolge zeigt, wie stark die gemischten Einheiten wirken:

- `ARC Frigate`: 96 Slots, 480 Server-Runs, 96 h, 23,2 % der Server-Runs.
- `Night Raid`: 83 Slots, 415 Server-Runs, 83 h, 20,1 % der Server-Runs.
- `Lush Blooms`: 35 Slots, 175 Server-Runs, 35 h, 8,5 % der Server-Runs.

Die fünf bekannten Conditions ohne Datensatz im Snapshot sind `Cold Snap`, `Husk Graveyard`, `Launch Tower Loot`, `Locked Gate` und `Uncovered Caches`. Sie erscheinen als `0x`, `0 slots`, `0,0 %`, `0 h` und `Off-Rotation`. Das beweist nur, dass im gewählten Dataset beziehungsweise Zeitraum keine Datensätze vorhanden sind; ein offizieller aktueller Off-Rotation-Status wird im Datenmodell nicht gespeichert.

Die Map-Balken zählen dagegen historische Datensätze je Map. Die Reihenfolge lautet `Buried City` 77, `Spaceport` 76, `Dam Battlegrounds` 66, `Pendola Pass` 57, `The Blue Gate` 56, `Riven Tides` 47 und `Stella Montis` 34. Diese Rangfolge ist eine Mengenverteilung über den vorhandenen Datenbestand, keine normalisierte Aktivitätsrate und keine Aussage über aktuell aktive Sektoren.

### 4. Datenquelle und Lebenszyklus

Der Tracker liest offizielle Einträge, konvertiert die globalen Start- und Endzeiten in UTC und übernimmt die fünf regionalen Zeitbereiche (`mongo_tracker.py:76-189`). Beim Export werden alle Daten aus MongoDB nach `data/events.json` geschrieben und anschließend als minifizierter `EMBEDDED_DATASET` in `index.html` synchronisiert (`mongo_tracker.py:191-240`). Die Dokumentation beschreibt den Zweck als dauerhafte, mehrmonatige Historie und nennt für den Reiter „Total occurrences and active hours per condition“ (`README.md:46-55`). Der untersuchte Snapshot erfüllt die erwartete Struktur, ist aber derzeit nur wenige Tage lang.

Die Seite rendert zuerst den eingebetteten Snapshot. Danach lädt `loadRemoteHistory()` `./data/events.json`, dedupliziert nach Condition, Map und Startzeit und rendert erneut (`index.html:1011-1027`). Bei einem Fehler wird nur in die Browser-Konsole geschrieben (`index.html:1029-1032`). Es gibt keinen sichtbaren Hinweis, ob die Seite gerade synchronisiert, auf dem eingebetteten Stand bleibt oder die externe Datei nicht laden konnte.

### 5. Fehlende, leere und partielle Zustände

Gesichert beobachtbar sind folgende Zustände:

- Bei einer Suche ohne Treffer bleiben die 18 bekannten Conditions in der Condition-Liste, alle mit null Werten und `Off-Rotation`; die Map-Karte bleibt leer. Es gibt keinen „Keine Treffer“-Hinweis.
- Der Map-KPI bleibt auch bei leerem Ergebnis `7`.
- Ein Fehler beim Remote-Laden ist nur in der Konsole sichtbar; der Nutzer erhält keinen Datenstand und keine Erklärung.
- Regionale Daten fehlen bei 17 historischen Datensätzen. Die Oberfläche zeigt hierfür trotzdem fünf Runs.
- Es gibt keine sichtbare Erklärung dafür, ob Prozentwerte auf Slots, regionalen Instanzen oder Maps bezogen sind.

## Offene Fragen

Diese Punkte lassen sich aus dem Repository nicht belastbar als Produktentscheidung ableiten:

1. **Welche Zeitzone definiert einen Zeitraum?** Die Oberfläche bevorzugt Europe/Berlin mit dem Label CET, der Tracker erzeugt UTC-Zeitpunkte, die JSON-Strings tragen aber keinen Offset. Für den Datumsfilter muss eine Referenz explizit festgelegt werden.
2. **Welche Einheit soll „Frequency“ priorisieren?** Ein Datensatz ist eine Condition-Map-Rotation mit regionalen Varianten. Für eine Häufigkeitsfrage spricht das Slot-Zählen; für eine Serverabdeckungsfrage sprechen regionale Instanzen. Beide sind nicht dieselbe Kennzahl.
3. **Was bedeutet „Off-Rotation“ fachlich?** Im Modell gibt es nur eine Liste bekannter Conditions und beobachtete Events, kein offizielles Statusfeld. „Keine Beobachtung“ und „offiziell aus der Rotation“ sind daher nicht beweisgleich.
4. **Sollen geplante zukünftige Einträge in einer historischen Auswertung zählen?** Der aktuelle `ALL`-Filter zählt sie. Der Snapshot enthält am 14.11. bereits Daten bis 15.11.; das ist für einen Schedule-Tab sinnvoll, für eine rückblickende Frequency-Auswertung aber erklärungsbedürftig.
5. **Was soll bei unvollständigen Regionaldaten gelten?** Der derzeitige Fallback nimmt fünf Regionen an, obwohl keine regionalen Zeitpaare vorhanden sind. Es ist offen, ob diese Datensätze als fünf erwartete, aber nicht beobachtete Instanzen oder als unvollständige Daten gelten sollen.

## Schlussfolgerungen

- Die wichtigste Verständnishürde ist nicht die Balkendarstellung, sondern die fehlende Definition der Zähleinheit und des Nenners.
- „Uptime“ ist fachlich zu stark. Die Daten enthalten geplante Zeitfenster und Dauer, aber keine Messung von Verfügbarkeit, Ausfällen oder einem Referenzzeitraum.
- Regionale Instanzen sollten nicht in die primäre Häufigkeit hineingerechnet werden, solange gleichzeitig ein Slot-Zähler und eine Stunden-Summe gezeigt werden. Sonst kann eine Condition fünfmal häufiger aussehen, obwohl sie nur einmal als globale Rotation geplant wurde.
- „Active Map Sectors“ und „Off-Rotation“ vermengen aktuellen Status mit Historienauswertung. Die Begriffe müssen entweder aus diesem Reiter verschwinden oder aus echten Statusdaten berechnet werden.
- Ein sichtbarer Datenumfang ist nötig: Die aktuelle Oberfläche lässt den Nutzer „All Multi-Month History“ annehmen, obwohl der geprüfte Bestand nur 4,08 Tage umfasst und auch zukünftige Einträge enthält.

## Umsetzbarer Verbesserungsvorschlag

### Informationsarchitektur

1. Direkt unter dem Reiter-Titel eine Scope-Leiste anzeigen:
   - `Scope: Recorded history`
   - `Reference time: Europe/Berlin`
   - `Data: 11 Nov 2026 08:00 – 14 Nov 2026 [current time]`
   - `Scheduled records available through: 15 Nov 2026 10:00`
   - aktive Suche und Zeitraumfilter als sichtbare Chips.
2. Die vier KPIs auf eindeutig benannte Ebenen umstellen:
   - **Recorded rotation slots**: Anzahl eindeutiger Condition-Map-Startzeit-Datensätze.
   - **Regional instances**: Anzahl tatsächlich vorhandener regionaler Zeitpaare; fehlende Paare separat ausweisen.
   - **Recorded event-hours**: Summe der Dauer je globalem Rotationsdatensatz. Nicht „Uptime“ nennen.
   - **Maps represented**: Anzahl verschiedener Maps im aktuell ausgewerteten Datensatz, nicht eine feste Katalogzahl.
3. Den Tab entweder in **Frequency & Coverage** umbenennen oder den bestehenden Tab-Titel behalten und direkt darunter schreiben: `Recorded rotations and event-hours; no availability uptime measurement`.
4. „Tracked Since“ durch **Data coverage** mit Start, Ende und Datenstand ersetzen. Die Werte aus dem Dataset berechnen, statt `Nov 11, 2026` fest einzubauen.

### Beschriftungen und Einheiten

- `Rotations` durch `rotation slots` ersetzen, damit klar ist, dass eine Zeile eine Condition-Map-Zeitspanne meint.
- `Server-Runs` durch **regional instances** ersetzen und eine kurze Erklärung als Tooltip oder Legende geben: „eine gültige regionale Zeitspanne innerhalb eines Rotation-Slots“.
- In den Condition-Zeilen keine unbeschrifteten `96x`-Werte verwenden. Stattdessen etwa `96 slots · 480 regional instances · 96 h`.
- Den primären Prozentsatz auf **Anteil der aufgezeichneten Slots** beziehen. Wenn regionale Instanzen zusätzlich gezeigt werden, den Nenner ausdrücklich als `share of regional instances` beschriften.
- Stunden nur mit definierter Einheit zeigen: `96 event-hours`, nicht nur `(96h)`.
- Für das jetzige Datenmodell nicht „uptime %“ oder „availability %“ anzeigen. Eine solche Quote erfordert einen bekannten Referenzzeitraum und eine Definition, welche parallelen Maps beziehungsweise Regionen den Nenner bilden.
- `Off-Rotation` im Frequency-Reiter durch **No recorded slots in selected period** ersetzen. Den offiziellen Status nur dort anzeigen, wo er aus einer verlässlichen Quelle stammt.

### Zeitraum und Zeitstempel

- Für diese Oberfläche Europe/Berlin als sichtbare Referenz festlegen, weil der Timeline-Kopf bereits eine CET-Referenz verwendet. Den tatsächlichen dynamischen Zeitzonen-Namen anzeigen, statt ganzjährig starre Kürzel vorauszusetzen.
- `startTime` und `endTime` beim Export mit `Z` oder einem expliziten Offset serialisieren. Für die Filter sollten dieselben Epoch-Zeitwerte wie für `regionTimestamps` verwendet werden, damit ein Nutzer in verschiedenen Browserzeitzonen dasselbe Ergebnis erhält.
- `Today` in **Current calendar day (Europe/Berlin)** umbenennen und die Grenzen auf der Seite anzeigen. `Past 7 Days` ebenfalls mit Start- und Endzeit erklären.
- Für eine historische Frequency-Ansicht standardmäßig nur vergangene beziehungsweise bereits beendete Slots zählen. Zukünftige Schedule-Datensätze separat als `scheduled` kennzeichnen und nicht stillschweigend in historische Häufigkeiten mischen.
- Die Auswertung muss nach jedem Filter sichtbar aktualisieren: `413 slots · 2,065 regional instances · 413 event-hours · 7 maps` sowie die genauen Zeitgrenzen.

### Visualisierung

- Die Condition-Balken als Häufigkeitsranking nach **recorded slots** sortieren. Die Balkenbreite und der Prozentwert müssen denselben Nenner nutzen. Regionale Instanzen und Event-Stunden kommen als klar beschriftete Spalten daneben.
- Die Map-Karte in **Recorded slots by map** umbenennen. Die Balken zeigen dann `77 slots · 18,6 % of slots`; „Most Active“ entfällt, solange keine Rate pro Zeit oder ein aktueller Status berechnet wird.
- Eine kleine Legende oberhalb beider Karten sollte die drei Einheiten einmal erklären: `slot = condition + map + time window`, `regional instance = one region in a slot`, `event-hour = one slot duration counted once`.
- Bei längeren Historien kann zusätzlich eine Zeitreihe nach Tag oder Woche sinnvoll sein. Die aktuelle Balkenliste allein kann keine Veränderung über die Zeit zeigen und ist wegen der kurzen Datenbasis nicht stabil.
- Die bereits sichtbaren Textwerte sollten erhalten bleiben; Farbe und Balkenlänge dürfen nicht die einzige Information sein.

### Fehlende und fehlerhafte Datenzustände

1. **Initial/Sync:** Den eingebetteten Snapshot weiter als sofortige Anzeige verwenden, aber einen sichtbaren Status `Embedded snapshot · syncing latest data` anzeigen.
2. **Remote-Fehler:** Nicht nur in die Konsole schreiben. Eine Warnung mit Datenstand anzeigen: `Latest snapshot unavailable; showing embedded data from <timestamp>`.
3. **Keine Treffer:** Bei null gefilterten Datensätzen eine zentrale Meldung `No recorded slots match the selected filters` anzeigen, die Ergebnislisten leeren und alle KPIs auf `0` beziehungsweise `—` setzen. Nicht 18 Conditions als scheinbare Off-Rotation-Liste zeigen.
4. **Keine Historie:** Wenn überhaupt kein Datensatz vorhanden ist, eine eigene leere Ansicht mit Erklärung und Datenstand verwenden.
5. **Partielle regionale Daten:** Die 17 aktuell unvollständigen Records als Datenqualitäts-Hinweis ausweisen. Primär die tatsächlich vorhandenen Zeitpaare zählen; einen Fallback nur dann anzeigen, wenn er ausdrücklich als `estimated/assumed` markiert wird.
6. **Unbekannte Condition oder Map:** Nicht still durch fehlende Icons oder leere Balken verschlucken, sondern einen neutralen Textstatus verwenden. Das verhindert, dass Katalogstatus und Datenfehler gleich aussehen.

### Prüfbare Abnahmekriterien für eine spätere Umsetzung

Da aktuell keine Frontend-Tests vorhanden sind, sollten die Berechnungen vor der Veröffentlichung mit festen Fixtures aus `data/events.json` geprüft werden:

- Standardumfang mit leerer Suche liefert die oben genannten 413 Slots, 2.065 derzeit angenommene beziehungsweise 1.980 explizite regionale Instanzen, 413 Event-Stunden und sieben Maps.
- Eine Condition-Ansicht trennt Slot-Anzahl, regionale Instanzen, Stunden und Prozentnenner sichtbar.
- Ein Suchbegriff ohne Treffer zeigt einen leeren Zustand und keine `Off-Rotation`-Liste.
- Zeitraumgrenzen werden unabhängig von der Browserzeitzone nach der festgelegten Europe/Berlin-Referenz ausgewertet.
- Ein Datensatz ohne regionale Zeitpaare erzeugt einen sichtbaren Qualitätsstatus und wird nicht stillschweigend als vollständig beobachtet ausgegeben.
- Ein Remote-Ladefehler zeigt einen sichtbaren Fallback-Status.

Diese Punkte lassen sich als kleine, pure Berechnungstests ergänzen; eine Anpassung des bestehenden Mongo-/Exportmodells sollte dabei getrennt von der UI-Überarbeitung geprüft werden.
