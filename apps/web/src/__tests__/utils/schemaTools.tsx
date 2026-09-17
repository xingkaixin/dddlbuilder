import type { ReactElement } from 'react';
import { vi } from 'vitest';
import * as Schema from 'effect/Schema';
import { SqlParser } from '@ddlbuilder/ddl-core/parser';
import { AuthSessionProvider } from '@/auth/AuthSessionProvider';
import { render } from './test-utils';
import { setupFakeIndexedDB } from './fakeIndexedDb';

const ParseRequest = Schema.Struct({
  sql: Schema.String,
  dbType: Schema.Literals(['mysql', 'postgresql']),
  strict: Schema.Boolean,
});

export function setupSchemaTools() {
  vi.restoreAllMocks();
  setupFakeIndexedDB();
  const storage = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
    storage.set(key, value);
  });
  vi.mocked(localStorage.removeItem).mockImplementation((key) => {
    storage.delete(key);
  });
  vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
  const blobs = new Map<string, Blob>();
  const downloads: { name: string; blob: Blob }[] = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    if (!(blob instanceof Blob)) throw new Error('Expected a download Blob');
    const url = `blob:test-${blobs.size}`;
    blobs.set(url, blob);

    return url;
  };

  URL.revokeObjectURL = () => {};

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    function (this: HTMLAnchorElement) {
      const blob = blobs.get(this.href);

      if (blob) downloads.push({ name: this.download, blob });
    },
  );

  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);

    if (path === '/api/me') return Response.json({ signedIn: false, user: null });

    if (path === '/api/parse-multi-sql') {
      const request = Schema.decodeUnknownSync(ParseRequest)(JSON.parse(String(init?.body)));

      return Response.json(
        await new SqlParser().parseMultiAsync(request.sql, request.dbType, request.strict),
      );
    }

    throw new Error(`Unexpected request: ${path}`);
  });

  return {
    fetch,
    storage,
    downloads,
    async lastDownload() {
      const file = downloads.at(-1);

      if (!file) throw new Error('No file downloaded');

      return {
        name: file.name,
        text: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file.blob);
        }),
      };
    },
  };
}

export const renderTool = (element: ReactElement) =>
  render(<AuthSessionProvider>{element}</AuthSessionProvider>);

export function jsonFile(value: string, name = 'snapshot.json') {
  const file = new File([value], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { configurable: true, value: async () => value });

  return file;
}
