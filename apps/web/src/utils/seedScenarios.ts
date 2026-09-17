import { decodeSeedScenario, type SeedScenario } from '@ddlbuilder/shared-types/api';

const storageKey = 'ddlbuilder:seed-scenarios:v1';

export function readSeedScenarios(): SeedScenario[] {
  const raw = localStorage.getItem(storageKey);

  if (!raw) return [];
  const value: unknown = JSON.parse(raw);

  if (!Array.isArray(value) || value.length > 50) throw new Error('Invalid saved scenarios');

  return value.map((item) => decodeSeedScenario(item));
}

export function storeSeedScenario(scenario: SeedScenario) {
  const saved = readSeedScenarios();

  const next = [
    ...saved.filter((item) => item.name !== scenario.name),
    decodeSeedScenario(scenario),
  ];

  if (next.length > 50) throw new Error('At most 50 saved scenarios');
  localStorage.setItem(storageKey, JSON.stringify(next));
}
