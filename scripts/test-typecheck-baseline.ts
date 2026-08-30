import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type DiagnosticBaselineEntry = {
  package: string;
  file: string;
  code: string;
  message: string;
  sourceFingerprint: string;
  count: number;
};

export type DiagnosticBaselineComparison = {
  unexpected: DiagnosticBaselineEntry[];
  removable: DiagnosticBaselineEntry[];
  currentCount: number;
  baselineCount: number;
};

export type DiagnosticBaselineMode = 'check' | 'print' | 'write' | 'initialize';

export type DiagnosticBaselineOutcome = 'exact' | 'increased' | 'decreased';

type DiagnosticSourceLocation = { line: number; column: number } | null;

export type ParsedTscDiagnostic = Omit<DiagnosticBaselineEntry, 'count'> & {
  sourceLocation: DiagnosticSourceLocation;
};

export const resolveDiagnosticBaselineMode = (
  args: string[],
  baselineExists: boolean,
): DiagnosticBaselineMode => {
  const requested = [
    args.includes('--print-baseline') && 'print',
    args.includes('--write-baseline') && 'write',
    args.includes('--initialize-baseline') && 'initialize',
  ].filter(Boolean) as DiagnosticBaselineMode[];

  if (requested.length > 1) throw new Error('Choose only one test typecheck baseline mode');

  const mode = requested[0] ?? 'check';
  if ((mode === 'check' || mode === 'write') && !baselineExists) {
    throw new Error('Test typecheck baseline is missing; initialize it explicitly');
  }
  if (mode === 'initialize' && baselineExists) {
    throw new Error('Test typecheck baseline already exists');
  }
  return mode;
};

const entryKey = (entry: Omit<DiagnosticBaselineEntry, 'count'>) =>
  JSON.stringify([entry.package, entry.file, entry.code, entry.message, entry.sourceFingerprint]);

const compareEntries = (left: DiagnosticBaselineEntry, right: DiagnosticBaselineEntry) => {
  const leftKey = entryKey(left);
  const rightKey = entryKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

const normalizePath = (value: string) => value.replaceAll('\\', '/').replace(/\/$/, '');

const normalizeSourceLine = (line: string) => line.trim().replace(/\s+/g, ' ');

const TEST_ANCHOR = /\b(?:it|test|describe)(?:\.(?:each|only|skip|todo|concurrent|fails))*\s*\(/;

export const createSourceFingerprint = (
  source: string,
  diagnosticLine: number,
  diagnosticColumn: number,
) => {
  const lines = source.split(/\r?\n/);
  const targetIndex = diagnosticLine - 1;
  if (targetIndex < 0 || targetIndex >= lines.length) {
    throw new Error(`TypeScript diagnostic line ${diagnosticLine} is outside its source file`);
  }

  const collectContext = (start: number, step: -1 | 1, limit: number, minimumIndex = 0) => {
    const context: string[] = [];
    for (
      let index = start;
      index >= minimumIndex && index < lines.length && context.length < limit;
      index += step
    ) {
      const line = normalizeSourceLine(lines[index]);
      if (line) context.push(line);
    }
    return step === -1 ? context.reverse() : context;
  };

  let anchor: string | null = null;
  let anchorIndex = -1;
  for (let index = targetIndex; index >= 0; index -= 1) {
    const line = normalizeSourceLine(lines[index]);
    if (TEST_ANCHOR.test(line)) {
      anchor = line;
      anchorIndex = index;
      break;
    }
  }

  const targetLine = lines[targetIndex];
  const splitIndex = Math.min(Math.max(diagnosticColumn - 1, 0), targetLine.length);
  const context = {
    anchor,
    before: collectContext(targetIndex - 1, -1, 3, anchorIndex + 1),
    targetPrefix: normalizeSourceLine(targetLine.slice(0, splitIndex)),
    targetSuffix: normalizeSourceLine(targetLine.slice(splitIndex)),
    after: collectContext(targetIndex + 1, 1, 2),
  };
  return createHash('sha256').update(JSON.stringify(context)).digest('hex').slice(0, 16);
};

const packageRelativePath = (file: string, packageRoot: string, repoRoot: string) => {
  if (file === '<global>') return file;
  const normalizedFile = normalizePath(file);
  const normalizedRepoRoot = normalizePath(repoRoot);
  const normalizedPackageRoot = normalizePath(packageRoot);
  const packageFromRepo = normalizedPackageRoot.startsWith(`${normalizedRepoRoot}/`)
    ? normalizedPackageRoot.slice(normalizedRepoRoot.length + 1)
    : normalizedPackageRoot;
  const fileFromRepo = normalizedFile.startsWith(`${normalizedRepoRoot}/`)
    ? normalizedFile.slice(normalizedRepoRoot.length + 1)
    : normalizedFile;

  if (fileFromRepo === packageFromRepo) return '.';
  if (fileFromRepo.startsWith(`${packageFromRepo}/`)) {
    return fileFromRepo.slice(packageFromRepo.length + 1);
  }
  if (path.posix.isAbsolute(fileFromRepo)) return fileFromRepo;
  return path.posix.relative(packageFromRepo, fileFromRepo);
};

export const normalizeDiagnosticMessage = (message: string, repoRoot: string) => {
  const normalizedRoot = normalizePath(repoRoot);
  return message
    .replaceAll('\\', '/')
    .replaceAll(normalizedRoot, '<repo>')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
};

export const parseTscDiagnostics = (
  output: string,
  packageName: string,
  packageRoot: string,
  repoRoot: string,
  readSource: (sourcePath: string) => string = (sourcePath) => readFileSync(sourcePath, 'utf8'),
): ParsedTscDiagnostic[] => {
  const diagnostics: ParsedTscDiagnostic[] = [];
  const sourceCache = new Map<string, string>();
  let current:
    | {
        file: string;
        line: number | null;
        column: number | null;
        code: string;
        message: string[];
      }
    | undefined;

  const readDiagnosticSource = (file: string) => {
    const candidates = path.isAbsolute(file)
      ? [file]
      : [path.resolve(repoRoot, file), path.resolve(packageRoot, file)];
    for (const candidate of candidates) {
      const cached = sourceCache.get(candidate);
      if (cached !== undefined) return cached;
      try {
        const source = readSource(candidate);
        sourceCache.set(candidate, source);
        return source;
      } catch {
        continue;
      }
    }
    throw new Error(`Cannot read TypeScript diagnostic source: ${file}`);
  };

  const flush = () => {
    if (!current) return;
    diagnostics.push({
      package: packageName,
      file: packageRelativePath(current.file, packageRoot, repoRoot),
      code: current.code,
      message: normalizeDiagnosticMessage(current.message.join('\n'), repoRoot),
      sourceLocation:
        current.line === null || current.column === null
          ? null
          : { line: current.line, column: current.column },
      sourceFingerprint:
        current.line === null || current.column === null
          ? 'global'
          : createSourceFingerprint(
              readDiagnosticSource(current.file),
              current.line,
              current.column,
            ),
    });
    current = undefined;
  };

  for (const line of output.split(/\r?\n/)) {
    const located = /^(.*)\((\d+),(\d+)\): error TS(\d+): (.*)$/.exec(line);
    const global = /^error TS(\d+): (.*)$/.exec(line);
    if (located) {
      flush();
      current = {
        file: located[1],
        line: Number(located[2]),
        column: Number(located[3]),
        code: `TS${located[4]}`,
        message: [located[5]],
      };
      continue;
    }
    if (global) {
      flush();
      current = {
        file: '<global>',
        line: null,
        column: null,
        code: `TS${global[1]}`,
        message: [global[2]],
      };
      continue;
    }
    if (current && /^\s/.test(line) && line.trim()) {
      current.message.push(line);
      continue;
    }
    if (line.trim()) throw new Error(`Unrecognized TypeScript output: ${line}`);
  }
  flush();
  return diagnostics;
};

export const aggregateDiagnostics = (
  diagnostics: ParsedTscDiagnostic[],
): DiagnosticBaselineEntry[] => {
  const entries = new Map<
    string,
    { baselineEntry: DiagnosticBaselineEntry; sourceLocation: DiagnosticSourceLocation }
  >();
  for (const diagnostic of diagnostics) {
    const key = entryKey(diagnostic);
    const existing = entries.get(key);
    const { sourceLocation, ...baselineEntry } = diagnostic;
    if (
      existing &&
      (existing.sourceLocation?.line !== sourceLocation?.line ||
        existing.sourceLocation?.column !== sourceLocation?.column)
    ) {
      throw new Error(`TypeScript source fingerprint collision for ${diagnostic.file}`);
    }
    entries.set(key, {
      sourceLocation,
      baselineEntry: {
        ...baselineEntry,
        count: (existing?.baselineEntry.count ?? 0) + 1,
      },
    });
  }
  return [...entries.values()].map(({ baselineEntry }) => baselineEntry).sort(compareEntries);
};

export const parseDiagnosticBaseline = (value: unknown): DiagnosticBaselineEntry[] => {
  if (!Array.isArray(value)) throw new Error('Test typecheck baseline must be an array');

  const entries = value
    .map((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof entry.package !== 'string' ||
        typeof entry.file !== 'string' ||
        typeof entry.code !== 'string' ||
        typeof entry.message !== 'string' ||
        typeof entry.sourceFingerprint !== 'string' ||
        !/^(?:[0-9a-f]{16}|global)$/.test(entry.sourceFingerprint) ||
        typeof entry.count !== 'number' ||
        !Number.isSafeInteger(entry.count) ||
        entry.count < 1
      ) {
        throw new Error('Test typecheck baseline contains an invalid entry');
      }
      return entry as DiagnosticBaselineEntry;
    })
    .sort(compareEntries);

  for (let index = 1; index < entries.length; index += 1) {
    if (entryKey(entries[index - 1]) === entryKey(entries[index])) {
      throw new Error('Test typecheck baseline contains a duplicate entry');
    }
  }

  return entries;
};

export const compareDiagnosticBaselines = (
  current: DiagnosticBaselineEntry[],
  baseline: DiagnosticBaselineEntry[],
): DiagnosticBaselineComparison => {
  const currentByKey = new Map(current.map((entry) => [entryKey(entry), entry]));
  const baselineByKey = new Map(baseline.map((entry) => [entryKey(entry), entry]));
  const unexpected: DiagnosticBaselineEntry[] = [];
  const removable: DiagnosticBaselineEntry[] = [];

  for (const entry of current) {
    const allowed = baselineByKey.get(entryKey(entry))?.count ?? 0;
    if (entry.count > allowed) unexpected.push({ ...entry, count: entry.count - allowed });
  }

  for (const entry of baseline) {
    const actual = currentByKey.get(entryKey(entry))?.count ?? 0;
    if (actual < entry.count) removable.push({ ...entry, count: entry.count - actual });
  }

  return {
    unexpected: unexpected.sort(compareEntries),
    removable: removable.sort(compareEntries),
    currentCount: current.reduce((total, entry) => total + entry.count, 0),
    baselineCount: baseline.reduce((total, entry) => total + entry.count, 0),
  };
};

export const getDiagnosticBaselineOutcome = (
  comparison: DiagnosticBaselineComparison,
): DiagnosticBaselineOutcome => {
  if (comparison.unexpected.length > 0) return 'increased';
  if (comparison.removable.length > 0) return 'decreased';
  return 'exact';
};
