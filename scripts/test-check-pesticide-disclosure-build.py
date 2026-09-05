#!/usr/bin/env python3
"""Regression-test the pesticide-disclosure contract in scripts/check-pesticide-disclosure-build.py."""

from pathlib import Path
import shutil
import subprocess
import tempfile


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CHECKER = REPOSITORY_ROOT / "scripts" / "check-pesticide-disclosure-build.py"
NONE_APPLIED_HAS_APPLICATIONS_FIXTURE = (
    REPOSITORY_ROOT / "scripts" / "fixtures" / "pesticide-disclosure-page-none-applied-has-applications.html"
)
HIDDEN_APPLICATION_FIXTURE = (
    REPOSITORY_ROOT / "scripts" / "fixtures" / "pesticide-disclosure-page-hidden-application.html"
)
FIXTURE_PAGE_NAME = "pesticide-disclosure-page.html"
NONE_APPLIED_HAS_APPLICATIONS_FAILURE = (
    "pesticide disclosure declares no pesticides applied but found 1 application block(s)"
)
HIDDEN_APPLICATION_FAILURE = "pesticide application target pest is not visible: 'Powdery mildew'"
EMPTY_BUILD_ROOT_SUCCESS = (
    "Pesticide disclosure build contract OK: no generated disclosure pages to verify."
)
EMPTY_FIXTURE_FAILURE = "check-pesticide-disclosure-build: no fixture page found under"


with tempfile.TemporaryDirectory(prefix="check-pesticide-disclosure-build-") as temporary_directory:
    fixture_root = Path(temporary_directory)
    shutil.copy2(NONE_APPLIED_HAS_APPLICATIONS_FIXTURE, fixture_root / FIXTURE_PAGE_NAME)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )

if result.returncode != 1 or NONE_APPLIED_HAS_APPLICATIONS_FAILURE not in result.stderr:
    raise AssertionError(
        "none-applied contradiction: expected checker rejection naming the stray "
        f"application block, got exit {result.returncode}: {result.stderr!r}"
    )

print("check-pesticide-disclosure-build none-applied contradiction regression holds")


with tempfile.TemporaryDirectory(prefix="check-pesticide-disclosure-build-hidden-") as temporary_directory:
    fixture_root = Path(temporary_directory)
    shutil.copy2(HIDDEN_APPLICATION_FIXTURE, fixture_root / FIXTURE_PAGE_NAME)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )

if result.returncode != 1 or HIDDEN_APPLICATION_FAILURE not in result.stderr:
    raise AssertionError(
        "hidden application field: expected checker rejection naming the invisible "
        f"target pest, got exit {result.returncode}: {result.stderr!r}"
    )

print("check-pesticide-disclosure-build application visibility regression holds")


with tempfile.TemporaryDirectory(prefix="check-pesticide-disclosure-build-empty-") as temporary_directory:
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

print("check-pesticide-disclosure-build empty build-root regression holds")


with tempfile.TemporaryDirectory(prefix="check-pesticide-disclosure-build-empty-fixture-") as temporary_directory:
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

print("check-pesticide-disclosure-build empty fixture-root regression holds")
