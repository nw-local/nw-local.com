#!/usr/bin/env python3
"""Verify the built public pesticide-disclosure pages.

The fixture mode keeps two representative disclosures (one with pesticide
applications, one with none applied) independent of Sanity so the checker can
prove it rejects a page whose "none applied" summary contradicts its
application blocks, or whose application data is not actually visible. Build
mode checks every generated /pesticides/<lot code>/ page and derives its route
identity from the emitted page rather than a fixed content count.

The public surface is vendor-neutral: it is keyed on the minted lot code
(NWL-XXXXX), never a POS vendor's identifier, so the checker also refuses any
disclosure page whose rendered body names the traceability vendor.
"""

from __future__ import annotations

from pathlib import Path
import re
import sys

from html_elements import Element, elements_with_attribute, parse_html_file


DISCLOSURE_ROUTE_DIRECTORY = "pesticides"
DISCLOSURE_PAGE_NAME = "index.html"
FIXTURE_PAGE_NAME = "pesticide-disclosure-page.html"
FIXTURE_MODE_FLAG = "--fixture"
LOT_CODE_ATTRIBUTE = "data-disclosure-lot-code"
STRAIN_ATTRIBUTE = "data-disclosure-strain"
GRADE_ATTRIBUTE = "data-disclosure-grade"
NONE_APPLIED_ATTRIBUTE = "data-disclosure-none-applied"
APPLICATION_ATTRIBUTE = "data-disclosure-application"
APPLICATION_PRODUCT_ATTRIBUTE = "data-disclosure-application-product"
APPLICATION_ACTIVE_INGREDIENT_ATTRIBUTE = "data-disclosure-application-active-ingredient"
APPLICATION_EPA_ATTRIBUTE = "data-disclosure-application-epa"
APPLICATION_APPLIED_ON_ATTRIBUTE = "data-disclosure-application-applied-on"
APPLICATION_TARGET_PEST_ATTRIBUTE = "data-disclosure-application-target-pest"
VALID_NONE_APPLIED_VALUES = { "true", "false" }
NONE_APPLIED_STATEMENT_SUBSTRING = "No pesticides were applied"
APPLIED_ON_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VENDOR_NAME = "Cultivera"
EXPECTED_FIXTURE_LOT_CODE = "NWL-4A7KP"
EXPECTED_FIXTURE_STRAIN = "Blue Dream"
EXPECTED_FIXTURE_GRADE = "Top Shelf"
EXPECTED_FIXTURE_APPLICATIONS = (
    ( "Regalia", "Reynoutria sachalinensis extract", "84059-3", "2026-07-14", "Powdery mildew" ),
    ( "Grandevo", "Chromobacterium subtsugae strain PRAA4-1", "84059-15", "2026-07-28", "Spider mites" ),
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


def application_tuple(application: Element) -> tuple[str, str, str, str, str]:
    return (
        application.attributes.get(APPLICATION_PRODUCT_ATTRIBUTE, ""),
        application.attributes.get(APPLICATION_ACTIVE_INGREDIENT_ATTRIBUTE, ""),
        application.attributes.get(APPLICATION_EPA_ATTRIBUTE, ""),
        application.attributes.get(APPLICATION_APPLIED_ON_ATTRIBUTE, ""),
        application.attributes.get(APPLICATION_TARGET_PEST_ATTRIBUTE, ""),
    )


def check_page(page: Path, expected_lot_code: str | None = None) -> list[str]:
    parser = parse_html_file(page)
    failures: list[str] = []

    landmark = expect_exactly_one(
        elements_with_attribute(parser, LOT_CODE_ATTRIBUTE),
        "pesticide disclosure landmark",
        failures,
    )
    if landmark:
        lot_code = landmark.attributes[LOT_CODE_ATTRIBUTE]
        if not lot_code:
            failures.append("pesticide disclosure lot code is empty")
        if expected_lot_code and lot_code != expected_lot_code:
            failures.append(
                f"pesticide disclosure lot code {lot_code!r} does not match "
                f"route {expected_lot_code!r}"
            )
        if not landmark.attributes.get(STRAIN_ATTRIBUTE):
            failures.append("pesticide disclosure strain is empty")
        # The public surface is vendor-neutral: the rendered disclosure body must
        # never name the traceability vendor. landmark.text is the article's full
        # descendant text, so this is scoped to the disclosure, not page chrome.
        if VENDOR_NAME.casefold() in landmark.text.casefold():
            failures.append(
                f"pesticide disclosure page names the traceability vendor {VENDOR_NAME!r}"
            )

    none_applied = expect_exactly_one(
        elements_with_attribute(parser, NONE_APPLIED_ATTRIBUTE),
        "pesticide disclosure none-applied summary",
        failures,
    )
    applications = elements_with_attribute(parser, APPLICATION_ATTRIBUTE)

    if none_applied:
        none_applied_value = none_applied.attributes[NONE_APPLIED_ATTRIBUTE]
        if none_applied_value not in VALID_NONE_APPLIED_VALUES:
            failures.append(f"pesticide disclosure none-applied value is invalid: {none_applied_value!r}")
        elif none_applied_value == "true":
            if applications:
                failures.append(
                    "pesticide disclosure declares no pesticides applied but found "
                    f"{len(applications)} application block(s)"
                )
            if NONE_APPLIED_STATEMENT_SUBSTRING not in none_applied.text:
                failures.append(
                    "pesticide disclosure none-applied summary does not state that no "
                    "pesticides were applied"
                )
        elif not applications:
            failures.append(
                "pesticide disclosure declares pesticides were applied but found zero "
                "application blocks"
            )

    for application in applications:
        fields = {
            "product": application.attributes.get(APPLICATION_PRODUCT_ATTRIBUTE, ""),
            "active ingredient": application.attributes.get(APPLICATION_ACTIVE_INGREDIENT_ATTRIBUTE, ""),
            "EPA registration number": application.attributes.get(APPLICATION_EPA_ATTRIBUTE, ""),
            "applied-on date": application.attributes.get(APPLICATION_APPLIED_ON_ATTRIBUTE, ""),
            "target pest": application.attributes.get(APPLICATION_TARGET_PEST_ATTRIBUTE, ""),
        }
        missing_fields = [field_name for field_name, field_value in fields.items() if not field_value]
        if missing_fields:
            failures.append(f"pesticide application is missing {', '.join(missing_fields)}")
            continue
        applied_on = fields["applied-on date"]
        if not APPLIED_ON_PATTERN.fullmatch(applied_on):
            failures.append(f"pesticide application date is not YYYY-MM-DD: {applied_on!r}")
        for field_name, field_value in fields.items():
            if field_value not in application.text:
                failures.append(f"pesticide application {field_name} is not visible: {field_value!r}")

    return failures


def check_fixture(page: Path) -> list[str]:
    parser = parse_html_file(page)
    none_applied_elements = elements_with_attribute(parser, NONE_APPLIED_ATTRIBUTE)
    none_applied_value = (
        none_applied_elements[0].attributes[NONE_APPLIED_ATTRIBUTE]
        if len(none_applied_elements) == 1
        else None
    )

    if none_applied_value != "false":
        return check_page(page)

    failures = check_page(page, EXPECTED_FIXTURE_LOT_CODE)

    landmark_elements = elements_with_attribute(parser, LOT_CODE_ATTRIBUTE)
    if landmark_elements:
        landmark = landmark_elements[0]
        if landmark.attributes.get(STRAIN_ATTRIBUTE, "") != EXPECTED_FIXTURE_STRAIN:
            failures.append("fixture pesticide disclosure strain does not match the expected value")
        if landmark.attributes.get(GRADE_ATTRIBUTE, "") != EXPECTED_FIXTURE_GRADE:
            failures.append("fixture pesticide disclosure grade does not match the expected value")

    applications = tuple(
        application_tuple(application)
        for application in elements_with_attribute(parser, APPLICATION_ATTRIBUTE)
    )
    if applications != EXPECTED_FIXTURE_APPLICATIONS:
        failures.append("fixture pesticide disclosure applications do not match the expected register")

    return failures


def pages_for_root(
    build_root: Path,
    fixture_mode: bool,
) -> list[tuple[Path, str | None]]:
    fixture_page = build_root / FIXTURE_PAGE_NAME
    if fixture_mode:
        if fixture_page.is_file():
            return [(fixture_page, None)]
        return []
    route_directory = build_root / DISCLOSURE_ROUTE_DIRECTORY
    pages = [
        (page, page.parent.name)
        for page in sorted(route_directory.glob(f"*/{DISCLOSURE_PAGE_NAME}"))
    ]
    return pages


def main() -> int:
    arguments = sys.argv[1:]
    explicit_fixture_mode = arguments[:1] == [FIXTURE_MODE_FLAG]
    if explicit_fixture_mode:
        arguments = arguments[1:]
    if len(arguments) > 1:
        print("usage: check-pesticide-disclosure-build.py [--fixture] [build-root]", file=sys.stderr)
        return 2

    build_root = Path(arguments[0] if arguments else "dist")
    if not build_root.is_dir():
        print(f"check-pesticide-disclosure-build: no such directory: {build_root}", file=sys.stderr)
        return 2

    fixture_mode = explicit_fixture_mode or build_root.resolve() == COMMITTED_FIXTURE_ROOT
    pages = pages_for_root(build_root, fixture_mode)
    if not pages:
        if fixture_mode:
            print(f"check-pesticide-disclosure-build: no fixture page found under {build_root}", file=sys.stderr)
            return 2
        print("Pesticide disclosure build contract OK: no generated disclosure pages to verify.")
        return 0

    failures: list[str] = []
    for page, expected_lot_code in pages:
        page_failures = check_fixture(page) if fixture_mode else check_page(page, expected_lot_code)
        relative_page = page.relative_to(build_root)
        failures.extend(f"{relative_page}: {failure}" for failure in page_failures)

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1

    print(f"Pesticide disclosure build contract OK: {len(pages)} page(s) verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
