import { bindings, defineConfig, exports, triggers } from '@cloudflare/config';
import { readFileSync } from 'node:fs';
import * as Schema from 'effect/Schema';
import { URL, fileURLToPath } from 'node:url';
import e2eVars from './cloudflare.e2e.json' with { type: 'json' };

export const workerDirectory = fileURLToPath(new URL('.', import.meta.url));

const nonEmpty = Schema.String.check(Schema.isMinLength(1));
const DeploymentSettings = Schema.Struct({
  domain: nonEmpty,
  databaseId: nonEmpty,
  databaseName: nonEmpty,
  kvId: nonEmpty,
  vars: Schema.Record(Schema.String, Schema.String),
});

export const getWorkerConfig = (mode = 'development') => {
  if (!['development', 'production', 'e2e', 'example'].includes(mode)) {
    throw new Error(`Unknown Cloudflare mode: ${mode}`);
  }

  const production = mode === 'production' || mode === 'example';
  const e2e = mode === 'e2e';

  const deployment = production
    ? Schema.decodeUnknownSync(DeploymentSettings)(
        JSON.parse(
          readFileSync(
            new URL(
              mode === 'example' ? './cloudflare.deploy.example.json' : './cloudflare.deploy.json',
              import.meta.url,
            ),
            'utf8',
          ),
        ),
      )
    : undefined;

  const name = e2e ? 'ddlbuilder-e2e' : 'ddlbuilder';
  const vars = deployment?.vars ?? (e2e ? e2eVars : { ENVIRONMENT: 'development' });

  return {
    name,
    entrypoint: 'dist/server.js',
    compatibilityDate: '2026-03-17',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: false,
    domains: deployment ? [deployment.domain] : [],
    assets: {
      htmlHandling: 'auto-trailing-slash' as const,
      notFoundHandling: '404-page' as const,
      runWorkerFirst: ['/api/*'],
    },
    triggers: e2e ? [] : [triggers.scheduled({ schedule: '*/10 * * * *' })],
    exports: { WorkspaceYDocDurableObject: exports.durableObject({ storage: 'sqlite' }) },
    env: {
      ...Object.fromEntries(
        Object.entries(vars).map(([key, value]) => [key, bindings.text(value)]),
      ),
      ASSETS: bindings.assets(),
      SHARE_KV: bindings.kv({ id: deployment?.kvId ?? 'YOUR_SHARE_KV_ID' }),
      USER_DB: bindings.d1({
        name: deployment?.databaseName ?? `ddlbuilder-user-${e2e ? 'e2e' : 'local'}`,
        id: deployment?.databaseId ?? `00000000-0000-0000-0000-00000000000${e2e ? '2' : '1'}`,
      }),
      WORKSPACE_YDOC: bindings.durableObject({
        worker: name,
        exportName: 'WorkspaceYDocDurableObject',
      }),
    },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, headSamplingRate: 1, persist: true, invocationLogs: true },
      traces: { enabled: true, persist: true, headSamplingRate: production ? 0.05 : 1 },
    },
  };
};

export default defineConfig(({ mode }) => ({ worker: getWorkerConfig(mode) }));
