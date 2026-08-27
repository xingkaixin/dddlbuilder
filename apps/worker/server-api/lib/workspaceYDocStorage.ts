export type WorkspaceYDocStoredMeta = {
  workspaceId?: string;
  userId?: string;
  schemaVersion: number;
  nextSeq: number;
  updateCount: number;
  updateBytes: number;
  updatedAt: number;
  lastCompactedSeq: number;
  lastCheckpointSeq: number;
  compactCount?: number;
  checkpointFailedAt?: number;
};

type ChunkedBinary = { version: 1; chunks: number; byteLength: number };
type BinaryStorage = Pick<DurableObjectStorage, 'get' | 'put' | 'delete' | 'list'>;

export const WORKSPACE_YDOC_META_KEY = 'meta';
const SNAPSHOT_KEY = 'snapshot';
const UPDATE_PREFIX = 'update:';
const CHUNK_BYTES = 512 * 1024;

const updateKey = (seq: number) => {
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('Invalid workspace update sequence');
  return `${UPDATE_PREFIX}${seq.toString().padStart(16, '0')}`;
};
const chunkPrefix = (key: string) => `chunk:${key}:`;
const chunkKey = (key: string, index: number) => `${chunkPrefix(key)}${index}`;

const toBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
};

const readBinary = async (storage: BinaryStorage, key: string, value: unknown) => {
  const bytes = toBytes(value);
  if (bytes) return bytes;
  const manifest = value as Partial<ChunkedBinary> | null;
  if (
    !manifest ||
    manifest.version !== 1 ||
    !Number.isSafeInteger(manifest.chunks) ||
    Number(manifest.chunks) <= 0 ||
    !Number.isSafeInteger(manifest.byteLength) ||
    Number(manifest.byteLength) <= 0
  )
    throw new Error(`Invalid workspace binary manifest: ${key}`);

  const storedChunks = await storage.list<unknown>({ prefix: chunkPrefix(key) });
  if (storedChunks.size !== manifest.chunks)
    throw new Error(`Missing workspace binary chunks: ${key}`);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (let index = 0; index < storedChunks.size; index += 1) {
    const chunk = toBytes(storedChunks.get(chunkKey(key, index)));
    if (!chunk || chunk.byteLength === 0) throw new Error(`Invalid workspace binary chunk: ${key}`);
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  if (byteLength !== manifest.byteLength)
    throw new Error(`Invalid workspace binary length: ${key}`);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const writeBinary = async (storage: BinaryStorage, key: string, bytes: Uint8Array) => {
  if (bytes.byteLength <= CHUNK_BYTES) {
    await storage.put(key, bytes.slice());
    return;
  }
  const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
  for (let index = 0; index < chunks; index += 1) {
    await storage.put(
      chunkKey(key, index),
      bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES),
    );
  }
  await storage.put(key, {
    version: 1,
    chunks,
    byteLength: bytes.byteLength,
  } satisfies ChunkedBinary);
};

const deleteBinary = async (storage: BinaryStorage, key: string, value: unknown) => {
  if (!toBytes(value)) {
    const chunks = await storage.list({ prefix: chunkPrefix(key) });
    for (const chunk of chunks.keys()) await storage.delete(chunk);
  }
  await storage.delete(key);
};

export const readWorkspaceYDocStorage = async (storage: DurableObjectStorage) => {
  const [meta, snapshot, entries] = await Promise.all([
    storage.get<WorkspaceYDocStoredMeta>(WORKSPACE_YDOC_META_KEY),
    storage.get<unknown>(SNAPSHOT_KEY),
    storage.list<unknown>({ prefix: UPDATE_PREFIX }),
  ]);
  const updates = new Map<string, Uint8Array>();
  for (const [key, value] of entries) updates.set(key, await readBinary(storage, key, value));
  return {
    meta,
    snapshot: snapshot === undefined ? null : await readBinary(storage, SNAPSHOT_KEY, snapshot),
    updates,
  };
};

export const appendWorkspaceYDocUpdate = (
  storage: DurableObjectStorage,
  seq: number,
  update: Uint8Array,
  meta: WorkspaceYDocStoredMeta,
) =>
  storage.transaction(async (transaction) => {
    await writeBinary(transaction, updateKey(seq), update);
    await transaction.put(WORKSPACE_YDOC_META_KEY, meta);
  });

export const compactWorkspaceYDocStorage = (
  storage: DurableObjectStorage,
  snapshot: Uint8Array,
  meta: WorkspaceYDocStoredMeta,
) =>
  storage.transaction(async (transaction) => {
    const previous = await transaction.get<unknown>(SNAPSHOT_KEY);
    if (previous !== undefined) await deleteBinary(transaction, SNAPSHOT_KEY, previous);
    await writeBinary(transaction, SNAPSHOT_KEY, snapshot);
    const updates = await transaction.list<unknown>({ prefix: UPDATE_PREFIX });
    const throughKey = updateKey(meta.lastCompactedSeq);
    let deleted = 0;
    for (const [key, value] of updates) {
      if (key > throughKey) continue;
      await deleteBinary(transaction, key, value);
      deleted += 1;
    }
    await transaction.put(WORKSPACE_YDOC_META_KEY, meta);
    return deleted;
  });
