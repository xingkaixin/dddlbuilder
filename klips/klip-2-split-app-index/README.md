---
created: "2026-02-15"
updated: "2026-02-15"
status: "completed"
priority: "P0"
---

# App/index.tsx 组件拆分（klip-2）

**目标文件**: `src/components/App/index.tsx`（998 行 → 784 行）  
**创建日期**: 2026-02-15  
**完成日期**: 2026-02-15  
**优先级**: P0（最高）

---

## 问题描述

`App/index.tsx` 是一个近 1000 行的"上帝组件"，集中了以下职责：

1. **50+ 行 imports** — 引入约 20 个 hooks 和大量子组件
2. **Hooks 编排** — `usePersistedState`、`useAuthManagement`、`useSqlGeneration`、`useToast`、`useCitusSharding`、`useMysqlPartition` 等十余个 hooks 的调用与状态组合
3. **业务回调** — `onNameChange`、`onCopy`、`onRollback` 等业务逻辑处理函数
4. **完整 JSX** — Header、DataTable、各种 Dialog、Panel 等所有顶层 UI 渲染

**核心风险**：
- 修改任何功能都需要在这个巨型文件中定位代码
- 多人协作时容易产生 Git 冲突
- 认知负荷高，新成员上手困难

---

## 实施结果

提取 3 个聚合 hooks，App 组件从 999 行降至 784 行（-21.5%）：

| 新文件 | 行数 | 职责 |
|--------|------|------|
| `hooks/useAppSelectors.ts` | 171 | Zustand selector 聚合（AppStore + FieldStore + IndexStore）|
| `hooks/useDialogStates.ts` | 81 | 4 个 dialog state 初始化 + 便捷别名 |
| `hooks/useDerivedTableState.ts` | 261 | 派生/计算状态（normalizedFields, indexStats, persistedState, tableDiff 等）|

### 阶段 2 & 3：评估后跳过

- **JSX 拆分**：已由 `GlobalDialogs`、`TableBuilderContainer`、`OutputContainer`、`SavedTablesContainer` 四个容器组件充分分层，无需进一步拆分
- **业务回调外移**：已由 13 个 action hooks 充分提取，无需进一步外移

---

## 验证结果

- `bun run lint` ✅
- `bun run test:run` ✅（64 files / 627 tests）
- 纯重构，无功能变更
