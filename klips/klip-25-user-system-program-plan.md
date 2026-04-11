---
Author: "Codex"
Updated: 2026-04-11
Status: Draft
---

# KLIP-25 用户系统总体方案与执行编排

## 现状结论

- 当前产品没有“注册用户”概念。前端主工作区仍是匿名本地态，核心恢复入口在 `src/hooks/usePersistedState.ts`。
- 当前本地工作区基于 IndexedDB，包含 `workspace_global_draft`、`workspace_saved_drafts`、`workspace_session` 三类 workspace store，定义在 `src/utils/savedTablesDb.ts`，读写封装在 `src/utils/workspaceStateDb.ts`。
- 当前应用还持久化 `saved_tables`、`table_versions`、`review_history`、`field_templates`、`table_folders` 等 IndexedDB store，定义在 `src/utils/savedTablesDb.ts`。
- 当前 AI 能力入口已经存在于前端与 Worker 之间：
  - 前端调用：`src/services/aiGenerateTableService.ts`、`src/services/reviewService.ts`
  - Worker 路由：`server-api/routes/generateTable.ts`、`server-api/routes/review.ts`、`server-api/routes/explain.ts`
- 当前 AI 治理不是“用户级”，而是“IP + UA 指纹限流 + 服务级预算”：
  - 计数与预算逻辑在 `server-api/openaiControl.ts`
  - Worker 绑定当前只有 `SHARE_KV`、`RATE_LIMIT_KV`，见 `wrangler.toml` 和 `server-api/lib/context.ts`
- 当前代码里的 `auth` 语义是 DDL 授权对象，不是用户身份系统。相关状态在 `src/stores/authStore.ts` 与 `PersistedState.authObjects`。

## 背景

`XING-104` 的问题本质不是“加登录框”，而是为现有匿名本地产品补一条新的服务端主链：

- 用户身份
- 用户数据归属
- 用户额度账户
- AI 调用扣减与审计
- 前端用户态表达

如果把这些内容写在一个大文档里，后续实现时仍会重新拆分边界。反过来，如果只写 sub-issue 文档，又会丢失跨 issue 约束、依赖顺序和全局验收标准。因此本次采用“总 KLIP + 每个 sub-issue 一个 KLIP”的双层结构。

## 目标

- 为 `XING-104` 建立一个可执行的文档集，覆盖 `XING-113` 到 `XING-119`
- 固定用户系统的全局边界，避免各 sub-issue 在实现阶段再次做产品决策
- 固定推荐实施顺序，减少返工
- 固定跨 issue 共识：匿名态策略、额度模型、Cloudflare 资源职责、前后端集成边界

## 非目标

- 本文档不展开 D1 表字段逐列定义
- 本文档不展开 API JSON schema 与错误码全集
- 本文档不替代任何单个 sub-issue 的实现设计
- 本期不覆盖支付接入、订阅套餐、多端实时同步、服务端匿名账号

## 子 issue 拆分

| Issue | 主题 | 文档角色 | 输入 | 输出 |
|---|---|---|---|---|
| XING-113 | 认证提供方、数据模型、CF 资源边界 | 架构定稿 | 现有前后端架构、Cloudflare 运行约束 | 技术选型、数据模型草案、环境策略 |
| XING-114 | D1 schema、Wrangler 绑定、联调脚手架 | 底座建设 | XING-113 的资源与模型结论 | 可运行的本地/远端开发底座 |
| XING-115 | 注册/登录/会话校验 | 身份主链 | XING-113/114 的选型与底座 | 用户注册登录闭环 |
| XING-116 | 匿名工作区迁移到注册用户 | 数据迁移 | 现有 IndexedDB 边界、云端用户主链 | 首次认领、冲突处理、失败恢复 |
| XING-117 | AI 点数账户、赠送额度与账本 | 额度主链 | 用户身份、D1 底座 | 可审计额度模型与查询接口 |
| XING-118 | AI 路由接入额度扣减与反滥用 | 治理与计费 | 身份主链、额度主链、现有 AI 路由 | 用户级 AI 鉴权、扣减、幂等 |
| XING-119 | 前端用户中心与 AI 门禁/额度展示 | 前端表达 | 上述后端能力与状态模型 | 用户态、额度态、门禁态可见可用 |

## 全局约束

### 匿名态边界

- 匿名用户保持“未登录 + 本地 IndexedDB 工作区”模型。
- 不引入服务端匿名账号。
- 原因：当前产品已天然以本地工作区运行。若匿名也服务端化，会额外引入匿名账号清理、冲突归并、滥用控制等复杂度，而这些不直接服务本期目标。

### 数据归属边界

- 首次注册或首次登录后的“认领”是一个明确动作，不做静默覆盖。
- 本期只解决“本地数据归属到用户”的问题，不做多设备实时同步。
- 迁移边界至少覆盖：
  - 当前激活 workspace session
  - 全局草稿
  - 保存表实体
  - 保存表草稿
- `review_history`、`table_versions`、`field_templates`、`table_folders` 是否迁移，必须在 `XING-116` 文档中显式决策。

### 额度边界

- 额度必须采用 ledger 模型，禁止 `users.remaining_credits -= x` 这种单字段扣减。
- 账本至少支持 `grant`、`consume`、`refund` 三类事件。
- 注册赠送额度视为一种 grant source。
- 未来接支付时，应仅新增 grant source，不推翻账本模型。

### Cloudflare 资源边界

- D1：用户主数据、身份映射、额度账户、额度账本、用量事件、工作区归属
- KV：短周期限流、幂等键、短期缓存、分享链接
- Turnstile：注册、登录、敏感 AI 调用防刷

### 安全与治理边界

- Turnstile 必须服务端校验，不能只做前端挂件。该要求与 Cloudflare 官方文档一致。[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- AI 调用需形成三层边界：
  - 服务级预算
  - 用户级额度
  - 风控限流兜底

## 建议实施顺序

推荐顺序：

1. `XING-113`
2. `XING-114`
3. `XING-115`
4. `XING-117`
5. `XING-118`
6. `XING-116`
7. `XING-119`

原因：

- `XING-113` 先定技术选型与资源边界，否则后续所有文档都漂浮
- `XING-114` 先铺底座，否则注册登录与账本设计无法落在真实迁移/联调流程上
- `XING-117` 要先于 `XING-118`，因为 AI 路由扣减必须先有可审计的额度模型
- `XING-116` 放在 `XING-115/117/118` 之后，避免迁移策略建立在未定型的用户主链之上
- `XING-119` 放在最后，因为前端表达依赖真实错误码、余额接口和迁移状态

## 对应文档

- `klips/klip-26-auth-provider-and-cf-boundaries.md`
- `klips/klip-27-user-system-infrastructure-d1-and-dev-scaffold.md`
- `klips/klip-28-user-auth-session-integration.md`
- `klips/klip-29-anonymous-workspace-migration.md`
- `klips/klip-30-credit-ledger-model.md`
- `klips/klip-31-ai-route-auth-and-credit-governance.md`
- `klips/klip-32-user-center-and-ai-gating.md`

## 总体验收标准

- [ ] `XING-113` 到 `XING-119` 的边界清晰，无重复决策
- [ ] 文档集能说明从匿名工作区到注册用户，再到 AI 调用扣减的完整主链
- [ ] 总文档能明确哪些能力是本期做、哪些明确不做
- [ ] 每个 sub-issue 都有独立可执行的输入、输出、失败路径和验收标准
- [ ] 推荐实施顺序与依赖关系明确，后续实现不再需要重新拆题

## 关键参考位置

- 本地工作区恢复：`src/hooks/usePersistedState.ts`
- workspace bootstrap：`src/hooks/workspacePersistence/bootstrap.ts`
- IndexedDB schema：`src/utils/savedTablesDb.ts`
- workspace 读写封装：`src/utils/workspaceStateDb.ts`
- 前端 AI generate 调用：`src/services/aiGenerateTableService.ts`
- 前端 AI 会话状态：`src/hooks/useAIGenerateTable.ts`
- 主工作区 UI：`src/components/App/index.tsx`
- Worker API 入口：`api/index.ts`
- Bun 本地入口：`server.ts`
- AI 治理：`server-api/openaiControl.ts`
- Cloudflare 绑定：`wrangler.toml`、`server-api/lib/context.ts`
