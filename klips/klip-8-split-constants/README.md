---
created: "2026-02-16"
updated: "2026-02-16"
status: "completed"
priority: "P1"
---

# constants.ts 拆分（klip-8）

**目标文件**: `src/utils/constants.ts`（885 行）  
**创建日期**: 2026-02-16  
**完成日期**: 2026-02-16  
**优先级**: P1

---

## 问题记录

`constants.ts` 原本存在体量大且类型混放的问题：

1. 数据库选项与 UI 常量混合。
2. 各数据库保留字集合集中在同文件。
3. 默认值选项、列头、存储 key 与保留字并列。

---

## 实施结果（最小改动）

采用“兼容式拆分”，不破坏现有引用路径：

1. 新增 `src/utils/constants/databaseOptions.ts`
2. 新增 `src/utils/constants/reservedKeywords.ts`
3. 新增 `src/utils/constants/uiDefaults.ts`
4. 新增 `src/utils/constants/index.ts` 统一导出
5. `src/utils/constants.ts` 改为兼容层 re-export（保留 `@/utils/constants` 用法）

### 行数对比

| 文件 | 拆分前 | 拆分后 |
|------|--------|--------|
| `src/utils/constants.ts` | 885 | 3 |
| `src/utils/constants/databaseOptions.ts` | — | 28 |
| `src/utils/constants/reservedKeywords.ts` | — | 829 |
| `src/utils/constants/uiDefaults.ts` | — | 25 |
| `src/utils/constants/index.ts` | — | 3 |

---

## 验证结果

1. `bun run lint` ✅
2. `bun run test:run` ✅（65 files / 634 tests）

---

## 持续跟进

- 任务清单: `klips/klip-8-split-constants/task_plan.md`
- 可选后续：按模块逐步把业务代码从 `@/utils/constants` 迁移到更细粒度路径
