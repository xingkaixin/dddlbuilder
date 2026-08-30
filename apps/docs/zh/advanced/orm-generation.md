# ORM 模型生成

本指南介绍如何使用筑表师将表结构一键转换为主流 ORM 框架的模型代码，打通数据库设计到后端工程开发的最后一公里。

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
