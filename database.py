"""
Database management for ARC Raiders Map Conditions.
SQLite storage with querying, deduplication, and statistical analysis.
"""

import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_FILE = "arcraiders_events.db"

def get_connection(db_path: str = DB_FILE) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path: str = DB_FILE):
    with get_connection(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS map_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                condition_name TEXT NOT NULL,
                map_name TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                slug TEXT,
                url TEXT,
                timer_display TEXT,
                recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(condition_name, map_name, start_time)
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_times ON map_events(start_time, end_time);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_condition ON map_events(condition_name);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_map ON map_events(map_name);")
        conn.commit()

def save_events(events: List[Dict[str, Any]], db_path: str = DB_FILE) -> int:
    """Inserts or updates events, returns count of newly inserted rows."""
    init_db(db_path)
    inserted_count = 0
    with get_connection(db_path) as conn:
        for ev in events:
            cur = conn.execute("""
                INSERT OR IGNORE INTO map_events 
                (condition_name, map_name, start_time, end_time, duration_minutes, slug, url, timer_display)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ev["condition_name"],
                ev["map_name"],
                ev["start_time"],
                ev["end_time"],
                ev["duration_minutes"],
                ev.get("slug", ""),
                ev.get("url", ""),
                ev.get("timer_display", "")
            ))
            if cur.rowcount > 0:
                inserted_count += 1
        conn.commit()
    return inserted_count

def get_active_events(ref_dt: Optional[datetime] = None, db_path: str = DB_FILE) -> List[Dict[str, Any]]:
    if ref_dt is None:
        ref_dt = datetime.now()
    now_iso = ref_dt.isoformat()
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute("""
            SELECT * FROM map_events 
            WHERE start_time <= ? AND end_time >= ?
            ORDER BY start_time ASC, condition_name ASC
        """, (now_iso, now_iso)).fetchall()
        return [dict(r) for r in rows]

def get_upcoming_events(ref_dt: Optional[datetime] = None, limit: int = 50, db_path: str = DB_FILE) -> List[Dict[str, Any]]:
    if ref_dt is None:
        ref_dt = datetime.now()
    now_iso = ref_dt.isoformat()
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute("""
            SELECT * FROM map_events 
            WHERE start_time > ?
            ORDER BY start_time ASC, condition_name ASC
            LIMIT ?
        """, (now_iso, limit)).fetchall()
        return [dict(r) for r in rows]

def get_all_events(limit: int = 100, db_path: str = DB_FILE) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute("""
            SELECT * FROM map_events 
            ORDER BY start_time DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(r) for r in rows]

def search_events(condition: Optional[str] = None, map_name: Optional[str] = None, db_path: str = DB_FILE) -> List[Dict[str, Any]]:
    init_db(db_path)
    query = "SELECT * FROM map_events WHERE 1=1"
    params = []
    if condition:
        query += " AND condition_name LIKE ?"
        params.append(f"%{condition}%")
    if map_name:
        query += " AND map_name LIKE ?"
        params.append(f"%{map_name}%")
    query += " ORDER BY start_time DESC"
    
    with get_connection(db_path) as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

def get_event_stats(db_path: str = DB_FILE) -> Dict[str, Any]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        total = conn.execute("SELECT COUNT(*) FROM map_events").fetchone()[0]
        
        # Per condition stats
        cond_stats = conn.execute("""
            SELECT 
                condition_name, 
                COUNT(*) as count, 
                AVG(duration_minutes) as avg_duration,
                MIN(duration_minutes) as min_duration,
                MAX(duration_minutes) as max_duration,
                GROUP_CONCAT(DISTINCT map_name) as maps
            FROM map_events 
            GROUP BY condition_name 
            ORDER BY count DESC
        """).fetchall()
        
        # Per map stats
        map_stats = conn.execute("""
            SELECT 
                map_name, 
                COUNT(*) as count,
                GROUP_CONCAT(DISTINCT condition_name) as conditions
            FROM map_events 
            GROUP BY map_name 
            ORDER BY count DESC
        """).fetchall()
        
        return {
            "total_records": total,
            "conditions": [dict(r) for r in cond_stats],
            "maps": [dict(r) for r in map_stats]
        }
