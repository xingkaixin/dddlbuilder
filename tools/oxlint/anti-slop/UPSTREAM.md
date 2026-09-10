# Vendored anti-slop

- Source repository: https://github.com/dmmulroy/anti-slop
- Source commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Source directory: `skills/install-anti-slop/assets/anti-slop/`
- Installed directory: `tools/oxlint/anti-slop/`
- Plugin entry points: `index.ts` and `effect/index.ts`.

The initial installed assets matched this upstream snapshot recursively. The root
MIT license and the nested ESLint Stylistic license and provenance are retained.
Local changes below must be preserved and reviewed when updating upstream.

## Repository policy

The repository retains 22 of the 24 rules, including the native
`oxc/no-accumulating-spread` companion rule, at error severity.

- `no-conditional-empty-object-spread` is disabled: optional property omission is
  a legitimate contract, and this syntax alone does not identify a maintenance problem.
- `no-shape-in-symbol-names` is disabled: the substring can accurately describe
  structural validation, so banning it does not reliably improve names.
- `no-runtime-typeof` enables `allowInTypeGuards`. Explicit predicates and assertion
  functions may inspect runtime types. Other parsing and interoperability boundaries
  require a specific local justification.
- `prefer-effect-match` and `no-service-constructor-imports` apply to Worker source
  and shared contracts, the packages that adopt Effect. UI and DDL code do not gain
  an Effect dependency solely to satisfy these style rules.
- Other rules remain enabled across owned application and test source. Exceptions
  must explain a concrete boundary or invariant at the smallest useful scope. Test
  files, SDKs, parsers, and existing violations are not blanket exceptions.
- Remove unnecessary assertions first. A necessary assertion states its actual
  `SAFETY:` invariant; a partial fixture must explain which contract it exercises.
  Completion-only callbacks may intentionally hide unused results as `unknown`.

## Local rule changes

- `require-readable-spacing` keeps import, declaration, and control-flow boundaries
  while allowing cohesive exports, declarations, guards, and immediately consumed
  bindings. Its regression tests specify the exact syntactic grouping policy.
- `no-known-value-widening` does not treat an unresolved generic return type as
  evidence of a known call result.
- `require-safety-comment-for-type-assertion` reports one missing justification per
  continuous assertion chain instead of reporting both inner and outer assertions.

Focused regression tests live beside these rules. Run `pnpm test:lint`; the root
`pnpm test` command includes them. Application formatting intentionally does not
rewrite the vendored source.

## Integration and limitations

`@oxlint/plugins` is pinned to `1.81.0`, matching installed and locked Oxlint.
The existing Oxlint dependency range is preserved; upgrade both packages together.
Existing lint policies remain in place. Vendored rules, installed agent assets, and
temporary audit files are excluded from application linting. Turbo lint inputs
include the root configuration and vendored source to invalidate cached results.

The plugin analyzes syntax and lexical scope, not TypeScript cross-file types;
Oxlint does not expose parser services. The Effect constructor-import rule covers
relative imports, not package or path-alias imports. These rules supplement type
checking, tests, and code review; they do not establish runtime safety on their own.
