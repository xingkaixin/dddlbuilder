---
created: "2026-02-15"
updated: "2026-02-15"
status: "proposed"
priority: "P1"
---

# TemplateManagerDialog.tsx 组件拆分（klip-4）

**目标文件**: `src/components/App/TemplateManagerDialog.tsx`（782 行）  
**创建日期**: 2026-02-15  
**优先级**: P1

---

## 问题描述

单文件包含 **4 个独立组件/接口**，职责过多：

1. `FieldEditRow` — 字段编辑行组件（约 130 行 JSX）
2. `TemplateListItem` — 模板列表项组件（约 60 行 JSX）
3. `TemplateManagerDialog` — 主对话框（约 370 行，含状态管理 + UI）
4. `CreateTemplateDialog` — 从选中字段创建模板的对话框（约 140 行）

**核心风险**：
- 四个组件同处一个文件，单一职责未满足
- 互不依赖的子组件编辑时易误改其它组件

---

## 拆分方案

### 阶段 1：子组件拆分

将各子组件抽取为独立文件：

| 原位置 | 新文件 | 行数估算 |
|--------|--------|---------|
| `FieldEditRow` + `FieldEditRowProps` | `FieldEditRow.tsx` | ~140 行 |
| `TemplateListItem` + `TemplateListItemProps` | `TemplateListItem.tsx` | ~70 行 |
| `CreateTemplateDialog` + `CreateTemplateDialogProps` | `CreateTemplateDialog.tsx` | ~160 行 |

### 阶段 2：主组件瘦身

- `TemplateManagerDialog.tsx` 仅保留主对话框逻辑 + 子组件 import
- 预期瘦身至 ~400 行

---

## 验证计划

1. `bun run lint` — 无新增 lint 错误
2. `bun run test:run` — 全量单测通过
3. 手动验证：模板管理对话框的创建、编辑、删除、复制功能正常

---

## 持续跟进

- 任务清单: `klips/klip-4-split-template-dialog/task_plan.md`
