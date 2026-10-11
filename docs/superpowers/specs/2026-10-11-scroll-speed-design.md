# 노트 속도 변경(변속) 설계

- 작성일: 2026-10-11
- 기반: `docs/superpowers/specs/2026-10-09-chart-editor-design.md`, `docs/superpowers/specs/2026-10-10-named-tracks-design.md`
- 이 문서는 채보 단위의 노트 스크롤 속도 변경(변속)을 추가한다. 다루지 않는 내용은 기반 문서를 따른다.

## 0. 목표

### 사용자가 정한 것
- BPM 변경과 별개로, 채보의 특정 구간에서 **노트가 내려오는 속도 배율**을 바꿀 수 있다
- 실제 속도 = 유저 개인 노트 속도 설정 × 채보 속도 배율
- 속도 변경은 **난이도(채보)마다 따로** 저장한다
- 변경 방식은 **즉시**와 **서서히(선형)** 두 가지
- 배율은 **0(정지)까지** 허용, 음수(역주행)는 허용하지 않음
- 에디터 타임라인은 **시간 비례 그대로** 두고, 변속은 선·라벨·속도 그래프로 표시
- BPM은 스크롤 속도에 **영향을 주지 않는다** (지금과 같음)

### 성공 기준
- 채보에 변속 지점을 추가·수정·삭제하고 Undo할 수 있다
- 테스트 플레이에서 즉시 변속, 서서히 변속, 정지 구간이 보인다. 판정 타이밍은 바뀌지 않는다
- 변속이 없는 기존 채보는 그대로 열리고 똑같이 동작한다
- 게임 구현자는 문서의 공식만으로 같은 화면 위치를 계산할 수 있다

## 1. 채보 포맷 (`*.chart.json`에 선택 필드 추가)

```jsonc
{
  "formatVersion": 1,
  "name": "HARD",
  "level": 12,
  "tracks": [ ... ],
  "speeds": [
    { "tick": 3840, "speed": 2 },
    { "tick": 7680, "speed": 3, "ease": "linear" },
    { "tick": 9600, "speed": 0 },
    { "tick": 10560, "speed": 1 }
  ],
  "notes": [ ... ]
}
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `speeds` | 선택 | 배열. 없거나 비어 있으면 변속 없음(항상 ×1). 직렬화할 때 비어 있으면 생략 |
| `speeds[].tick` | 필수 | 0 이상 정수. 배열 안에서 엄격히 증가 (같은 tick 두 개 금지) |
| `speeds[].speed` | 필수 | 유한한 수, `0 ≤ speed ≤ 20` |
| `speeds[].ease` | 선택 | `"instant"` \| `"linear"`. 생략 = `"instant"`. 직렬화할 때 `instant`면 생략 |

- 필드 순서: `formatVersion, name, level, tracks, speeds, notes`
- 오류 메시지는 기존 형식을 따른다 (`hard.chart.json › speeds[2].speed: 0~20 사이여야 함`)
- `formatVersion`은 1 유지 (선택 필드 추가라 기존 파일과 호환)

## 2. 속도의 의미 (core `ScrollMap`)

### 2.1 시각별 속도 v(t)
속도 지점의 tick을 `TimingMap.tickToMs`로 ms로 바꾼 뒤 (`t_i`, `v_i`, `ease_i`):

- `t < t_0`(첫 지점 전): `v = 1`
- `t_i ≤ t < t_{i+1}`:
  - 다음 지점 `ease_{i+1} = instant`: `v = v_i`
  - 다음 지점 `ease_{i+1} = linear`: `v = v_i + (v_{i+1} − v_i) · (t − t_i) / (t_{i+1} − t_i)` (서서히는 "이전 지점에서 이 지점까지" 바뀌는 방식)
- `t ≥ t_last`: `v = v_last`
- 첫 지점이 `linear`면 "이전 지점"은 `(tickToMs(0), 1)`로 본다. 첫 지점 tick이 0이고 `linear`면 즉시와 같다

### 2.2 스크롤 위치 S(t)
`S(t) = ∫ v(τ) dτ` (ms 단위). 기준 `S(tickToMs(0)) = 0`. 첫 지점 전 구간은 `v = 1`이므로 tick 0 이전(음수 시간)은 `S(t) = t − tickToMs(0)`.
- 구간 시작마다 누적값 `S_i`를 미리 계산하고, 시각은 이진 탐색으로 구간을 찾는다
- 즉시 구간: `S(t) = S_i + v_i · d` (`d = t − t_i`)
- 서서히 구간: `S(t) = S_i + v_i · d + (v_{i+1} − v_i) · d² / (2 · D)` (`D = t_{i+1} − t_i`)
- `v ≥ 0`이므로 S는 줄어들지 않는다 (노트가 거꾸로 움직이지 않는다)

### 2.3 화면 위치
`noteY = judgeY − (S(noteMs) − S(nowMs)) · pxPerMs(유저 속도)`
- 롱노트 몸통은 `S(startMs)`~`S(endMs)` 사이
- 판정은 지금과 같이 ms로만 한다 (변속과 무관)

### 2.4 core 인터페이스
- 타입: `type SpeedEase = 'instant' | 'linear'`, `interface SpeedPoint { tick: number; speed: number; ease?: SpeedEase }`, `Chart.speeds?: SpeedPoint[]`
- 상수: `MIN_SCROLL_SPEED = 0`, `MAX_SCROLL_SPEED = 20` (playfield의 유저 속도 상수 `MIN_SPEED`/`MAX_SPEED`(1~10)와 이름이 겹치지 않게)
- `class ScrollMap { constructor(speeds: readonly SpeedPoint[] | undefined, tm: TimingMap); speedAt(ms: number): number; positionAt(ms: number): number }`

## 3. 에디터

### 3.1 타이밍 탭 `노트 속도` 카드 (활성 난이도)
- 카드 제목에 난이도 이름 표시: `노트 속도 — HARD`
- 행: 위치 라벨(`마디:박`, 기존 BPM 목록과 같은 계산), 배율 `NumberField`(step 0.1, min 0, max 20, 접미어 `×`), `즉시 / 서서히` `SegmentedControl`, 삭제 아이콘
- `현재 위치에 추가`: 재생선 tick을 현재 스냅에 맞춰 추가. 배율 기본값 = 그 시각의 `speedAt`(소수 둘째 자리 반올림), ease = `instant`. 같은 tick에 이미 있으면 새로 만들지 않고 토스트 `이미 이 위치에 속도 변경이 있어요`
- 지점이 없으면 `변속 없음 (×1)` 안내
- Undo 라벨: `속도 추가`, `속도 수정`, `속도 삭제` (`chartFile` 지정)
- 편집 명령(순수 함수, null = 거부):
  - `addSpeedPoint(doc, file, tick, speed): ProjectDoc | null` — tick < 0, 같은 tick 존재, speed 범위 밖이면 null. 정렬 위치에 삽입
  - `updateSpeedPoint(doc, file, index, patch: { speed?: number; ease?: SpeedEase }): ProjectDoc | null` — 범위 밖·변화 없음이면 null. `instant`는 필드 삭제
  - `removeSpeedPoint(doc, file, index): ProjectDoc | null`
  - 마지막 지점을 지우면 `speeds` 필드를 없앤다
- 재생·녹음·테스트 플레이 중에는 카드 편집 비활성 (트랙 카드와 같은 규칙)

### 3.2 타임라인 표시
- 변속 지점: 트랙 영역을 가로지르는 초록(`#34d399`) 1px 실선 + 라벨 칩 (BPM 칩과 같은 모양, 색만 초록). 라벨: 즉시 `×2.0`, 서서히 `→×3.0`, 0이면 `×0 정지`
- **속도 그래프 띠**: 트랙 오른쪽 `GAP(8px)` 뒤에 폭 20px. 바탕 `--bg-card`. 각 화면 줄(1px)의 시각에서 `speedAt`을 구해, `min(speed, 4) / 4 × 20px` 폭의 막대를 왼쪽부터 `--accent-soft`로 채우고 ×1 위치에 `--border` 세로선. 0인 구간은 비어 보인다
- BPM 라벨 x(`labelX`)는 그래프 띠 오른쪽으로 이동 (`labelX = tracksX + totalWidth + 8 + 20 + 8`)
- 노트 간격은 바꾸지 않는다

### 3.3 테스트 플레이
- `Playfield`가 `ScrollMap`으로 노트 y를 계산한다 (2.3). 유저 속도(↑/↓)와 곱해진다
- 보이는 노트 고르기: S는 줄어들지 않으므로 화면 범위 `[S(now) − 아래 여백/pxPerMs, S(now) + judgeY/pxPerMs]`를 노트의 S값(미리 계산)에 대해 이진 탐색한다

## 4. 게임 문서
`docs/CHART_FORMAT_GUIDE.md`에 `speeds` 필드 표, 2.1~2.3 공식, 검산 예시, `ScrollMap` 사용 예시를 추가한다. "변속(스크롤 속도 변화) 이벤트는 포맷에 없다"는 문장은 지운다.

## 5. 테스트
- core: `ScrollMap` — 지점 없음(S = t − t0), 즉시 ×2 구간의 위치, 서서히 구간의 위치(사다리꼴), 정지 구간에서 S 일정, BPM이 바뀌는 곡에서 tick→ms 변환 반영, 첫 지점 linear, S 단조 증가
- core: 검증(tick 정수·증가·중복, speed 범위, ease 값), 직렬화(빈 배열 생략, instant 생략, 필드 순서), 왕복
- editor: 속도 명령 추가·수정·삭제(정렬, 중복 거부, 범위 거부, 마지막 삭제 시 필드 제거, no-op null)
- playfield: 화면 범위 노트 고르기(정지 구간 포함)
- 레이아웃: `labelX`와 그래프 띠 위치

## 6. 범위 밖
- 음수 배율(역주행)
- 변속을 반영한 에디터 타임라인 보기
- BPM 비례 스크롤
- 곡 전체 공통 변속
