import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareLocalD1Runtime, verifyLocalD1Runtime } from './d1-runtime';
import { REQUIRED_RUNTIME_TABLES } from './d1-utils';

const persistDir = mkdtempSync(path.join(tmpdir(), 'ddlbuilder-d1-runtime-'));
const options = {
  mode: 'e2e' as const,
  persistDir,
};

try {
  prepareLocalD1Runtime(options);
  verifyLocalD1Runtime(options, REQUIRED_RUNTIME_TABLES);
} finally {
  rmSync(persistDir, { recursive: true, force: true });
}
