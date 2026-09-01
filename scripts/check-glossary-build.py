#!/usr/bin/env python3
"""Verify the glossary's built HTML keeps its reference-library contracts.

Glossary content is published directly from Sanity, bypassing pull-request CI.
The data-layer checks catch malformed source documents, but cannot prove the
templates shipped their search controls, reference metadata, or detail-page
boundaries. This checker reads the built pages so a bad content publish fails
before it replaces the live site.

Usage: check-glossary-build.py [dist-dir]
"""
import collections
import json
import pathlib
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Iterable


DIST = pathlib.Path( sys.argv[ 1 ] if len( sys.argv ) > 1 else "dist" )
INDEX_PAGE = pathlib.Path( "glossary/index.html" )
EC_PAGE = pathlib.Path( "glossary/ec/index.html" )
EXPECTED_LETTER_VALUES = frozenset( [ "", *"abcdefghijklmnopqrstuvwxyz" ] )
EXPECTED_CATEGORY_LABELS = {
    "plant-biology": "Plant Biology",
    "cultivation": "Cultivation",
    "environment": "Environment",
    "nutrition": "Nutrition",
    "chemistry": "Chemistry",
    "post-harvest": "Post-Harvest",
    "business-regulation": "Business & Regulation",
}
EXPECTED_CATEGORY_VALUES = frozenset( [ "", *EXPECTED_CATEGORY_LABELS ] )
# These hooks mirror the selectors consumed by src/lib/glossary-browser.ts.
GLOSSARY_DIRECTORY_ENTRY_HOOK = "data-glossary-entry"
GLOSSARY_QUERY_HOOK = "data-glossary-query"
VOID_TAGS = { "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr" }


@dataclass
class Element:
    """A deliberately small HTML tree for the selectors this check needs."""

    name: str
    attributes: dict[str, str | None]
    children: list[ "Element | str" ] = field( default_factory=list )
    parent: "Element | None" = None

    def attribute( self, name: str ) -> str | None:
        return self.attributes.get( name )

    def has_attribute( self, name: str ) -> bool:
        return name in self.attributes

    def has_class( self, class_name: str ) -> bool:
        return class_name in ( self.attribute( "class" ) or "" ).split()

    def text( self ) -> str:
        return "".join(
            child if isinstance( child, str ) else child.text()
            for child in self.children
        )


@dataclass(frozen=True)
class DirectoryRecord:
    href: str
    identity: str
    term: str
    definition: str
    category: str
    category_label: str


class PageParser( HTMLParser ):
    def __init__( self ) -> None:
        super().__init__( convert_charrefs=True )
        self.elements: list[ Element ] = []
        self.stack: list[ Element ] = []

    def handle_starttag( self, tag: str, attributes: list[ tuple[str, str | None] ] ) -> None:
        element = Element( tag.lower(), dict( attributes ), parent=self.stack[ -1 ] if self.stack else None )
        self.elements.append( element )
        if self.stack:
            self.stack[ -1 ].children.append( element )
        if element.name not in VOID_TAGS:
            self.stack.append( element )

    def handle_startendtag( self, tag: str, attributes: list[ tuple[str, str | None] ] ) -> None:
        self.handle_starttag( tag, attributes )

    def handle_endtag( self, tag: str ) -> None:
        normalized_tag = tag.lower()
        for stack_index in range( len( self.stack ) - 1, -1, -1 ):
            if self.stack[ stack_index ].name == normalized_tag:
                del self.stack[ stack_index: ]
                return

    def handle_data( self, data: str ) -> None:
        if self.stack:
            self.stack[ -1 ].children.append( data )


def normalized_text( element: Element ) -> str:
    return " ".join( element.text().split() )


def normalized_search_text( value: str ) -> str:
    decomposed = unicodedata.normalize( "NFKD", value )
    without_marks = "".join(
        character
        for character in decomposed
        if not unicodedata.category( character ).startswith( "M" )
    )
    punctuation_as_spaces = "".join(
        " " if unicodedata.category( character ).startswith( ( "P", "S" ) ) else character
        for character in without_marks.lower()
    )
    return " ".join( punctuation_as_spaces.split() )


def descendants( element: Element ) -> Iterable[ Element ]:
    for child in element.children:
        if isinstance( child, Element ):
            yield child
            yield from descendants( child )


def ancestor_with_class( element: Element, class_name: str ) -> Element | None:
    candidate = element
    while candidate:
        if candidate.has_class( class_name ):
            return candidate
        candidate = candidate.parent
    return None


def ancestor_with_attribute( element: Element, attribute_name: str ) -> Element | None:
    candidate = element
    while candidate:
        if candidate.has_attribute( attribute_name ):
            return candidate
        candidate = candidate.parent
    return None


def page_elements( page: pathlib.Path ) -> list[ Element ]:
    parser = PageParser()
    parser.feed( page.read_text( encoding="utf-8", errors="replace" ) )
    parser.close()
    return parser.elements


def elements_with_class( elements: Iterable[ Element ], class_name: str ) -> list[ Element ]:
    return [ element for element in elements if element.has_class( class_name ) ]


def filter_values( elements: Iterable[ Element ], marker: str ) -> list[ str | None ]:
    return [
        element.attribute( "data-filter-value" )
        for element in elements
        if element.name == "button" and element.has_attribute( marker )
    ]


def require( failures: list[str], where: pathlib.Path, condition: bool, message: str ) -> None:
    if not condition:
        failures.append( f"{where}: {message}" )


def glossary_search_inputs( elements: list[ Element ] ) -> list[ Element ]:
    return [
        element
        for element in elements
        if element.name == "input"
        and element.attribute( "id" ) == "glossary-query"
        and element.attribute( "type" ) == "search"
    ]


def has_labeled_search_input( elements: list[ Element ] ) -> bool:
    labels = [
        element
        for element in elements
        if element.name == "label"
        and element.attribute( "for" ) == "glossary-query"
        and normalized_text( element ) == "Search terms and definitions"
    ]
    inputs = glossary_search_inputs( elements )
    return len( labels ) == 1 and len( inputs ) == 1


def has_json_ld_type( elements: list[ Element ], expected_type: str, failures: list[str], where: pathlib.Path ) -> bool:
    records: list[ object ] = []
    scripts = [
        element
        for element in elements
        if element.name == "script" and element.attribute( "type" ) == "application/ld+json"
    ]
    for script_index, script in enumerate( scripts, start=1 ):
        try:
            records.append( json.loads( script.text() ) )
        except json.JSONDecodeError as error:
            failures.append( f"{where}: JSON-LD script {script_index} is invalid: {error.msg}" )

    return any(
        isinstance( record, dict ) and record.get( "@type" ) == expected_type
        for record in records
    )


def entry_glossary_links( entry: Element ) -> list[Element]:
    return [
        link
        for link in descendants( entry )
        if link.name == "a"
        and ( link.attribute( "href" ) or "" ).startswith( "/glossary/" )
    ]


def check_directory_entry(
    entry: Element,
    failures: list[str],
) -> DirectoryRecord | None:
    glossary_links = entry_glossary_links( entry )
    require(
        failures,
        INDEX_PAGE,
        len( glossary_links ) == 1,
        "directory entry must have exactly one glossary link",
    )
    if len( glossary_links ) != 1:
        return None

    glossary_link = ( glossary_links[ 0 ].attribute( "href" ) or "" ).strip()
    visible_term = normalized_text( glossary_links[ 0 ] )
    require(
        failures,
        INDEX_PAGE,
        entry.has_attribute( GLOSSARY_DIRECTORY_ENTRY_HOOK ),
        f"{glossary_link}: directory entry is missing the {GLOSSARY_DIRECTORY_ENTRY_HOOK} controller hook",
    )
    entry_id = ( entry.attribute( "data-glossary-id" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        bool( entry_id ),
        f"{glossary_link}: directory entry has no glossary identity",
    )

    metadata_term = ( entry.attribute( "data-glossary-term" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        bool( metadata_term ),
        f"{glossary_link}: directory entry has no data-glossary-term",
    )
    if metadata_term:
        require(
            failures,
            INDEX_PAGE,
            metadata_term == visible_term,
            f"{glossary_link}: data-glossary-term does not match the visible term",
        )

    expected_initial = normalized_search_text( visible_term )[ :1 ]
    metadata_initial = ( entry.attribute( "data-glossary-initial" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        bool( metadata_initial ),
        f"{glossary_link}: directory entry has no data-glossary-initial",
    )
    if metadata_initial:
        require(
            failures,
            INDEX_PAGE,
            metadata_initial == expected_initial,
            f'{glossary_link}: data-glossary-initial "{metadata_initial}" does not match "{expected_initial}"',
        )

    definitions = elements_with_class( descendants( entry ), "glossary-index-definition" )
    visible_definition = normalized_text( definitions[ 0 ] ) if len( definitions ) == 1 else ""
    require(
        failures,
        INDEX_PAGE,
        len( definitions ) == 1 and bool( visible_definition ),
        f"{glossary_link}: directory entry has no visible definition",
    )

    category = ( entry.attribute( "data-glossary-category" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        category in EXPECTED_CATEGORY_LABELS,
        f'{glossary_link}: data-glossary-category has unknown value "{category}"',
    )
    expected_category_label = EXPECTED_CATEGORY_LABELS.get( category, "" )
    category_elements = elements_with_class( descendants( entry ), "glossary-index-category" )
    visible_category = normalized_text( category_elements[ 0 ] ) if len( category_elements ) == 1 else ""
    require(
        failures,
        INDEX_PAGE,
        len( category_elements ) == 1 and bool( visible_category ),
        f"{glossary_link}: directory entry has no visible category",
    )
    if expected_category_label and visible_category:
        require(
            failures,
            INDEX_PAGE,
            visible_category == expected_category_label,
            f'{glossary_link}: visible category "{visible_category}" does not match "{expected_category_label}"',
        )

    search_text = ( entry.attribute( "data-glossary-search-text" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        bool( search_text ),
        f"{glossary_link}: directory entry has no data-glossary-search-text",
    )
    if search_text:
        require(
            failures,
            INDEX_PAGE,
            search_text == normalized_search_text( search_text ),
            f"{glossary_link}: data-glossary-search-text is not normalized",
        )
        searchable_fields = (
            ( "visible term", normalized_search_text( visible_term ) ),
            ( "visible definition", normalized_search_text( visible_definition ) ),
            ( "visible category", normalized_search_text( expected_category_label ) ),
        )
        for field_label, normalized_field in searchable_fields:
            if normalized_field:
                require(
                    failures,
                    INDEX_PAGE,
                    normalized_field in search_text,
                    f"{glossary_link}: data-glossary-search-text does not include the {field_label}",
                )

    require(
        failures,
        INDEX_PAGE,
        not entry.has_attribute( "hidden" ),
        f"{glossary_link}: directory entry is hidden before enhancement",
    )

    return DirectoryRecord(
        href=glossary_link,
        identity=entry_id,
        term=visible_term,
        definition=visible_definition,
        category=category,
        category_label=expected_category_label,
    )


def check_category_filter_markers( elements: list[Element], failures: list[str] ) -> None:
    for marked_element in (
        element
        for element in elements
        if element.has_attribute( "data-glossary-category-filter" )
    ):
        if (
            marked_element.name == "button"
            and ancestor_with_attribute( marked_element, "data-glossary-controls" )
        ):
            continue

        directory_entry = ancestor_with_class( marked_element, "glossary-index-entry" )
        glossary_links = entry_glossary_links( directory_entry ) if directory_entry else []
        context = (
            ( glossary_links[ 0 ].attribute( "href" ) or "directory entry" )
            if len( glossary_links ) == 1
            else "category filter"
        )
        failures.append(
            f"{INDEX_PAGE}: {context}: data-glossary-category-filter belongs only on filter buttons inside the control band"
        )


def check_index(
    elements: list[ Element ],
    detail_pages: dict[str, pathlib.Path],
    failures: list[str],
) -> None:
    require(
        failures,
        INDEX_PAGE,
        any(
            normalized_text( element )
            == "Clear definitions for cannabis cultivation, plant science, and production."
            for element in elements
            if element.name == "p"
        ),
        "glossary index is missing its plain-language introduction",
    )
    search_roots = elements_with_class( elements, "glossary-search" )
    if len( search_roots ) == 1:
        search_sections = [
            element
            for element in descendants( search_roots[ 0 ] )
            if element.name == "section"
        ]
        require(
            failures,
            INDEX_PAGE,
            len( search_sections ) == 1
            and search_sections[ 0 ].has_class( "glossary-directory-section" ),
            "glossary search must contain only the directory section",
        )
    require(
        failures,
        INDEX_PAGE,
        has_labeled_search_input( elements ),
        "missing the labeled glossary search input",
    )
    search_inputs = glossary_search_inputs( elements )
    if len( search_inputs ) == 1:
        require(
            failures,
            INDEX_PAGE,
            search_inputs[ 0 ].has_attribute( GLOSSARY_QUERY_HOOK ),
            f"search input is missing the {GLOSSARY_QUERY_HOOK} controller hook",
        )
    controls = [
        element
        for element in elements
        if element.has_attribute( "data-glossary-controls" )
    ]
    require(
        failures,
        INDEX_PAGE,
        len( controls ) == 1 and controls[ 0 ].has_attribute( "hidden" ),
        "search controls must remain hidden until enhancement succeeds",
    )
    letter_values = filter_values( elements, "data-glossary-letter" )
    require(
        failures,
        INDEX_PAGE,
        len( letter_values ) == len( EXPECTED_LETTER_VALUES )
        and frozenset( letter_values ) == EXPECTED_LETTER_VALUES,
        "expected exactly the A-Z filter values",
    )
    category_values = filter_values( elements, "data-glossary-category-filter" )
    require(
        failures,
        INDEX_PAGE,
        len( category_values ) == len( EXPECTED_CATEGORY_VALUES )
        and frozenset( category_values ) == EXPECTED_CATEGORY_VALUES,
        "expected exactly the category filter values",
    )
    check_category_filter_markers( elements, failures )
    require(
        failures,
        INDEX_PAGE,
        any(
            element.has_attribute( "data-glossary-result-count" )
            and element.attribute( "aria-live" ) == "polite"
            for element in elements
        ),
        "missing the live glossary result count",
    )

    directory_entries = elements_with_class( elements, "glossary-index-entry" )
    require(
        failures,
        INDEX_PAGE,
        len( directory_entries ) == len( detail_pages ),
        f"directory has {len( directory_entries )} entries but the build has {len( detail_pages )} detail pages",
    )

    records = [
        record
        for entry in directory_entries
        if ( record := check_directory_entry( entry, failures ) ) is not None
    ]
    directory_ids = [ record.identity for record in records if record.identity ]
    directory_links = [ record.href for record in records ]
    duplicate_ids = sorted(
        identity
        for identity, count in collections.Counter( directory_ids ).items()
        if count > 1
    )
    require(
        failures,
        INDEX_PAGE,
        not duplicate_ids,
        f"directory identities must be distinct: {', '.join( duplicate_ids )}",
    )
    duplicate_links = sorted(
        link
        for link, count in collections.Counter( directory_links ).items()
        if count > 1
    )
    require(
        failures,
        INDEX_PAGE,
        not duplicate_links,
        f"directory links must be distinct: {', '.join( duplicate_links )}",
    )

    if len( records ) == len( directory_entries ) and not duplicate_links:
        directory_link_set = set( directory_links )
        detail_link_set = set( detail_pages )
        missing_links = sorted( detail_link_set - directory_link_set )
        extra_links = sorted( directory_link_set - detail_link_set )
        require(
            failures,
            INDEX_PAGE,
            not missing_links,
            f"directory omits built glossary pages: {', '.join( missing_links )}",
        )
        require(
            failures,
            INDEX_PAGE,
            not extra_links,
            f"directory links do not resolve to built glossary pages: {', '.join( extra_links )}",
        )



def check_detail_entry(
    page: pathlib.Path,
    elements: list[Element],
    failures: list[str],
) -> None:
    require(
        failures,
        page,
        len( elements_with_class( elements, "glossary-reference" ) ) == 1,
        "missing the glossary reference article",
    )
    require(
        failures,
        page,
        has_json_ld_type( elements, "DefinedTerm", failures, page ),
        "missing DefinedTerm JSON-LD",
    )
    require(
        failures,
        page,
        has_json_ld_type( elements, "BreadcrumbList", failures, page ),
        "missing BreadcrumbList JSON-LD",
    )
    entry_headers = elements_with_class( elements, "glossary-entry-hero" )
    if len( entry_headers ) == 1:
        require(
            failures,
            page,
            not any( element.name == "figure" for element in descendants( entry_headers[ 0 ] ) ),
            "glossary entry header must not contain an editorial figure",
        )

    reference_roots = elements_with_class( elements, "glossary-reference" )
    if len( reference_roots ) == 1:
        reference_elements = list( descendants( reference_roots[ 0 ] ) )
        reading_time_elements = [
            element
            for element in reference_elements
            if element.name in { "p", "span", "time" }
            and not ancestor_with_class( element, "portable-text" )
            and re.search( r"\b\d+\s+min(?:ute)?s?\s+read\b", normalized_text( element ), re.IGNORECASE )
        ]
        require(
            failures,
            page,
            not reading_time_elements,
            "glossary entries must not render reading-time copy",
        )
        require(
            failures,
            page,
            not any( element.name == "aside" for element in reference_elements ),
            "glossary entries must not render aside navigation",
        )
        require(
            failures,
            page,
            not any(
                element.name == "nav" and not element.has_class( "glossary-breadcrumb" )
                for element in reference_elements
            ),
            "glossary entries must not render article navigation",
        )

    body_containers = elements_with_class( elements, "portable-text" )
    require(
        failures,
        page,
        len( body_containers ) <= 1,
        "entry must render at most one expanded explanation",
    )


def check_ec( elements: list[ Element ], failures: list[str] ) -> None:
    body_containers = elements_with_class( elements, "portable-text" )
    require( failures, EC_PAGE, len( body_containers ) == 1, "missing the EC expanded explanation" )
    if len( body_containers ) == 1:
        article_headings = [
            element
            for element in descendants( body_containers[ 0 ] )
            if element.name in { "h2", "h3", "h4" }
        ]
        require(
            failures,
            EC_PAGE,
            not article_headings,
            "EC explanation must remain glossary-scale rather than article-structured",
        )
    related_lists = elements_with_class( elements, "glossary-related-terms" )
    require(
        failures,
        EC_PAGE,
        len( related_lists ) == 1
        and any( element.name == "a" for element in descendants( related_lists[ 0 ] ) ),
        "missing related terms",
    )
    mentions = elements_with_class( elements, "glossary-mentions" )
    require(
        failures,
        EC_PAGE,
        len( mentions ) == 1
        and any( element.name == "a" for element in descendants( mentions[ 0 ] ) ),
        "missing Mentioned in links",
    )
    require(
        failures,
        EC_PAGE,
        any( normalized_text( element ) == "Mentioned in" for element in elements if element.name == "h2" ),
        "missing the Mentioned in heading",
    )


def built_detail_pages() -> dict[str, pathlib.Path]:
    detail_pages: dict[str, pathlib.Path] = {}
    for page in sorted( ( DIST / "glossary" ).rglob( "index.html" ) ):
        relative_page = page.relative_to( DIST )
        if relative_page == INDEX_PAGE:
            continue
        href = f"/{relative_page.parent.as_posix()}"
        detail_pages[ href ] = relative_page
    return detail_pages


def main() -> int:
    if not DIST.is_dir():
        print( f"check-glossary-build: no such directory: {DIST}", file=sys.stderr )
        print( "Run `make build` first.", file=sys.stderr )
        return 2

    failures: list[str] = []
    detail_pages = built_detail_pages()

    if not ( DIST / INDEX_PAGE ).is_file():
        failures.append( f"{INDEX_PAGE}: missing target page" )
    else:
        check_index( page_elements( DIST / INDEX_PAGE ), detail_pages, failures )

    for detail_page in detail_pages.values():
        check_detail_entry( detail_page, page_elements( DIST / detail_page ), failures )

    if not ( DIST / EC_PAGE ).is_file():
        failures.append( f"{EC_PAGE}: missing target page" )
    else:
        check_ec( page_elements( DIST / EC_PAGE ), failures )

    if failures:
        for failure in failures:
            print( failure, file=sys.stderr )
        print(
            "\nGlossary build contracts failed. Fix the rendered page or its Sanity content before deploying.",
            file=sys.stderr,
        )
        return 1

    print( "check-glossary-build: glossary index and entry contracts hold." )
    return 0


sys.exit( main() )
