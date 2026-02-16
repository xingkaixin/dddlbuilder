---
created: "2026-02-16"
updated: "2026-02-16"
status: "completed"
priority: "P1"
---

# alterDdlGenerator.ts 拆分（klip-9）

**目标文件**: `src/utils/alterDdlGenerator.ts`（574 行）  
**创建日期**: 2026-02-16  
**完成日期**: 2026-02-16  
**优先级**: P1

---

## 问题记录

`alterDdlGenerator.ts` 原本在一个文件中同时处理：

1. 正向 ALTER 语句生成。
2. 回滚 DDL 语句生成。
3. 字段操作、索引操作、默认值组装等细节函数。

---

## 实施结果（最小改动）

按语句职责拆分到 `src/utils/alter-ddl/`，并保留旧入口兼容：

1. `src/utils/alter-ddl/defaultClause.ts`
2. `src/utils/alter-ddl/columnStatements.ts`
3. `src/utils/alter-ddl/indexStatements.ts`
4. `src/utils/alter-ddl/generateAlterDDL.ts`
5. `src/utils/alter-ddl/generateRollbackDDL.ts`
6. `src/utils/alter-ddl/index.ts`（聚合导出）
7. `src/utils/alterDdlGenerator.ts` 改为兼容导出层

对外 API 保持不变：
- `generateAlterDDL`
- `generateRollbackDDL`

### 行数对比

| 文件 | 拆分前 | 拆分后 |
|------|--------|--------|
| `src/utils/alterDdlGenerator.ts` | 574 | 3 |
| `src/utils/alter-ddl/columnStatements.ts` | — | 270 |
| `src/utils/alter-ddl/defaultClause.ts` | — | 39 |
| `src/utils/alter-ddl/indexStatements.ts` | — | 86 |
| `src/utils/alter-ddl/generateAlterDDL.ts` | — | 71 |
| `src/utils/alter-ddl/generateRollbackDDL.ts` | — | 103 |
| `src/utils/alter-ddl/index.ts` | — | 2 |

---

## 验证结果

1. `bun run lint` ✅
2. `bun run test:run` ✅（65 files / 634 tests）

---

## 持续跟进

- 任务清单: `klips/klip-9-split-alter-ddl-generator/task_plan.md`
- 可选后续：逐步增加 `generateRollbackDDL` 的单元测试覆盖
