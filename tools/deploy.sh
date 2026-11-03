#!/bin/bash
# QA 를 통과한 build-output 을 GitHub Pages 에 배포(deploy 워크플로 수동 실행)하고 끝날 때까지 기다린다.
set -e
cd "$(dirname "$0")/.."
gh api -X POST repos/jihoon380462/csharp-lab/actions/workflows/deploy.yml/dispatches -f ref=main
sleep 20
for i in $(seq 1 60); do
  s=$(gh run list -R jihoon380462/csharp-lab -w deploy -L 1 --json status,conclusion,createdAt --jq '.[0].status+" "+.[0].conclusion+" "+.[0].createdAt')
  case "$s" in completed*) break;; esac; sleep 10
done
echo "deploy: $s → https://jihoon380462.github.io/csharp-lab/"
