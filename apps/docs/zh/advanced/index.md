# 高级技巧概览

欢迎进入筑表师高级技巧专栏。本部分面向需要应对复杂架构设计、工程化提效、团队规范把控与自动化协作的深度用户。

---

## 核心专题导航

| 专题模块 | 核心能力与解决问题 | 推荐阅读 |
|---|---|---|
| **数据导入与解析** | 逆向解析既有 SQL、从 CSV/Excel/JSON Schema 一键导入结构 | [导入与解析 SQL](/zh/advanced/import-and-parse) |
| **智能 Agent 协作** | 通过 WebMCP 协议赋能浏览器 AI Agent 自动读取、检查与修改表 | [WebMCP Agent 协作](/zh/advanced/webmcp) |
| **AI 辅助全流程** | 对话式建表、小步审查改表清单、AI 索引顾问与智能业务注释 | [AI 辅助建表流程](/zh/advanced/ai-workflow) |
| **SQL 评审与解释** | 专家级 DDL 质量打分、风险隐患排查、优化建议及 SQL 语义解析 | [评审与解释 SQL](/zh/advanced/review-and-explain) |
| **分布式与海量数据** | MySQL/TiDB 多维度分区策略与 PostgreSQL Citus 分布式分片 | [分区与分片配置](/zh/advanced/partition-and-sharding) |
| **版本对比与回滚** | 可视化结构 Diff 比对、正向 ALTER 脚本与原子回滚 DDL 生成 | [变更对比与回滚](/zh/advanced/diff-and-rollback) |
| **关系建模与 ER 图** | 可视化连线交互、关系基数向导、级联动作与整体数据拓扑 | [外键配置与 ER 图](/zh/advanced/foreign-key-and-er) |
| **工程代码对接** | 一键导出 Prisma、TypeORM、SQLAlchemy、GORM、JPA 框架模型 | [ORM 模型生成](/zh/advanced/orm-generation) |
| **高级数据库对象** | 视图 DDL（`CREATE VIEW`）与存储过程、函数、触发器代码骨架 | [视图与 Routine 配置](/zh/advanced/view-and-routine) |
| **Schema 规范审查** | 内置 Lint 引擎自动扫描字段命名、高危类型与无效冗余索引 | [Schema 规范检查](/zh/advanced/schema-lint) |
| **测试与业务规范** | 一键生成批量 Mock 测试数据与字段逻辑枚举（颜色标记与展示） | [Mock 数据与逻辑枚举](/zh/advanced/mock-data-and-enum) |
| **业务场景蓝图** | 开箱即用的标准业务模型库（用户、订单、操作日志等），秒级起步 | [表蓝图模板](/zh/advanced/blueprint-templates) |

---

## 学习与实践建议

- **存量迁移**：建议优先阅读 [导入与解析 SQL](/zh/advanced/import-and-parse)，将已有 DDL 逆向解析入库。
- **架构设计**：结合 [外键配置与 ER 图](/zh/advanced/foreign-key-and-er) 与 [表蓝图模板](/zh/advanced/blueprint-templates) 搭建全局模型。
- **质量把控**：发布前利用 [Schema 规范检查](/zh/advanced/schema-lint) 与 [评审与解释 SQL](/zh/advanced/review-and-explain) 消除隐患。
- **上线交付**：通过 [变更对比与回滚](/zh/advanced/diff-and-rollback) 生成生产发布与故障回退方案。
