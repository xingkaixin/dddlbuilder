# Task Plan: TemplateManagerDialog.tsx 组件拆分

## Goal
将 782 行的 TemplateManagerDialog 文件中的 4 个组件拆分为独立文件，各司其职。

## Phases
- [ ] Phase 1: 子组件拆分
- [ ] Phase 2: 主组件瘦身与引用更新
- [ ] Phase 3: 回归验证

## TODO Checklist

### Phase 1: 子组件拆分
- [ ] 创建 `FieldEditRow.tsx`，迁移 `FieldEditRow` 组件和 `FieldEditRowProps` 接口
- [ ] 创建 `TemplateListItem.tsx`，迁移 `TemplateListItem` 组件和 `TemplateListItemProps` 接口
- [ ] 创建 `CreateTemplateDialog.tsx`，迁移 `CreateTemplateDialog` 组件和 `CreateTemplateDialogProps` 接口
- [ ] 将 `createEmptyField()` 工具函数放入适当位置（新文件或公共 utils）
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

### Phase 2: 主组件瘦身
- [ ] 更新 `TemplateManagerDialog.tsx` 的 import 引用
- [ ] 移除已迁移的代码块
- [ ] 确认主组件 props 接口无变化
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`

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
- 暂无（待启动）

## Errors Encountered
- 暂无

## Status
**Proposed** — 等待排期执行。
