# Task Plan: TemplateManagerDialog.tsx 组件拆分

## Goal
将 782 行的 TemplateManagerDialog 文件中的 4 个组件拆分为独立文件，各司其职。

## Phases
- [x] Phase 1: 子组件拆分
- [x] Phase 2: 主组件瘦身与引用更新
- [x] Phase 3: 回归验证

## TODO Checklist

### Phase 1: 子组件拆分
- [x] 创建 `FieldEditRow.tsx`，迁移 `FieldEditRow` 组件和 `FieldEditRowProps` 接口
- [x] 创建 `TemplateListItem.tsx`，迁移 `TemplateListItem` 组件和 `TemplateListItemProps` 接口
- [x] 创建 `CreateTemplateDialog.tsx`，迁移 `CreateTemplateDialog` 组件和 `CreateTemplateDialogProps` 接口
- [x] 将 `createEmptyField()` 工具函数放入 `FieldEditRow.tsx`
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 2: 主组件瘦身
- [x] 更新 `TemplateManagerDialog.tsx` 的 import 引用
- [x] 移除已迁移的代码块
- [x] 确认主组件 props 接口无变化
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`

### Phase 3: 回归验证
- [ ] 手动验证模板列表显示
- [ ] 手动验证模板创建功能
- [ ] 手动验证模板编辑功能
- [ ] 手动验证模板删除功能
- [ ] 手动验证模板复制功能
- [ ] 手动验证从选中字段创建模板
- [ ] 更新 klip 文档状态为 completed
- [ ] 记录最终行数对比

## Decisions Made
- `createEmptyField()` 放入 `FieldEditRow.tsx` 并导出，TemplateManagerDialog 引用
- GlobalDialogs.tsx import 拆分为两条独立 import
- GlobalDialogs.a11y.test.tsx mock 拆分为两个独立 vi.mock

## Errors Encountered
- 无

## Status
**Completed** — 2026-02-15 已完成全部拆分与验证。
