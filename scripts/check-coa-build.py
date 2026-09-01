#!/usr/bin/env python3
"""Verify the built public certificate-of-analysis pages.

The fixture mode keeps one representative certificate independent of Sanity so
the checker can prove it rejects a page that loses the signed-PDF link. Build
mode checks every generated /coas/<UUID>/ page and derives its route identity
from the emitted page rather than a fixed content count.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import re
import sys


COA_ROUTE_DIRECTORY = "coas"
FIXTURE_PAGE_NAME = "coa-page.html"
COA_PAGE_NAME = "index.html"
SOURCE_ID_ATTRIBUTE = "data-coa-source-id"
STATUS_ATTRIBUTE = "data-coa-status"
SUMMARY_ATTRIBUTE = "data-coa-summary"
READING_ATTRIBUTE = "data-coa-reading"
READING_LABEL_ATTRIBUTE = "data-coa-reading-label"
READING_VALUE_ATTRIBUTE = "data-coa-reading-value"
READING_UNIT_ATTRIBUTE = "data-coa-reading-unit"
PANEL_ATTRIBUTE = "data-coa-panel"
PANEL_NAME_ATTRIBUTE = "data-coa-panel-name"
METRIC_ATTRIBUTE = "data-coa-metric"
METRIC_NAME_ATTRIBUTE = "data-coa-metric-name"
METRIC_VALUE_ATTRIBUTE = "data-coa-metric-value"
METRIC_UNIT_ATTRIBUTE = "data-coa-metric-unit"
CERTIFICATE_ATTRIBUTE = "data-coa-certificate"
VALID_STATUSES = { "pass", "fail" }
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
DECIMAL_PATTERN = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$")
EXPECTED_FIXTURE_SOURCE_ID = "00000000-0000-4000-8000-000000000001"
EXPECTED_FIXTURE_STATUS = "pass"
EXPECTED_FIXTURE_READINGS = (
    ( "Total THC (calculated)", "29.39", "%" ),
    ( "Water activity", "0", "aw" ),
)
EXPECTED_FIXTURE_PANELS = (
    ( "Cannabinoids", "pass", ( ( "D9-THC", "0.12", "%", "pass" ), ) ),
    ( "Microbial", "pass", ( ( "Total yeast and mold", "0", "CFU/g", "pass" ), ) ),
)


@dataclass
class Element:
    name: str
    attributes: dict[str, str]
    parent: Element | None = None
    text_parts: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join("".join(self.text_parts).split())


class CoaPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.elements: list[Element] = []
        self.stack: list[Element] = []
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = { key: value or "" for key, value in attrs }
        element = Element(tag, attributes, self.stack[-1] if self.stack else None)
        self.elements.append(element)
        self.stack.append(element)
        if tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"])

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for stack_index in range(len(self.stack) - 1, -1, -1):
            if self.stack[stack_index].name == tag:
                del self.stack[stack_index:]
                return

    def handle_data(self, data: str) -> None:
        for element in self.stack:
            element.text_parts.append(data)


def elements_with_attribute(parser: CoaPageParser, attribute: str) -> list[Element]:
    return [element for element in parser.elements if attribute in element.attributes]


def is_descendant_of(element: Element, ancestor: Element) -> bool:
    parent = element.parent
    while parent:
        if parent is ancestor:
            return True
        parent = parent.parent
    return False


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


def check_page(page: Path, expected_source_id: str | None = None) -> list[str]:
    parser = CoaPageParser()
    parser.feed(page.read_text(encoding="utf-8"))
    parser.close()
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
        if not metric_name or not value or not unit:
            failures.append("COA metric is missing name, value, or unit metadata")
            continue
        if not is_canonical_decimal(value):
            failures.append(f"COA metric has a non-canonical value: {value!r}")
        if metric_status not in VALID_STATUSES:
            failures.append(f"COA metric status is invalid: {metric_status!r}")
        for field_name, field_value in (
            ( "name", metric_name ),
            ( "value", value ),
            ( "unit", unit ),
        ):
            if field_value not in metric.text:
                failures.append(f"COA metric {field_name} is not visible: {field_value!r}")

    certificate_links = [
        link
        for link in parser.links
        if link.lower().split("?", maxsplit=1)[0].endswith(".pdf")
    ]
    if len(certificate_links) != 1:
        failures.append(f"expected one COA PDF link, found {len(certificate_links)}")
    else:
        certificate_elements = elements_with_attribute(parser, CERTIFICATE_ATTRIBUTE)
        if len(certificate_elements) != 1:
            failures.append(f"expected one marked COA certificate link, found {len(certificate_elements)}")

    return failures


def check_fixture(page: Path) -> list[str]:
    parser = CoaPageParser()
    parser.feed(page.read_text(encoding="utf-8"))
    parser.close()
    failures = check_page(page, EXPECTED_FIXTURE_SOURCE_ID)

    status_elements = elements_with_attribute(parser, STATUS_ATTRIBUTE)
    if status_elements and status_elements[0].attributes[STATUS_ATTRIBUTE] != EXPECTED_FIXTURE_STATUS:
        failures.append("fixture COA status does not match the expected result")

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

    panels: list[tuple[str, str, tuple[tuple[str, str, str, str], ...]]] = []
    for panel in elements_with_attribute(parser, PANEL_ATTRIBUTE):
        panel_name = panel.attributes.get(PANEL_NAME_ATTRIBUTE, "")
        panel_status = panel.attributes[PANEL_ATTRIBUTE]
        panel_metrics = tuple(
            (
                metric.attributes.get(METRIC_NAME_ATTRIBUTE, ""),
                metric.attributes.get(METRIC_VALUE_ATTRIBUTE, ""),
                metric.attributes.get(METRIC_UNIT_ATTRIBUTE, ""),
                metric.attributes[METRIC_ATTRIBUTE],
            )
            for metric in elements_with_attribute(parser, METRIC_ATTRIBUTE)
            if is_descendant_of(metric, panel)
        )
        panels.append((panel_name, panel_status, panel_metrics))
    if panels != list(EXPECTED_FIXTURE_PANELS):
        failures.append("fixture COA panels and metrics do not match the expected register")

    return failures


def pages_for_root(build_root: Path) -> tuple[bool, list[tuple[Path, str | None]]]:
    fixture_page = build_root / FIXTURE_PAGE_NAME
    if fixture_page.is_file():
        return True, [(fixture_page, EXPECTED_FIXTURE_SOURCE_ID)]
    pages = [
        (page, page.parent.name)
        for page in sorted((build_root / COA_ROUTE_DIRECTORY).glob(f"*/{COA_PAGE_NAME}"))
    ]
    return False, pages


def main() -> int:
    build_root = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    if not build_root.is_dir():
        print(f"check-coa-build: no such directory: {build_root}", file=sys.stderr)
        return 2

    fixture_mode, pages = pages_for_root(build_root)
    if not pages:
        print(f"check-coa-build: no COA pages found under {build_root}", file=sys.stderr)
        return 2

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
