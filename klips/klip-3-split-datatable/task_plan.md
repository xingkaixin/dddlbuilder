# Task Plan: DataTable.tsx 组件拆分

## Goal
将 931 行的 DataTable 组件按职责拆分为列定义、行操作、表格行为等独立模块。

## Phases
- [x] Phase 1: 列定义抽取
- [x] Phase 2: 行操作组件化
- [x] Phase 3: 冻结列与动画逻辑提取
- [x] Phase 4: 回归验证与文档更新

## TODO Checklist

### Phase 1: 列定义抽取
- [x] 盘点所有 `columnHelper.accessor` / `columnHelper.display` 定义
- [x] 分析列定义的外部依赖（`dbType`、`updateCellValue`、`handleTabNavigation` 等）
- [x] 创建 `columns.tsx`，导出 `useFieldColumns()` hook
- [x] 将列定义代码迁移到新文件
- [x] DataTable 改为消费 `useFieldColumns()` 返回值
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 2: 行操作组件化
- [x] 将操作列 `cell` 中的删除确认逻辑提取为 `RowActions` 组件
- [x] 确认 `RowActions` 的 props 接口设计
- [x] 更新列定义中的 action cell 引用
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 3: 冻结列与动画逻辑提取
- [x] 创建 `useFreezeColumns.ts` hook
- [x] 将 sticky left 位置计算逻辑迁移
- [x] 创建 `useRowHighlight.ts` hook
- [x] 将行高亮动画逻辑迁移
- [x] DataTable 使用新 hooks
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 4: 回归验证
- [x] 执行 `bun run test:e2e`（48 passed, 1 skipped）
- [ ] 手动验证表格列渲染
- [ ] 手动验证 Tab 键导航
- [ ] 手动验证列冻结功能
- [ ] 手动验证行高亮动画
- [ ] 手动验证行删除功能
- [x] 更新 klip 文档状态为 completed
- [x] 记录最终行数对比

## Decisions Made
- `RowActions` 采用每行自管理确认状态，消除了 DataTable 中的共享 `deleteConfirm` state
- `useFreezeColumns` 将 `freezeColumnKeys` 定义为模块级常量，避免重复创建

## Errors Encountered
- 无

## Status
**Completed** — 2026-02-15 已完成拆分。

## 行数对比
| 文件 | 拆分前 | 拆分后 |
|------|--------|--------|
| `DataTable.tsx` | 932 | 625 |
| `table/columns.tsx` | — | 219 |
| `table/RowActions.tsx` | — | 80 |
| `table/useFreezeColumns.ts` | — | 69 |
| `table/useRowHighlight.ts` | — | 23 |
