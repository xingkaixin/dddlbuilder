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

describe('WebMCP tool catalog', () => {
  it('marks document-derived read results as untrusted read-only content', () => {
    const tools = createWebMcpTools(createDependencies());
    const inspect = tools.find((tool) => tool.name === 'inspect_active_schema');
    const output = tools.find((tool) => tool.name === 'read_generated_output');

    expect(inspect?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(output?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
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
});
