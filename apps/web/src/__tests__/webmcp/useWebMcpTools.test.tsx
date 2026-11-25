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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Tool inputs intentionally model untrusted browser payloads.
const execute = (tool: WebMCP.ModelContextTool, input: Record<string, unknown>) =>
  Promise.resolve(tool.execute(input, { signal: new AbortController().signal }));

describe('useWebMcpTools', () => {
  const registrations = new Map<string, WebMCP.ModelContextTool>();
  let registerToolMock: ReturnType<typeof vi.fn>;
  let waitForToolsUntilMock: ReturnType<typeof vi.fn>;
  let originalModelContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    registrations.clear();
    originalModelContext = Object.getOwnPropertyDescriptor(document, 'modelContext');

    registerToolMock = vi.fn(
      async (tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
        registrations.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => registrations.delete(tool.name), {
          once: true,
        });
      },
    );
    waitForToolsUntilMock = vi.fn();

    const modelContext = Object.assign(new EventTarget(), {
      ontoolchange: null,
      getTools: vi.fn(async () => []),
      registerTool: registerToolMock,
      waitForToolsUntil: waitForToolsUntilMock,
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
        getGeneratedOrm: () => '',
        replaceState,
      }),
    );

    await waitFor(() => expect(registrations.size).toBe(8));
    const inspect = registrations.get('inspect_active_schema');
    const preview = registrations.get('preview_schema_patch');
    const apply = registrations.get('apply_schema_patch');

    if (!inspect || !preview || !apply) throw new Error('WebMCP tools are incomplete');

    // SAFETY: The preceding tool execution is checked against the WebMCP result contract used by this scenario.
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
    // SAFETY: The preceding tool execution is checked against the WebMCP result contract used by this scenario.
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

  it('signals tool readiness via waitForToolsUntil and avoids re-registering when loading finishes signed in', async () => {
    const baseProps = {
      openAuthDialog: vi.fn(),
      hydrated: true,
      isShareView: false,
      source: { kind: 'draft', draftId: 'global' } as const,
      state: createState(),
      generatedSql: 'CREATE TABLE orders (id bigint);',
      generatedDcl: '',
      getGeneratedOrm: () => '',
      replaceState: vi.fn(),
    };

    const hook = renderHook(
      ({ authStatus }: { authStatus: 'loading' | 'signed_in' | 'signed_out' }) =>
        useWebMcpTools({ ...baseProps, authStatus }),
      { initialProps: { authStatus: 'loading' } },
    );

    expect(waitForToolsUntilMock).toHaveBeenCalledTimes(1);
    // SAFETY: Mock argument is the promise passed to waitForToolsUntil by useWebMcpTools.
    const readyPromise = waitForToolsUntilMock.mock.calls[0]?.[0] as Promise<void>;
    await readyPromise;

    expect(registrations.size).toBe(7);
    expect(registrations.has('start_sign_in')).toBe(false);
    const callsAfterInitial = registerToolMock.mock.calls.length;

    hook.rerender({ authStatus: 'signed_in' });
    await Promise.resolve();
    expect(registerToolMock.mock.calls.length).toBe(callsAfterInitial);
    expect(waitForToolsUntilMock).toHaveBeenCalledTimes(1);

    hook.rerender({ authStatus: 'signed_out' });
    await waitFor(() => expect(registrations.has('start_sign_in')).toBe(true));
    expect(waitForToolsUntilMock).toHaveBeenCalledTimes(2);

    hook.unmount();
  });
});
