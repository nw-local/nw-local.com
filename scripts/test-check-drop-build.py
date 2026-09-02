#!/usr/bin/env python3
"""Regression-test scripts/check-drop-build.py against malformed drop pages."""

from pathlib import Path
import shutil
import subprocess
import tempfile


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CHECKER = REPOSITORY_ROOT / "scripts" / "check-drop-build.py"
FIXTURES = REPOSITORY_ROOT / "scripts" / "fixtures"
GOOD_PAGE = FIXTURES / "drop-page.html"
MANIFEST = FIXTURES / "drop-coas.json"
FIXTURE_PAGE_NAME = "drop-page.html"
FIXTURE_MANIFEST_NAME = "drop-coas.json"
COA_ROUTE_DIRECTORY = "coas"
LISTED_COA_IDS = (
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
)
CASES = (
    ("drop-page.html", 0, "drop build contract OK: 1 page(s) verified."),
    ("drop-page-missing-coa-link.html", 1, "page links certificates ['00000000-0000-4000-8000-000000000001'] but coas.json lists ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']"),
    ("drop-page-unlisted-coa-link.html", 1, "coas.json lists ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']"),
    ("drop-page-hidden-lineage.html", 1, "lineage is not visible: 'Grape Gas #10 × OGKB Blueberry Headband'"),
    ("drop-page-foreign-image.html", 1, "image is not served from cdn.sanity.io: 'https://example.com/one.webp'"),
)


def run_case(page_name: str, expected_exit: int, expected_text: str) -> None:
    with tempfile.TemporaryDirectory(prefix="check-drop-build-") as temporary_directory:
        fixture_root = Path(temporary_directory)
        shutil.copy2(FIXTURES / page_name, fixture_root / FIXTURE_PAGE_NAME)
        shutil.copy2(MANIFEST, fixture_root / FIXTURE_MANIFEST_NAME)
        for coa_id in LISTED_COA_IDS:
            coa_page = fixture_root / COA_ROUTE_DIRECTORY / coa_id / "index.html"
            coa_page.parent.mkdir(parents=True)
            coa_page.write_text("<main></main>", encoding="utf-8")
        result = subprocess.run(
            ["python3", str(CHECKER), "--fixture", str(fixture_root)],
            check=False,
            capture_output=True,
            text=True,
        )
    output = result.stdout + result.stderr
    if result.returncode != expected_exit or expected_text not in output:
        raise AssertionError(
            f"{page_name}: expected exit {expected_exit} mentioning {expected_text!r}, "
            f"got exit {result.returncode}: {output!r}"
        )
    print(f"check-drop-build regression holds for {page_name}")


for case in CASES:
    run_case(*case)


with tempfile.TemporaryDirectory(prefix="check-drop-build-missing-coa-") as temporary_directory:
    fixture_root = Path(temporary_directory)
    shutil.copy2(GOOD_PAGE, fixture_root / FIXTURE_PAGE_NAME)
    shutil.copy2(MANIFEST, fixture_root / FIXTURE_MANIFEST_NAME)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )
if result.returncode != 1 or "certificate page does not exist: coas/00000000-0000-4000-8000-000000000001/index.html" not in result.stderr:
    raise AssertionError(f"missing certificate page: got exit {result.returncode}: {result.stderr!r}")
print("check-drop-build missing certificate page regression holds")


with tempfile.TemporaryDirectory(prefix="check-drop-build-empty-") as temporary_directory:
    result = subprocess.run(
        ["python3", str(CHECKER), temporary_directory],
        check=False,
        capture_output=True,
        text=True,
    )
if result.returncode != 0 or result.stdout.strip() != "drop build contract OK: no generated drop pages to verify.":
    raise AssertionError(f"empty build root: got exit {result.returncode}: {result.stdout!r} {result.stderr!r}")
print("check-drop-build empty build-root regression holds")
