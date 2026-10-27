---
title: "SQL 转 Prisma、TypeORM 等 ORM 模型"
description: "将 MySQL 建表 SQL 导入筑表师，导出 Prisma、TypeORM、SQLAlchemy、GORM 或 JPA 模型。通过输入输出示例了解类型映射、主键和关系处理限制。"
---

# SQL 转 Prisma、TypeORM 等 ORM 模型

在[筑表师中生成 ORM 模型](https://ddl.xingkaixin.me/)。还没有表结构时，先按[快速开始](/zh/basic/getting-started)建表，或[导入已有 SQL](/zh/advanced/import-and-parse)。涉及跨表引用时，先核对[外键配置与 ER 图](/zh/advanced/foreign-key-and-er)。

SQLite / D1 目前提供 Drizzle 输出，跨表外键请使用整组导出。类型映射与初始化限制见[查询设计与业务建模](/zh/advanced/modeling-workflows)。

## 示例：将 MySQL 用户表转换为 Prisma 模型

本例只生成一张表的模型，不包含跨表关系。打开[筑表师](https://ddl.xingkaixin.me/)，选择 MySQL，按[SQL 导入步骤](/zh/advanced/import-and-parse)导入以下结构：

```sql
CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id ASC)
);
```

选中 `users`，切换到生成结果的 **ORM 模型** 标签，选择 **Prisma**。生成结果如下（对齐空格可能不同）：

```prisma
model Users {
  id             Int        @id
  name           String
  @@map("users")
}
```

`id` 的主键约束映射为 `@id`，`name` 映射为必填的 `String`，`@@map("users")` 保留数据库表名。本例没有自增或默认值，插入记录时需要提供 `id` 和 `name`。

这是模型片段，使用前还需在自己的 Prisma 项目中配置 MySQL 数据源和客户端生成器，再校验模型并按项目流程生成客户端或迁移。生成模型不会连接或修改数据库。需要建模用户与订单的关联时，继续阅读[外键配置与 ER 图](/zh/advanced/foreign-key-and-er)。

## 适用场景

表结构确定后，直接生成 ORM 模型类和注解，不必手写。

---

## 核心操作指引

### 1. 切换与选择目标框架
1. 在生成结果中点击 **ORM 模型** 标签页。
2. 在 **ORM 框架** 选择器中选择目标框架：
   - **Prisma**（Node.js / TypeScript）
   - **TypeORM**（TypeScript / NestJS）
   - **SQLAlchemy**（Python / FastAPI）
   - **GORM**（Go / Gin / Fiber）
   - **JPA**（Java / Spring Boot）
3. 代码区显示所选框架的模型代码，表结构修改后同步更新。

### 2. 复制代码至项目工程
点击 **复制ORM代码**，再把代码粘贴到项目的实体或模型文件中。

---

## 支持框架与映射规范

| ORM 框架 | 文件格式 | 典型类型与注解映射 |
|---|---|---|
| **Prisma** | `.prisma` schema | `@id`, `@default()`, `@map()`, `@@unique`, `@@index`, `@@map`, `@@schema` |
| **TypeORM** | TypeScript 实体类 | `@Entity()`, `@PrimaryGeneratedColumn()`, `@PrimaryColumn()`, `@Column({ type, precision })`, `@Index()` |
| **SQLAlchemy** | Python 类（Declarative） | `Column()`, `Integer`, `String()`, `Numeric()`, `Index()`, `__table_args__` |
| **GORM** | Go 结构体 | `gorm:"column:xxx;primaryKey;autoIncrement;uniqueIndex"`, `TableName()` |
| **JPA** | Java 实体类 | `@Entity`, `@Table(name, schema)`, `@Id`, `@Column(name, nullable)` |

---

## 精度与 Schema 命名空间

::: info 精度与命名空间
- TypeORM 把 `bigint` 映射为 `string` 类型的属性。MySQL 系和 PostgreSQL 系数据库的 `decimal`、`numeric` 也映射为 `string`，避免 JavaScript 的 `number` 丢失精度。
- 填写了 Schema Name 时：
  - Prisma 在 PostgreSQL 系和 SQL Server 下生成 `@@schema("schemaName")`。
  - SQLAlchemy 在 `__table_args__` 中生成 `{"schema": "schemaName"}`。
  - JPA 生成 `@Table(schema = "schemaName")`，MySQL 系数据库下改用 `catalog`。
  - GORM 的 `TableName()` 方法返回带 Schema 前缀的表名。
:::

---

## 校验与完成标志

- [ ] ORM 代码中的字段名、类型映射和主键与表配置一致。
- [ ] 代码粘贴到项目后，能通过类型检查和编译。
- [ ] 填写了 Schema Name 时，ORM 代码中有对应的命名空间声明。
