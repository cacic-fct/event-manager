#!/usr/bin/env python3
"""
Reevaluate imported attendance categories from the Firestore export.

This tool is intentionally non-destructive:
- dry-run is the default;
- --apply is required to write;
- writes only update event_attendances.category for existing rows;
- it prints Firestore events that could not be matched by name + start date.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections.abc import Iterable
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypeVar

sys.dont_write_bytecode = True

from firestore_to_postgres import (
    coerce_bool,
    coerce_text,
    extract_subcollection,
    parse_firestore_timestamp,
)

AttendanceCategory = Literal["NON_PAYING", "NON_SUBSCRIBED", "REGULAR", "UNKNOWN"]
T = TypeVar("T")

NON_SUBSCRIBED_COLLECTIONS = (
    "non-subscribing-attendance",
    "non-subscribed-attendance",
    "non-subscribing",
    "non-subscribed",
)


@dataclass(slots=True)
class FirestoreAttendance:
    legacy_event_id: str
    event_name: str
    event_start_date: datetime
    legacy_person_id: str
    category: AttendanceCategory


@dataclass(slots=True)
class MatchedAttendance:
    legacy_event_id: str
    legacy_person_id: str
    event_id: str
    person_id: str
    category: AttendanceCategory


@dataclass(slots=True)
class UnmatchedEvent:
    legacy_event_id: str
    name: str
    start_date: datetime
    reason: str
    candidate_count: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reevaluate event_attendances.category from Firestore collections."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("import/file.json"),
        help="Path to Firestore export JSON file.",
    )
    parser.add_argument(
        "--database-url",
        type=str,
        default="",
        help="Full PostgreSQL URL. If omitted, individual --db-* options are used.",
    )
    parser.add_argument("--db-host", type=str, default="localhost")
    parser.add_argument("--db-port", type=int, default=5432)
    parser.add_argument("--db-name", type=str, default="postgres")
    parser.add_argument("--db-user", type=str, default="postgres")
    parser.add_argument("--db-password", type=str, default="postgres")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write category updates. Without this flag the tool only reports changes.",
    )
    parser.add_argument(
        "--include-non-unknown",
        action="store_true",
        help="Also update rows whose current category is not UNKNOWN.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    database_url = args.database_url or (
        f"postgresql://{args.db_user}:{args.db_password}@"
        f"{args.db_host}:{args.db_port}/{args.db_name}"
    )

    raw_events = load_raw_events(args.input)
    firestore_attendances = build_firestore_attendances(raw_events)

    print(
        "Firestore category intent -> "
        + format_counter(Counter(row.category for row in firestore_attendances))
    )

    db = connect(database_url)
    try:
        with db:
            matched, unmatched_events, unmatched_people = match_attendances(
                db,
                firestore_attendances,
            )
            existing, missing_attendances = filter_existing_attendances(db, matched)
            updates = select_changed_attendances(
                db,
                existing,
                include_non_unknown=args.include_non_unknown,
            )

            print(f"Matched attendance rows: {len(matched)}")
            print(f"Existing database attendance rows: {len(existing)}")
            print(f"Rows needing category update: {len(updates)}")
            print(f"Missing database attendance rows: {len(missing_attendances)}")
            print(f"Unmatched Firestore people: {unmatched_people}")
            print(f"Unmatched Firestore events: {len(unmatched_events)}")
            print("Update category intent -> " + format_counter(Counter(row.category for row in updates)))

            print_unmatched_events(unmatched_events)


            if not args.apply:
                print("Dry run only. Re-run with --apply to update categories.")
                db.rollback()
                return

            apply_updates(db, updates)
            print(f"Updated {len(updates)} event_attendances rows.")
    finally:
        db.close()


def load_raw_events(json_path: Path) -> dict[str, Any]:
    with json_path.open("r", encoding="utf-8") as file:
        source = json.load(file)

    raw_events = source.get("__collections__", {}).get("events", {})
    if not isinstance(raw_events, dict):
        raise ValueError("Expected '__collections__.events' to be an object.")
    return raw_events


def build_firestore_attendances(raw_events: dict[str, Any]) -> list[FirestoreAttendance]:
    rows: list[FirestoreAttendance] = []

    for legacy_event_id in sorted(raw_events.keys()):
        raw_event = raw_events.get(legacy_event_id)
        if not isinstance(raw_event, dict):
            continue

        event_name = coerce_text(raw_event.get("name")) or f"Legacy Event {legacy_event_id}"
        event_start_date = (
            parse_firestore_timestamp(raw_event.get("eventStartDate"))
            or parse_firestore_timestamp(raw_event.get("createdOn"))
        )
        if event_start_date is None:
            continue

        subscriptions = extract_subcollection(raw_event, "subscriptions")
        allow_subscription = coerce_bool(raw_event.get("allowSubscription"))
        event_rows: dict[str, FirestoreAttendance] = {}

        for legacy_person_id in sorted(extract_subcollection(raw_event, "attendance").keys()):
            category: AttendanceCategory = "REGULAR"
            if allow_subscription and legacy_person_id not in subscriptions:
                category = "NON_SUBSCRIBED"
            event_rows[legacy_person_id] = FirestoreAttendance(
                legacy_event_id=legacy_event_id,
                event_name=event_name,
                event_start_date=event_start_date,
                legacy_person_id=legacy_person_id,
                category=category,
            )

        for collection_name in NON_SUBSCRIBED_COLLECTIONS:
            for legacy_person_id in sorted(extract_subcollection(raw_event, collection_name).keys()):
                event_rows[legacy_person_id] = FirestoreAttendance(
                    legacy_event_id=legacy_event_id,
                    event_name=event_name,
                    event_start_date=event_start_date,
                    legacy_person_id=legacy_person_id,
                    category="NON_SUBSCRIBED",
                )

        for legacy_person_id in sorted(extract_subcollection(raw_event, "non-paying-attendance").keys()):
            event_rows[legacy_person_id] = FirestoreAttendance(
                legacy_event_id=legacy_event_id,
                event_name=event_name,
                event_start_date=event_start_date,
                legacy_person_id=legacy_person_id,
                category="NON_PAYING",
            )

        rows.extend(event_rows.values())

    return rows


def connect(database_url: str) -> Any:
    try:
        import psycopg
    except ImportError as error:
        raise SystemExit(
            'Missing dependency \'psycopg\'. Install with: pip install "psycopg[binary]"'
        ) from error

    return psycopg.connect(database_url)


def match_attendances(
    db: Any,
    firestore_attendances: list[FirestoreAttendance],
) -> tuple[list[MatchedAttendance], list[UnmatchedEvent], set[str]]:
    event_keys = {
        (row.legacy_event_id, row.event_name, normalize_datetime(row.event_start_date))
        for row in firestore_attendances
    }
    event_id_by_legacy_id: dict[str, str] = {}
    unmatched_events: list[UnmatchedEvent] = []

    with db.cursor() as cursor:
        # Fetch all events once for efficient matching
        cursor.execute(
            """
            SELECT id, name, "startDate"
            FROM events
            WHERE "deletedAt" IS NULL
            """,
        )
        all_db_events = cursor.fetchall()
        
        for legacy_event_id, event_name, event_start_date in sorted(event_keys):
            normalized_firestore_name = normalize_name(event_name)
            
            # Find matches by comparing normalized names and dates
            matches = [
                row[0]
                for row in all_db_events
                if normalize_name(row[1]) == normalized_firestore_name
                and normalize_datetime(row[2]) == event_start_date
            ]

            if len(matches) == 1:
                event_id_by_legacy_id[legacy_event_id] = matches[0]
                continue

            # Count candidates with matching normalized name
            candidate_count = len([
                row for row in all_db_events
                if normalize_name(row[1]) == normalized_firestore_name
            ])
            
            unmatched_events.append(
                UnmatchedEvent(
                    legacy_event_id=legacy_event_id,
                    name=event_name,
                    start_date=event_start_date,
                    reason="no date match" if not matches else "ambiguous date match",
                    candidate_count=candidate_count,
                )
            )

        legacy_person_ids = sorted({row.legacy_person_id for row in firestore_attendances})
        person_id_by_external_ref: dict[str, str] = {}
        for chunk in chunks(legacy_person_ids, 1000):
            cursor.execute(
                """
                SELECT id, "externalRef"
                FROM people
                WHERE "externalRef" = ANY(%s)
                  AND "deletedAt" IS NULL
                """,
                (chunk,),
            )
            person_id_by_external_ref.update({row[1]: row[0] for row in cursor.fetchall()})

    matched: list[MatchedAttendance] = []
    unmatched_people: set[str] = set()

    for row in firestore_attendances:
        event_id = event_id_by_legacy_id.get(row.legacy_event_id)
        if event_id is None:
            continue

        person_id = person_id_by_external_ref.get(row.legacy_person_id)
        if person_id is None:
            unmatched_people.add(row.legacy_person_id)
            continue

        matched.append(
            MatchedAttendance(
                legacy_event_id=row.legacy_event_id,
                legacy_person_id=row.legacy_person_id,
                event_id=event_id,
                person_id=person_id,
                category=row.category,
            )
        )

    return matched, unmatched_events, unmatched_people


def filter_existing_attendances(
    db: Any,
    matched: list[MatchedAttendance],
) -> tuple[list[MatchedAttendance], list[MatchedAttendance]]:
    existing_pairs: set[tuple[str, str]] = set()

    with db.cursor() as cursor:
        for chunk in chunks(matched, 1000):
            cursor.execute(
                """
                SELECT "personId", "eventId"
                FROM event_attendances
                WHERE ("personId", "eventId") IN (
                    SELECT * FROM UNNEST(%s::text[], %s::text[])
                )
                """,
                ([row.person_id for row in chunk], [row.event_id for row in chunk]),
            )
            existing_pairs.update((row[0], row[1]) for row in cursor.fetchall())

    existing = [
        row for row in matched if (row.person_id, row.event_id) in existing_pairs
    ]
    missing = [
        row for row in matched if (row.person_id, row.event_id) not in existing_pairs
    ]
    return existing, missing


def select_changed_attendances(
    db: Any,
    existing: list[MatchedAttendance],
    *,
    include_non_unknown: bool,
) -> list[MatchedAttendance]:
    current_category_by_pair: dict[tuple[str, str], str] = {}

    with db.cursor() as cursor:
        for chunk in chunks(existing, 1000):
            cursor.execute(
                """
                SELECT "personId", "eventId", category::text
                FROM event_attendances
                WHERE ("personId", "eventId") IN (
                    SELECT * FROM UNNEST(%s::text[], %s::text[])
                )
                """,
                ([row.person_id for row in chunk], [row.event_id for row in chunk]),
            )
            current_category_by_pair.update(
                ((row[0], row[1]), row[2]) for row in cursor.fetchall()
            )

    updates: list[MatchedAttendance] = []
    for row in existing:
        current_category = current_category_by_pair.get((row.person_id, row.event_id))
        if current_category == row.category:
            continue
        if current_category != "UNKNOWN" and not include_non_unknown:
            continue
        updates.append(row)
    return updates


def apply_updates(db: Any, updates: list[MatchedAttendance]) -> None:
    if not updates:
        return

    with db.cursor() as cursor:
        cursor.executemany(
            """
            UPDATE event_attendances
            SET category = %(category)s::"AttendanceCategory"
            WHERE "personId" = %(personId)s
              AND "eventId" = %(eventId)s
            """,
            [
                {
                    "personId": row.person_id,
                    "eventId": row.event_id,
                    "category": row.category,
                }
                for row in updates
            ],
        )


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def normalize_name(name: str) -> str:
    # Decompose accented characters into base + combining marks
    nfd_form = unicodedata.normalize('NFD', name)
    # Filter out combining marks (accents)
    without_accents = ''.join(
        char for char in nfd_form 
        if unicodedata.category(char) != 'Mn'
    )
    # Convert to lowercase
    return without_accents.lower()


def chunks(items: list[T], size: int) -> Iterable[list[T]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def format_counter(counter: Counter[str]) -> str:
    if not counter:
        return "none"
    return ", ".join(f"{key}={counter[key]}" for key in sorted(counter.keys()))


def print_unmatched_events(unmatched_events: list[UnmatchedEvent]) -> None:
    if not unmatched_events:
        return

    print("Unmatched events:")
    for event in unmatched_events:
        print(
            "- "
            f"{event.legacy_event_id} | {event.name} | "
            f"{event.start_date.isoformat()} | {event.reason} | "
            f"name_candidates={event.candidate_count}"
        )


if __name__ == "__main__":
    main()
