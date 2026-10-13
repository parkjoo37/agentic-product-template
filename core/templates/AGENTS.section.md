<!-- apt-harness:start -->
## Agentic product harness

이 저장소의 AI 개발 절차는 `agentic-product-template`에서 복사됐다. 프로필과 버전은 `.harness.json`을 본다.

- 새 기능은 자연어로 요청하면 된다. 위험 결정만 질문하고 나머지는 가정을 기록한 뒤 진행한다.
- 메인 에이전트는 제품 소스를 직접 고치지 않는다. 위험도, 재시도 상한, 벤더 분리를 따른다.
- 모델 슬러그는 `docs/harness/model-routing.md`에만 적는다.
- 완료는 사람이 병합하기 전의 PR이다.
- 절차의 원본은 템플릿 저장소다. 이 사본을 고친 뒤 템플릿에도 반영해야 다음 서비스에 남는다.
<!-- apt-harness:end -->
