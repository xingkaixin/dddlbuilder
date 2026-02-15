# Task Plan: DataTable.tsx 组件拆分

## Goal
将 931 行的 DataTable 组件按职责拆分为列定义、行操作、表格行为等独立模块。

## Phases
- [ ] Phase 1: 列定义抽取
- [ ] Phase 2: 行操作组件化
- [ ] Phase 3: 冻结列与动画逻辑提取
- [ ] Phase 4: 回归验证与文档更新

## TODO Checklist

### Phase 1: 列定义抽取
- [ ] 盘点所有 `columnHelper.accessor` / `columnHelper.display` 定义
- [ ] 分析列定义的外部依赖（`dbType`、`updateCellValue`、`handleTabNavigation` 等）
- [ ] 创建 `columns.tsx`，导出 `useFieldColumns()` hook
- [ ] 将列定义代码迁移到新文件
- [ ] DataTable 改为消费 `useFieldColumns()` 返回值
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 2: 行操作组件化
- [ ] 将操作列 `cell` 中的删除确认逻辑提取为 `RowActions` 组件
- [ ] 确认 `RowActions` 的 props 接口设计
- [ ] 更新列定义中的 action cell 引用
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 3: 冻结列与动画逻辑提取
- [ ] 创建 `useFreezeColumns.ts` hook
- [ ] 将 sticky left 位置计算逻辑迁移
- [ ] 创建 `useRowHighlight.ts` hook
- [ ] 将行高亮动画逻辑迁移
- [ ] DataTable 使用新 hooks
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 4: 回归验证
- [ ] 执行 `bun run test:e2e`
- [ ] 手动验证表格列渲染
- [ ] 手动验证 Tab 键导航
- [ ] 手动验证列冻结功能
- [ ] 手动验证行高亮动画
- [ ] 手动验证行删除功能
- [ ] 更新 klip 文档状态为 completed
- [ ] 记录最终行数对比

## Decisions Made
- 暂无（待启动）

## Errors Encountered
- 暂无

## Status
**Proposed** — 等待排期执行。
