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
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Iterable


DIST = pathlib.Path( sys.argv[ 1 ] if len( sys.argv ) > 1 else "dist" )
INDEX_PAGE = pathlib.Path( "glossary/index.html" )
EC_PAGE = pathlib.Path( "glossary/ec/index.html" )
CONCISE_PAGE = pathlib.Path( "glossary/cultivar/index.html" )
EXPECTED_DIRECTORY_ENTRIES = 59
EXPECTED_LETTER_VALUES = frozenset( [ "", *"abcdefghijklmnopqrstuvwxyz" ] )
EXPECTED_CATEGORY_VALUES = frozenset( {
    "",
    "plant-biology",
    "cultivation",
    "environment",
    "nutrition",
    "chemistry",
    "post-harvest",
    "business-regulation",
} )
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


def descendants( element: Element ) -> Iterable[ Element ]:
    for child in element.children:
        if isinstance( child, Element ):
            yield child
            yield from descendants( child )


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


def has_labeled_search_input( elements: list[ Element ] ) -> bool:
    labels = [
        element
        for element in elements
        if element.name == "label"
        and element.attribute( "for" ) == "glossary-query"
        and normalized_text( element ) == "Search terms and definitions"
    ]
    inputs = [
        element
        for element in elements
        if element.name == "input"
        and element.attribute( "id" ) == "glossary-query"
        and element.attribute( "type" ) == "search"
    ]
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


def check_index( elements: list[ Element ], failures: list[str] ) -> None:
    require(
        failures,
        INDEX_PAGE,
        has_labeled_search_input( elements ),
        "missing the labeled glossary search input",
    )
    letter_values = filter_values( elements, "data-glossary-letter" )
    require(
        failures,
        INDEX_PAGE,
        len( letter_values ) == len( EXPECTED_LETTER_VALUES )
        and frozenset( letter_values ) == EXPECTED_LETTER_VALUES,
        "expected exactly the A-Z filter values",
    )
    category_values = filter_values( elements, "data-glossary-category" )
    require(
        failures,
        INDEX_PAGE,
        len( category_values ) == len( EXPECTED_CATEGORY_VALUES )
        and frozenset( category_values ) == EXPECTED_CATEGORY_VALUES,
        "expected exactly the category filter values",
    )
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
    featured_cards = elements_with_class( elements, "glossary-featured-card" )
    require(
        failures,
        INDEX_PAGE,
        any( card.name == "a" and card.attribute( "href" ) == "/glossary/ec" for card in featured_cards ),
        "missing the featured EC card",
    )
    directory_entries = elements_with_class( elements, "glossary-index-entry" )
    require(
        failures,
        INDEX_PAGE,
        len( directory_entries ) == EXPECTED_DIRECTORY_ENTRIES,
        f"expected {EXPECTED_DIRECTORY_ENTRIES} complete directory entries",
    )

    directory_ids: list[str] = []
    directory_links: list[str] = []
    for entry in directory_entries:
        entry_id = ( entry.attribute( "data-glossary-id" ) or "" ).strip()
        require(
            failures,
            INDEX_PAGE,
            bool( entry_id ),
            "directory entry has no glossary identity",
        )
        if entry_id:
            directory_ids.append( entry_id )

        glossary_links = [
            link
            for link in descendants( entry )
            if link.name == "a"
            and ( link.attribute( "href" ) or "" ).startswith( "/glossary/" )
        ]
        require(
            failures,
            INDEX_PAGE,
            len( glossary_links ) == 1,
            "directory entry must have exactly one glossary link",
        )
        if len( glossary_links ) != 1:
            continue

        glossary_link = ( glossary_links[ 0 ].attribute( "href" ) or "" ).strip()
        directory_links.append( glossary_link )
        require(
            failures,
            INDEX_PAGE,
            ( DIST / glossary_link.removeprefix( "/" ) / "index.html" ).is_file(),
            f"directory link {glossary_link} does not resolve to a built glossary page",
        )

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

    for card in featured_cards:
        card_href = card.attribute( "href" ) or "featured card without an href"
        images = [ element for element in descendants( card ) if element.name == "img" ]
        require(
            failures,
            INDEX_PAGE,
            len( images ) > 0,
            f"{card_href}: featured card has no image",
        )
        for image in images:
            require(
                failures,
                INDEX_PAGE,
                bool( ( image.attribute( "alt" ) or "" ).strip() ),
                f"{card_href}: featured-card image has an empty alt attribute",
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
        any( bool( ( image.attribute( "alt" ) or "" ).strip() ) for image in specimen_images ),
        "missing the EC specimen image alt text",
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
    require(
        failures,
        EC_PAGE,
        any( re.search( r"\b\d+ min read\b", normalized_text( element ) ) for element in elements if element.name == "p" ),
        "missing the EC reading-time label",
    )

    contents = elements_with_class( elements, "glossary-entry-contents" )
    contents_links = [
        link
        for container in contents
        for link in descendants( container )
        if link.name == "a" and ( link.attribute( "href" ) or "" ).startswith( "#" )
    ]
    require( failures, EC_PAGE, len( contents_links ) > 0, "missing table-of-contents links" )
    for link in contents_links:
        target = ( link.attribute( "href" ) or "" )[ 1: ]
        target_count = sum( element.attribute( "id" ) == target for element in elements )
        require(
            failures,
            EC_PAGE,
            target_count == 1,
            f"table-of-contents target #{target} exists {target_count} times",
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
    require(
        failures,
        EC_PAGE,
        has_json_ld_type( elements, "DefinedTerm", failures, EC_PAGE ),
        "missing DefinedTerm JSON-LD",
    )
    require(
        failures,
        EC_PAGE,
        has_json_ld_type( elements, "BreadcrumbList", failures, EC_PAGE ),
        "missing BreadcrumbList JSON-LD",
    )


def check_concise_entry( elements: list[ Element ], failures: list[str] ) -> None:
    require(
        failures,
        CONCISE_PAGE,
        len( elements_with_class( elements, "glossary-specimen" ) ) == 0,
        "concise entry has an empty image wrapper",
    )
    require(
        failures,
        CONCISE_PAGE,
        not any( re.search( r"\b\d+ min read\b", normalized_text( element ) ) for element in elements if element.name == "p" ),
        "concise entry unexpectedly has a reading-time label",
    )
    require(
        failures,
        CONCISE_PAGE,
        len( elements_with_class( elements, "glossary-entry-contents" ) ) == 0,
        "concise entry unexpectedly has contents navigation",
    )


def main() -> int:
    if not DIST.is_dir():
        print( f"check-glossary-build: no such directory: {DIST}", file=sys.stderr )
        print( "Run `make build` first.", file=sys.stderr )
        return 2

    target_pages = [ INDEX_PAGE, EC_PAGE, CONCISE_PAGE ]
    failures = [
        f"{target_page}: missing target page"
        for target_page in target_pages
        if not ( DIST / target_page ).is_file()
    ]
    if failures:
        for failure in failures:
            print( failure, file=sys.stderr )
        return 1

    index_elements = page_elements( DIST / INDEX_PAGE )
    ec_elements = page_elements( DIST / EC_PAGE )
    concise_elements = page_elements( DIST / CONCISE_PAGE )
    check_index( index_elements, failures )
    check_ec( ec_elements, failures )
    check_concise_entry( concise_elements, failures )

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
