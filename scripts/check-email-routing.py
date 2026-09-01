#!/usr/bin/env python3
"""Verify that business and personal addresses stay on their intended pages."""

import pathlib
import re
import sys

DIST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
BUSINESS_EMAIL = "sales@nw-local.com"
PERSONAL_EMAIL = "benny@nw-local.com"
AUTHOR_PAGE = pathlib.Path("authors/ben-petty/index.html")
BUSINESS_PAGES = (
    pathlib.Path("contact/index.html"),
    pathlib.Path("retailers/index.html"),
)
TEXT_SUFFIXES = {".html", ".json", ".txt", ".xml"}
PUBLIC_EMAIL = re.compile(r"[A-Z0-9._%+-]+@nw-local\.com", re.IGNORECASE)


def main() -> int:
    if not DIST.is_dir():
        print(f"check-email-routing: no such directory: {DIST}", file=sys.stderr)
        print("Run `make build` first.", file=sys.stderr)
        return 2

    failures: list[str] = []
    generated_files = [
        generated_file
        for generated_file in DIST.rglob("*")
        if generated_file.is_file() and generated_file.suffix in TEXT_SUFFIXES
    ]

    if not generated_files:
        print(f"check-email-routing: no generated text files under {DIST}", file=sys.stderr)
        return 2

    addresses_by_file: dict[pathlib.Path, set[str]] = {}
    personal_email_files: list[pathlib.Path] = []
    for generated_file in generated_files:
        content = generated_file.read_text(encoding="utf-8")
        relative_path = generated_file.relative_to(DIST)
        public_addresses = {
            matched_email.group(0).lower()
            for matched_email in PUBLIC_EMAIL.finditer(content)
        }
        addresses_by_file[relative_path] = public_addresses

        if PERSONAL_EMAIL in public_addresses:
            personal_email_files.append(relative_path)

        unexpected_addresses = public_addresses - {BUSINESS_EMAIL, PERSONAL_EMAIL}
        for unexpected_address in sorted(unexpected_addresses):
            failures.append(
                f"{relative_path}: unexpected public email {unexpected_address}"
            )

    if personal_email_files != [AUTHOR_PAGE]:
        unexpected_files = [
            str(generated_file)
            for generated_file in personal_email_files
            if generated_file != AUTHOR_PAGE
        ]
        if unexpected_files:
            failures.append(
                "personal email appears outside authors/ben-petty/index.html: "
                + ", ".join(unexpected_files)
            )
        if AUTHOR_PAGE not in personal_email_files:
            failures.append(f"{AUTHOR_PAGE}: missing {PERSONAL_EMAIL}")

    for business_page in BUSINESS_PAGES:
        page_path = DIST / business_page
        if not page_path.is_file():
            failures.append(f"{business_page}: page is missing")
            continue
        if BUSINESS_EMAIL not in addresses_by_file[business_page]:
            failures.append(f"{business_page}: missing {BUSINESS_EMAIL}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1

    print(
        "Email routing OK: sales contact on business pages; "
        "personal contact only on Ben Petty's author page."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
