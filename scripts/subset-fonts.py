#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.63.0"]
# ///
"""Subset Roboto Mono for the web app and the docs site.

Run from anywhere with `uv run scripts/subset-fonts.py`, then commit the files it writes.
When to re-run is documented in apps/web/src/assets/fonts/roboto-mono/README.md.
"""

import hashlib
import io
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent

# google/fonts commit "Roboto Mono: Version 3.001 added"; glyphs match the Google Fonts CSS API v31 files.
SOURCE_URL = (
    "https://raw.githubusercontent.com/google/fonts/b01086459d9d41ece904d39155b93f7bd3a676f2"
    "/ofl/robotomono/RobotoMono%5Bwght%5D.ttf"
)
SOURCE_SHA256 = "66a80e79d17e4c7cabd162e2916578a4cc08fd19eef6e2a643305eae9c567b2b"

# U+000D and U+200B are invisible but present in rendered text; U+200B is in every docs heading anchor.
CORE = {
    0x0D,
    *range(0x20, 0x7F),
    0xB7,
    0x200B,
    0x2013,
    0x2014,
    0x2018,
    0x2019,
    0x201C,
    0x201D,
    0x2026,
}
EXT = set(range(0xA0, 0x180)) - CORE


@dataclass(frozen=True)
class Target:
    out_dir: Path
    weight: int | tuple[int, int]
    # Google Fonts serves the docs site a `prep` table on Windows only; keep it so Windows rendering stays the same.
    keep_prep: bool


TARGETS = [
    Target(ROOT / "apps/web/src/assets/fonts/roboto-mono", 400, keep_prep=False),
    Target(ROOT / "apps/docs/.vitepress/theme/fonts/roboto-mono", (400, 700), keep_prep=True),
]

PARTS = {"core": CORE, "ext": EXT}


def load_source() -> bytes:
    with urllib.request.urlopen(SOURCE_URL) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA256:
        raise SystemExit(f"Unexpected checksum for {SOURCE_URL}")
    return data


def instantiate(source: bytes, weight: int | tuple[int, int]) -> TTFont:
    font = instancer.instantiateVariableFont(TTFont(io.BytesIO(source)), {"wght": weight})
    if isinstance(weight, int):
        del font["STAT"]
        return font

    # Limiting an axis makes instancer bake and re-round IUP-inferred deltas, which moves some points by up to
    # 0.5 units. With the default and maximum unchanged, the source's positive-side deltas are still exact.
    axis = TTFont(io.BytesIO(source))["fvar"].axes[0]
    if weight != (axis.defaultValue, axis.maxValue):
        raise SystemExit(f"Only {axis.defaultValue}-{axis.maxValue} can keep the source deltas, got {weight}")
    original = TTFont(io.BytesIO(source))["gvar"].variations
    font["gvar"].variations = {
        name: [variation for variation in variations if variation.axes["wght"][1] > 0]
        for name, variations in original.items()
    }
    return font


def subset(font: TTFont, unicodes: set[int], keep_prep: bool) -> bytes:
    options = Options()
    options.flavor = "woff2"
    options.layout_features = []
    options.drop_tables += ["GSUB", "GPOS", "GDEF"]
    options.hinting = keep_prep
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.ignore_missing_unicodes = False
    # Chrome on macOS renders a variable font lighter at small sizes unless it can find a glyph named "X",
    # so variable fonts keep glyph names and always carry "X", unmapped when it is not in the requested set.
    variable = "fvar" in font
    options.glyph_names = variable

    subsetter = Subsetter(options)
    subsetter.populate(unicodes=unicodes, glyphs=["X"] if variable else [])
    font = TTFont(io.BytesIO(to_bytes(font)))
    subsetter.subset(font)
    for table in font["cmap"].tables:
        table.cmap = {codepoint: glyph for codepoint, glyph in table.cmap.items() if codepoint in unicodes}
    font.flavor = "woff2"
    return to_bytes(font)


def to_bytes(font: TTFont) -> bytes:
    font.recalcTimestamp = False
    # A recalculated (tighter) head bbox also changes Chrome's 1x rendering on macOS; keep the source bounds.
    font.recalcBBoxes = False
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def glyph_shape(font: TTFont, codepoint: int) -> tuple:
    name = font.getBestCmap()[codepoint]
    glyph = font["glyf"][name]
    coordinates = glyph.getCoordinates(font["glyf"]) if glyph.numberOfContours else None
    outline = (list(coordinates[0]), list(coordinates[1]), list(coordinates[2])) if coordinates else None
    return outline, font["hmtx"][name]


def verify(data: bytes, source: bytes, target: Target, unicodes: set[int]) -> None:
    font = TTFont(io.BytesIO(data))
    reference = TTFont(io.BytesIO(source))
    problems = []

    if set(font.getBestCmap()) != unicodes:
        problems.append("cmap differs from the requested characters")
    for table in ("GSUB", "GPOS", "GDEF", "fpgm", "cvt "):
        if table in font:
            problems.append(f"unexpected {table} table")
    if "fvar" in font and "X" not in font.getGlyphOrder():
        problems.append('variable font lost the glyph named "X"')
    if ("prep" in font) != target.keep_prep:
        problems.append("prep table presence is wrong")
    if font["name"].getDebugName(1) != "Roboto Mono":
        problems.append("family name changed")
    for table, fields in {
        "head": ("unitsPerEm", "xMin", "yMin", "xMax", "yMax"),
        "hhea": ("ascent", "descent", "lineGap", "advanceWidthMax", "xMaxExtent"),
        "OS/2": (
            "sTypoAscender",
            "sTypoDescender",
            "sTypoLineGap",
            "usWinAscent",
            "usWinDescent",
            "fsSelection",
            "xAvgCharWidth",
        ),
    }.items():
        for field in fields:
            if getattr(font[table], field) != getattr(reference[table], field):
                problems.append(f"{table}.{field} changed")

    if isinstance(target.weight, int):
        weights = [target.weight]
        if "fvar" in font:
            problems.append("pinned font still has fvar")
    else:
        weights = list(range(target.weight[0], target.weight[1] + 1, 50))
        axes = [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes]
        if axes != [("wght", target.weight[0], 400, target.weight[1])]:
            problems.append(f"unexpected axes {axes}")

    for weight in weights:
        expected = instantiate(source, weight)
        actual = font if "fvar" not in font else instancer.instantiateVariableFont(font, {"wght": weight})
        for codepoint in unicodes:
            if glyph_shape(actual, codepoint) != glyph_shape(expected, codepoint):
                problems.append(f"U+{codepoint:04X} differs at wght {weight}")

    if problems:
        raise SystemExit(f"{target.out_dir}: " + "; ".join(problems))


def unicode_range(codepoints: set[int]) -> list[str]:
    ranges: list[list[int]] = []
    for codepoint in sorted(codepoints):
        if ranges and ranges[-1][1] == codepoint - 1:
            ranges[-1][1] = codepoint
        else:
            ranges.append([codepoint, codepoint])
    return [f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in ranges]


def css_declaration(name: str, values: list[str]) -> str:
    line = f"  {name}: {', '.join(values)};"
    if len(line) <= 100:
        return line
    rows, row = [], ""
    for value in values:
        candidate = f"{row}, {value}" if row else value
        if len(candidate) + 5 > 100:
            rows.append(row)
            candidate = value
        row = candidate
    rows.append(row)
    return f"  {name}:\n" + ",\n".join(f"    {r}" for r in rows) + ";"


def font_face(file: str, weight: str, codepoints: set[int]) -> str:
    return "\n".join(
        [
            "@font-face {",
            "  font-family: 'Roboto Mono';",
            "  font-style: normal;",
            f"  font-weight: {weight};",
            "  font-display: swap;",
            f"  src: url(./{file}) format('woff2');",
            css_declaration("unicode-range", unicode_range(codepoints)),
            "}",
        ]
    )


def main() -> None:
    source = load_source()
    for target in TARGETS:
        font = instantiate(source, target.weight)
        weight = str(target.weight) if isinstance(target.weight, int) else f"{target.weight[0]} {target.weight[1]}"
        faces = []
        for part, unicodes in PARTS.items():
            data = subset(font, unicodes, target.keep_prep)
            verify(data, source, target, unicodes)
            file = f"roboto-mono-{part}.woff2"
            (target.out_dir / file).write_bytes(data)
            faces.append(font_face(file, weight, unicodes))
            print(f"{target.out_dir.relative_to(ROOT)}/{file}: {len(data)} bytes, {len(unicodes)} characters")
        css = "/* Generated by scripts/subset-fonts.py. Do not edit. */\n" + "\n".join(faces) + "\n"
        (target.out_dir / "fonts.css").write_text(css)


if __name__ == "__main__":
    main()
