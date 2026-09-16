# Playpen Sans

`PlaypenSans-Variable.ttf` is an application-specific derivative of the Playpen Sans
2.000 variable font from Google Fonts. The contextual-alternate (`calt`) shuffler
is removed: it changes glyph advances based on surrounding characters, causing
native textarea wrapping and independently rendered Canvas lines to disagree.
All 3,082 upstream glyphs and 1,051 Unicode mappings, including Vietnamese, remain.
Other OpenType features and the complete weight axis (100–800) are retained.
The application never fetches fonts from a remote service at runtime.

- Source: https://github.com/google/fonts/blob/19d2b3eb5a1861a94e2fd90dfcc97e85b43267f8/ofl/playpensans/PlaypenSans%5Bwght%5D.ttf
- Upstream: https://github.com/TypeTogether/Playpen-Sans
- Google Fonts catalog: https://fonts.google.com/specimen/Playpen+Sans
- Git blob SHA-1: `b61fea15c1bda9e87c1f399880a4bc3d4fc06269`
- Original SHA-256: `e083f9da8be210e08ea982ab510894641aab37590e70620d6db73f8de881ec4a`
- Bundled derivative SHA-256: `485105bee1cd9ed28e3e7e6625f14bec8cb3a398d94f66a3950b3a4afc5577ca`
- License: SIL Open Font License 1.1. The full copyright and permission terms are
  included under Playpen Sans in the repository's `THIRD_PARTY_NOTICES.md`; both
  extension and desktop builds package those notices.

To regenerate the derivative, install `fonttools==4.64.0` in a Python environment
and run `python3 scripts/prepare-annotation-font.py`. This manual asset-preparation
step downloads and checksum-verifies the pinned source above; normal application
builds do not need Python, fontTools, or network access. To regenerate offline,
pass `--source /path/to/the-unmodified-upstream.ttf`.
