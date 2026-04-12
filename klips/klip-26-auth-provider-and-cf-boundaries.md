---
Author: "Codex"
Updated: 2026-04-11
Status: Complete
Origin: "XING-104"
---

# KLIP-26 用户系统方案定稿：认证提供方、数据模型与 Cloudflare 资源边界

## 现状结论

- 当前仓库是 React + Hono + Cloudflare Workers 双入口架构：
  - Worker 入口：`api/index.ts`
  - Bun 本地桥接入口：`server.ts`
- 当前 Worker 绑定只有 `SHARE_KV` 与 `RATE_LIMIT_KV`，没有 D1，见 `wrangler.toml` 与 `server-api/lib/context.ts`。
- 当前 AI 路由只有 `explain`、`review`、`generate-table` 三类，统一注册于 `api/index.ts`。
- 当前 AI 治理使用 `server-api/openaiControl.ts` 中的：
  - `IP + UA` 指纹限流
  - 服务级日预算
  - KV / memory 计数回退
- 当前前端可直接打开 AI 入口：`src/components/App/index.tsx` 中挂载 `AIGenerateDialog`、Review 相关动作，但没有用户登录态前置。

## 背景

`XING-104` 的首要风险不是编码，而是系统边界未定：

- 认证由谁提供
- Worker 如何识别 app user
- D1 / KV / Turnstile 各做什么
- 用户与额度数据如何建模
- 本地开发如何联调而不污染生产

如果这些问题不先定稿，后续 `XING-114` 到 `XING-119` 都会在不同 issue 里重复决策。

## 目标

- 确定认证方案
- 固定 Cloudflare 资源职责
- 给出用户系统核心数据模型草案
- 固定本地开发、预发联调、线上部署的环境策略
- 固定额度模型口径，为后续 `XING-117`、`XING-118` 提供统一基础

## 非目标

- 本文不实现 migration SQL
- 本文不定义完整 API request/response schema
- 本文不展开前端页面结构
- 本期不覆盖支付与订阅

## 评估维度

| 维度 | 说明 |
|---|---|
| 与现有架构的贴合度 | 是否适配 React + Vite 前端、Hono Worker 后端 |
| Worker 集成复杂度 | Worker 侧 session/JWT 校验是否可落地 |
| 前端接入成本 | 是否需要大规模改造现有 UI 结构 |
| 数据所有权清晰度 | 能否稳定映射到 app user id |
| 后续扩展性 | 是否方便接用户中心、额度、付费 |
| 滥用控制 | 是否适合接 Turnstile 与服务端校验 |

## 评估结果

### 方案 A：自建密码体系

结论：不采用。

原因：

- 需要自行处理密码存储、重置、邮件链路、会话管理、风控与审计
- 对当前项目体量来说，安全负担显著高于业务收益
- 本期目标是补齐用户主链，不是建设认证基础设施

### 方案 B：Auth.js

结论：不作为本期首选。

依据与判断：

- Auth.js 官方首页当前主要展示 Next.js、SvelteKit、Express、Qwik 等接入方式，没有针对当前“React + Vite 前端 + Hono Worker 后端”的一体化官方路径；这是基于官方文档目录结构得出的判断。[Auth.js](https://authjs.dev/)
- Auth.js 本身更偏“认证框架/适配层”，不是完整托管用户系统。对本项目而言，仍需自行解决较多 Worker 侧会话托管、邮件/OAuth 配置、管理控制台等问题。

### 方案 C：Clerk

结论：可行，但不作为本期首选。

依据与判断：

- Clerk 官方文档对 React + Vite 前端接入很成熟，提供 `@clerk/react` 与预制 UI 组件。[Clerk React Quickstart](https://clerk.com/docs/react/getting-started/quickstart)
- 但从官方文档结构看，当前核心优势集中在前端 SDK 与 Clerk 托管的用户管理体验；对本项目这种“自有 Hono Worker + D1 + 自定义额度账本”的服务端主链，后端接入与用户映射仍需额外设计。
- 因此 Clerk 的前端体验很强，但对本期最关键的”Worker 原生整合 + 用户主数据归属 + 自有账本”优势不如 Better Auth 明显。

### 方案 D：Better Auth + Resend + D1

结论：本期推荐采用。

依据：

- Better Auth 原生支持 Cloudflare Workers 运行，内置 email + password、邮箱验证、密码重置等完整认证流程。[Better Auth](https://www.better-auth.com/)
- 通过 `@better-auth/drizzle-adapter` 直接对接 D1，无需外部认证服务依赖，所有用户与会话数据完全自主可控。
- Session 以 HTTP-only cookie 形式存储，对应 D1 `session` 表，Worker 直接校验 cookie 有效性，无需额外 JWT 解析或外部身份映射。
- 邮件发送集成 Resend，职责清晰：Better Auth 负责认证逻辑，Resend 负责邮件投递，D1 负责数据持久化。
- 对当前项目而言，Better Auth 运行在 Worker 内部，应用主数据、额度账本、工作区归属全部统一在 Cloudflare D1，不存在跨服务依赖。

## 最终建议

### 认证方案

- 本期使用 Better Auth 作为认证核心，运行在 Cloudflare Workers
- 邮件发送使用 Resend
- 首个正式登录方式使用 email + password，配套邮箱验证与密码重置
- 后续可追加 OAuth，但不阻塞当前用户系统主链

### 核心理由

- 对本期而言，需要的是“稳定身份 + 可校验 JWT + 低集成成本”，不是自建认证能力
- 使用 Better Auth 管理身份与会话，运行在 Cloudflare Worker 内部，所有数据存储在 D1，职责边界清晰
- 可以避免在本期引入服务端匿名账号

## 目标态设计

### Cloudflare 资源职责

| 资源 | 职责 | 不承担的职责 |
|---|---|---|
| D1 | `users`、`user_identities`、`credit_accounts`、`credit_ledger`、`usage_events`、`workspace_links`、云端工作区元数据 | 高频短 TTL 计数、分享链接缓存 |
| KV | 分享链接、IP/UA 限流、幂等键、短期风控缓存 | 用户主数据、额度真账本 |
| Turnstile | 注册、登录、敏感 AI 调用的人机校验 | 用户会话、长期额度 |

### 用户系统核心数据模型

建议最小模型如下：

```text
user                          -- Better Auth 内置表
  id
  name
  email
  email_verified
  image
  created_at
  updated_at

session                       -- Better Auth 内置表，HTTP-only cookie 会话
  id
  expires_at
  token
  ip_address
  user_agent
  user_id
  created_at
  updated_at

account                       -- Better Auth 内置表，凭证与 OAuth provider
  id
  account_id
  provider_id
  user_id
  access_token
  refresh_token
  password
  created_at
  updated_at

verification                  -- Better Auth 内置表，邮箱验证与密码重置令牌
  id
  identifier
  value
  expires_at
  created_at
  updated_at

credit_accounts
  user_id
  balance
  version
  updated_at

credit_ledger
  id
  user_id
  kind            -- grant / consume / refund
  source          -- signup_bonus / ai_generate / ai_review / ai_explain / manual_adjustment
  amount
  balance_after
  idempotency_key
  related_usage_id
  metadata_json
  created_at

usage_events
  id
  user_id
  route_key
  request_id
  estimated_tokens
  actual_total_tokens
  status
  error_code
  created_at

workspace_snapshots
  id
  user_id
  kind            -- global_draft / saved_table / saved_draft
  normalized_name
  payload_json
  source_updated_at
  created_at
  updated_at

workspace_links
  id
  user_id
  local_fingerprint
  migration_status
  last_idempotency_key
  migrated_at
```

说明：

- `user`、`session`、`account`、`verification` 为 Better Auth 内置表，通过 Drizzle adapter 管理
- `session` 存储 HTTP-only cookie 对应的会话，Worker 通过 cookie 中的 token 直接查 D1 校验
- `credit_accounts.balance` 是缓存余额，不是真实账本来源
- 真实可审计来源是 `credit_ledger`
- `version` 用于并发扣减时的乐观锁或 compare-and-swap
- `workspace_links` 只记录迁移归属与幂等关系
- 真正的云端工作区快照放在 `workspace_snapshots`

## 关键决策与约定

### 用户状态

- `active`
- `disabled`
- `deleted` 先不做物理删除，逻辑下线即可

### 登录方式

- V1：email + password
- V2：可选增加 OAuth
- 本期不接用户名密码登录

### 额度口径

- V1 采用“按请求估算预扣，按实际结果结算，多退少补”的口径
- 预扣失败直接拒绝请求
- 上游失败或中断时生成 `refund`
- 所有扣减链路必须带 `idempotency_key`

### 匿名态策略

- 保持真正未登录
- 不引入服务端匿名账号
- 原因：匿名工作区当前已经是本地态，引入服务端匿名账号会增加清理与滥用治理复杂度

## 环境策略

### 本地开发

- Worker 代码本地执行
- D1 / KV 默认使用 local simulation
- 必要时按 binding 切 remote
- 本地需要测试账号、最小 seed 数据、数据库 reset 能力

### 预发联调

- Worker 继续本地运行
- 仅在显式指定时连接 remote D1 / KV
- Turnstile 使用测试 site key / secret，不与生产混用

### 线上部署

- Cloudflare Worker 使用生产 D1 / KV
- 所有认证与会话数据通过 Better Auth + D1 管理
- 所有 user 主数据与额度数据以 D1 为准

## 实施后约束

- `XING-114` 必须按本文模型建最小 schema，不允许再改核心表职责
- `XING-115` 必须采用 Worker 校验 session cookie + D1 的模式，不允许把 app user 概念外包给外部认证服务
- `XING-117` 必须以 ledger 为事实源，不允许只保留余额字段
- `XING-116` 一期只迁移核心工作区数据，不把 `review_history`、`table_versions`、`field_templates`、`table_folders` 偷偷带入

## 实现回写

- `XING-114` 已按本文落地 `USER_DB`、migration、local/remote D1 脚手架
- `XING-115` 已按本文切换为 `Better Auth session cookie -> Worker -> D1 business tables` 的统一主键链路
- `XING-117` 已按本文落地 `credit_accounts + credit_ledger`，且 ledger 成为事实源

## 验收标准

- [x] 明确采用 Better Auth，且说明不选自建 / Auth.js / Clerk 作为本期主方案的理由
- [x] 明确 D1、KV、Turnstile 三者职责边界
- [x] 给出用户系统核心数据模型草案
- [x] 给出本地、预发、线上三套环境策略
- [x] 给出额度模型口径与并发一致性约束
- [x] 后续 `XING-114` 到 `XING-119` 可直接按本文推进

## 参考资料

- [Better Auth](https://www.better-auth.com/)
- [Better Auth Cloudflare Workers](https://www.better-auth.com/docs/integrations/cloudflare)
- [Resend](https://resend.com/docs)
- [Clerk React Quickstart](https://clerk.com/docs/react/getting-started/quickstart)
- [Auth.js](https://authjs.dev/)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare Workers Local Development](https://developers.cloudflare.com/workers/local-development/)
- [Cloudflare Remote Bindings](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)
