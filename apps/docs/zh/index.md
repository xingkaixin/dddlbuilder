# 筑表师文档

欢迎查阅**筑表师（DDLBuilder）**官方用户文档。本手册旨在帮助你全面了解产品核心能力，并在实际数据库设计与开发中高效上手。

## 快速导航

### 基础入门
- [快速开始](/zh/basic/getting-started) —— 快速上手，几分钟内完成首张数据表的配置与 DDL 生成
- [核心概念](/zh/basic/core-concepts) —— 了解工作区、草稿箱、已保存表、权限与数据同步机制
- [表与字段配置](/zh/basic/table-and-fields) —— 掌握字段类型、约束规则、逻辑枚举与容量估算
- [索引、授权与杂项](/zh/basic/index-auth-misc) —— 配置主键/索引、AI 索引顾问、授权 DCL 与引擎参数
- [DDL 输出与分享](/zh/basic/ddl-and-share) —— 复制多方言 SQL、生成 ORM 模型与安全只读分享
- [已保存表与草稿箱](/zh/basic/saved-tables) —— 管理多草稿、文件夹分组、回收站及多端云同步

### 高级技巧
- [高级技巧概览](/zh/advanced/) —— 探索进阶设计与工程提效功能
- [导入与解析 SQL](/zh/advanced/import-and-parse) —— 快速解析已有 DDL 或从 CSV / Excel / JSON Schema 导入
- [WebMCP Agent 协作](/zh/advanced/webmcp) —— 借助 AI Agent 自动读取、检查与安全变更表结构
- [AI 辅助建表流程](/zh/advanced/ai-workflow) —— 对话式生成表结构、字段与索引修改清单及智能注释
- [评审与解释 SQL](/zh/advanced/review-and-explain) —— 架构师级别质量评分、优化建议与 SQL 语义解释
- [分区与分片配置](/zh/advanced/partition-and-sharding) —— MySQL/TiDB 分区与 PostgreSQL Citus 分布式分片
- [变更对比与回滚](/zh/advanced/diff-and-rollback) —— 差异比对、自动生成 ALTER 变更脚本与回滚 DDL
- [外键配置与 ER 图](/zh/advanced/foreign-key-and-er) —— 可视化连线建模、基数约束向导与关系拓扑展示
- [ORM 模型生成](/zh/advanced/orm-generation) —— 一键导出 Prisma、TypeORM、SQLAlchemy、GORM 与 JPA 模型
- [视图与 Routine 配置](/zh/advanced/view-and-routine) —— 视图 DDL 及存储过程、函数、触发器代码骨架
- [Schema 规范检查](/zh/advanced/schema-lint) —— 自动扫描命名规范、类型选择风险与索引冗余
- [Mock 数据与逻辑枚举](/zh/advanced/mock-data-and-enum) —— 一键生成测试数据与字段业务取值规范
- [表蓝图模板](/zh/advanced/blueprint-templates) —— 内置用户、订单、日志等标准业务模板，一键复用

### 常见问题与版本
- [报错与失败处理](/zh/faq/common-errors) —— 导入失败、复制异常、分享过期或同步排错
- [功能入口与可见性](/zh/faq/feature-visibility) —— 特定方言配置项、面板展开与入口定位
- [分享与协作](/zh/faq/sharing-and-collaboration) —— 只读协作、副本编辑与版本管理解答
- [更新日志](/zh/changelog/changelog) —— 了解最新功能演进与版本更新记录

## 核心特性一览

- **多数据库方言支持**：支持 MySQL、PostgreSQL、SQL Server、Oracle、TiDB、MariaDB、OceanBase、达梦、GaussDB、Kingbase、GBase、PolarDB 等主流数据库，精准输出符合各方言标准的 DDL 与 DCL。
- **现代化可视化建模**：支持字段拖拽、紧凑布局、冻结列、多标签页并行编辑与 ER 关系图可视化连线。
- **多语言与跨端同步**：基于 CRDT（Yjs）技术实现工作区多标签管理、增量同步与多设备状态一致，支持中、英、日多语言无缝切换。
- **AI 深度赋能**：集成 AI 建表工坊、增量修改建议、AI 索引优化顾问、DDL 架构评审与智能注释生成。
- **工程化无缝对接**：支持一键生成主流 ORM 模型代码、Mock 测试数据导出、SQL 逆向解析与 Schema 规范自动检查。
