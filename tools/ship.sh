#!/bin/bash
# 커밋 → main push → build 워크플로(테스트+빌드) 완료까지 기다림 → 결과 출력. 배포는 하지 않는다.
#   tools/ship.sh "커밋 메시지" [serve 폴더(주면 fetch-build.sh 까지)]
# 커밋 끝줄(Co-Authored-By 등)은 세션 지침대로 메시지에 직접 넣는다.
set -e
cd "$(dirname "$0")/.."
git add -A
git -c user.name="jihoon380462" -c user.email="jihoon380462@users.noreply.github.com" commit -q -m "$1"
sha=$(git rev-parse HEAD)
git push -q origin main
sleep 20
for i in $(seq 1 60); do
  s=$(gh run list -R jihoon380462/csharp-lab -w build -c "$sha" -L 1 --json status,conclusion --jq '.[0].status+" "+.[0].conclusion')
  case "$s" in completed*) break;; esac; sleep 10
done
echo "build: $s"
[ -n "$2" ] && tools/fetch-build.sh "$2"
