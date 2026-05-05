#!/usr/bin/env python3
"""
One-off migration from Firestore export JSON to PostgreSQL.

This imports:
- __collections__.majorEvents -> major_events
- __collections__.majorEvents.*.__collections__.subscriptions -> major_event_subscriptions
- __collections__.events -> events (+ derived event_groups)
- __collections__.events.*.__collections__.subscriptions -> event_subscriptions
- __collections__.events.*.__collections__.subscriptions (mainEventID) -> event_group_subscriptions
- __collections__.users -> people
- __collections__.events.*.__collections__.attendance -> event_attendances
- __collections__.events.*.__collections__.non-paying-attendance -> event_attendances

ID strategy:
- Firestore IDs are remapped to deterministic UUIDv7-like IDs for imported entities.
- Foreign-key references are rebound to those generated IDs.
- Original Firestore person ID is preserved in people.externalRef.

Requirements:
  pip install "psycopg[binary]"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


DEFAULT_UNKNOWN_EMOJI = "❔"


@dataclass(slots=True)
class SubscriptionSeed:
    created_at: datetime
    created_by_id: str | None


@dataclass(slots=True)
class EventSubscriptionSeed:
    created_at: datetime
    created_by_id: str | None
    event_group_subscription_id: str | None


@dataclass(slots=True)
class MigrationPayload:
    major_events: list[dict[str, Any]]
    payment_infos: list[dict[str, Any]]
    major_event_prices: list[dict[str, Any]]
    price_tiers: list[dict[str, Any]]
    event_groups: list[dict[str, Any]]
    events: list[dict[str, Any]]
    people: list[dict[str, Any]]
    major_event_subscriptions: list[dict[str, Any]]
    event_group_subscriptions: list[dict[str, Any]]
    event_subscriptions: list[dict[str, Any]]
    event_attendances: list[dict[str, Any]]
    unknown_major_event_refs: int
    skipped_user_major_event_refs: int
    skipped_user_event_refs: int
    generated_fallback_people: int


@dataclass(slots=True)
class IdMappings:
    major_event_ids: dict[str, str]
    event_ids: dict[str, str]
    event_group_ids: dict[str, str]
    person_ids: dict[str, str]


class Uuid7LikeGenerator:
    """
    Deterministic UUIDv7-like generator.

    The UUID is not a strict RFC 9562 uuid7 implementation, but it follows the
    same structural pattern: time-ordered high bits + v7/version bits + random bits.
    """

    def __init__(self, base_timestamp_ms: int = 1704067200000) -> None:
        self.base_timestamp_ms = base_timestamp_ms
        self.counter = 0
        self.generated_by_seed: dict[str, str] = {}

    def for_seed(self, seed: str) -> str:
        existing = self.generated_by_seed.get(seed)
        if existing is not None:
            return existing

        timestamp_ms = (self.base_timestamp_ms + self.counter) & ((1 << 48) - 1)
        self.counter += 1

        digest = hashlib.sha256(seed.encode("utf-8")).digest()
        rand_a = int.from_bytes(digest[0:2], "big") & 0x0FFF
        rand_b = int.from_bytes(digest[2:10], "big") & ((1 << 62) - 1)

        value = (
            (timestamp_ms << 80)
            | (0x7 << 76)
            | (rand_a << 64)
            | (0b10 << 62)
            | rand_b
        )
        generated = str(uuid.UUID(int=value))
        self.generated_by_seed[seed] = generated
        return generated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import Firestore JSON data into PostgreSQL schema."
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
        "--dry-run",
        action="store_true",
        help="Build and report mapped rows without writing to database.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(args.input)

    print(
        "Prepared rows -> "
        f"major_events={len(payload.major_events)}, "
        f"payment_infos={len(payload.payment_infos)}, "
        f"major_event_prices={len(payload.major_event_prices)}, "
        f"price_tiers={len(payload.price_tiers)}, "
        f"event_groups={len(payload.event_groups)}, "
        f"events={len(payload.events)}, "
        f"people={len(payload.people)}, "
        f"major_event_subscriptions={len(payload.major_event_subscriptions)}, "
        f"event_group_subscriptions={len(payload.event_group_subscriptions)}, "
        f"event_subscriptions={len(payload.event_subscriptions)}, "
        f"event_attendances={len(payload.event_attendances)}, "
        f"generated_fallback_people={payload.generated_fallback_people}, "
        f"events_with_unknown_major_ref={payload.unknown_major_event_refs}, "
        f"skipped_user_major_event_refs={payload.skipped_user_major_event_refs}, "
        f"skipped_user_event_refs={payload.skipped_user_event_refs}"
    )

    if args.dry_run:
        print("Dry run enabled. No database changes were made.")
        return

    database_url = args.database_url or (
        f"postgresql://{args.db_user}:{args.db_password}@"
        f"{args.db_host}:{args.db_port}/{args.db_name}"
    )
    write_payload(database_url, payload)
    print("Import completed.")


def build_payload(json_path: Path) -> MigrationPayload:
    with json_path.open("r", encoding="utf-8") as file:
        source = json.load(file)

    collections = source.get("__collections__", {})
    raw_major_events = collections.get("majorEvents", {})
    raw_events = collections.get("events", {})
    raw_users = collections.get("users", {})

    if not isinstance(raw_major_events, dict):
        raise ValueError("Expected '__collections__.majorEvents' to be an object.")
    if not isinstance(raw_events, dict):
        raise ValueError("Expected '__collections__.events' to be an object.")
    if not isinstance(raw_users, dict):
        raise ValueError("Expected '__collections__.users' to be an object.")

    now = utc_now()
    id_generator = Uuid7LikeGenerator()

    mappings = IdMappings(
        major_event_ids={
            legacy_id: id_generator.for_seed(f"major-event:{legacy_id}")
            for legacy_id in sorted(raw_major_events.keys())
        },
        event_ids={
            legacy_id: id_generator.for_seed(f"event:{legacy_id}")
            for legacy_id in sorted(raw_events.keys())
        },
        event_group_ids={},
        person_ids={},
    )

    people_rows_by_id: dict[str, dict[str, Any]] = {}
    build_people_from_users(raw_users, mappings, people_rows_by_id, id_generator, now)
    initial_people_count = len(people_rows_by_id)

    (
        major_events,
        payment_infos,
        major_event_prices,
        price_tiers,
        major_event_subscriptions,
        major_sub_event_seeds,
    ) = map_major_events(
        raw_major_events,
        mappings,
        people_rows_by_id,
        id_generator,
        now,
    )

    (
        event_groups,
        events,
        unknown_major_event_refs,
        event_subscription_seeds_from_events,
        event_group_subscription_seeds_from_events,
        event_group_event_ids,
    ) = map_events(
        raw_events,
        mappings,
        people_rows_by_id,
        id_generator,
        now,
    )

    (
        major_event_subscriptions,
        skipped_user_major_event_refs,
    ) = merge_major_subscriptions_from_user_refs(
        raw_users,
        mappings,
        people_rows_by_id,
        id_generator,
        major_event_subscriptions,
        now,
    )

    (
        event_subscriptions,
        event_group_subscriptions,
        skipped_user_event_refs,
    ) = map_event_subscriptions(
        raw_users,
        mappings,
        people_rows_by_id,
        id_generator,
        event_subscription_seeds_from_events,
        major_sub_event_seeds,
        event_group_subscription_seeds_from_events,
        event_group_event_ids,
        now,
    )

    event_attendances = map_event_attendances(
        raw_events,
        mappings,
        people_rows_by_id,
        id_generator,
        now,
    )

    return MigrationPayload(
        major_events=major_events,
        payment_infos=payment_infos,
        major_event_prices=major_event_prices,
        price_tiers=price_tiers,
        event_groups=event_groups,
        events=events,
        people=list(people_rows_by_id.values()),
        major_event_subscriptions=major_event_subscriptions,
        event_group_subscriptions=event_group_subscriptions,
        event_subscriptions=event_subscriptions,
        event_attendances=event_attendances,
        unknown_major_event_refs=unknown_major_event_refs,
        skipped_user_major_event_refs=skipped_user_major_event_refs,
        skipped_user_event_refs=skipped_user_event_refs,
        generated_fallback_people=len(people_rows_by_id) - initial_people_count,
    )


def build_people_from_users(
    raw_users: dict[str, Any],
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    fallback_now: datetime,
) -> None:
    for user_key in sorted(raw_users.keys()):
        raw_user = raw_users.get(user_key)
        if not isinstance(raw_user, dict):
            continue

        canonical_legacy_id = coerce_text(raw_user.get("uid")) or user_key
        person_id = mappings.person_ids.get(canonical_legacy_id)
        if person_id is None:
            person_id = id_generator.for_seed(f"person:{canonical_legacy_id}")

        mappings.person_ids[canonical_legacy_id] = person_id
        mappings.person_ids[user_key] = person_id

        existing = people_rows_by_id.get(person_id)
        if existing is None:
            people_rows_by_id[person_id] = {
                "id": person_id,
                "name": (
                    coerce_text(raw_user.get("fullName"))
                    or coerce_text(raw_user.get("displayName"))
                    or coerce_text(raw_user.get("email"))
                    or f"Legacy User {canonical_legacy_id}"
                ),
                "email": coerce_text(raw_user.get("email")),
                "phone": normalize_phone(raw_user.get("phone")),
                "identityDocument": normalize_identity_document(raw_user.get("cpf")),
                "academicId": coerce_text(raw_user.get("academicID")),
                "externalRef": canonical_legacy_id,
                "createdAt": fallback_now,
                "updatedAt": fallback_now,
            }
            continue

        if existing["email"] is None:
            existing["email"] = coerce_text(raw_user.get("email"))
        if existing["phone"] is None:
            existing["phone"] = normalize_phone(raw_user.get("phone"))
        if existing["identityDocument"] is None:
            existing["identityDocument"] = normalize_identity_document(raw_user.get("cpf"))
        if existing["academicId"] is None:
            existing["academicId"] = coerce_text(raw_user.get("academicID"))


def resolve_person_id(
    legacy_person_id: str,
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    fallback_now: datetime,
) -> str:
    existing = mappings.person_ids.get(legacy_person_id)
    if existing is not None:
        return existing

    generated = id_generator.for_seed(f"person-fallback:{legacy_person_id}")
    mappings.person_ids[legacy_person_id] = generated
    people_rows_by_id[generated] = {
        "id": generated,
        "name": f"Legacy Person {legacy_person_id}",
        "email": None,
        "phone": None,
        "identityDocument": None,
        "academicId": None,
        "externalRef": legacy_person_id,
        "createdAt": fallback_now,
        "updatedAt": fallback_now,
    }
    return generated


def resolve_event_group_id(
    group_name: str,
    mappings: IdMappings,
    id_generator: Uuid7LikeGenerator,
) -> str:
    existing = mappings.event_group_ids.get(group_name)
    if existing is not None:
        return existing

    generated = id_generator.for_seed(f"event-group:{group_name}")
    mappings.event_group_ids[group_name] = generated
    return generated


def map_major_events(
    raw_major_events: dict[str, Any],
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    fallback_now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[tuple[str, str], SubscriptionSeed],
]:
    major_event_rows: list[dict[str, Any]] = []
    payment_info_rows: list[dict[str, Any]] = []
    major_event_price_rows: list[dict[str, Any]] = []
    price_tier_rows: list[dict[str, Any]] = []
    major_event_sub_rows: list[dict[str, Any]] = []
    major_sub_event_seeds: dict[tuple[str, str], SubscriptionSeed] = {}
    major_sub_seen: set[tuple[str, str]] = set()

    for legacy_major_event_id in sorted(raw_major_events.keys()):
        raw_major_event = raw_major_events.get(legacy_major_event_id)
        if not isinstance(raw_major_event, dict):
            continue

        major_event_id = mappings.major_event_ids[legacy_major_event_id]
        name = (
            coerce_text(raw_major_event.get("name"))
            or f"Legacy Major Event {legacy_major_event_id}"
        )

        start_date = (
            parse_firestore_timestamp(raw_major_event.get("eventStartDate"))
            or parse_firestore_timestamp(raw_major_event.get("dateStart"))
            or parse_firestore_timestamp(raw_major_event.get("createdOn"))
            or fallback_now
        )
        end_date = (
            parse_firestore_timestamp(raw_major_event.get("eventEndDate"))
            or parse_firestore_timestamp(raw_major_event.get("dateEnd"))
            or start_date
        )
        created_at = (
            parse_firestore_timestamp(raw_major_event.get("createdOn")) or fallback_now
        )

        contact_info, contact_type = map_contact_info(raw_major_event.get("contactInfo"))
        payment_dict = (
            raw_major_event.get("paymentInfo")
            if isinstance(raw_major_event.get("paymentInfo"), dict)
            else {}
        )
        raw_price = raw_major_event.get("price")
        major_event_price_row, major_event_price_tier_rows = build_major_event_price_rows(
            major_event_id=major_event_id,
            raw_price=raw_price,
            id_generator=id_generator,
            created_at=created_at,
        )

        major_event_rows.append(
            {
                "id": major_event_id,
                "name": name,
                "startDate": start_date,
                "endDate": end_date,
                "description": coerce_text(raw_major_event.get("description")),
                "emoji": extract_emoji(raw_major_event),
                "subscriptionStartDate": parse_firestore_timestamp(
                    raw_major_event.get("subscriptionStartDate")
                ),
                "subscriptionEndDate": parse_firestore_timestamp(
                    raw_major_event.get("subscriptionEndDate")
                ),
                "maxCoursesPerAttendee": parse_int(raw_major_event.get("maxCourses")),
                "maxLecturesPerAttendee": parse_int(raw_major_event.get("maxLectures")),
                "buttonText": coerce_text_from_dict(raw_major_event.get("button"), "text"),
                "buttonLink": coerce_text_from_dict(raw_major_event.get("button"), "url"),
                "contactInfo": contact_info,
                "contactType": contact_type,
                "isPaymentRequired": infer_is_payment_required(payment_dict, raw_price),
                "additionalPaymentInfo": coerce_text(
                    payment_dict.get("additionalPaymentInformation")
                ),
                "createdAt": created_at,
                "createdById": coerce_text(raw_major_event.get("createdBy")),
                "updatedAt": fallback_now,
            }
        )

        payment_row = build_payment_info_row(major_event_id, payment_dict, id_generator)
        if payment_row is not None:
            payment_info_rows.append(payment_row)
        if major_event_price_row is not None:
            major_event_price_rows.append(major_event_price_row)
            price_tier_rows.extend(major_event_price_tier_rows)

        raw_subscriptions = extract_subcollection(raw_major_event, "subscriptions")
        for legacy_person_id in sorted(raw_subscriptions.keys()):
            raw_subscription = raw_subscriptions.get(legacy_person_id)
            if not isinstance(raw_subscription, dict):
                continue

            person_id = resolve_person_id(
                legacy_person_id,
                mappings,
                people_rows_by_id,
                id_generator,
                fallback_now,
            )
            subscription_pair = (person_id, major_event_id)
            if subscription_pair in major_sub_seen:
                continue
            major_sub_seen.add(subscription_pair)

            payment = (
                raw_subscription.get("payment")
                if isinstance(raw_subscription.get("payment"), dict)
                else {}
            )
            created_at_sub = (
                parse_firestore_timestamp(raw_subscription.get("time"))
                or parse_firestore_timestamp(payment.get("time"))
                or fallback_now
            )
            payment_date = (
                parse_firestore_timestamp(payment.get("validationTime"))
                or parse_firestore_timestamp(payment.get("validationDate"))
                or parse_firestore_timestamp(payment.get("time"))
            )
            created_by_id_sub = coerce_text(payment.get("author"))

            major_event_sub_rows.append(
                {
                    "id": id_generator.for_seed(
                        f"major-event-subscription:{major_event_id}:{person_id}"
                    ),
                    "majorEventId": major_event_id,
                    "personId": person_id,
                    "amountPaid": parse_int(payment.get("price")),
                    "paymentDate": payment_date,
                    "paymentTier": coerce_text(raw_subscription.get("subscriptionType")),
                    "subscriptionStatus": map_subscription_status(payment.get("status")),
                    "createdAt": created_at_sub,
                    "createdById": created_by_id_sub,
                }
            )

            raw_subscribed_events = raw_subscription.get("subscribedToEvents")
            if isinstance(raw_subscribed_events, list):
                for legacy_event_id in raw_subscribed_events:
                    legacy_event_id_text = coerce_text(legacy_event_id)
                    if legacy_event_id_text is None:
                        continue
                    mapped_event_id = mappings.event_ids.get(legacy_event_id_text)
                    if mapped_event_id is None:
                        continue
                    upsert_seed(
                        major_sub_event_seeds,
                        (person_id, mapped_event_id),
                        created_at_sub,
                        created_by_id_sub,
                    )

    return (
        major_event_rows,
        payment_info_rows,
        major_event_price_rows,
        price_tier_rows,
        major_event_sub_rows,
        major_sub_event_seeds,
    )


def merge_major_subscriptions_from_user_refs(
    raw_users: dict[str, Any],
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    major_event_sub_rows: list[dict[str, Any]],
    fallback_now: datetime,
) -> tuple[list[dict[str, Any]], int]:
    seen_pairs = {(row["personId"], row["majorEventId"]) for row in major_event_sub_rows}
    skipped_refs = 0

    for user_key in sorted(raw_users.keys()):
        raw_user = raw_users.get(user_key)
        if not isinstance(raw_user, dict):
            continue

        person_id = resolve_person_id(
            user_key,
            mappings,
            people_rows_by_id,
            id_generator,
            fallback_now,
        )
        raw_refs = extract_subcollection(raw_user, "majorEventSubscriptions")

        for legacy_major_event_id in sorted(raw_refs.keys()):
            raw_ref_doc = raw_refs.get(legacy_major_event_id)
            if not isinstance(raw_ref_doc, dict):
                continue

            major_event_id = mappings.major_event_ids.get(legacy_major_event_id)
            if major_event_id is None:
                skipped_refs += 1
                continue

            pair = (person_id, major_event_id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            major_event_sub_rows.append(
                {
                    "id": id_generator.for_seed(
                        f"major-event-subscription:{major_event_id}:{person_id}"
                    ),
                    "majorEventId": major_event_id,
                    "personId": person_id,
                    "amountPaid": None,
                    "paymentDate": None,
                    "paymentTier": None,
                    "subscriptionStatus": "WAITING_RECEIPT_UPLOAD",
                    "createdAt": fallback_now,
                    "createdById": None,
                }
            )

    return major_event_sub_rows, skipped_refs


def map_events(
    raw_events: dict[str, Any],
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    fallback_now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    int,
    dict[tuple[str, str], EventSubscriptionSeed],
    dict[tuple[str, str], SubscriptionSeed],
    dict[str, set[str]],
]:
    event_rows: list[dict[str, Any]] = []
    unknown_major_event_refs = 0
    event_subscription_seeds: dict[tuple[str, str], EventSubscriptionSeed] = {}
    event_group_subscription_seeds: dict[tuple[str, str], SubscriptionSeed] = {}
    event_group_event_ids: dict[str, set[str]] = {}
    event_group_emojis: dict[str, str] = {}

    for legacy_event_id in sorted(raw_events.keys()):
        raw_event = raw_events.get(legacy_event_id)
        if not isinstance(raw_event, dict):
            continue

        event_id = mappings.event_ids[legacy_event_id]
        name = coerce_text(raw_event.get("name")) or f"Legacy Event {legacy_event_id}"

        start_date = (
            parse_firestore_timestamp(raw_event.get("eventStartDate"))
            or parse_firestore_timestamp(raw_event.get("createdOn"))
            or fallback_now
        )
        end_date = parse_firestore_timestamp(raw_event.get("eventEndDate")) or start_date
        created_at = parse_firestore_timestamp(raw_event.get("createdOn")) or fallback_now

        location = raw_event.get("location")
        latitude: float | None = None
        longitude: float | None = None
        location_description: str | None = None
        if isinstance(location, dict):
            latitude = parse_float(location.get("lat"))
            longitude = parse_float(location.get("lon"))
            location_description = coerce_text(location.get("description"))

        legacy_major_event_ref = coerce_text(raw_event.get("inMajorEvent"))
        major_event_id: str | None = None
        if legacy_major_event_ref:
            mapped = mappings.major_event_ids.get(legacy_major_event_ref)
            if mapped is not None:
                major_event_id = mapped
            else:
                unknown_major_event_refs += 1

        event_group_payload = raw_event.get("eventGroup")
        event_group_id: str | None = None
        event_group_name = extract_event_group_name(event_group_payload)
        main_event_id = extract_event_group_main_event_id(event_group_payload)
        event_group_event_id_list = extract_event_group_event_ids(event_group_payload)
        if event_group_name is not None:
            event_group_id = resolve_event_group_id(event_group_name, mappings, id_generator)
            event_group_ids = event_group_event_ids.setdefault(event_group_id, set())
            event_group_ids.add(event_id)
            for legacy_group_event_id in event_group_event_id_list:
                mapped_event_id = mappings.event_ids.get(legacy_group_event_id)
                if mapped_event_id is not None:
                    event_group_ids.add(mapped_event_id)
            if main_event_id is not None:
                mapped_main_event_id = mappings.event_ids.get(main_event_id)
                if mapped_main_event_id is not None:
                    event_group_ids.add(mapped_main_event_id)
                main_event = raw_events.get(main_event_id)
                if isinstance(main_event, dict):
                    event_group_emojis[event_group_id] = extract_emoji(main_event)

        online_attendance_code = coerce_text(raw_event.get("attendanceCode"))
        online_attendance_start = parse_firestore_timestamp(
            raw_event.get("attendanceCollectionStart")
        )
        online_attendance_end = parse_firestore_timestamp(
            raw_event.get("attendanceCollectionEnd")
        )
        is_online_attendance_allowed = bool(
            online_attendance_code or online_attendance_start or online_attendance_end
        )

        event_rows.append(
            {
                "id": event_id,
                "name": name,
                "creditMinutes": parse_credit_minutes(raw_event.get("creditHours")),
                "startDate": start_date,
                "endDate": end_date,
                "type": map_event_type(raw_event.get("eventType")),
                "emoji": extract_emoji(raw_event),
                "description": coerce_text(raw_event.get("description")),
                "shortDescription": coerce_text(raw_event.get("shortDescription")),
                "latitude": latitude,
                "longitude": longitude,
                "locationDescription": location_description,
                "majorEventId": major_event_id,
                "eventGroupId": event_group_id,
                "allowSubscription": coerce_bool(raw_event.get("allowSubscription")),
                "slots": parse_int(raw_event.get("slotsAvailable")),
                "shouldIssueCertificate": coerce_bool(raw_event.get("issueCertificate")),
                "shouldCollectAttendance": coerce_bool(raw_event.get("collectAttendance")),
                "isOnlineAttendanceAllowed": is_online_attendance_allowed,
                "onlineAttendanceCode": online_attendance_code,
                "onlineAttendanceStartDate": online_attendance_start,
                "onlineAttendanceEndDate": online_attendance_end,
                "publiclyVisible": True,
                "youtubeCode": coerce_text(raw_event.get("youtubeCode")),
                "buttonText": coerce_text_from_dict(raw_event.get("button"), "text"),
                "buttonLink": coerce_text_from_dict(raw_event.get("button"), "url"),
                "createdAt": created_at,
                "createdById": coerce_text(raw_event.get("createdBy")),
                "updatedAt": fallback_now,
            }
        )

        is_group_main_event = (
            event_group_id is not None
            and main_event_id is not None
            and legacy_event_id == main_event_id
        )

        raw_event_subscriptions = extract_subcollection(raw_event, "subscriptions")
        for legacy_person_id in sorted(raw_event_subscriptions.keys()):
            raw_subscription = raw_event_subscriptions.get(legacy_person_id)
            if not isinstance(raw_subscription, dict):
                continue

            person_id = resolve_person_id(
                legacy_person_id,
                mappings,
                people_rows_by_id,
                id_generator,
                fallback_now,
            )
            seed_created_at = (
                parse_firestore_timestamp(raw_subscription.get("time"))
                or created_at
                or fallback_now
            )
            if is_group_main_event and event_group_id is not None:
                upsert_seed(
                    event_group_subscription_seeds,
                    (person_id, event_group_id),
                    seed_created_at,
                    coerce_text(raw_subscription.get("author")),
                )
            else:
                upsert_event_subscription_seed(
                    event_subscription_seeds,
                    (person_id, event_id),
                    seed_created_at,
                    coerce_text(raw_subscription.get("author")),
                    None,
                )

    event_group_rows = [
        {
            "id": event_group_id,
            "name": group_name,
            "emoji": event_group_emojis.get(event_group_id, DEFAULT_UNKNOWN_EMOJI),
            "createdAt": fallback_now,
            "updatedAt": fallback_now,
        }
        for group_name, event_group_id in sorted(mappings.event_group_ids.items())
    ]

    return (
        event_group_rows,
        event_rows,
        unknown_major_event_refs,
        event_subscription_seeds,
        event_group_subscription_seeds,
        event_group_event_ids,
    )


def map_event_subscriptions(
    raw_users: dict[str, Any],
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    event_subscription_seeds_from_events: dict[tuple[str, str], EventSubscriptionSeed],
    major_sub_event_seeds: dict[tuple[str, str], SubscriptionSeed],
    event_group_subscription_seeds: dict[tuple[str, str], SubscriptionSeed],
    event_group_event_ids: dict[str, set[str]],
    fallback_now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    event_subscription_seeds: dict[tuple[str, str], EventSubscriptionSeed] = dict(
        event_subscription_seeds_from_events
    )
    for pair, seed in major_sub_event_seeds.items():
        upsert_event_subscription_seed(
            event_subscription_seeds,
            pair,
            seed.created_at,
            seed.created_by_id,
            None,
        )

    skipped_user_event_refs = 0
    for user_key in sorted(raw_users.keys()):
        raw_user = raw_users.get(user_key)
        if not isinstance(raw_user, dict):
            continue

        person_id = resolve_person_id(
            user_key,
            mappings,
            people_rows_by_id,
            id_generator,
            fallback_now,
        )
        raw_refs = extract_subcollection(raw_user, "eventSubscriptions")

        for event_key in sorted(raw_refs.keys()):
            raw_ref_doc = raw_refs.get(event_key)
            if not isinstance(raw_ref_doc, dict):
                continue

            reference = raw_ref_doc.get("reference")
            legacy_event_id = parse_event_id_from_reference(reference) or event_key
            event_id = mappings.event_ids.get(legacy_event_id)
            if event_id is None:
                skipped_user_event_refs += 1
                continue

            upsert_event_subscription_seed(
                event_subscription_seeds,
                (person_id, event_id),
                fallback_now,
                None,
                None,
            )

    event_group_subscription_rows: list[dict[str, Any]] = []
    event_group_subscription_ids: dict[tuple[str, str], str] = {}
    for person_id, event_group_id in sorted(event_group_subscription_seeds.keys()):
        seed = event_group_subscription_seeds[(person_id, event_group_id)]
        subscription_id = id_generator.for_seed(
            f"event-group-subscription:{event_group_id}:{person_id}"
        )
        event_group_subscription_ids[(person_id, event_group_id)] = subscription_id
        event_group_subscription_rows.append(
            {
                "id": subscription_id,
                "eventGroupId": event_group_id,
                "personId": person_id,
                "createdAt": seed.created_at,
                "createdById": seed.created_by_id,
            }
        )

    for person_id, event_group_id in sorted(event_group_subscription_ids.keys()):
        subscription_id = event_group_subscription_ids[(person_id, event_group_id)]
        seed = event_group_subscription_seeds[(person_id, event_group_id)]
        event_ids = sorted(event_group_event_ids.get(event_group_id, set()))
        for event_id in event_ids:
            upsert_event_subscription_seed(
                event_subscription_seeds,
                (person_id, event_id),
                seed.created_at,
                seed.created_by_id,
                subscription_id,
            )

    event_subscription_rows: list[dict[str, Any]] = []
    for person_id, event_id in sorted(event_subscription_seeds.keys()):
        seed = event_subscription_seeds[(person_id, event_id)]
        event_subscription_rows.append(
            {
                "id": id_generator.for_seed(f"event-subscription:{event_id}:{person_id}"),
                "eventId": event_id,
                "personId": person_id,
                "eventGroupSubscriptionId": seed.event_group_subscription_id,
                "createdAt": seed.created_at,
                "createdById": seed.created_by_id,
            }
        )

    return event_subscription_rows, event_group_subscription_rows, skipped_user_event_refs


def map_event_attendances(
    raw_events: dict[str, Any],
    mappings: IdMappings,
    people_rows_by_id: dict[str, dict[str, Any]],
    id_generator: Uuid7LikeGenerator,
    fallback_now: datetime,
) -> list[dict[str, Any]]:
    attendance_by_pair: dict[tuple[str, str], SubscriptionSeed] = {}

    for legacy_event_id in sorted(raw_events.keys()):
        raw_event = raw_events.get(legacy_event_id)
        if not isinstance(raw_event, dict):
            continue

        event_id = mappings.event_ids[legacy_event_id]
        for collection_name in ("attendance", "non-paying-attendance"):
            raw_attendance = extract_subcollection(raw_event, collection_name)
            for legacy_person_id in sorted(raw_attendance.keys()):
                raw_attendance_doc = raw_attendance.get(legacy_person_id)
                if not isinstance(raw_attendance_doc, dict):
                    continue

                person_id = resolve_person_id(
                    legacy_person_id,
                    mappings,
                    people_rows_by_id,
                    id_generator,
                    fallback_now,
                )
                attended_at = (
                    parse_firestore_timestamp(raw_attendance_doc.get("time")) or fallback_now
                )
                created_by_id = coerce_text(raw_attendance_doc.get("author"))
                upsert_seed(
                    attendance_by_pair,
                    (person_id, event_id),
                    attended_at,
                    created_by_id,
                )

    return [
        {
            "personId": person_id,
            "eventId": event_id,
            "attendedAt": seed.created_at,
            "createdAt": seed.created_at,
            "createdById": seed.created_by_id,
        }
        for (person_id, event_id), seed in sorted(attendance_by_pair.items())
    ]

def write_payload(database_url: str, payload: MigrationPayload) -> None:
    try:
        import psycopg
    except ImportError as error:
        raise RuntimeError(
            "Missing dependency 'psycopg'. Install with: pip install \"psycopg[binary]\""
        ) from error

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            execute_many_if_any(
                cursor,
                """
                INSERT INTO major_events (
                  id, name, "startDate", "endDate", description, emoji,
                  "subscriptionStartDate", "subscriptionEndDate",
                  "maxCoursesPerAttendee", "maxLecturesPerAttendee",
                  "buttonText", "buttonLink", "contactInfo", "contactType",
                  "isPaymentRequired", "additionalPaymentInfo",
                  "createdAt", "createdById", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(startDate)s, %(endDate)s, %(description)s, %(emoji)s,
                  %(subscriptionStartDate)s, %(subscriptionEndDate)s,
                  %(maxCoursesPerAttendee)s, %(maxLecturesPerAttendee)s,
                  %(buttonText)s, %(buttonLink)s, %(contactInfo)s, %(contactType)s,
                  %(isPaymentRequired)s, %(additionalPaymentInfo)s,
                  %(createdAt)s, %(createdById)s, %(updatedAt)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  "startDate" = EXCLUDED."startDate",
                  "endDate" = EXCLUDED."endDate",
                  description = EXCLUDED.description,
                  emoji = EXCLUDED.emoji,
                  "subscriptionStartDate" = EXCLUDED."subscriptionStartDate",
                  "subscriptionEndDate" = EXCLUDED."subscriptionEndDate",
                  "maxCoursesPerAttendee" = EXCLUDED."maxCoursesPerAttendee",
                  "maxLecturesPerAttendee" = EXCLUDED."maxLecturesPerAttendee",
                  "buttonText" = EXCLUDED."buttonText",
                  "buttonLink" = EXCLUDED."buttonLink",
                  "contactInfo" = EXCLUDED."contactInfo",
                  "contactType" = EXCLUDED."contactType",
                  "isPaymentRequired" = EXCLUDED."isPaymentRequired",
                  "additionalPaymentInfo" = EXCLUDED."additionalPaymentInfo",
                  "createdById" = EXCLUDED."createdById",
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                payload.major_events,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO payment_info (
                  id, "bankName", agency, account, holder, document, "majorEventId"
                )
                VALUES (
                  %(id)s, %(bankName)s, %(agency)s, %(account)s, %(holder)s, %(document)s,
                  %(majorEventId)s
                )
                ON CONFLICT ("majorEventId") DO UPDATE SET
                  "bankName" = EXCLUDED."bankName",
                  agency = EXCLUDED.agency,
                  account = EXCLUDED.account,
                  holder = EXCLUDED.holder,
                  document = EXCLUDED.document
                """,
                payload.payment_infos,
            )

            if payload.major_event_prices:
                cursor.execute(
                    """
                    DELETE FROM price_tiers
                    WHERE "priceId" IN (
                      SELECT id
                      FROM major_event_prices
                      WHERE "majorEventId" = ANY(%s)
                    )
                    """,
                    ([row["majorEventId"] for row in payload.major_event_prices],),
                )
            execute_many_if_any(
                cursor,
                """
                INSERT INTO major_event_prices (
                  id, "majorEventId", type, "createdAt"
                )
                VALUES (
                  %(id)s, %(majorEventId)s, %(type)s, %(createdAt)s
                )
                ON CONFLICT ("majorEventId") DO UPDATE SET
                  id = EXCLUDED.id,
                  type = EXCLUDED.type,
                  "createdAt" = EXCLUDED."createdAt"
                """,
                payload.major_event_prices,
            )
            execute_many_if_any(
                cursor,
                """
                INSERT INTO price_tiers (
                  id, "priceId", name, value
                )
                VALUES (
                  %(id)s, %(priceId)s, %(name)s, %(value)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  "priceId" = EXCLUDED."priceId",
                  name = EXCLUDED.name,
                  value = EXCLUDED.value
                """,
                payload.price_tiers,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO event_groups (
                  id, name, emoji, "createdAt", "updatedAt"
                )
                VALUES (%(id)s, %(name)s, %(emoji)s, %(createdAt)s, %(updatedAt)s)
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  emoji = EXCLUDED.emoji,
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                payload.event_groups,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO events (
                  id, name, "creditMinutes", "startDate", "endDate", type, emoji,
                  description, "shortDescription", latitude, longitude, "locationDescription",
                  "majorEventId", "eventGroupId",
                  "allowSubscription", slots,
                  "shouldIssueCertificate", "shouldCollectAttendance",
                  "isOnlineAttendanceAllowed", "onlineAttendanceCode",
                  "onlineAttendanceStartDate", "onlineAttendanceEndDate",
                  "publiclyVisible", "youtubeCode", "buttonText", "buttonLink",
                  "createdAt", "createdById", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(creditMinutes)s, %(startDate)s, %(endDate)s, %(type)s,
                  %(emoji)s, %(description)s, %(shortDescription)s, %(latitude)s, %(longitude)s,
                  %(locationDescription)s, %(majorEventId)s, %(eventGroupId)s,
                  %(allowSubscription)s, %(slots)s,
                  %(shouldIssueCertificate)s, %(shouldCollectAttendance)s,
                  %(isOnlineAttendanceAllowed)s, %(onlineAttendanceCode)s,
                  %(onlineAttendanceStartDate)s, %(onlineAttendanceEndDate)s,
                  %(publiclyVisible)s, %(youtubeCode)s, %(buttonText)s, %(buttonLink)s,
                  %(createdAt)s, %(createdById)s, %(updatedAt)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  "creditMinutes" = EXCLUDED."creditMinutes",
                  "startDate" = EXCLUDED."startDate",
                  "endDate" = EXCLUDED."endDate",
                  type = EXCLUDED.type,
                  emoji = EXCLUDED.emoji,
                  description = EXCLUDED.description,
                  "shortDescription" = EXCLUDED."shortDescription",
                  latitude = EXCLUDED.latitude,
                  longitude = EXCLUDED.longitude,
                  "locationDescription" = EXCLUDED."locationDescription",
                  "majorEventId" = EXCLUDED."majorEventId",
                  "eventGroupId" = EXCLUDED."eventGroupId",
                  "allowSubscription" = EXCLUDED."allowSubscription",
                  slots = EXCLUDED.slots,
                  "shouldIssueCertificate" = EXCLUDED."shouldIssueCertificate",
                  "shouldCollectAttendance" = EXCLUDED."shouldCollectAttendance",
                  "isOnlineAttendanceAllowed" = EXCLUDED."isOnlineAttendanceAllowed",
                  "onlineAttendanceCode" = EXCLUDED."onlineAttendanceCode",
                  "onlineAttendanceStartDate" = EXCLUDED."onlineAttendanceStartDate",
                  "onlineAttendanceEndDate" = EXCLUDED."onlineAttendanceEndDate",
                  "publiclyVisible" = EXCLUDED."publiclyVisible",
                  "youtubeCode" = EXCLUDED."youtubeCode",
                  "buttonText" = EXCLUDED."buttonText",
                  "buttonLink" = EXCLUDED."buttonLink",
                  "createdById" = EXCLUDED."createdById",
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                payload.events,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO people (
                  id, name, email, phone, "identityDocument", "academicId", "externalRef",
                  "createdAt", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(email)s, %(phone)s, %(identityDocument)s, %(academicId)s,
                  %(externalRef)s, %(createdAt)s, %(updatedAt)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  email = EXCLUDED.email,
                  phone = EXCLUDED.phone,
                  "identityDocument" = EXCLUDED."identityDocument",
                  "academicId" = EXCLUDED."academicId",
                  "externalRef" = EXCLUDED."externalRef",
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                payload.people,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO major_event_subscriptions (
                  id, "majorEventId", "personId", "amountPaid", "paymentDate",
                  "paymentTier", "subscriptionStatus", "createdAt", "createdById"
                )
                VALUES (
                  %(id)s, %(majorEventId)s, %(personId)s, %(amountPaid)s, %(paymentDate)s,
                  %(paymentTier)s, %(subscriptionStatus)s, %(createdAt)s, %(createdById)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  "majorEventId" = EXCLUDED."majorEventId",
                  "personId" = EXCLUDED."personId",
                  "amountPaid" = EXCLUDED."amountPaid",
                  "paymentDate" = EXCLUDED."paymentDate",
                  "paymentTier" = EXCLUDED."paymentTier",
                  "subscriptionStatus" = EXCLUDED."subscriptionStatus",
                  "createdAt" = EXCLUDED."createdAt",
                  "createdById" = EXCLUDED."createdById"
                """,
                payload.major_event_subscriptions,
            )

            execute_many_if_any(
                cursor,
                """
                                INSERT INTO event_group_subscriptions (
                                    id, "eventGroupId", "personId", "createdAt", "createdById"
                                )
                                VALUES (
                                    %(id)s, %(eventGroupId)s, %(personId)s, %(createdAt)s, %(createdById)s
                                )
                                ON CONFLICT (id) DO UPDATE SET
                                    "eventGroupId" = EXCLUDED."eventGroupId",
                                    "personId" = EXCLUDED."personId",
                                    "createdAt" = EXCLUDED."createdAt",
                                    "createdById" = EXCLUDED."createdById"
                """,
                                payload.event_group_subscriptions,
                        )

            execute_many_if_any(
                    cursor,
                    """
                    INSERT INTO event_subscriptions (
                        id, "eventId", "personId", "eventGroupSubscriptionId", "createdAt",
                        "createdById"
                    )
                    VALUES (
                        %(id)s, %(eventId)s, %(personId)s, %(eventGroupSubscriptionId)s,
                        %(createdAt)s, %(createdById)s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        "eventId" = EXCLUDED."eventId",
                        "personId" = EXCLUDED."personId",
                        "eventGroupSubscriptionId" = EXCLUDED."eventGroupSubscriptionId",
                        "createdAt" = EXCLUDED."createdAt",
                        "createdById" = EXCLUDED."createdById"
                    """,
                    payload.event_subscriptions,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO event_attendances (
                  "personId", "eventId", "attendedAt", "createdAt", "createdById"
                )
                VALUES (
                  %(personId)s, %(eventId)s, %(attendedAt)s, %(createdAt)s, %(createdById)s
                )
                ON CONFLICT ("personId", "eventId") DO UPDATE SET
                  "attendedAt" = EXCLUDED."attendedAt",
                  "createdAt" = EXCLUDED."createdAt",
                  "createdById" = EXCLUDED."createdById"
                """,
                payload.event_attendances,
            )


def execute_many_if_any(cursor: Any, query: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    cursor.executemany(query, rows)


def upsert_seed(
    seed_map: dict[tuple[str, str], SubscriptionSeed],
    pair: tuple[str, str],
    created_at: datetime,
    created_by_id: str | None,
) -> None:
    existing = seed_map.get(pair)
    if existing is None:
        seed_map[pair] = SubscriptionSeed(created_at=created_at, created_by_id=created_by_id)
        return

    if created_at < existing.created_at:
        existing.created_at = created_at
    if existing.created_by_id is None and created_by_id is not None:
        existing.created_by_id = created_by_id


def upsert_event_subscription_seed(
    seed_map: dict[tuple[str, str], EventSubscriptionSeed],
    pair: tuple[str, str],
    created_at: datetime,
    created_by_id: str | None,
    event_group_subscription_id: str | None,
) -> None:
    existing = seed_map.get(pair)
    if existing is None:
        seed_map[pair] = EventSubscriptionSeed(
            created_at=created_at,
            created_by_id=created_by_id,
            event_group_subscription_id=event_group_subscription_id,
        )
        return

    if created_at < existing.created_at:
        existing.created_at = created_at
    if existing.created_by_id is None and created_by_id is not None:
        existing.created_by_id = created_by_id
    if (
        existing.event_group_subscription_id is None
        and event_group_subscription_id is not None
    ):
        existing.event_group_subscription_id = event_group_subscription_id


def build_payment_info_row(
    major_event_id: str,
    payment_info: dict[str, Any],
    id_generator: Uuid7LikeGenerator,
) -> dict[str, Any] | None:
    if not payment_info:
        return None

    bank_name = coerce_text(payment_info.get("bankName"))
    agency = coerce_text(payment_info.get("agency"))
    account = coerce_text(payment_info.get("accountNumber")) or coerce_text(
        payment_info.get("account")
    )
    holder = coerce_text(payment_info.get("name")) or coerce_text(payment_info.get("holder"))
    document = coerce_text(payment_info.get("document"))

    if None in (bank_name, agency, account, holder, document):
        return None

    return {
        "id": id_generator.for_seed(f"payment-info:{major_event_id}"),
        "bankName": bank_name,
        "agency": agency,
        "account": account,
        "holder": holder,
        "document": document,
        "majorEventId": major_event_id,
    }


def build_major_event_price_rows(
    major_event_id: str,
    raw_price: Any,
    id_generator: Uuid7LikeGenerator,
    created_at: datetime,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    single_price = parse_int(raw_price)
    tiers: list[dict[str, Any]] = []
    price_type = "SINGLE"

    if isinstance(raw_price, dict):
        single_price = parse_int(raw_price.get("single"))
        raw_tiers = raw_price.get("tiers")
        if isinstance(raw_tiers, list):
            for index, raw_tier in enumerate(raw_tiers):
                if not isinstance(raw_tier, dict):
                    continue
                value = parse_int(raw_tier.get("price"))
                if value is None:
                    continue
                tier_name = (
                    coerce_text(raw_tier.get("name"))
                    or coerce_text(raw_tier.get("title"))
                    or f"Faixa {index + 1}"
                )
                tiers.append({"name": tier_name, "value": value})
        if tiers:
            price_type = "TIERED"

    if not tiers:
        if single_price is None:
            return None, []
        tiers = [{"name": "Valor único", "value": single_price}]

    price_id = id_generator.for_seed(f"major-event-price:{major_event_id}")
    price_row = {
        "id": price_id,
        "majorEventId": major_event_id,
        "type": price_type,
        "createdAt": created_at,
    }
    tier_rows = [
        {
            "id": id_generator.for_seed(
                f"price-tier:{major_event_id}:{index}:{tier['name']}:{tier['value']}"
            ),
            "priceId": price_id,
            "name": tier["name"],
            "value": tier["value"],
        }
        for index, tier in enumerate(tiers)
    ]
    return price_row, tier_rows


def infer_is_payment_required(payment_info: dict[str, Any], price: Any) -> bool:
    if payment_info:
        return True
    scalar_price = parse_int(price)
    if scalar_price is not None:
        return scalar_price > 0
    if isinstance(price, dict):
        single_price = parse_int(price.get("single"))
        if single_price is not None:
            return single_price > 0
        tiers = price.get("tiers")
        if isinstance(tiers, list):
            return any(
                (parse_int(tier.get("price")) or 0) > 0
                for tier in tiers
                if isinstance(tier, dict)
            )
    return False


def map_contact_info(raw_contact_info: Any) -> tuple[str | None, str | None]:
    if isinstance(raw_contact_info, dict):
        email = coerce_text(raw_contact_info.get("email"))
        if email:
            return email, "EMAIL"

        phone = coerce_text(raw_contact_info.get("phone"))
        if phone:
            return phone, "PHONE"

        whatsapp = coerce_text(raw_contact_info.get("whatsapp"))
        if whatsapp:
            return whatsapp, "WHATSAPP"

        for value in raw_contact_info.values():
            text = coerce_text(value)
            if text:
                return text, "OTHER"

        return None, None

    text = coerce_text(raw_contact_info)
    if text is None:
        return None, None
    return text, "OTHER"


def map_subscription_status(raw_status: Any) -> str:
    if isinstance(raw_status, str):
        normalized = raw_status.strip().upper()
        valid = {
            "WAITING_RECEIPT_UPLOAD",
            "RECEIPT_UNDER_REVIEW",
            "REJECTED_INVALID_RECEIPT",
            "REJECTED_NO_SLOTS",
            "REJECTED_SCHEDULE_CONFLICT",
            "REJECTED_GENERIC",
            "CONFIRMED",
            "CANCELED",
        }
        if normalized in valid:
            return normalized

    status = parse_int(raw_status)
    if status == 0:
        return "WAITING_RECEIPT_UPLOAD"
    if status == 1:
        return "RECEIPT_UNDER_REVIEW"
    if status == 2:
        return "CONFIRMED"
    if status == 3:
        return "REJECTED_INVALID_RECEIPT"
    if status == 4:
        return "REJECTED_NO_SLOTS"
    if status == 5:
        return "REJECTED_SCHEDULE_CONFLICT"
    return "REJECTED_GENERIC"


def map_event_type(raw_type: Any) -> str:
    value = (coerce_text(raw_type) or "").lower()
    if value == "minicurso":
        return "MINICURSO"
    if value == "palestra":
        return "PALESTRA"
    return "OTHER"


def parse_credit_minutes(raw_hours: Any) -> int | None:
    if raw_hours is None:
        return None
    try:
        hours = Decimal(str(raw_hours))
    except (InvalidOperation, ValueError):
        return None
    return int(hours * 60)


def parse_firestore_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, dict):
        return None
    if value.get("__datatype__") != "timestamp":
        return None

    raw_value = value.get("value")
    if not isinstance(raw_value, dict):
        return None

    seconds = raw_value.get("_seconds")
    nanoseconds = raw_value.get("_nanoseconds", 0)
    if seconds is None:
        return None

    try:
        seconds_float = float(seconds) + (float(nanoseconds) / 1_000_000_000)
    except (TypeError, ValueError):
        return None

    return datetime.fromtimestamp(seconds_float, tz=timezone.utc)


def parse_event_id_from_reference(reference: Any) -> str | None:
    if not isinstance(reference, dict):
        return None
    if reference.get("__datatype__") != "documentReference":
        return None

    ref_value = coerce_text(reference.get("value"))
    if ref_value is None:
        return None

    parts = ref_value.split("/")
    if len(parts) >= 2 and parts[0] == "events":
        return parts[1]
    return None


def extract_subcollection(raw_doc: Any, name: str) -> dict[str, Any]:
    if not isinstance(raw_doc, dict):
        return {}
    collections = raw_doc.get("__collections__")
    if not isinstance(collections, dict):
        return {}
    subcollection = collections.get(name)
    if not isinstance(subcollection, dict):
        return {}
    return subcollection


def extract_event_group_name(event_group: Any) -> str | None:
    if not isinstance(event_group, dict):
        return None
    return coerce_text(event_group.get("groupDisplayName"))


def extract_event_group_event_ids(event_group: Any) -> list[str]:
    if not isinstance(event_group, dict):
        return []
    raw_ids = event_group.get("groupEventIDs") or event_group.get("groupEventIds")
    if not isinstance(raw_ids, list):
        return []
    event_ids: list[str] = []
    for raw_id in raw_ids:
        text = coerce_text(raw_id)
        if text is not None:
            event_ids.append(text)
    return event_ids


def extract_event_group_main_event_id(event_group: Any) -> str | None:
    if not isinstance(event_group, dict):
        return None
    return coerce_text(event_group.get("mainEventID") or event_group.get("mainEventId"))


def extract_emoji(raw_doc: dict[str, Any]) -> str:
    return (
        coerce_text(raw_doc.get("emoji"))
        or coerce_text(raw_doc.get("icon"))
        or DEFAULT_UNKNOWN_EMOJI
    )


def coerce_text_from_dict(raw_value: Any, key: str) -> str | None:
    if not isinstance(raw_value, dict):
        return None
    return coerce_text(raw_value.get(key))

def parse_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(stripped)
        except ValueError:
            try:
                return int(float(stripped))
            except ValueError:
                return None
    return None


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def coerce_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def coerce_bool(value: Any) -> bool:
    return coerce_bool_or_default(value, default=False)


def coerce_bool_or_default(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "t", "yes", "y"}:
            return True
        if lowered in {"0", "false", "f", "no", "n"}:
            return False
    return default


def normalize_identity_document(raw_identity_document: Any) -> str | None:
    raw = coerce_text(raw_identity_document)
    if raw is None:
        return None
    normalized = "".join(character for character in raw if character.isdigit())
    return normalized or None


def normalize_phone(raw_phone: Any) -> str | None:
    raw = coerce_text(raw_phone)
    if raw is None:
        return None

    digits = "".join(character for character in raw if character.isdigit())
    if not digits or set(digits) == {"0"}:
        return None

    if digits.startswith("00"):
        digits = digits[2:]

    if digits.startswith("55") and len(digits) in {12, 13}:
        return f"+{digits}"

    if len(digits) in {10, 11}:
        return f"+55{digits}"

    return f"+{digits}" if raw.strip().startswith("+") and len(digits) >= 8 else None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


if __name__ == "__main__":
    main()
