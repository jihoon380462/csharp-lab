#!/bin/bash
# build-output 브랜치(빌드 결과물)를 <폴더>/csharp-lab 에 펼친다. 브라우저 QA(qa/browser/qa.js)의 입력.
#   tools/fetch-build.sh <폴더>
set -e
DIR="${1:?사용법: tools/fetch-build.sh <폴더>}"
cd "$(dirname "$0")/.."
git fetch -q -f origin build-output:refs/remotes/origin/build-output --depth 1
mkdir -p "$DIR"
if [ -d "$DIR/csharp-lab/.git" ] || [ -f "$DIR/csharp-lab/.git" ]; then
  git -C "$DIR/csharp-lab" checkout -q -f --detach origin/build-output   # -f: QA 중 손으로 고친 파일이 있어도 빌드 결과로 덮어씀
else
  rm -rf "$DIR/csharp-lab"
  git worktree add -q -f --detach "$DIR/csharp-lab" origin/build-output
fi
git -C "$DIR/csharp-lab" log -1 --format='build-output: %s'
sed -n '1,4p' "$DIR/csharp-lab/BUILD_INFO.txt"
grep -E '^(FAIL|[0-9]+ passed)' "$DIR/csharp-lab/TEST_RESULT.txt" || true
