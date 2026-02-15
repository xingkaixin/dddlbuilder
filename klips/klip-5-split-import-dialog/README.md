---
created: "2026-02-15"
updated: "2026-02-15"
status: "completed"
priority: "P2"
---

# ImportSqlDialog.tsx 组件拆分（klip-5）

**目标文件**: `src/components/ImportSqlDialog.tsx`（662 行）  
**创建日期**: 2026-02-15  
**优先级**: P2

---

## 问题描述

`ImportSqlDialog` 是一个多步向导组件（输入 → 预览 → 确认），所有步骤的状态管理和 UI 渲染逻辑集中在一个组件中：

1. **向导状态管理** — `step`、`sqlInput`、`parseResult`、`previewFields` 等 10+ 个 state
2. **Step 1 - SQL 输入** — 数据库选择、SQL 文本输入、语法校验 UI
3. **Step 2 - 解析预览** — 字段表格预览、字段编辑、排序
4. **Step 3 - 确认导入** — 最终确认与导入操作
5. **辅助逻辑** — `handleFieldChange`、`moveField`、`deleteField` 等字段操作

**核心风险**：
- 向导的每个步骤修改都需在同一文件中定位
- 步骤 UI 与步骤导航逻辑耦合

---

## 拆分方案

### 阶段 1：按步骤拆分 UI

将每个步骤的渲染逻辑抽取为独立组件：

| 步骤 | 新组件 | 职责 |
|------|--------|------|
| Step 1 | `SqlInputStep.tsx` | 数据库类型选择、SQL 输入框、校验反馈 |
| Step 2 | `PreviewStep.tsx` | 字段表格预览、字段编辑操作 |
| Step 3 | `ConfirmStep.tsx` | 导入确认、最终数据展示 |

### 阶段 2：主组件保留编排逻辑

- `ImportSqlDialog/index.tsx` 仅保留向导步骤导航和状态编排
- 各步骤组件通过 props 接收数据和回调
- 共享类型放入 `types.ts`

---

## 验证计划

1. `bun run lint` — 无新增 lint 错误 ✅
2. `bun run test:run` — 全量单测通过 (627/627) ✅
3. 手动验证：SQL 导入向导全流程（输入 → 预览 → 确认导入）

---

## 最终行数对比

| 文件 | 拆分前 | 拆分后 |
|------|--------|--------|
| `ImportSqlDialog.tsx` → `index.tsx` | 663 行 | 364 行 |
| `SqlInputStep.tsx` | — | 101 行 |
| `PreviewStep.tsx` | — | 208 行 |
| `ConfirmStep.tsx` | — | 45 行 |
| `types.ts` | — | 15 行 |
