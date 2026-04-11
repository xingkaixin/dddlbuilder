---
Author: "Codex"
Updated: 2026-04-11
Status: Complete
Origin: "XING-104"
---

# KLIP-28 接入注册登录与会话校验

## 背景

当前产品前端没有用户登录态，Worker 也没有“当前 app user”概念。AI 和工作区行为都默认发生在匿名上下文里。

如果没有稳定的身份主链：

- `XING-116` 无法把本地工作区认领给谁
- `XING-117` 无法把额度账户挂到谁
- `XING-118` 无法判断 AI 请求该从谁扣减

## 目标

- 接入 Supabase Auth
- 支持 email magic link 注册 / 登录 / 登出
- Worker 能校验 session/JWT 并映射到 `users.id`
- 前端能恢复登录态、展示登出入口
- 注册、登录、敏感入口能接入 Turnstile

## 非目标

- 本期不支持用户名密码
- 本期不支持组织、团队、多租户
- 本期不做复杂的用户资料管理页

## 设计概览

### 前端集成

建议新增独立用户域状态，而不是把登录态揉进现有 `usePersistedState()`：

- `authClient.ts`：封装 Supabase Auth 客户端
- `useAuthSession()`：负责恢复 session、监听登录/登出
- `UserSessionProvider`：向 Header、AI 功能入口暴露登录态

前端最小状态：

```typescript
type UserSessionState = {
  status: 'loading' | 'signed_out' | 'signed_in';
  accessToken: string | null;
  externalUserId: string | null;
  appUserId: string | null;
  email: string | null;
};
```

### Worker 侧校验

新增认证中间件：

- 读取 `Authorization: Bearer <token>`
- 校验 JWT
- 解析外部身份 `sub`
- 在 D1 中查找或创建 `users` + `user_identities`
- 把 `appUserId` 注入 `c.var`

建议中间件分层：

1. `parseAuthToken`
2. `verifySupabaseJwt`
3. `resolveAppUser`
4. `requireUser`

### 会话恢复

- 前端刷新后通过 Supabase SDK 恢复会话
- Worker 不维护额外 session store，直接信任 JWT + 本地 identity 映射
- 登出只清前端认证状态，不影响本地匿名工作区

### Turnstile 接入点

V1 接入三个点：

- 注册
- magic link 登录发起
- 高频敏感 AI 调用的兜底校验

服务端校验规则：

- token 必须在 Worker 侧调用 Siteverify 校验
- 校验失败直接拒绝原请求

## 接口变化

### 新增 Worker 路由

- `GET /api/me`
  返回最小用户信息与 app user id
- `POST /api/auth/turnstile/verify`
  用于注册 / 登录前的人机校验

### `ApiEnv` / `Context` 变化

在 `server-api/lib/context.ts` 增加：

- `TURNSTILE_SECRET_KEY`
- 认证配置
- `Variables.currentUserId`

## 失败路径

- JWT 无效：返回 401
- 外部身份存在但本地用户禁用：返回 403
- Turnstile 校验失败：返回 400/403
- `users` / `user_identities` 创建失败：返回 500，并记录 request id

## 测试矩阵

- 未登录用户访问 `GET /api/me` 返回未登录
- 注册成功后能拿到 app user id
- 已登录刷新页面后能恢复 session
- 登出后前端状态恢复为 `signed_out`
- 被禁用用户登录后 Worker 拒绝敏感请求
- Turnstile token 缺失、过期、重复提交都被拒绝

## 实现回写

- 已落地 `GET /api/me`
- 已落地 `POST /api/auth/turnstile/verify`
- 已落地 Supabase magic link 登录、前端登录态恢复、Header 登录/登出入口
- 当前未实现的部分只剩“敏感 AI 调用接入 Turnstile”，该能力转入 `XING-118`

## 验收标准

- [x] 用户可完成注册 / 登录 / 登出闭环
- [x] Worker 能稳定识别当前用户并返回 app user id
- [x] 前端登录态切换正确
- [x] Header 或等价入口可展示登录态
- [x] Turnstile 以服务端校验方式接入

## 关键参考位置

- `api/index.ts`
- `server.ts`
- `src/components/App/index.tsx`
- `src/services/aiGenerateTableService.ts`
- `src/hooks/useAIGenerateTable.ts`
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## 已决策约定

- JWT 校验固定使用 `Supabase JWKS`
- 不新增 `POST /api/auth/exchange`
- `GET /api/me` 负责完成当前 token 对应的 app user resolve
