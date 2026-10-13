# 모델 라우팅

이 파일의 모델만 위임에 사용한다. 위임할 때마다 해당 행의 모델을 직접 지정한다. 지정하지 않으면 부모 모델을 물려받는다.

2026-10-13 기준이다. 피커에 같은 이름이 있으면 그 모델을 지정하고 Fast는 켜지 않는다. Auto, Grok 4.6, Grok 4.5는 쓰지 않는다. Grok 4.6과 4.5는 Grok 4.7과 가격이 같다.

| 역할 | 에이전트 | 모델 | 강도 | 풀 |
| --- | --- | --- | --- | --- |
| 메인, L0, L1, L2 구현, 1차 재시도 | 메인, apt-implementer | Composer 2.5 | L1은 low, L2는 standard | Cursor Models |
| L3 설계, L3 구현, 2차 승격 | apt-designer, apt-senior-implementer | Grok 4.7 | high | Cursor Models |
| L1·L2 검증과 리뷰 | apt-verifier, apt-reviewer | Grok 4.7 | standard | Cursor Models |
| L3 검증과 리뷰 | apt-verifier, apt-reviewer | Claude Sonnet 5.5 | high | Other Models |

L3만 다른 제공사 모델을 쓴다. L2 검증은 구현 모델과 다르지만 같은 Cursor Models 풀이다. 공개 벤치마크는 이 배치를 바꿀 후보를 고를 때만 쓰고, 유지 여부는 `docs/harness/fixtures/`의 첫 통과율과 승격 횟수로 판단한다.
