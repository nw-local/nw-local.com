#!/usr/bin/env python3
"""Verify the built public certificate-of-analysis pages.

The fixture mode keeps one representative certificate independent of Sanity so
the checker can prove it rejects a page that loses the signed-PDF link. Build
mode checks every generated /coas/<UUID>/ page and derives its route identity
from the emitted page rather than a fixed content count.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import sys

from html_elements import Element, elements_with_attribute, is_descendant_of, parse_html_file


COA_ROUTE_DIRECTORY = "coas"
FIXTURE_PAGE_NAME = "coa-page.html"
FIXTURE_MODE_FLAG = "--fixture"
COA_PAGE_NAME = "index.html"
SOURCE_ID_ATTRIBUTE = "data-coa-source-id"
STATUS_ATTRIBUTE = "data-coa-status"
PUBLISHED_AT_ATTRIBUTE = "data-coa-published-at"
SUMMARY_ATTRIBUTE = "data-coa-summary"
READING_ATTRIBUTE = "data-coa-reading"
READING_LABEL_ATTRIBUTE = "data-coa-reading-label"
READING_VALUE_ATTRIBUTE = "data-coa-reading-value"
READING_UNIT_ATTRIBUTE = "data-coa-reading-unit"
PANEL_ATTRIBUTE = "data-coa-panel"
PANEL_NAME_ATTRIBUTE = "data-coa-panel-name"
METRIC_ATTRIBUTE = "data-coa-metric"
METRIC_STATUS_ATTRIBUTE = "data-coa-metric-status"
METRIC_NAME_ATTRIBUTE = "data-coa-metric-name"
METRIC_VALUE_ATTRIBUTE = "data-coa-metric-value"
METRIC_UNIT_ATTRIBUTE = "data-coa-metric-unit"
CERTIFICATE_ATTRIBUTE = "data-coa-certificate"
CERTIFICATE_LINK_TEXT = "Download certificate PDF"
VALID_STATUSES = { "pass", "fail" }
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
DECIMAL_PATTERN = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$")
RFC3339_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$"
)
EXPECTED_FIXTURE_SOURCE_ID = "00000000-0000-4000-8000-000000000001"
EXPECTED_FIXTURE_STATUS = "pass"
EXPECTED_FIXTURE_PUBLISHED_AT = "2026-09-01T21:15:30Z"
EXPECTED_FIXTURE_READINGS = (
    ( "Total THC (calculated)", "29.39", "%" ),
    ( "Water activity", "0", "aw" ),
)
EXPECTED_FIXTURE_PANELS = (
    ( "Cannabinoids", "pass", ( ( "D9-THC", "0.12", "%", "fail", "fail" ), ) ),
    ( "Microbial", "pass", ( ( "Total yeast and mold", "0", "CFU/g", "pass", "" ), ) ),
)
COMMITTED_FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"


def expect_exactly_one(
    elements: list[Element],
    description: str,
    failures: list[str],
) -> Element | None:
    if len(elements) != 1:
        failures.append(f"expected one {description}, found {len(elements)}")
        return None
    return elements[0]


def is_canonical_decimal(value: str) -> bool:
    return bool(DECIMAL_PATTERN.fullmatch(value))


def is_pdf_href(href: str) -> bool:
    return href.lower().split("?", maxsplit=1)[0].endswith(".pdf")


def is_rfc3339_timestamp(value: str) -> bool:
    if not RFC3339_PATTERN.fullmatch(value):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def check_page(page: Path, expected_source_id: str | None = None) -> list[str]:
    parser = parse_html_file(page)
    failures: list[str] = []

    main = expect_exactly_one(
        elements_with_attribute(parser, SOURCE_ID_ATTRIBUTE),
        "COA main landmark",
        failures,
    )
    if main:
        source_id = main.attributes[SOURCE_ID_ATTRIBUTE]
        if not UUID_PATTERN.fullmatch(source_id):
            failures.append(f"COA source id is not a UUID: {source_id!r}")
        if expected_source_id and source_id != expected_source_id:
            failures.append(
                f"COA source id {source_id!r} does not match route {expected_source_id!r}"
            )

    status = expect_exactly_one(
        elements_with_attribute(parser, STATUS_ATTRIBUTE),
        "COA result status",
        failures,
    )
    if status and status.attributes[STATUS_ATTRIBUTE] not in VALID_STATUSES:
        failures.append(f"COA status is invalid: {status.attributes[STATUS_ATTRIBUTE]!r}")

    published_at = expect_exactly_one(
        elements_with_attribute(parser, PUBLISHED_AT_ATTRIBUTE),
        "COA publication timestamp",
        failures,
    )
    if published_at:
        timestamp = published_at.attributes[PUBLISHED_AT_ATTRIBUTE]
        if published_at.name != "time":
            failures.append("COA publication timestamp must be rendered by a time element")
        if not is_rfc3339_timestamp(timestamp):
            failures.append(f"COA publication timestamp is not RFC3339: {timestamp!r}")
        if published_at.attributes.get("datetime") != timestamp:
            failures.append("COA publication timestamp datetime does not match its source value")
        if not published_at.text:
            failures.append("COA publication timestamp is not visible")

    expect_exactly_one(
        elements_with_attribute(parser, SUMMARY_ATTRIBUTE),
        "COA result summary",
        failures,
    )

    for reading in elements_with_attribute(parser, READING_ATTRIBUTE):
        label = reading.attributes.get(READING_LABEL_ATTRIBUTE, "")
        value = reading.attributes.get(READING_VALUE_ATTRIBUTE, "")
        unit = reading.attributes.get(READING_UNIT_ATTRIBUTE, "")
        if not label or not value or not unit:
            failures.append("COA headline reading is missing label, value, or unit metadata")
            continue
        if not is_canonical_decimal(value):
            failures.append(f"COA headline reading has a non-canonical value: {value!r}")
        for field_name, field_value in (
            ( "label", label ),
            ( "value", value ),
            ( "unit", unit ),
        ):
            if field_value not in reading.text:
                failures.append(
                    f"COA headline reading {field_name} is not visible: {field_value!r}"
                )

    for panel in elements_with_attribute(parser, PANEL_ATTRIBUTE):
        panel_name = panel.attributes.get(PANEL_NAME_ATTRIBUTE, "")
        panel_status = panel.attributes[PANEL_ATTRIBUTE]
        if not panel_name:
            failures.append("COA panel is missing its name")
        if panel_status not in VALID_STATUSES:
            failures.append(f"COA panel status is invalid: {panel_status!r}")
        if panel_name and panel_name not in panel.text:
            failures.append(f"COA panel name is not visible: {panel_name!r}")
        if panel_status not in panel.text.lower():
            failures.append(f"COA panel status is not visible: {panel_status!r}")

    for metric in elements_with_attribute(parser, METRIC_ATTRIBUTE):
        metric_name = metric.attributes.get(METRIC_NAME_ATTRIBUTE, "")
        value = metric.attributes.get(METRIC_VALUE_ATTRIBUTE, "")
        unit = metric.attributes.get(METRIC_UNIT_ATTRIBUTE, "")
        metric_status = metric.attributes[METRIC_ATTRIBUTE]
        explicit_status = metric.attributes.get(METRIC_STATUS_ATTRIBUTE, "")
        if not metric_name or not value or not unit:
            failures.append("COA metric is missing name, value, or unit metadata")
            continue
        if not is_canonical_decimal(value):
            failures.append(f"COA metric has a non-canonical value: {value!r}")
        if metric_status not in VALID_STATUSES:
            failures.append(f"COA metric status is invalid: {metric_status!r}")
        if explicit_status:
            if explicit_status not in VALID_STATUSES:
                failures.append(f"COA explicit metric status is invalid: {explicit_status!r}")
            if explicit_status != metric_status:
                failures.append("COA explicit metric status does not match its effective status")
            if explicit_status not in metric.text.lower():
                failures.append(f"COA explicit metric status is not visible: {explicit_status!r}")
        for field_name, field_value in (
            ( "name", metric_name ),
            ( "value", value ),
            ( "unit", unit ),
        ):
            if field_value not in metric.text:
                failures.append(f"COA metric {field_name} is not visible: {field_value!r}")

    pdf_links = [
        element
        for element in parser.elements
        if element.name == "a" and is_pdf_href(element.attributes.get("href", ""))
    ]
    certificate_anchor = expect_exactly_one(
        [
            element
            for element in elements_with_attribute(parser, CERTIFICATE_ATTRIBUTE)
            if element.name == "a"
        ],
        "visible COA certificate anchor",
        failures,
    )
    if certificate_anchor:
        certificate_href = certificate_anchor.attributes.get("href", "")
        if not is_pdf_href(certificate_href):
            failures.append("COA certificate anchor href is not a PDF link")
        if certificate_anchor.text != CERTIFICATE_LINK_TEXT:
            failures.append(
                f"COA certificate anchor text must be {CERTIFICATE_LINK_TEXT!r}"
            )

    if len(pdf_links) != 1:
        failures.append(f"expected one COA PDF link, found {len(pdf_links)}")
    elif certificate_anchor and certificate_anchor.attributes.get("href") != pdf_links[0].attributes.get("href"):
        failures.append("COA certificate anchor href does not match the sole PDF link")

    return failures


def check_fixture(page: Path) -> list[str]:
    parser = parse_html_file(page)
    failures = check_page(page, EXPECTED_FIXTURE_SOURCE_ID)

    status_elements = elements_with_attribute(parser, STATUS_ATTRIBUTE)
    if status_elements and status_elements[0].attributes[STATUS_ATTRIBUTE] != EXPECTED_FIXTURE_STATUS:
        failures.append("fixture COA status does not match the expected result")

    published_at_elements = elements_with_attribute(parser, PUBLISHED_AT_ATTRIBUTE)
    if (
        published_at_elements
        and published_at_elements[0].attributes[PUBLISHED_AT_ATTRIBUTE]
        != EXPECTED_FIXTURE_PUBLISHED_AT
    ):
        failures.append("fixture COA publication timestamp does not match the expected value")

    readings = [
        (
            element.attributes.get(READING_LABEL_ATTRIBUTE, ""),
            element.attributes.get(READING_VALUE_ATTRIBUTE, ""),
            element.attributes.get(READING_UNIT_ATTRIBUTE, ""),
        )
        for element in elements_with_attribute(parser, READING_ATTRIBUTE)
    ]
    if readings != list(EXPECTED_FIXTURE_READINGS):
        failures.append("fixture COA headline readings do not match the expected register")

    panels: list[tuple[str, str, tuple[tuple[str, str, str, str, str], ...]]] = []
    for panel in elements_with_attribute(parser, PANEL_ATTRIBUTE):
        panel_name = panel.attributes.get(PANEL_NAME_ATTRIBUTE, "")
        panel_status = panel.attributes[PANEL_ATTRIBUTE]
        panel_metrics = tuple(
            (
                metric.attributes.get(METRIC_NAME_ATTRIBUTE, ""),
                metric.attributes.get(METRIC_VALUE_ATTRIBUTE, ""),
                metric.attributes.get(METRIC_UNIT_ATTRIBUTE, ""),
                metric.attributes[METRIC_ATTRIBUTE],
                metric.attributes.get(METRIC_STATUS_ATTRIBUTE, ""),
            )
            for metric in elements_with_attribute(parser, METRIC_ATTRIBUTE)
            if is_descendant_of(metric, panel)
        )
        panels.append((panel_name, panel_status, panel_metrics))
    if panels != list(EXPECTED_FIXTURE_PANELS):
        failures.append("fixture COA panels and metrics do not match the expected register")

    return failures


def pages_for_root(
    build_root: Path,
    fixture_mode: bool,
) -> list[tuple[Path, str | None]]:
    fixture_page = build_root / FIXTURE_PAGE_NAME
    if fixture_mode:
        if fixture_page.is_file():
            return [(fixture_page, EXPECTED_FIXTURE_SOURCE_ID)]
        return []
    pages = [
        (page, page.parent.name)
        for page in sorted((build_root / COA_ROUTE_DIRECTORY).glob(f"*/{COA_PAGE_NAME}"))
    ]
    return pages


def main() -> int:
    arguments = sys.argv[1:]
    explicit_fixture_mode = arguments[:1] == [FIXTURE_MODE_FLAG]
    if explicit_fixture_mode:
        arguments = arguments[1:]
    if len(arguments) > 1:
        print("usage: check-coa-build.py [--fixture] [build-root]", file=sys.stderr)
        return 2

    build_root = Path(arguments[0] if arguments else "dist")
    if not build_root.is_dir():
        print(f"check-coa-build: no such directory: {build_root}", file=sys.stderr)
        return 2

    fixture_mode = explicit_fixture_mode or build_root.resolve() == COMMITTED_FIXTURE_ROOT
    pages = pages_for_root(build_root, fixture_mode)
    if not pages:
        if fixture_mode:
            print(f"check-coa-build: no fixture page found under {build_root}", file=sys.stderr)
            return 2
        print("COA build contract OK: no generated COA pages to verify.")
        return 0

    failures: list[str] = []
    for page, expected_source_id in pages:
        page_failures = check_fixture(page) if fixture_mode else check_page(page, expected_source_id)
        relative_page = page.relative_to(build_root)
        failures.extend(f"{relative_page}: {failure}" for failure in page_failures)

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1

    print(f"COA build contract OK: {len(pages)} page(s) verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
