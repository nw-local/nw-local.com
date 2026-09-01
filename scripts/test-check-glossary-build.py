#!/usr/bin/env python3
"""Regression cases for scripts/check-glossary-build.py.

The checker consumes built HTML, so these cases copy its three required pages
into a temporary dist directory and make one deliberate malformed mutation per
case. Run after `make build`; the script never contacts Sanity.
"""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable


REPOSITORY_ROOT = pathlib.Path( __file__ ).parent.parent
CHECKER = REPOSITORY_ROOT / "scripts/check-glossary-build.py"
SOURCE_DIST = pathlib.Path( sys.argv[ 1 ] if len( sys.argv ) > 1 else "dist" )
REQUIRED_PAGES = (
    pathlib.Path( "glossary/index.html" ),
    pathlib.Path( "glossary/ec/index.html" ),
    pathlib.Path( "glossary/cultivar/index.html" ),
)


def replace_once( page: pathlib.Path, pattern: str, replacement: str ) -> None:
    source = page.read_text( encoding="utf-8" )
    updated, replacements = re.subn( pattern, replacement, source, count=1 )
    if replacements != 1:
        raise AssertionError( f"{page}: expected exactly one mutation for {pattern!r}, got {replacements}" )
    page.write_text( updated, encoding="utf-8" )


def make_fixture( temporary_root: pathlib.Path ) -> pathlib.Path:
    fixture_dist = temporary_root / "dist"
    for required_page in REQUIRED_PAGES:
        source_page = SOURCE_DIST / required_page
        if not source_page.is_file():
            raise FileNotFoundError( f"{source_page} is missing; run `make build` first." )
        destination_page = fixture_dist / required_page
        destination_page.parent.mkdir( parents=True, exist_ok=True )
        shutil.copy2( source_page, destination_page )
    return fixture_dist


def assert_rejected( label: str, mutate: Callable[[pathlib.Path], None], expected_message: str ) -> None:
    with tempfile.TemporaryDirectory( prefix="check-glossary-build-" ) as temporary_directory:
        fixture_dist = make_fixture( pathlib.Path( temporary_directory ) )
        mutate( fixture_dist / "glossary/index.html" )
        result = subprocess.run(
            [ str( CHECKER ), str( fixture_dist ) ],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 1:
            raise AssertionError(
                f"{label}: expected checker exit 1, got {result.returncode}: {result.stderr}"
            )
        if expected_message not in result.stderr:
            raise AssertionError(
                f"{label}: expected {expected_message!r} in checker output, got: {result.stderr}"
            )


assert_rejected(
    "duplicate letter value",
    lambda page: replace_once( page, r'(data-glossary-letter\s+data-filter-value=")z(")', r"\1a\2" ),
    "expected exactly the A-Z filter values",
)
assert_rejected(
    "duplicate category value",
    lambda page: replace_once(
        page,
        r'(data-glossary-category\s+data-filter-value=")business-regulation(")',
        r"\1nutrition\2",
    ),
    "expected exactly the category filter values",
)
assert_rejected(
    "duplicate directory identity",
    lambda page: replace_once(
        page,
        r'(data-glossary-id=")glossary-anemometer(")',
        r"\1glossary-allele\2",
    ),
    "directory identities must be distinct",
)
assert_rejected(
    "duplicate directory link",
    lambda page: replace_once( page, r'(<a href=")/glossary/anemometer(">Anemometer</a>)', r"\1/glossary/allele\2" ),
    "directory links must be distinct",
)
assert_rejected(
    "missing directory link",
    lambda page: replace_once( page, r'<a href="/glossary/allele">Allele</a>', "<a>Allele</a>" ),
    "directory entry must have exactly one glossary link",
)

print( "check-glossary-build regression cases hold" )
