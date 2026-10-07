# コミットメッセージ規約

Conventional Commits 形式で、要約は日本語で書く。

```text
<type>(<scope>): <summary>
```

## type

| type | 用途 |
| ------ | ------ |
| `feat` | 機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみ |
| `refactor` | 振る舞いを変えない整理 |
| `test` | テスト追加・修正 |
| `chore` | 設定、依存関係、補助作業 |
| `ci` | CI 設定 |

## scope

主な変更領域を短く入れる。プロジェクトごとに次の一覧を書き換える：`docs` / `deps` / `config` / `ci`

## ルール

- 1行目は 72 文字程度に収める
- 実装内容と異なる scope を付けない
- 絵文字を使わない
- コミット前にプロジェクトの lint とテストを通す

## 例

```text
feat(api): 一覧APIに絞り込みを追加
fix(import): CSV の文字コード変換を修正
docs(docs): 設計書にエラー形式を追記
chore(deps): 依存パッケージを更新
```
