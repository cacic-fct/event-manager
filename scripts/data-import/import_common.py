#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import uuid
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any, TypeVar
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse, urlunparse

UNSUPPORTED_POSTGRES_URL_PARAMS = {
    "schema",
    "connection_limit",
    "pool_timeout",
    "max_idle_connection_lifetime",
    "socket_timeout",
}

T = TypeVar("T")


def add_database_connection_args(parser: argparse.ArgumentParser) -> None:
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


def database_url_from_args(args: argparse.Namespace) -> str:
    if args.database_url:
        return args.database_url
    return (
        f"postgresql://{args.db_user}:{args.db_password}@"
        f"{args.db_host}:{args.db_port}/{args.db_name}"
    )


def connect_psycopg(database_url: str) -> Any:
    try:
        import psycopg
    except ImportError as error:
        raise RuntimeError(
            'Missing dependency \'psycopg\'. Install with: pip install "psycopg[binary]"'
        ) from error

    return psycopg.connect(database_url)


def execute_many_if_any(cursor: Any, query: str, rows: list[dict[str, Any]]) -> None:
    if rows:
        cursor.executemany(query, rows)


def chunks(items: list[T], size: int) -> Iterable[list[T]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def format_counter(counter: Counter[str]) -> str:
    if not counter:
        return "none"
    return ", ".join(f"{key}={counter[key]}" for key in sorted(counter.keys()))


def uuid7_string() -> str:
    try:
        uuid7 = uuid.uuid7
    except AttributeError as error:
        raise RuntimeError("uuid.uuid7() requires Python 3.14 or newer.") from error
    return str(uuid7())


def parse_env_file(env_path: Path) -> dict[str, str]:
    if not env_path.exists():
        raise FileNotFoundError(f".env file not found: {env_path}")

    values: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
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


def resolve_database_url_from_env_args(args: argparse.Namespace) -> str:
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
