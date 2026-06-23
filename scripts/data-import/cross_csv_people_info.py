#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

WHITESPACE_PATTERN = re.compile(r"\s+")
NON_WORD_PATTERN = re.compile(r"[^\w\s]")
DEFAULT_NAME_COLUMN_KEYS = {
    "full name",
    "fullname",
    "nome completo",
    "name",
    "nome",
}


@dataclass(frozen=True, slots=True)
class PeopleRecord:
    full_name: str
    email: str
    enrollment_number: str
    identity_document: str


@dataclass(frozen=True, slots=True)
class FileStats:
    rows_total: int
    rows_matched: int
    rows_unmatched: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Cross CSV files by full name using a people database CSV and write "
            "enriched output CSV files."
        )
    )
    parser.add_argument(
        "--people-db",
        type=Path,
        default=Path("import/secompp25_subscriptions.csv"),
        help="Path to people database CSV (must contain fullName,email,enrollmentNumber,identityDocument).",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Directory that contains input CSV files to enrich.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory where enriched files are written. Defaults to <input-dir>/crossed.",
    )
    parser.add_argument(
        "--glob",
        type=str,
        default="*.csv",
        help="Glob pattern used to find CSV files inside input dir.",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="If provided, search input directory recursively.",
    )
    parser.add_argument(
        "--name-column",
        type=str,
        default="",
        help="Optional explicit full-name column (case/accent-insensitive).",
    )
    parser.add_argument(
        "--output-suffix",
        type=str,
        default="_crossed",
        help="Suffix appended to each input filename for output.",
    )
    return parser.parse_args()


def normalize_spaces(value: str) -> str:
    return WHITESPACE_PATTERN.sub(" ", value).strip()


def normalize_text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", normalize_spaces(value))
    no_accents = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    no_punctuation = NON_WORD_PATTERN.sub(" ", no_accents)
    return normalize_spaces(no_punctuation).casefold()


def read_people_lookup(people_db_path: Path) -> tuple[dict[str, PeopleRecord], int]:
    if not people_db_path.exists():
        raise FileNotFoundError(f"People database CSV not found: {people_db_path}")

    csv.field_size_limit(10_000_000)
    with people_db_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames is None:
            raise ValueError("People database CSV has no header row.")

        required_columns = {
            "fullName",
            "email",
            "enrollmentNumber",
            "identityDocument",
        }
        missing_columns = required_columns - set(reader.fieldnames)
        if missing_columns:
            raise ValueError(
                "People database CSV missing required columns: "
                + ", ".join(sorted(missing_columns))
            )

        lookup: dict[str, PeopleRecord] = {}
        collisions = 0

        for row in reader:
            full_name = normalize_spaces(row.get("fullName", ""))
            if not full_name:
                continue
            name_key = normalize_text_key(full_name)
            if not name_key:
                continue

            candidate = PeopleRecord(
                full_name=full_name,
                email=normalize_spaces(row.get("email", "")),
                enrollment_number=normalize_spaces(row.get("enrollmentNumber", "")),
                identity_document=normalize_spaces(row.get("identityDocument", "")),
            )

            existing = lookup.get(name_key)
            if existing is None:
                lookup[name_key] = candidate
                continue

            if (
                existing.full_name != candidate.full_name
                or existing.email != candidate.email
                or existing.enrollment_number != candidate.enrollment_number
                or existing.identity_document != candidate.identity_document
            ):
                collisions += 1

            lookup[name_key] = PeopleRecord(
                full_name=existing.full_name or candidate.full_name,
                email=existing.email or candidate.email,
                enrollment_number=existing.enrollment_number or candidate.enrollment_number,
                identity_document=existing.identity_document or candidate.identity_document,
            )

    return lookup, collisions


def find_name_column(fieldnames: list[str], explicit_column: str) -> str:
    if explicit_column:
        explicit_key = normalize_text_key(explicit_column)
        for fieldname in fieldnames:
            if normalize_text_key(fieldname) == explicit_key:
                return fieldname
        raise ValueError(f"Name column '{explicit_column}' not found in input CSV.")

    for fieldname in fieldnames:
        if normalize_text_key(fieldname) in DEFAULT_NAME_COLUMN_KEYS:
            return fieldname

    raise ValueError(
        "Could not detect full-name column. Use --name-column to set it explicitly."
    )


def iter_input_csv_paths(input_dir: Path, pattern: str, recursive: bool) -> list[Path]:
    if recursive:
        return sorted(path for path in input_dir.rglob(pattern) if path.is_file())
    return sorted(path for path in input_dir.glob(pattern) if path.is_file())


def build_output_path(
    input_csv_path: Path, input_dir: Path, output_dir: Path, output_suffix: str
) -> Path:
    relative_path = input_csv_path.relative_to(input_dir)
    output_name = f"{relative_path.stem}{output_suffix}{relative_path.suffix}"
    return output_dir / relative_path.parent / output_name


def enrich_csv_file(
    *,
    input_csv_path: Path,
    output_csv_path: Path,
    people_lookup: dict[str, PeopleRecord],
    explicit_name_column: str,
) -> FileStats:
    csv.field_size_limit(10_000_000)
    with input_csv_path.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header row.")

        fieldnames = list(reader.fieldnames)
        name_column = find_name_column(fieldnames, explicit_name_column)
        output_fieldnames = [
            *fieldnames,
            "crossMatchedFullName",
            "crossEmail",
            "crossEnrollmentNumber",
            "crossIdentityDocument",
            "crossMatchFound",
        ]

        output_csv_path.parent.mkdir(parents=True, exist_ok=True)
        with output_csv_path.open("w", encoding="utf-8", newline="") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=output_fieldnames)
            writer.writeheader()

            rows_total = 0
            rows_matched = 0
            rows_unmatched = 0

            for row in reader:
                rows_total += 1
                full_name = normalize_spaces(row.get(name_column, ""))
                name_key = normalize_text_key(full_name)
                person = people_lookup.get(name_key)

                output_row = dict(row)
                if person is None:
                    rows_unmatched += 1
                    output_row.update(
                        {
                            "crossMatchedFullName": "",
                            "crossEmail": "",
                            "crossEnrollmentNumber": "",
                            "crossIdentityDocument": "",
                            "crossMatchFound": "false",
                        }
                    )
                else:
                    rows_matched += 1
                    output_row.update(
                        {
                            "crossMatchedFullName": person.full_name,
                            "crossEmail": person.email,
                            "crossEnrollmentNumber": person.enrollment_number,
                            "crossIdentityDocument": person.identity_document,
                            "crossMatchFound": "true",
                        }
                    )

                writer.writerow(output_row)

    return FileStats(
        rows_total=rows_total,
        rows_matched=rows_matched,
        rows_unmatched=rows_unmatched,
    )


def main() -> None:
    args = parse_args()
    input_dir = args.input_dir.resolve()
    people_db_path = args.people_db.resolve()
    output_dir = (
        args.output_dir.resolve()
        if args.output_dir is not None
        else (input_dir / "crossed").resolve()
    )

    if not input_dir.exists() or not input_dir.is_dir():
        raise ValueError(f"Input directory does not exist or is not a directory: {input_dir}")

    people_lookup, collisions = read_people_lookup(people_db_path)
    input_csv_paths = iter_input_csv_paths(input_dir, args.glob, args.recursive)
    input_csv_paths = [path for path in input_csv_paths if path.resolve() != people_db_path]

    if not input_csv_paths:
        raise ValueError(f"No CSV files found in {input_dir} for pattern '{args.glob}'.")

    processed_files = 0
    rows_total = 0
    rows_matched = 0
    rows_unmatched = 0

    for input_csv_path in input_csv_paths:
        output_csv_path = build_output_path(
            input_csv_path=input_csv_path,
            input_dir=input_dir,
            output_dir=output_dir,
            output_suffix=args.output_suffix,
        )

        try:
            stats = enrich_csv_file(
                input_csv_path=input_csv_path,
                output_csv_path=output_csv_path,
                people_lookup=people_lookup,
                explicit_name_column=args.name_column,
            )
        except ValueError as error:
            print(
                f"WARNING: Skipped {input_csv_path} -> {error}",
                file=sys.stderr,
            )
            continue

        processed_files += 1
        rows_total += stats.rows_total
        rows_matched += stats.rows_matched
        rows_unmatched += stats.rows_unmatched

        print(
            f"Processed {input_csv_path} -> {output_csv_path} "
            f"(rows={stats.rows_total}, matched={stats.rows_matched}, unmatched={stats.rows_unmatched})"
        )

    if processed_files == 0:
        raise ValueError("No CSV file could be processed. Check name column settings.")

    print(
        "Done. "
        f"files={processed_files}, rows={rows_total}, matched={rows_matched}, "
        f"unmatched={rows_unmatched}, lookup_collisions={collisions}"
    )


if __name__ == "__main__":
    main()
