---
created: "2026-02-15"
updated: "2026-02-15"
status: "proposed"
priority: "P0"
---

# DataTable.tsx 组件拆分（klip-3）

**目标文件**: `src/components/App/DataTable.tsx`（931 行）  
**创建日期**: 2026-02-15  
**优先级**: P0（最高）

---

## 问题描述

`DataTable.tsx` 包含 **89 个 outline items**，混合了以下职责：

1. **列定义** — `columnHelper.accessor` 定义约 10 列，每列含 `header` + `cell` 渲染函数（约 200+ 行）
2. **表格配置** — `useReactTable` 初始化与选项
3. **行高亮动画逻辑** — `animate-row-highlight` 的 DOM 操作
4. **冻结列计算** — sticky left 位置计算
5. **行操作** — 删除、拖拽等交互
6. **完整表格 JSX** — thead + tbody 渲染

**核心风险**：
- 新增或修改列定义需在数百行的 `useMemo` 中操作
- 列定义（数据逻辑）和渲染（UI 逻辑）紧耦合
- 表格行为逻辑与展示逻辑混合

---

## 拆分方案

### 阶段 1：列定义抽取

将列定义从组件中提取为独立模块：

- 创建 `columns.tsx` — 导出 `useFieldColumns(deps)` hook，返回列配置数组
- 将所有 `columnHelper.accessor(...)` / `columnHelper.display(...)` 移入
- App/DataTable 仅消费列定义

### 阶段 2：行操作组件化

- 将操作列的 `cell` 渲染函数（含删除确认等逻辑）抽为 `RowActions` 组件
- 减少 DataTable 内的内联函数定义

### 阶段 3：冻结列与动画逻辑提取

- 提取 `useFreezeColumns(columns, freezeCount)` hook — 计算 sticky left 位置
- 提取行高亮动画逻辑为 `useRowHighlight(rowIndex)` hook

---

## 验证计划

1. `bun run lint` — 无新增 lint 错误
2. `bun run test:run` — 全量单测通过
3. `bun run test:e2e` — 表格交互测试通过（Tab 导航、列冻结、行删除）
4. 手动验证：列宽调整、冻结列显示、行高亮动画正常

---

## 持续跟进

- 任务清单: `klips/klip-3-split-datatable/task_plan.md`
