import { readWorkerConfig } from './deploy-config';

for (const mode of ['development', 'example', 'e2e']) {
  readWorkerConfig(mode);
}
