"""Shared flat-element HTML parsing mechanic for the build checkers.

Used by `check-coa-build.py` and `check-drop-build.py`, both of which read a
whole built page into a flat list of elements (each carrying its own visible
text and a link to its parent) and then query that list by attribute or
ancestry. `check-glossary-build.py` parses HTML too, but builds a real child
tree (`Element.children`) with void-tag awareness and a different text-join
rule, because it needs to walk parent-to-child rather than just test
ancestry and read accumulated text — that is a different mechanic, not a
copy of this one, so it keeps its own parser.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


@dataclass
class Element:
    name: str
    attributes: dict[str, str]
    parent: "Element | None" = None
    text_parts: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join("".join(self.text_parts).split())


class ElementTreeParser(HTMLParser):
    """Flattens a page into `Element`s carrying parent links and own text."""

    def __init__(self) -> None:
        super().__init__()
        self.elements: list[Element] = []
        self.stack: list[Element] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        element = Element(tag, attributes, self.stack[-1] if self.stack else None)
        self.elements.append(element)
        self.stack.append(element)

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


def parse_html_file(page: Path) -> ElementTreeParser:
    parser = ElementTreeParser()
    parser.feed(page.read_text(encoding="utf-8"))
    parser.close()
    return parser


def elements_with_attribute(parser: ElementTreeParser, attribute: str) -> list[Element]:
    return [element for element in parser.elements if attribute in element.attributes]


def is_descendant_of(element: Element, ancestor: Element) -> bool:
    parent = element.parent
    while parent:
        if parent is ancestor:
            return True
        parent = parent.parent
    return False
