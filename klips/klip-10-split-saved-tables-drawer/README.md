---
created: "2026-02-16"
updated: "2026-02-16"
status: "planned"
priority: "P2"
---

# SavedTablesDrawer.tsx 拆分（klip-10）

**目标文件**: `src/components/App/SavedTablesDrawer.tsx`（528 行）  
**创建日期**: 2026-02-16  
**优先级**: P2

---

## 问题记录

`SavedTablesDrawer.tsx` 当前混合了：

1. Drawer 主容器与状态管理。
2. `TableItem` 子组件定义。
3. 文件夹菜单递归渲染。
4. 搜索、过滤、分组展示逻辑。

**风险**：
- UI 与数据筛选耦合，后续交互改动定位成本高。
- 递归菜单与列表渲染同处一处，代码可读性下降。

---

## 拆分边界（最小改动）

1. `SavedTablesDrawer.tsx`：保留主容器与编排。
2. `saved-tables/TableItem.tsx`：表项渲染与动作按钮。
3. `saved-tables/useSavedTablesFilter.ts`：搜索与分组过滤逻辑。
4. `saved-tables/folderMenu.tsx`：文件夹菜单递归渲染。

---

## 验证计划

1. `bun run lint`
2. `bun run test:run`
3. `bun run test:e2e`（涉及抽屉与文件夹交互）

---

## 持续跟进

- 任务清单: `klips/klip-10-split-saved-tables-drawer/task_plan.md`
