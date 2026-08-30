# DDLBuilder ドキュメント

**DDLBuilder（筑表師）**の公式ユーザーガイドへようこそ。このマニュアルでは、製品の主要機能と実際のデータベース設計・開発での効果的な活用方法について分かりやすく解説します。

## クイックナビゲーション

### 基本ガイド
- [クイックスタート](/ja/basic/getting-started) — 数分で最初のテーブル定義と DDL を生成する入門手順
- [コアコンセプト](/ja/basic/core-concepts) — ワークスペース、下書き、保存済みテーブル、権限、データ同期の基本概念
- [テーブルとフィールドの設定](/ja/basic/table-and-fields) — カラム型、制約ルール、論理列挙型、ストレージ容量の概算
- [インデックス、権限、その他](/ja/basic/index-auth-misc) — 主キー/インデックス、AI インデックスアドバイザー、DCL 権限、エンジン設定
- [DDL 出力と共有](/ja/basic/ddl-and-share) — 複数方言の SQL コピー、ORM モデル生成、読み取り専用リンクの共有
- [保存済みテーブルと下書き](/ja/basic/saved-tables) — 複数下書き、フォルダー整理、ゴミ箱機能、クラウド同期の管理

### 上級ガイド
- [上級ガイド概要](/ja/advanced/) — 高度な設計機能やエンジニアリング効率化ツールの全体像
- [SQL のインポートと解析](/ja/advanced/import-and-parse) — 既存 DDL の解析や CSV / Excel / JSON Schema からのインポート
- [WebMCP Agent ワークフロー](/ja/advanced/webmcp) — AI Agent によるスキーマの読み込み・検証・安全なパッチ適用
- [AI 支援テーブル設計](/ja/advanced/ai-workflow) — 対話型テーブル設計、差分パッチレビュー、スマートコメント生成
- [SQL のレビューと説明](/ja/advanced/review-and-explain) — アーキテクチャ品質スコアリング、最適化提案、SQL 構文解説
- [パーティションとシャーディング](/ja/advanced/partition-and-sharding) — MySQL/TiDB パーティションと PostgreSQL Citus 分散テーブル
- [差分とロールバック](/ja/advanced/diff-and-rollback) — スキーマ差分比較、ALTER スクリプトおよびロールバック DDL 生成
- [外部キーと ER 図](/ja/advanced/foreign-key-and-er) — ビジュアル接続モデリング、リレーションウィザード、関係トポロジー表示
- [ORM モデル生成](/ja/advanced/orm-generation) — Prisma、TypeORM、SQLAlchemy、GORM、JPA 向けコードのワンクリック出力
- [ビューと Routine の設定](/ja/advanced/view-and-routine) — ビュー DDL およびストアドプロシージャ・関数・トリガーの骨格生成
- [Schema Lint](/ja/advanced/schema-lint) — 命名規則、データ型の選択リスク、不要インデックスの自動スキャン
- [Mock データと論理列挙](/ja/advanced/mock-data-and-enum) — テストデータの自動生成とカラム値の業務ルール可視化
- [テーブル設計テンプレート](/ja/advanced/blueprint-templates) — ユーザー、注文、ログなど標準業務テンプレートの即時適用

### よくある質問と変更履歴
- [エラーと失敗への対処](/ja/faq/common-errors) — インポート失敗、コピー異常、リンク期限切れ、同期トラブルシューティング
- [機能の場所と表示条件](/ja/faq/feature-visibility) — 特定方言の設定タブ、折りたたみパネル、機能エントリの見つけ方
- [共有と共同作業](/ja/faq/sharing-and-collaboration) — 読み取り専用共有、編集用コピーへの分岐、バージョン管理の疑問
- [変更履歴](/ja/changelog/changelog) — 最新機能のリリース情報とバージョンアップ記録

## 主な機能と特徴

- **多彩なデータベース方言に対応**: MySQL、PostgreSQL、SQL Server、Oracle、TiDB、MariaDB、OceanBase、Dameng、GaussDB、Kingbase、GBase、PolarDB などの主要データベースに対応し、各方言に最適化された DDL/DCL を出力します。
- **モダンで直感的なビジュアルモデリング**: カラムのドラッグ並べ替え、コンパクト表示、列固定、複数タブの並行編集、インタラクティブな ER 図に対応しています。
- **マルチ言語とクロスデバイス同期**: CRDT（Yjs）技術をベースにした安定した複数タブ管理、増分クラウド同期、日本語・英語・中国語のスムーズな切り替えを提供します。
- **実用的な AI 支援機能**: AI テーブル設計工房、変更パッチ提案、AI インデックスアドバイザー、DDL アーキテクチャレビュー、コメント自動生成を統合しています。
- **開発現場へのシームレスな連携**: 主要 ORM モデルコードの生成、モックテストデータの書き出し、SQL 逆インポート、Schema Lint による設計規範チェックを標準搭載しています。
