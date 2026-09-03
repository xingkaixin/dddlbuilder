---
Author: "Agent"
Updated: 2026-04-12
Status: Complete
Origin: "XING-104 后续拆分"
---

# KLIP-35 管理员控制台

## 背景

当前用户系统已经从 Supabase 切换到 Better Auth + Resend + Cloudflare D1。仓库现状中：

- 登录态来自 Better Auth 的 `user` / `session` / `account` 表，见 `server-api/lib/authSchema.ts`
- 点数余额与流水存储在 `credit_accounts` / `credit_ledger`，见 `migrations/0002_better_auth_hard_cut.sql`
- `credit_ledger.source` 已支持 `manual_adjustment`，见 `server-api/lib/credits.ts`
- 仓库尚不存在管理员角色、后台入口或后台鉴权逻辑

这意味着管理员后台不能依附现有普通用户 session 顺手扩展，而要单独定义一条清晰、最小的管理入口。

## 目标

- 提供 `/admin` 后台入口
- 使用独立管理密码完成后台访问，不依赖普通用户登录
- 提供最小可用管理员能力：
  - 查看用户列表
  - 查看单用户余额、点数流水、usage 明细
  - 触发用户密码重置邮件
  - 禁用用户
  - 手动增加用户 credit

## 非目标

- 不做多管理员账号体系
- 不做 RBAC / 权限分级
- 不做复杂搜索、筛选、导出
- 不做直接设置明文密码或临时密码
- 不做普通用户端 `/admin` 复用登录

## 设计概览

### 鉴权模型

`/admin` 使用独立管理密码，不复用普通用户 session。

- `ADMIN_CONSOLE_PASSWORD` 保存管理员登录密码
- `ADMIN_SESSION_SECRET` 保存独立生成的高熵 session 签名密钥；缺失、少于 32 UTF-8 bytes 或与管理员密码相同时，管理员会话不可用
- 管理员登录成功后，服务端签发短期 HttpOnly cookie
- cookie 单独用于 `/api/admin/*`，与 Better Auth session 完全隔离
- 前端访问 `/admin` 时，未通过后台鉴权则显示密码输入页；通过后进入后台主界面

这样做的原因很直接：当前系统没有管理员身份源，也没有后台用户表。若硬把普通用户登录态扩成后台入口，只会把问题转移成“谁是管理员、如何授权、如何撤权”的新系统。

### 用户禁用语义

当前 Better Auth 主用户表为 `user`，旧迁移草案中的 `users.status` 已不再是实际认证来源。正式实现时需在 Better Auth 主链路上补充“disabled”状态来源，并在每次鉴权时拒绝 disabled 用户。

本 KLIP 先锁定产品语义：

- 被禁用用户不能继续访问业务 API
- 已存在 session 应在下一次请求时失效
- 管理员后台仍可查看该用户历史 credit/usage 数据

后续实现可采用独立 `admin_user_flags` 表或对 `user` 表补状态字段，但不能再依赖旧的 `users.status` 幻影结构。

### 密码重置语义

管理员触发“重置密码”时，不直接修改密码，只做一件事：

- 调用与现有忘记密码相同的 Better Auth / Resend 链路，向用户邮箱发送 reset link

这样不需要管理员接触用户密码，也不会引入临时密码分发问题。

## 服务端接口

后续实现固定以下接口边界：

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/admin/session` | 提交管理密码，创建后台 session |
| `DELETE` | `/api/admin/session` | 退出后台 |
| `GET` | `/api/admin/users` | 返回用户列表 |
| `GET` | `/api/admin/users/:userId` | 返回单用户详情 |
| `POST` | `/api/admin/users/:userId/reset-password` | 发送密码重置邮件 |
| `POST` | `/api/admin/users/:userId/disable` | 禁用用户 |
| `POST` | `/api/admin/users/:userId/credits` | 手动增加 credit |
| `GET` | `/api/admin/users/:userId/credits/ledger` | 查询 credit 流水 |
| `GET` | `/api/admin/users/:userId/usage-events` | 查询 usage 明细 |

## 数据边界

### 用户列表

用户基础信息来自 Better Auth `user` 表：

- `id`
- `name`
- `email`
- `email_verified`
- `created_at`
- `updated_at`

同时拼接：

- `credit_accounts.balance`
- 最近一次活跃时间
- disabled 状态

### Credit 手动调整

管理员加点必须复用现有 `applyCreditMutation()`：

- `kind = grant`
- `source = manual_adjustment`
- `idempotencyKey` 由后台生成
- `metadata` 中记录管理员操作来源

不新增第二套 credit 账务逻辑。

### Usage 明细

直接读取 `usage_events`：

- `route_key`
- `request_id`
- `estimated_tokens`
- `actual_total_tokens`
- `status`
- `error_code`
- `created_at`

## 前端形态

`/admin` 页面分两段：

1. 未鉴权：密码输入页
2. 已鉴权：管理控制台

控制台首版只需要：

- 用户列表页
- 用户详情侧栏或详情页
- “发送重置邮件”“禁用用户”“增加 credit” 三个操作入口

不做复杂仪表盘。

## 验收标准

- [ ] `/admin` 需要独立密码才能进入
- [ ] 普通用户登录态不能直接进入后台
- [ ] 管理员可查看用户列表与单用户详情
- [ ] 管理员可向用户发送密码重置邮件
- [ ] 管理员可禁用用户
- [ ] 管理员可给用户增加 credit，且流水记为 `manual_adjustment`
- [ ] 管理员可查看用户 credit 流水与 usage 明细

## 待实现前确认

- disabled 状态落在哪张表，且必须进入正式认证链路
- 管理员 session cookie 的签名、有效期与清理方式
- 后台操作是否需要审计表；若做，单独立 KLIP，不并入首版实现
