import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSchemaTools } from '@/__tests__/utils/schemaTools';
import { decodeSeedScenario } from '@ddlbuilder/shared-types/api';
import { readSeedScenarios, storeSeedScenario } from '@/utils/seedScenarios';

let harness: ReturnType<typeof setupSchemaTools>;

beforeEach(() => {
  harness = setupSchemaTools();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saved business scenarios', () => {
  it('preserves saved scenarios when storage is corrupt or the limit is reached', () => {
    const scenario = decodeSeedScenario({
      version: 1,
      name: 'test',
      seed: 'seed',
      includeLogical: false,
      rows: [],
      rules: [],
    });

    for (let i = 0; i < 50; i++) storeSeedScenario({ ...scenario, name: `scenario-${i}` });
    expect(() => storeSeedScenario(scenario)).toThrow('50');
    storeSeedScenario({ ...scenario, name: 'scenario-0', seed: 'updated' });
    expect(readSeedScenarios()).toHaveLength(50);
    harness.storage.set('ddlbuilder:seed-scenarios:v1', '{}');
    expect(() => readSeedScenarios()).toThrow('Invalid');
  });
});
