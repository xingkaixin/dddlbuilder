# 上級ガイド

## これは誰に向けたものですか

通常のテーブル作成はすでに完了しており、既存の SQL のインポート、AI コラボレーション、スキーマ変更制御、パーティショニング/シャーディング戦略、外部キーと ER 図、ORM 生成などの複雑なシナリオを処理する必要があるユーザー向け。

## これで解決すること

アドバンスト ガイドは、「SQL を生成できる」から「安定した再利用、共同レビュー、変更リスクの管理、および下流プロジェクトの統合」に移行するのに役立ちます。

## 前提条件

・基本ガイドの通常のテーブル作成の流れは完了です。
- ページで DDL、DCL、ORM、およびビュー/ルーチン出力を表示する方法を理解している。

## 推奨される読む順序

1. [SQL のインポートと解析](/ja/advanced/import-and-parse)
2. [WebMCP Agent ワークフロー](/ja/advanced/webmcp)
3. [AI 支援テーブル設計ワークフロー](/ja/advanced/ai-workflow)
4. [SQL の確認と説明](/ja/advanced/review-and-explain)
5. [パーティショニングとシャーディングの構成](/ja/advanced/partition-and-sharding)
6. [差分とロールバックの変更](/ja/advanced/diff-and-rollback)
7. [外部キーの構成とER図](/ja/advanced/foreign-key-and-er)
8. [ORMモデルの生成](/ja/advanced/orm-generation)
9. [ビューとルーチンの設定](/ja/advanced/view-and-routine)
10. [スキーマ lint](/ja/advanced/schema-lint)
11. [モックデータと論理列挙型](/ja/advanced/mock-data-and-enum)
12. [テーブル ブループリント テンプレート](/ja/advanced/blueprint-templates)

## 境界と基本ガイド

- 基本ガイドでは、1 つのテーブルの標準構成と出力を完了する方法に焦点を当てています。
- 上級ガイドは、品質の向上、リスクの管理、コラボレーション効率の向上、複雑なシナリオにおける下流開発との統合に重点を置いています。
