#!/usr/bin/env python3
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from import_common import connect_psycopg, execute_many_if_any, uuid7_string

SQL_NUMBER_PATTERN = re.compile(r"^-?\d+(?:\.\d+)?$")
MOJIBAKE_PATTERN = re.compile("(?:\u00C3.|\u00C2.|\u00E2[\u0080-\u00BF])")
WHITESPACE_PATTERN = re.compile(r"\s+")
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

LOWERCASE_NAME_PARTICLES = {
    "da",
    "das",
    "de",
    "del",
    "della",
    "di",
    "do",
    "dos",
    "du",
    "e",
    "la",
    "le",
    "van",
    "von",
}
ROMAN_NUMERAL_PATTERN = re.compile(
    r"^M{0,4}(CM|CD|D?C{0,3})"
    r"(XC|XL|L?X{0,3})"
    r"(IX|IV|V?I{0,3})$",
    flags=re.IGNORECASE,
)

SqlLiteral = str | int | Decimal | None


def parse_insert_rows_by_table(
    sql_path: Path, expected_tables: set[str]
) -> dict[str, list[dict[str, SqlLiteral]]]:
    content = sql_path.read_text(encoding="utf-8", errors="replace")
    result: dict[str, list[dict[str, SqlLiteral]]] = {table: [] for table in expected_tables}

    statement_pattern = re.compile(
        r"INSERT\s+INTO\s+`(?P<table>[^`]+)`\s*\((?P<columns>[^)]*)\)\s*VALUES",
        flags=re.IGNORECASE,
    )
    position = 0

    while True:
        match = statement_pattern.search(content, position)
        if match is None:
            break

        statement_end = find_statement_end(content, match.end())
        table_name = match.group("table")

        if table_name in expected_tables:
            column_names = [clean_identifier(column) for column in match.group("columns").split(",")]
            values_block = content[match.end() : statement_end]
            rows = parse_values_block(values_block)
            for row in rows:
                if len(row) != len(column_names):
                    continue
                result[table_name].append(dict(zip(column_names, row)))

        position = statement_end + 1

    return result


def find_statement_end(content: str, start: int) -> int:
    in_string = False
    index = start

    while index < len(content):
        character = content[index]
        if in_string:
            if character == "'":
                next_character = content[index + 1] if index + 1 < len(content) else ""
                if next_character == "'":
                    index += 2
                    continue
                if is_backslash_escaped(content, index):
                    index += 1
                    continue
                in_string = False
            index += 1
            continue

        if character == "'":
            in_string = True
        elif character == ";":
            return index
        index += 1

    raise ValueError("Could not find the end of SQL statement.")


def is_backslash_escaped(content: str, index: int) -> bool:
    backslash_count = 0
    cursor = index - 1
    while cursor >= 0 and content[cursor] == "\\":
        backslash_count += 1
        cursor -= 1
    return backslash_count % 2 == 1


def parse_values_block(values_block: str) -> list[list[SqlLiteral]]:
    rows: list[list[SqlLiteral]] = []
    index = 0

    while index < len(values_block):
        character = values_block[index]
        if character != "(":
            index += 1
            continue

        tuple_end = find_closing_parenthesis(values_block, index)
        tuple_content = values_block[index + 1 : tuple_end]
        rows.append(parse_tuple(tuple_content))
        index = tuple_end + 1

    return rows


def find_closing_parenthesis(content: str, start: int) -> int:
    in_string = False
    index = start + 1
    depth = 1

    while index < len(content):
        character = content[index]
        if in_string:
            if character == "'":
                next_character = content[index + 1] if index + 1 < len(content) else ""
                if next_character == "'":
                    index += 2
                    continue
                if is_backslash_escaped(content, index):
                    index += 1
                    continue
                in_string = False
            index += 1
            continue

        if character == "'":
            in_string = True
        elif character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth == 0:
                return index
        index += 1

    raise ValueError("Could not find closing parenthesis in values block.")


def parse_tuple(tuple_content: str) -> list[SqlLiteral]:
    tokens: list[str] = []
    token_start = 0
    in_string = False
    index = 0

    while index < len(tuple_content):
        character = tuple_content[index]
        if in_string:
            if character == "'":
                next_character = tuple_content[index + 1] if index + 1 < len(tuple_content) else ""
                if next_character == "'":
                    index += 2
                    continue
                if is_backslash_escaped(tuple_content, index):
                    index += 1
                    continue
                in_string = False
            index += 1
            continue

        if character == "'":
            in_string = True
        elif character == ",":
            tokens.append(tuple_content[token_start:index])
            token_start = index + 1
        index += 1

    tokens.append(tuple_content[token_start:])
    return [parse_sql_literal(token.strip()) for token in tokens]


def parse_sql_literal(token: str) -> SqlLiteral:
    if token.upper() == "NULL":
        return None

    if token.startswith("'") and token.endswith("'"):
        inner = token[1:-1]
        normalized = (
            inner.replace("\\r", "\r")
            .replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace("\\\\", "\\")
            .replace("\\'", "'")
            .replace("''", "'")
        )
        if normalized.strip().lower() == "null":
            return None
        return normalized

    if SQL_NUMBER_PATTERN.fullmatch(token):
        if "." in token:
            try:
                return Decimal(token)
            except InvalidOperation:
                return token
        return int(token)

    return token


def clean_identifier(raw_identifier: str) -> str:
    return raw_identifier.strip().strip("`")


def parse_mysql_date(raw_value: Any) -> date | None:
    text = coerce_text(raw_value)
    if text is None:
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_mysql_time(raw_value: Any) -> time | None:
    text = coerce_text(raw_value)
    if text is None:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return None


def parse_mysql_datetime(raw_value: Any) -> datetime | None:
    text = coerce_text(raw_value)
    if text is None:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def combine_date_and_time(event_date: date | None, event_time: time | None) -> datetime | None:
    if event_date is None:
        return None
    normalized_time = event_time or time(hour=0, minute=0, second=0)
    return datetime.combine(event_date, normalized_time, tzinfo=timezone.utc)


def at_start_of_day(event_date: date | None) -> datetime | None:
    return combine_date_and_time(event_date, None)


def decimal_to_int(raw_value: Any) -> int | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, bool):
        return int(raw_value)
    if isinstance(raw_value, int):
        return raw_value
    if isinstance(raw_value, Decimal):
        return int(raw_value)
    text = coerce_text(raw_value)
    if text is None:
        return None
    try:
        return int(Decimal(text))
    except InvalidOperation:
        return None


def coerce_text(value: Any, *, fix_mojibake: bool = False) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.lower() == "null":
        return None
    if fix_mojibake:
        text = repair_mojibake(text)
    text = WHITESPACE_PATTERN.sub(" ", text).strip()
    if text.lower() == "null":
        return None
    return text or None


def repair_mojibake(text: str) -> str:
    current = text
    for _ in range(3):
        if not looks_like_mojibake(current):
            break
        try:
            candidate = current.encode("latin-1").decode("utf-8")
        except UnicodeError:
            break
        if mojibake_score(candidate) < mojibake_score(current):
            current = candidate
            continue
        break
    return current


def looks_like_mojibake(text: str) -> bool:
    return MOJIBAKE_PATTERN.search(text) is not None


def mojibake_score(text: str) -> int:
    return len(MOJIBAKE_PATTERN.findall(text))


def normalize_cpf(raw_value: Any) -> str | None:
    text = coerce_text(raw_value)
    if text is None:
        return None
    digits = "".join(character for character in text if character.isdigit())
    if not digits:
        return None
    if len(digits) > 11:
        digits = digits[-11:]
    if len(digits) < 11:
        digits = digits.zfill(11)
    return digits


def normalize_email(raw_value: Any) -> str | None:
    text = coerce_text(raw_value, fix_mojibake=True)
    if text is None:
        return None
    return text.lower()


def normalize_person_name(raw_name: Any) -> str | None:
    text = coerce_text(raw_name, fix_mojibake=True)
    if text is None:
        return None

    tokens = [token for token in text.split(" ") if token]
    if not tokens:
        return None

    normalized_tokens: list[str] = []
    for token_index, token in enumerate(tokens):
        normalized_tokens.append(normalize_name_token(token, token_index))
    return " ".join(normalized_tokens)


def normalize_name_token(token: str, token_index: int) -> str:
    hyphen_chunks = token.split("-")
    normalized_chunks: list[str] = []
    for chunk in hyphen_chunks:
        apostrophe_chunks = chunk.replace("’", "'").split("'")
        normalized_apostrophe_chunks: list[str] = []
        for apostrophe_index, apostrophe_chunk in enumerate(apostrophe_chunks):
            lowered = apostrophe_chunk.lower()
            if (
                token_index > 0
                and apostrophe_index == 0
                and lowered in LOWERCASE_NAME_PARTICLES
            ):
                normalized_apostrophe_chunks.append(lowered)
                continue
            if ROMAN_NUMERAL_PATTERN.fullmatch(apostrophe_chunk):
                normalized_apostrophe_chunks.append(apostrophe_chunk.upper())
                continue
            normalized_apostrophe_chunks.append(
                apostrophe_chunk[:1].upper() + apostrophe_chunk[1:].lower()
            )
        normalized_chunks.append("'".join(normalized_apostrophe_chunks))
    return "-".join(normalized_chunks)


def strip_html(raw_text: Any) -> str | None:
    text = coerce_text(raw_text, fix_mojibake=True)
    if text is None:
        return None
    stripped = HTML_TAG_PATTERN.sub(" ", text)
    stripped = WHITESPACE_PATTERN.sub(" ", stripped).strip()
    return stripped or None


def build_prefixed_id(prefix: str, *parts: Any) -> str:
    normalized_parts = [normalize_id_part(part) for part in parts]
    joined_parts = "-".join(part for part in normalized_parts if part)
    if not joined_parts:
        joined_parts = "id"
    return f"{prefix}{joined_parts}"


def deterministic_prefixed_id(prefix: str, seed: str) -> str:
    generated = uuid.uuid5(uuid.NAMESPACE_URL, seed)
    return f"{prefix}{generated}"


def normalize_id_part(value: Any) -> str:
    text = coerce_text(value, fix_mojibake=True) or ""
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "-", text)
    normalized = normalized.strip("-")
    return normalized


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def write_legacy_sql_payload(database_url: str, payload: Any) -> None:
    with connect_psycopg(database_url) as connection:
        with connection.cursor() as cursor:
            old_person_id_to_external_ref, resolved_person_id_by_external_ref = (
                reconcile_people_ids_with_database(cursor, payload.people)
            )
            rebind_people_foreign_keys(
                payload,
                old_person_id_to_external_ref,
                resolved_person_id_by_external_ref,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO major_events (
                  id, name, "startDate", "endDate", description, "isPaymentRequired", "createdAt", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(startDate)s, %(endDate)s, %(description)s, %(isPaymentRequired)s, %(createdAt)s, %(updatedAt)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  "startDate" = EXCLUDED."startDate",
                  "endDate" = EXCLUDED."endDate",
                  description = EXCLUDED.description,
                  "isPaymentRequired" = EXCLUDED."isPaymentRequired",
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                payload.major_events,
            )

            event_groups = [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "createdAt": row["createdAt"],
                    "updatedAt": row["updatedAt"],
                }
                for row in payload.event_groups
            ]
            execute_many_if_any(
                cursor,
                """
                INSERT INTO event_groups (
                  id, name, "createdAt", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(createdAt)s, %(updatedAt)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                event_groups,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO events (
                  id, name, "creditMinutes", "startDate", "endDate", type, emoji,
                  description, "shortDescription", latitude, longitude, "locationDescription",
                  "majorEventId", "eventGroupId", "allowSubscription", slots,
                  "shouldIssueCertificate", "shouldCollectAttendance",
                  "isOnlineAttendanceAllowed", "onlineAttendanceCode",
                  "onlineAttendanceStartDate", "onlineAttendanceEndDate",
                  "publiclyVisible", "youtubeCode", "buttonText", "buttonLink",
                  "createdAt", "createdById", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(creditMinutes)s, %(startDate)s, %(endDate)s, %(type)s, %(emoji)s,
                  %(description)s, %(shortDescription)s, %(latitude)s, %(longitude)s, %(locationDescription)s,
                  %(majorEventId)s, %(eventGroupId)s, %(allowSubscription)s, %(slots)s,
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
                  "updatedAt" = EXCLUDED."updatedAt"
                """,
                payload.events,
            )

            execute_many_if_any(
                cursor,
                """
                INSERT INTO people (
                  id, name, email, "identityDocument", "academicId", "externalRef", "createdAt", "updatedAt"
                )
                VALUES (
                  %(id)s, %(name)s, %(email)s, %(identityDocument)s, %(academicId)s, %(externalRef)s, %(createdAt)s, %(updatedAt)s
                )
                ON CONFLICT ("externalRef") DO UPDATE SET
                  name = EXCLUDED.name,
                  email = EXCLUDED.email,
                  "identityDocument" = EXCLUDED."identityDocument",
                  "academicId" = EXCLUDED."academicId",
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
                INSERT INTO event_subscriptions (
                  id, "eventId", "personId", "createdAt", "createdById"
                )
                VALUES (
                  %(id)s, %(eventId)s, %(personId)s, %(createdAt)s, %(createdById)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  "eventId" = EXCLUDED."eventId",
                  "personId" = EXCLUDED."personId",
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

            execute_many_if_any(
                cursor,
                """
                INSERT INTO event_lecturers (
                  "eventId", "personId", "createdAt", "createdById"
                )
                VALUES (
                  %(eventId)s, %(personId)s, %(createdAt)s, %(createdById)s
                )
                ON CONFLICT ("eventId", "personId") DO UPDATE SET
                  "createdAt" = EXCLUDED."createdAt",
                  "createdById" = EXCLUDED."createdById"
                """,
                payload.event_lecturers,
            )


def reconcile_people_ids_with_database(
    cursor: Any, people_rows: list[dict[str, Any]]
) -> tuple[dict[str, str], dict[str, str]]:
    old_person_id_to_external_ref: dict[str, str] = {
        row["id"]: row["externalRef"] for row in people_rows
    }
    resolved_person_id_by_external_ref: dict[str, str] = {
        row["externalRef"]: row["id"] for row in people_rows
    }

    external_refs = list(resolved_person_id_by_external_ref.keys())
    if external_refs:
        cursor.execute(
            'SELECT id, "externalRef" FROM people WHERE "externalRef" = ANY(%s)',
            (external_refs,),
        )
        for person_id, external_ref in cursor.fetchall():
            resolved_person_id_by_external_ref[str(external_ref)] = str(person_id)

    for row in people_rows:
        row["id"] = resolved_person_id_by_external_ref[row["externalRef"]]

    return old_person_id_to_external_ref, resolved_person_id_by_external_ref


def rebind_people_foreign_keys(
    payload: Any,
    old_person_id_to_external_ref: dict[str, str],
    resolved_person_id_by_external_ref: dict[str, str],
) -> None:
    collections_and_keys = (
        (payload.major_event_subscriptions, "personId"),
        (payload.event_subscriptions, "personId"),
        (payload.event_attendances, "personId"),
        (payload.event_lecturers, "personId"),
    )

    for rows, key in collections_and_keys:
        for row in rows:
            old_person_id = row.get(key)
            if not isinstance(old_person_id, str):
                raise RuntimeError("Unexpected personId type while rebinding references.")
            external_ref = old_person_id_to_external_ref.get(old_person_id)
            if external_ref is None:
                raise RuntimeError(f"Missing externalRef mapping for personId '{old_person_id}'.")
            resolved_person_id = resolved_person_id_by_external_ref.get(external_ref)
            if resolved_person_id is None:
                raise RuntimeError(
                    f"Missing resolved personId for externalRef '{external_ref}'."
                )
            row[key] = resolved_person_id
