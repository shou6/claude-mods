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

主な変更領域を短く入れる。Mod を変えたときは Mod のフォルダ名を scope にする（例：`status-band`）。

それ以外は次の一覧から選ぶ：`marketplace` / `docs` / `deps` / `config` / `ci`

## ルール

- 1行目は 72 文字程度に収める
- 実装内容と異なる scope を付けない
- 絵文字を使わない
- コミット前にプロジェクトの lint とテストを通す

## 例

```text
feat(status-band): 使用率をバーで表示
fix(status-band): リセット時刻の分の切り捨てを修正
chore(marketplace): 新しい Mod を一覧に追加
docs(docs): README に導入手順を追記
```
