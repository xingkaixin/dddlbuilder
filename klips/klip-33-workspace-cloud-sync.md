---
Author: "Agent"
Updated: 2026-04-12
Status: Draft
Origin: "KLIP-29 后续"
---

# KLIP-33 工作区云端同步

## 背景

KLIP-29 实现了匿名工作区到注册用户的**单向一次性迁移**：IndexedDB 数据上传到 D1 后，迁移标记为 `completed`，此后 D1 数据即为静态快照。

这带来了两个问题：

1. **迁移后数据脱节**：用户在本地继续编辑，所有写入仅到 IndexedDB（`src/hooks/usePersistedState.ts:108-145`），D1 中的快照逐渐过时
2. **换设备/清缓存后数据丢失**：新设备的 IndexedDB 为空，应用启动后进入空白状态（`src/hooks/usePersistedState.ts:175-221` 仅从 IndexedDB 读取），无法从 D1 恢复

D1 的性能特征决定了它不适合替代 IndexedDB 作为高频读写的前端主存储：
- D1 端到端延迟 200ms-1.5s（含 Worker-D1 通信开销），IndexedDB <1ms
- D1 单线程写入模型，所有查询串行排队
- D1 无离线支持

## 目标

- D1 作为已登录用户的 **source of truth**，IndexedDB 降级为本地缓存
- 已登录用户启动时从 D1 拉取最新数据填充 IndexedDB
- 已登录用户日常编辑时，IndexedDB 承载读写，后台异步同步到 D1
- 换设备/清缓存后，登录即可从 D1 全量恢复工作区

## 非目标

- 不做多人实时协作编辑（无 CRDT/OT）
- 不做增量同步（数据量小，全量同步足够）
- 不做离线编辑后的冲突合并（仅 last-write-wins）
- 不改变匿名用户的现有行为（未登录仍纯 IndexedDB）
- 不迁移 `review_history`、`table_versions`、`field_templates`、`table_folders`（同 KLIP-29 边界）

## 设计概览

### 核心思路

```
┌──── 启动/登录 ────────────┐
│  D1 → IndexedDB（全量拉取） │  已登录用户获取最新数据
└───────────────────────────┘

┌──── 日常编辑 ─────────────┐
│  读写 ←→ IndexedDB（<1ms） │  保持现有 500ms debounce 体验
│  异步推送 → D1             │  非阻塞，fire-and-forget
└───────────────────────────┘

┌──── 换设备 ──────────────┐
│  D1 → IndexedDB（全量拉取） │  同启动/登录逻辑
└───────────────────────────┘
```

### 数据规模

- 单条 `PersistedState`：3-8 KB
- 典型用户：5-50 张 saved table + 1 个 global draft + 若干 saved draft
- 全量同步总数据量：约 50-500 KB，单次 HTTP 请求即可承载

### 为什么不用增量同步

增量同步需要维护变更日志（change log）、处理乱序、实现 diff/patch——复杂度与收益不成正比。当前数据量下全量同步的网络开销可忽略。

## 组件设计

### 1. 云端拉取（Pull on Bootstrap）

**触发时机**：应用启动 + `authState.status === 'signed_in'`

**流程**：

```typescript
// 伪代码
async function pullWorkspaceFromCloud(userId: string): Promise<CloudSnapshot | null> {
  const res = await fetch('/api/workspace/snapshot');
  if (!res.ok) return null;
  return res.json(); // { globalDraft, savedTables, savedDrafts, session }
}
```

**与现有 bootstrap 流程的集成点**：

当前 `hydrateMainWorkspace()`（`src/hooks/usePersistedState.ts:175-221`）从 IndexedDB 读取数据。改造后：

1. 已登录用户 → 先调用 `GET /api/workspace/snapshot` 拉取 D1 数据
2. 比对本地 IndexedDB 与云端数据的 `updatedAt`
3. 云端更新 → 用云端数据覆写 IndexedDB，再走现有 bootstrap 流程
4. 本地更新或无云端数据 → 跳过拉取，直接走现有 bootstrap

### 2. 云端推送（Push on Save）

**触发时机**：每次 `saveState()` 写入 IndexedDB 成功后

**流程**：

```typescript
// 在现有 saveState 回调（src/hooks/usePersistedState.ts:108-145）中追加
const saveState = useCallback((payload: WorkspaceSavePayload) => {
  // ... 现有 IndexedDB 写入逻辑不变 ...

  // 已登录用户：异步推送到 D1
  if (isSignedIn) {
    fireAndForget(pushToCloud(payload));
  }
}, [...]);
```

**推送内容**：

- `global_draft`：每次保存都推送
- `saved_table`：仅在 `isDirty` 时推送（与现有脏检查逻辑一致）
- `session`：不同步（用户在新设备上默认进入 global draft）

**去抖策略**：复用现有 `PERSIST_DEBOUNCE_MS = 500`（`src/components/App/hooks/usePersistedSync.ts:6`），不做额外 debounce。推送在 IndexedDB 写入之后异步执行，不阻塞 UI。

**失败重试**：推送失败时加入内存重试队列，同一 key 只保留最新变更，下次推送时自动重试。详见"关键设计决策 → 推送失败重试"。

### 3. 版本冲突（Last-Write-Wins）

**策略**：`updated_at` 谁大谁赢。

**场景分析**：

| 场景 | 处理方式 |
|---|---|
| 仅一端有数据 | 直接使用 |
| 两端都有，云端更新 | 云端覆盖本地 |
| 两端都有，本地更新 | 本地保留，下次推送覆盖云端 |
| 两端都有，时间戳相同 | 本地保留（用户感知不到差异） |

**为什么 last-write-wins 足够**：DDL Builder 是个人工具，一个人不太可能在两台设备上同时编辑同一张表。如果确实发生，丢弃旧版本是合理的默认行为。

### 4. 首次登录迁移的融合

当前 KLIP-29 的迁移流程在首次登录时触发，将匿名数据上传到 D1。在新的同步架构下，迁移后数据已经在 D1 中，后续的 pull/push 自然衔接，无需额外适配。

**迁移流程保持不变**，仅迁移完成后将 `workspace_links.migration_status` 标记为 `completed` 的语义从"迁移结束"扩展为"同步已激活"。

## 数据存储

### D1 Schema 变更

现有 `workspace_snapshots` 表结构已经满足需求，无需新增表：

```sql
-- 现有结构（migrations/0001_user_system_init.sql:71-84）
CREATE TABLE workspace_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('global_draft', 'saved_table', 'saved_draft')),
  normalized_name TEXT,
  payload_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,  -- 客户端时间戳，用于 last-write-wins
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**`source_updated_at`**：存储客户端 `Date.now()` 的时间戳。Pull 时与本地 `updatedAt` 比较即可判断谁更新。

**`id` 生成规则**：`snapshot:{userId}:{kind}:{normalizedName}`，其中 `global_draft` 的 `normalizedName` 为固定值 `_`。这样每个用户每种数据最多一条记录，天然支持 upsert。

### 新增 API

| 方法 | 路径 | 用途 | 认证 |
|---|---|---|---|
| `GET` | `/api/workspace/snapshot` | 全量拉取用户工作区 | 必须 |
| `PUT` | `/api/workspace/snapshot` | 推送（全量替换）工作区 | 必须 |

**GET `/api/workspace/snapshot` 响应**：

```typescript
type WorkspaceSnapshotResponse = {
  globalDraft: {
    state: PersistedState;
    updatedAt: number;
  } | null;
  savedTables: Array<{
    normalizedName: string;
    name: string;
    state: PersistedState;
    updatedAt: number;
  }>;
  savedDrafts: Array<{
    normalizedName: string;
    tableName: string;
    state: PersistedState;
    updatedAt: number;
    baseSignature: string;
  }>;
};
```

**PUT `/api/workspace/snapshot` 请求**：

```typescript
type WorkspaceSnapshotPushRequest = {
  globalDraft: {
    state: PersistedState;
    updatedAt: number;
  } | null;
  savedTable?: {
    normalizedName: string;
    name: string;
    state: PersistedState;
    updatedAt: number;
  } | null;
  session: {
    activeSource: WorkspaceSource;
    updatedAt: number;
  };
};
```

推送采用**逐条 upsert** 而非全量替换：每次只推送当前正在编辑的那条数据（global draft 或某张 saved table），避免不必要的全量写入。

### IndexedDB 变更

无需 schema 变更。现有的 `updatedAt: number` 字段（`src/utils/workspaceStateDb.ts`）可直接用于与 `source_updated_at` 比较。

## 实施阶段

### Phase 1：云端拉取（Pull）

1. 新增 `GET /api/workspace/snapshot` API
2. 新增 `src/services/workspaceSyncService.ts` 封装拉取逻辑
3. 改造 `hydrateMainWorkspace()`：已登录时先拉取再 bootstrap
4. 拉取结果写入 IndexedDB 后走现有流程

**验收**：已登录用户在清空 IndexedDB 后刷新页面，数据从 D1 恢复。

### Phase 2：云端推送（Push）

1. 新增 `PUT /api/workspace/snapshot` API
2. 在 `saveState()` 回调中追加异步推送
3. 实现内存重试队列（去重 + 上限控制）
4. `beforeunload` 时 `sendBeacon` 兜底推送

**验收**：已登录用户编辑后，在另一台设备登录可看到最新数据。

### Phase 3：同步状态面板

1. 在用户设置页面新增同步状态区域
2. 展示上次同步时间、待同步数量
3. 提供手动"立即同步"按钮

### Phase 4：清理旧迁移逻辑

1. 迁移完成后不再需要 `workspace_links` 表的 `migration_status` 跟踪（同步机制已覆盖）
2. 评估是否保留 KLIP-29 的迁移弹层 UI（首次登录仍有价值，但同步接管后不再必须）

## 待讨论

- **session 是否需要跨设备同步**：`workspace_session` 记录的是"用户最后在看哪张表"，跨设备意义不大。建议不同步——用户在新设备上默认看到 global draft 即可。

## 关键设计决策

### 推送失败重试

推送不能只做 fire-and-forget。如果用户编辑了多次后关闭浏览器，必须保证最终一致性。

**方案：内存重试队列 + 页面卸载兜底**

```
saveState() → IndexedDB 写入成功
             → 加入内存重试队列
             → 异步推送 D1
                ├─ 成功 → 从队列移除
                └─ 失败 → 留在队列，下次推送时重试
```

- 队列上限：最多保留最近 N 条未推送记录（避免内存无限增长）
- 去重：同一 key（`kind:normalizedName`）的多次变更只保留最新一条
- 页面关闭（`beforeunload`）时：用 `navigator.sendBeacon` 发送队列中剩余数据
- 页面重新打开时：Pull 阶段会从 D1 获取最新数据，覆盖本地状态，自然修复可能丢失的推送

### 同步状态可见性

用户不需要在主界面上感知同步状态，但在用户设置面板中可以看到同步相关信息。

**位置**：用户设置/控制台页面（非首页）

**展示内容**：
- 上次成功同步时间
- 待同步变更数量（队列积压）
- 同步状态（已同步 / 同步中 / 有积压）
- 手动"立即同步"按钮（触发一次强制推送）

**不在首页展示**：避免给用户带来"需要关心同步是否成功"的心理负担。

## 验收标准

- [ ] 已登录用户清空 IndexedDB 后刷新，数据从 D1 恢复
- [ ] 已登录用户在设备 A 编辑，设备 B 刷新后能看到设备 A 的最新数据
- [ ] 未登录用户行为不受影响（纯 IndexedDB）
- [ ] 推送失败自动重试，不丢失用户数据
- [ ] 页面关闭时通过 sendBeacon 尽力推送未同步数据
- [ ] 推送不影响现有 500ms debounce 的编辑体验
- [ ] 用户可在设置面板查看同步状态和手动触发同步
