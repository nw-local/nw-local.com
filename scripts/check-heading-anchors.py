#!/usr/bin/env python3
"""Verify heading anchors on built pages are unique.

Portable Text section headings carry an `id` so a link can point at a section
rather than the top of a page. The way that breaks is a duplicate: two headings
slugify to the same id, the browser jumps to whichever came first, and the link
lands on the wrong section while looking like it worked. The page renders, the
build passes, and the link checker sees a perfectly valid same-page fragment.
Nothing else in CI would notice.

Scope, deliberately narrow: this checks that ids which exist are unique per
page. It does not check that every heading has one. Article bodies get ids from
PortableTextHeading.astro, but page furniture rendered by SectionHeading.astro
and the strain, terpene and glossary templates does not, and should not.
Distinguishing the two by regex is not possible once Astro has minified each
page onto a single line, so asserting presence here would mean either false
failures or a boundary heuristic that quietly stops working.

Usage: check-heading-anchors.py [dist-dir]
"""
import collections
import pathlib
import re
import sys

DIST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")

# Any id-bearing heading counts: a duplicate id is invalid HTML and breaks
# fragment links regardless of which template emitted it.
HEADING_ID = re.compile(r'<h[1-6]\s[^>]*id="([^"]+)"', re.I)


def main() -> int:
    if not DIST.is_dir():
        print(f"check-heading-anchors: no such directory: {DIST}", file=sys.stderr)
        print("Run `make build` first.", file=sys.stderr)
        return 2

    pages = sorted(p for p in DIST.rglob("*.html") if "_astro" not in p.parts)
    if not pages:
        print(f"check-heading-anchors: no HTML in {DIST}", file=sys.stderr)
        return 2

    failures: dict[str, list[str]] = {}
    total = 0
    with_anchors = 0

    for page in pages:
        ids = HEADING_ID.findall(page.read_text(encoding="utf-8", errors="replace"))
        if not ids:
            continue
        with_anchors += 1
        total += len(ids)
        repeated = sorted(i for i, n in collections.Counter(ids).items() if n > 1)
        if repeated:
            failures[str(page.relative_to(DIST))] = repeated

    if failures:
        for where, ids in sorted(failures.items()):
            print(f"{where}: duplicate heading anchor(s): {', '.join(ids)}", file=sys.stderr)
        print(
            "\nA duplicate anchor sends a section link to the wrong heading, silently. "
            "Reword one of the headings so they slugify differently.",
            file=sys.stderr,
        )
        return 1

    print(
        f"check-heading-anchors: {total} anchors across {with_anchors} page(s), all unique."
    )
    return 0


sys.exit(main())
