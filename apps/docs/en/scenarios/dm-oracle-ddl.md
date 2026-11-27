---
title: "Dameng, Oracle & Enterprise SQL DDL Generator"
description: "Visually generate Dameng (DM), Oracle, Kingbase, GaussDB, OceanBase (Oracle/MySQL), GBase, and PolarDB CREATE TABLE DDL online with IDENTITY, SYSDATE, COMMENT ON, and TABLESPACE support."
preset: "dm-oracle"
faq:
  - question: "Which enterprise and domestic database dialects are supported?"
    answer: "DDLBuilder supports Dameng (DM), Oracle, Kingbase, GaussDB, OceanBase (MySQL and Oracle modes), PolarDB, TiDB, GBase, MySQL, PostgreSQL, and SQL Server."
  - question: "How are comments and auto-increment columns handled for Dameng and Oracle?"
    answer: "Both Dameng and Oracle emit standalone COMMENT ON TABLE and COMMENT ON COLUMN statements. Dameng auto-increment columns emit IDENTITY(1,1), current-timestamp defaults map to SYSDATE, and TABLESPACE options are supported."
  - question: "Can I import MySQL DDL and switch the dialect to Dameng or Oracle?"
    answer: "Yes. Import existing SQL into your workspace and switch the target database dialect to inspect the generated DDL. Always review data types and constraints against your target database version before production use."
---

# Dameng, Oracle & Enterprise SQL DDL Generator

DDLBuilder includes real dialect rules for **Dameng (DM)**, **Oracle**, **OceanBase (Oracle / MySQL modes)**, **Kingbase**, **GaussDB**, **GBase**, **PolarDB**, and **TiDB**. Configure columns, indexes, and storage options once to output native `IDENTITY(1,1)`, `TABLESPACE`, standalone `COMMENT ON`, and constraint statements.

## Verified DDL Example: Dameng Approval Records Table

Use the example button on this page to load this Dameng `OA.approval_records` schema in a new draft, then switch dialects in the header to compare Oracle, Kingbase, GaussDB, or OceanBase output:

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

## Supported Enterprise Dialects

| Dialect | Key Syntax Features |
| --- | --- |
| **Dameng (DM)** | `IDENTITY(1,1)`, `SYSDATE`, standalone `COMMENT ON`, `TABLESPACE` |
| **Oracle** | Standalone `COMMENT ON`, `TABLESPACE`, `PCTFREE` / `INITRANS`, constraints & indexes |
| **OceanBase (Oracle / MySQL)** | Distinct Oracle-mode and MySQL-mode syntax plus partitioning |
| **Kingbase** | PostgreSQL-family syntax with schema qualification, comments, and indexes |
| **GaussDB** | PostgreSQL-family table, comment, constraint, and index generation |
| **GBase / PolarDB / TiDB** | MySQL-family table options and partitioning |

## Steps

1. Click the example button to open the preset Dameng `OA.approval_records` draft.
2. Switch the dialect selector to **Dameng**, **Oracle**, **OceanBase (Oracle)**, **Kingbase**, or **GaussDB** as needed.
3. Edit field types, lengths, nullability, and comments in the **Fields** tab.
4. Set `TABLESPACE` (and `PCTFREE` / `INITRANS` for Oracle) in **Advanced → Table options**.
5. Review and copy the generated DDL, or configure **Privileges** for matching DCL statements.

## FAQ

### Which enterprise and domestic database dialects are supported?

DDLBuilder supports Dameng (DM), Oracle, Kingbase, GaussDB, OceanBase (MySQL and Oracle modes), PolarDB, TiDB, GBase, MySQL, PostgreSQL, and SQL Server.

### How are comments and auto-increment columns handled for Dameng and Oracle?

Both Dameng and Oracle emit standalone `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements. Dameng auto-increment columns emit `IDENTITY(1,1)`, current-timestamp defaults map to `SYSDATE`, and `TABLESPACE` options are supported.

### Can I import MySQL DDL and switch the dialect to Dameng or Oracle?

Yes. Import existing SQL into your workspace and switch the target database dialect to inspect the generated DDL. Always review data types and constraints against your target database version before production use.

## Related Guides

- [Table and field configuration](/en/basic/table-and-fields)
- [Indexes, privileges, and misc](/en/basic/index-auth-misc)
- [Import and parse SQL](/en/advanced/import-and-parse)
- [Schema Lint](/en/advanced/schema-lint)
