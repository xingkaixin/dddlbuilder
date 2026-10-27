---
title: "在线数据库设计、SQL 转 ER 图与 DDL 生成指南"
description: "用筑表师在线设计 MySQL、PostgreSQL、SQLite 表结构。按任务查找 SQL 转 ER 图、SQL 转 Prisma、数据字典导出、结构对比和 CSV 转 INSERT SQL 的操作指南。"
---

# 在线数据库设计、SQL 转 ER 图与 DDL 生成指南

筑表师（DDLBuilder）是在线数据库设计与 DDL 生成工具。你可以配置字段和索引，导入已有 SQL 查看 ER 图，或导出 ORM 模型。下面按具体任务选择指南。

[打开筑表师，开始设计数据库](https://ddl.xingkaixin.me/)

## 按任务选择指南

| 你要完成的任务 | 操作与产物 |
| --- | --- |
| [生成 MySQL、PostgreSQL 建表语句](/zh/basic/getting-started) | 配置字段、主键和索引，复制 CREATE TABLE SQL |
| [SQL 转 ER 图](/zh/advanced/foreign-key-and-er) | 导入并保存表结构，建立外键或逻辑关系，查看关系图 |
| [SQL 转 Prisma 等 ORM 模型](/zh/advanced/orm-generation) | 将表结构转换为 Prisma、TypeORM、SQLAlchemy、GORM 或 JPA 代码 |
| [对比两份 SQL 表结构](/zh/advanced/database-tools#两份-sql-的结构对比) | 查看 MySQL 或 PostgreSQL 的结构差异，导出迁移 SQL |
| [从 SQL 生成数据字典](/zh/advanced/database-tools#数据字典) | 导出 Markdown 或带搜索的离线 HTML 文档 |
| [CSV、Excel 转 INSERT SQL](/zh/advanced/business-data-import) | 映射字段、校验记录并导出数据 SQL 与错误清单 |
| [设计 SQL 查询与业务表](/zh/advanced/modeling-workflows) | 根据表关系生成 SELECT，创建业务模块和 SQLite/D1 初始化项目 |

手动设计、SQL 导入与本地导出可以先从未登录状态开始。云同步和 AI 功能的账户要求见[快速开始](/zh/basic/getting-started)。工具生成 SQL，不连接你的数据库执行语句。

## 快速导航

### 基础入门
- [快速开始](/zh/basic/getting-started)：配置第一张表并生成 DDL
- [核心概念](/zh/basic/core-concepts)：工作区、草稿箱、已保存表、只读分享与云同步
- [表与字段配置](/zh/basic/table-and-fields)：字段类型、约束、逻辑枚举与容量估算
- [索引、授权与杂项](/zh/basic/index-auth-misc)：主键与索引、AI 索引顾问、授权 DCL 与存储参数
- [DDL 输出与分享](/zh/basic/ddl-and-share)：复制 SQL、生成 ORM 模型、创建只读分享链接
- [已保存表与草稿箱](/zh/basic/saved-tables)：草稿、文件夹、回收站与多设备同步

### 高级技巧
- [高级技巧概览](/zh/advanced/)：高级功能的专题列表
- [导入与解析 SQL](/zh/advanced/import-and-parse)：解析已有 DDL，或从 CSV、Excel、JSON Schema 导入表结构
- [WebMCP Agent 协作](/zh/advanced/webmcp)：浏览器中的 AI Agent 读取、检查表结构，修改需要你确认
- [AI 辅助建表流程](/zh/advanced/ai-workflow)：用自然语言生成表结构，逐项确认 AI 修改，补全字段注释
- [评审与解释 SQL](/zh/advanced/review-and-explain)：DDL 评分与修改建议，SQL 片段解释
- [分区与分片配置](/zh/advanced/partition-and-sharding)：MySQL/TiDB 分区与 PostgreSQL Citus 分片
- [变更对比与回滚](/zh/advanced/diff-and-rollback)：结构差异对比，生成 ALTER 脚本与回滚 DDL
- [外键配置与 ER 图](/zh/advanced/foreign-key-and-er)：在 ER 图中创建外键或逻辑关系，查看表之间的关系
- [ORM 模型生成](/zh/advanced/orm-generation)：导出 Prisma、TypeORM、SQLAlchemy、GORM 与 JPA 模型
- [视图与 Routine 配置](/zh/advanced/view-and-routine)：视图 DDL 及存储过程、函数、触发器代码骨架
- [Schema 规范检查](/zh/advanced/schema-lint)：检查命名、主键、字段类型与索引问题
- [Mock 数据与逻辑枚举](/zh/advanced/mock-data-and-enum)：生成测试数据，为字段配置枚举取值
- [表蓝图模板](/zh/advanced/blueprint-templates)：把一张表保存为整表蓝本，在新草稿中复用

### 常见问题与版本
- [报错与失败处理](/zh/faq/common-errors)：导入失败、复制失败、分享过期与同步异常
- [功能入口与可见性](/zh/faq/feature-visibility)：某些标签页或按钮不显示的原因
- [分享与协作](/zh/faq/sharing-and-collaboration)：只读分享、保存副本与草稿箱的区别
- [更新日志](/zh/changelog/changelog)：各版本的更新记录

## 主要功能

- 支持 16 种数据库类型：MySQL、MariaDB、TiDB、PolarDB、OceanBase（MySQL 与 Oracle 模式）、PostgreSQL、PostgreSQL（Citus）、GaussDB、Kingbase、GBase、SQL Server、Oracle、达梦、SQLite / D1 和 Hive，按所选数据库生成 DDL 和 DCL。
- 字段可以拖拽排序、冻结前几列；多个标签页同时编辑不同的表；在 ER 关系图中连线建立表关系。
- 登录后，工作区通过 Yjs（CRDT）在多台设备间增量同步。界面支持中文、英文和日文。
- AI 功能包括大师建表工坊、AI 修改、AI 索引顾问、大师评审和 AI 注释。
- 生成 Prisma、TypeORM、SQLAlchemy、GORM、JPA 模型代码和 Mock 测试数据，从 SQL 导入表结构，检查结构规范。
