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
| `@ddlbuilder/db` | `packages/db/` | Drizzle ORM schema、D1 迁移与种子 SQL，供 `worker` 和根目录 `scripts/d1-*` 共用 |
| `@ddlbuilder/shared-types` | `packages/shared-types/` | 跨 monorepo 共享的 TypeScript 类型定义 |
| `@ddlbuilder/tsconfig` | `packages/tsconfig/` | 共享的 TypeScript 配置预设 |

**依赖流向：**
- `apps/web` → `@ddlbuilder/ddl-core`、`@ddlbuilder/workspace-core`、`@ddlbuilder/shared-types`
- `apps/worker` → `@ddlbuilder/db`、`@ddlbuilder/workspace-core`、`@ddlbuilder/shared-types`
- `packages/ddl-core`、`packages/workspace-core` → `@ddlbuilder/shared-types`
- 多数 package dev 依赖 `@ddlbuilder/tsconfig`

## 开发
- 使用`pnpm add`,添加依赖，不要直接修改`packages.json`
- Cloudflare Worker 中的异步副作用（如 Telegram 通知、审计上报、异步写入）如果需要在请求返回后继续执行，必须挂到 `waitUntil`；不要只写 `void someAsyncTask()`，否则本地正常、线上可能因 Worker 提前结束而丢失。

## 测试
- lint 使用`pnpm lint`
- format 使用 `pnpm format`
- test 使用`pnpm test`

## E2E测试
- 如果设计到影响界面UI交互逻辑调整等，需要执行`pnpm run test:e2e`验证
