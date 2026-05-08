#!/usr/bin/env python3
"""
Reevaluate imported attendance categories from the legacy secompp.sql dump.

This tool is intentionally non-destructive:
- dry-run is the default;
- --apply is required to write;
- writes only update event_attendances.category for existing rows.

Inference notes:
- legacy presence_* tables only record attendance, not why the attendee was there;
- users_registered.status = 'S' is treated as paid/confirmed major-event registration;
- users_registered_shortcourses.status = 'S' is treated as confirmed shortcourse enrollment;
- lectures do not have a separate enrollment table, so paid major-event registration is
  the strongest available regular-attendance signal for lecture attendances;
- only major events with any users_registered.amount > 0 are treated as payment-required;
- payment failure is applied before missing subscription, matching AttendanceCategoryService.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, TypeVar

sys.dont_write_bytecode = True

from legacy_sql_import_utils import (
    build_prefixed_id,
    coerce_text,
    decimal_to_int,
    parse_insert_rows_by_table,
)

PREFIX = "SYSCOMPP-1-"

REQUIRED_TABLES = {
    "lectures",
    "presence_lectures",
    "presence_shortcourses",
    "shortcourses",
    "users",
    "users_registered",
    "users_registered_shortcourses",
}

AttendanceCategory = Literal["NON_PAYING", "NON_SUBSCRIBED", "REGULAR", "UNKNOWN"]
EventKind = Literal["lecture", "shortcourse"]
T = TypeVar("T")


@dataclass(slots=True)
class LegacyAttendance:
    user_id: int
    detail_id: int
    event_id: str
    legacy_event_id: int
    legacy_activity_id: int
    kind: EventKind
    category: AttendanceCategory


@dataclass(slots=True)
class MatchedAttendance:
    person_id: str
    event_id: str
    category: AttendanceCategory
    user_id: int
    detail_id: int
    legacy_event_id: int
    legacy_activity_id: int
    kind: EventKind


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reevaluate SYSCOMPP-1 attendance categories from secompp.sql."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("import/secompp.sql"),
        help="Path to secompp SQL dump file.",
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

    parsed = parse_insert_rows_by_table(args.input, REQUIRED_TABLES)
    legacy_attendances, skipped_attendances = build_legacy_attendances(parsed)

    print(
        "Legacy category intent -> "
        + format_counter(Counter(row.category for row in legacy_attendances))
    )
    print_category_by_kind(legacy_attendances)
    print(f"Skipped legacy attendance rows: {skipped_attendances}")

    db = connect(database_url)
    try:
        with db:
            matched, unmatched_people, unmatched_events = match_attendances(
                db,
                legacy_attendances,
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
            print(f"Unmatched legacy people: {len(unmatched_people)}")
            print(f"Unmatched imported events: {len(unmatched_events)}")
            print(
                "Update category intent -> "
                + format_counter(Counter(row.category for row in updates))
            )

            print_unmatched_people(unmatched_people)
            print_unmatched_events(unmatched_events)

            if not args.apply:
                print("Dry run only. Re-run with --apply to update categories.")
                db.rollback()
                return

            apply_updates(db, updates)
            print(f"Updated {len(updates)} event_attendances rows.")
    finally:
        db.close()


def build_legacy_attendances(
    parsed: dict[str, list[dict[str, Any]]],
) -> tuple[list[LegacyAttendance], int]:
    user_detail_by_user_id = build_user_detail_map(parsed["users"])
    lecture_event_by_lecture_id = build_activity_event_map(
        parsed["lectures"],
        activity_id_column="idLecture",
    )
    shortcourse_event_by_shortcourse_id = build_activity_event_map(
        parsed["shortcourses"],
        activity_id_column="idShortcourse",
    )
    payment_required_event_ids = build_payment_required_event_ids(
        parsed["users_registered"]
    )
    paid_major_pairs = build_status_pairs(parsed["users_registered"])
    confirmed_shortcourse_pairs = build_status_pairs(
        parsed["users_registered_shortcourses"],
        extra_id_column="idShortcourseFK",
    )

    rows_by_pair: dict[tuple[int, str], LegacyAttendance] = {}
    skipped = 0

    for row in parsed["presence_lectures"]:
        user_id = decimal_to_int(row.get("idUserFK"))
        lecture_id = decimal_to_int(row.get("idLectureFK"))
        if user_id is None or lecture_id is None:
            skipped += 1
            continue

        detail_id = user_detail_by_user_id.get(user_id)
        legacy_event_id = lecture_event_by_lecture_id.get(lecture_id)
        if detail_id is None or legacy_event_id is None:
            skipped += 1
            continue

        category = resolve_lecture_category(
            user_id=user_id,
            legacy_event_id=legacy_event_id,
            payment_required_event_ids=payment_required_event_ids,
            paid_major_pairs=paid_major_pairs,
        )
        event_id = build_prefixed_id(PREFIX, "event", "lecture", lecture_id)
        rows_by_pair[(detail_id, event_id)] = LegacyAttendance(
            user_id=user_id,
            detail_id=detail_id,
            event_id=event_id,
            legacy_event_id=legacy_event_id,
            legacy_activity_id=lecture_id,
            kind="lecture",
            category=category,
        )

    for row in parsed["presence_shortcourses"]:
        user_id = decimal_to_int(row.get("idUserFK"))
        shortcourse_id = decimal_to_int(row.get("idShortcourseFK"))
        if user_id is None or shortcourse_id is None:
            skipped += 1
            continue

        detail_id = user_detail_by_user_id.get(user_id)
        legacy_event_id = shortcourse_event_by_shortcourse_id.get(shortcourse_id)
        if detail_id is None or legacy_event_id is None:
            skipped += 1
            continue

        category = resolve_shortcourse_category(
            user_id=user_id,
            legacy_event_id=legacy_event_id,
            shortcourse_id=shortcourse_id,
            payment_required_event_ids=payment_required_event_ids,
            paid_major_pairs=paid_major_pairs,
            confirmed_shortcourse_pairs=confirmed_shortcourse_pairs,
        )
        event_id = build_prefixed_id(PREFIX, "event", "shortcourse", shortcourse_id)
        rows_by_pair[(detail_id, event_id)] = LegacyAttendance(
            user_id=user_id,
            detail_id=detail_id,
            event_id=event_id,
            legacy_event_id=legacy_event_id,
            legacy_activity_id=shortcourse_id,
            kind="shortcourse",
            category=category,
        )

    return [rows_by_pair[key] for key in sorted(rows_by_pair)], skipped


def build_user_detail_map(rows: list[dict[str, Any]]) -> dict[int, int]:
    result: dict[int, int] = {}
    for row in rows:
        user_id = decimal_to_int(row.get("idUser"))
        detail_id = decimal_to_int(row.get("idDetailFK"))
        if user_id is not None and detail_id is not None:
            result[user_id] = detail_id
    return result


def build_activity_event_map(
    rows: list[dict[str, Any]],
    *,
    activity_id_column: str,
) -> dict[int, int]:
    result: dict[int, int] = {}
    for row in rows:
        activity_id = decimal_to_int(row.get(activity_id_column))
        event_id = decimal_to_int(row.get("idEventFK"))
        if activity_id is not None and event_id is not None:
            result[activity_id] = event_id
    return result


def build_status_pairs(
    rows: list[dict[str, Any]],
    *,
    extra_id_column: str | None = None,
) -> set[tuple[int, ...]]:
    result: set[tuple[int, ...]] = set()
    for row in rows:
        status = (coerce_text(row.get("status")) or "").upper()
        if status != "S":
            continue

        user_id = decimal_to_int(row.get("idUserFK"))
        event_id = decimal_to_int(row.get("idEventFK"))
        if user_id is None or event_id is None:
            continue

        if extra_id_column is None:
            result.add((user_id, event_id))
            continue

        extra_id = decimal_to_int(row.get(extra_id_column))
        if extra_id is not None:
            result.add((user_id, event_id, extra_id))
    return result


def build_payment_required_event_ids(rows: list[dict[str, Any]]) -> set[int]:
    result: set[int] = set()
    for row in rows:
        event_id = decimal_to_int(row.get("idEventFK"))
        amount = decimal_to_int(row.get("amount"))
        if event_id is not None and amount is not None and amount > 0:
            result.add(event_id)
    return result


def resolve_lecture_category(
    *,
    user_id: int,
    legacy_event_id: int,
    payment_required_event_ids: set[int],
    paid_major_pairs: set[tuple[int, ...]],
) -> AttendanceCategory:
    if (
        legacy_event_id in payment_required_event_ids
        and (user_id, legacy_event_id) not in paid_major_pairs
    ):
        return "NON_PAYING"
    return "REGULAR"


def resolve_shortcourse_category(
    *,
    user_id: int,
    legacy_event_id: int,
    shortcourse_id: int,
    payment_required_event_ids: set[int],
    paid_major_pairs: set[tuple[int, ...]],
    confirmed_shortcourse_pairs: set[tuple[int, ...]],
) -> AttendanceCategory:
    if (
        legacy_event_id in payment_required_event_ids
        and (user_id, legacy_event_id) not in paid_major_pairs
    ):
        return "NON_PAYING"
    if (user_id, legacy_event_id, shortcourse_id) not in confirmed_shortcourse_pairs:
        return "NON_SUBSCRIBED"
    return "REGULAR"


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
    legacy_attendances: list[LegacyAttendance],
) -> tuple[list[MatchedAttendance], set[int], set[str]]:
    external_refs = sorted(
        {build_prefixed_id(PREFIX, "legacy-detail", row.detail_id) for row in legacy_attendances}
    )
    event_ids = sorted({row.event_id for row in legacy_attendances})

    person_id_by_external_ref: dict[str, str] = {}
    existing_event_ids: set[str] = set()

    with db.cursor() as cursor:
        for chunk in chunks(external_refs, 1000):
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

        for chunk in chunks(event_ids, 1000):
            cursor.execute(
                """
                SELECT id
                FROM events
                WHERE id = ANY(%s)
                  AND "deletedAt" IS NULL
                """,
                (chunk,),
            )
            existing_event_ids.update(row[0] for row in cursor.fetchall())

    matched: list[MatchedAttendance] = []
    unmatched_people: set[int] = set()
    unmatched_events: set[str] = set()

    for row in legacy_attendances:
        if row.event_id not in existing_event_ids:
            unmatched_events.add(row.event_id)
            continue

        external_ref = build_prefixed_id(PREFIX, "legacy-detail", row.detail_id)
        person_id = person_id_by_external_ref.get(external_ref)
        if person_id is None:
            unmatched_people.add(row.detail_id)
            continue

        matched.append(
            MatchedAttendance(
                person_id=person_id,
                event_id=row.event_id,
                category=row.category,
                user_id=row.user_id,
                detail_id=row.detail_id,
                legacy_event_id=row.legacy_event_id,
                legacy_activity_id=row.legacy_activity_id,
                kind=row.kind,
            )
        )

    return matched, unmatched_people, unmatched_events


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


def chunks(items: list[T], size: int) -> Iterable[list[T]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def format_counter(counter: Counter[str]) -> str:
    if not counter:
        return "none"
    return ", ".join(f"{key}={counter[key]}" for key in sorted(counter.keys()))


def print_unmatched_people(unmatched_people: set[int]) -> None:
    if not unmatched_people:
        return

    print("Unmatched people externalRefs:")
    for detail_id in sorted(unmatched_people):
        print(f"- {build_prefixed_id(PREFIX, 'legacy-detail', detail_id)}")


def print_unmatched_events(unmatched_events: set[str]) -> None:
    if not unmatched_events:
        return

    print("Unmatched imported events:")
    for event_id in sorted(unmatched_events):
        print(f"- {event_id}")


def print_category_by_kind(rows: list[LegacyAttendance]) -> None:
    counter = Counter((row.kind, row.category) for row in rows)
    for kind in ("lecture", "shortcourse"):
        kind_counter = Counter(
            {category: count for (row_kind, category), count in counter.items() if row_kind == kind}
        )
        print(f"Legacy {kind} intent -> {format_counter(kind_counter)}")


if __name__ == "__main__":
    main()
