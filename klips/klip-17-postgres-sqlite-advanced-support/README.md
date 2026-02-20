---
created: "2026-02-20"
updated: "2026-02-20"
status: "ready"
priority: "P1"
---

# PostgreSQL 深化与 SQLite 支持评估（klip-17）

## 背景与现状
- 当前已支持多数据库类型，`DatabaseType` 定义位于 `src/types/index.ts`，尚不含 `sqlite`。
- 已有 PostgreSQL 相关 DDL 策略与映射（`src/strategies/PostgresStrategy.ts`、`src/configs/typeMappings.ts`）。
- 现有高级面板偏向 MySQL 分区与 Citus 分片，PostgreSQL 特性面板尚未独立强化。

## 待解决问题
- PostgreSQL 用户缺少专属高级能力配置入口（如 JSONB/UUID/GIN 指向的交互配置）。
- SQLite 无一等公民类型，限制轻量场景用户覆盖面。

## 拟新增 API / 接口 / 类型草案
- `DatabaseType` 扩展：`'sqlite'`
- `PostgresAdvancedConfig`
- `SqliteTableConfig`
- `supportsFeature(dbType, feature)`

## 候选方案
### 方案 A：仅补 PostgreSQL 高级面板
- 优点：与现有策略体系更连续。
- 缺点：无法覆盖 SQLite 需求。

### 方案 B：PostgreSQL 深化 + SQLite 最小可用支持（推荐）
- 优点：兼顾深度与覆盖面。
- 缺点：需控制首期范围，避免一次性扩张过大。

### 方案 C：先只扩展类型映射，不做 UI
- 优点：研发成本低。
- 缺点：用户感知弱，产品价值释放慢。

## 影响面
- 组件：`src/components/App/TableConfig.tsx`、`src/components/App/TableOptionsPanel.tsx`、可能新增 Postgres/SQLite 面板
- Store：`appStore` 与可选配置 store
- Hooks：SQL 生成与配置归一化相关 hooks
- 服务：`/api/parse-sql` 的数据库类型校验（`api/routes/parseSql.ts`）
- 测试：策略测试、类型映射测试、E2E 数据库切换测试
- i18n：数据库名称与特性文案新增

## 风险与依赖
- 风险：数据库特性差异导致 UI 规则复杂化。
- 回归面：SQL 生成、SQL 导入解析、数据库切换下的状态清理。
- 依赖：策略层与映射层统一扩展。

## 评估矩阵
| 维度 | 评分(1-5) | 说明 |
|---|---:|---|
| 收益 | 4 | 用户覆盖面与专业能力提升 |
| 复杂度 | 4 | 涉及类型、策略、UI、导入链路 |
| 风险 | 3 | 规则差异可通过分阶段控制 |
| 可逆性 | 3 | 类型扩展后回滚成本中等 |

## 验收口径（评估 DoD）
- 明确 PostgreSQL 首期高级特性清单（最小可用集合）。
- 明确 SQLite 首期支持边界（DDL、导入、UI 能力）。
- 明确 `DatabaseType` 扩展与向后兼容策略。
- 输出 Go/Hold/Drop 结论与建议阶段。

## 下一步决策项
- Go：首期范围可控且价值明确。
- Hold：等待导出能力或解析能力先行。
- Drop：若阶段目标不包含数据库扩展。
