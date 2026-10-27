# 上級ガイド概要

このセクションでは、DDLBuilder の上級機能をテーマごとに説明します。下の表に、各テーマの内容と対応するページを示します。

---

## テーマ一覧

| テーマ | 内容 | ページ |
|---|---|---|
| データベース納品ツール | 複数テーブルのデータ辞書、2 つの SQL の構造比較、関連テストデータ | [データベースツール](/ja/advanced/database-tools) |
| データのインポートと解析 | 既存の SQL を解析し、CSV、Excel、JSON Schema からテーブル構造をインポート | [SQL のインポートと解析](/ja/advanced/import-and-parse) |
| WebMCP Agent 連携 | ブラウザー内の AI Agent が WebMCP を通じてテーブルを読み取り、検査し、変更 | [WebMCP Agent 連携](/ja/advanced/webmcp) |
| AI 支援テーブル設計 | 対話によるテーブル作成、AI が提案したテーブル変更の 1 件ずつの確認、AI によるコメント補完 | [AI 支援テーブル設計](/ja/advanced/ai-workflow) |
| SQL のレビューと解説 | DDL の採点、リスクの洗い出し、改善提案、SQL の一部分の解説 | [SQL のレビューと説明](/ja/advanced/review-and-explain) |
| パーティションとシャーディング | MySQL/TiDB のパーティションと PostgreSQL Citus のシャーディング | [パーティションとシャーディング](/ja/advanced/partition-and-sharding) |
| 変更差分とロールバック | 構造の Diff、変更を反映する ALTER スクリプト、ロールバック DDL | [差分とロールバック](/ja/advanced/diff-and-rollback) |
| リレーションのモデリングと ER 図 | 物理外部キーと論理リレーションをモデリングし、カーディナリティ、必須・任意、業務説明を記録 | [外部キーと ER 図](/ja/advanced/foreign-key-and-er) |
| フィールド標準と業務辞書 | 標準フィールドの定義、業務概念との関連付け、保存済みテーブルのずれの検査、標準ライブラリのインポートとエクスポート | [フィールド標準ライブラリと業務辞書](/ja/advanced/field-standards) |
| ORM モデル生成 | Prisma、TypeORM、SQLAlchemy、GORM、JPA のモデルを出力 | [ORM モデル生成](/ja/advanced/orm-generation) |
| ビューとプログラム単位 | ビュー DDL（`CREATE VIEW`）と、ストアドプロシージャ・関数・トリガーのコードの雛形 | [ビューと Routine の設定](/ja/advanced/view-and-routine) |
| Schema 規約チェック | 命名、主キー、フィールド型、インデックス、監査フィールドを検査 | [Schema 規約チェック](/ja/advanced/schema-lint) |
| Mock データと論理列挙 | Mock テストデータを一括生成し、色付きの論理列挙をフィールドに設定 | [Mock データと論理列挙](/ja/advanced/mock-data-and-enum) |
| テーブルブループリント | テーブルをテーブルブループリントとして保存し、新しい下書きでフィールド、インデックス、テーブルレベルの設定を再利用 | [テーブルブループリント](/ja/advanced/blueprint-templates) |

---

## 場面別の読み方

- 既存のデータベースを移行するときは、まず [SQL のインポートと解析](/ja/advanced/import-and-parse) を読み、既存の DDL を編集できるテーブルに解析します。
- 関連する複数のテーブルを設計するときは、[外部キーと ER 図](/ja/advanced/foreign-key-and-er) と [テーブルブループリント](/ja/advanced/blueprint-templates) を組み合わせて使います。
- リリース前に、[Schema 規約チェック](/ja/advanced/schema-lint) と [SQL のレビューと説明](/ja/advanced/review-and-explain) でテーブル構造を確認します。
- 本番反映前に、[差分とロールバック](/ja/advanced/diff-and-rollback) でリリース用のスクリプトとロールバック用のスクリプトを生成します。
