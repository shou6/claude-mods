#!/usr/bin/env bash
# Mod のコミット前の確認（validate・test・tsc）をまとめて通す
# 使い方: .scripts/check.sh <mod>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "使い方: .scripts/check.sh <mod>" >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/.." && pwd)
mod="$root/${1%/}"

if [ ! -f "$mod/.claude-plugin/plugin.json" ]; then
  echo "Mod が見つからない: $1" >&2
  exit 2
fi

echo "== validate"
claude plugin validate "$root"
claude plugin validate "$mod"

echo "== test"
claude plugin test "$mod"

# tsc は Windows でも動くよう、パスを C:/... の形にして渡す
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi; }

echo "== tsc"
if [ -f "$mod/.claude-plugin/types/tsconfig.json" ]; then
  # Mod を読み込んだ後は、生成された型定義を extends する Mod の tsconfig で調べる
  npx -y -p typescript@5 tsc -p "$mod" --noEmit
  exit 0
fi

# 型定義がまだ生成されていないときは、plugin-authoring スキルが書き出す型定義を使う
# shellcheck disable=SC2012
types=$(ls -t "${TEMP:-${TMPDIR:-/tmp}}"/claude/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts 2>/dev/null | head -n 1 || true)
if [ -z "$types" ]; then
  echo "型定義が見つからないので tsc を飛ばす。Mod を一度読み込むか、plugin-authoring スキルを読み込んでから再実行する" >&2
  exit 1
fi

types=$(native "$types")
modpath=$(native "$mod")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/tsconfig.json" <<EOF
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true,
    "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": ["$types", "$modpath/hooks", "$modpath/types", "$modpath/tests"]
}
EOF
npx -y -p typescript@5 tsc -p "$(native "$tmp")/tsconfig.json"
