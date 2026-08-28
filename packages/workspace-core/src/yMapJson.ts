import * as Y from 'yjs';
import { stableStringify } from './stableStringify';

export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readMap = (parent: Y.Map<any>, key: string): Y.Map<any> | null => {
  const existing = parent.get(key);
  return existing instanceof Y.Map ? existing : null;
};

export const hasMapOrArray = (parent: Y.Map<any>, mapKey: string, arrayKey: string) =>
  parent.get(mapKey) instanceof Y.Map || parent.get(arrayKey) instanceof Y.Array;

export const readStringArray = (parent: Y.Map<any>, key: string): string[] => {
  const existing = parent.get(key);
  if (!(existing instanceof Y.Array)) return [];
  return Array.from(new Set(existing.toArray().map((value: unknown) => String(value))));
};

export const readJsonMap = (map: Y.Map<unknown> | null | undefined): JsonRecord => {
  if (!map) return {};
  const record: JsonRecord = {};
  for (const [key, value] of map.entries()) {
    record[key] = value;
  }
  return record;
};

export const readOrderedMap = <T>(parent: Y.Map<any>, mapKey: string, orderKey: string): T[] => {
  const map = readMap(parent, mapKey);
  if (!map) return [];
  return readStringArray(parent, orderKey)
    .map((id) => {
      const itemMap = map.get(id);
      return itemMap instanceof Y.Map ? (readJsonMap(itemMap) as T) : null;
    })
    .filter((item): item is T => item != null);
};

export const ensureMap = (parent: Y.Map<any>, key: string): Y.Map<any> => {
  const existing = readMap(parent, key);
  if (existing) return existing;
  const next = new Y.Map<unknown>();
  parent.set(key, next);
  return next;
};

export const ensureArray = (parent: Y.Map<any>, key: string): Y.Array<string> => {
  const existing = parent.get(key);
  if (existing instanceof Y.Array) return existing as Y.Array<string>;
  const next = new Y.Array<string>();
  parent.set(key, next);
  return next;
};

export const writeJsonMapPatch = (map: Y.Map<unknown>, values: JsonRecord) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      map.delete(key);
      continue;
    }
    if (stableStringify(map.get(key)) !== stableStringify(value)) {
      map.set(key, value);
    }
  }
};

export const writeJsonMap = (map: Y.Map<unknown>, values: JsonRecord) => {
  const nextKeys = new Set(Object.keys(values));
  for (const key of Array.from(map.keys())) {
    if (!nextKeys.has(key)) {
      map.delete(key);
    }
  }
  writeJsonMapPatch(map, values);
};

const retainedArrayIndices = (current: string[], nextPositions: Map<string, number>) => {
  const positions = current.map((value) => nextPositions.get(value) ?? -1);
  const predecessors = current.map(() => -1);
  const tails: number[] = [];

  // Unique target IDs turn the longest common subsequence into an O(n log n) LIS.
  for (let index = 0; index < positions.length; index += 1) {
    if (positions[index] < 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (positions[tails[middle]] < positions[index]) low = middle + 1;
      else high = middle;
    }
    predecessors[index] = low > 0 ? tails[low - 1] : -1;
    tails[low] = index;
  }

  const retained: number[] = [];
  for (let index = tails.at(-1) ?? -1; index >= 0; index = predecessors[index]) {
    retained.push(index);
  }
  return retained.reverse();
};

export const syncStringArray = (array: Y.Array<string>, values: string[]) => {
  const current = array.toArray();
  const nextPositions = new Map(values.map((value, index) => [value, index]));
  const retained = retainedArrayIndices(current, nextPositions);
  let currentStart = 0;
  let nextStart = 0;
  let arrayIndex = 0;

  for (const currentEnd of [...retained, current.length]) {
    const nextEnd = nextPositions.get(current[currentEnd]) ?? values.length;
    const deleteCount = currentEnd - currentStart;
    if (deleteCount > 0) array.delete(arrayIndex, deleteCount);
    const inserted = values.slice(nextStart, nextEnd);
    if (inserted.length > 0) array.insert(arrayIndex, inserted);
    arrayIndex += inserted.length + 1;
    currentStart = currentEnd + 1;
    nextStart = nextEnd + 1;
  }
};

export const assertUniqueIds = (ids: string[], subject: string) => {
  if (ids.some((id) => id.trim().length === 0) || new Set(ids).size !== ids.length) {
    throw new Error(`${subject} must have unique non-empty ids`);
  }
};

export const writeOrderedMap = <T extends { id: string }>(
  parent: Y.Map<any>,
  mapKey: string,
  orderKey: string,
  values: T[],
) => {
  const map = ensureMap(parent, mapKey);
  const order = ensureArray(parent, orderKey);
  const ids = values.map((value) => value.id);
  assertUniqueIds(ids, mapKey);
  const idSet = new Set(ids);
  for (const key of Array.from(map.keys())) {
    if (!idSet.has(key)) {
      map.delete(key);
    }
  }
  for (const value of values) {
    writeJsonMap(ensureMap(map, value.id), value as JsonRecord);
  }
  syncStringArray(order, ids);
};
