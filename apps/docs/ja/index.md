---
title: "オンラインデータベース設計・SQL から ER 図・DDL 生成ガイド"
description: "DDLBuilder で MySQL、PostgreSQL、SQLite のテーブル構造をオンラインで設計します。SQL から ER 図、SQL から Prisma、データ辞書の出力、構造比較、CSV から INSERT SQL への変換について、作業別に操作ガイドを探せます。"
---

# オンラインデータベース設計・SQL から ER 図・DDL 生成ガイド

DDLBuilder は、オンラインでデータベースを設計し DDL を生成するツールです。フィールドとインデックスを設定する、既存の SQL を取り込んで ER 図を確認する、ORM モデルを出力する、といった作業ができます。以下の表から、作業に合ったガイドを選んでください。

[DDLBuilder を開いてデータベースを設計する](https://ddl.xingkaixin.me/)

## 作業別にガイドを選ぶ

| やりたいこと | 操作と出力 |
| --- | --- |
| [MySQL・PostgreSQL の CREATE TABLE 文を生成する](/ja/basic/getting-started) | フィールド、主キー、インデックスを設定し、CREATE TABLE の SQL をコピーする |
| [SQL から ER 図を作成する](/ja/advanced/foreign-key-and-er) | テーブル構造を取り込んで保存し、外部キーまたは論理リレーションを作成して、リレーション図を確認する |
| [SQL から Prisma などの ORM モデルを生成する](/ja/advanced/orm-generation) | テーブル構造を Prisma、TypeORM、SQLAlchemy、GORM、JPA のコードに変換する |
| [2 つの SQL のテーブル構造を比較する](/ja/advanced/database-tools#_2-つの-sql-の構造比較) | MySQL または PostgreSQL の構造の差分を確認し、移行 SQL を出力する |
| [SQL からデータ辞書を生成する](/ja/advanced/database-tools#data-dictionary) | Markdown、または検索できるオフライン HTML の文書を出力する |
| [CSV・Excel から INSERT SQL を生成する](/ja/advanced/business-data-import) | フィールドを対応付け、レコードを検証し、データの SQL とエラー一覧を出力する |
| [SQL クエリと業務テーブルを設計する](/ja/advanced/modeling-workflows) | テーブルの関係から SELECT を生成し、業務モジュールと SQLite/D1 の初期化プロジェクトを作成する |

手動での設計、SQL の取り込み、ローカルへの出力は、サインインしなくても始められます。クラウド同期と AI 機能に必要なアカウントについては[クイックスタート](/ja/basic/getting-started)を参照してください。DDLBuilder は SQL を生成するだけで、データベースに接続して SQL を実行することはありません。

## クイックナビゲーション

### 基本ガイド
- [クイックスタート](/ja/basic/getting-started)：最初のテーブルを設定して DDL を生成する
- [コアコンセプト](/ja/basic/core-concepts)：ワークスペース、下書きボックス、保存済みテーブル、読み取り専用の共有、クラウド同期
- [テーブルとフィールドの設定](/ja/basic/table-and-fields)：フィールドの型、制約、論理列挙、容量の見積もり
- [インデックス、権限、その他](/ja/basic/index-auth-misc)：主キーとインデックス、AIインデックスアドバイザー、権限付与の DCL、ストレージパラメーター
- [DDL 出力と共有](/ja/basic/ddl-and-share)：SQL のコピー、ORM モデルの生成、読み取り専用の共有リンクの作成
- [保存済みテーブルと下書き](/ja/basic/saved-tables)：下書き、フォルダー、ゴミ箱、複数デバイスでの同期

### 上級ガイド
- [上級ガイドの概要](/ja/advanced/)：上級機能のトピック一覧
- [SQL のインポートと解析](/ja/advanced/import-and-parse)：既存の DDL を解析する、または CSV、Excel、JSON Schema からテーブル構造を取り込む
- [WebMCP Agent 連携](/ja/advanced/webmcp)：ブラウザー内の AI Agent がテーブル構造を読み取って検査する。変更にはユーザーの確認が必要
- [AI 支援テーブル設計](/ja/advanced/ai-workflow)：自然言語からテーブル構造を生成し、AI の変更を 1 件ずつ確認し、フィールドのコメントを補完する
- [SQL のレビューと説明](/ja/advanced/review-and-explain)：DDL の採点と修正提案、SQL の断片の説明
- [パーティションとシャーディング](/ja/advanced/partition-and-sharding)：MySQL/TiDB のパーティションと PostgreSQL Citus のシャーディング
- [差分とロールバック](/ja/advanced/diff-and-rollback)：構造の差分を比較し、ALTER スクリプトとロールバック DDL を生成する
- [外部キーと ER 図](/ja/advanced/foreign-key-and-er)：ER 図で外部キーまたは論理リレーションを作成し、テーブル間の関係を確認する
- [ORM モデル生成](/ja/advanced/orm-generation)：Prisma、TypeORM、SQLAlchemy、GORM、JPA のモデルを出力する
- [ビューと Routine の設定](/ja/advanced/view-and-routine)：ビューの DDL と、ストアドプロシージャ、関数、トリガーのコードの雛形
- [Schema 規約チェック](/ja/advanced/schema-lint)：命名、主キー、フィールドの型、インデックスの問題をチェックする
- [Mock データと論理列挙](/ja/advanced/mock-data-and-enum)：テストデータを生成し、フィールドに列挙値を設定する
- [テーブルブループリント](/ja/advanced/blueprint-templates)：1 つのテーブルをテーブルブループリントとして保存し、新しい下書きで再利用する

### よくある質問とバージョン
- [エラーと失敗への対処](/ja/faq/common-errors)：インポートの失敗、コピーの失敗、共有リンクの期限切れ、同期の異常
- [機能の場所と表示条件](/ja/faq/feature-visibility)：一部のタブやボタンが表示されない理由
- [共有と共同作業](/ja/faq/sharing-and-collaboration)：読み取り専用の共有、コピーの保存、下書きボックスの違い
- [変更履歴](/ja/changelog/changelog)：各バージョンの更新内容

## 主な機能

- 16 種類のデータベースに対応しています。MySQL、MariaDB、TiDB、PolarDB、OceanBase（MySQL モードと Oracle モード）、PostgreSQL、PostgreSQL（Citus）、GaussDB、Kingbase、GBase、SQL Server、Oracle、Dameng、SQLite / D1、Hive です。選択したデータベースに合わせて DDL と DCL を生成します。
- フィールドはドラッグで並べ替えられ、先頭の数列を固定できます。複数のタブで別々のテーブルを同時に編集できます。ER 図で線をつなぐと、テーブルのリレーションを作成できます。
- サインインすると、ワークスペースは Yjs（CRDT）で複数のデバイス間で差分同期されます。画面の表示言語は中国語、英語、日本語に対応しています。
- AI 機能には、AIテーブルワークショップ、AI編集、AIインデックスアドバイザー、AIレビュー、AIのコメントがあります。
- Prisma、TypeORM、SQLAlchemy、GORM、JPA のモデルコードと Mock テストデータを生成できます。SQL からテーブル構造を取り込み、構造の規約をチェックすることもできます。
