import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateDiagnostics,
  compareDiagnosticBaselines,
  getDiagnosticBaselineOutcome,
  parseDiagnosticBaseline,
  parseTscDiagnostics,
  resolveDiagnosticBaselineMode,
  type DiagnosticBaselineEntry,
  type ParsedTscDiagnostic,
} from './test-typecheck-baseline';

type TestTypecheckProject = {
  package: string;
  root: string;
};

const projects: TestTypecheckProject[] = [
  { package: '@ddlbuilder/web', root: 'apps/web' },
  { package: '@ddlbuilder/worker', root: 'apps/worker' },
  { package: '@ddlbuilder/ddl-core', root: 'packages/ddl-core' },
  { package: '@ddlbuilder/workspace-core', root: 'packages/workspace-core' },
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts/typecheck-tests.baseline.json');
const tscPath = path.join(repoRoot, 'node_modules/typescript/bin/tsc');

const formatEntry = (entry: DiagnosticBaselineEntry) =>
  `${entry.package} ${entry.file}#${entry.sourceFingerprint} ${entry.code} (${entry.count}): ${entry.message}`;

const collectDiagnostics = () => {
  const diagnostics: ParsedTscDiagnostic[] = [];
  const unparsedFailures: string[] = [];

  for (const project of projects) {
    const projectRoot = path.join(repoRoot, project.root);
    const result = spawnSync(
      process.execPath,
      [
        tscPath,
        '--noEmit',
        '--pretty',
        'false',
        '-p',
        path.join(projectRoot, 'tsconfig.test.json'),
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    let parsed: ParsedTscDiagnostic[] = [];
    let parseFailed = false;
    try {
      parsed = parseTscDiagnostics(stdout, project.package, projectRoot, repoRoot);
      diagnostics.push(...parsed);
    } catch (error) {
      parseFailed = true;
      unparsedFailures.push(
        `${project.package}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (result.error) {
      unparsedFailures.push(`${project.package}: ${result.error.message}`);
    } else if (result.signal) {
      unparsedFailures.push(`${project.package}: tsc terminated by ${result.signal}`);
    } else if (stderr) {
      unparsedFailures.push(`${project.package}: ${stderr}`);
    } else if (result.status !== 0 && parsed.length === 0 && !parseFailed) {
      unparsedFailures.push(`${project.package}: ${stdout || `tsc exited with ${result.status}`}`);
    }
  }

  return { current: aggregateDiagnostics(diagnostics), unparsedFailures };
};

const printEntries = (heading: string, entries: DiagnosticBaselineEntry[]) => {
  if (entries.length === 0) return;
  console.error(`\n${heading}`);
  for (const entry of entries) console.error(`- ${formatEntry(entry)}`);
};

const readBaseline = () => parseDiagnosticBaseline(JSON.parse(readFileSync(baselinePath, 'utf8')));

const mode = resolveDiagnosticBaselineMode(process.argv.slice(2), existsSync(baselinePath));
const { current, unparsedFailures } = collectDiagnostics();

const baselineJson = `${JSON.stringify(current, null, 2)}\n`;
if (mode !== 'check') {
  if (unparsedFailures.length > 0) {
    throw new Error(unparsedFailures.join('\n'));
  }
  if (mode === 'write') {
    const comparison = compareDiagnosticBaselines(current, readBaseline());
    if (comparison.unexpected.length > 0) {
      printEntries('Unexpected TypeScript diagnostics:', comparison.unexpected);
      throw new Error('Test typecheck baseline updates cannot accept increased diagnostics');
    }
    writeFileSync(baselinePath, baselineJson);
    console.log(`Updated ${path.relative(repoRoot, baselinePath)} with ${current.length} entries.`);
  } else if (mode === 'initialize') {
    writeFileSync(baselinePath, baselineJson);
    console.log(
      `Initialized ${path.relative(repoRoot, baselinePath)} with ${current.length} entries.`,
    );
  } else {
    process.stdout.write(baselineJson);
  }
} else {
  const baseline = readBaseline();
  const comparison = compareDiagnosticBaselines(current, baseline);

  if (unparsedFailures.length > 0) {
    printEntries('Unexpected TypeScript diagnostics:', comparison.unexpected);
    throw new Error(unparsedFailures.join('\n'));
  }

  const outcome = getDiagnosticBaselineOutcome(comparison);
  if (outcome === 'increased') {
    printEntries('Unexpected TypeScript diagnostics:', comparison.unexpected);
    throw new Error(
      `Test typecheck diagnostics increased from the ${comparison.baselineCount}-error baseline`,
    );
  }

  if (outcome === 'decreased') {
    printEntries('Baseline entries that can be removed:', comparison.removable);
    console.error(
      '\nTest typecheck diagnostics decreased. Refresh scripts/typecheck-tests.baseline.json with:\n' +
        'pnpm run typecheck:tests:baseline',
    );
    throw new Error('Test typecheck baseline contains obsolete diagnostics');
  }

  console.log(`Test typecheck passed (${comparison.currentCount} baseline diagnostics).`);
}
