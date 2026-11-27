---
title: "MySQL オンライン DDL 生成ツール（パーティション・インデックス対応）"
description: "ブラウザー上で MySQL の CREATE TABLE 文を設計し、主キー、ユニークインデックス、複合インデックス、InnoDB 文字セット、RANGE COLUMNS パーティションを自動生成します。"
preset: "mysql-partition"
faq:
  - question: "MySQL のパーティションテーブルにおける主キーとユニークインデックスの制約は何ですか？"
    answer: "MySQL では、すべての主キーおよびユニークインデックスにパーティションキーを含める必要があります。プリセットの orders テーブルでは created_at を主キーとユニークインデックスの両方に含めています。"
  - question: "MySQL の DDL を生成するためにサインインや DB 接続は必要ですか？"
    answer: "不要です。テーブル設計、インデックス設定、パーティション生成、SQL のコピーはすべてブラウザー内で完結し、データベースへ接続して実行することはありません。"
  - question: "対応している MySQL 系方言は何ですか？"
    answer: "MySQL、MariaDB、TiDB、PolarDB、OceanBase（MySQL モード）、GBase に対応し、各方言の構文で DDL とパーティションを出力します。"
---

# MySQL オンライン DDL 生成ツール（パーティション・インデックス対応）

DDLBuilder を使うと、ブラウザー上で MySQL のカラム、主キー、ユニーク・複合インデックス、`InnoDB` オプション、`RANGE COLUMNS` / `LIST` / `HASH` パーティションを視覚的に設定し、そのままレビュー・コピーできる `CREATE TABLE` DDL をリアルタイムに生成できます。サインインや DB 接続は不要です。

## 実際の DDL 出力例：月別パーティションの注文テーブル

本ページ上部または下部のボタンから、以下の MySQL パーティション付き注文テーブルを新しい下書きとしてすぐに開けます：

```sql
CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT NOT NULL COMMENT '订单主键ID',
  order_no VARCHAR(32) NOT NULL COMMENT '订单编号',
  user_id BIGINT NOT NULL COMMENT '下单用户ID',
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT '订单总金额',
  status TINYINT(1) NOT NULL DEFAULT 0 COMMENT '订单状态：0-待支付，1-已支付，2-已取消',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（分区键）',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id ASC, created_at ASC),
  UNIQUE INDEX uk_orders_order_no_created (order_no ASC, created_at ASC),
  INDEX idx_orders_user_created (user_id ASC, created_at DESC)
) COMMENT='订单主表（按月分区）' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
PARTITION BY RANGE COLUMNS(created_at) (
  PARTITION p202601 VALUES LESS THAN ('2026-02-01'),
  PARTITION p202602 VALUES LESS THAN ('2026-03-01'),
  PARTITION p202603 VALUES LESS THAN ('2026-04-01'),
  PARTITION pmax VALUES LESS THAN (MAXVALUE)
);
```

## 主な機能

- **カラムと制約の設定**：`BIGINT`、`DECIMAL`、`DATETIME`、`AUTO_INCREMENT`、`NOT NULL`、デフォルト値、`ON UPDATE CURRENT_TIMESTAMP`、コメントを設定できます。
- **主キーと複合インデックス**：`ASC` / `DESC` を指定して主キー、ユニークインデックス、検索用複合インデックスを定義できます。
- **パーティション構成**：`RANGE`、`RANGE COLUMNS`、`LIST`、`LIST COLUMNS`、`HASH`、`KEY` に対応し、年別・月別・日別の定義を一括生成できます。
- **テーブルオプション**：ストレージエンジン（`InnoDB`）、文字セット（`utf8mb4`）、照合順序（`utf8mb4_0900_ai_ci`）を指定できます。
- **規約チェックと差分 DDL**：Schema Lint で命名や冗長インデックスを点検し、保存済みテーブルの変更時には `ALTER TABLE` とロールバック DDL を出力できます。

## 手順

1. 本ページのボタンで `mysql-partition` プリセットを開くか、新規下書きを作成してデータベースに **MySQL** を選択します。
2. **フィールド設定** でカラム名、データ型、デフォルト値、コメントを編集します。
3. **インデックス設定** で主キーと業務クエリ用インデックスを調整します。
4. **詳細設定 → パーティション設定** と **テーブルオプション** で境界値や文字セットを変更します。
5. 生成された `CREATE TABLE` SQL をコピーするか、**ORM モデル** タブから Prisma / GORM / JPA コードを出力します。

## よくある質問

### MySQL のパーティションテーブルにおける主キーとユニークインデックスの制約は何ですか？

MySQL では、すべての主キーおよびユニークインデックスにパーティションキーを含める必要があります。プリセットの `orders` テーブルでは `created_at` を主キーとユニークインデックスの両方に含めています。

### MySQL の DDL を生成するためにサインインや DB 接続は必要ですか？

不要です。テーブル設計、インデックス設定、パーティション生成、SQL のコピーはすべてブラウザー内で完結し、データベースへ接続して実行することはありません。

### 対応している MySQL 系方言は何ですか？

MySQL、MariaDB、TiDB、PolarDB、OceanBase（MySQL モード）、GBase に対応し、各方言の構文で DDL とパーティションを出力します。

## 関連ガイド

- [パーティションとシャーディング](/ja/advanced/partition-and-sharding)
- [インデックス、権限、その他](/ja/basic/index-auth-misc)
- [差分とロールバック](/ja/advanced/diff-and-rollback)
- [Schema 規約チェック](/ja/advanced/schema-lint)
