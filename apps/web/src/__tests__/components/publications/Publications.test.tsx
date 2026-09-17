import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Schema from 'effect/Schema';
import { cleanup, fireEvent, screen, waitFor } from '@/__tests__/utils/test-utils';
import { setupSchemaTools, renderTool } from '@/__tests__/utils/schemaTools';
import { PublishPanel } from '@/components/publications/PublishPanel';
import PublicationPage from '@/components/publications/PublicationPage';
import {
  PublicationWriteSchema,
  CommentWriteSchema,
  type Publication,
  type PublicationComment,
} from '@ddlbuilder/shared-types/api';
import type { PersistedState } from '@ddlbuilder/shared-types';

const table: PersistedState = {
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    { id: 'id', fieldName: 'id', fieldType: 'int', nullable: false, fieldComment: '用户标识' },
  ],
  indexes: [],
  authInput: '',
  authObjects: [],
  addCount: 1,
};
const document: Publication = {
  id: 'document-id',
  title: '项目文档',
  kind: 'document',
  visibility: 'link',
  revision: 1,
  createdAt: '2026-09-17T00:00:00Z',
  updatedAt: '2026-09-17T00:00:00Z',
  isOwner: true,
  content: { kind: 'document', tables: [table], standards: [] },
};
let harness: ReturnType<typeof setupSchemaTools>;
let record: Publication | null;
let comments: PublicationComment[];
let signedIn: boolean;
let conflict: boolean;
let unavailable: boolean;

beforeEach(() => {
  harness = setupSchemaTools();
  record = null;
  comments = [];
  signedIn = true;
  conflict = false;
  unavailable = false;
  harness.fetch.mockImplementation(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';

    if (path === '/api/me')
      return Response.json(
        signedIn
          ? {
              signedIn: true,
              user: {
                userId: 'owner',
                name: 'Owner',
                email: 'owner@example.com',
                emailVerified: true,
              },
            }
          : { signedIn: false, user: null },
      );
    if (path === '/api/workspaces') return Response.json({ workspaceId: 'workspace' });
    if (path === '/api/credits/balance')
      return Response.json({ userId: 'owner', balance: 0, version: 1 });
    if (path === '/api/publications' && method === 'GET')
      return Response.json(record ? [record] : []);
    if (path.endsWith('/comments') && method === 'GET') return Response.json(comments);

    if (path.endsWith('/comments') && method === 'POST') {
      const comment = Schema.decodeUnknownSync(CommentWriteSchema)(JSON.parse(String(init?.body)));
      comments = [
        ...comments,
        {
          ...comment,
          id: 'comment',
          author: 'Owner',
          resolved: false,
          createdAt: document.createdAt,
        },
      ];

      return Response.json({ success: true });
    }

    if (path.endsWith('/comments/comment') && method === 'PUT') {
      const state = Schema.decodeUnknownSync(Schema.Struct({ resolved: Schema.Boolean }))(
        JSON.parse(String(init?.body)),
      );
      comments = comments.map((comment) => ({ ...comment, resolved: state.resolved }));

      return Response.json({ success: true });
    }

    if (method === 'POST' || method === 'PUT') {
      if (conflict)
        return Response.json(
          { error: 'Publication changed; reload before saving', code: 'PUBLICATION_CONFLICT' },
          { status: 409 },
        );

      const write = Schema.decodeUnknownSync(PublicationWriteSchema)(
        JSON.parse(String(init?.body)),
      );
      record = {
        ...document,
        ...write,
        kind: write.content.kind,
        revision: (record?.revision ?? 0) + 1,
      };

      return Response.json(record);
    }

    if (method === 'DELETE') {
      record = null;

      return Response.json({ success: true });
    }

    if (unavailable || !record)
      return Response.json(
        { error: 'Publication not found', code: 'SHARE_NOT_FOUND' },
        { status: 404 },
      );

    return Response.json(record);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('publication authoring', () => {
  it('creates private content, republishes at the same URL and changes access with conflict recovery', async () => {
    renderTool(<PublishPanel content={document.content} title="初始标题" />);
    await screen.findByLabelText('访问范围');
    expect(screen.getByLabelText('访问范围')).toHaveValue('private');
    fireEvent.change(screen.getByLabelText('发布标题'), { target: { value: '业务字典' } });
    fireEvent.click(screen.getByRole('button', { name: '创建发布' }));
    await screen.findByRole('link', { name: '打开阅读页' });
    expect(record).toMatchObject({ title: '业务字典', visibility: 'private', revision: 1 });
    fireEvent.click(screen.getByRole('button', { name: '复制链接' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/publications/document-id'),
      ),
    );
    fireEvent.change(screen.getByLabelText('访问范围'), { target: { value: 'link' } });
    fireEvent.click(screen.getByRole('button', { name: '重新发布当前结构' }));
    await waitFor(() => expect(record).toMatchObject({ revision: 2, visibility: 'link' }));
    conflict = true;
    fireEvent.click(screen.getByRole('button', { name: '保存标题与访问范围' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Publication changed');
    conflict = false;
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('访问范围'), { target: { value: 'private' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标题与访问范围' }));
    await waitFor(() => expect(record).toMatchObject({ visibility: 'private', revision: 3 }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(record).toBeNull());
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '打开阅读页' })).not.toBeInTheDocument(),
    );
  });

  it('manages existing fixed proposals without offering to replace their snapshots', async () => {
    record = {
      ...document,
      kind: 'proposal',
      content: { kind: 'proposal', reason: '增加用户', before: [], after: [table], renames: [] },
    };
    renderTool(<PublishPanel content={record.content} title="" />);
    await screen.findByRole('option', { name: '项目文档 · v1' });
    fireEvent.change(screen.getByLabelText('已有发布'), { target: { value: document.id } });
    expect(screen.getByRole('button', { name: '重新发布当前结构' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存标题与访问范围' })).toBeEnabled();
  });
});

describe('publication reading', () => {
  it('reads a document anonymously, escapes text and recovers from a revoked link', async () => {
    signedIn = false;
    record = { ...document, title: '<script>alert(1)</script>', isOwner: false };
    unavailable = true;
    renderTool(<PublicationPage id={document.id} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('此发布不可访问');
    unavailable = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByRole('heading', { name: '<script>alert(1)</script>' });
    expect(screen.getByText('用户标识')).toBeVisible();
    expect(window.document.querySelector('script')).toBeNull();
  });

  it('posts and resolves comments against a fixed proposal, with report downloads', async () => {
    record = {
      ...document,
      kind: 'proposal',
      content: { kind: 'proposal', reason: '增加用户', before: [], after: [table], renames: [] },
    };
    renderTool(<PublicationPage id={document.id} />);
    await screen.findByLabelText('留言内容');
    fireEvent.change(screen.getByLabelText('对象位置（如 orders.amount，可留空）'), {
      target: { value: 'users.id' },
    });
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '<b>确认索引</b>' } });
    fireEvent.click(screen.getByRole('button', { name: '提交留言' }));
    await screen.findByText('<b>确认索引</b>');
    expect(screen.getByLabelText('留言内容')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '标记已处理' }));
    await screen.findByRole('button', { name: '重新打开' });
    fireEvent.click(screen.getByRole('button', { name: '重新打开' }));
    await screen.findByRole('button', { name: '标记已处理' });
    fireEvent.click(screen.getByRole('button', { name: '导出对比报告' }));
    expect((await harness.lastDownload()).text).toContain('users');
    fireEvent.click(screen.getByRole('button', { name: '导出迁移 SQL' }));
    expect((await harness.lastDownload()).text).toContain('CREATE TABLE');
  });

  it('requires sign-in for comments and handles malformed document snapshots', async () => {
    signedIn = false;
    record = {
      ...document,
      kind: 'proposal',
      isOwner: false,
      content: { kind: 'proposal', reason: '', before: [], after: [table], renames: [] },
    };
    const view = renderTool(<PublicationPage id={document.id} />);
    await screen.findByRole('link', { name: '返回工作区登录后再来留言' });
    expect(screen.queryByLabelText('留言内容')).not.toBeInTheDocument();
    view.unmount();
    record = { ...document, content: { kind: 'document', tables: [{}], standards: [] } };
    renderTool(<PublicationPage id={document.id} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('发布内容无效');
  });
});
