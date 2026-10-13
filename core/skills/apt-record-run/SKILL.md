---
name: apt-record-run
description: 요구사항 하나의 시간, 위험도, 사람 개입, 재시도와 승격, 검증 결과를 실행 기록으로 남긴다. 작업이 끝나거나 막혔을 때 사용한다.
---

# 실행 기록

`docs/harness/runs/<UTC-timestamp>-<slug>.json`을 만든다. 예시는 `docs/harness/run.example.json`을 따른다.

## 필드

- `requirement`: 요구사항 파일 경로
- `profile`: `.harness.json`의 profile. 없으면 null
- `risk`: `L0`, `L1`, `L2`, `L3`. 작업이 여럿이면 가장 높은 위험도
- `startedAt`, `finishedAt`: ISO-8601
- `implementerVendor`, `verifierVendor`: 모르면 `unknown`. 검증을 안 했으면 verifier는 빈 문자열
- `humanInterventions`: 사람이 답한 횟수
- `retries`: 같은 구현자에게 다시 맡긴 횟수
- `escalations`: 상위 구현자로 올린 횟수
- `firstVerifier`: `pass`, `fail`, `not-run`
- `reviewFindings`: 리뷰에서 고친 항목 수
- `tests`: `{ "command", "exitCode" }` 배열. 전체 스위트는 마지막 1회만 포함한다
- `outcome`: `pr-opened`, `blocked`, `abandoned`
- `failureLesson`: 다음에 막을 하네스 변경. 없으면 빈 문자열

토큰 비용이나 모델 이름을 알 수 없으면 지어내지 말고 `unknown`으로 둔다. 비밀 값은 적지 않는다.
