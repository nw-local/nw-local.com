#!/usr/bin/env python3

from pathlib import Path
import re


PROJECT_ROOT = Path(__file__).resolve().parent.parent
NAV_COMPONENT = PROJECT_ROOT / "src/components/Nav.astro"
FOOTER_COMPONENT = PROJECT_ROOT / "src/components/Footer.astro"


def extract_top_navigation(source: str) -> list[tuple[str, str]]:
    links_block_match = re.search(r"const NAV_LINKS = \[(.*?)\];", source, re.DOTALL)
    if links_block_match is None:
        raise AssertionError("top navigation: NAV_LINKS declaration is missing")

    return re.findall(
        r'\{ href: ("[^"]+"|DROP_BASE_PATH), label: "([^"]+)" \}',
        links_block_match.group(1),
    )


def extract_footer_groups(source: str) -> list[tuple[str, list[tuple[str, str]]]]:
    group_matches = re.findall(
        r'<div class="footer-nav-group">\s*<h3[^>]*>([^<]+)</h3>(.*?)</div>',
        source,
        re.DOTALL,
    )

    return [
        (
            heading,
            re.findall(r'<a href=("[^"]+"|\{DROP_BASE_PATH\})>([^<]+)</a>', group_source),
        )
        for heading, group_source in group_matches
    ]


nav_source = NAV_COMPONENT.read_text()
footer_source = FOOTER_COMPONENT.read_text()

expected_top_navigation = [
    ('"/"', "Home"),
    ("DROP_BASE_PATH", "Drops"),
    ('"/products"', "Products"),
    ('"/find-us"', "Find Us"),
    ('"/strains"', "Strains"),
    ('"/blog"', "Blog"),
    ('"/about-us"', "About"),
    ('"/contact"', "Contact"),
]
expected_footer_groups = [
    (
        "Explore",
        [
            ("{DROP_BASE_PATH}", "Drops"),
            ('"/products"', "Products"),
            ('"/find-us"', "Find Us"),
            ('"/strains"', "Strains"),
        ],
    ),
    (
        "Resources",
        [
            ('"/blog"', "Blog"),
            ('"/glossary"', "Glossary"),
            ('"/terpenes"', "Terpenes"),
        ],
    ),
    (
        "Company",
        [
            ('"/about-us"', "About"),
            ('"/contact"', "Contact"),
            ('"/retailers"', "Wholesale"),
        ],
    ),
]

assert extract_top_navigation(nav_source) == expected_top_navigation
assert extract_footer_groups(footer_source) == expected_footer_groups
assert '<nav class="footer-nav" aria-labelledby="footer-nav-heading">' in footer_source
assert '<h2 id="footer-nav-heading" class="visually-hidden">Site navigation</h2>' in footer_source
assert footer_source.count('<ul class="footer-nav-links">') == len(expected_footer_groups)
assert footer_source.count("<li>") == sum(len(links) for _, links in expected_footer_groups)

print("Navigation structure is correct.")
