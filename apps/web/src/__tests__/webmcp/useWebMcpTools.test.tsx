import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useWebMcpTools } from '@/webmcp/useWebMcpTools';

const createState = (): PersistedState => ({
  schemaName: 'public',
  tableName: 'orders',
  tableComment: '',
  dbType: 'postgresql',
  sqlFormatMode: 'compact',
  rows: [
    {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const execute = (tool: WebMCP.ModelContextTool, input: Record<string, unknown>) =>
  Promise.resolve(tool.execute(input, { signal: new AbortController().signal }));

describe('useWebMcpTools', () => {
  const registrations = new Map<string, WebMCP.ModelContextTool>();
  let originalModelContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    registrations.clear();
    originalModelContext = Object.getOwnPropertyDescriptor(document, 'modelContext');
    const modelContext = Object.assign(new EventTarget(), {
      ontoolchange: null,
      getTools: vi.fn(async () => []),
      registerTool: vi.fn(
        async (tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
          registrations.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => registrations.delete(tool.name), {
            once: true,
          });
        },
      ),
    });
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    });
  });

  afterEach(() => {
    if (originalModelContext) {
      Object.defineProperty(document, 'modelContext', originalModelContext);
    } else {
      Reflect.deleteProperty(document, 'modelContext');
    }
  });

  it('registers an anonymous workflow and applies a patch only after confirmation', async () => {
    const replaceState = vi.fn();
    const openAuthDialog = vi.fn();
    const hook = renderHook(() =>
      useWebMcpTools({
        authStatus: 'signed_out',
        openAuthDialog,
        hydrated: true,
        isShareView: false,
        source: { kind: 'draft', draftId: 'global' },
        state: createState(),
        generatedSql: 'CREATE TABLE orders (id bigint);',
        generatedDcl: '',
        generatedOrm: '',
        replaceState,
      }),
    );

    await waitFor(() => expect(registrations.size).toBe(8));
    const inspect = registrations.get('inspect_active_schema');
    const preview = registrations.get('preview_schema_patch');
    const apply = registrations.get('apply_schema_patch');
    if (!inspect || !preview || !apply) throw new Error('WebMCP tools are incomplete');

    const inspected = (await execute(inspect, { section: 'overview' })) as {
      baseSignature: string;
    };
    let previewed: unknown;
    await act(async () => {
      previewed = await execute(preview, {
        baseSignature: inspected.baseSignature,
        operations: [
          {
            id: 'add-status',
            kind: 'field.add',
            afterFieldId: 'field-id',
            field: { fieldName: 'status', fieldType: 'varchar(32)', nullable: false },
          },
        ],
      });
    });
    const changeSetId = (previewed as { changeSetId: string }).changeSetId;
    expect(hook.result.current.mode).toBe('preview');
    expect(replaceState).not.toHaveBeenCalled();

    let applyPromise: Promise<unknown> | undefined;
    act(() => {
      applyPromise = execute(apply, { changeSetId });
    });
    if (!applyPromise) throw new Error('Apply request did not start');
    await waitFor(() => expect(hook.result.current.mode).toBe('confirm'));
    act(() => hook.result.current.onConfirm());
    let applied: unknown;
    await act(async () => {
      applied = await applyPromise;
    });

    expect(applied).toEqual({ ok: true, status: 'applied', changeSetId });
    expect(replaceState).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({ fieldName: 'id' }),
          expect.objectContaining({ fieldName: 'status', fieldType: 'varchar(32)' }),
        ],
      }),
    );

    hook.unmount();
    expect(registrations.size).toBe(0);
  });
});
