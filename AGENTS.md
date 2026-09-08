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

### Effect

- AI 请求链路使用 Effect v4。`apps/worker/server-api/lib/aiRoute.ts` 中的 `aiGovernance` 负责业务编排，`withAIGovernance` 负责 Hono 入口适配。路由回调与 `AISession` 命令返回 Effect，业务模块内不要调用 `runPromise`。
- `aiServices.ts` 中的 `AIConfiguration`、`AIProvider`、`AIUsage` 通过 Layer 按请求提供。不要将请求身份、绑定或可变计费状态放进全局 Runtime。数据库和 SDK 的 Promise 在适配层转换为 Effect。
- 可恢复失败使用类型化错误，现有 `DomainError` 保留其业务语义。数据库失败不能进入上游请求重试；程序缺陷保留为 defect，HTTP／流输出适配处再处理完整 Cause。
- `aiExecution.ts` 用 Scope 管理执行期限与取消。SDK 必须同时响应业务 AbortSignal 和 Effect 中断。D1 记账写入使用最小的不可中断区间，未启动的上游尝试需要撤销计数。
- 流响应有独立执行入口，承接请求 Effect 上下文，并将包含最终结算的完整 Promise 交给 `waitUntil`。不能因返回 Response 就关闭流的生命周期。新增有资源释放需求的 Layer 时，必须确保它覆盖整个流消费过程。
- 结算通过 `onExit` 执行，保留数据库中的幂等、结算意图和回收机制；Effect finalizer 不能替代持久化恢复。AI JSON 输出使用 `aiCompletion.ts` 的 Schema 解码。
- AI 请求及注释、索引建议的输出契约定义在 `packages/shared-types/src/aiContracts.ts`，类型从 Schema 推导。Worker 使用 `aiRequest.ts` 将请求解码错误映射为现有 API 错误码；前端复用共享输出解码器。字段引用、建议编号和按请求补齐注释等业务规则保留在 Worker。
- 时间相关的 Effect 测试使用 `effect/testing/TestClock`；服务替换使用 Layer。保留真实 D1、SDK 流和取消计费集成测试来验证适配层行为。

## 验证
- 按改动范围选择验证命令：
  - lint：`pnpm lint`
  - 类型检查：`pnpm typecheck`
  - 单元测试：`pnpm test`
- 涉及用户界面或交互逻辑变更时，运行 `pnpm run test:e2e`。
