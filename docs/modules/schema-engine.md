# 表结构建模与生成

范围：`packages/ddl-core`、`packages/shared-types` 中的表结构类型，以及 `apps/web` 中调用它们的编辑器和数据库工具。

## 职责

- 由表结构生成 DDL、DCL、视图和 Routine 骨架
- 生成 ORM 模型：Prisma、TypeORM、SQLAlchemy、GORM、JPA；SQLite 另有 Drizzle
- 单表 diff，生成 ALTER 与回滚 DDL；多表快照对比与迁移 SQL
- SQL 解析，通过子路径 `@ddlbuilder/ddl-core/parser` 导出
- 数据库工具算法：数据字典、关联测试数据、查询设计、业务模块、SQLite/D1 导出、字段影响分析、跨方言兼容性评估、快照刷新
- 业务数据导入的解析、推断和校验（`data-import/`）

## 结构

- `strategies/`：方言策略。SQLite 和 Hive 有专门实现，其余方言共用 `ProfiledDDLStrategy`，差异集中在 `dialectProfiles.ts` 的 `DialectProfile` 中，包括 identity、内置函数、子句顺序、注释方式等。
- `utils/databaseFamily.ts`：把具体方言映射到家族（mysql、postgresql、sqlserver、oracle、dm、hive、sqlite），家族级配置再展开到每个方言。
- `configs/`：类型映射、ORM 类型映射、保留字。
- `factories/`、`generators/`：DDL 策略工厂和各 ORM 生成器。
- `utils/tableDiff.ts`、`utils/alter-ddl/`、`utils/schemaComparison.ts`：diff 与变更 SQL。
- `parser/`：SQL 解析。

## 设计原则

1. 纯函数库。只依赖 `shared-types` 和 SQL 解析器，不访问网络、存储、DOM 或 Worker bindings。需要随机数据时使用种子，同一输入得到同一输出。
2. 方言差异写成配置。新增方言优先作为已有家族的 profile；只有语法模型明显不同（如 Hive、SQLite）才新增策略类。
3. 家族复用基础规则。保留字按“家族基表 + 变体增量”组织，例如 MySQL 系以 MySQL 8.0 完整保留字为基表；类型映射和标识符长度按家族配置。
4. 标识符只在需要时加引号。名称比较和超长截断遵循方言规则，但不改写用户保存的名称。
5. 无法安全生成时明确标记。ALTER 和结构对比中无法安全表达的变更输出 `-- Manual migration required`；ORM 不支持的类型或外键输出 `Manual mapping required`。不生成部分正确的 SQL，也不静默丢弃。
6. 不产生隐式副作用对象。例如 Oracle 建表不自动创建 PUBLIC SYNONYM。
7. 逻辑关系只用于文档和 ER 图，不生成物理外键或索引，也不改变字段可空性。
8. 旧数据格式只在解码边界兼容，内部只保留一种表示。例如索引类型只以 `IndexDefinition.kind` 表示，旧的布尔字段在读取时转换。
9. 不提前抽象。新增导出格式直接增加生成函数，不预建插件系统或任务框架。

## 与其他模块的边界

- Web 在浏览器中直接调用 ddl-core，生成过程不经过服务端。
- Worker 只使用解析器（`/api/parse-sql`、`/api/parse-multi-sql`）和快照对比（变更提案）。
- 表结构值类型在 `shared-types`。持久化数据的历史兼容解码在 `workspace-core`，ddl-core 不处理存储格式。
