---
created: "2026-02-16"
updated: "2026-02-16"
status: "completed"
priority: "P0"
---

# SqlParser.ts 拆分（klip-7）

**目标文件**: `src/utils/SqlParser.ts`（742 行）  
**创建日期**: 2026-02-16  
**完成日期**: 2026-02-16  
**优先级**: P0

---

## 问题记录

`SqlParser.ts` 原本集中处理：

1. 各数据库预处理逻辑组合。
2. parser 动态加载和实例生命周期。
3. AST 遍历、字段映射、索引映射、授权对象提取。
4. 辅助函数（literal/type/column name normalize）。

---

## 实施结果（最小改动）

按职责拆分到 `src/utils/sql-parser/`，并保持 `SqlParser` 对外 API 不变：

1. `src/utils/sql-parser/types.ts`
2. `src/utils/sql-parser/parserLoader.ts`
3. `src/utils/sql-parser/preprocessMysql.ts`
4. `src/utils/sql-parser/normalizers.ts`
5. `src/utils/sql-parser/astHandlers.ts`
6. `src/utils/SqlParser.ts` 保留编排入口与 `parse` / `parseAsync`

### 行数对比

| 文件 | 拆分前 | 拆分后 |
|------|--------|--------|
| `src/utils/SqlParser.ts` | 742 | 212 |
| `src/utils/sql-parser/astHandlers.ts` | — | 278 |
| `src/utils/sql-parser/normalizers.ts` | — | 101 |
| `src/utils/sql-parser/parserLoader.ts` | — | 37 |
| `src/utils/sql-parser/preprocessMysql.ts` | — | 108 |
| `src/utils/sql-parser/types.ts` | — | 19 |

---

## 验证结果

1. `bun run lint` ✅
2. `bun run test:run` ✅（65 files / 634 tests）

---

## 持续跟进

- 任务清单: `klips/klip-7-split-sql-parser/task_plan.md`
- 可选后续：将 `parseWithParser` 再进一步下沉为独立 core 模块
