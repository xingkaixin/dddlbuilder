# ORM モデル生成

このガイドでは、DDLBuilder で設計したテーブル構造を主要な ORM フレームワークのモデル定義コードへワンクリックで変換・エクスポートする手順を解説します。

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
