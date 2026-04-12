---
Author: "Agent"
Updated: 2026-04-12
Status: Complete
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

- D1 作为已登录用户的云端备份存储，IndexedDB 保持为本地主存储
- 用户可在设置页面手动上传本地工作区到云端、手动从云端拉取工作区到本地
- 换设备/清缓存后，用户登录后手动拉取即可从 D1 全量恢复工作区

## 非目标

- 不做多人实时协作编辑（无 CRDT/OT）
- 不做增量同步（数据量小，全量同步足够）
- 不做离线编辑后的冲突合并（仅 last-write-wins）
- 不改变匿名用户的现有行为（未登录仍纯 IndexedDB）
- 不做自动后台同步（编辑即推送、启动即拉取）
- 不迁移 `review_history`、`table_versions`、`field_templates`、`table_folders`（同 KLIP-29 边界）

## 设计概览

### 核心思路

采用**手动同步**模式，由用户主动触发上传/下载，不干预日常编辑流程：

```
┌──── 手动上传（设置页） ──────┐
│  IndexedDB → D1（全量推送）   │  用户主动将本地工作区备份到云端
└─────────────────────────────┘

┌──── 手动下载（设置页） ──────┐
│  D1 → IndexedDB（全量覆写）   │  用户主动从云端恢复工作区到本地
└─────────────────────────────┘
```

**为什么选择手动同步而非自动同步**：

- 自动同步需要引入后台重试队列、`sendBeacon` 兜底、同步状态面板等复杂机制，增加维护成本
- DDL Builder 是个人工具，编辑频率不高，自动同步的收益有限
- 手动模式给用户明确的控制权，避免"数据到底同步了没有"的焦虑
- 数据规模小（约 50-500 KB），手动全量同步的网络开销可忽略

### 数据规模

- 单条 `PersistedState`：3-8 KB
- 典型用户：5-50 张 saved table + 1 个 global draft + 若干 saved draft
- 全量同步总数据量：约 50-500 KB，单次 HTTP 请求即可承载

### 为什么不用增量同步

增量同步需要维护变更日志（change log）、处理乱序、实现 diff/patch——复杂度与收益不成正比。当前数据量下全量同步的网络开销可忽略。

## 组件设计

### 1. 云端拉取（Manual Pull）

**触发时机**：用户在设置 > 工作区 Tab 中点击"下载"按钮

**流程**：

```typescript
// workspaceSyncService.ts
export const importWorkspaceFromCloud = async (scope) => {
  const snapshot = await pullWorkspaceSnapshot();       // GET /api/workspace/snapshot
  await applyCloudSnapshotToLocal(snapshot, { overwrite: true, scope });
};
```

**拉取行为**：全量覆写本地 IndexedDB。拉取后通过 `WORKSPACE_SNAPSHOT_APPLIED_EVENT` 事件通知主工作区重新加载。

### 2. 云端推送（Manual Push）

**触发时机**：用户在设置 > 工作区 Tab 中点击"上传"按钮

**流程**：

```typescript
// workspaceSyncService.ts
export const exportWorkspaceToCloud = async (scope) => {
  const snapshot = await collectWorkspaceSnapshot(undefined, scope);
  await pushWorkspaceSnapshot(snapshot);                // PUT /api/workspace/snapshot
};
```

**推送行为**：从 IndexedDB 读取全部工作区数据，全量推送到 D1。推送前弹窗二次确认。

### 3. 版本冲突（Last-Write-Wins）

**策略**：`updated_at` 谁大谁赢（拉取时），上传时直接全量覆写云端。

**场景分析**：

| 场景 | 处理方式 |
|---|---|
| 仅一端有数据 | 直接使用 |
| 两端都有，云端更新 | 云端覆盖本地（下载时） |
| 两端都有，本地更新 | 本地覆盖云端（上传时） |
| 两端都有，时间戳相同 | 保留当前端数据 |

**为什么 last-write-wins 足够**：DDL Builder 是个人工具，一个人不太可能在两台设备上同时编辑同一张表。如果确实发生，丢弃旧版本是合理的默认行为。手动模式下，用户对覆盖行为有明确预期。

### 4. 首次登录迁移的融合

当前 KLIP-29 的迁移流程在首次登录时触发，将匿名数据上传到 D1。迁移后的数据通过手动同步即可在换设备时恢复。

**迁移流程保持不变**，迁移完成后用户可在设置页手动上传后续编辑。

### 5. 设置页同步入口

同步操作放置在用户设置 Dialog 的"工作区"Tab 中（`UserSettingsDialog.tsx`）：

- **上传到云端**按钮：将本地 IndexedDB 全量推送到 D1，操作前弹窗确认
- **从云端下载**按钮：从 D1 拉取全量数据覆写本地 IndexedDB，操作前弹窗确认
- 提示文案说明同步为手动操作，告知用户不会自动同步

## 数据存储

### D1 Schema

现有 `workspace_snapshots` 表结构满足需求，无需新增表：

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

**`id` 生成规则**：`snapshot:{userId}:{kind}:{normalizedName}`，其中 `global_draft` 的 `normalizedName` 为固定值 `_`。每个用户每种数据最多一条记录，天然支持 upsert。

### API

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

### IndexedDB

无需 schema 变更。现有的 `updatedAt: number` 字段（`src/utils/workspaceStateDb.ts`）可直接用于与 `source_updated_at` 比较。

## 实施阶段

### Phase 1：同步 API

1. 新增 `GET /api/workspace/snapshot` API
2. 新增 `PUT /api/workspace/snapshot` API
3. 新增 `src/services/workspaceSyncService.ts` 封装拉取/推送逻辑

**验收**：API 可正常调用，读写 D1 数据正确。

### Phase 2：设置页手动同步入口

1. 在用户设置 Dialog 中新增"工作区"Tab
2. 实现"上传到云端"按钮（含二次确认弹窗）
3. 实现"从云端下载"按钮（含二次确认弹窗）
4. 下载完成后通过 `WORKSPACE_SNAPSHOT_APPLIED_EVENT` 事件刷新主工作区
5. 添加相关 i18n 翻译

**验收**：已登录用户可在设置页手动上传/下载工作区。

## 待讨论

- **session 是否需要跨设备同步**：`workspace_session` 记录的是"用户最后在看哪张表"，跨设备意义不大。当前不同步——用户在新设备上默认看到 global draft 即可。

## 验收标准

- [x] 已登录用户可在设置页手动上传工作区到云端
- [x] 已登录用户可在设置页手动从云端下载工作区
- [x] 下载后本地工作区数据从 D1 恢复，主工作区自动刷新
- [x] 上传/下载前有二次确认弹窗
- [x] 未登录用户不显示同步操作（提示需要登录）
- [x] 操作失败时展示错误信息
- [x] 未登录用户行为不受影响（纯 IndexedDB）
- [x] 上传/下载不影响现有编辑体验
- [x] 中英文翻译完整
