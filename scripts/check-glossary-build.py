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
import urllib.parse
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


def image_urls( image: Element ) -> list[str]:
    urls: list[str] = []
    source = ( image.attribute( "src" ) or "" ).strip()
    if source:
        urls.append( source )

    source_set = image.attribute( "srcset" ) or ""
    # Sanity's `rect=x,y,w,h` query value contains commas. Srcset candidates
    # are separated by a comma followed by whitespace, while those coordinate
    # commas are not, so splitting on every comma corrupts valid image URLs.
    for candidate in re.split( r",\s+", source_set ):
        candidate_url = candidate.strip().split( " ", maxsplit=1 )[ 0 ]
        if candidate_url:
            urls.append( candidate_url )
    return urls


def image_uses_hotspot_crop( url: str ) -> bool:
    query = urllib.parse.parse_qs( urllib.parse.urlsplit( url ).query )
    return bool( query.get( "rect" ) )


def image_asset_identity( url: str ) -> str:
    parsed_url = urllib.parse.urlsplit( url )
    return f"{parsed_url.netloc}{parsed_url.path}"


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


def check_featured_card(
    card: Element,
    directory_records: dict[str, DirectoryRecord],
    detail_pages: dict[str, pathlib.Path],
    failures: list[str],
) -> None:
    card_href = ( card.attribute( "href" ) or "" ).strip()
    record = directory_records.get( card_href )
    require(
        failures,
        INDEX_PAGE,
        record is not None,
        f"{card_href or 'featured card without an href'}: featured card has no matching directory entry",
    )
    if record is None:
        return

    term_elements = [ element for element in descendants( card ) if element.name == "h3" ]
    featured_term = normalized_text( term_elements[ 0 ] ) if len( term_elements ) == 1 else ""
    require(
        failures,
        INDEX_PAGE,
        featured_term == record.term,
        f"{card_href}: featured-card term does not match its directory entry",
    )

    category_elements = elements_with_class( descendants( card ), "glossary-category-label" )
    featured_category = normalized_text( category_elements[ 0 ] ) if len( category_elements ) == 1 else ""
    require(
        failures,
        INDEX_PAGE,
        featured_category == record.category_label,
        f"{card_href}: featured-card category does not match its directory entry",
    )

    card_bodies = elements_with_class( descendants( card ), "glossary-featured-body" )
    definition_elements = [
        element
        for card_body in card_bodies
        for element in descendants( card_body )
        if element.name == "p" and not element.has_class( "glossary-category-label" )
    ]
    featured_definition = normalized_text( definition_elements[ 0 ] ) if len( definition_elements ) == 1 else ""
    require(
        failures,
        INDEX_PAGE,
        featured_definition == record.definition,
        f"{card_href}: featured-card definition does not match its directory entry",
    )

    nested_links = [ element for element in descendants( card ) if element.name == "a" ]
    require(
        failures,
        INDEX_PAGE,
        not nested_links,
        f"{card_href}: featured card contains a nested link",
    )

    images = [ element for element in descendants( card ) if element.name == "img" ]
    require(
        failures,
        INDEX_PAGE,
        len( images ) == 1,
        f"{card_href}: featured card must have exactly one image",
    )
    if len( images ) != 1:
        return

    card_image = images[ 0 ]
    card_alt = ( card_image.attribute( "alt" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        bool( card_alt ),
        f"{card_href}: featured-card image has an empty alt attribute",
    )
    card_source = ( card_image.attribute( "src" ) or "" ).strip()
    require(
        failures,
        INDEX_PAGE,
        image_uses_hotspot_crop( card_source ),
        f"{card_href}: featured-card image src is not hotspot-aware",
    )
    source_set_urls = image_urls( card_image )[ 1: ]
    require(
        failures,
        INDEX_PAGE,
        bool( source_set_urls ) and all( image_uses_hotspot_crop( url ) for url in source_set_urls ),
        f"{card_href}: featured-card image srcset is not hotspot-aware",
    )

    detail_page = detail_pages.get( card_href )
    require(
        failures,
        INDEX_PAGE,
        detail_page is not None,
        f"{card_href}: featured card has no built detail page",
    )
    if detail_page is None:
        return

    detail_elements = page_elements( DIST / detail_page )
    detail_images = [
        image
        for specimen in elements_with_class( detail_elements, "glossary-specimen" )
        for image in descendants( specimen )
        if image.name == "img"
    ]
    require(
        failures,
        INDEX_PAGE,
        len( detail_images ) == 1,
        f"{card_href}: featured detail page must have exactly one specimen image",
    )
    if len( detail_images ) == 1:
        detail_image = detail_images[ 0 ]
        detail_source = ( detail_image.attribute( "src" ) or "" ).strip()
        require(
            failures,
            INDEX_PAGE,
            ( detail_image.attribute( "alt" ) or "" ).strip() == card_alt,
            f"{card_href}: featured card and detail image alt text differ",
        )
        require(
            failures,
            INDEX_PAGE,
            image_asset_identity( detail_source ) == image_asset_identity( card_source ),
            f"{card_href}: featured card and detail page use different image assets",
        )


def check_index(
    elements: list[ Element ],
    detail_pages: dict[str, pathlib.Path],
    failures: list[str],
) -> None:
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

    directory_records = { record.href: record for record in records }
    featured_cards = elements_with_class( elements, "glossary-featured-card" )
    require(
        failures,
        INDEX_PAGE,
        any( card.name == "a" and card.attribute( "href" ) == "/glossary/ec" for card in featured_cards ),
        "missing the featured EC card",
    )
    for card in featured_cards:
        check_featured_card( card, directory_records, detail_pages, failures )


def has_reading_time( elements: Iterable[Element] ) -> bool:
    return any(
        re.search( r"\b\d+ min read\b", normalized_text( element ) )
        for element in elements
        if element.name == "p"
    )


def check_contents_targets(
    page: pathlib.Path,
    elements: list[Element],
    contents: Element,
    expected_targets: set[str],
    failures: list[str],
) -> None:
    contents_links = [
        link
        for link in descendants( contents )
        if link.name == "a" and ( link.attribute( "href" ) or "" ).startswith( "#" )
    ]
    link_targets = {
        ( link.attribute( "href" ) or "" )[ 1: ]
        for link in contents_links
    }
    require(
        failures,
        page,
        link_targets == expected_targets,
        "table-of-contents links do not match the rendered article headings",
    )
    for target in link_targets:
        target_count = sum( element.attribute( "id" ) == target for element in elements )
        require(
            failures,
            page,
            target_count == 1,
            f"table-of-contents target #{target} exists {target_count} times",
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

    for specimen in elements_with_class( elements, "glossary-specimen" ):
        specimen_images = [
            element
            for element in descendants( specimen )
            if element.name == "img"
        ]
        require(
            failures,
            page,
            len( specimen_images ) == 1,
            "glossary specimen must contain exactly one image",
        )
        if len( specimen_images ) != 1:
            continue

        specimen_image = specimen_images[ 0 ]
        require(
            failures,
            page,
            bool( ( specimen_image.attribute( "alt" ) or "" ).strip() ),
            "glossary specimen image has an empty alt attribute",
        )
        specimen_source = ( specimen_image.attribute( "src" ) or "" ).strip()
        require(
            failures,
            page,
            image_uses_hotspot_crop( specimen_source ),
            "glossary specimen image src is not hotspot-aware",
        )
        source_set_urls = image_urls( specimen_image )[ 1: ]
        require(
            failures,
            page,
            bool( source_set_urls ) and all( image_uses_hotspot_crop( url ) for url in source_set_urls ),
            "glossary specimen image srcset is not hotspot-aware",
        )

    body_containers = elements_with_class( elements, "portable-text" )
    contents = elements_with_class( elements, "glossary-entry-contents" )
    reading_time = has_reading_time( elements )
    if not body_containers:
        require(
            failures,
            page,
            not reading_time,
            "entry without a body unexpectedly has a reading-time label",
        )
        require(
            failures,
            page,
            not contents,
            "entry without a body unexpectedly has contents navigation",
        )
        return

    require(
        failures,
        page,
        len( body_containers ) == 1,
        "entry must render exactly one Portable Text body",
    )
    require(
        failures,
        page,
        reading_time,
        "entry with a body is missing its reading-time label",
    )
    article_heading_ids = {
        ( heading.attribute( "id" ) or "" ).strip()
        for body_container in body_containers
        for heading in descendants( body_container )
        if heading.name in { "h2", "h3" } and ( heading.attribute( "id" ) or "" ).strip()
    }
    if article_heading_ids:
        require(
            failures,
            page,
            len( contents ) == 1,
            "entry with article headings must render one contents navigation",
        )
        if len( contents ) == 1:
            check_contents_targets(
                page,
                elements,
                contents[ 0 ],
                article_heading_ids,
                failures,
            )
    else:
        require(
            failures,
            page,
            not contents,
            "entry without article headings unexpectedly has contents navigation",
        )


def check_ec( elements: list[ Element ], failures: list[str] ) -> None:
    specimen_images = [
        image
        for specimen in elements_with_class( elements, "glossary-specimen" )
        for image in descendants( specimen )
        if image.name == "img"
    ]
    require(
        failures,
        EC_PAGE,
        len( specimen_images ) == 1,
        "missing the EC specimen image",
    )
    require(
        failures,
        EC_PAGE,
        any(
            element.name == "time"
            and bool( ( element.attribute( "datetime" ) or "" ).strip() )
            and "Reviewed" in normalized_text( element.parent ) if element.parent else False
            for element in elements
        ),
        "missing the EC reviewed date",
    )
    require( failures, EC_PAGE, has_reading_time( elements ), "missing the EC reading-time label" )

    contents = elements_with_class( elements, "glossary-entry-contents" )
    contents_links = [
        link
        for container in contents
        for link in descendants( container )
        if link.name == "a" and ( link.attribute( "href" ) or "" ).startswith( "#" )
    ]
    require( failures, EC_PAGE, len( contents_links ) > 0, "missing table-of-contents links" )
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
