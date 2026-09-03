## 项目结构

这是一个 pnpm monorepo（`pnpm-workspace.yaml` 定义工作区）。

### Apps

| Package | 路径 | 说明 |
|---------|------|------|
| `@ddlbuilder/web` | `apps/web/` | 前端 Web 应用（React + Vite），主产品 UI |
| `@ddlbuilder/worker` | `apps/worker/` | Cloudflare Worker 后端 API，处理认证、AI 生成、邮件、数据持久化，并用 Durable Object（`WorkspaceYDocDurableObject`）承载 workspace 实时同步 |
| `@ddlbuilder/docs` | `apps/docs/` | VitePress 文档站点 |

### Packages

| Package | 路径 | 说明 |
|---------|------|------|
| `@ddlbuilder/ddl-core` | `packages/ddl-core/` | DDL/DCL 生成核心逻辑，按数据库方言分策略实现，另含表结构 diff 和 ORM 模型输出 |
| `@ddlbuilder/workspace-core` | `packages/workspace-core/` | workspace Y.Doc 的 CRDT 编解码（快照 ↔ Y.Doc 互转、初始化判定）和内容哈希，前后端共用同一份实现 |
| `@ddlbuilder/user-db` | `packages/db/` | `USER_DB` 的 Drizzle ORM schema、D1 迁移与种子 SQL，供 `worker` 和根目录 `scripts/d1-*` 共用 |
| `@ddlbuilder/shared-types` | `packages/shared-types/` | 跨 monorepo 共享的 TypeScript 类型定义 |
| `@ddlbuilder/tsconfig` | `packages/tsconfig/` | 共享的 TypeScript 配置预设 |

**主要依赖流向（以各 workspace 的 `package.json` 为准）：**
- `apps/web` → `@ddlbuilder/ddl-core`、`@ddlbuilder/workspace-core`、`@ddlbuilder/shared-types`
- `apps/worker` → `@ddlbuilder/ddl-core`、`@ddlbuilder/user-db`、`@ddlbuilder/workspace-core`、`@ddlbuilder/shared-types`
- `packages/ddl-core`、`packages/workspace-core` → `@ddlbuilder/shared-types`
- 多数 package dev 依赖 `@ddlbuilder/tsconfig`

## 开发
- 添加依赖时，在目标 workspace 中运行 `pnpm add <package>`，或从仓库根目录运行 `pnpm --filter <workspace> add <package>`。添加到根 workspace 时使用 `pnpm add -w <package>`。不要手动编辑 `package.json`。
- Cloudflare Worker 中的异步副作用（如 Telegram 通知、审计上报、异步写入）如果需要在请求返回后继续执行，必须挂到 `waitUntil`；不要只写 `void someAsyncTask()`，否则本地正常、线上可能因 Worker 提前结束而丢失。
- 格式化代码使用 `pnpm format`。

## 验证
- 按改动范围选择验证命令：
  - lint：`pnpm lint`
  - 类型检查：`pnpm typecheck`
  - 单元测试：`pnpm test`
- 涉及用户界面或交互逻辑变更时，运行 `pnpm run test:e2e`。
