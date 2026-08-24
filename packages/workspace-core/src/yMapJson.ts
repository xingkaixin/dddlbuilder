import * as Y from 'yjs';
import { stableStringify } from './stableStringify';

export type JsonRecord = Record<string, unknown>;

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

export const syncStringArray = (array: Y.Array<string>, values: string[]) => {
  const current = array.toArray();
  if (
    current.length === values.length &&
    current.every((value, index) => value === values[index])
  ) {
    return;
  }
  array.delete(0, current.length);
  if (values.length > 0) {
    array.insert(0, values);
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
