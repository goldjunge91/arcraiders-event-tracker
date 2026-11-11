"""
ARC Raiders Map Conditions - MongoDB Tracker
Fetches/parses active and upcoming events and upserts them into MongoDB Atlas.
Can be executed locally or via GitHub Actions.
"""

import os
import sys
import re
from datetime import datetime, timedelta
import urllib.request
import urllib.error

# Optional pymongo import
try:
    from pymongo import MongoClient, UpdateOne
    import certifi
    HAS_PYMONGO = True
except ImportError:
    HAS_PYMONGO = False

KNOWN_MAPS = [
    "Buried City",
    "Dam Battlegrounds",
    "Stella Montis",
    "Spaceport",
    "Pendola Pass",
    "The Blue Gate",
    "Riven Tides"
]

MONTH_MAP = {
    "jan": 1, "jan.": 1, "januar": 1, "january": 1,
    "feb": 2, "feb.": 2, "februar": 2, "february": 2,
    "mär": 3, "mär.": 3, "mar": 3, "mar.": 3, "märz": 3, "march": 3,
    "apr": 4, "apr.": 4, "april": 4,
    "mai": 5, "may": 5,
    "jun": 6, "jun.": 6, "juni": 6, "june": 6,
    "jul": 7, "jul.": 7, "juli": 7, "july": 7,
    "aug": 8, "aug.": 8, "august": 8,
    "sep": 9, "sep.": 9, "sept": 9, "september": 9,
    "okt": 10, "okt.": 10, "oct": 10, "oct.": 10, "oktober": 10, "october": 10,
    "nov": 11, "nov.": 11, "november": 11,
    "dez": 12, "dez.": 12, "dec": 12, "dec.": 12, "dezember": 12, "december": 12,
}

LINK_REGEX = re.compile(r'\[(?P<timer>[0-9:]+)(?P<content>.+?)\]\((?P<url>https?://[^\)]+)\)')
TIME_REGEX = re.compile(r'(?P<day>\d{1,2})\.\s*(?P<month>[A-Za-zäöüÄÖÜ]+\.?)\s*[·•-]\s*(?P<start>\d{1,2}:\d{2})\s*-\s*(?P<end>\d{1,2}:\d{2})')

def fetch_page_html(url: str = "https://arcraiders.com/de/map-conditions") -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def parse_iso_datetimes(day: int, month_str: str, start_str: str, end_str: str, ref_dt: datetime = None):
    if ref_dt is None:
        ref_dt = datetime.now()
    clean_month = month_str.lower().strip()
    month_num = MONTH_MAP.get(clean_month, ref_dt.month)
    year = ref_dt.year
    if month_num < ref_dt.month and ref_dt.month == 12:
        year += 1
        
    start_h, start_m = map(int, start_str.split(':'))
    end_h, end_m = map(int, end_str.split(':'))
    
    start_dt = datetime(year, month_num, day, start_h, start_m)
    end_dt = datetime(year, month_num, day, end_h, end_m)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
        
    duration_min = int((end_dt - start_dt).total_seconds() // 60)
    return start_dt, end_dt, duration_min

def parse_events_from_text(text: str, ref_dt: datetime = None):
    if ref_dt is None:
        ref_dt = datetime.now()
    events = []
    
    for match in LINK_REGEX.finditer(text):
        timer = match.group("timer")
        content = match.group("content")
        url = match.group("url")
        slug = url.rstrip("/").split("/")[-1]
        
        tm = TIME_REGEX.search(content)
        if not tm:
            continue
            
        day = int(tm.group("day"))
        month_str = tm.group("month")
        start_str = tm.group("start")
        end_str = tm.group("end")
        
        start_dt, end_dt, duration_min = parse_iso_datetimes(day, month_str, start_str, end_str, ref_dt)
        prefix = content[:tm.start()].strip()
        
        matched_map = None
        for mp in sorted(KNOWN_MAPS, key=len, reverse=True):
            if prefix.endswith(mp):
                matched_map = mp
                condition_name = prefix[:-len(mp)].strip()
                break
                
        if not matched_map:
            slug_words = [w.capitalize() for w in slug.split("-")]
            condition_name = " ".join(slug_words)
            if prefix.startswith(condition_name):
                matched_map = prefix[len(condition_name):].strip()
            else:
                matched_map = "Unknown"
                
        events.append({
            "condition": condition_name,
            "map": matched_map,
            "startTime": start_dt,
            "endTime": end_dt,
            "durationMinutes": duration_min,
            "timer": timer,
            "slug": slug,
            "url": url,
            "updatedAt": datetime.now()
        })
    return events

import json

def export_full_history_to_json(mongo_uri: str, output_path: str = "data/events.json", db_name: str = "arcraiders"):
    """Exports all historic events from MongoDB into a JSON file for multi-month tracking and website loading."""
    if not HAS_PYMONGO:
        return
    client_kwargs = {}
    try:
        import certifi
        client_kwargs["tlsCAFile"] = certifi.where()
    except Exception:
        pass

    client = MongoClient(mongo_uri, **client_kwargs)
    db = client[db_name]
    collection = db["map_conditions"]
    
    docs = list(collection.find({}, {"_id": 0}).sort("startTime", -1))
    for d in docs:
        for k in ["startTime", "endTime", "createdAt", "lastSeenAt", "updatedAt"]:
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()

    if not os.path.isabs(output_path):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(base_dir, output_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(docs, f, indent=2, ensure_ascii=False)
    print(f"Historie dauerhaft exportiert: {len(docs)} Events in {output_path} gesichert.")

def sync_to_mongodb(events, mongo_uri: str, db_name: str = "arcraiders"):
    if not HAS_PYMONGO:
        raise ImportError("pymongo ist nicht installiert. Bitte 'pip install pymongo dnspython certifi' ausführen.")
        
    client_kwargs = {}
    try:
        import certifi
        client_kwargs["tlsCAFile"] = certifi.where()
    except Exception:
        pass

    client = MongoClient(mongo_uri, **client_kwargs)
    db = client[db_name]
    collection = db["map_conditions"]
    
    # Eindeutiger Index auf condition, map und startTime
    collection.create_index([("condition", 1), ("map", 1), ("startTime", 1)], unique=True)
    collection.create_index([("startTime", 1), ("endTime", 1)])
    collection.create_index([("condition", 1)])
    
    operations = []
    for ev in events:
        filter_query = {
            "condition": ev["condition"],
            "map": ev["map"],
            "startTime": ev["startTime"]
        }
        update_doc = {
            "$set": {
                "endTime": ev["endTime"],
                "durationMinutes": ev["durationMinutes"],
                "timer": ev["timer"],
                "slug": ev["slug"],
                "url": ev["url"],
                "lastSeenAt": datetime.now()
            },
            "$setOnInsert": {
                "createdAt": datetime.now()
            }
        }
        operations.append(UpdateOne(filter_query, update_doc, upsert=True))
        
    if operations:
        res = collection.bulk_write(operations)
        print(f"MongoDB Sync erfolgreich: {res.upserted_count} neu eingefügt, {res.modified_count} aktualisiert.")
    else:
        print("Keine Events zum Synchronisieren gefunden.")

# Default sample / seed text exported at module level
SAMPLE_TEXT = """
Active now
[3:07ARC FrigateBuried City11. Nov. · 14:00 - 15:00](https://arcraiders.com/de/map-conditions/arc-frigate)[3:07Lush BloomsDam Battlegrounds11. Nov. · 14:00 - 15:00](https://arcraiders.com/de/map-conditions/lush-blooms)[3:07Night RaidStella Montis11. Nov. · 14:00 - 15:00](https://arcraiders.com/de/map-conditions/night-raid)[3:07Prospecting ProbesSpaceport11. Nov. · 14:00 - 15:00](https://arcraiders.com/de/map-conditions/prospecting-probes)[3:07RedirectionPendola Pass11. Nov. · 14:00 - 15:00](https://arcraiders.com/de/map-conditions/redirection)
Coming up (next per condition)
[3:07ARC FrigateThe Blue Gate11. Nov. · 15:00 - 16:00](https://arcraiders.com/de/map-conditions/arc-frigate)[3:07BeachcombingRiven Tides11. Nov. · 15:00 - 16:00](https://arcraiders.com/de/map-conditions/beachcombing)[3:07Bird CityBuried City11. Nov. · 15:00 - 16:00](https://arcraiders.com/de/map-conditions/bird-city)[3:07Hidden BunkerSpaceport11. Nov. · 15:00 - 16:00](https://arcraiders.com/de/map-conditions/hidden-bunker)[3:07Night RaidPendola Pass11. Nov. · 15:00 - 16:00](https://arcraiders.com/de/map-conditions/night-raid)[1:03:07Lush BloomsBuried City11. Nov. · 16:00 - 17:00](https://arcraiders.com/de/map-conditions/lush-blooms)[1:03:07Prospecting ProbesRiven Tides11. Nov. · 16:00 - 17:00](https://arcraiders.com/de/map-conditions/prospecting-probes)[2:03:07Close ScrutinyBuried City11. Nov. · 17:00 - 18:00](https://arcraiders.com/de/map-conditions/close-scrutiny)[2:03:07HarvesterThe Blue Gate11. Nov. · 17:00 - 18:00](https://arcraiders.com/de/map-conditions/harvester)[2:03:07MatriarchSpaceport11. Nov. · 17:00 - 18:00](https://arcraiders.com/de/map-conditions/matriarch)[5:03:07RedirectionPendola Pass11. Nov. · 20:00 - 21:00](https://arcraiders.com/de/map-conditions/redirection)[6:03:07HurricaneDam Battlegrounds11. Nov. · 21:00 - 22:00](https://arcraiders.com/de/map-conditions/hurricane)
"""
sample_text = SAMPLE_TEXT

def load_env_file():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = val

if __name__ == "__main__":
    load_env_file()
    mongo_uri = os.environ.get("MONGODB_URI")
    
    # Entweder von URL laden oder Fallback auf Text
    events = []
    try:
        live_html = fetch_page_html()
        events = parse_events_from_text(live_html)
    except Exception as e:
        print(f"Hinweis: Live-Abruf nicht möglich ({e}).")

    if not events:
        print("Verwende Basis-Daten (Fallback)...")
        events = parse_events_from_text(sample_text)
    print(f"Gefundene Events: {len(events)}")
    for ev in events:
        print(f" - {ev['condition']} ({ev['map']}): {ev['startTime'].strftime('%H:%M')} bis {ev['endTime'].strftime('%H:%M')} ({ev['durationMinutes']} Min)")

    if mongo_uri:
        sync_to_mongodb(events, mongo_uri)
        export_full_history_to_json(mongo_uri, "data/events.json")
    else:
        print("\nKein MONGODB_URI gesetzt. Um in MongoDB zu speichern, setze die Umgebungsvariable MONGODB_URI.")
