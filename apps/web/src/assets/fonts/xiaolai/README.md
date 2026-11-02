# Hand fonts

The interface's hand font. Text the user types is not rendered in it, so the files only hold characters from the interface's own copy.

| Font                          | Source                                                                | Used for        |
| ----------------------------- | --------------------------------------------------------------------- | --------------- |
| Xiaolai (`Xiaolai SC` in CSS) | [lxgw/kose-font](https://github.com/lxgw/kose-font) release v3.126    | zh-CN and en-US |
| Klee One                      | [google/fonts](https://github.com/google/fonts/tree/main/ofl/kleeone) | ja-JP           |

Both are licensed under the SIL Open Font License 1.1 with no Reserved Font Name, so subsets keep the original names: [Xiaolai](./OFL.txt), [Klee One](../klee-one/OFL.txt).

The `.woff2` files and `fonts.css` here and in `../klee-one/` are generated. Do not edit them; re-run the script and commit its output:

```bash
uv run scripts/subset-fonts.py
```

| File                 | Contents                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `xiaolai-core.woff2` | ASCII, curly quotes, en/em dashes, ellipsis, middle dot, everything in the en-US copy. Preload.               |
| `xiaolai-zh.woff2`   | The rest of the zh-CN copy and of the strings hardcoded in `apps/web/src/components`, behind `unicode-range`. |
| `klee-one-ja.woff2`  | ASCII and the ja-JP copy. One file, because a Japanese page needs nearly all of it.                           |

Xiaolai keeps no OpenType layout. Klee One keeps only `kern`, `liga` and `halt`, and its glyph names. Removing any of these changes Chromium's rendering of the ja-JP copy: `halt` drives `text-spacing-trim`, and macOS Chrome at 1x rasterizes differently without the glyph names.

## When to re-run

`scripts/hand-font-coverage.test.ts` fails when copy uses a character outside the subsets, so re-run after any change it reports. Also re-run, editing `XIAOLAI`, `KLEE_ONE` or `hand_parts` in the script first when needed, if:

- The interface starts enabling OpenType features on hand-font text (`font-feature-settings`, `font-variant-*`, `hyphens: auto`). Xiaolai's `calt` and `dlig` were dropped because no current string uses them.
- A component renders hand-font text from outside the locale files and `apps/web/src/components`. `apps/web/src/utils` is excluded on purpose: its strings are mock data and sample tables, shown in the standard or monospace font.
- The source font is upgraded: update `url` and `sha256`, then compare rendering of the zh-CN, en-US and ja-JP copy against the full font at 1x and 2x.
