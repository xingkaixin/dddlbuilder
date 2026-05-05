---
Author: "Codex"
Updated: 2026-05-06
Status: Draft
Origin: "RD-301 / klip-37 / klip-38"
---

# klip-39-workspace-sync-authority-boundary

## 现状结论（代码校准）

- `WorkspaceYDocProvider` 在登录且有 `workspaceId` 后创建 `Y.Doc`，先等待 `y-indexeddb` 本地同步，再合并 IndexedDB legacy snapshot，最后连接 `/api/workspaces/:workspaceId/yjs`。证据：`apps/web/src/providers/WorkspaceYDocProvider.tsx`
- `WorkspaceYDocSyncClient` 使用 Yjs sync protocol 通过 WebSocket 交换 state vector 与 update。证据：`apps/web/src/services/workspaceYDocSyncClient.ts`
- `WorkspaceYDocDurableObject` 在 DO storage 中保存 Yjs update log 与 compacted snapshot，并通过 `getWebSockets()` 广播 update。证据：`apps/worker/server-api/lib/workspaceYDocDurableObject.ts`
- `workspace_entities` 仍承载 HTTP 增量同步、cursor、mutation 去重与 entity 级冲突检测。证据：`apps/worker/server-api/lib/workspaceEntities.ts`、`apps/web/src/services/workspaceIncrementalSyncService.ts`
- `usePersistedState`、`useSavedTables`、`useFolders` 在 Y.Doc 本地可用后把业务写入 Y.Doc；D1 outbox 只在 Y.Doc runtime 路径尚未激活时使用。证据：`apps/web/src/hooks/usePersistedState.ts`、`apps/web/src/hooks/useSavedTables.ts`、`apps/web/src/hooks/useFolders.ts`、`apps/web/src/services/workspaceYDocAuthority.ts`

## 背景

- 当前系统存在 Yjs/DO 实时路径与 D1 增量路径两套持久化机制。
- Cloudflare Durable Objects 的单实例串行执行模型适合作为 workspace room 的实时协调点。
- D1 适合账号归属、workspace 列表、查询 projection 与低频 checkpoint。
- 高频字段输入写入 D1 会放大单线程查询排队和 rows written 成本。
- 0.19.0 需要把运行时权威、恢复权威和迁移兼容层拆清楚。

## 目标

1. 明确 IndexedDB、Y.Doc、DO storage、D1 entities 的职责边界。
2. 将登录态 workspace 的启动顺序收敛为一个可测试策略。
3. 固定 `yDocReady` 后的 D1 策略：实体 outbox 进入退役路径，后续由 DO compact checkpoint 投影到 D1。
4. 保留 D1 增量接口作为 Y.Doc 尚未激活时的 fallback。
5. 用测试覆盖启动策略和单用户双设备收敛场景。

## 边界外事项

- RD-302 负责把 DO compact 后的 Y.Doc snapshot 投影写入 D1。
- RD-304 负责把字段、索引、外键的冲突合并语义从 full-state snapshot 继续细化到结构化 shared types。
- 多人 presence、协同光标、团队 workspace 权限进入独立协作能力设计。

## 状态边界

| 存储 | 权威职责 | 恢复职责 | 写入频率 | 当前代码入口 |
|---|---|---|---|---|
| IndexedDB `y-indexeddb` | 浏览器本地离线副本 | 刷新、重开、弱网启动时最快恢复 | Yjs update 级 | `WorkspaceYDocProvider` |
| Browser `Y.Doc` | 前端 runtime 内容权威 | UI hooks 从 shared types 派生 `PersistedState` / metadata | 每次业务编辑 | `workspaceYDocAdapter` |
| Durable Object storage | 服务端实时内容权威 | DO 冷启动优先从自身 snapshot + update log 恢复 | Yjs update log，compact 后 snapshot | `WorkspaceYDocDurableObject` |
| D1 `workspaces` | 账号归属与 workspace 列表权威 | 鉴权、默认 workspace 创建 | 低频 | `workspaceEntities.getOrCreateDefaultWorkspace` |
| D1 `workspace_entities` | legacy HTTP projection | Y.Doc 激活前的增量恢复，RD-302 后承接 checkpoint projection | 低频 checkpoint / fallback outbox | `workspaceIncrementalSyncService` |

## 启动决策

登录态 workspace 只有一条启动决策，由 `resolveWorkspaceYDocStartupPlan()` 产出：

1. `load-indexeddb-ydoc`：创建 `Y.Doc` 并等待 `y-indexeddb.whenSynced`，本机离线副本先成为 UI 可用数据源。
2. `merge-legacy-indexeddb-snapshot`：读取现有 IndexedDB legacy stores，把缺失或更新的 legacy record 合并进 Y.Doc。
3. `connect-durable-object`：连接 DO WebSocket，同步 DO storage 中的 Yjs update。
4. `durable-object-checkpoint`：D1 outbox 在 Y.Doc runtime 激活后退役；D1 projection 由 RD-302 的 DO compact checkpoint 更新。

匿名态和缺少 `workspaceId` 的登录过渡态走 legacy IndexedDB 路径。

## D1 策略

`shouldQueueWorkspaceEntityOutbox()` 固定 D1 outbox 的唯一入口条件：

```typescript
scope.kind === 'user' && scope.workspaceId && yDocReady === false
```

含义：

- Y.Doc runtime 激活前，业务编辑继续写本地业务 store 并进入 D1 outbox。
- Y.Doc runtime 激活后，业务编辑写入 Y.Doc，由 DO storage 承接实时持久化。
- D1 的长期恢复 projection 由 DO compact checkpoint 更新，避免每个字段输入都写入 D1。

## 测试矩阵

| 场景 | 测试文件 | 覆盖点 |
|---|---|---|
| 同步权威矩阵 | `apps/web/src/__tests__/services/workspaceYDocAuthority.test.ts` | IndexedDB / Y.Doc / DO storage / D1 职责常量 |
| 登录态启动策略 | `apps/web/src/__tests__/services/workspaceYDocAuthority.test.ts` | 单一启动顺序与 D1 checkpoint 策略 |
| D1 outbox 退役条件 | `apps/web/src/__tests__/services/workspaceYDocAuthority.test.ts` | `yDocReady` 前后 outbox 入队差异 |
| 双设备最终收敛 | `apps/web/src/__tests__/services/workspaceYDocAdapter.test.ts` | 建表、删表、字段调整、文件夹移动经 Yjs update 收敛 |
| 业务 hook 接入 | `apps/web/src/__tests__/hooks/usePersistedState.test.ts`、`apps/web/src/__tests__/hooks/useSavedTables.test.ts` | Y.Doc 本地可用时写 Y.Doc 且跳过 D1 outbox |

## 验收标准

- 同步权威矩阵落文档并在代码中有对应常量。
- `WorkspaceYDocProvider` 通过 `resolveWorkspaceYDocStartupPlan()` 选择启动步骤。
- `usePersistedState`、`useSavedTables`、`useFolders` 通过 `shouldQueueWorkspaceEntityOutbox()` 控制 D1 outbox。
- 单用户双设备建表、删表、字段调整、移动文件夹的 Yjs update 收敛测试通过。
- RD-302 接手 DO compact checkpoint 写 D1 的实现。
