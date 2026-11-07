## 项目定位

DDLBuilder（筑表师）是在浏览器中使用的数据库表结构设计工具，输出给人审阅和复制的 DDL、DCL 和 ORM 文本。不登录也能完成设计、导入、生成、只读分享和本地导出；登录只增加跨设备同步、发布和 AI。

## 硬约束

以下规则只看代码推断不出来。要改变其中任何一条，先在同一 PR 中更新括号里的文档或新增 ADR。

- 计算默认在浏览器完成。只有需要密钥、跨用户状态或服务端权威的能力放进 Worker。（`docs/architecture.md`）
- 业务数据记录和数据库凭据不离开浏览器。不连接用户数据库，不执行生成的 SQL，不输出可直接执行的跨方言迁移脚本。（`docs/product.md`）
- 工作区只属于单个用户，同步只服务于该用户的多台设备。不做多人协作和审批流。（`docs/product.md`）
- 生成器无法安全处理的变更输出 `-- Manual migration required`（ORM 为 `Manual mapping required`），不输出部分正确的 SQL，也不静默丢弃。方言以真实语法、保留字和长度限制为准，不用通用 SQL 近似。（`docs/modules/schema-engine.md`）
- 依赖只能从应用指向包，包之间只依赖 `shared-types`。共享包不访问网络、存储、DOM 或 Worker bindings；`design` 的动画格播放器是唯一例外。（`docs/architecture.md`、ADR 0005）
- 不静默覆盖用户数据。已初始化的 Workspace Document 即使为空也是权威，不能被旧数据替换；启动读取失败进入可重试的错误态，不用空数据继续。（`docs/modules/workspace-sync.md`）
- 额度变化只通过插入 `credit_ledger` 记录完成，应用层不直接更新余额。（ADR 0001）

## 新代码按新规则写

仓库里仍有旧写法，修改或新增代码时不要照抄：

- Web 状态归属（ADR 0004）：组件不用 `useEffect` 取数、把 props 或派生值镜像到 state、响应状态变化执行副作用。Worker API 和 IndexedDB 的异步读写用 TanStack Query，跨组件的客户端状态用 zustand，组件内状态用 `useReducer` 加判别联合。`useEffect` 只留在与外部系统同步的适配器中。
- 已放弃的方案不要恢复：手动快照上传下载、HTTP 增量同步（`docs/modules/workspace-sync.md`）；KV 限流与幂等键、`version` 乐观锁、Turnstile（`docs/modules/account-and-ai.md`）。

## 文档

pnpm monorepo，`docs/` 入口为 `docs/README.md`。改动前先读对应文档；改动与文档冲突时，在同一 PR 中更新文档或新增 ADR。

| 改动范围 | 先读 |
| --- | --- |
| 产品范围、新功能是否该做 | `docs/product.md` |
| 包边界、依赖方向、数据归属 | `docs/architecture.md`、`docs/adr/` |
| `ddl-core`、方言、生成器 | `docs/modules/schema-engine.md` |
| 工作区存储、同步、匿名数据迁入 | `docs/modules/workspace-sync.md` |
| 认证、额度、AI 请求链路、管理后台 | `docs/modules/account-and-ai.md` |
| AI tracing 与日志查询 | `apps/worker/OBSERVABILITY.md` |
| 图标 | `docs/design/icon-system.md` |
| 用户文档站 | `apps/docs/AGENTS.md` |

命名使用 `CONTEXT.md` 的领域术语，不用其中 _Avoid_ 列出的词。

## 开发
- 添加依赖时，在目标 workspace 中运行 `pnpm add <package>`，或从仓库根目录运行 `pnpm --filter <workspace> add <package>`。添加到根 workspace 时使用 `pnpm add -w <package>`。不要手动编辑 `package.json`。
- 多个 workspace 共用的外部依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog` 中。复用已有条目时使用 `pnpm --filter <workspace> add <package>@catalog:`（开发依赖加 `-D`）；将依赖纳入 catalog 时使用 `pnpm add <package>@<版本范围> --save-catalog`。
- 升级 `@earendil-works/pi-durable` 后不能直接回滚到旧代码：AI Conversation DO 内的 SQLite schema 只向前迁移。回滚前要排空进行中的操作并清理 DO。（`docs/modules/account-and-ai.md`）
- Cloudflare Worker 中的异步副作用（如 Telegram 通知、审计上报、异步写入、DO 异步执行与观察流）如果需要在请求返回后继续执行，必须挂到 `waitUntil`；不要只写 `void someAsyncTask()`，否则本地正常、线上可能因 Worker 提前结束而丢失。
- 格式化代码使用 `pnpm format`。

### 契约

- 跨网络的请求、响应和事件契约定义在 `packages/shared-types/src/` 的 Schema 中，按领域放进对应文件，类型从 Schema 推导。Worker 返回前校验，前端复用同一份解码器。历史数据兼容交给 `workspace-core` 的领域解码器，不在接口 Schema 中重复归一化。
- 字段引用、建议编号、字段身份和方言规则等业务规则留在 Worker 或业务层，不放进 Schema。
- NDJSON 事件 Schema 只校验单帧；终止顺序、字节分片和取消由流读取器负责。
- 管理请求先校验再执行副作用。账本时间在网络层保持字符串，用户端解码后转换为毫秒。

### Effect 与 AI 执行

- AI 执行使用 pi-durable 内置 Conversation/GenerationTask。禁止再建自定义 Task 或并行 SDK 执行循环；SDK 重试保持关闭。
- Effect v4 只用于 HTTP 鉴权、配置、Schema 与旧用量回收边界。`runPromise` 仅允许在 HTTP、DO 或 Cron 适配入口；不将请求身份、bindings 或可变计费状态放入全局 Runtime。
- 用量回收的扫描、状态查询和延期写入使用 `@effect/sql-d1`；余额结算继续使用原生 D1 batch、触发器和持久化幂等机制。
- 日志和 span 属性禁止包含 SQL、提示词、响应正文和密钥。
- Effect 测试中的服务替换使用 Layer。

## 验证
- 只保留能证明产品或业务假设的测试（假设被破坏时产品会走样、逻辑会出错），以及保护构建、打包、发布和迁移的测试。仅验证实现细节的测试不写：mock 调用、内部结构、渲染结构与样式、普通赋值、第三方库行为。
- 同一业务规则优先在所属模块验证。跨层测试应保护额外的集成行为，避免重复枚举底层函数的输入输出。
- CI 每次执行一轮测试；`pnpm test` 包含脚本测试。需要覆盖率报告时手动运行 `pnpm test:coverage`，Web 和 Worker 不设全包覆盖率门槛。
- 按改动范围选择验证命令：
  - lint：`pnpm lint`
  - 类型检查：`pnpm typecheck`
  - 单元测试：`pnpm test`
- 涉及用户界面或交互逻辑变更时，运行 `pnpm run test:e2e`。
