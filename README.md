# Agentic product template

이 저장소는 서비스가 아니라, AI 에이전트가 서비스를 만드는 절차의 원본이다. 요구사항 정리, 위험도별 위임, 검증, PR, 실행 기록은 `core/`에 둔다. 스택마다 달라지는 규칙만 `profiles/`에 둔다.

## 구성

- `core/`: 어떤 서비스에서나 같은 워크플로우. Cursor 플러그인 `apt-core`.
- `profiles/nextjs-web/`: 검증용 웹 스택. Cursor 플러그인 `apt-nextjs-web`.
- `profiles/flutter/`: iOS·Android 앱 스택. Cursor 플러그인 `apt-flutter`. Flutter 3.47.7, Riverpod 3, go_router, freezed, dio.
- `profiles/backend/`: 자리만 있는 스텁. 플러그인으로 배포하지 않고, 규칙을 채우기 전에는 서버 코드를 만들지 않는다.
- `scripts/harness.mjs`: 서비스 저장소로 복사하고, 이후 템플릿 변경을 다시 가져온다.
- `scripts/check-template.mjs`: 템플릿 자체를 검사한다.

## 서비스 저장소에 넣기

Cloud Agent는 대상 저장소에 커밋된 `.cursor/`만 본다. 그래서 각 서비스 저장소에 사본을 넣는다.

```bash
node /절대경로/agentic-product-template/scripts/harness.mjs init \
  --profile nextjs-web \
  --target /절대경로/서비스저장소 \
  --with-ci
```

설치한 뒤에는 다음을 한다.

1. `docs/harness/model-routing.md`에 현재 Cursor에 있는 모델 슬러그를 채운다.
2. `.cursor/`, `docs/harness/`, `lessons/`, `AGENTS.md`, `.harness.json`을 커밋한다. `.gitignore`가 `.cursor/`를 제외하면 스크립트가 경고한다.
3. 실제로 실패했던 작업이 생기면 `docs/harness/fixtures/`에 고정 과제로 올린다.

템플릿이 바뀐 뒤에는 서비스 저장소에서 `sync`를 실행한다. 설치 기록의 프로필과 CI 여부를 그대로 쓴다. `model-routing.md`와 CI 파일은 덮어쓰지 않는다. 템플릿에서 빠진 파일은 목록만 출력하고, `--prune`을 붙이면 지운다.

```bash
node /절대경로/agentic-product-template/scripts/harness.mjs sync --target /절대경로/서비스저장소
```

## 플러그인으로 쓰기

Cursor Customize의 From GitHub Repository로 이 저장소를 가져오면 `apt-core`, `apt-nextjs-web`, `apt-flutter`를 설치할 수 있다. 플러그인에는 규칙, 스킬, 에이전트, 명령만 들어가고 안전 훅과 `docs/harness/` 양식은 없다.

- 사용자 범위가 아니라 프로젝트 범위로 설치한다. 사용자 범위로 설치하면 하네스가 없는 모든 저장소에도 오케스트레이터 규칙이 붙는다.
- 스크립트로 사본을 넣은 저장소에는 플러그인을 같이 설치하지 않는다. 같은 규칙이 두 번 들어가고, 버전이 다르면 서로 충돌한다.

## 작업 방식

1. 서비스 저장소에서 기능을 자연어로 요청한다.
2. 에이전트는 위험 결정만 묻고, 나머지는 가정을 `docs/harness/`에 남긴 뒤 구현한다.
3. 작업은 L0–L3 위험도로 나뉘고, 구현과 검증은 서로 다른 제공사 모델이 맡는다. 실패한 작업의 자동 재시도는 2회까지다.
4. 완료는 사람이 병합하기 전의 PR이다. 안전 훅은 작업 브랜치 push는 허용하고, 기본 브랜치 push와 커밋, PR 병합은 사람에게 확인받는다.
5. 요청 하나의 시간, 위험도, 개입, 재시도, 승격, 검증 결과는 `docs/harness/runs/`에 남긴다.

## 템플릿을 고칠 때

`core/`나 `profiles/`를 바꾸면 `VERSION`과 플러그인 `version`을 함께 올리고 검사를 실행한다.

```bash
node scripts/check-template.mjs
```

검사는 매니페스트와 버전, 규칙·스킬·에이전트 frontmatter, 문서 사이의 참조, 안전 훅의 허용·확인·차단 판정, 서비스 저장소 설치와 갱신을 확인한다.
