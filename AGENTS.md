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

## 文档

- `docs/` 记录产品目标与非目标、架构边界和各模块设计原则，入口为 `docs/README.md`；领域术语在 `CONTEXT.md`。
- 改动产品范围、模块边界或数据归属前，先读相关文档。改动与文档冲突时，在同一 PR 中更新文档或新增 ADR。

## 开发
- 添加依赖时，在目标 workspace 中运行 `pnpm add <package>`，或从仓库根目录运行 `pnpm --filter <workspace> add <package>`。添加到根 workspace 时使用 `pnpm add -w <package>`。不要手动编辑 `package.json`。
- 多个 workspace 共用的外部依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog` 中。复用已有条目时使用 `pnpm --filter <workspace> add <package>@catalog:`（开发依赖加 `-D`）；将依赖纳入 catalog 时使用 `pnpm add <package>@<版本范围> --save-catalog`。
- Cloudflare Worker 中的异步副作用（如 Telegram 通知、审计上报、异步写入）如果需要在请求返回后继续执行，必须挂到 `waitUntil`；不要只写 `void someAsyncTask()`，否则本地正常、线上可能因 Worker 提前结束而丢失。
- 格式化代码使用 `pnpm format`。

### Effect

- AI 执行使用 pi-durable 内置 Conversation/GenerationTask，状态在独立 `AIConversationDurableObject` 中。禁止再建自定义 Task 或并行 SDK 执行循环。SDK 重试关闭，恢复和重试都受持久化调用上限约束。
- Effect v4 用于 HTTP 鉴权、配置、Schema 与旧用量回收边界。`runPromise` 仅允许在 HTTP、DO 或 Cron 适配入口；不将请求身份、bindings 或可变计费状态放入全局 Runtime。
- `aiConversationUsage.ts` 在每次实际模型请求前鉴权、预留额度与预算。数据库失败不能触发上游重试。服务端操作身份、Submission requestId、物理调用 Usage Identity 必须区分。
- DO 用量凭据先持久化，再写 D1；结算保留原账本触发器、幂等键和结算意图。Alarm 与 Cron 补偿跨存储失败。旧用量回收器必须排除 `ai_call_attempts` 关联记录。
- 断开观察流不取消操作；显式停止和会话撤销才中断模型。DO 异步执行与观察流必须交给 `waitUntil`。共享输出 Schema 完整解码后才能成功，失败仍结算真实消耗。
- AI 请求及注释、索引建议的输出契约定义在 `packages/shared-types/src/aiContracts.ts`，类型从 Schema 推导。Worker 使用 `aiRequest.ts` 将请求解码错误映射为现有 API 错误码；前端复用共享输出解码器。字段引用、建议编号和按请求补齐注释等业务规则保留在 Worker。
- SQL 解析、分享和 workspace 响应契约定义在 `packages/shared-types/src/apiContracts.ts`，Worker 返回前校验，前端使用同一份解码器。SQL 解析结果和迁移响应类型从 Schema 推导。分享 state 和迁移快照仍交给 `workspace-core` 的领域解码器处理历史兼容，不在接口 Schema 中重复归一化。
- 账户、额度和管理接口契约定义在 `accountContracts.ts`，通过 `shared-types/api` 导出。管理请求先校验再执行副作用；账本时间在网络层保持字符串，用户端解码后转换为毫秒。额度响应校验失败不能回退为余额 0；认证库自身的协议仍由认证库处理。
- NDJSON 事件使用 `aiStream.ts` 的共享编解码器；事件 Schema 只校验单帧，终止顺序、字节分片和取消由流读取器负责。生成表结构使用 `aiGenerate.ts` 的 Schema 校验完整结果，预览复用条目守卫；字段身份和方言规则留在业务层。
- DDL 审查的类型由 `ddlReview.ts` 的 Schema 推导，兼容归一化通过 Schema 转换进入输出契约。`aiScenarios.ts` 在完成状态检查后、成功结算前校验输出；校验失败保留真实上游消耗。
- `aiConversationConfig.ts` 从当前 bindings 读取供应商、模型与 thinking，默认 Anthropic Haiku 5.5、thinking 关闭。只允许服务端配置。供应商结构化输出 Schema 保持简单，通过匹配的 Effect JSON codec 解码，再验证业务契约。
- `aiTracing.ts` 将请求和 Cron 的 Effect span 桥接到 Worker 原生 tracing。Conversation 日志按 operationId/conversationId 关联；恢复可能跨多个 invocation，不能声称整个持久化生命周期属于一个请求 span。日志和属性禁止包含 SQL、提示词、响应正文和密钥。查询方式见 `apps/worker/OBSERVABILITY.md`。
- 定时用量回收返回 Effect，Worker Cron 入口提供按任务创建的 `@effect/sql-d1` Layer，并将完整执行交给 `waitUntil`。回收扫描、状态查询和延期写入使用 SQL client；余额结算继续使用原生 D1 batch、触发器和持久化幂等机制。单条失败不能中断后续回收，延期失败保留原始结算错误。
- 时间相关的 Effect 测试使用 `effect/testing/TestClock`；服务替换使用 Layer。保留真实 D1、SDK 流和取消计费集成测试来验证适配层行为。

## 验证
- 测试优先保护核心业务规则、数据完整性、权限隔离及真实故障回归；不为提高覆盖率补齐普通赋值、组件样式或第三方库行为。
- 同一业务规则优先在所属模块验证。跨层测试应保护额外的集成行为，避免重复枚举底层函数的输入输出。
- CI 每次执行一轮测试；`pnpm test` 包含脚本和 lint 规则测试。需要覆盖率报告时手动运行 `pnpm test:coverage`，Web 和 Worker 不设全包覆盖率门槛。
- 按改动范围选择验证命令：
  - lint：`pnpm lint`
  - 类型检查：`pnpm typecheck`
  - 单元测试：`pnpm test`
- 涉及用户界面或交互逻辑变更时，运行 `pnpm run test:e2e`。
