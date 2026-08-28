# WebMCP Agent ワークフロー

## 対象ユーザー

WebMCP 対応のブラウザ Agent を使用し、現在の DDLBuilder ページでスキーマの確認、SQL のインポート、規約チェック、またはレビュー可能な変更提案を行いたいユーザー向けです。

## 解決できること

WebMCP は DDLBuilder の操作を構造化ツールとして公開します。Agent はスクリーンショットや DOM からボタンの意味を推測せずに、現在の文書を操作できます。

## 前提条件

- `document.modelContext` を実装したブラウザを使用します。WebMCP は実験段階のため、現在の Origin Trial とローカルフラグの要件は [Chrome WebMCP ドキュメント](https://developer.chrome.com/docs/ai/webmcp) を確認してください。
- DDLBuilder ページを開いたままにします。ページを閉じるとツールは利用できません。
- 書き込み操作はページ内でユーザーの確認が必要です。Agent は確認画面を回避できません。

## 利用可能なツール

- `get_auth_status`：アカウント情報やクレジットを返さず、認証状態と機能グループを報告します。
- `start_sign_in`：ログイン画面を開きます。パスワードと検証はユーザーがページ内で完了します。
- `inspect_active_schema`：概要、フィールド、インデックス、関係、オプションをページ単位で読み取ります。
- `lint_active_schema`：決定論的なスキーマチェックを実行します。
- `read_generated_output`：DDL、DCL、ORM、ALTER、ロールバック出力を分割して読み取ります。
- `preview_schema_patch`：テーブル、フィールド、インデックスの変更をプレビューします。
- `import_sql_preview`：指定した方言で SQL を解析し、インポートをプレビューします。
- `apply_schema_patch`：ユーザーの確認を待ち、古くなった変更を拒否します。

## 認証と匿名ワークスペース

1. 未ログインでも、Agent は匿名のローカル下書きの編集、SQL インポート、チェック、出力の読み取りを実行できます。
2. クラウド同期、アカウントデータ、有料 AI が必要な場合、Agent は `start_sign_in` を呼び出します。
3. ユーザーまたはパスワードマネージャーが認証情報と検証を完了します。パスワードはツール引数や出力に入りません。
4. ログイン後、ページはツールとワークスペース状態を更新し、Agent は元の作業を続行できます。

## スキーマ変更フロー

1. Agent は `inspect_active_schema` を呼び出し、`baseSignature` を取得します。
2. 署名を `preview_schema_patch` または `import_sql_preview` に渡します。
3. `apply_schema_patch` はページ内のユーザー確認を待ちます。
4. DDLBuilder は文書の署名を再確認し、変更がない場合だけ適用します。

## よくある失敗

- 非対応ブラウザ：手動操作は可能ですが、WebMCP ツールは表示されません。
- `CONFLICT`：現在のスキーマを再取得し、新しいプレビューを作成します。
- 読み取り専用共有：確認とチェックは可能ですが、書き込みは拒否されます。
- ヘッドレスまたはクラウド Agent：WebMCP ではなく、認可済みのバックエンド MCP を使用します。

インデックスの種類は `kind` で表します。値は `index`、`unique_index`、`unique_constraint`、`primary` です。ツール出力と新しい書き込みには `kind` を使用します。旧保存データの `unique`、`isPrimary`、`isUniqueConstraint` は読み込み時に変換されます。
