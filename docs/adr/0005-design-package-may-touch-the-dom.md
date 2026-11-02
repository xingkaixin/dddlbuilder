# The design package is the one shared package that may touch the DOM

`packages/design` holds the Lanmo tokens, the sketch path generator and the feature tiles, because
the web app and the docs site must draw the same lines and play the same tiles. Shared packages do
not touch the DOM, and this package keeps that rule everywhere except `tile-player.ts`, which arms
one tile element and replays it on hover and focus. It has no framework dependency, so the React
web app and the static docs site both call it directly. The package holds no product logic and
reads no network, storage or Worker bindings, and it depends on no other workspace package.

## Considered Options

Keeping the player in each app was rejected: the timing rules would exist twice and drift, and the
docs site does not load React. A separate DOM-only package was rejected because it would hold one
file and need the same exception.
