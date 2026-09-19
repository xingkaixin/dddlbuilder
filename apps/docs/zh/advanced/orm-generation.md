---
description: "将 MySQL 表结构转换为 Prisma 模型，查看完整输入输出示例，并了解筑表师支持的 ORM 框架、类型映射与使用限制。"
---

# ORM 模型生成

在[筑表师中生成 ORM 模型](https://ddl.xingkaixin.me/)。还没有表结构时，先按[快速开始](/zh/basic/getting-started)建表，或[导入已有 SQL](/zh/advanced/import-and-parse)。涉及跨表引用时，先核对[外键配置与 ER 图](/zh/advanced/foreign-key-and-er)。

SQLite / D1 目前提供 Drizzle 输出，跨表外键请使用整组导出。类型映射与初始化限制见[查询设计与业务建模](/zh/advanced/modeling-workflows)。

本指南介绍如何使用筑表师将表结构一键转换为主流 ORM 框架的模型代码，打通数据库设计到后端工程开发的最后一公里。

## 示例：将 MySQL 用户表转换为 Prisma 模型

本例只生成一张表的模型，不包含跨表关系。打开[筑表师](https://ddl.xingkaixin.me/)，选择 MySQL，按[SQL 导入步骤](/zh/advanced/import-and-parse)导入以下结构：

```sql
CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id ASC)
);
```

选中 `users`，切换右侧 **ORM** 标签，选择 **Prisma**。生成结果如下（对齐空格可能不同）：

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

适用于在表结构设计完成后，无需手动编写重复繁琐的模型类与注解，直接生成类型完备、映射精准的代码并无缝粘贴至项目工程中。

---

## 核心操作指引

### 1. 切换与选择目标框架
1. 在右侧输出面板中点击 **ORM** 标签页。
2. 在框架选择器中切换所需的目标框架：
   - **Prisma**（Node.js / TypeScript）
   - **TypeORM**（TypeScript / NestJS）
   - **SQLAlchemy**（Python / FastAPI / Django）
   - **GORM**（Go / Gin / Fiber）
   - **JPA / Hibernate**（Java / Spring Boot）
3. 代码区将实时渲染符合对应框架惯例与类型规范的模型代码。

### 2. 复制代码至项目工程
点击面板中的**复制ORM**按钮，一键将生成代码存入剪贴板，直接粘贴到项目的实体/模型文件中即可。

---

## 支持框架与映射规范

| ORM 框架 | 文件格式 | 典型类型与注解映射 |
|---|---|---|
| **Prisma** | `.prisma` schema | `@id`, `@default()`, `@map()`, `@unique`, `@@index`, `@@schema` |
| **TypeORM** | TypeScript 实体类 | `@Entity()`, `@PrimaryGeneratedColumn()`, `@Column({ type, precision })`, `@Index()` |
| **SQLAlchemy** | Python 类（Declarative） | `Column()`, `Integer()`, `String()`, `DECIMAL()`, `__table_args__` |
| **GORM** | Go 结构体 | `gorm.Model`, `gorm:"column:xxx;type:xxx;primaryKey;uniqueIndex"` |
| **JPA** | Java 实体类 | `@Entity`, `@Table(name, schema)`, `@Id`, `@Column(name, nullable)`, `@Index` |

---

## 高精度类型与 Schema 命名空间安全

::: info 类型安全与精度防丢失
- **大整数与高精度小数**：TypeORM 映射中，`bigint` 及精确小数（`decimal/numeric`）默认映射为 `string` 属性类型，防止 JavaScript 原生 `Number` 浮点数精度溢出。
- **Schema 命名空间**：
  - **Prisma**：在 PostgreSQL/SQL Server 下自动生成 `@@schema("schemaName")`。
  - **SQLAlchemy**：在 `__table_args__` 中声明 `schema='schemaName'`。
  - **JPA**：在 `@Table(schema = "schemaName")` 中指定命名空间。
  - **GORM**：直接生成带有限定名的 `TableName()` 绑定方法。
:::

---

## 校验与完成标志

- [ ] 生成的 ORM 代码字段名、类型映射与主键约束与表配置保持一致。
- [ ] 复制代码粘贴至后端工程后能够顺利通过类型检查与编译。
- [ ] 涉及 Schema 命名空间的配置在 ORM 代码中得到正确表达。
