#!/usr/bin/env python3
"""Verify the built public drop pages against their own certificate manifests.

Build mode checks every generated /drops/<slug>/ page against the
/drops/<slug>/coas.json the same build emitted from the same validated data:
the page's certificate links must equal the manifest, every linked
certificate page must exist, every declared lineage must be visible, and
every image inside the page must come from Sanity's CDN. Fixture mode runs the
same checks on one committed page so the checker can prove it rejects a page
that quietly lost a certificate link.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

from html_elements import is_descendant_of, parse_html_file


DROP_ROUTE_DIRECTORY = "drops"
COA_ROUTE_DIRECTORY = "coas"
PAGE_NAME = "index.html"
MANIFEST_NAME = "coas.json"
FIXTURE_PAGE_NAME = "drop-page.html"
FIXTURE_MANIFEST_NAME = "drop-coas.json"
FIXTURE_MODE_FLAG = "--fixture"
EXPECTED_FIXTURE_SLUG = "september-fixture"
PAGE_ATTRIBUTE = "data-drop-page"
CHAPTER_ATTRIBUTE = "data-drop-chapter"
LINEAGE_ATTRIBUTE = "data-drop-lineage"
COA_ATTRIBUTE = "data-drop-coa"
SANITY_CDN_HOST = "cdn.sanity.io"
# The ImageLightbox component renders one scaffold <img class="lightbox-image"
# src=""> that its script fills in when a photo is opened. It is present on any
# drop page whose gallery is non-empty, its empty src is by design, and its
# real source is the gallery thumbnails this checker already verifies. Every
# other image on the page is content and must resolve to a Sanity CDN URL.
LIGHTBOX_SCAFFOLD_CLASS = "lightbox-image"
COMMITTED_FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"


def is_lightbox_scaffold(image) -> bool:
    return LIGHTBOX_SCAFFOLD_CLASS in image.attributes.get("class", "").split()


def read_manifest(manifest: Path) -> list[str] | str:
    try:
        listed = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return f"cannot read manifest {manifest.name}: {error}"
    if not isinstance(listed, list) or any(not isinstance(item, str) for item in listed):
        return f"manifest {manifest.name} must be a JSON array of strings"
    return sorted(listed)


def check_page(page: Path, manifest: Path, build_root: Path, expected_slug: str) -> list[str]:
    failures: list[str] = []
    parser = parse_html_file(page)

    page_roots = [element for element in parser.elements if PAGE_ATTRIBUTE in element.attributes]
    if len(page_roots) != 1:
        return [f"expected one drop page root, found {len(page_roots)}"]
    page_root = page_roots[0]
    if page_root.attributes[PAGE_ATTRIBUTE] != expected_slug:
        failures.append(
            f"drop page slug {page_root.attributes[PAGE_ATTRIBUTE]!r} does not match route {expected_slug!r}"
        )
    inside = [element for element in parser.elements if is_descendant_of(element, page_root)]

    chapters = [element for element in inside if CHAPTER_ATTRIBUTE in element.attributes]
    if not chapters:
        failures.append("drop page has no strain chapters")
    for chapter in chapters:
        if chapter.attributes.get("id") != chapter.attributes[CHAPTER_ATTRIBUTE]:
            failures.append(f"chapter id does not match its anchor: {chapter.attributes[CHAPTER_ATTRIBUTE]!r}")

    for lineage in [element for element in inside if LINEAGE_ATTRIBUTE in element.attributes]:
        declared = lineage.attributes[LINEAGE_ATTRIBUTE]
        if not declared:
            failures.append("lineage attribute is empty")
        elif declared not in lineage.text:
            failures.append(f"lineage is not visible: {declared!r}")

    coa_links = [element for element in inside if COA_ATTRIBUTE in element.attributes]
    linked_ids: list[str] = []
    for link in coa_links:
        coa_id = link.attributes[COA_ATTRIBUTE]
        linked_ids.append(coa_id)
        if link.name != "a":
            failures.append(f"certificate marker is not an anchor: {coa_id!r}")
        if link.attributes.get("href") != f"/{COA_ROUTE_DIRECTORY}/{coa_id}/":
            failures.append(f"certificate link href does not point at its certificate page: {coa_id!r}")
        if not link.text:
            failures.append(f"certificate link has no visible text: {coa_id!r}")
        coa_page = build_root / COA_ROUTE_DIRECTORY / coa_id / PAGE_NAME
        if not coa_page.is_file():
            failures.append(f"certificate page does not exist: {coa_page.relative_to(build_root)}")

    listed = read_manifest(manifest)
    if isinstance(listed, str):
        failures.append(listed)
    elif sorted(linked_ids) != listed:
        failures.append(f"page links certificates {sorted(linked_ids)} but {MANIFEST_NAME} lists {listed}")

    for image in [element for element in inside if element.name == "img"]:
        if is_lightbox_scaffold(image):
            continue
        source = image.attributes.get("src", "")
        if urlsplit(source).netloc != SANITY_CDN_HOST:
            failures.append(f"image is not served from {SANITY_CDN_HOST}: {source!r}")

    return failures


def pages_for_root(build_root: Path, fixture_mode: bool) -> list[tuple[Path, Path, str]]:
    if fixture_mode:
        page = build_root / FIXTURE_PAGE_NAME
        return [(page, build_root / FIXTURE_MANIFEST_NAME, EXPECTED_FIXTURE_SLUG)] if page.is_file() else []
    return [
        (page, page.parent / MANIFEST_NAME, page.parent.name)
        for page in sorted((build_root / DROP_ROUTE_DIRECTORY).glob(f"*/{PAGE_NAME}"))
    ]


def main() -> int:
    arguments = sys.argv[1:]
    explicit_fixture_mode = arguments[:1] == [FIXTURE_MODE_FLAG]
    if explicit_fixture_mode:
        arguments = arguments[1:]
    if len(arguments) > 1:
        print("usage: check-drop-build.py [--fixture] [build-root]", file=sys.stderr)
        return 2

    build_root = Path(arguments[0] if arguments else "dist")
    if not build_root.is_dir():
        print(f"check-drop-build: no such directory: {build_root}", file=sys.stderr)
        return 2

    fixture_mode = explicit_fixture_mode or build_root.resolve() == COMMITTED_FIXTURE_ROOT
    pages = pages_for_root(build_root, fixture_mode)
    if not pages:
        if fixture_mode:
            print(f"check-drop-build: no fixture page found under {build_root}", file=sys.stderr)
            return 2
        print("drop build contract OK: no generated drop pages to verify.")
        return 0

    failures: list[str] = []
    for page, manifest, expected_slug in pages:
        relative_page = page.relative_to(build_root)
        failures.extend(
            f"{relative_page}: {failure}"
            for failure in check_page(page, manifest, build_root, expected_slug)
        )

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1

    print(f"drop build contract OK: {len(pages)} page(s) verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
