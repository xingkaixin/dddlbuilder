---
Author: "Codex"
Updated: 2026-04-11
Status: Complete
Origin: "XING-104"
---

# KLIP-27 用户系统基础设施：D1 schema、Wrangler 绑定与本地/远端联调脚手架

## 背景

当前仓库能跑 Worker，但还没有用户系统可依赖的基础设施：

- `wrangler.toml` 只有 `SHARE_KV`、`RATE_LIMIT_KV`
- `scripts/dev-worker.ts` 只负责 `build:wrangler-dev + wrangler dev`
- `package.json` 中没有 `migrate`、`seed`、`reset`、`inspect` 一类命令

因此 `XING-115` 之后的所有能力都缺少落地底座。

## 目标

- 为用户系统引入 D1 绑定
- 建立 migration 目录与首批 schema
- 提供本地默认 local D1 的联调方式
- 提供可选的 remote binding 预发联调方式
- 提供最小开发命令：migrate、seed、reset、inspect

## 非目标

- 本文不实现用户登录逻辑
- 本文不实现额度扣减逻辑
- 本文不实现前端用户中心

## 设计概览

### Wrangler 绑定调整

在 `wrangler.toml` 与对应 deploy/e2e 配置中新增：

- `USER_DB` D1 binding
- 预留 `preview_database_id`
- 允许在 staging 环境把 D1 / KV 切到 remote

建议结构：

```toml
[[d1_databases]]
binding = "USER_DB"
database_name = "ddlbuilder-user"
database_id = "..."
preview_database_id = "USER_DB"
```

### 类型定义调整

`server-api/lib/context.ts` 的 `ApiEnv.Bindings` 增加：

- `USER_DB: D1Database`
- 认证相关配置
- Turnstile 相关配置

确定采用的最小环境变量：

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `TURNSTILE_SECRET_KEY`
- `SIGNUP_BONUS_CREDITS`

### migration 目录

新增目录：

```text
migrations/
  0001_user_system_init.sql
  0002_credit_indexes.sql
```

V1 只要求：

- `users`
- `user_identities`
- `credit_accounts`
- `credit_ledger`
- `usage_events`
- `workspace_snapshots` 或等价云端工作区表
- `workspace_links`

并固定命名为：

- `workspace_snapshots`
- `workspace_links`

### 开发命令

建议在 `package.json` 增加：

- `db:migrate:local`
- `db:migrate:remote`
- `db:seed:local`
- `db:reset:local`
- `db:inspect:local`

命令设计原则：

- 本地默认 `--local`
- remote 命令显式命名，不允许默认打到远端
- reset 命令只允许本地数据库

### 脚手架落点

建议新增：

- `scripts/d1-migrate.ts`
- `scripts/d1-seed.ts`
- `scripts/d1-reset.ts`
- `scripts/d1-inspect.ts`

这些脚本只做一层封装，最终仍调用 Wrangler D1 命令，避免重复造轮子。

## 本地与远端联调策略

### 本地默认策略

- `wrangler dev` 本地执行 Worker
- D1 / KV 默认 local simulation
- 通过 `--persist-to` 或默认持久化目录保留本地数据

这与 Cloudflare 官方当前文档一致：本地执行与 binding 使用 local simulation 是默认模式。[Cloudflare Workers Local Development](https://developers.cloudflare.com/workers/local-development/)

### 远端联调策略

- 仅对指定 binding 开启 `remote = true`
- 只允许连接预发环境资源
- 禁止把生产 D1 / KV 暴露给默认开发命令

这与 Cloudflare 官方推荐的“本地执行 + per-binding remote connection”一致。[Supported bindings per development mode](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)

## 实施阶段

### Phase 1

- 新增 D1 binding
- 扩展 `ApiEnv`
- 建 migration 目录与初始化 schema

### Phase 2

- 增加 migrate / seed / reset / inspect 脚本
- 更新 README 的联调说明

### Phase 3

- 为测试环境准备独立配置
- 为 e2e 增加独立本地数据库生命周期

## 实现回写

- 已新增 `USER_DB` D1 binding，并同步到 `wrangler.toml`、`wrangler.deploy.toml`、`wrangler.e2e.toml`
- 已新增 `migrations/0001_user_system_init.sql`
- 已新增 `db:migrate:*`、`db:seed:*`、`db:reset:local`、`db:inspect:*` 脚本
- 已在 `server-api/lib/context.ts` 补齐 D1 与 auth 相关 bindings
- 已在 `README.md` 和 `.env.vars.example` 回填本地联调说明

## 验收标准

- [x] 本地可一键启动带 D1 绑定的 Worker
- [x] 本地 schema 可重复初始化
- [x] 本地可 reset 并重新 seed
- [x] remote binding 只能显式连接预发资源
- [x] `server-api/lib/context.ts` 能正确暴露 D1 与新增配置
- [x] README 补齐最小开发与联调流程

## 关键参考位置

- `wrangler.toml`
- `server-api/lib/context.ts`
- `scripts/dev-worker.ts`
- `package.json`
- `api/index.ts`
- `server.ts`

## 已决策约定

- 不新增 `wrangler.local.toml` / `wrangler.staging.toml`，统一使用 `wrangler.toml + 显式命令参数`
- e2e 使用独立的本地持久化目录，不复用日常开发 D1 状态
