#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.63.0"]
# ///
"""Subset Roboto Mono for the web app and the docs site, and the hand fonts for the web app.

Run from anywhere with `uv run scripts/subset-fonts.py`, then commit the files it writes.
When to re-run is documented in the README files under apps/web/src/assets/fonts/.
"""

import hashlib
import io
import re
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
    Target(ROOT / "apps/docs/src/fonts/roboto-mono", (400, 700), keep_prep=True),
]

PARTS = {"core": CORE, "ext": EXT}

FONTS_DIR = ROOT / "apps/web/src/assets/fonts"
LOCALES_DIR = ROOT / "apps/web/src/i18n/locales"
COMPONENTS_DIR = ROOT / "apps/web/src/components"

ASCII = set(range(0x20, 0x7F))
HAND_PUNCTUATION = set(map(ord, "“”‘’–—…·"))
COMMENT = re.compile(r"/\*[\s\S]*?\*/|//.*")


@dataclass(frozen=True)
class HandFont:
    family: str
    url: str
    sha256: str
    out_dir: Path
    prefix: str
    # Only features that change how UI copy renders: calt and dlig change no Xiaolai string; Chromium's
    # text-spacing-trim applies halt to fullwidth punctuation by default.
    features: tuple[str, ...]
    # Chrome on macOS rasterizes Klee One differently at 1x without glyph names; Xiaolai renders the same either way.
    glyph_names: bool


XIAOLAI = HandFont(
    family="Xiaolai SC",
    url="https://github.com/lxgw/kose-font/releases/download/v3.126/Xiaolai-Regular.ttf",
    sha256="e2f68daf0e72777a8cf58bc83de1b98634b251e537ddbfca24b0ae50d1802da2",
    out_dir=FONTS_DIR / "xiaolai",
    prefix="xiaolai",
    features=(),
    glyph_names=False,
)
KLEE_ONE = HandFont(
    family="Klee One",
    url=(
        "https://raw.githubusercontent.com/google/fonts/130fcfb0ff422fec96b335616b2ca99f91914792"
        "/ofl/kleeone/KleeOne-Regular.ttf"
    ),
    sha256="bf4063f030cc2ae6adf0a11424a1888e5c0eb4438f1f6d02f52294af868e9b3a",
    out_dir=FONTS_DIR / "klee-one",
    prefix="klee-one",
    features=("kern", "liga", "halt"),
    glyph_names=True,
)


def ui_characters(*roots: Path) -> set[int]:
    characters: set[int] = set()
    for root in roots:
        for path in root.rglob("*.ts*"):
            if ".test." not in path.name and "__tests__" not in path.parts:
                characters |= set(map(ord, COMMENT.sub("", path.read_text())))
    return {codepoint for codepoint in characters if codepoint >= 0x20}


def hand_parts() -> list[tuple[HandFont, dict[str, set[int]]]]:
    english = ui_characters(LOCALES_DIR / "en-US")
    chinese = ui_characters(LOCALES_DIR / "zh-CN", COMPONENTS_DIR)
    core = ASCII | HAND_PUNCTUATION | english
    return [
        (XIAOLAI, {"core": core, "zh": chinese - core}),
        (KLEE_ONE, {"ja": ASCII | ui_characters(LOCALES_DIR / "ja-JP")}),
    ]


def load_source(url: str = SOURCE_URL, sha256: str = SOURCE_SHA256) -> bytes:
    with urllib.request.urlopen(url) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise SystemExit(f"Unexpected checksum for {url}")
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


def subset(
    font: TTFont,
    unicodes: set[int],
    keep_prep: bool,
    features: tuple[str, ...] = (),
    glyph_names: bool = False,
) -> bytes:
    options = Options()
    options.flavor = "woff2"
    options.layout_features = list(features)
    options.drop_tables += ["vhea", "vmtx", "BASE", "DSIG"]
    if not features:
        options.drop_tables += ["GSUB", "GPOS", "GDEF"]
    options.hinting = keep_prep
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.ignore_missing_unicodes = False
    # Chrome on macOS renders a variable font lighter at small sizes unless it can find a glyph named "X",
    # so variable fonts keep glyph names and always carry "X", unmapped when it is not in the requested set.
    variable = "fvar" in font
    options.glyph_names = variable or glyph_names

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


def shared_problems(font: TTFont, reference: TTFont, unicodes: set[int]) -> list[str]:
    problems = []
    if set(font.getBestCmap()) != unicodes:
        problems.append("cmap differs from the requested characters")
    for table in ("fpgm", "cvt "):
        if table in font:
            problems.append(f"unexpected {table} table")
    if font["name"].getDebugName(1) != reference["name"].getDebugName(1):
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
    return problems


def verify(data: bytes, source: bytes, target: Target, unicodes: set[int]) -> None:
    font = TTFont(io.BytesIO(data))
    problems = shared_problems(font, TTFont(io.BytesIO(source)), unicodes)

    for table in ("GSUB", "GPOS", "GDEF"):
        if table in font:
            problems.append(f"unexpected {table} table")
    if "fvar" in font and "X" not in font.getGlyphOrder():
        problems.append('variable font lost the glyph named "X"')
    if ("prep" in font) != target.keep_prep:
        problems.append("prep table presence is wrong")

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


def verify_hand(data: bytes, source: TTFont, unicodes: set[int], name: str) -> None:
    font = TTFont(io.BytesIO(data))
    problems = shared_problems(font, source, unicodes)
    if "prep" in font:
        problems.append("unexpected prep table")
    for codepoint in unicodes:
        if glyph_shape(font, codepoint) != glyph_shape(source, codepoint):
            problems.append(f"U+{codepoint:04X} differs")
    if problems:
        raise SystemExit(f"{name}: " + "; ".join(problems))


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


def font_face(family: str, file: str, weight: str, codepoints: set[int]) -> str:
    return "\n".join(
        [
            "@font-face {",
            f"  font-family: '{family}';",
            "  font-style: normal;",
            f"  font-weight: {weight};",
            "  font-display: swap;",
            f"  src: url(./{file}) format('woff2');",
            css_declaration("unicode-range", unicode_range(codepoints)),
            "}",
        ]
    )


def write_css(out_dir: Path, faces: list[str]) -> None:
    css = "/* Generated by scripts/subset-fonts.py. Do not edit. */\n" + "\n".join(faces) + "\n"
    (out_dir / "fonts.css").write_text(css)


def build_hand_font(font: HandFont, parts: dict[str, set[int]]) -> None:
    source = TTFont(io.BytesIO(load_source(font.url, font.sha256)))
    font.out_dir.mkdir(exist_ok=True)
    faces = []
    for part, unicodes in parts.items():
        file = f"{font.prefix}-{part}.woff2"
        data = subset(source, unicodes, False, font.features, font.glyph_names)
        verify_hand(data, source, unicodes, file)
        (font.out_dir / file).write_bytes(data)
        faces.append(font_face(font.family, file, "400", unicodes))
        print(f"{font.out_dir.relative_to(ROOT)}/{file}: {len(data)} bytes, {len(unicodes)} characters")
    write_css(font.out_dir, faces)


def main() -> None:
    for font, parts in hand_parts():
        build_hand_font(font, parts)
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
            faces.append(font_face("Roboto Mono", file, weight, unicodes))
            print(f"{target.out_dir.relative_to(ROOT)}/{file}: {len(data)} bytes, {len(unicodes)} characters")
        write_css(target.out_dir, faces)


if __name__ == "__main__":
    main()
