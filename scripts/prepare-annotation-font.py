#!/usr/bin/env python3
"""Rebuild the bundled annotation font; not required for normal application builds.

Install the pinned build tool with: python3 -m pip install fonttools==4.64.0
Pass --source /path/to/upstream.ttf to avoid downloading the pinned original.
"""

import argparse
import hashlib
import io
from pathlib import Path
from urllib.request import urlopen

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

SOURCE_URL = (
    "https://raw.githubusercontent.com/google/fonts/"
    "19d2b3eb5a1861a94e2fd90dfcc97e85b43267f8/"
    "ofl/playpensans/PlaypenSans%5Bwght%5D.ttf"
)
SOURCE_SHA256 = "e083f9da8be210e08ea982ab510894641aab37590e70620d6db73f8de881ec4a"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Unmodified pinned upstream TTF")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "src/assets/fonts/PlaypenSans-Variable.ttf",
    )
    args = parser.parse_args()
    if fontTools.__version__ != "4.64.0":
        raise SystemExit("Reproducible font preparation requires fonttools==4.64.0")
    if args.source:
        original = args.source.read_bytes()
    else:
        with urlopen(SOURCE_URL, timeout=30) as response:
            original = response.read()
    if hashlib.sha256(original).hexdigest() != SOURCE_SHA256:
        raise SystemExit("The upstream font checksum does not match the pinned source")

    font = TTFont(io.BytesIO(original), recalcTimestamp=False)
    glyphs = font.getGlyphOrder()
    characters = font.getBestCmap().copy()
    axes = [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in font["fvar"].axes]
    features = {
        record.FeatureTag
        for table in ("GSUB", "GPOS")
        for record in font[table].table.FeatureList.FeatureRecord
    }
    options = subset.Options()
    # A wildcard followed by -=calt does not exclude calt; enumerate explicitly.
    options.layout_features = sorted(features - {"calt"})
    options.glyph_names = True
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.retain_gids = True
    options.passthrough_tables = True
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(glyphs=glyphs)
    subsetter.subset(font)
    assert font.getGlyphOrder() == glyphs, "A glyph was changed or removed"
    assert font.getBestCmap() == characters, "Unicode coverage changed"
    assert [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in font["fvar"].axes] == axes, "Variable weight coverage changed"
    assert not any(record.FeatureTag == "calt"
                   for record in font["GSUB"].table.FeatureList.FeatureRecord)
    assert {
        record.FeatureTag
        for table in ("GSUB", "GPOS")
        for record in font[table].table.FeatureList.FeatureRecord
    } == features - {"calt"}, "An unrelated OpenType feature changed"
    font.save(args.output)
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"{digest}  {args.output}")
    print(f"Preserved {len(glyphs)} glyphs, {len(characters)} Unicode mappings, axes {axes}")


if __name__ == "__main__":
    main()
