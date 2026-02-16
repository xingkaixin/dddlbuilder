# Task Plan: SavedTablesDrawer.tsx 拆分

## Goal
将抽屉主容器、表项 UI、筛选逻辑、递归菜单解耦，降低组件复杂度。

## Phases
- [ ] Phase 1: 组件与逻辑边界梳理
- [ ] Phase 2: 子组件与 hooks 拆分
- [ ] Phase 3: 主组件回接与行为对齐
- [ ] Phase 4: 回归验证

## TODO Checklist

### Phase 1: 边界梳理
- [ ] 列出 `TableItem` 依赖与 props
- [ ] 列出过滤逻辑与文件夹树渲染逻辑边界

### Phase 2: 拆分
- [ ] 创建 `saved-tables/TableItem.tsx`
- [ ] 创建 `saved-tables/useSavedTablesFilter.ts`
- [ ] 创建 `saved-tables/folderMenu.tsx`

### Phase 3: 回接
- [ ] 更新 `SavedTablesDrawer.tsx` 引用新模块
- [ ] 确保搜索与文件夹展示行为一致

### Phase 4: 验证
- [ ] 执行 `bun run lint`
- [ ] 执行 `bun run test:run`
- [ ] 执行 `bun run test:e2e`

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `src/components/App/SavedTablesDrawer.tsx` | 过滤逻辑与渲染耦合 | Medium | Open | 待拆分 |

## Status
**Planned** — 2026-02-16
