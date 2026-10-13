---
name: ship
description: 자연어 요청을 요구사항, 작업, 구현, 검증, PR까지 진행한다
---

# 기능 출고

요청 하나에 대해 아래 순서로 진행한다.

1. `apt-shape-requirement`
2. `apt-split-work`
3. `apt-dispatch-cloud-agents`로 위험도에 맞게 구현을 맡긴다. 실패하면 재시도 상한을 따른다
4. `apt-verifier`로 검증하고, `apt-reviewer`로 변경분 결함을 확인한다
5. 지적 사항을 고친 뒤 대응 테스트를 다시 실행한다. 전체 검증은 마지막에 한 번만 실행한다
6. `apt-open-pull-request`
7. `apt-record-run`

위험 결정이 열리면 그 부분만 멈추고, 결정된 범위의 상태는 실행 기록에 남긴다. 병합하지 않는다.
