import { describe, expect, it } from 'vitest';
import {
  aggregateDiagnostics,
  compareDiagnosticBaselines,
  createSourceFingerprint,
  getDiagnosticBaselineOutcome,
  normalizeDiagnosticMessage,
  parseDiagnosticBaseline,
  parseTscDiagnostics,
  resolveDiagnosticBaselineMode,
  type DiagnosticBaselineEntry,
} from './test-typecheck-baseline';

const diagnostic = (overrides: Partial<DiagnosticBaselineEntry> = {}): DiagnosticBaselineEntry => ({
  package: '@ddlbuilder/web',
  file: 'src/example.test.ts',
  code: 'TS2322',
  message: "Type 'string' is not assignable to type 'number'.",
  sourceFingerprint: '0123456789abcdef',
  count: 1,
  ...overrides,
});

describe('test typecheck baseline', () => {
  it('normalizes repository paths, separators and whitespace', () => {
    expect(
      normalizeDiagnosticMessage(
        'Type  from C:\\repo\\node_modules\\pkg\n  is invalid',
        'C:\\repo',
      ),
    ).toBe('Type  from <repo>/node_modules/pkg is invalid');
  });

  it('allows diagnostics to decrease and reports removable baseline entries', () => {
    const comparison = compareDiagnosticBaselines([diagnostic()], [diagnostic({ count: 2 })]);

    expect(comparison.unexpected).toEqual([]);
    expect(comparison.removable).toEqual([diagnostic()]);
    expect(getDiagnosticBaselineOutcome(comparison)).toBe('decreased');
  });

  it('rejects a count increase for the same diagnostic identity', () => {
    const comparison = compareDiagnosticBaselines([diagnostic({ count: 2 })], [diagnostic()]);

    expect(comparison.unexpected).toEqual([diagnostic()]);
    expect(getDiagnosticBaselineOutcome(comparison)).toBe('increased');
  });

  it('rejects a new message even when file and diagnostic code are unchanged', () => {
    const replacement = diagnostic({ message: 'A different type error.' });
    const comparison = compareDiagnosticBaselines([replacement], [diagnostic()]);

    expect(comparison.unexpected).toEqual([replacement]);
  });

  it('parses multiline diagnostics and fingerprints their source context', () => {
    const source = Array.from({ length: 12 }, (_, index) => `const value${index + 1} = 1;`).join(
      '\n',
    );
    const parsed = parseTscDiagnostics(
      [
        "apps/web/src/example.test.ts(10,2): error TS2322: Type 'string' is not assignable",
        "  to type 'number'.",
      ].join('\n'),
      '@ddlbuilder/web',
      '/repo/apps/web',
      '/repo',
      () => source,
    );

    expect(parsed).toEqual([
      {
        package: '@ddlbuilder/web',
        file: 'src/example.test.ts',
        code: 'TS2322',
        message: "Type 'string' is not assignable to type 'number'.",
        sourceLocation: { line: 10, column: 2 },
        sourceFingerprint: createSourceFingerprint(source, 10, 2),
      },
    ]);
  });

  it('rejects unrecognized compiler output after a diagnostic', () => {
    expect(() =>
      parseTscDiagnostics(
        [
          'apps/web/src/example.test.ts(10,2): error TS2322: Invalid assignment.',
          'TypeScript compiler crashed',
        ].join('\n'),
        '@ddlbuilder/web',
        '/repo/apps/web',
        '/repo',
      ),
    ).toThrow('Unrecognized TypeScript output');
  });

  it('keeps diagnostics outside a package relative to that package', () => {
    const source = 'const before = 1;\nconst broken = true;\nconst after = 2;';
    const [parsed] = parseTscDiagnostics(
      'packages/shared-types/src/api.ts(2,1): error TS2322: Invalid assignment.',
      '@ddlbuilder/web',
      '/repo/apps/web',
      '/repo',
      () => source,
    );

    expect(parsed?.file).toBe('../../packages/shared-types/src/api.ts');
  });

  it('uses one stable file identity for global diagnostics', () => {
    const [parsed] = parseTscDiagnostics(
      "error TS5083: Cannot read file '/repo/missing.json'.",
      '@ddlbuilder/web',
      '/repo/apps/web',
      '/repo',
    );

    expect(parsed).toEqual({
      package: '@ddlbuilder/web',
      file: '<global>',
      code: 'TS5083',
      message: "Cannot read file '<repo>/missing.json'.",
      sourceLocation: null,
      sourceFingerprint: 'global',
    });
  });

  it('aggregates repeated diagnostics at the same source location', () => {
    const repeated = {
      package: '@ddlbuilder/web',
      file: 'src/example.test.ts',
      code: 'TS2322',
      message: 'Invalid assignment.',
      sourceLocation: { line: 2, column: 7 },
      sourceFingerprint: '0123456789abcdef',
    };

    expect(aggregateDiagnostics([repeated, repeated])).toEqual([
      diagnostic({ message: 'Invalid assignment.', count: 2 }),
    ]);
  });

  it('rejects a source fingerprint collision across locations', () => {
    const repeated = {
      package: '@ddlbuilder/web',
      file: 'src/example.test.ts',
      code: 'TS2322',
      message: 'Invalid assignment.',
      sourceFingerprint: '0123456789abcdef',
    };

    expect(() =>
      aggregateDiagnostics([
        { ...repeated, sourceLocation: { line: 2, column: 7 } },
        { ...repeated, sourceLocation: { line: 8, column: 7 } },
      ]),
    ).toThrow('source fingerprint collision');
  });

  it('rejects the same diagnostic moving to different source context', () => {
    const baselineSource = [
      'const beforeOld = 1;',
      'const broken: number = "value";',
      'const afterOld = 2;',
    ].join('\n');
    const currentSource = [
      'const beforeOld = 1;',
      'const fixed = 1;',
      'const afterOld = 2;',
      'const beforeNew = 3;',
      'const broken: number = "value";',
      'const afterNew = 4;',
    ].join('\n');
    const output = (line: number) =>
      `apps/web/src/example.test.ts(${line},7): error TS2322: Invalid assignment.`;
    const baseline = aggregateDiagnostics(
      parseTscDiagnostics(
        output(2),
        '@ddlbuilder/web',
        '/repo/apps/web',
        '/repo',
        () => baselineSource,
      ),
    );
    const current = aggregateDiagnostics(
      parseTscDiagnostics(
        output(5),
        '@ddlbuilder/web',
        '/repo/apps/web',
        '/repo',
        () => currentSource,
      ),
    );

    const comparison = compareDiagnosticBaselines(current, baseline);
    expect(comparison.unexpected).toEqual(current);
    expect(comparison.removable).toEqual(baseline);
  });

  it('keeps a fingerprint stable when lines are inserted elsewhere', () => {
    const source = [
      "describe('fingerprint', () => {",
      "  it('keeps its source identity', () => {",
      '    const before = 1;',
      '    const broken: number = "value";',
      '    const after = 2;',
      '  });',
      '});',
    ].join('\n');
    const shiftedSource = `const inserted = true;\n${source}`;

    expect(createSourceFingerprint(source, 4, 11)).toBe(
      createSourceFingerprint(shiftedSource, 5, 11),
    );
  });

  it('distinguishes two diagnostic columns on the same source line', () => {
    const source = [
      "it('checks two values', () => {",
      '  const broken = first + second;',
      '});',
    ].join('\n');

    expect(createSourceFingerprint(source, 2, 18)).not.toBe(createSourceFingerprint(source, 2, 26));
  });

  it('distinguishes repeated fixture blocks in different tests', () => {
    const source = [
      "describe('fixtures', () => {",
      "  it('uses the first fixture', () => {",
      '    const before = true;',
      '    const broken: number = "value";',
      '    const after = true;',
      '  });',
      "  it('uses the second fixture', () => {",
      '    const before = true;',
      '    const broken: number = "value";',
      '    const after = true;',
      '  });',
      '});',
    ].join('\n');
    const output = [
      'apps/web/src/example.test.ts(4,11): error TS2322: Invalid assignment.',
      'apps/web/src/example.test.ts(9,11): error TS2322: Invalid assignment.',
    ].join('\n');
    const entries = aggregateDiagnostics(
      parseTscDiagnostics(output, '@ddlbuilder/web', '/repo/apps/web', '/repo', () => source),
    );

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.count === 1)).toBe(true);
    expect(entries[0]?.sourceFingerprint).not.toBe(entries[1]?.sourceFingerprint);
  });

  it('rejects malformed baseline entries', () => {
    expect(() => parseDiagnosticBaseline([{ ...diagnostic(), count: 0 }])).toThrow('invalid entry');
    expect(() =>
      parseDiagnosticBaseline([{ ...diagnostic(), count: Number.MAX_SAFE_INTEGER + 1 }]),
    ).toThrow('invalid entry');
  });

  it('rejects duplicate diagnostic identities in a baseline', () => {
    expect(() => parseDiagnosticBaseline([diagnostic(), diagnostic({ count: 2 })])).toThrow(
      'duplicate entry',
    );
  });

  it('requires an explicit one-time baseline initialization', () => {
    expect(() => resolveDiagnosticBaselineMode([], false)).toThrow('initialize it explicitly');
    expect(() => resolveDiagnosticBaselineMode(['--write-baseline'], false)).toThrow(
      'initialize it explicitly',
    );
    expect(resolveDiagnosticBaselineMode(['--print-baseline'], false)).toBe('print');
    expect(resolveDiagnosticBaselineMode(['--initialize-baseline'], false)).toBe('initialize');
    expect(() => resolveDiagnosticBaselineMode(['--initialize-baseline'], true)).toThrow(
      'already exists',
    );
  });

  it('rejects ambiguous baseline maintenance modes', () => {
    expect(() =>
      resolveDiagnosticBaselineMode(['--print-baseline', '--write-baseline'], true),
    ).toThrow('only one');
  });

  it('reports an exact baseline match', () => {
    expect(
      getDiagnosticBaselineOutcome(compareDiagnosticBaselines([diagnostic()], [diagnostic()])),
    ).toBe('exact');
  });
});
