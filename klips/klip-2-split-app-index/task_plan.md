# Task Plan: App/index.tsx 组件拆分

## Goal
将近 1000 行的 App 上帝组件拆分为可维护的模块组合，保持行为不变。

## Phases
- [x] Phase 1: Hooks 编排层抽取
- [x] Phase 2: JSX 渲染区域拆分（评估后跳过 — 已充分分层）
- [x] Phase 3: 业务回调外移（评估后跳过 — 已充分提取）
- [x] Phase 4: 回归验证与文档更新

## TODO Checklist

### Phase 1: Hooks 编排层抽取
- [x] 盘点 App 组件中所有 hook 调用，列出依赖关系图
- [x] 设计分组 hooks 的接口签名
- [x] 创建 `hooks/useAppSelectors.ts`（171 行 — Zustand selector 聚合）
- [x] 创建 `hooks/useDialogStates.ts`（81 行 — Dialog state 初始化）
- [x] 创建 `hooks/useDerivedTableState.ts`（261 行 — 派生/计算状态）
- [x] 更新 App 组件使用新的聚合 hooks（999→784 行）
- [x] 执行 `bun run lint` ✅
- [x] 执行 `bun run test:run` ✅（64 files / 627 tests）

### Phase 2: JSX 渲染区域拆分
- [x] 分析 App JSX 的区域划分 → 已由 4 个容器组件充分分层，无需拆分
- [x] 评估已有 `containers/GlobalDialogs.tsx` 的覆盖范围 → 覆盖完整

### Phase 3: 业务回调外移
- [x] 盘点 App 内定义的所有业务回调函数 → 已由 13 个 action hooks 处理

### Phase 4: 回归验证
- [x] 执行 `bun run lint` ✅
- [x] 执行 `bun run test:run` ✅（627/627）
- [x] 更新 klip 文档状态为 completed
- [x] 记录最终行数对比：999 → 784（-21.5%）

## Decisions Made
- 采用 3 个聚合 hooks 而非 1 个巨型 `useAppState()`，按职责清晰分层
- Phase 2/3 评估后决定跳过，因已有充分的组件/hook 分层

## Status
**Completed** — 2026-02-15
