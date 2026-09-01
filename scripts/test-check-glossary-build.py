#!/usr/bin/env python3
"""Regression cases for scripts/check-glossary-build.py.

The checker consumes built HTML, so these cases copy every glossary page into
a temporary dist directory and make one deliberate mutation per case. Run
after `make build`; the script never contacts Sanity.
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
)
FAILURE_EPILOGUE = "Glossary build contracts failed. Fix the rendered page or its Sanity content before deploying."
FIXTURE_TERM_SLUG_STEM = "fixture-growth"
VALID_BODY_MARKUP = (
    '<div class="portable-text"><p>Expanded entry.</p></div>'
)


def replace_once( page: pathlib.Path, pattern: str, replacement: str ) -> None:
    source = page.read_text( encoding="utf-8" )
    updated, replacements = re.subn( pattern, replacement, source, count=1 )
    if replacements != 1:
        raise AssertionError( f"{page}: expected exactly one mutation for {pattern!r}, got {replacements}" )
    page.write_text( updated, encoding="utf-8" )


def replace_once_in_entry(
    page: pathlib.Path,
    entry_id: str,
    pattern: str,
    replacement: str,
) -> None:
    source = page.read_text( encoding="utf-8" )
    entry_pattern = re.compile(
        rf'<div class="glossary-index-entry"[^>]*data-glossary-id="{re.escape( entry_id )}".*?</div>',
        re.DOTALL,
    )
    entry_match = entry_pattern.search( source )
    if not entry_match:
        raise AssertionError( f"{page}: could not find directory entry {entry_id!r}" )

    updated_entry, replacements = re.subn(
        pattern,
        replacement,
        entry_match.group( 0 ),
        count=1,
        flags=re.DOTALL,
    )
    if replacements != 1:
        raise AssertionError(
            f"{page}: expected exactly one entry mutation for {pattern!r}, got {replacements}"
        )
    page.write_text(
        source[ :entry_match.start() ] + updated_entry + source[ entry_match.end(): ],
        encoding="utf-8",
    )


def make_fixture( temporary_root: pathlib.Path ) -> pathlib.Path:
    fixture_dist = temporary_root / "dist"
    for required_page in REQUIRED_PAGES:
        source_page = SOURCE_DIST / required_page
        if not source_page.is_file():
            raise FileNotFoundError( f"{source_page} is missing; run `make build` first." )
    source_pages = sorted( SOURCE_DIST.glob( "glossary/**/index.html" ) )
    if not source_pages:
        raise FileNotFoundError( f"{SOURCE_DIST}/glossary contains no built pages; run `make build` first." )
    for source_page in source_pages:
        destination_page = fixture_dist / source_page.relative_to( SOURCE_DIST )
        destination_page.parent.mkdir( parents=True, exist_ok=True )
        shutil.copy2( source_page, destination_page )
    return fixture_dist


def run_checker( fixture_dist: pathlib.Path ) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [ str( CHECKER ), str( fixture_dist ) ],
        check=False,
        capture_output=True,
        text=True,
    )


def assert_rejected(
    label: str,
    mutate: Callable[[pathlib.Path], None],
    expected_failure: str,
    expected_page: str = "glossary/index.html",
) -> None:
    with tempfile.TemporaryDirectory( prefix="check-glossary-build-" ) as temporary_directory:
        fixture_dist = make_fixture( pathlib.Path( temporary_directory ) )
        pristine = run_checker( fixture_dist )
        if pristine.returncode != 0:
            raise AssertionError(
                f"{label}: pristine fixture must pass, got {pristine.returncode}: {pristine.stderr}"
            )
        mutate( fixture_dist )
        result = run_checker( fixture_dist )
        if result.returncode != 1:
            raise AssertionError(
                f"{label}: expected checker exit 1, got {result.returncode}: {result.stderr}"
            )
        expected_stderr = f"{expected_page}: {expected_failure}\n\n{FAILURE_EPILOGUE}\n"
        if result.stderr != expected_stderr:
            raise AssertionError(
                f"{label}: expected only {expected_stderr!r}, got: {result.stderr}"
            )


def assert_accepted( label: str, mutate: Callable[[pathlib.Path], None] ) -> None:
    with tempfile.TemporaryDirectory( prefix="check-glossary-build-" ) as temporary_directory:
        fixture_dist = make_fixture( pathlib.Path( temporary_directory ) )
        mutate( fixture_dist )
        result = run_checker( fixture_dist )
        if result.returncode != 0:
            raise AssertionError(
                f"{label}: expected checker exit 0, got {result.returncode}: {result.stderr}"
            )


def unused_fixture_term_slug( fixture_dist: pathlib.Path ) -> str:
    candidate_slug = FIXTURE_TERM_SLUG_STEM
    candidate_number = 2
    while ( fixture_dist / "glossary" / candidate_slug / "index.html" ).exists():
        candidate_slug = f"{FIXTURE_TERM_SLUG_STEM}-{candidate_number}"
        candidate_number += 1
    return candidate_slug


def add_valid_future_term( fixture_dist: pathlib.Path ) -> pathlib.Path:
    index_page = fixture_dist / "glossary/index.html"
    source = index_page.read_text( encoding="utf-8" )
    future_slug = unused_fixture_term_slug( fixture_dist )
    future_href = f"/glossary/{future_slug}"
    future_entry = (
        '<div class="glossary-index-entry" data-glossary-entry '
        f'data-glossary-id="glossary-{future_slug}" data-glossary-term="Future glossary term" '
        'data-glossary-initial="f" data-glossary-category="cultivation" '
        'data-glossary-search-text="future glossary term a synthetic reference entry used to prove valid content growth cultivation">'
        f'<dt><a href="{future_href}">Future glossary term</a></dt>'
        '<dd class="glossary-index-definition">A synthetic reference entry used to prove valid content growth.</dd>'
        '<dd class="glossary-index-category">Cultivation</dd>'
        '</div>'
    )
    updated_source, replacements = re.subn(
        r"</dl>",
        future_entry + "</dl>",
        source,
        count=1,
    )
    if replacements != 1:
        raise AssertionError( f"{index_page}: could not append a future directory entry" )
    index_page.write_text( updated_source, encoding="utf-8" )

    future_page = fixture_dist / "glossary" / future_slug / "index.html"
    future_page.parent.mkdir( parents=True )
    future_page.write_text(
        '<!doctype html><html><head>'
        '<script type="application/ld+json">{"@type":"DefinedTerm"}</script>'
        '<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>'
        '</head><body><article class="glossary-reference"></article></body></html>',
        encoding="utf-8",
    )
    return future_page


def add_valid_body( page: pathlib.Path ) -> None:
    if 'class="portable-text"' in page.read_text( encoding="utf-8" ):
        raise AssertionError( f"{page}: growth fixture requires a concise entry" )
    replace_once( page, r"</article>", VALID_BODY_MARKUP + "</article>" )


def add_valid_future_body( fixture_dist: pathlib.Path ) -> None:
    future_page = add_valid_future_term( fixture_dist )
    add_valid_body( future_page )


def add_valid_directory_growth( fixture_dist: pathlib.Path ) -> None:
    add_valid_future_term( fixture_dist )


def add_body_growth_after_cultivar_is_long_form( fixture_dist: pathlib.Path ) -> None:
    cultivar_page = fixture_dist / "glossary/cultivar/index.html"
    if 'class="portable-text"' not in cultivar_page.read_text( encoding="utf-8" ):
        add_valid_body( cultivar_page )
    add_valid_future_body( fixture_dist )


case_failures: list[str] = []


def run_case( label: str, action: Callable[[], None] ) -> None:
    try:
        action()
    except ( AssertionError, FileNotFoundError ) as error:
        case_failures.append( f"{label}: {error}" )


run_case(
    "directory size follows the built corpus",
    lambda: assert_accepted( "directory size follows the built corpus", add_valid_directory_growth ),
)
run_case(
    "a formerly concise entry may gain a body",
    lambda: assert_accepted( "a formerly concise entry may gain a body", add_valid_future_body ),
)
run_case(
    "content growth does not depend on Cultivar remaining concise",
    lambda: assert_accepted(
        "content growth does not depend on Cultivar remaining concise",
        add_body_growth_after_cultivar_is_long_form,
    ),
)
run_case(
    "search input keeps its controller hook",
    lambda: assert_rejected(
        "search input keeps its controller hook",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r"\sdata-glossary-query",
            "",
        ),
        "search input is missing the data-glossary-query controller hook",
    ),
)
run_case(
    "directory entry keeps its controller hook",
    lambda: assert_rejected(
        "directory entry keeps its controller hook",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r"\sdata-glossary-entry",
            "",
        ),
        "/glossary/allele: directory entry is missing the data-glossary-entry controller hook",
    ),
)
run_case(
    "duplicate letter value",
    lambda: assert_rejected(
        "duplicate letter value",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r'(data-glossary-letter\s+data-filter-value=")z(")',
            r"\1a\2",
        ),
        "expected exactly the A-Z filter values",
    ),
)
run_case(
    "duplicate category value",
    lambda: assert_rejected(
        "duplicate category value",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r'(data-glossary-category-filter\s+data-filter-value=")business-regulation(")',
            r"\1nutrition\2",
        ),
        "expected exactly the category filter values",
    ),
)
run_case(
    "duplicate directory identity",
    lambda: assert_rejected(
        "duplicate directory identity",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r'(data-glossary-id=")glossary-anemometer(")',
            r"\1glossary-allele\2",
        ),
        "directory identities must be distinct: glossary-allele",
    ),
)
run_case(
    "duplicate directory link",
    lambda: assert_rejected(
        "duplicate directory link",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r'(<a href=")/glossary/anemometer(">Anemometer</a>)',
            r"\1/glossary/allele\2",
        ),
        "directory links must be distinct: /glossary/allele",
    ),
)
run_case(
    "missing directory link",
    lambda: assert_rejected(
        "missing directory link",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r'<a href="/glossary/allele">Allele</a>',
            "<a>Allele</a>",
        ),
        "directory entry must have exactly one glossary link",
    ),
)
run_case(
    "missing canonical-term metadata",
    lambda: assert_rejected(
        "missing canonical-term metadata",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'\sdata-glossary-term="Allele"',
            "",
        ),
        "/glossary/allele: directory entry has no data-glossary-term",
    ),
)
run_case(
    "canonical-term metadata matches visible text",
    lambda: assert_rejected(
        "canonical-term metadata matches visible text",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'data-glossary-term="Allele"',
            'data-glossary-term="Wrong term"',
        ),
        "/glossary/allele: data-glossary-term does not match the visible term",
    ),
)
run_case(
    "initial metadata follows the canonical term",
    lambda: assert_rejected(
        "initial metadata follows the canonical term",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'data-glossary-initial="a"',
            'data-glossary-initial="z"',
        ),
        '/glossary/allele: data-glossary-initial "z" does not match "a"',
    ),
)
run_case(
    "category metadata is recognized",
    lambda: assert_rejected(
        "category metadata is recognized",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'data-glossary-category="plant-biology"',
            'data-glossary-category="unknown"',
        ),
        '/glossary/allele: data-glossary-category has unknown value "unknown"',
    ),
)
run_case(
    "search metadata includes the visible definition",
    lambda: assert_rejected(
        "search metadata includes the visible definition",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'data-glossary-search-text="[^"]*"',
            'data-glossary-search-text="allele plant biology"',
        ),
        "/glossary/allele: data-glossary-search-text does not include the visible definition",
    ),
)
run_case(
    "visible definitions are nonempty",
    lambda: assert_rejected(
        "visible definitions are nonempty",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'(<dd class="glossary-index-definition">)[^<]+(</dd>)',
            r"\1\2",
        ),
        "/glossary/allele: directory entry has no visible definition",
    ),
)
run_case(
    "visible categories match category metadata",
    lambda: assert_rejected(
        "visible categories match category metadata",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r'(<dd class="glossary-index-category">)Plant Biology(</dd>)',
            r"\1Chemistry\2",
        ),
        '/glossary/allele: visible category "Chemistry" does not match "Plant Biology"',
    ),
)
run_case(
    "category controls use a marker entries cannot satisfy",
    lambda: assert_rejected(
        "category controls use a marker entries cannot satisfy",
        lambda fixture_dist: replace_once_in_entry(
            fixture_dist / "glossary/index.html",
            "glossary-allele",
            r"data-glossary-entry",
            "data-glossary-entry data-glossary-category-filter",
        ),
        "/glossary/allele: data-glossary-category-filter belongs only on filter buttons inside the control band",
    ),
)
run_case(
    "selected reference sections stay removed",
    lambda: assert_rejected(
        "selected reference sections stay removed",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/index.html",
            r'(<section class="glossary-directory-section">)',
            r'<section class="glossary-featured-guides"></section>\1',
        ),
        "glossary index must not render a selected-reference-article section",
    ),
)
run_case(
    "editorial heroes stay removed from term pages",
    lambda: assert_rejected(
        "editorial heroes stay removed from term pages",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/ec/index.html",
            r'(</header>)',
            r'<figure class="glossary-specimen"></figure>\1',
        ),
        "glossary entries must not render editorial hero images",
        expected_page="glossary/ec/index.html",
    ),
)
run_case(
    "article metadata stays removed from term pages",
    lambda: assert_rejected(
        "article metadata stays removed from term pages",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/ec/index.html",
            r'(</header>)',
            r'<p class="glossary-entry-meta">2 min read</p>\1',
        ),
        "glossary entries must not render article reading metadata",
        expected_page="glossary/ec/index.html",
    ),
)
run_case(
    "article contents stay removed from term pages",
    lambda: assert_rejected(
        "article contents stay removed from term pages",
        lambda fixture_dist: replace_once(
            fixture_dist / "glossary/ec/index.html",
            r'(<div class="glossary-entry-reading">)',
            r'<aside class="glossary-entry-contents"></aside>\1',
        ),
        "glossary entries must not render article contents navigation",
        expected_page="glossary/ec/index.html",
    ),
)

if case_failures:
    print( "check-glossary-build regression cases failed:", file=sys.stderr )
    for failure in case_failures:
        print( f"  - {failure}", file=sys.stderr )
    sys.exit( 1 )

print( "check-glossary-build regression cases hold" )
