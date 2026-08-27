#!/usr/bin/env python3
#
# Fail if a published table promises a numeric threshold its own cells break.
#
# The bug this exists for shipped in PR #73. The CO2 post's dew point table is
# captioned "Highest dew point that still holds humidity under the threshold",
# and five of its ten ceilings did not hold it. Every cell was a Magnus-equation
# result rounded to the nearest whole °F, which put the 74 °F night's 70 percent
# ceiling at an actual 71.00 percent and four others between 0.2 and 0.8 points
# over. Nothing caught it: the overshoot is a fraction of a unit, so the cell
# looks unremarkable beside its neighbors, and check-content-style.py asserts a
# temperature carries both units rather than that it is correct.
#
# That is the gap. Every other check in this repo verifies FORM. This one
# verifies ARITHMETIC, which is the only thing that catches a well-formatted
# wrong number.
#
# Why rounding is directional at all: a ceiling has to round down and a minimum
# has to round up, even when the exact value sits nearer the other side, because
# "nearest" is exactly what steps over the line the caption promised. See
# floor_to and ceil_to in psychrometrics.py.
#
# How a table opts in, and why there is no registry: the table describes itself.
# A caption naming a threshold plus a column header of the form "under N
# percent" is enough to derive the check, so a new table of the same shape is
# covered the day it is published without anyone remembering to register it. A
# registry would have exactly the fail-open shape CLAUDE.md warns about
# repeatedly: it looks like coverage while asserting nothing about the table
# nobody added to it.
#
# The guard that closes the remaining hole: a caption that promises a bound but
# whose columns cannot be parsed is reported as UNVERIFIABLE and fails the run.
# Without that, rewording a header would silently switch the check off while the
# caption kept making the promise. If a table trips this and genuinely is not a
# threshold table, reword the caption rather than teaching the script to ignore
# it, because the caption is what makes the promise to the reader.
#
# Why it audits `dist/` rather than querying Sanity: same reasoning as
# check-content-style.py. The build flattens every field onto one surface, so a
# table reaches this check regardless of which schema field produced it.
#
# Where it runs: on pull requests via audit.yml, on the nightly run against
# main, and as a blocking step in deploy.yml. That third path is the one that
# matters most here, because a threshold table is CONTENT and content reaches
# production through Sanity's webhook, which fires workflow_dispatch on
# deploy.yml and touches neither of the other two. A check that guards only
# pull requests would never once have run against the content it was written
# for. That is recorded in CLAUDE.md as its own invariant.
#
# Usage:
#   ./scripts/check-threshold-tables.py [dist-dir]   # defaults to ./dist

import html
import pathlib
import re
import sys
from html.parser import HTMLParser

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from psychrometrics import relative_humidity_at_dew_point  # noqa: E402

# A caption containing any of these promises the reader a bound. Deliberately
# narrow: "holds", "target" and "optimum" are NOT here, because a table can
# describe a target without promising a limit, and widening this list would fail
# tables that never made a promise. Block 51 of the CO2 post is the case that
# matters: "Humidity that holds the dry end of the VPD band" names no limit, and
# its cells are correctly rounded to nearest.
THRESHOLD_CAPTION_PATTERNS = (
    r"\bunder\b",
    r"\bbelow\b",
    r"\bceiling\b",
    r"\bthreshold\b",
    r"\bno higher than\b",
    r"\bno lower than\b",
    r"\bat least\b",
    r"\bat most\b",
    r"\bminimum\b",
    r"\bmaximum\b",
    r"\bhighest\b",
    r"\blowest\b",
)

# "Ceiling to stay under 70 percent RH" -> a ceiling column limited to 70.
# Both spellings of the unit. A table header is a width-constrained place, so
# "under 65% RH" is the natural thing to write there even though running prose
# spells the word out. Accepting only "percent" made a reasonable formatting
# choice silently switch the check off: the caption still promised a bound, no
# header parsed one, and the unverifiable guard failed the deploy. The header is
# where the limit is declared, so it has to accept how a header is actually
# written.
PERCENT = r"(?:percent|%)"
CEILING_HEADER = re.compile(rf"under\s+(\d+(?:\.\d+)?)\s*{PERCENT}", re.IGNORECASE)
MINIMUM_HEADER = re.compile(
    rf"(?:above|over)\s+(\d+(?:\.\d+)?)\s*{PERCENT}", re.IGNORECASE)

# The leading Fahrenheit figure in a cell like "74 °F (23 °C)".
FAHRENHEIT = re.compile(r"(-?\d+(?:\.\d+)?)\s*°\s*F")


class TableParser(HTMLParser):
    """Pull caption, headers and rows out of every .pt-table-figure."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self._figure_depth = 0
        self._in_caption = False
        self._in_cell = False
        self._in_head = False
        self._buffer = []
        self._row = []
        self._current = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = attributes.get("class", "").split()

        if tag == "figure" and "pt-table-figure" in classes:
            self._figure_depth = 1
            self._current = {"caption": "", "headers": [], "rows": []}
            return
        if not self._current:
            return

        if tag == "figure":
            self._figure_depth += 1
        elif tag == "figcaption" and "pt-table-caption" in classes:
            self._in_caption = True
            self._buffer = []
        elif tag == "thead":
            self._in_head = True
        elif tag == "tr":
            self._row = []
        elif tag in ("th", "td"):
            self._in_cell = True
            self._buffer = []
        elif tag == "br" and self._in_cell:
            # Cells carry a hard break before the Celsius conversion. Join with
            # a space so "74 °F<br>(23 °C)" reads as one value.
            self._buffer.append(" ")

    def handle_endtag(self, tag):
        if not self._current:
            return

        if tag == "figcaption" and self._in_caption:
            self._current["caption"] = "".join(self._buffer).strip()
            self._in_caption = False
        elif tag in ("th", "td") and self._in_cell:
            self._row.append(" ".join("".join(self._buffer).split()))
            self._in_cell = False
        elif tag == "thead":
            self._in_head = False
        elif tag == "tr":
            if self._in_head or not self._current["headers"]:
                self._current["headers"] = self._row
            else:
                self._current["rows"].append(self._row)
            self._row = []
        elif tag == "figure":
            self._figure_depth -= 1
            if self._figure_depth == 0:
                self.tables.append(self._current)
                self._current = None

    def handle_data(self, data):
        if self._in_caption or self._in_cell:
            self._buffer.append(data)


def caption_promises_a_bound(caption):
    lowered = caption.lower()
    return any(re.search(pattern, lowered) for pattern in THRESHOLD_CAPTION_PATTERNS)


def leading_fahrenheit(cell):
    match = FAHRENHEIT.search(html.unescape(cell))
    return float(match.group(1)) if match else None


def verify_dew_point_table(table, where):
    """Return (checked_cell_count, [failure strings]).

    Shape: first column is the room temperature, and any column whose header
    names a percent bound holds a dew point that must produce no more than that
    humidity in the room named by column one.
    """
    headers = table["headers"]
    bounded_columns = []
    for index, header in enumerate(headers[1:], start=1):
        ceiling = CEILING_HEADER.search(header)
        if ceiling:
            bounded_columns.append((index, float(ceiling.group(1)), "ceiling"))
            continue
        minimum = MINIMUM_HEADER.search(header)
        if minimum:
            bounded_columns.append((index, float(minimum.group(1)), "minimum"))

    if not bounded_columns:
        return 0, [
            f"{where}: caption promises a bound but no column header names one. "
            f"Headers: {headers}. Either name the limit in the header "
            f'(for example "Ceiling to stay under 70 percent RH") or reword the '
            f"caption so it stops promising the reader a limit."
        ]

    failures = []
    checked = 0
    for row_index, row in enumerate(table["rows"], start=1):
        room_f = leading_fahrenheit(row[0])
        if room_f is None:
            failures.append(
                f"{where}: row {row_index} has no Fahrenheit value in its first "
                f"column ({row[0]!r}), so its bounds cannot be verified."
            )
            continue
        for column, limit, kind in bounded_columns:
            if column >= len(row):
                continue
            published_f = leading_fahrenheit(row[column])
            if published_f is None:
                failures.append(
                    f"{where}: row {row_index} column {column + 1} "
                    f"({row[column]!r}) has no Fahrenheit value."
                )
                continue
            implied = relative_humidity_at_dew_point(published_f, room_f) * 100
            checked += 1
            over = kind == "ceiling" and implied > limit
            under = kind == "minimum" and implied < limit
            if over or under:
                direction = "over" if over else "under"
                fix = "Round the cell down" if over else "Round the cell up"
                failures.append(
                    f"{where}: at {room_f:g} °F, a dew point of {published_f:g} °F "
                    f"implies {implied:.2f} percent RH, which is {direction} the "
                    f"{limit:g} percent this column promises. {fix}: rounding to "
                    f"nearest is what steps over the line."
                )
    return checked, failures


def main():
    dist = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    if not dist.is_dir():
        print(f"FAIL: no build to check at {dist}. Run `make build` first.")
        return 1

    pages = sorted(dist.rglob("*.html"))
    if not pages:
        print(f"FAIL: {dist} contains no HTML. Run `make build` first.")
        return 1

    failures = []
    checked_cells = 0
    checked_tables = 0
    total_tables = 0

    for page in pages:
        parser = TableParser()
        parser.feed(page.read_text(encoding="utf-8"))
        for table in parser.tables:
            total_tables += 1
            caption = table["caption"]
            if not caption_promises_a_bound(caption):
                continue
            where = f"{page.relative_to(dist)} :: {caption!r}"
            cells, problems = verify_dew_point_table(table, where)
            checked_cells += cells
            checked_tables += 1
            failures.extend(problems)

    if failures:
        print(f"FAIL: {len(failures)} threshold problem(s).")
        print("  A caption that names a limit makes rounding directional: a")
        print("  ceiling rounds DOWN and a minimum rounds UP, even when the")
        print("  exact value sits nearer the other side.")
        print()
        for failure in failures:
            print(f"  {failure}")
        print()
        return 1

    print(
        f"check-threshold-tables: {checked_cells} bounded cell(s) across "
        f"{checked_tables} table(s) hold their captions "
        f"({total_tables} table(s) seen, the rest promise no limit)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
