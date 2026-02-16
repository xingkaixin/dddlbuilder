---
created: "2026-02-16"
updated: "2026-02-16"
status: "planned"
priority: "P0"
---

# SqlParser.ts 拆分（klip-7）

**目标文件**: `src/utils/SqlParser.ts`（742 行）  
**创建日期**: 2026-02-16  
**优先级**: P0

---

## 问题记录

`SqlParser.ts` 当前集中处理：

1. 各数据库预处理逻辑组合。
2. parser 动态加载和实例生命周期。
3. AST 遍历、字段映射、索引映射、授权对象提取。
4. 辅助函数（literal/type/column name normalize）。

**风险**：
- 单文件认知负担高，任何规则改动都需通读大量逻辑。
- AST 解析规则扩展时，回归风险难以局部控制。

---

## 拆分边界（最小改动）

1. `src/utils/sql-parser/core/*`：parser 加载、parse 主流程。
2. `src/utils/sql-parser/handlers/*`：`createTable/createIndex/alter/grant` 处理器。
3. `src/utils/sql-parser/normalizers/*`：字段名、字面量、函数名解析工具。
4. 保留 `SqlParser` 对外 API（`parse` / `parseAsync`）不变。

---

## 验证计划

1. `bun run lint`
2. `bun run test:run`（重点关注 `sql-parser` 相关测试）

---

## 持续跟进

- 任务清单: `klips/klip-7-split-sql-parser/task_plan.md`
