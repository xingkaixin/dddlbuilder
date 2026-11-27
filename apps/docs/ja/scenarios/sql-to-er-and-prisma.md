---
title: "SQL から ER 図作成・SQL から Prisma Schema 変換オンラインツール"
description: "MySQL や PostgreSQL の CREATE TABLE SQL を取り込んで ER 図を可視化し、Prisma Schema、TypeORM、SQLAlchemy、GORM、JPA モデルコードをサインイン不要で出力します。"
preset: "sql-to-er-prisma"
faq:
  - question: "Prisma 以外に対応している ORM フレームワークは何ですか？"
    answer: "Prisma、TypeORM、SQLAlchemy、GORM、JPA に対応しています。SQLite / D1 方言を選択した場合は Drizzle 出力を利用できます。"
  - question: "SQL に物理外部キーがなくても ER 図でリレーションを引けますか？"
    answer: "はい。ER 図でカラム同士をドラッグして論理リレーションを選べば、DDL を変更せずに破線で業務上の関係と多重度を記録できます。"
  - question: "取り込んだ SQL がデータベースで実行されることはありますか？"
    answer: "ありません。DDLBuilder は SQL テキストの構造解析のみを行い、認証情報を受け取ったりデータベースに接続したりしません。"
---

# SQL から ER 図作成・SQL から Prisma Schema 変換オンラインツール

DDLBuilder は既存の `CREATE TABLE` SQL を編集可能なテーブル構造へ取り込み、ER 図で物理外部キーや論理リレーションを視覚化しながら、Prisma Schema、TypeORM、SQLAlchemy、GORM、JPA のモデルコードを出力できます。サインインも DB 接続も不要です。

## 実際の変換例：MySQL 注文テーブルから Prisma Schema へ

本ページのボタンから開くと、以下の注文テーブルを新しい下書きとして読み込み、**ORM モデル（Prisma）** タブを直接表示します：

```sql
CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT NOT NULL COMMENT '订单主键ID',
  user_id BIGINT NOT NULL COMMENT '关联用户ID',
  order_no VARCHAR(32) NOT NULL COMMENT '订单号',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '订单金额',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id ASC),
  UNIQUE INDEX uk_orders_order_no (order_no ASC),
  INDEX idx_orders_user_id (user_id ASC)
) COMMENT='电商订单表';
```

生成される Prisma Schema は次のとおりです：

```prisma
/// 电商订单表
model Orders {
  /// 订单主键ID
  id             BigInt     @id @default(autoincrement())
  /// 关联用户ID
  userId         BigInt     @map("user_id")
  /// 订单号
  orderNo        String     @map("order_no")
  /// 订单金额
  totalAmount    Decimal    @default(0.00) @map("total_amount")
  /// 状态
  status         String     @default("pending")
  /// 创建时间
  createdAt      DateTime   @default(now()) @map("created_at")
  @@index([userId])
  @@unique([orderNo])
  @@map("orders")
}
```

## SQL から ER 図・ORM 出力までの流れ

1. **SQL の取り込みまたはプリセットを開く**：本ページのボタンで例を開くか、DDLBuilder の **インポート** から複数の `CREATE TABLE` 文を取り込んで保存します。
2. **ER 図で関係を確認・作成**：上部の **ER 図** を開き、カラム間をドラッグして物理外部キー（実線）または論理リレーション（破線）を追加します。
3. **Prisma などの ORM コードを出力**：出力パネルの **ORM モデル** タブで **Prisma**（または TypeORM / SQLAlchemy / GORM / JPA）を選び、コードをコピーします。
4. **データ辞書の出力**：**ツール** から Markdown またはオフライン検索対応 HTML のデータ辞書を書き出せます。

## よくある質問

### Prisma 以外に対応している ORM フレームワークは何ですか？

**Prisma**、**TypeORM**、**SQLAlchemy**、**GORM**、**JPA** に対応しています。SQLite / D1 方言を選択した場合は **Drizzle** 出力を利用できます。

### SQL に物理外部キーがなくても ER 図でリレーションを引けますか？

はい。ER 図でカラム同士をドラッグして **論理リレーション** を選べば、DDL を変更せずに破線で業務上の関係と多重度を記録できます。

### 取り込んだ SQL がデータベースで実行されることはありますか？

ありません。DDLBuilder は SQL テキストの構造解析のみを行い、認証情報を受け取ったりデータベースに接続したりしません。

## 関連ガイド

- [外部キーと ER 図](/ja/advanced/foreign-key-and-er)
- [ORM モデル生成](/ja/advanced/orm-generation)
- [SQL のインポートと解析](/ja/advanced/import-and-parse)
- [データベースツール](/ja/advanced/database-tools)
