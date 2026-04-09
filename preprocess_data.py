#!/usr/bin/env python3
"""Preprocess 2025_specimen_time_series_events_no_phi.tsv into dashboard-ready JSON/CSV artifacts."""
import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

INPUT_TSV = Path("2025_specimen_time_series_events_no_phi.tsv")
OUT_DIR = Path(".")
OUT_JSON = OUT_DIR / "dashboard_data.json"
OUT_CSV = OUT_DIR / "order_level_dataset.csv"
OUT_SUMMARY = OUT_DIR / "preprocessing_summary.json"

CANONICAL_EVENTS = [
    "test_ordered_dt",
    "test_collected_dt",
    "test_receipt_dt",
    "test_min_resulted_dt",
    "test_max_resulted_dt",
    "test_min_verified_dt",
    "test_max_verified_dt",
    "cancellation_dt",
]


def parse_dt(value: str):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def hours_between(start, end):
    if not start or not end:
        return None
    return round((end - start).total_seconds() / 3600.0, 3)


def weekpart(dt_obj):
    if not dt_obj:
        return "Unknown"
    return "Weekend" if dt_obj.weekday() >= 5 else "Weekday"


def sanitize_order(record):
    ordered = record["event_times"].get("test_ordered_dt")
    collected = record["event_times"].get("test_collected_dt")
    receipt = record["event_times"].get("test_receipt_dt")
    min_res = record["event_times"].get("test_min_resulted_dt")
    max_res = record["event_times"].get("test_max_resulted_dt")
    min_ver = record["event_times"].get("test_min_verified_dt")
    max_ver = record["event_times"].get("test_max_verified_dt")
    cancel = record["event_times"].get("cancellation_dt")

    events = [ordered, collected, receipt, min_res, max_res, min_ver, max_ver, cancel]
    events = [a for a in events if a]
    first_event = min(events)
    last_event = max(events)

    return {
        "accession_id": record["accession_id"],
        "test_code": record["test_code"],
        "test_performing_dept": record["test_performing_dept"],
        "test_performing_location": record["test_performing_location"],
        "event_street": record["event_street"],
        "ordered_at": ordered.isoformat().replace("+00:00", "Z") if ordered else None,
        "ordered_weekpart": weekpart(ordered),
        "has_cancellation": bool(cancel),
        "tube_tracker_event_types": sorted(record["tube_tracker_event_types"]),
        "n_tube_tracker_events": len(record["tube_tracker_event_types"]),
        "collection_hours": hours_between(ordered, collected),
        "receipt_hours": hours_between(ordered, receipt),
        "min_result_hours": hours_between(ordered, min_res),
        "max_result_hours": hours_between(ordered, max_res),
        "min_verified_hours": hours_between(ordered, min_ver),
        "max_verified_hours": hours_between(ordered, max_ver),
        "cancellation_hours": hours_between(ordered, cancel),
        "event_duration": hours_between(first_event, last_event),
        "event_timestamps": {
            key: value.isoformat().replace("+00:00", "Z")
            for key, value in sorted(record["event_times"].items())
            if value is not None
        },
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    orders = {}
    counts_by_event_type = Counter()
    row_count = 0

    with INPUT_TSV.open(newline="", encoding="utf-8") as infile:
        reader = csv.DictReader(infile, delimiter="\t")
        for row in reader:
            row_count += 1
            acc = row["accession_id"]
            evt_type = row["event_type"]
            evt_source = row["event_source"]
            evt_time = parse_dt(row["event_dt"])

            counts_by_event_type[evt_type] += 1

            if acc not in orders:
                orders[acc] = {
                    "accession_id": acc,
                    "test_code": row["test_code"],
                    "test_performing_dept": row["test_performing_dept"],
                    "test_performing_location": row["test_performing_location"],
                    "event_street": row["event_street"],
                    "event_times": {},
                    "tube_tracker_event_types": set(),
                }

            rec = orders[acc]

            # Keep earliest time for repeated events (robust to duplicates)
            current = rec["event_times"].get(evt_type)
            if current is None or (evt_time and evt_time < current):
                rec["event_times"][evt_type] = evt_time

            if evt_source == "tube_tracker":
                rec["tube_tracker_event_types"].add(evt_type)

    order_level = [sanitize_order(v) for v in orders.values()]
    order_level.sort(key=lambda x: (x["ordered_at"] or "", x["accession_id"]))

    with OUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(order_level, f, indent=2)

    fieldnames = [
        "accession_id",
        "test_code",
        "test_performing_dept",
        "test_performing_location",
        "event_street",
        "ordered_at",
        "event_duration", 
        "ordered_weekpart",
        "has_cancellation",
        "collection_hours",
        "receipt_hours",
        "min_result_hours",
        "max_result_hours",
        "min_verified_hours",
        "max_verified_hours",
        "cancellation_hours",
        "n_tube_tracker_events",
    ]

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in order_level:
            row = dict(row)
            row["tube_tracker_event_types"] = "|".join(row["tube_tracker_event_types"])
            writer.writerow({k: row.get(k) for k in fieldnames})

    summary = {
        "input_rows": row_count,
        "unique_orders": len(order_level),
        "canonical_events": CANONICAL_EVENTS,
        "event_type_counts": counts_by_event_type,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    }

    with OUT_SUMMARY.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, default=lambda x: dict(x))

    print(f"Wrote {OUT_JSON}, {OUT_CSV}, {OUT_SUMMARY}")


if __name__ == "__main__":
    main()
