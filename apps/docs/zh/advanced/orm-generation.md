# ORM 模型生成

## 使用对象

适合需要把表结构直接翻译成业务项目 ORM 模型代码的使用者。

## 解决问题

你不需要在 DDL 和 ORM 模型之间手动翻译，系统可按目标框架直接生成模型代码，减少重复劳动与类型不一致风险。

## 前置条件

- 当前表已完成字段配置，右侧 DDL 已生成。
- 已明确业务项目使用的 ORM 框架。

## 操作步骤

1. 在右侧输出区点击 `ORM` 标签。结果：出现框架选择器与生成代码。
2. 在框架选择器中切换目标（Prisma、TypeORM、SQLAlchemy、GORM、JPA）。结果：代码按该框架语法实时刷新。
3. 检查生成结果中的字段类型映射、主键定义、索引注解是否符合预期。结果：类型映射遵循各框架惯例，如 `varchar` → Prisma 的 `String`、TypeORM 的 `varchar`、JPA 的 `@Column` 等。
4. 点击 `复制ORM`。结果：代码进入剪贴板，可直接粘贴到业务项目。

## 支持框架与映射要点

| 框架 | 文件格式 | 典型映射 |
|---|---|---|
| Prisma | `.prisma` schema | `String`、`Int`、`DateTime`、`@id`、`@index` |
| TypeORM | TypeScript 装饰器 | `@Entity()`、`@Column()`、`@PrimaryGeneratedColumn()` |
| SQLAlchemy | Python class | `Column()`、`Integer()`、`String()`、`relationship()` |
| GORM | Go struct | `gorm.Model`、tag 形式的 `gorm:"column;type"` |
| JPA | Java 注解 | `@Entity`、`@Table`、`@Id`、`@Column`、`@Index` |

## 完成标志

- ORM 代码已成功复制到剪贴板。
- 字段类型、主键、索引在 ORM 代码中都有对应表达。
- 粘贴到业务项目后可直接编译/运行，无需大规模调整。

## 易错点

- ORM 生成基于当前表结构快照，字段变更后需重新复制，不会自动同步。
- 部分框架的复杂关系（如多对多中间表）可能需要额外手工调整。
- 枚举类型在不同 ORM 中的表达差异较大（如 Prisma enum vs JPA `@Enumerated`），生成后建议复核。
- `Schema Name` 只影响物理表映射，不会拼入模型、类或结构体名称。TypeORM 使用 schema/database，SQLAlchemy 使用 `__table_args__`，JPA 使用 schema/catalog，GORM 使用限定表名。
- Prisma 在 PostgreSQL、SQL Server 下生成 `@@schema`，需要同时把该 schema 加入数据源的 `schemas` 列表；MySQL 则需要在连接配置中选择对应数据库，不生成 `@@schema`。
