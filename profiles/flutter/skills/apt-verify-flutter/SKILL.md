---
name: apt-verify-flutter
description: 메인 에이전트가 Flutter 앱의 정적 분석과 전체 테스트를 한 번 실행한다. Dart 변경이 끝난 뒤와 PR 전에 사용한다.
---

# Flutter 전체 검증

메인만 실행한다. 병렬 작업 중인 구현·검증 에이전트는 대응 테스트만 돌린다.

`.fvmrc`가 있으면 `fvm flutter`, 없으면 `flutter`를 쓴다.

1. `flutter analyze`
2. `flutter test`

각 명령의 종료 코드를 보고한다. 생성 파일이 오래되어 분석이 실패하면 build_runner를 실행한 뒤 같은 두 명령을 한 번 더 실행한다. 두 번째도 실패하면 통과로 적지 않는다.
