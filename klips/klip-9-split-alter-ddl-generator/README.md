---
created: "2026-02-16"
updated: "2026-02-16"
status: "planned"
priority: "P1"
---

# alterDdlGenerator.ts 拆分（klip-9）

**目标文件**: `src/utils/alterDdlGenerator.ts`（574 行）  
**创建日期**: 2026-02-16  
**优先级**: P1

---

## 问题记录

`alterDdlGenerator.ts` 在一个文件中处理了：

1. 正向 ALTER 语句生成。
2. 回滚 DDL 语句生成。
3. 字段操作、索引操作、默认值组装等细节函数。

**风险**：
- 不同类型语句生成逻辑耦合，改动时回归范围扩大。
- 数据库方言分支较多，不利于定向扩展。

---

## 拆分边界（最小改动）

1. `src/utils/alter-ddl/columnStatements.ts`
2. `src/utils/alter-ddl/indexStatements.ts`
3. `src/utils/alter-ddl/defaultClause.ts`
4. `src/utils/alter-ddl/generateAlterDDL.ts`
5. `src/utils/alter-ddl/generateRollbackDDL.ts`

对外保持 `generateAlterDDL` / `generateRollbackDDL` 接口不变。

---

## 验证计划

1. `bun run lint`
2. `bun run test:run`（重点关注 `alterDdlGenerator` 相关测试）

---

## 持续跟进

- 任务清单: `klips/klip-9-split-alter-ddl-generator/task_plan.md`
