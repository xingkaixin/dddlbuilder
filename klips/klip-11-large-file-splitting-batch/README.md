---
created: "2026-02-16"
updated: "2026-02-16"
status: "in_progress"
priority: "P0"
---

# 大文件模块拆分批次追踪（klip-11）

**批次目标**: 先完成可拆分大文件的问题记录与任务跟踪，作为后续重构执行基线。  
**创建日期**: 2026-02-16

---

## 批次范围

本批次聚焦以下 5 个待拆分目标（排除已完成的 klip-2 / klip-3）：

| klip | 目标文件 | 当前行数 | 优先级 | 状态 |
|------|---------|---------|--------|------|
| `klip-6` | `api/index.ts` | 595 | P0 | completed |
| `klip-7` | `src/utils/SqlParser.ts` | 742 | P0 | completed |
| `klip-8` | `src/utils/constants.ts` | 885 | P1 | completed |
| `klip-9` | `src/utils/alterDdlGenerator.ts` | 574 | P1 | completed |
| `klip-10` | `src/components/App/SavedTablesDrawer.tsx` | 528 | P2 | planned |

---

## 问题记录（汇总）

1. 部分文件存在多职责混合（路由+提示词、解析+映射、数据+UI）。
2. 体量较大导致定位成本高，评审与协作冲突概率提升。
3. 模块边界不够清晰，后续新增功能容易继续堆积在同一文件。

---

## 执行顺序建议

1. `klip-6`（API 路由拆分）
2. `klip-7`（SQL Parser 拆分）
3. `klip-8`（常量分库拆分）
4. `klip-9`（Alter DDL 生成器拆分）
5. `klip-10`（SavedTablesDrawer 子组件拆分）

---

## 跟踪方式

- 每个目标使用独立 `README.md + task_plan.md` 维护。
- 执行时只更新对应 klip，避免跨文件重复记录。
- 统一用 `planned/in_progress/completed/blocked` 更新状态。
