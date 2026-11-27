---
title: "达梦 / Oracle / 国产数据库建表 DDL 在线生成"
description: "在线可视化设计达梦（Dameng）、Oracle、人大金仓（Kingbase）、GaussDB、OceanBase（Oracle/MySQL）、GBase 与 PolarDB 建表 DDL，自动生成 IDENTITY、SYSDATE、COMMENT ON 与 TABLESPACE 语法。"
preset: "dm-oracle"
faq:
  - question: "筑表师支持哪些国产数据库和信创数据库方言？"
    answer: "支持达梦（Dameng）、人大金仓（Kingbase）、GaussDB、OceanBase（MySQL 与 Oracle 模式）、PolarDB、TiDB 和 GBase，同时完整支持 Oracle、MySQL、PostgreSQL 和 SQL Server。"
  - question: "达梦和 Oracle 建表语句里的注释和自增是如何处理的？"
    answer: "达梦与 Oracle 均在建表后生成独立的 COMMENT ON TABLE / COMMENT ON COLUMN 语句；达梦自增列输出 IDENTITY(1,1)，默认当前时间按方言映射为 SYSDATE，并支持配置 TABLESPACE。"
  - question: "可以先把 MySQL 表结构导入，再切换为达梦或 Oracle 输出吗？"
    answer: "可以。你可以导入已有 SQL 到工作区后切换目标数据库类型查看对应的 DDL 语法；正式上线前仍需结合目标库版本和业务规则人工审阅字段类型与约束。"
---

# 达梦 / Oracle / 国产数据库建表 DDL 在线生成

筑表师（DDLBuilder）面向信创和企业级数据库场景，内置 **达梦（Dameng）**、**Oracle**、**OceanBase（Oracle / MySQL 模式）**、**人大金仓（Kingbase）**、**GaussDB**、**GBase**、**PolarDB** 与 **TiDB** 方言规则，按真实方言语法生成 `IDENTITY`、表空间 `TABLESPACE`、独立 `COMMENT ON` 与索引语句，无需手写易错的方言差异。

## 真实 DDL 输出示例：达梦（Dameng）审批记录表

点击本页示例按钮会在筑表师新草稿中打开以下达梦数据库表，你可以一键切换为 Oracle、Kingbase、GaussDB 或 OceanBase（Oracle 模式）对比生成差异：

```sql
CREATE TABLE OA.approval_records (
  id BIGINT IDENTITY(1,1) NOT NULL,
  biz_no VARCHAR(64) NOT NULL,
  applicant_id BIGINT NOT NULL,
  status SMALLINT NOT NULL DEFAULT 0,
  remark VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT SYSDATE
) TABLESPACE MAIN;
COMMENT ON TABLE OA.approval_records IS '审批记录表';
COMMENT ON COLUMN OA.approval_records.id IS '主键ID';
COMMENT ON COLUMN OA.approval_records.biz_no IS '业务单据号';
COMMENT ON COLUMN OA.approval_records.applicant_id IS '申请人ID';
COMMENT ON COLUMN OA.approval_records.status IS '审批状态：0-待审批，1-通过，2-驳回';
COMMENT ON COLUMN OA.approval_records.remark IS '审批意见';
COMMENT ON COLUMN OA.approval_records.created_at IS '创建时间';

ALTER TABLE OA.approval_records ADD CONSTRAINT pk_approval_records PRIMARY KEY (id);
CREATE UNIQUE INDEX uk_approval_records_biz_no ON OA.approval_records (biz_no ASC);
CREATE INDEX idx_approval_records_applicant ON OA.approval_records (applicant_id ASC);
```

## 覆盖的国产与企业级数据库方言

| 数据库方言 | 适用语法特点 |
| --- | --- |
| **达梦（Dameng）** | `IDENTITY(1,1)`、`SYSDATE`、独立 `COMMENT ON`、`TABLESPACE` |
| **Oracle** | 独立 `COMMENT ON`、表空间与 `PCTFREE` / `INITRANS` 存储选项、约束与索引 |
| **OceanBase（Oracle / MySQL）** | 区分 Oracle 模式与 MySQL 模式建表语法与分区能力 |
| **Kingbase（人大金仓）** | PostgreSQL 系语法，Schema 限定、独立注释与索引 |
| **GaussDB** | PostgreSQL 系建表、注释、约束与索引语法 |
| **GBase / PolarDB / TiDB** | MySQL 系语法，支持表选项与分区配置 |

## 操作步骤

1. 点击本页按钮加载预置的达梦 `OA.approval_records` 表结构。
2. 在表头下拉框中按需切换目标方言（如 **Dameng**、**Oracle**、**OceanBase (Oracle)**、**Kingbase** 或 **GaussDB**）。
3. 在 **字段配置** 中编辑字段类型、长度、可空性与中文注释。
4. 在 **高级设置 → 表级选项** 中设置 `TABLESPACE`（Oracle 还支持 `PCTFREE` 与 `INITRANS`）。
5. 审阅并复制完整 DDL，同时可在 **授权配置** 中生成对应的权限 DCL 语句。

## 常见问题

### 筑表师支持哪些国产数据库和信创数据库方言？

支持达梦（Dameng）、人大金仓（Kingbase）、GaussDB、OceanBase（MySQL 与 Oracle 模式）、PolarDB、TiDB 和 GBase，同时完整支持 Oracle、MySQL、PostgreSQL 和 SQL Server。

### 达梦和 Oracle 建表语句里的注释和自增是如何处理的？

达梦与 Oracle 均在建表后生成独立的 `COMMENT ON TABLE` / `COMMENT ON COLUMN` 语句；达梦自增列输出 `IDENTITY(1,1)`，默认当前时间按方言映射为 `SYSDATE`，并支持配置 `TABLESPACE`。

### 可以先把 MySQL 表结构导入，再切换为达梦或 Oracle 输出吗？

可以。你可以导入已有 SQL 到工作区后切换目标数据库类型查看对应的 DDL 语法；正式上线前仍需结合目标库版本和业务规则人工审阅字段类型与约束。

## 相关指南

- [表与字段配置](/zh/basic/table-and-fields)
- [索引、授权与杂项](/zh/basic/index-auth-misc)
- [导入与解析 SQL](/zh/advanced/import-and-parse)
- [Schema 规范检查](/zh/advanced/schema-lint)
