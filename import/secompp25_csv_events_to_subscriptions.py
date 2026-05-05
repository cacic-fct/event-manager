#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import csv
import difflib
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse, urlunparse

ALL_USERS_EVENT_NAMES: list[str] = ["Aspectos Essenciais para a Eficiência no Desenvolvimento de Software", "Democratizando IA para saúde de forma segura, robusta e justa", "Mesa Redonda", "Como se destacar no mercado de trabalho", "Desmistificando a Carreira em Dados & IA"]

NON_EVENT_KEYS = {
    "",
    "nao quero me inscrever nesse horario",
    "sou responsavel ja conferi novamente meus horarios e nao ha conflito de horario",
    "segm",
    "segt",
    "term",
    "tert",
    "quam",
    "quat",
    "quim",
    "quit",
    "sexm",
    "sext",
}

EVENT_COLUMN_PATTERN = re.compile(
    r"^(segunda|terca|quarta|quinta|sexta)\s*-\s*(manha|tarde)\b"
    r"|^(mesa redonda|palestra .+periodo noturno)\b",
    flags=re.IGNORECASE,
)
VAGAS_SUFFIX_PATTERN = re.compile(r"\s*\(\s*\d+\s+vagas?\s*\)\s*$", flags=re.IGNORECASE)
WHITESPACE_PATTERN = re.compile(r"\s+")
SCHEDULE_SUFFIX_PATTERN = re.compile(r"\s*\(([^()]*)\)\s*$")
DB_PART_SUFFIX_PATTERN = re.compile(r"\s*-\s*parte\s*(1|2)\s*$", flags=re.IGNORECASE)
LEADING_ARTICLE_PATTERN = re.compile(r"^(a|o)\s+", flags=re.IGNORECASE)
PART_1_PATTERN = re.compile(r"\b(primeira\s+parte|1a\s+parte|1\s+parte|parte\s*1)\b")
PART_2_PATTERN = re.compile(r"\b(segunda\s+parte|2a\s+parte|2\s+parte|parte\s*2)\b")
SCHEDULE_HINTS = {"parte", "segunda", "terca", "quarta", "quinta", "sexta", "manha", "tarde", "feira"}
STOP_WORDS = {
    "a",
    "ao",
    "as",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "no",
    "o",
    "os",
    "para",
    "um",
    "uma",
}
UNSUPPORTED_POSTGRES_URL_PARAMS = {
    "schema",
    "connection_limit",
    "pool_timeout",
    "max_idle_connection_lifetime",
    "socket_timeout",
}

FULL_NAME_COLUMN_KEY = "nome completo"
EMAIL_COLUMN_KEY = "endereco de e-mail"
ENROLLMENT_COLUMN_KEY = "r.a (aluno da unesp)"
IDENTITY_COLUMN_KEY = "cpf (visitante)"


@dataclass(frozen=True, slots=True)
class EventRow:
    event_id: str
    event_name: str
    full_key: str
    base_key: str
    part_number: int | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert SECOMPP25 registrations CSV into a normalized subscriptions CSV."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(
            "Cópia de Inscrição SECOMPP25 (respostas) - Inscrições SECOMPP.csv"
        ),
        help="Input CSV path from Google Forms export.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("import/secompp25_subscriptions.csv"),
        help="Output CSV path.",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path(".env"),
        help="Path to the .env file that contains DATABASE_URL.",
    )
    parser.add_argument(
        "--database-url",
        type=str,
        default="",
        help="Optional direct PostgreSQL URL. Overrides .env DATABASE_URL when provided.",
    )
    parser.add_argument(
        "--event-year",
        type=int,
        default=2025,
        help="Only consider events whose startDate belongs to this year.",
    )
    return parser.parse_args()


def normalize_spaces(value: str) -> str:
    return WHITESPACE_PATTERN.sub(" ", value).strip()


def canonical_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", normalize_spaces(value))
    without_accents = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return without_accents.casefold()


def normalize_text_key(value: str) -> str:
    canonical = canonical_header(value)
    canonical = re.sub(r"[^\w\s]", " ", canonical)
    return normalize_spaces(canonical)


def normalize_event_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).translate(
        str.maketrans(
            {
                "“": '"',
                "”": '"',
                "‘": "'",
                "’": "'",
                "´": "'",
                "`": "'",
            }
        )
    )
    normalized = VAGAS_SUFFIX_PATTERN.sub("", normalize_spaces(normalized))
    normalized = normalized.rstrip(" .,:;")
    return normalized.casefold()


def is_event_column(column_name: str) -> bool:
    candidate = canonical_header(column_name)
    return EVENT_COLUMN_PATTERN.search(candidate) is not None


def parse_env_file(env_path: Path) -> dict[str, str]:
    if not env_path.exists():
        raise FileNotFoundError(f".env file not found: {env_path}")

    values: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def decode_prisma_postgres_url(prisma_url: str) -> str:
    parsed = urlparse(prisma_url)
    api_key = parse_qs(parsed.query).get("api_key", [""])[0]
    if not api_key:
        raise ValueError(
            "DATABASE_URL uses prisma+postgres but does not contain api_key with databaseUrl."
        )

    padded_api_key = api_key + "=" * (-len(api_key) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded_api_key).decode("utf-8"))
    database_url = payload.get("databaseUrl")
    if not isinstance(database_url, str) or not database_url:
        raise ValueError("Could not decode databaseUrl from prisma+postgres DATABASE_URL.")
    return database_url


def resolve_database_url(args: argparse.Namespace) -> str:
    if args.database_url:
        return args.database_url

    env_values = parse_env_file(args.env_file)
    raw_database_url = env_values.get("DATABASE_URL", "").strip()
    if not raw_database_url:
        raise ValueError(f"DATABASE_URL is missing in {args.env_file}")

    if raw_database_url.startswith("prisma+postgres://"):
        raw_database_url = decode_prisma_postgres_url(raw_database_url)
    return sanitize_postgres_url(raw_database_url)


def sanitize_postgres_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgresql", "postgres"}:
        return database_url

    query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    filtered_query_pairs = [
        (key, value)
        for key, value in query_pairs
        if key not in UNSUPPORTED_POSTGRES_URL_PARAMS
    ]
    sanitized_query = urlencode(filtered_query_pairs)
    return urlunparse(parsed._replace(query=sanitized_query))


def find_column_name(fieldnames: list[str], expected_key: str) -> str:
    for name in fieldnames:
        if canonical_header(name) == expected_key:
            return name
    raise ValueError(f"CSV column not found: {expected_key}")


def detect_part_number(value: str) -> int | None:
    normalized_value = normalize_text_key(value)
    if PART_1_PATTERN.search(normalized_value):
        return 1
    if PART_2_PATTERN.search(normalized_value):
        return 2
    return None


def strip_schedule_suffix_parentheses(value: str) -> str:
    match = SCHEDULE_SUFFIX_PATTERN.search(value)
    if not match:
        return value
    suffix_key = normalize_text_key(match.group(1))
    if any(hint in suffix_key.split() for hint in SCHEDULE_HINTS):
        return value[: match.start()].strip()
    return value


def compute_base_key(value: str) -> tuple[str, int | None]:
    part_number = detect_part_number(value)
    base = VAGAS_SUFFIX_PATTERN.sub("", normalize_spaces(value))
    base = strip_schedule_suffix_parentheses(base)
    base = DB_PART_SUFFIX_PATTERN.sub("", base).strip().rstrip(" .,:;")
    base_key = normalize_event_name(base)
    base_key = LEADING_ARTICLE_PATTERN.sub("", base_key).strip(" -")
    return base_key, part_number


def is_non_event_value(value: str) -> bool:
    return normalize_text_key(value) in NON_EVENT_KEYS


def extract_event_name(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    text = normalize_spaces(unicodedata.normalize("NFKC", raw_value))
    if not text:
        return None
    if text.lower().startswith(("http://", "https://")):
        return None
    if is_non_event_value(text):
        return None

    event_name = VAGAS_SUFFIX_PATTERN.sub("", text).strip()
    if not event_name:
        return None
    if is_non_event_value(event_name):
        return None
    return event_name


def fetch_events(database_url: str, event_year: int) -> list[tuple[str, str]]:
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'psycopg'. Install with: pip install \"psycopg[binary]\""
        ) from exc

    query = (
        'SELECT id, name FROM events '
        'WHERE "deletedAt" IS NULL '
        'AND EXTRACT(YEAR FROM "startDate") = %s'
    )
    rows: list[tuple[str, str]] = []
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (event_year,))
            for event_id, event_name in cursor.fetchall():
                if not isinstance(event_id, str) or not isinstance(event_name, str):
                    continue
                rows.append((event_id, event_name))
    return rows


def build_event_rows(database_rows: list[tuple[str, str]]) -> list[EventRow]:
    rows: list[EventRow] = []
    for event_id, event_name in database_rows:
        full_key = normalize_event_name(event_name)
        base_key, part_number = compute_base_key(event_name)
        rows.append(
            EventRow(
                event_id=event_id,
                event_name=event_name,
                full_key=full_key,
                base_key=base_key,
                part_number=part_number,
            )
        )
    return rows


def find_token_matches(
    base_key: str, part_number: int | None, event_rows: list[EventRow]
) -> list[EventRow]:
    tokens = [token for token in base_key.split() if len(token) >= 4 and token not in STOP_WORDS]
    if not tokens:
        return []

    token_matches = [row for row in event_rows if all(token in row.base_key for token in tokens)]
    if part_number is not None:
        exact_part_matches = [row for row in token_matches if row.part_number == part_number]
        if exact_part_matches:
            return exact_part_matches
        no_part_matches = [row for row in token_matches if row.part_number is None]
        if no_part_matches:
            return no_part_matches
    return token_matches


def dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def main() -> None:
    args = parse_args()
    database_url = resolve_database_url(args)

    csv.field_size_limit(10_000_000)
    with args.input.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        if reader.fieldnames is None:
            raise ValueError("Input CSV has no header row.")

        fieldnames = list(reader.fieldnames)
        full_name_column = find_column_name(fieldnames, FULL_NAME_COLUMN_KEY)
        email_column = find_column_name(fieldnames, EMAIL_COLUMN_KEY)
        enrollment_column = find_column_name(fieldnames, ENROLLMENT_COLUMN_KEY)
        identity_column = find_column_name(fieldnames, IDENTITY_COLUMN_KEY)

        event_columns = [column for column in fieldnames if is_event_column(column)]
        if not event_columns:
            raise ValueError("No event columns found in CSV.")

        row_payloads: list[dict[str, str | list[str]]] = []
        event_names_to_resolve: list[str] = []

        for raw_row in reader:
            selected_event_names: list[str] = []
            for column in event_columns:
                event_name = extract_event_name(raw_row.get(column))
                if event_name is None:
                    continue
                if event_name in selected_event_names:
                    continue
                selected_event_names.append(event_name)

            event_names_to_resolve.extend(selected_event_names)
            row_payloads.append(
                {
                    "fullName": normalize_spaces(raw_row.get(full_name_column, "")),
                    "email": normalize_spaces(raw_row.get(email_column, "")),
                    "enrollmentNumber": normalize_spaces(raw_row.get(enrollment_column, "")),
                    "identityDocument": normalize_spaces(raw_row.get(identity_column, "")),
                    "selectedEventNames": selected_event_names,
                }
            )

    event_names_to_resolve.extend(ALL_USERS_EVENT_NAMES)
    event_names_to_resolve = dedupe_preserving_order(event_names_to_resolve)

    database_rows = fetch_events(database_url, args.event_year)
    event_rows = build_event_rows(database_rows)
    events_by_full_key: dict[str, list[EventRow]] = {}
    events_by_base_key: dict[str, list[EventRow]] = {}
    for row in event_rows:
        events_by_full_key.setdefault(row.full_key, []).append(row)
        events_by_base_key.setdefault(row.base_key, []).append(row)
    all_database_full_keys = list(events_by_full_key.keys())

    event_id_by_input_name: dict[str, str] = {}
    missing_event_names: list[str] = []
    ambiguous_event_names: list[tuple[str, list[EventRow]]] = []

    for event_name in event_names_to_resolve:
        full_key = normalize_event_name(event_name)
        full_matches = events_by_full_key.get(full_key, [])
        if len(full_matches) == 1:
            event_id_by_input_name[event_name] = full_matches[0].event_id
            continue
        if len(full_matches) > 1:
            ambiguous_event_names.append((event_name, full_matches))
            continue

        base_key, part_number = compute_base_key(event_name)
        base_matches = events_by_base_key.get(base_key, [])

        candidate_matches: list[EventRow] = []
        if part_number is not None:
            candidate_matches = [row for row in base_matches if row.part_number == part_number]
            if not candidate_matches:
                candidate_matches = [row for row in base_matches if row.part_number is None]
        else:
            no_part_matches = [row for row in base_matches if row.part_number is None]
            if len(no_part_matches) == 1:
                candidate_matches = no_part_matches
            else:
                candidate_matches = base_matches

        if not candidate_matches:
            candidate_matches = find_token_matches(base_key, part_number, event_rows)

        if len(candidate_matches) == 1:
            event_id_by_input_name[event_name] = candidate_matches[0].event_id
            continue
        if len(candidate_matches) > 1:
            ambiguous_event_names.append((event_name, candidate_matches))
            continue

        suggestion_keys = difflib.get_close_matches(full_key, all_database_full_keys, n=1, cutoff=0.88)
        if len(suggestion_keys) == 1:
            suggestion_rows = events_by_full_key[suggestion_keys[0]]
            if len(suggestion_rows) == 1:
                event_id_by_input_name[event_name] = suggestion_rows[0].event_id
                continue

        if is_non_event_value(event_name):
            continue
        if normalize_text_key(event_name) in {"la tex", "latex"}:
            latex_candidates = find_token_matches("latex", None, event_rows)
            if len(latex_candidates) == 1:
                event_id_by_input_name[event_name] = latex_candidates[0].event_id
                continue
        if normalize_text_key(event_name) in {"pokeapi", "poke api"}:
            poke_candidates = find_token_matches("pokeapi", part_number, event_rows)
            if len(poke_candidates) == 1:
                event_id_by_input_name[event_name] = poke_candidates[0].event_id
                continue

        if not candidate_matches:
            missing_event_names.append(event_name)

    if missing_event_names or ambiguous_event_names:
        if missing_event_names:
            print("ERROR: Some events were not found in database:", file=sys.stderr)
            for missing_name in missing_event_names:
                normalized_missing = normalize_event_name(missing_name)
                suggestion_keys = difflib.get_close_matches(
                    normalized_missing, all_database_full_keys, n=3, cutoff=0.65
                )
                if suggestion_keys:
                    suggestions = [
                        row.event_name
                        for suggestion_key in suggestion_keys
                        for row in events_by_full_key[suggestion_key]
                    ]
                    print(
                        f"  - {missing_name} (did you mean: {', '.join(suggestions)})",
                        file=sys.stderr,
                    )
                else:
                    print(f"  - {missing_name}", file=sys.stderr)
        if ambiguous_event_names:
            print("ERROR: Some event names matched multiple database rows:", file=sys.stderr)
            for input_name, matches in ambiguous_event_names:
                rendered_matches = ", ".join(
                    f"{row.event_name} [{row.event_id}]" for row in matches
                )
                print(f"  - {input_name} -> {rendered_matches}", file=sys.stderr)
        print(
            "ERROR: Continuing and writing CSV with only resolved event IDs.",
            file=sys.stderr,
        )

    common_event_ids = [
        event_id_by_input_name[event_name]
        for event_name in dedupe_preserving_order(ALL_USERS_EVENT_NAMES)
        if event_name in event_id_by_input_name
    ]

    output_rows: list[dict[str, str]] = []
    for row in row_payloads:
        selected_event_names = row["selectedEventNames"]
        assert isinstance(selected_event_names, list)
        selected_event_ids = [
            event_id_by_input_name[event_name]
            for event_name in selected_event_names
            if event_name in event_id_by_input_name
        ]
        subscribed_event_ids = dedupe_preserving_order(selected_event_ids + common_event_ids)
        output_rows.append(
            {
                "fullName": str(row["fullName"]),
                "email": str(row["email"]),
                "enrollmentNumber": str(row["enrollmentNumber"]),
                "identityDocument": str(row["identityDocument"]),
                "subscribedEventsId": json.dumps(subscribed_event_ids, ensure_ascii=False),
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(
            output_file,
            fieldnames=[
                "fullName",
                "email",
                "enrollmentNumber",
                "identityDocument",
                "subscribedEventsId",
            ],
        )
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Wrote {len(output_rows)} rows to {args.output}")


if __name__ == "__main__":
    main()
