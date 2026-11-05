import { rmSync } from 'node:fs';
import { e2eD1RuntimeOptions, prepareLocalD1Runtime, verifyLocalD1Runtime } from './d1-runtime';
import { REQUIRED_RUNTIME_TABLES } from './d1-utils';

rmSync(e2eD1RuntimeOptions.persistDir, { recursive: true, force: true });

prepareLocalD1Runtime(e2eD1RuntimeOptions);

verifyLocalD1Runtime(e2eD1RuntimeOptions, REQUIRED_RUNTIME_TABLES);
