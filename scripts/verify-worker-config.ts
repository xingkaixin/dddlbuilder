import { assertWorkerConfigValid } from './deploy-config.js';

for (const config of [
  'apps/worker/wrangler.toml',
  'apps/worker/wrangler.deploy.example.toml',
  'apps/worker/wrangler.e2e.toml',
]) {
  assertWorkerConfigValid(config);
}
