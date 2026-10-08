# 架构

## 运行时组成

```text
浏览器（apps/web）
  ├─ 编辑器：React + zustand；调用 ddl-core 在本地生成结果
  ├─ 本地存储：IndexedDB（匿名工作区、本地历史、字段标准库）、y-indexeddb（登录用户的 Y.Doc 副本）
  ├─ Web Worker：业务数据导入
  └─ WebMCP：向浏览器内的 AI Agent 注册读取、检查、修改表结构的工具
        │ HTTPS（cookie session）          │ WebSocket（Yjs 同步帧）
        ▼                                  ▼
Cloudflare Worker（apps/worker，Hono）
  ├─ /api：认证、SQL 解析、AI、额度、分享、发布、工作区、管理后台
  ├─ WorkspaceYDocDurableObject：每个工作区一个房间，持有 Y.Doc 的服务端权威副本
  ├─ D1（USER_DB）：账号与会话、额度账本、AI 用量、工作区归属与投影、发布内容、限流计数
  ├─ KV：只读分享（7 天过期）
  ├─ Cron：AI 用量回收、预算对账、治理数据清理
  ├─ 静态资源：Web 构建产物和 apps/docs 文档站
  └─ 外部服务：OpenAI 兼容模型接口、Resend 邮件、可选 Telegram 通知
```

## 包职责与依赖方向

| 包 | 负责 | 不负责 |
| --- | --- | --- |
| `shared-types` | 值类型、API 契约 Schema、无上下文的值级归一化 | IO；历史数据兼容解码 |
| `ddl-core` | DDL/DCL/ORM 生成、SQL 解析、diff 与 ALTER、数据库工具算法、业务数据导入计算 | 浏览器 API、Worker bindings、存储 |
| `workspace-core` | Workspace Document 模型、编解码与校验、同步帧、快照归一化与合并、历史数据解码、内容哈希 | 存储与传输 |
| `user-db` | D1 迁移与种子 SQL、认证表的 Drizzle schema | 业务查询 |
| `web` | UI、交互状态、浏览器存储、同步客户端 | 需要密钥、跨用户状态或服务端权威的逻辑 |
| `worker` | 认证、计费、AI 调用、同步权威、发布与分享、持久化 | 表结构生成规则（复用 `ddl-core`） |

依赖只能从应用指向包，包之间只依赖 `shared-types`：

```text
web    → ddl-core, workspace-core, shared-types
worker → ddl-core, workspace-core, user-db, shared-types
ddl-core, workspace-core → shared-types
```

共享包不访问网络、存储、DOM 或 Worker bindings。

## 数据归属

| 数据 | 权威位置 | 其他副本 |
| --- | --- | --- |
| 匿名用户的工作区 | 浏览器 IndexedDB | 无 |
| 登录用户的工作区 | 该工作区的 Durable Object 存储 | 浏览器 Y.Doc 与 y-indexeddb；D1 `workspace_entities` 投影 |
| 编辑会话（激活标签、当前来源） | 浏览器本地 | 不同步 |
| 表版本历史、评审历史 | 浏览器 IndexedDB | 不同步 |
| 字段标准库 | 浏览器 IndexedDB | 字段上的标准引用随表同步 |
| 业务数据导入的记录 | Web Worker 内存 | 不持久化；列映射配置存 localStorage |
| 工作区归属 | D1 `workspaces` | 无 |
| 账号与会话 | D1（Better Auth 表） | 无 |
| 额度 | D1 `credit_ledger` | `credit_accounts.balance` 投影 |
| AI 用量 | D1 `usage_events` | 无 |
| 项目文档与变更提案 | D1 `schema_publications` | 无 |
| 只读分享 | KV | 无 |

## 跨模块原则

1. 确定性计算放在共享包，运行时 IO 留在应用。新增规则先判断是否依赖运行时：不依赖就放进对应的包，让 Web 和 Worker 使用同一份实现。
2. 契约只有一个来源。跨网络的请求和响应用 `shared-types` 中的 Schema 定义，类型由 Schema 推导；Worker 返回前校验，前端用同一个解码器。历史数据兼容交给 `workspace-core` 的领域解码器，不在接口 Schema 中重复。
3. 计算默认在浏览器完成。只有需要密钥、跨用户状态或服务端权威的能力放在 Worker：AI、计费、同步权威、发布、分享。SQL 解析目前也走 Worker 接口，浏览器不打包解析器。
4. 一致性由持久化约束保证。额度变化只通过插入账本记录完成；幂等键、结算意图、工作区权威副本都持久化。应用层的重试和 finalizer 不能替代这些约束。
5. 访问控制在每个服务端入口执行。HTTP 路由和 Durable Object 都以 D1 中的会话和归属为准；会话被撤销时主动断开同步连接。
6. 失败要可见。生成器无法安全处理时输出人工处理提示；启动读取失败进入可重试的错误态，不用空数据继续；额度响应校验失败不能当作余额 0。
7. Worker 中请求返回后仍需执行的异步工作必须挂到 `waitUntil`。

## 工程基础

- pnpm workspace + Turbo；多个 workspace 共用的依赖版本放在 `pnpm-workspace.yaml` 的 `catalog`。
- 部署使用 `cf` CLI 和 `apps/worker/cloudflare.config.ts`，分 `development`、`production`、`e2e` 三个 mode。部署前记录 D1 Time Travel 恢复点，再执行远程迁移。
- 测试与验证策略见 `AGENTS.md`。
