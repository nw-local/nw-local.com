#!/usr/bin/env python3
#
# Fail if the built site ships British spellings, a temperature carrying only
# one unit, or a temperature pair written Celsius first.
#
# Ordering is a separate rule from pairing because a pair can be complete and
# still wrong. `13 to 24 °C (55 to 75 °F)` carries both units, so the pairing
# check passed it every run while it sat in the Botrytis glossary entry, and a
# glossary tooltip renders into every article that links the term. Tooltip text
# gets proofread about as often as alt text, which is to say never. CLAUDE.md
# puts °F first because the audience is US based and works in Fahrenheit, and
# says to flip a figure lifted from a paper in Celsius rather than preserve the
# source's order.
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
# Where it runs, and why that list is longer than it looks: on pull requests
# via audit.yml, on the nightly run against main, and as a blocking step in
# deploy.yml. That third one exists because content reaches production through
# Sanity's webhook, which fires workflow_dispatch on deploy.yml and touches
# neither of the first two paths. Until it was added, every dist-validating
# check guarded code changes and skipped the content it was written for.
#
# Because it now blocks deploys, content-style-allow.txt exempts phrases that
# must keep a British spelling — a cited paper title being the case that
# matters here. See that file for the rules on adding an entry.
#
# Usage:
#   ./scripts/check-content-style.py [dist-dir]   # defaults to ./dist

import html
import pathlib
import re
import sys
from collections import defaultdict

DIST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
ALLOWLIST = pathlib.Path(__file__).resolve().parent / "content-style-allow.txt"

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


def load_allowlist() -> list[str]:
    """Phrases both rules skip, read from content-style-allow.txt.

    A cited paper title is what this is for. Americanizing a word inside
    someone else's title misquotes them, so the phrase is exempted rather than
    the word being dropped from SPELLINGS — dropping it would also stop the
    check catching that same word in our own prose, where it is a defect.
    """
    if not ALLOWLIST.is_file():
        return []
    phrases = []
    for raw in ALLOWLIST.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line:
            phrases.append(" ".join(line.split()))
    return phrases


def exempt_spans(text: str, phrases: list[str]) -> list[tuple[int, int]]:
    """Character ranges of every allowlisted phrase found on this page.

    Spans rather than a page-wide flag: an exempted citation must not also
    excuse a genuine misspelling elsewhere on the same page.
    """
    spans = []
    for phrase in phrases:
        for found in re.finditer(re.escape(phrase), text, re.I):
            spans.append((found.start(), found.end()))
    return spans


def is_exempt(spans: list[tuple[int, int]], start: int, end: int) -> bool:
    return any(begin <= start and end <= finish for begin, finish in spans)


def main() -> int:
    if not DIST.is_dir():
        print(f"check-content-style: no such directory: {DIST}", file=sys.stderr)
        print("Run `make build` first.", file=sys.stderr)
        return 2

    pages = sorted(p for p in DIST.rglob("*.html") if "_astro" not in p.parts)
    if not pages:
        print(f"check-content-style: no HTML in {DIST}", file=sys.stderr)
        return 2

    allowlist = load_allowlist()
    used = set()

    spelling_hits = defaultdict(set)
    temperature_hits = defaultdict(set)
    ordering_hits = defaultdict(set)

    for page in pages:
        where = str(page.relative_to(DIST))
        text = visible_text(page.read_text(encoding="utf-8", errors="replace"))
        spans = exempt_spans(text, allowlist)
        used.update(phrase for phrase in allowlist
                    if re.search(re.escape(phrase), text, re.I))

        for british, american in SPELLINGS.items():
            # finditer rather than search: a hit has to be located before it can
            # be tested against the allowlist spans.
            for found in re.finditer(rf"\b{british}\b", text, re.I):
                if is_exempt(spans, found.start(), found.end()):
                    continue
                spelling_hits[(british, american)].add(where)
                break

        # Collected up front because the ordering rule below has to compare a
        # Celsius mention against its neighbors, which a single pass over
        # finditer cannot see.
        temps = []
        for match in TEMPERATURE.finditer(text):
            if is_exempt(spans, match.start(), match.end()):
                continue
            spelled = match.group("word")
            unit = (match.group("sym") or spelled[0]).upper()
            temps.append((match.start(), match.end(), unit,
                          " ".join(match.group(0).split())))

        for begin, finish, unit, mention in temps:
            start = max(0, begin - PAIR_WINDOW)
            window = text[start:finish + PAIR_WINDOW]
            if not re.search(PARTNER[unit], window, re.I):
                if not FORMULA_CONTEXT.search(window):
                    temperature_hits[mention].add(where)
                continue
            if unit != "C" or FORMULA_CONTEXT.search(window):
                continue

            # Paired, so the only question left is which unit leads. Compare
            # against the NEAREST Fahrenheit mention rather than any Fahrenheit
            # in the window: two pairs written close together both fall inside
            # one window, so a neighbor's correctly-placed °F would otherwise
            # excuse an inverted pair sitting right next to it. A tie goes to
            # the preceding mention, which is the correct order.
            nearest_before = nearest_after = None
            for other_begin, other_finish, other_unit, _ in temps:
                if other_unit != "F":
                    continue
                if other_finish <= begin:
                    gap = begin - other_finish
                    if gap <= PAIR_WINDOW and (nearest_before is None
                                               or gap < nearest_before):
                        nearest_before = gap
                elif other_begin >= finish:
                    gap = other_begin - finish
                    if gap <= PAIR_WINDOW and (nearest_after is None
                                               or gap < nearest_after):
                        nearest_after = gap
            if nearest_after is not None and (nearest_before is None
                                              or nearest_after < nearest_before):
                ordering_hits[mention].add(where)

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
        print("  If a hit is a quoted source that must keep its spelling, add the")
        print(f"  surrounding phrase to {ALLOWLIST.name} rather than editing the quote.")
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

    if ordering_hits:
        failures += 1
        total = sum(len(v) for v in ordering_hits.values())
        print(f"FAIL: {len(ordering_hits)} temperature(s) put Celsius first, "
              f"across {total} placement(s).")
        print("  Fahrenheit leads, Celsius follows in parentheses: "
              "55 to 75 °F (13 to 24 °C).")
        print("  Flip the figure rather than preserving the order a cited paper used.")
        for mention, places in sorted(ordering_hits.items()):
            print(f"  {mention}")
            for place in sorted(places):
                print(f"      {place}")
        print()

    # A stale allowlist entry is not a build failure, but it is reported every
    # run: it exempts nothing today and silently widens what is exempt the
    # moment a page happens to contain it.
    unused = [phrase for phrase in allowlist if phrase not in used]
    if unused:
        print(f"NOTE: {len(unused)} allowlist entr(y/ies) matched nothing. "
              f"Delete them from {ALLOWLIST.name}:")
        for phrase in unused:
            print(f"  {phrase}")
        print()

    if failures:
        return 1

    exempted = f", {len(used)} allowlisted phrase(s) skipped" if used else ""
    print(f"check-content-style: {len(pages)} pages clean "
          f"(US spelling, temperatures paired °F first{exempted}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
