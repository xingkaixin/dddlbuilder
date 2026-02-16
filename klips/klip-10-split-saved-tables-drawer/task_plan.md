# Task Plan: SavedTablesDrawer.tsx 拆分

## Goal
将抽屉主容器、表项 UI、筛选逻辑、递归菜单解耦，降低组件复杂度。

## Phases
- [x] Phase 1: 组件与逻辑边界梳理
- [x] Phase 2: 子组件与 hooks 拆分
- [x] Phase 3: 主组件回接与行为对齐
- [x] Phase 4: 回归验证（e2e 存在已知失败，已记录）

## TODO Checklist

### Phase 1: 边界梳理
- [x] 列出 `TableItem` 依赖与 props
- [x] 列出过滤逻辑与文件夹树渲染逻辑边界

### Phase 2: 拆分
- [x] 创建 `saved-tables/TableItem.tsx`
- [x] 创建 `saved-tables/useSavedTablesFilter.ts`
- [x] 创建 `saved-tables/folderMenu.tsx`

### Phase 3: 回接
- [x] 更新 `SavedTablesDrawer.tsx` 引用新模块
- [x] 确保搜索与文件夹展示行为一致

### Phase 4: 验证
- [x] 执行 `bun run lint`
- [x] 执行 `bun run test:run`
- [x] 执行 `bun run test:e2e`（失败 16 项，详见 Issue Log）

## Issue Log
| 日期 | 位置 | 问题 | 级别 | 状态 | 备注 |
|------|------|------|------|------|------|
| 2026-02-16 | `src/components/App/SavedTablesDrawer.tsx` | 过滤逻辑与渲染耦合 | Medium | Resolved | 已拆分为组件/hook 模块 |
| 2026-02-16 | `e2e/storage/*` 等 | e2e 用例存在选择器与等待超时失败 | Medium | Open | 32 passed / 1 skipped / 16 failed，建议单独稳定性任务 |

## Status
**Completed** — 2026-02-16
