import { describe, expect, it, vi } from 'vitest';
import { createWebMcpTools, type WebMcpToolDependencies } from '@/webmcp/tools';

const createDependencies = (
  overrides: Partial<WebMcpToolDependencies> = {},
): WebMcpToolDependencies => ({
  authStatus: 'signed_out',
  readOnly: false,
  getAuthStatus: vi.fn(() => ({ ok: true })),
  startSignIn: vi.fn(() => ({ ok: true })),
  inspectSchema: vi.fn(async () => ({ ok: true })),
  lintSchema: vi.fn(() => ({ ok: true })),
  readOutput: vi.fn(() => ({ ok: true })),
  previewPatch: vi.fn(async () => ({ ok: true })),
  previewSqlImport: vi.fn(async () => ({ ok: true })),
  applyPatch: vi.fn(async () => ({ ok: true })),
  ...overrides,
});

const execute = (tool: WebMCP.ModelContextTool, input: Record<string, unknown> = {}) =>
  tool.execute(input, { signal: new AbortController().signal });

describe('WebMCP tool catalog', () => {
  it('offers sign-in only to signed-out browser sessions', () => {
    const signedOutNames = createWebMcpTools(createDependencies()).map((tool) => tool.name);
    const signedInNames = createWebMcpTools(createDependencies({ authStatus: 'signed_in' })).map(
      (tool) => tool.name,
    );

    expect(signedOutNames).toContain('start_sign_in');
    expect(signedInNames).not.toContain('start_sign_in');
    expect(signedInNames).toContain('inspect_active_schema');
  });

  it('marks document-derived read results as untrusted read-only content', () => {
    const tools = createWebMcpTools(createDependencies());
    const inspect = tools.find((tool) => tool.name === 'inspect_active_schema');
    const output = tools.find((tool) => tool.name === 'read_generated_output');

    expect(inspect?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(output?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
  });

  it('returns structured failures instead of leaking thrown errors', async () => {
    const tools = createWebMcpTools(
      createDependencies({
        inspectSchema: vi.fn(async () => {
          throw new Error('private runtime detail');
        }),
      }),
    );
    const inspect = tools.find((tool) => tool.name === 'inspect_active_schema');
    if (!inspect) throw new Error('inspect_active_schema is not registered');

    await expect(execute(inspect)).resolves.toEqual({
      ok: false,
      error: { code: 'TOOL_FAILED', message: 'Tool execution failed' },
    });
  });

  it('does not expose mutation tools in a read-only share', () => {
    const names = createWebMcpTools(createDependencies({ readOnly: true })).map(
      (tool) => tool.name,
    );

    expect(names).not.toContain('preview_schema_patch');
    expect(names).not.toContain('import_sql_preview');
    expect(names).not.toContain('apply_schema_patch');
    expect(names).not.toContain('start_sign_in');
  });

  it('passes browser cancellation to the apply flow', async () => {
    const applyPatch = vi.fn(async () => ({ ok: true }));
    const tools = createWebMcpTools(createDependencies({ applyPatch }));
    const apply = tools.find((tool) => tool.name === 'apply_schema_patch');
    const controller = new AbortController();

    await apply?.execute({ changeSetId: 'change-1' }, { signal: controller.signal });

    expect(applyPatch).toHaveBeenCalledWith({ changeSetId: 'change-1' }, controller.signal);
  });
});
