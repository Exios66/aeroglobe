#!/usr/bin/env python3
"""
Extract historical LAS/WN departure data from BTS Detailed Statistics CSV.
Produces a small JSON fallback file: route-level aggregates + optional byMonth/byHour.
"""
import csv
import json
import os
import sys
from collections import defaultdict
from statistics import mean, median


def parse_num(s, default=0):
    """Parse a numeric CSV field; return default if empty or invalid."""
    if s is None or (isinstance(s, str) and s.strip() == ""):
        return default
    try:
        return float(s.replace('"', "").strip())
    except (ValueError, TypeError):
        return default


def parse_row(headers, row):
    """Map a row to a dict by header names; strip quotes from values."""
    return {h.strip(): (v.strip().strip('"') if v else "") for h, v in zip(headers, row)}


def p95(values):
    """95th percentile (linear interpolation)."""
    if not values:
        return 0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    k = (n - 1) * 0.95
    f = int(k)
    c = f + 1 if f + 1 < n else f
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f]) if f < n else sorted_vals[-1]


def parse_date_month(date_str):
    """From MM/DD/YYYY return YYYY-MM."""
    if not date_str:
        return None
    parts = date_str.split("/")
    if len(parts) != 3:
        return None
    try:
        m, d, y = int(parts[0]), int(parts[1]), int(parts[2])
        return f"{y:04d}-{m:02d}"
    except (ValueError, IndexError):
        return None


def parse_time_hour(time_str):
    """From HH:MM or H:MM return hour 0-23."""
    if not time_str:
        return None
    parts = time_str.strip().split(":")
    if not parts:
        return None
    try:
        return int(parts[0]) % 24
    except (ValueError, IndexError):
        return None


def main():
    default_csv = os.path.expanduser(
        "~/Downloads/Detailed_Statistics_Departures (2).csv"
    )
    csv_path = sys.argv[1] if len(sys.argv) > 1 else default_csv
    out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "las-wn-departures-fallback.json")

    if not os.path.isfile(csv_path):
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    # Route-level: dest -> list of records (delay, taxiout, delay causes)
    by_route = defaultdict(
        lambda: {
            "delays": [],
            "taxiouts": [],
            "carrier": [],
            "weather": [],
            "nas": [],
            "security": [],
            "lateAircraft": [],
        }
    )
    # Optional: by month and by hour (minimal metrics)
    by_month = defaultdict(lambda: {"delays": [], "flights": 0})
    by_hour = defaultdict(lambda: {"delays": [], "flights": 0})

    with open(csv_path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        # Skip first 7 lines (metadata)
        for _ in range(7):
            next(reader)
        headers = next(reader)
        # Normalize header names (strip)
        headers = [h.strip() for h in headers]

        for row in reader:
            if len(row) < len(headers):
                row.extend([""] * (len(headers) - len(row)))
            rec = parse_row(headers, row)

            dest = (rec.get("Destination Airport") or "").strip().strip('"')
            if not dest:
                continue

            delay = parse_num(rec.get("Departure delay (Minutes)", 0))
            taxiout = parse_num(rec.get("Taxi-Out time (Minutes)", 0))
            d_carrier = parse_num(rec.get("Delay Carrier (Minutes)", 0))
            d_weather = parse_num(rec.get("Delay Weather (Minutes)", 0))
            d_nas = parse_num(rec.get("Delay National Aviation System (Minutes)", 0))
            d_security = parse_num(rec.get("Delay Security (Minutes)", 0))
            d_late = parse_num(rec.get("Delay Late Aircraft Arrival (Minutes)", 0))

            by_route[dest]["delays"].append(delay)
            by_route[dest]["taxiouts"].append(taxiout)
            by_route[dest]["carrier"].append(d_carrier)
            by_route[dest]["weather"].append(d_weather)
            by_route[dest]["nas"].append(d_nas)
            by_route[dest]["security"].append(d_security)
            by_route[dest]["lateAircraft"].append(d_late)

            month = parse_date_month(rec.get("Date (MM/DD/YYYY)", ""))
            if month:
                by_month[month]["delays"].append(delay)
                by_month[month]["flights"] += 1
            hour = parse_time_hour(rec.get("Scheduled departure time", ""))
            if hour is not None:
                key = str(hour)
                by_hour[key]["delays"].append(delay)
                by_hour[key]["flights"] += 1

    # Build route-level output
    routes = []
    for dest in sorted(by_route.keys()):
        r = by_route[dest]
        delays = r["delays"]
        n = len(delays)
        if n == 0:
            continue
        on_time = sum(1 for d in delays if d <= 15)
        delayed_15_plus = sum(1 for d in delays if d > 15)
        routes.append({
            "dest": dest,
            "flights": n,
            "avgDelay": round(mean(delays), 2),
            "medianDelay": round(median(delays), 2),
            "p95Delay": round(p95(delays), 2),
            "onTimePct": round(100 * on_time / n, 2),
            "delayed15PlusPct": round(100 * delayed_15_plus / n, 2),
            "avgTaxiOut": round(mean(r["taxiouts"]), 2),
            "delayCauseMinutes": {
                "carrier": round(mean(r["carrier"]), 2),
                "weather": round(mean(r["weather"]), 2),
                "nas": round(mean(r["nas"]), 2),
                "security": round(mean(r["security"]), 2),
                "lateAircraft": round(mean(r["lateAircraft"]), 2),
            },
        })

    # Minimal byMonth: avgDelay, onTimePct, flights
    month_list = []
    for key in sorted(by_month.keys()):
        m = by_month[key]
        delays = m["delays"]
        n = m["flights"]
        if n == 0:
            continue
        on_time = sum(1 for d in delays if d <= 15)
        month_list.append({
            "month": key,
            "flights": n,
            "avgDelay": round(mean(delays), 2),
            "onTimePct": round(100 * on_time / n, 2),
        })
    by_month_out = {x["month"]: {k: v for k, v in x.items() if k != "month"} for x in month_list}

    # Minimal byHour (keys are "0".."23")
    hour_list = []
    for h in range(24):
        key = str(h)
        if key not in by_hour or by_hour[key]["flights"] == 0:
            continue
        m = by_hour[key]
        delays = m["delays"]
        n = m["flights"]
        if n == 0:
            continue
        on_time = sum(1 for d in delays if d <= 15)
        hour_list.append({
            "hour": h,
            "flights": n,
            "avgDelay": round(mean(delays), 2),
            "onTimePct": round(100 * on_time / n, 2),
        })
    by_hour_out = {str(x["hour"]): {k: v for k, v in x.items() if k != "hour"} for x in hour_list}

    payload = {
        "meta": {
            "origin": "LAS",
            "carrier": "WN",
            "yearRange": [2020, 2025],
            "generatedAt": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "BTS Detailed Statistics Departures",
        },
        "routes": routes,
        "byMonth": by_month_out,
        "byHour": by_hour_out,
    }

    with open(out_path, "w", encoding="utf-8") as out:
        json.dump(payload, out, indent=2)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({len(routes)} routes, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
