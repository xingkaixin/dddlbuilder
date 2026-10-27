---
title: "SQL から Prisma、TypeORM などの ORM モデルを生成"
description: "MySQL のテーブル作成 SQL を DDLBuilder にインポートし、Prisma、TypeORM、SQLAlchemy、GORM、JPA のモデルをエクスポートします。入出力の例で、型の対応、主キー、リレーションの扱いの制限を確認できます。"
---

# SQL から Prisma、TypeORM などの ORM モデルを生成

[DDLBuilder で ORM モデルを生成](https://ddl.xingkaixin.me/)できます。テーブル構造がまだない場合は、[クイックスタート](/ja/basic/getting-started)の手順でテーブルを作成するか、[既存の SQL をインポート](/ja/advanced/import-and-parse)してください。他のテーブルを参照する場合は、先に[外部キーと ER 図](/ja/advanced/foreign-key-and-er)の設定を確認してください。

SQLite / D1 では現在 Drizzle を出力します。他のテーブルへの外部キーは、関連テーブルをまとめてエクスポートしてください。型の対応と初期化の制限は[クエリ設計と業務モデリング](/ja/advanced/modeling-workflows)を参照してください。

## 例：MySQL のユーザーテーブルを Prisma モデルに変換する

この例では 1 つのテーブルのモデルだけを生成し、他のテーブルとのリレーションは含みません。[DDLBuilder](https://ddl.xingkaixin.me/) を開いて MySQL を選択し、[SQL のインポート手順](/ja/advanced/import-and-parse)に従って次の構造をインポートします。

```sql
CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id ASC)
);
```

`users` を選択し、生成結果の **ORM** タブに切り替えて **Prisma** を選びます。生成結果は次のとおりです（整列用の空白は異なる場合があります）。

```prisma
model Users {
  id             Int        @id
  name           String
  @@map("users")
}
```

`id` の主キー制約は `@id` に、`name` は必須の `String` に対応します。`@@map("users")` はデータベースのテーブル名を保持します。この例には自動採番もデフォルト値もないため、レコードを挿入するときは `id` と `name` を指定する必要があります。

これはモデルの一部です。使う前に、自分の Prisma プロジェクトで MySQL のデータソースとクライアントジェネレーターを設定し、モデルを検証してから、プロジェクトの手順に従ってクライアントまたはマイグレーションを生成してください。モデルの生成はデータベースに接続せず、データベースを変更しません。ユーザーと注文の関連をモデル化する場合は、[外部キーと ER 図](/ja/advanced/foreign-key-and-er)に進んでください。

## 利用場面

テーブル構造が決まった後、ORM のモデルクラスとアノテーションを手書きせずに生成します。

---

## 操作手順

### 1. 対象フレームワークを選ぶ
1. 生成結果で **ORM** タブをクリックします。
2. **ORM フレームワーク** セレクターで対象のフレームワークを選びます。
   - **Prisma**（Node.js / TypeScript）
   - **TypeORM**（TypeScript / NestJS）
   - **SQLAlchemy**（Python / FastAPI）
   - **GORM**（Go / Gin / Fiber）
   - **JPA**（Java / Spring Boot）
3. コードエリアに、選んだフレームワークのモデルコードが表示されます。テーブル構造を変更すると、コードも更新されます。

### 2. コードをプロジェクトにコピーする
**ORMコードをコピーする** をクリックし、コードをプロジェクトのエンティティファイルまたはモデルファイルに貼り付けます。

---

## 対応フレームワークと型の対応

| ORM フレームワーク | ファイル形式 | 主な型とアノテーションの対応 |
|---|---|---|
| **Prisma** | `.prisma` スキーマ | `@id`, `@default()`, `@map()`, `@@unique`, `@@index`, `@@map`, `@@schema` |
| **TypeORM** | TypeScript エンティティクラス | `@Entity()`, `@PrimaryGeneratedColumn()`, `@PrimaryColumn()`, `@Column({ type, precision })`, `@Index()` |
| **SQLAlchemy** | Python クラス（Declarative） | `Column()`, `Integer`, `String()`, `Numeric()`, `Index()`, `__table_args__` |
| **GORM** | Go 構造体 | `gorm:"column:xxx;primaryKey;autoIncrement;uniqueIndex"`, `TableName()` |
| **JPA** | Java エンティティクラス | `@Entity`, `@Table(name, schema)`, `@Id`, `@Column(name, nullable)` |

---

## 精度とスキーマの名前空間

::: info 精度と名前空間
- TypeORM は `bigint` を `string` 型のプロパティに対応させます。MySQL 系と PostgreSQL 系のデータベースでは、`decimal` と `numeric` も `string` に対応させます。JavaScript の `number` で精度が失われるのを防ぐためです。
- 「スキーマ名」を入力した場合は、次のようになります。
  - Prisma は PostgreSQL 系と SQL Server で `@@schema("schemaName")` を生成します。
  - SQLAlchemy は `__table_args__` に `{"schema": "schemaName"}` を生成します。
  - JPA は `@Table(schema = "schemaName")` を生成します。MySQL 系のデータベースでは代わりに `catalog` を使います。
  - GORM の `TableName()` メソッドは、スキーマの接頭辞付きのテーブル名を返します。
:::

---

## 完了の確認

- [ ] ORM コードのフィールド名、型の対応、主キーがテーブル設定と一致している。
- [ ] プロジェクトに貼り付けたコードが型チェックとコンパイルを通る。
- [ ] 「スキーマ名」を入力した場合、ORM コードに対応する名前空間の宣言がある。
