import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareLocalD1Runtime, REQUIRED_RUNTIME_TABLES, verifyLocalD1Runtime } from './d1-runtime';

const persistDir = mkdtempSync(path.join(tmpdir(), 'ddlbuilder-d1-runtime-'));
const options = {
  configPath: 'apps/worker/wrangler.e2e.toml',
  persistDir,
};

try {
  prepareLocalD1Runtime(options);
  verifyLocalD1Runtime(options, REQUIRED_RUNTIME_TABLES);
} finally {
  rmSync(persistDir, { recursive: true, force: true });
}
