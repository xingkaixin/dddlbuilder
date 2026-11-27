---
title: "Dameng・Oracle・エンタープライズ DB 向け DDL オンライン生成"
description: "Dameng（達夢）、Oracle、Kingbase、GaussDB、OceanBase（Oracle/MySQL）、GBase、PolarDB 向けの CREATE TABLE DDL をオンラインで生成。IDENTITY、SYSDATE、COMMENT ON、TABLESPACE に対応。"
preset: "dm-oracle"
faq:
  - question: "対応しているエンタープライズ・中国国産データベース方言は何ですか？"
    answer: "Dameng、Oracle、Kingbase、GaussDB、OceanBase（MySQL・Oracle 両モード）、PolarDB、TiDB、GBase に加え、MySQL、PostgreSQL、SQL Server に対応しています。"
  - question: "Dameng と Oracle のコメントや自動採番はどう出力されますか？"
    answer: "どちらもテーブル定義後に独立した COMMENT ON TABLE / COMMENT ON COLUMN 文を出力します。Dameng の自動採番は IDENTITY(1,1)、現在時刻デフォルトは SYSDATE、表領域は TABLESPACE として出力されます。"
  - question: "既存の MySQL DDL を取り込んでから Dameng や Oracle に切り替えられますか？"
    answer: "はい。ワークスペースへ SQL を取り込んだ後、データベース方言を切り替えて出力 DDL を確認できます。本番適用前には対象 DB バージョンに合わせて型と制約を必ずレビューしてください。"
---

# Dameng・Oracle・エンタープライズ DB 向け DDL オンライン生成

DDLBuilder は **Dameng（達夢）**、**Oracle**、**OceanBase（Oracle / MySQL モード）**、**Kingbase**、**GaussDB**、**GBase**、**PolarDB**、**TiDB** の方言ルールを内蔵しています。`IDENTITY(1,1)`、`TABLESPACE`、独立した `COMMENT ON`、制約とインデックスを各方言の本来の構文で出力します。

## 実際の DDL 出力例：Dameng 承認履歴テーブル

本ページのボタンから Dameng の `OA.approval_records` テーブルを新しい下書きとして開き、ヘッダーの方言切替で Oracle・Kingbase・GaussDB・OceanBase の構文差を確認できます：

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

## 対応するエンタープライズ系方言

| データベース方言 | 主な構文の特徴 |
| --- | --- |
| **Dameng** | `IDENTITY(1,1)`、`SYSDATE`、独立 `COMMENT ON`、`TABLESPACE` |
| **Oracle** | 独立 `COMMENT ON`、`TABLESPACE`、`PCTFREE` / `INITRANS`、制約・インデックス |
| **OceanBase（Oracle / MySQL）** | Oracle モード・MySQL モード別構文とパーティション対応 |
| **Kingbase** | PostgreSQL 系構文、Schema 修飾、独立コメント、インデックス |
| **GaussDB** | PostgreSQL 系のテーブル・コメント・制約・インデックス生成 |
| **GBase / PolarDB / TiDB** | MySQL 系のテーブルオプションとパーティション対応 |

## 手順

1. 本ページのボタンから Dameng の `OA.approval_records` プリセットを開きます。
2. 必要に応じてヘッダーから **Dameng**、**Oracle**、**OceanBase (Oracle)**、**Kingbase**、**GaussDB** へ切り替えます。
3. **フィールド設定** でデータ型、桁数、NULL 許可、コメントを編集します。
4. **詳細設定 → テーブルオプション** で `TABLESPACE`（Oracle では `PCTFREE` / `INITRANS` も可）を指定します。
5. 出力された DDL を確認してコピーします。必要に応じて **権限設定** から DCL も生成できます。

## よくある質問

### 対応しているエンタープライズ・中国国産データベース方言は何ですか？

Dameng、Oracle、Kingbase、GaussDB、OceanBase（MySQL・Oracle 両モード）、PolarDB、TiDB、GBase に加え、MySQL、PostgreSQL、SQL Server に対応しています。

### Dameng と Oracle のコメントや自動採番はどう出力されますか？

どちらもテーブル定義後に独立した `COMMENT ON TABLE` / `COMMENT ON COLUMN` 文を出力します。Dameng の自動採番は `IDENTITY(1,1)`、現在時刻デフォルトは `SYSDATE`、表領域は `TABLESPACE` として出力されます。

### 既存の MySQL DDL を取り込んでから Dameng や Oracle に切り替えられますか？

はい。ワークスペースへ SQL を取り込んだ後、データベース方言を切り替えて出力 DDL を確認できます。本番適用前には対象 DB バージョンに合わせて型と制約を必ずレビューしてください。

## 関連ガイド

- [テーブルとフィールドの設定](/ja/basic/table-and-fields)
- [インデックス、権限、その他](/ja/basic/index-auth-misc)
- [SQL のインポートと解析](/ja/advanced/import-and-parse)
- [Schema 規約チェック](/ja/advanced/schema-lint)
