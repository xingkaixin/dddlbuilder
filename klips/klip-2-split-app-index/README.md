---
created: "2026-02-15"
updated: "2026-02-15"
status: "proposed"
priority: "P0"
---

# App/index.tsx 组件拆分（klip-2）

**目标文件**: `src/components/App/index.tsx`（998 行）  
**创建日期**: 2026-02-15  
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

## 拆分方案

### 阶段 1：抽取 Hooks 编排层

将 `App` 组件中对多个 hooks 的调用和状态组合抽取为一个或多个专用 hooks：

- `useAppState()` — 聚合所有业务 hooks 的返回值，统一对外暴露
- 或按功能分组：`useAppTableActions()`、`useAppDialogState()` 等

**目标**：App 组件内不再直接调用 10+ 个独立 hook，而是通过 1~3 个聚合 hook 获取所有状态和回调。

### 阶段 2：拆分 JSX 渲染区域

将 JSX 按 UI 区域拆分为独立的容器组件：

- `AppToolbar` — 顶部工具栏区域（如已有 `Header`，可进一步收敛）
- `AppMainContent` — 主体内容区域（DataTable + TabPanel）
- `GlobalDialogs` — 已存在 `containers/GlobalDialogs.tsx`（354 行），检查是否可进一步利用

### 阶段 3：业务回调函数外移

将 `onNameChange`、`onCopy`、`onRollback` 等回调移入对应的 hooks 或 action 文件中（延续已有 `hooks/useSavedTableFlowActions.ts` 模式）。

---

## 验证计划

每个拆分步骤完成后执行：
1. `bun run lint` — 无新增 lint 错误
2. `bun run test:run` — 全量单测通过
3. `bun run test:e2e` — 端到端测试通过（涉及 UI 结构变更）
4. 手动验证：主界面渲染、Tab 切换、对话框交互均正常

---

## 持续跟进

- 任务清单: `klips/klip-2-split-app-index/task_plan.md`
