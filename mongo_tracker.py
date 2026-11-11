"""
ARC Raiders Map Conditions - MongoDB & History Tracker
Fetches official live entries directly from arcraiders.com (with all 5 regional timestamps),
stores them permanently in MongoDB Atlas, and exports the cumulative multi-month history to data/events.json.
"""

import os
import sys
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

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

ALL_KNOWN_CONDITIONS = [
    "ARC Frigate",
    "Beachcombing",
    "Bird City",
    "Close Scrutiny",
    "Cold Snap",
    "Electromagnetic Storm",
    "Harvester",
    "Hidden Bunker",
    "Hurricane",
    "Husk Graveyard",
    "Launch Tower Loot",
    "Locked Gate",
    "Lush Blooms",
    "Matriarch",
    "Night Raid",
    "Prospecting Probes",
    "Redirection",
    "Uncovered Caches"
]

CONDITION_ICONS = {
    "ARC Frigate": "https://static.metaforge.app/arc-raiders/custom/arcfrigate.webp",
    "Beachcombing": "https://static.metaforge.app/arc-raiders/custom/beachcombing.webp",
    "Bird City": "https://static.metaforge.app/arc-raiders/custom/birdcity.webp",
    "Close Scrutiny": "https://static.metaforge.app/arc-raiders/custom/closescrutiny.webp",
    "Cold Snap": "https://static.metaforge.app/arc-raiders/custom/coldsnap.webp",
    "Electromagnetic Storm": "https://static.metaforge.app/arc-raiders/custom/electrical.webp",
    "Harvester": "https://static.metaforge.app/arc-raiders/custom/harvester.webp",
    "Hidden Bunker": "https://static.metaforge.app/arc-raiders/custom/hiddenbunker.webp",
    "Hurricane": "https://static.metaforge.app/arc-raiders/custom/hurricane.webp",
    "Husk Graveyard": "https://static.metaforge.app/arc-raiders/custom/husk-graveyard.webp",
    "Launch Tower Loot": "https://static.metaforge.app/arc-raiders/custom/launchtowerloot.webp",
    "Locked Gate": "https://static.metaforge.app/arc-raiders/custom/lockedgate.webp",
    "Lush Blooms": "https://static.metaforge.app/arc-raiders/custom/lush.webp",
    "Matriarch": "https://static.metaforge.app/arc-raiders/custom/matriarch.webp",
    "Night Raid": "https://static.metaforge.app/arc-raiders/custom/night.webp",
    "Prospecting Probes": "https://static.metaforge.app/arc-raiders/custom/probe.webp",
    "Redirection": "https://static.metaforge.app/arc-raiders/custom/redirection.webp",
    "Uncovered Caches": "https://static.metaforge.app/arc-raiders/custom/cache.webp"
}


def fetch_arcraiders_live(url: str = "https://arcraiders.com/de/map-conditions") -> list:
    """
    Fetches the live rotation schedule from arcraiders.com.
    Extracts the official liveEntries JSON payload containing startTimestamp,
    endTimestamp, and exact regional timestamps for North America, Brazil (South America),
    East Asia, and Oceania.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"Hinweis: Live-Abruf von arcraiders.com fehlgeschlagen: {e}")
        return []

    idx = html.find("liveEntries")
    if idx == -1:
        print("Kein 'liveEntries' Block im HTML gefunden.")
        return []

    idx_bracket = html.find("[", idx)
    if idx_bracket == -1:
        return []

    depth = 0
    in_quote = False
    escape = False
    end_idx = -1
    for i in range(idx_bracket, len(html)):
        ch = html[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_quote = not in_quote
            continue
        if not in_quote:
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break

    if end_idx == -1:
        print("Konnte liveEntries Klammern nicht schließen.")
        return []

    raw_json = html[idx_bracket:end_idx + 1].replace('\\"', '"').replace('\\\\', '\\')
    try:
        items = json.loads(raw_json)
    except Exception as e:
        print(f"Fehler beim Parsen von liveEntries JSON: {e}")
        return []

    events = []
    seen = set()
    for it in items:
        cond_name = it.get("conditionName", "").strip()
        map_name = it.get("mapDisplayName", "").strip()
        st_ms = it.get("startTimestamp")
        et_ms = it.get("endTimestamp")
        if not cond_name or not map_name or not st_ms or not et_ms:
            continue

        st_utc = datetime.fromtimestamp(st_ms / 1000, tz=timezone.utc)
        et_utc = datetime.fromtimestamp(et_ms / 1000, tz=timezone.utc)
        dur_min = int(it.get("durationInSeconds", (et_ms - st_ms) // 1000) // 60)
        
        reg_ts = it.get("regionTimestamps")
        if isinstance(reg_ts, str):
            try:
                reg_ts = json.loads(reg_ts)
            except Exception:
                reg_ts = {}
        elif not isinstance(reg_ts, dict):
            reg_ts = {}

        slug = cond_name.lower().replace(" ", "-")

        key = (cond_name, map_name, st_utc.isoformat())
        if key in seen:
            continue
        seen.add(key)

        events.append({
            "condition": cond_name,
            "map": map_name,
            "startTime": st_utc,
            "endTime": et_utc,
            "durationMinutes": dur_min,
            "icon": CONDITION_ICONS.get(cond_name, ""),
            "regionTimestamps": {
                "europe": [st_ms, et_ms],
                "north-america": reg_ts.get("north-america", [st_ms, et_ms]) if isinstance(reg_ts.get("north-america"), list) else [st_ms, et_ms],
                "south-america": reg_ts.get("brazil", [st_ms, et_ms]) if isinstance(reg_ts.get("brazil"), list) else [st_ms, et_ms],
                "asia": reg_ts.get("east-asia", [st_ms, et_ms]) if isinstance(reg_ts.get("east-asia"), list) else [st_ms, et_ms],
                "oceania": reg_ts.get("oceania", [st_ms, et_ms]) if isinstance(reg_ts.get("oceania"), list) else [st_ms, et_ms]
            },
            "slug": slug,
            "url": f"https://arcraiders.com/de/map-conditions/{slug}",
            "updatedAt": datetime.now(timezone.utc)
        })

    return events


def export_full_history_to_json(mongo_uri: str = None, output_path: str = "data/events.json", db_name: str = "arcraiders", fallback_events: list = None):
    """
    Exports all cumulative events from MongoDB to data/events.json.
    Ensures multi-month persistent tracking is always preserved and accessible to the static frontend.
    """
    docs = []
    if mongo_uri and HAS_PYMONGO:
        try:
            client_kwargs = {}
            if "certifi" in sys.modules:
                client_kwargs["tlsCAFile"] = certifi.where()

            client = MongoClient(mongo_uri, **client_kwargs)
            db = client[db_name]
            collection = db["map_conditions"]
            docs = list(collection.find({}, {"_id": 0}).sort("startTime", -1))
        except Exception as e:
            print(f"Warnung: Abruf aus MongoDB fehlgeschlagen ({e}). Verwende lokale Events.")

    if not docs and fallback_events:
        docs = fallback_events

    # Format datetimes
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
    """
    Upserts events into MongoDB Atlas with permanent retention across months.
    """
    if not HAS_PYMONGO:
        raise ImportError("pymongo ist nicht installiert.")

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

    now_dt = datetime.now(timezone.utc)
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
                "icon": ev.get("icon", ""),
                "regionTimestamps": ev.get("regionTimestamps", {}),
                "slug": ev.get("slug", ""),
                "url": ev.get("url", ""),
                "lastSeenAt": now_dt
            },
            "$setOnInsert": {
                "createdAt": now_dt
            }
        }
        operations.append(UpdateOne(filter_query, update_doc, upsert=True))

    if operations:
        res = collection.bulk_write(operations)
        print(f"MongoDB Sync: {res.upserted_count} neu eingefügt, {res.modified_count} aktualisiert (von {len(operations)} Total).")
    else:
        print("Keine Events zum Synchronisieren.")


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

    print("Starte Abruf von arcraiders.com...")
    events = fetch_arcraiders_live()
    print(f"Erfolgreich von arcraiders.com abgerufen: {len(events)} Events")

    if mongo_uri:
        if events:
            sync_to_mongodb(events, mongo_uri)
        export_full_history_to_json(mongo_uri, "data/events.json", fallback_events=events)
    else:
        print("Kein MONGODB_URI gesetzt - exportiere Daten direkt in data/events.json.")
        export_full_history_to_json(None, "data/events.json", fallback_events=events)
