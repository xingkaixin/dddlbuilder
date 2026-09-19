---
description: "MySQL テーブルを Prisma モデルに変換する入力と出力の例を紹介します。対応 ORM、型マッピング、利用時の制限を確認できます。"
---

# ORM モデル生成

[DDLBuilder で ORM モデルを生成](https://ddl.xingkaixin.me/)できます。テーブルがない場合は、[クイックスタート](/ja/basic/getting-started)または [既存 SQL のインポート](/ja/advanced/import-and-parse)から始めてください。他テーブルを参照する場合は、先に[外部キーと ER 図](/ja/advanced/foreign-key-and-er)を確認してください。

SQLite / D1 は Drizzle 出力に対応します。他テーブルへの外部キーには一括エクスポートを使用してください。型対応と初期化の制限は[クエリ設計と業務モデリング](/ja/advanced/modeling-workflows)を参照してください。

このガイドでは、DDLBuilder で設計したテーブル構造を主要な ORM フレームワークのモデル定義コードへワンクリックで変換・エクスポートする手順を解説します。

## 例：MySQL のユーザーテーブルを Prisma モデルに変換する

この例では、他テーブルとのリレーションを含まない単一テーブルのモデルを生成します。[DDLBuilder](https://ddl.xingkaixin.me/)で MySQL を選択し、[SQL のインポート手順](/ja/advanced/import-and-parse)に従って以下を取り込みます。

```sql
CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id ASC)
);
```

`users` を選択し、右側の **ORM** タブで **Prisma** を選びます。生成結果は以下のとおりです。整列用の空白は異なる場合があります。

```prisma
model Users {
  id             Int        @id
  name           String
  @@map("users")
}
```

`id` の主キー制約は `@id` に、`name` は必須の `String` に変換されます。`@@map("users")` はデータベースのテーブル名を維持します。この例には自動採番やデフォルト値がないため、挿入時に `id` と `name` の両方を指定します。

これはモデル定義の一部です。利用する Prisma プロジェクトで MySQL データソースとクライアント生成器を設定し、モデルを検証してから、プロジェクトの手順に従ってクライアントやマイグレーションを生成してください。モデル生成自体はデータベースへの接続や変更を行いません。ユーザーと注文の関連を設計する場合は、[外部キーと ER 図](/ja/advanced/foreign-key-and-er)を参照してください。

## 概要

データベース設計からバックエンド開発への橋渡しとして、アノテーションや型定義を手動でコーディングする手間を省き、型安全で精度の高いエンティティコードを即座に取得できます。

---

## 主な操作手順

### 1. 対象フレームワークの選択
1. 右側の出力パネルで **ORM** タブをクリックします。
2. セレクターから使用するフレームワークを選択します。
   - **Prisma**（Node.js / TypeScript）
   - **TypeORM**（TypeScript / NestJS）
   - **SQLAlchemy**（Python / FastAPI / Django）
   - **GORM**（Go / Gin / Fiber）
   - **JPA / Hibernate**（Java / Spring Boot）
3. コードエリアに、各フレームワークの規約に準拠したモデル定義コードがリアルタイム出力されます。

### 2. プロジェクトへのコード反映
パネル内の**「ORM コピー」**ボタンをクリックし、クリップボードにコピーしたコードをバックエンドプロジェクトのエンティティ/モデルファイルへ貼り付けます。

---

## サポートフレームワークとマッピング仕様

| ORM フレームワーク | 出力形式 | 主な型・アノテーション対応 |
|---|---|---|
| **Prisma** | `.prisma` スキーマ | `@id`, `@default()`, `@map()`, `@unique`, `@@index`, `@@schema` |
| **TypeORM** | TypeScript エンティティ | `@Entity()`, `@PrimaryGeneratedColumn()`, `@Column({ type, precision })`, `@Index()` |
| **SQLAlchemy** | Python クラス | `Column()`, `Integer()`, `String()`, `DECIMAL()`, `__table_args__` |
| **GORM** | Go 構造体 | `gorm.Model`, `gorm:"column:xxx;type:xxx;primaryKey;uniqueIndex"` |
| **JPA** | Java エンティティ | `@Entity`, `@Table(name, schema)`, `@Id`, `@Column(name, nullable)`, `@Index` |

---

## 高精度な型変換とスキーマ名前空間の保護

::: info 型安全と名前空間の注意点
- **64bit 整数と高精度小数**: TypeORM では、JavaScript の `Number` による浮点数桁落ちを防ぐため、`bigint` および `decimal/numeric` カラムを `string` 型プロパティとしてマッピングします。
- **Schema 名前空間**:
  - **Prisma**: PostgreSQL / SQL Server において `@@schema("schemaName")` を出力します。
  - **SQLAlchemy**: `__table_args__` に `schema='schemaName'` を定義します。
  - **JPA**: `@Table(schema = "schemaName")` で指定します。
  - **GORM**: 限定修飾名を返す `TableName()` メソッドを出力します。
:::

---

## 完了のチェックリスト

- [ ] 出力された ORM コードのカラム名、型定義、主キー制約がテーブル設定と一致している。
- [ ] プロジェクトへ貼り付けた後、型チェックやコンパイルが正常に通る。
- [ ] スキーマ名前空間の設定が各 ORM のアノテーションに正しく反映されている。
