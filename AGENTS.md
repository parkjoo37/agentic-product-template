# Agentic product template

이 저장소는 하네스 원본이다. 제품 기능은 여기에 구현하지 않는다.

- 공통 절차를 바꿀 때는 `core/`만 수정한다.
- 스택별 규칙을 바꿀 때는 `profiles/<name>/`만 수정한다.
- 복사되는 동작이 바뀌면 `VERSION`과 플러그인 `version`을 함께 올린다.
- 서비스 저장소에는 `scripts/harness.mjs`로 복사한다. 이 저장소를 init 대상으로 지정하지 않는다.
- 변경을 끝내기 전에 `node scripts/check-template.mjs`가 통과해야 한다.
