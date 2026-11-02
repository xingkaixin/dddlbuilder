# The docs site is plain Astro

`apps/docs` is an Astro site with its own layout, sidebar, outline and search, and no docs framework
on top. The new docs layout scrolls in three layers, shares `packages/design`, and renders mostly
static HTML, which fought VitePress's theme and shipped a Vue runtime for pages that need none.
Search uses MiniSearch with one prebuilt index per language, loaded on first use. Heading ids stay
identical to the ones VitePress produced, because published links and search results point at them.

## Considered Options

Starlight was rejected because its layout is the part we are replacing. Pagefind was rejected because
it needs WebAssembly, and the site's CSP would have to allow it on every page, including the app.
