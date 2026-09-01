#!/usr/bin/env python3

import pathlib
import subprocess
import tempfile

REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parent.parent
CHECKER = REPOSITORY_ROOT / "scripts" / "check-email-routing.py"


def write_page(root: pathlib.Path, route: str, body: str) -> None:
    page = root / route / "index.html"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(body, encoding="utf-8")


def run_checker(root: pathlib.Path) -> subprocess.CompletedProcess[str]:
    if not CHECKER.is_file():
        return subprocess.CompletedProcess(
            args=[str(CHECKER), str(root)],
            returncode=127,
            stdout="",
            stderr="check-email-routing.py is missing",
        )

    return subprocess.run(
        [str(CHECKER), str(root)],
        check=False,
        capture_output=True,
        text=True,
    )


def make_valid_fixture(root: pathlib.Path) -> None:
    write_page(
        root,
        "authors/ben-petty",
        '<a href="mailto:benny@nw-local.com">benny@nw-local.com</a>',
    )
    write_page(
        root,
        "contact",
        '<a href="mailto:sales@nw-local.com">sales@nw-local.com</a>',
    )
    write_page(
        root,
        "retailers",
        '<a href="mailto:sales@nw-local.com">sales@nw-local.com</a>',
    )


def expect_result(
    label: str,
    result: subprocess.CompletedProcess[str],
    expected_returncode: int,
    expected_message: str,
) -> None:
    output = f"{result.stdout}\n{result.stderr}"
    if result.returncode != expected_returncode or expected_message not in output:
        raise AssertionError(
            f"{label}: expected exit {expected_returncode} containing "
            f"{expected_message!r}, got exit {result.returncode}: {output!r}"
        )


with tempfile.TemporaryDirectory() as temporary_directory:
    fixture_root = pathlib.Path(temporary_directory)
    make_valid_fixture(fixture_root)
    expect_result("valid routing", run_checker(fixture_root), 0, "Email routing OK")

with tempfile.TemporaryDirectory() as temporary_directory:
    fixture_root = pathlib.Path(temporary_directory)
    make_valid_fixture(fixture_root)
    contact_page = fixture_root / "contact" / "index.html"
    contact_page.write_text(
        contact_page.read_text(encoding="utf-8") + "benny@nw-local.com",
        encoding="utf-8",
    )
    expect_result(
        "personal email outside author profile",
        run_checker(fixture_root),
        1,
        "personal email appears outside authors/ben-petty/index.html",
    )

for business_route in ("contact", "retailers"):
    with tempfile.TemporaryDirectory() as temporary_directory:
        fixture_root = pathlib.Path(temporary_directory)
        make_valid_fixture(fixture_root)
        write_page(fixture_root, business_route, "No email here")
        expect_result(
            f"missing sales email on {business_route}",
            run_checker(fixture_root),
            1,
            f"{business_route}/index.html: missing sales@nw-local.com",
        )

with tempfile.TemporaryDirectory() as temporary_directory:
    fixture_root = pathlib.Path(temporary_directory)
    make_valid_fixture(fixture_root)
    contact_page = fixture_root / "contact" / "index.html"
    contact_page.write_text(
        contact_page.read_text(encoding="utf-8")
        + '<a href="mailto:legacy@nw-local.com">legacy@nw-local.com</a>',
        encoding="utf-8",
    )
    expect_result(
        "sales footer does not hide a wrong page-specific address",
        run_checker(fixture_root),
        1,
        "contact/index.html: unexpected public email legacy@nw-local.com",
    )

print("check-email-routing regression cases hold")
