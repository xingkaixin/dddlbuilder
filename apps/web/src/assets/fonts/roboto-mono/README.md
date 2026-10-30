# Roboto Mono

Roboto Mono 3.001 from [google/fonts](https://github.com/google/fonts/tree/main/ofl/robotomono), licensed under the [SIL Open Font License 1.1](./OFL.txt) with no Reserved Font Name, so subsets keep the original name.

The `.woff2` files and `fonts.css` here and in `apps/docs/.vitepress/theme/fonts/roboto-mono/` are generated. Do not edit them; re-run the script and commit its output:

```bash
uv run scripts/subset-fonts.py
```

| Target  | Weights          | Notes                                          |
| ------- | ---------------- | ---------------------------------------------- |
| Web app | static 400       | Only the DDL/ORM output panels use Roboto Mono |
| Docs    | variable 400–700 | Body and code text; keeps `prep` for Windows   |

Each target has two files:

- `roboto-mono-core.woff2`: ASCII, U+000D, U+00B7, U+200B, curly quotes, en/em dashes, ellipsis. Preloaded.
- `roboto-mono-ext.woff2`: the rest of Latin-1 and Latin Extended-A, behind `unicode-range`. Downloaded only when a page renders those characters.

Other scripts and symbols (Cyrillic, Greek, Vietnamese, arrows, CJK) fall back to the next font in the stack.

## When to re-run

Edit `CORE`, `EXT` or `TARGETS` in the script first when needed, then re-run if:

- Roboto Mono text needs a character outside core and ext, or a non-ASCII character starts appearing on most pages (move it into core).
- The web app renders Roboto Mono at a weight other than 400, for example a bold highlight token or a `font-medium` parent, or the docs use a weight outside 400–700.
- Roboto Mono text enables OpenType features (`font-feature-settings`, `font-variant-*`, `tabular-nums`) or `hyphens: auto`. The subsets have no GSUB or GPOS.
- More pages or components start using Roboto Mono.
- The source font is upgraded: update `SOURCE_URL` and `SOURCE_SHA256`.
