#!/usr/bin/env python3
"""Regression-test certificate-link binding in scripts/check-coa-build.py."""

from pathlib import Path
import shutil
import subprocess
import tempfile


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CHECKER = REPOSITORY_ROOT / "scripts" / "check-coa-build.py"
UNBOUND_CERTIFICATE_FIXTURE = (
    REPOSITORY_ROOT / "scripts" / "fixtures" / "coa-page-unbound-certificate.html"
)
HIDDEN_METRIC_STATUS_FIXTURE = (
    REPOSITORY_ROOT / "scripts" / "fixtures" / "coa-page-hidden-metric-status.html"
)
FIXTURE_PAGE_NAME = "coa-page.html"
EXPECTED_FAILURE = "expected one visible COA certificate anchor, found 0"
EMPTY_BUILD_ROOT_SUCCESS = "COA build contract OK: no generated COA pages to verify."
EMPTY_FIXTURE_FAILURE = "check-coa-build: no fixture page found under"
HIDDEN_METRIC_STATUS_FAILURE = "COA explicit metric status is not visible: 'fail'"


with tempfile.TemporaryDirectory(prefix="check-coa-build-") as temporary_directory:
    fixture_root = Path(temporary_directory)
    shutil.copy2(UNBOUND_CERTIFICATE_FIXTURE, fixture_root / FIXTURE_PAGE_NAME)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )

if result.returncode != 1 or EXPECTED_FAILURE not in result.stderr:
    raise AssertionError(
        "unbound certificate marker: expected checker rejection naming the "
        f"certificate anchor, got exit {result.returncode}: {result.stderr!r}"
    )

print("check-coa-build certificate binding regression holds")


with tempfile.TemporaryDirectory(prefix="check-coa-build-status-") as temporary_directory:
    fixture_root = Path(temporary_directory)
    shutil.copy2(HIDDEN_METRIC_STATUS_FIXTURE, fixture_root / FIXTURE_PAGE_NAME)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )

if result.returncode != 1 or HIDDEN_METRIC_STATUS_FAILURE not in result.stderr:
    raise AssertionError(
        "hidden metric status: expected checker rejection naming the invisible "
        f"status, got exit {result.returncode}: {result.stderr!r}"
    )

print("check-coa-build explicit metric status visibility regression holds")


with tempfile.TemporaryDirectory(prefix="check-coa-build-empty-") as temporary_directory:
    empty_build_root = Path(temporary_directory)
    result = subprocess.run(
        ["python3", str(CHECKER), str(empty_build_root)],
        check=False,
        capture_output=True,
        text=True,
    )

if result.returncode != 0 or result.stdout.strip() != EMPTY_BUILD_ROOT_SUCCESS:
    raise AssertionError(
        "empty build root: expected a successful pre-publication result, got "
        f"exit {result.returncode}: {result.stdout!r} {result.stderr!r}"
    )

print("check-coa-build empty build-root regression holds")


with tempfile.TemporaryDirectory(prefix="check-coa-build-empty-fixture-") as temporary_directory:
    empty_fixture_root = Path(temporary_directory)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(empty_fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )

if result.returncode != 2 or EMPTY_FIXTURE_FAILURE not in result.stderr:
    raise AssertionError(
        "empty fixture root: expected a missing-fixture failure, got "
        f"exit {result.returncode}: {result.stdout!r} {result.stderr!r}"
    )

print("check-coa-build empty fixture-root regression holds")
