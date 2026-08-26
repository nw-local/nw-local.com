#!/usr/bin/env python3
#
# Fail if the built site ships British spellings, or a temperature carrying
# only one unit.
#
# Both rules live in CLAUDE.md, and before this script nothing executed them.
# That is the failure mode this repo has hit repeatedly: a convention written
# down but never run is a suggestion, and it quietly stops matching the content
# it claims to describe. Two real examples caught by hand rather than by CI,
# which is why this exists:
#
#   "Favoured temperature" reached a published table, lifted from a botrytis
#   paper. Scientific sources are frequently British or international, so
#   paraphrased text arrives spelled the source's way.
#
#   "pale grey backdrop" and "labelled as the trade" sat in two image asset
#   `description` fields and rendered onto five pages. Alt text is the blind
#   spot: nobody reads it while proofing, so it drifts furthest.
#
# Why it audits `dist/` rather than querying Sanity: the build flattens every
# field onto one surface, so table cells, figure captions, alt text, glossary
# bodies and meta descriptions are all covered without the check needing to
# know which schema field produced them. That is the same reasoning recorded in
# CLAUDE.md for the em-dash sweep, which under-reported when run against GROQ.
#
# Why Python rather than bash, unlike its sibling check-*.sh scripts: both
# rules need word-boundary matching and a proximity window around each match,
# and Astro minifies every page onto a single line, so there are no line
# boundaries for grep to work with. Expressing that in shell would be less
# readable, not more consistent.
#
# Usage:
#   ./scripts/check-content-style.py [dist-dir]   # defaults to ./dist

import html
import pathlib
import re
import sys
from collections import defaultdict

DIST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")

# british -> american, matched case-insensitively on word boundaries.
SPELLINGS = {
    "favour": "favor", "favoured": "favored", "favours": "favors",
    "favourite": "favorite", "colour": "color", "coloured": "colored",
    "colours": "colors", "colourful": "colorful", "flavour": "flavor",
    "flavours": "flavors", "flavoured": "flavored", "odour": "odor",
    "odours": "odors", "vapour": "vapor", "vapours": "vapors",
    "behaviour": "behavior", "behaviours": "behaviors", "humour": "humor",
    "labour": "labor", "neighbour": "neighbor", "neighbours": "neighbors",
    "rumour": "rumor", "harbour": "harbor",
    "centre": "center", "centres": "centers", "centred": "centered",
    "litre": "liter", "litres": "liters", "fibre": "fiber", "fibres": "fibers",
    "theatre": "theater",
    "organise": "organize", "organised": "organized", "recognise": "recognize",
    "recognised": "recognized", "realise": "realize", "realised": "realized",
    "optimise": "optimize", "optimised": "optimized", "minimise": "minimize",
    "minimised": "minimized", "maximise": "maximize", "maximised": "maximized",
    "emphasise": "emphasize", "emphasised": "emphasized",
    "characterise": "characterize", "characterised": "characterized",
    "utilise": "utilize", "specialise": "specialize",
    "prioritise": "prioritize", "standardise": "standardize",
    "normalise": "normalize", "sterilise": "sterilize",
    "sterilised": "sterilized", "summarise": "summarize",
    "criticise": "criticize", "analyse": "analyze", "analysed": "analyzed",
    "catalyse": "catalyze", "paralyse": "paralyze",
    "travelled": "traveled", "labelled": "labeled", "labelling": "labeling",
    "modelled": "modeled", "cancelled": "canceled", "fuelled": "fueled",
    "signalled": "signaled", "totalled": "totaled",
    # mould/mold and grey/gray matter most here: this is a cannabis site, so
    # "gray mold" for botrytis comes up constantly.
    "mould": "mold", "moulds": "molds", "mouldy": "moldy",
    "smoulder": "smolder", "grey": "gray", "greyish": "grayish",
    "sulphur": "sulfur", "aluminium": "aluminum", "ageing": "aging",
    "defence": "defense", "offence": "offense", "licence": "license",
    "practise": "practice", "programme": "program", "catalogue": "catalog",
    "analogue": "analog", "draught": "draft", "storey": "story",
    "tyre": "tire", "plough": "plow", "cheque": "check",
    "skilful": "skillful", "enrol": "enroll", "fulfil": "fulfill",
    "instil": "instill",
    "whilst": "while", "amongst": "among",
}

# A temperature: an optional range, then a number, then a unit. The unit is
# matched in both the symbol form (°C) and the spelled-out form (degrees
# Celsius), because alt text tends to spell it out — a screen reader would
# otherwise read "°" aloud — and an earlier version of this check missed a
# whole figure description for exactly that reason.
TEMPERATURE = re.compile(
    r"(?:\d[\d,.]*\s*(?:to|-|–|—|and)\s*)?\d[\d,.]*\s*"
    r"(?:°\s*(?P<sym>[CF])\b|degrees?\s+(?P<word>Celsius|Centigrade|Fahrenheit))",
    re.I,
)
PARTNER = {"C": r"(?:°\s*F\b|degrees?\s+Fahrenheit)",
           "F": r"(?:°\s*C\b|degrees?\s+(?:Celsius|Centigrade))"}

# How far either side of a temperature its partner unit may sit.
PAIR_WINDOW = 60

# A formula variable is a legitimate single-unit mention: the Magnus equation
# is defined in Celsius and converting its input would make it wrong. Matched
# against the window, not the whole page, so it exempts only the mention.
FORMULA_CONTEXT = re.compile(r"\bT is in\b|\bwhere\s+SVP\b|\bMagnus\b", re.I)

SCRIPT_OR_STYLE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S | re.I)
MARKUP = re.compile(r"<[^>]+>")
READER_ATTRS = re.compile(r'(?:alt|title|content)="([^"]*)"')


def visible_text(markup: str) -> str:
    """Everything a reader can encounter, including alt and meta text."""
    markup = SCRIPT_OR_STYLE.sub(" ", markup)
    attrs = " ".join(READER_ATTRS.findall(markup))
    text = html.unescape(MARKUP.sub(" ", markup) + " " + attrs)
    return " ".join(text.split())


def main() -> int:
    if not DIST.is_dir():
        print(f"check-content-style: no such directory: {DIST}", file=sys.stderr)
        print("Run `make build` first.", file=sys.stderr)
        return 2

    pages = sorted(p for p in DIST.rglob("*.html") if "_astro" not in p.parts)
    if not pages:
        print(f"check-content-style: no HTML in {DIST}", file=sys.stderr)
        return 2

    spelling_hits = defaultdict(set)
    temperature_hits = defaultdict(set)

    for page in pages:
        where = str(page.relative_to(DIST))
        text = visible_text(page.read_text(encoding="utf-8", errors="replace"))

        for british, american in SPELLINGS.items():
            if re.search(rf"\b{british}\b", text, re.I):
                spelling_hits[(british, american)].add(where)

        for match in TEMPERATURE.finditer(text):
            spelled = match.group("word")
            unit = (match.group("sym") or spelled[0]).upper()
            start = max(0, match.start() - PAIR_WINDOW)
            window = text[start:match.end() + PAIR_WINDOW]
            if re.search(PARTNER[unit], window, re.I):
                continue
            if FORMULA_CONTEXT.search(window):
                continue
            temperature_hits[" ".join(match.group(0).split())].add(where)

    failures = 0

    if spelling_hits:
        failures += 1
        total = sum(len(v) for v in spelling_hits.values())
        print(f"FAIL: British spelling on {total} page(s). Use US spelling in all content.")
        for (british, american), places in sorted(spelling_hits.items()):
            print(f"  {british} -> {american}")
            for place in sorted(places):
                print(f"      {place}")
        print("  Alt text and image asset `description` fields are the usual culprits.")
        print()

    if temperature_hits:
        failures += 1
        total = sum(len(v) for v in temperature_hits.values())
        print(f"FAIL: {len(temperature_hits)} temperature(s) carry only one unit, "
              f"across {total} placement(s).")
        print("  Write Fahrenheit first with Celsius alongside: 82 to 85 °F (28 to 29 °C).")
        for mention, places in sorted(temperature_hits.items()):
            print(f"  {mention}")
            for place in sorted(places):
                print(f"      {place}")
        print()

    if failures:
        return 1

    print(f"check-content-style: {len(pages)} pages clean "
          "(US spelling, temperatures paired).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
