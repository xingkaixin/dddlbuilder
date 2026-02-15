# Task Plan: ImportSqlDialog.tsx 组件拆分

## Goal
将 662 行的多步向导组件按步骤拆分为独立子组件，主组件保留导航编排逻辑。

## Phases
- [ ] Phase 1: 按步骤拆分 UI 组件
- [ ] Phase 2: 主组件瘦身
- [ ] Phase 3: 回归验证

## TODO Checklist

### Phase 1: 按步骤拆分 UI 组件
- [ ] 分析各步骤的 state 依赖和回调依赖
- [ ] 创建 `SqlInputStep.tsx`（数据库选择 + SQL 输入 + 校验）
- [ ] 创建 `PreviewStep.tsx`（字段表格预览 + 编辑操作）
- [ ] 创建 `ConfirmStep.tsx`（导入确认 + 数据展示）
- [ ] 设计各步骤组件的 props 接口
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 2: 主组件瘦身
- [ ] 更新 `ImportSqlDialog.tsx` 仅保留向导状态 + 步骤导航
- [ ] 导入并渲染各步骤子组件
- [ ] 确认对外 props 接口无变化
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 3: 回归验证
- [ ] 手动验证 Step 1: SQL 输入与语法校验
- [ ] 手动验证 Step 2: 字段预览与编辑
- [ ] 手动验证 Step 3: 确认导入
- [ ] 手动验证向导前进/后退导航
- [ ] 手动验证导入后数据正确加载到主表
- [ ] 更新 klip 文档状态为 completed
- [ ] 记录最终行数对比

## Decisions Made
- 暂无（待启动）

## Errors Encountered
- 暂无

## Status
**Proposed** — 等待排期执行。
