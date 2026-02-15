# Task Plan: ImportSqlDialog.tsx 组件拆分

## Goal
将 662 行的多步向导组件按步骤拆分为独立子组件，主组件保留导航编排逻辑。

## Phases
- [x] Phase 1: 按步骤拆分 UI 组件
- [x] Phase 2: 主组件瘦身
- [x] Phase 3: 回归验证

## TODO Checklist

### Phase 1: 按步骤拆分 UI 组件
- [x] 分析各步骤的 state 依赖和回调依赖
- [x] 创建 `SqlInputStep.tsx`（数据库选择 + SQL 输入 + 校验）
- [x] 创建 `PreviewStep.tsx`（字段表格预览 + 编辑操作）
- [x] 创建 `ConfirmStep.tsx`（导入确认 + 数据展示）
- [x] 设计各步骤组件的 props 接口
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 2: 主组件瘦身
- [x] 更新 `ImportSqlDialog.tsx` → `ImportSqlDialog/index.tsx` 仅保留向导状态 + 步骤导航
- [x] 导入并渲染各步骤子组件
- [x] 确认对外 props 接口无变化
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 3: 回归验证
- [x] `bun run lint` — 0 errors
- [x] `bun run test:run` — 627/627 通过
- [x] 更新 klip 文档状态为 completed
- [x] 记录最终行数对比

## Status
**Completed** — 2026-02-15
