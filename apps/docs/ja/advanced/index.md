# 上級ガイド概要

DDLBuilder 上級ガイドへようこそ。このセクションでは、大規模システムのアーキテクチャ設計、開発プロセスの自動化、スキーマ統制、チーム共同作業などを深く実践するための高度な機能を網羅しています。

---

## トピック一覧

| トピック | 主な機能と解決できる課題 | ガイドリンク |
|---|---|---|
| **SQL・データインポート** | 既存 SQL の逆解析、CSV / Excel / JSON Schema からの構造自動取り込み | [SQL のインポートと解析](/ja/advanced/import-and-parse) |
| **WebMCP Agent 連携** | WebMCP による AI Agent からの構造読み込み・検証・安全なパッチ適用 | [WebMCP Agent ワークフロー](/ja/advanced/webmcp) |
| **AI フルアシスト設計** | 対話型テーブル生成、段階的な変更パッチレビュー、スマートコメント付与 | [AI 支援テーブル設計](/ja/advanced/ai-workflow) |
| **SQL レビューと解説** | アーキテクチャ品質スコアリング、潜在リスク診断、SQL 構文解説 | [SQL のレビューと説明](/ja/advanced/review-and-explain) |
| **パーティションと分散設計** | MySQL/TiDB パーティション戦略および PostgreSQL Citus 分散テーブル設計 | [パーティションとシャーディング](/ja/advanced/partition-and-sharding) |
| **スキーマ差分とロールバック** | 変更差分のビジュアル比較、正向 ALTER スクリプトおよび安全なロールバック DDL | [差分とロールバック](/ja/advanced/diff-and-rollback) |
| **リレーション設計と ER 図** | 直感的な接続モデリング、カーディナリティウィザード、関係トポロジー表示 | [外部キーと ER 図](/ja/advanced/foreign-key-and-er) |
| **ORM コード生成** | Prisma、TypeORM、SQLAlchemy、GORM、JPA 向けコードのワンクリック生成 | [ORM モデル生成](/ja/advanced/orm-generation) |
| **高度な DB オブジェクト** | ビュー DDL（`CREATE VIEW`）およびプロシージャ・関数・トリガーの骨格生成 | [ビューと Routine の設定](/ja/advanced/view-and-routine) |
| **Schema Lint 規約監査** | 命名規則、危険なデータ型、冗長インデックスを自動検出する Lint エンジン | [Schema Lint](/ja/advanced/schema-lint) |
| **テストデータと論理列挙** | モックテストデータの自動生成とカラム値のカラーバッジ付き論理列挙管理 | [Mock データと論理列挙](/ja/advanced/mock-data-and-enum) |
| **業務ブループリント** | ユーザー、注文、操作ログなどの業界標準テーブルテンプレートの即時活用 | [テーブル設計テンプレート](/ja/advanced/blueprint-templates) |

---

## 目的別おすすめパス

- **既存システムの移行**: [SQL のインポートと解析](/ja/advanced/import-and-parse) から始め、手元の DDL を取り込みます。
- **データモデリング**: [外部キーと ER 図](/ja/advanced/foreign-key-and-er) および [テーブル設計テンプレート](/ja/advanced/blueprint-templates) を活用して全体設計を構築します。
- **品質と安全性の確保**: 本番反映前に [Schema Lint](/ja/advanced/schema-lint) と [SQL のレビューと説明](/ja/advanced/review-and-explain) を実行します。
- **変更管理とリリース**: [差分とロールバック](/ja/advanced/diff-and-rollback) を利用して、移行用 ALTER スクリプトと切り戻し手順を準備します。
