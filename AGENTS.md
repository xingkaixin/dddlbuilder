## 文档

- pnpm monorepo。包职责、依赖方向和数据归属见 `docs/architecture.md`；`docs/` 入口为 `docs/README.md`，领域术语在 `CONTEXT.md`。
- 认证、额度账本和 AI 请求链路的不变量见 `docs/modules/account-and-ai.md`；AI tracing 与日志查询见 `apps/worker/OBSERVABILITY.md`。
- 改动产品范围、模块边界或数据归属前，先读相关文档。改动与文档冲突时，在同一 PR 中更新文档或新增 ADR。

## 开发
- 添加依赖时，在目标 workspace 中运行 `pnpm add <package>`，或从仓库根目录运行 `pnpm --filter <workspace> add <package>`。添加到根 workspace 时使用 `pnpm add -w <package>`。不要手动编辑 `package.json`。
- 多个 workspace 共用的外部依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog` 中。复用已有条目时使用 `pnpm --filter <workspace> add <package>@catalog:`（开发依赖加 `-D`）；将依赖纳入 catalog 时使用 `pnpm add <package>@<版本范围> --save-catalog`。
- Cloudflare Worker 中的异步副作用（如 Telegram 通知、审计上报、异步写入、DO 异步执行与观察流）如果需要在请求返回后继续执行，必须挂到 `waitUntil`；不要只写 `void someAsyncTask()`，否则本地正常、线上可能因 Worker 提前结束而丢失。
- 格式化代码使用 `pnpm format`。

### 契约

- 跨网络的请求、响应和事件契约定义在 `packages/shared-types/src/` 的 Schema 中，类型从 Schema 推导。Worker 返回前校验，前端复用同一份解码器。历史数据兼容交给 `workspace-core` 的领域解码器，不在接口 Schema 中重复归一化。
- 文件分工：`aiContracts.ts`（AI 请求、注释与索引建议）、`aiGenerate.ts`（生成表结构）、`ddlReview.ts`（DDL 审查）、`aiStream.ts`（NDJSON 事件）、`apiContracts.ts`（SQL 解析、分享、workspace）、`accountContracts.ts`（账户、额度、管理，经 `shared-types/api` 导出）。
- 字段引用、建议编号、字段身份和方言规则等业务规则留在 Worker 或业务层，不放进 Schema。
- NDJSON 事件 Schema 只校验单帧；终止顺序、字节分片和取消由流读取器负责。
- 管理请求先校验再执行副作用。账本时间在网络层保持字符串，用户端解码后转换为毫秒。

### Effect 与 AI 执行

- AI 执行使用 pi-durable 内置 Conversation/GenerationTask。禁止再建自定义 Task 或并行 SDK 执行循环；SDK 重试保持关闭。
- Effect v4 只用于 HTTP 鉴权、配置、Schema 与旧用量回收边界。`runPromise` 仅允许在 HTTP、DO 或 Cron 适配入口；不将请求身份、bindings 或可变计费状态放入全局 Runtime。
- 用量回收的扫描、状态查询和延期写入使用 `@effect/sql-d1`；余额结算继续使用原生 D1 batch、触发器和持久化幂等机制。
- 日志和 span 属性禁止包含 SQL、提示词、响应正文和密钥。
- 时间相关的 Effect 测试使用 `effect/testing/TestClock`；服务替换使用 Layer。

## 验证
- 测试优先保护核心业务规则、数据完整性、权限隔离及真实故障回归；不为提高覆盖率补齐普通赋值、组件样式或第三方库行为。
- 同一业务规则优先在所属模块验证。跨层测试应保护额外的集成行为，避免重复枚举底层函数的输入输出。
- CI 每次执行一轮测试；`pnpm test` 包含脚本和 lint 规则测试。需要覆盖率报告时手动运行 `pnpm test:coverage`，Web 和 Worker 不设全包覆盖率门槛。
- 按改动范围选择验证命令：
  - lint：`pnpm lint`
  - 类型检查：`pnpm typecheck`
  - 单元测试：`pnpm test`
- 涉及用户界面或交互逻辑变更时，运行 `pnpm run test:e2e`。
