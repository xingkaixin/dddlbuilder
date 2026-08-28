import { describe, expect, it, vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import {
  appendWorkspaceYDocUpdates,
  compactWorkspaceYDocStorage,
  readWorkspaceYDocStorage,
  type WorkspaceYDocStoredMeta,
} from '../../lib/workspaceYDocStorage.js';
import { createDurableObjectState } from '../helpers/durableObjectState';

const meta = (overrides: Partial<WorkspaceYDocStoredMeta> = {}): WorkspaceYDocStoredMeta => ({
  workspaceId: 'ws-1',
  userId: 'user-1',
  schemaVersion: 1,
  nextSeq: 1,
  updateCount: 1,
  updateBytes: 3,
  updatedAt: 1,
  lastCompactedSeq: 0,
  lastCheckpointSeq: 0,
  ...overrides,
});
const largeBinary = () => new Uint8Array(2500000).fill(7);
const expectBinary = (actual: Uint8Array | null | undefined, expected: Uint8Array) => {
  expect(Buffer.from(actual ?? []).equals(Buffer.from(expected))).toBe(true);
};

describe('workspace binary storage', () => {
  it('reads legacy snapshots and update logs', async () => {
    const { state } = createDurableObjectState(
      new Map<string, unknown>([
        ['meta', meta()],
        ['snapshot', new Uint8Array([1, 2]).buffer],
        ['update:0000000000000001', new Uint8Array([3, 4])],
      ]),
    );
    const loaded = await readWorkspaceYDocStorage(state.storage);
    expect(loaded.snapshot).toEqual(new Uint8Array([1, 2]));
    expect([...loaded.updates.values()]).toEqual([new Uint8Array([3, 4])]);
    expect(loaded.meta).toEqual(meta());
  });

  it('round-trips large updates and snapshots without oversized stored values', async () => {
    const { state, store } = createDurableObjectState();
    const bytes = largeBinary();
    await appendWorkspaceYDocUpdates(state.storage, [{ seq: 1, update: bytes }], meta());
    const loaded = await readWorkspaceYDocStorage(state.storage);
    expect(loaded.updates.size).toBe(1);
    expectBinary(loaded.updates.values().next().value, bytes);
    const compactedMeta = meta({ updateCount: 0, updateBytes: 0, lastCompactedSeq: 1 });
    expect(await compactWorkspaceYDocStorage(state.storage, bytes, compactedMeta)).toBe(1);
    const compacted = await readWorkspaceYDocStorage(state.storage);
    expectBinary(compacted.snapshot, bytes);
    expect(compacted.updates.size).toBe(0);
    expect(compacted.meta).toEqual(compactedMeta);
    expect(
      [...store.values()].every(
        (value) => !(value instanceof Uint8Array) || value.byteLength < 2 * 1024 * 1024,
      ),
    ).toBe(true);

    const small = new Uint8Array([9]);
    await compactWorkspaceYDocStorage(state.storage, small, compactedMeta);
    expect((await readWorkspaceYDocStorage(state.storage)).snapshot).toEqual(small);
    expect([...store.keys()].some((key) => key.startsWith('chunk:'))).toBe(false);
  });

  it('preserves updates newer than the compacted snapshot', async () => {
    const { state } = createDurableObjectState();
    const snapshot = new Uint8Array([1]);
    const tail = new Uint8Array([2]);
    await appendWorkspaceYDocUpdates(state.storage, [{ seq: 1, update: snapshot }], meta());
    await appendWorkspaceYDocUpdates(
      state.storage,
      [{ seq: 2, update: tail }],
      meta({ nextSeq: 2 }),
    );
    await compactWorkspaceYDocStorage(
      state.storage,
      snapshot,
      meta({ nextSeq: 2, lastCompactedSeq: 1 }),
    );
    expect([...(await readWorkspaceYDocStorage(state.storage)).updates.values()]).toEqual([tail]);
  });

  it.each(['append', 'compact'])(
    'rolls back partial %s writes and allows a retry',
    async (operation) => {
      const { state, store } = createDurableObjectState();
      const bytes = largeBinary();
      await compactWorkspaceYDocStorage(state.storage, bytes, meta({ nextSeq: 0 }));
      await appendWorkspaceYDocUpdates(
        state.storage,
        [{ seq: 1, update: new Uint8Array([1, 2, 3]) }],
        meta(),
      );
      const before = new Map(store);
      const put = vi.mocked(state.storage.put as (key: string, value: unknown) => Promise<void>);
      const original = put.getMockImplementation();
      if (!original) throw new Error('Missing storage fixture');
      put.mockImplementation(async (key, value) => {
        if (key === (operation === 'append' ? 'chunk:update:0000000000000002:1' : 'snapshot')) {
          throw new Error('storage interrupted');
        }
        await original(key, value);
      });
      const persist = () =>
        operation === 'append'
          ? appendWorkspaceYDocUpdates(
              state.storage,
              [{ seq: 2, update: bytes }],
              meta({ nextSeq: 2 }),
            )
          : compactWorkspaceYDocStorage(state.storage, bytes, meta({ lastCompactedSeq: 1 }));
      await expect(persist()).rejects.toThrow('storage interrupted');
      expect(isDeepStrictEqual(store, before)).toBe(true);
      expectBinary((await readWorkspaceYDocStorage(state.storage)).snapshot, bytes);
      put.mockImplementation(original);
      await persist();
    },
  );

  it.each(['missing-chunk', 'invalid-length'])(
    'rejects a %s instead of loading partial state',
    async (corruption) => {
      const { state, store } = createDurableObjectState();
      await compactWorkspaceYDocStorage(state.storage, largeBinary(), meta());
      if (corruption === 'missing-chunk') store.delete('chunk:snapshot:0');
      else
        store.set('snapshot', {
          ...(store.get('snapshot') as object),
          byteLength: Number.MAX_SAFE_INTEGER,
        });
      await expect(readWorkspaceYDocStorage(state.storage)).rejects.toThrow(/workspace binary/);
    },
  );
});
