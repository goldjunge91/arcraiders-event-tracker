"""
Parser for ARC Raiders Map Conditions and Event Timers.
Extracts condition name, map name, start/end timestamps, duration, and status.
"""

import re
from datetime import datetime, timedelta

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

KNOWN_MAPS = [
    "Buried City",
    "Dam Battlegrounds",
    "Stella Montis",
    "Spaceport",
    "Pendola Pass",
    "The Blue Gate",
    "Riven Tides"
]

LINK_REGEX = re.compile(r'\[(?P<timer>[0-9:]+)(?P<content>.+?)\]\((?P<url>https?://[^\)]+)\)')
TIME_REGEX = re.compile(r'(?P<day>\d{1,2})\.\s*(?P<month>[A-Za-zäöüÄÖÜ]+\.?)\s*[·•-]\s*(?P<start>\d{1,2}:\d{2})\s*-\s*(?P<end>\d{1,2}:\d{2})')

def parse_iso_datetimes(day: int, month_str: str, start_str: str, end_str: str, ref_dt: datetime = None):
    if ref_dt is None:
        ref_dt = datetime.now()
    
    clean_month = month_str.lower().strip()
    month_num = MONTH_MAP.get(clean_month, ref_dt.month)
    year = ref_dt.year
    
    # Check if month wrapped to next year (e.g. Dec -> Jan)
    if month_num < ref_dt.month and ref_dt.month == 12:
        year += 1
        
    start_h, start_m = map(int, start_str.split(':'))
    end_h, end_m = map(int, end_str.split(':'))
    
    start_dt = datetime(year, month_num, day, start_h, start_m)
    end_dt = datetime(year, month_num, day, end_h, end_m)
    
    # If end time is earlier than start time, it rolls over midnight
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
        
    duration_min = int((end_dt - start_dt).total_seconds() // 60)
    
    return start_dt.isoformat(), end_dt.isoformat(), duration_min

def parse_map_conditions_text(raw_text: str, ref_dt: datetime = None):
    """
    Parses pasted markdown or raw text from arcraiders.com/de/map-conditions.
    Returns a list of parsed event dictionaries.
    """
    if ref_dt is None:
        ref_dt = datetime.now()
        
    active_part = ""
    coming_part = ""
    
    if "Coming up" in raw_text:
        parts = raw_text.split("Coming up", 1)
        active_part = parts[0]
        coming_part = parts[1]
    elif "Active now" in raw_text:
        active_part = raw_text
    else:
        # Default all to auto-determined by current time
        active_part = raw_text

    events = []
    
    def process_chunk(chunk_text, default_status):
        items = []
        for match in LINK_REGEX.finditer(chunk_text):
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
            
            start_iso, end_iso, duration_min = parse_iso_datetimes(day, month_str, start_str, end_str, ref_dt)
            
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
                    
            start_dt = datetime.fromisoformat(start_iso)
            end_dt = datetime.fromisoformat(end_iso)
            
            # Determine real status relative to ref_dt
            if ref_dt < start_dt:
                status = "UPCOMING"
            elif start_dt <= ref_dt <= end_dt:
                status = "ACTIVE"
            else:
                status = "FINISHED"
                
            items.append({
                "condition_name": condition_name,
                "map_name": matched_map,
                "start_time": start_iso,
                "end_time": end_iso,
                "duration_minutes": duration_min,
                "timer_display": timer,
                "status": status,
                "slug": slug,
                "url": url,
                "source_section": default_status
            })
        return items

    events.extend(process_chunk(active_part, "ACTIVE"))
    events.extend(process_chunk(coming_part, "UPCOMING"))
    
    return events
