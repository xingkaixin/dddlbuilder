# 高级技巧概览

这一部分按专题介绍筑表师的进阶功能。下表列出每个专题的内容和对应页面。

---

## 专题导航

| 专题 | 内容 | 页面 |
|---|---|---|
| 数据库交付工具 | 多表数据字典、两份 SQL 结构对比与关联测试数据 | [数据库工具](/zh/advanced/database-tools) |
| 数据导入与解析 | 解析已有 SQL，从 CSV、Excel、JSON Schema 导入表结构 | [导入与解析 SQL](/zh/advanced/import-and-parse) |
| WebMCP Agent 协作 | 浏览器中的 AI Agent 通过 WebMCP 读取、检查和修改表 | [WebMCP Agent 协作](/zh/advanced/webmcp) |
| AI 辅助建表 | 对话式建表、逐项确认 AI 提出的改表变更、AI 补全注释 | [AI 辅助建表流程](/zh/advanced/ai-workflow) |
| SQL 评审与解释 | DDL 评分、风险排查、优化建议及 SQL 片段解释 | [评审与解释 SQL](/zh/advanced/review-and-explain) |
| 分区与分片 | MySQL/TiDB 分区与 PostgreSQL Citus 分片 | [分区与分片配置](/zh/advanced/partition-and-sharding) |
| 变更对比与回滚 | 结构 Diff、正向 ALTER 脚本与回滚 DDL | [变更对比与回滚](/zh/advanced/diff-and-rollback) |
| 关系建模与 ER 图 | 物理外键与逻辑关系建模，记录基数、可选性和业务说明 | [外键配置与 ER 图](/zh/advanced/foreign-key-and-er) |
| 字段标准与业务词典 | 定义标准字段、关联业务概念、检查已保存表的偏差并导入导出标准库 | [字段标准库与业务词典](/zh/advanced/field-standards) |
| ORM 模型生成 | 导出 Prisma、TypeORM、SQLAlchemy、GORM、JPA 模型 | [ORM 模型生成](/zh/advanced/orm-generation) |
| 视图与程序单元 | 视图 DDL（`CREATE VIEW`）与存储过程、函数、触发器代码骨架 | [视图与 Routine 配置](/zh/advanced/view-and-routine) |
| Schema 规范检查 | 检查命名、主键、字段类型、索引和审计字段 | [Schema 规范检查](/zh/advanced/schema-lint) |
| Mock 数据与逻辑枚举 | 批量生成 Mock 测试数据，为字段配置带颜色标记的逻辑枚举 | [Mock 数据与逻辑枚举](/zh/advanced/mock-data-and-enum) |
| 表蓝图模板 | 把一张表保存为整表蓝本，在新草稿中复用字段、索引和表级配置 | [表蓝图模板](/zh/advanced/blueprint-templates) |

---

## 按场景阅读

- 迁移已有数据库时，先读 [导入与解析 SQL](/zh/advanced/import-and-parse)，把已有 DDL 解析成可编辑的表。
- 设计多张相关的表时，结合 [外键配置与 ER 图](/zh/advanced/foreign-key-and-er) 与 [表蓝图模板](/zh/advanced/blueprint-templates)。
- 发布前用 [Schema 规范检查](/zh/advanced/schema-lint) 与 [评审与解释 SQL](/zh/advanced/review-and-explain) 检查表结构。
- 上线前用 [变更对比与回滚](/zh/advanced/diff-and-rollback) 生成发布脚本和回滚脚本。
