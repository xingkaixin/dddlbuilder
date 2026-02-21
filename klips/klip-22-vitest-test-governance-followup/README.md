---
created: "2026-02-21"
updated: "2026-02-21"
status: "in_progress"
priority: "P1"
---

# Vitest 测试治理审查与持续跟进（klip-22）

## 文档目的
- 固化本轮 Vitest 审查结论，先记录、后实施，避免问题丢失。
- 建立可持续跟进的清单，后续每次变更可直接回填状态。
- 本文档仅记录，不包含业务代码改动。

## 审查范围与方法
- 配置审查：`vitest.config.ts`、`package.json`、`src/__tests__/setup.ts`
- 基线验证：
  - `bun run test:run`
  - `bun run test:coverage`
- 结构核对：
  - 测试目录分布与策略文件覆盖情况
  - API 路由关键分支测试是否齐全
  - `test.only/skip` 与 `describe.only/skip` 扫描

## 当前基线快照（2026-02-21）
- 单测结果：`117` 个测试文件、`917` 个用例，全部通过。
- 覆盖率结果（v8）：
  - Statements `95.71%`
  - Branches `86.23%`
  - Functions `95.95%`
  - Lines `97.11%`
- 阈值门禁（`vitest.config.ts`）：
  - branches `85`
  - functions `95`
  - lines `90`
  - statements `90`
- 扫描结果：
  - 未发现 `.only/.skip` 留存（`src`、`api` 测试范围内）。

## 发现详情

### F-001（P1）SQL Server 表注释 DDL 层级类型错误
- 位置：
  - `src/strategies/SqlServerStrategy.ts:68`
  - `src/strategies/SqlServerStrategy.ts:75`
- 现象：
  - 生成表注释时，`@level1type` 在有 schema 场景下被设置为 `N'COLUMN'`。
  - 按 SQL Server `sp_addextendedproperty` 语义，表注释应指向 `N'TABLE'`。
- 复现命令：
  - `bun -e "import { SqlServerStrategy } from './src/strategies/SqlServerStrategy.ts'; const s=new SqlServerStrategy(); console.log(s.generateTableDDL('dbo.users','表注释',[{name:'id',type:'int',nullable:false,comment:'',defaultKind:'none',defaultValue:'',onUpdate:'none'}]));"`
- 复现输出关键片段（实际）：
  - `@level1type = N'COLUMN', @level1name = N'users'`
- 影响：
  - 可能导致表级注释落点不正确，SQL 执行语义偏离预期。
- 建议：
  - 修正 `level1type` 生成逻辑（表注释固定为 `TABLE`）。
  - 新增 SQLServer 策略回归用例，覆盖 schema/无 schema 两种路径。
- 验收口径：
  - 新增测试可稳定拦截该问题，且 `bun run test:run` 通过。

### F-002（P2）覆盖率门禁存在统计盲区
- 位置：
  - `vitest.config.ts:27`（`coverage.include` 仅含 `src`）
  - `vitest.config.ts:30`（排除 `src/**/components/**/*`）
- 现象：
  - `api` 代码不进入 coverage 阈值统计。
  - `components` 目录下的业务 hook/逻辑文件被整体排除，存在“高覆盖但漏风险”。
- 影响：
  - 覆盖率数字无法完整反映真实回归保护能力。
- 建议：
  - 将 `api/**/*.{ts,tsx}` 纳入统计。
  - 缩小排除范围，避免整体排除 `components`，改为仅排除纯展示层。
- 验收口径：
  - 覆盖率配置调整后仍满足阈值，且新增统计项可被 CI 感知。

### F-003（P2）核心数据库策略缺少直接单测
- 目标文件：
  - `src/strategies/MySqlStrategy.ts`
  - `src/strategies/PostgresStrategy.ts`
  - `src/strategies/SqlServerStrategy.ts`
  - `src/strategies/OracleStrategy.ts`
- 现象：
  - `src/__tests__/strategies/` 已覆盖多种方言，但上述 4 个核心策略暂无对应测试文件。
- 影响：
  - 关键 DDL 规则回归只能间接暴露，定位与防回归能力不足。
- 建议新增测试文件（草案）：
  - `src/__tests__/strategies/mysql-strategy.test.ts`
  - `src/__tests__/strategies/postgres-strategy.test.ts`
  - `src/__tests__/strategies/sqlserver-strategy.test.ts`
  - `src/__tests__/strategies/oracle-strategy.test.ts`
- 重点覆盖：
  - 自增、默认值（常量/时间/uuid）、注释、schema.table 命名与转义。
- 验收口径：
  - 四类策略均有基础行为用例，覆盖主要分支。

### F-004（P3）`parse-sql` 路由关键错误分支覆盖不全
- 位置：
  - `api/routes/parseSql.ts:47`（SQL_REQUIRED）
  - `api/routes/parseSql.ts:60`（INVALID_DATABASE_TYPE）
  - `api/routes/parseSql.ts:75`（SQL_PARSE_FAILED）
- 现象：
  - 现有 `api/__tests__/index.test.ts` 已覆盖 413 和 SQL_TOO_LONG，但未直接覆盖上述分支。
- 影响：
  - 输入校验与异常语义缺少回归保护，线上错误码稳定性存在风险。
- 建议：
  - 新增 `api/__tests__/parse-sql-route.test.ts`，补齐上述分支断言。
- 验收口径：
  - 关键错误码与消息的单测断言齐全并稳定通过。

## 统一优先级与执行建议
1. 第一批（必须先做）：F-001
2. 第二批（质量加固）：F-003 + F-004
3. 第三批（治理完善）：F-002

## 持续跟进记录模板
每次更新请补充一条，便于审计与回溯：

| 日期 | 事项ID | 动作 | 结果 | 备注 |
|------|--------|------|------|------|
| 2026-02-21 | F-001~F-004 | 建立问题基线 | Open | 待进入修复批次 |
| 2026-02-21 | F-001 | Phase 1 修复 + 回归测试 | Resolved | 新增 `sqlserver-strategy.test.ts`，`bun run test:run` 118 files / 919 tests 全通过 |
| 2026-02-21 | F-003 | Phase 2 核心策略补测 | Resolved | 新增 `mysql-strategy.test.ts`、`postgres-strategy.test.ts`、`oracle-strategy.test.ts`，与既有 `sqlserver-strategy.test.ts` 共同覆盖四大核心策略，`bun run test:run` 122 files / 928 tests 全通过 |
| 2026-02-21 | F-004 | Phase 3 路由错误分支补测 | Resolved | 新增 `api/__tests__/parse-sql-route.test.ts`，覆盖 `SQL_REQUIRED`/`INVALID_DATABASE_TYPE`/`SQL_PARSE_FAILED`，`bun run test:run` 119 files / 922 tests 全通过 |

## 当前状态结论
- 当前测试“可通过”，但并非“无风险”。
- 已完成问题清单基线化，下一步可按 `task_plan.md` 分批执行。
