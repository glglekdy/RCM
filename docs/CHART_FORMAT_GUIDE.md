# RCM 채보 포맷 & 리듬게임 구현 가이드 (AI 에이전트용)

이 문서는 **RCM Chart Editor**가 만든 채보 파일을 읽어서 리듬게임을 구현하려는 AI 에이전트(또는 개발자)를 위한 것이다. 이 문서만 보고 파일을 해석하고, 정확한 타이밍으로 노트를 내리고, 판정까지 만들 수 있도록 쓰였다.

> **AI 에이전트에게: 게임 플레이·판정 코드를 쓰기 전에 반드시 7장의 질문으로 사용자에게 원하는 게임 플레이 스타일과 판정 방식을 먼저 묻고, 답을 정리해 확인받은 뒤 구현한다.** 4장의 규칙은 사용자가 "기본으로"를 골랐을 때 쓰는 기본값이다.

- 저장소: 이 문서가 있는 모노레포 (`packages/core`, `packages/playfield`, `apps/editor`)
- 정본(코드가 진실이다): 타입 `packages/core/src/types.ts`, 타이밍 `packages/core/src/timing.ts`, 검증 `packages/core/src/validate.ts`, 판정 `packages/playfield/src/judge.ts`·`playState.ts`
- 설계 문서: `docs/superpowers/specs/2026-10-09-chart-editor-design.md`, `docs/superpowers/specs/2026-10-10-named-tracks-design.md`, `docs/superpowers/specs/2026-10-11-scroll-speed-design.md`

---

## 0. 요약 (30초 버전)

1. 곡 하나 = **폴더 하나**. `song.json`(곡 정보·BPM) + `*.chart.json`(난이도별 채보) + 음악 파일.
2. 노트 위치는 시간이 아니라 **tick**(박자 단위 정수). **1박 = 480 tick**.
3. tick → ms 변환은 `song.json`의 `offsetMs`와 `timing`(BPM 변경 목록)으로 한다 (3장 공식).
4. 노트는 레인 번호가 아니라 **트랙 이름 문자열**(`"Note_1"`, `"Side_L"` 등)을 가리킨다. 트랙 이름을 게임 규칙에 어떻게 대응시킬지는 **게임이 정한다**.
5. 노트 종류는 `tap`과 `hold`(롱노트, `endTick` 있음) 두 가지뿐이다.
6. 채보에 선택 필드 `speeds`(변속)가 있으면 노트를 ms 차이가 아니라 **스크롤 위치** 차이로 그린다 (3.6절). 판정은 변속과 무관하게 ms 기준이다.
7. TypeScript/JavaScript라면 `@rcm/core`(파싱·검증·타이밍)와 `@rcm/playfield`(판정·플레이 화면)를 그대로 가져다 쓰는 것이 가장 안전하다. 다른 언어라면 3장 공식과 4.5절 판정 규칙을 그대로 옮기면 된다.
8. 게임 플레이 방식(화면 방향, 롱노트 처리 등)과 판정 방식(판정 범위, 헛누름 벌점 등)은 **게임이 정한다.** 코드를 쓰기 전에 7장 질문으로 사용자에게 먼저 묻는다.

---

## 1. 곡 폴더 구조

```
<곡 폴더>/
  audio.ogg           음악 파일 (확장자는 원본 그대로: ogg/mp3/wav). 이름은 song.json의 "audio" 값
  song.json           곡 정보 + 타이밍 (모든 난이도 공통)
  normal.chart.json   난이도별 채보. 파일 이름은 아무거나 가능, 확장자는 반드시 .chart.json
  hard.chart.json
  editor.json         에디터 전용 데이터(가이드 마커). 게임은 무시한다
```

- 모든 JSON은 UTF-8, 들여쓰기 2칸, 파일 끝 개행.
- 난이도 목록은 폴더 안의 `*.chart.json` 파일을 전부 찾아서 만든다 (목록 파일은 따로 없음).
- 모르는 필드는 무시한다 (에디터는 읽을 때 모르는 필드를 버린다).

---

## 2. 파일 포맷

### 2.1 `song.json`

```jsonc
{
  "formatVersion": 1,
  "title": "곡 제목",
  "artist": "아티스트",          // 빈 문자열 가능
  "audio": "audio.ogg",          // 같은 폴더 안의 음악 파일 이름
  "offsetMs": 120,               // 음악 파일에서 tick 0(첫 박)이 있는 시각(ms). 음수 가능, 소수 가능
  "previewStartMs": 30000,       // 곡 선택 화면 미리듣기 시작 위치(ms)
  "timing": [                    // BPM 변경 지점. tick 오름차순, 첫 항목은 반드시 tick 0
    { "tick": 0,     "bpm": 150, "beatsPerMeasure": 4 },
    { "tick": 30720, "bpm": 75 }  // beatsPerMeasure 생략 = 직전 값 유지 (첫 지점에서 생략되면 4)
  ]
}
```

| 필드 | 타입 | 규칙 |
|---|---|---|
| `formatVersion` | number | 반드시 `1` |
| `title`, `artist`, `audio` | string | |
| `offsetMs`, `previewStartMs` | number | 유한한 수 |
| `timing` | array | 1개 이상. `timing[0].tick === 0`. tick은 엄격히 증가하는 0 이상 정수. `bpm > 0` |
| `timing[].beatsPerMeasure` | number? | 1~16 정수. 마디선(박자표)용. 게임 판정에는 영향 없음 |

### 2.2 `<이름>.chart.json`

```jsonc
{
  "formatVersion": 1,
  "name": "HARD",                // 난이도 표시 이름
  "level": 12,                   // 난이도 숫자
  "tracks": [                    // 트랙 목록. 배열 순서 = 화면 왼쪽→오른쪽 순서
    { "id": "Side_L", "color": "#f59e0b", "width": "wide" },
    { "id": "Note_1" }, { "id": "Note_2" }, { "id": "Note_3" },
    { "id": "Note_4" }, { "id": "Note_5" }, { "id": "Note_6" },
    { "id": "Side_R", "color": "#f59e0b", "width": "wide" }
  ],
  "speeds": [                    // (선택) 노트 속도 변경. 없거나 비면 항상 ×1
    { "tick": 3840, "speed": 2 },
    { "tick": 7680, "speed": 3, "ease": "linear" }
  ],
  "notes": [                     // tick 오름차순, 같은 tick이면 tracks 배열 순서
    { "tick": 1920, "track": "Note_1", "type": "tap" },
    { "tick": 2400, "track": "Side_L", "type": "hold", "endTick": 3360 }
  ]
}
```

**트랙 (`tracks[]`)**

| 필드 | 필수 | 규칙 |
|---|---|---|
| `id` | 필수 | `^[A-Za-z0-9_-]{1,32}$`. 채보 안에서 유일 (대소문자 구분) |
| `color` | 선택 | `#rrggbb`. 생략 = `#f2f2f2` (기본 노트 색) |
| `width` | 선택 | `"narrow"` \| `"normal"` \| `"wide"`. 생략 = `"normal"`. 에디터 표시용 힌트 |

- 트랙 수: 1~16개.
- `color`와 `width`는 **표시 힌트**일 뿐이다. 게임은 따라도 되고 무시해도 된다.

**노트 (`notes[]`)**

| 필드 | 규칙 |
|---|---|
| `tick` | 0 이상 정수. 노트(롱노트는 머리)의 위치 |
| `track` | `tracks[].id` 중 하나 |
| `type` | `"tap"` 또는 `"hold"` |
| `endTick` | `hold`만. `endTick > tick` 정수. 롱노트 끝 위치 |

**변속 (`speeds[]`, 선택)**

| 필드 | 필수 | 규칙 |
|---|---|---|
| `speeds` | 선택 | 배열. 없거나 비어 있으면 변속 없음(항상 ×1). 필드 순서는 `formatVersion, name, level, tracks, speeds, notes` |
| `speeds[].tick` | 필수 | 0 이상 정수. 배열 안에서 엄격히 증가 (같은 tick 두 개 금지) |
| `speeds[].speed` | 필수 | 유한한 수, `0 ≤ speed ≤ 20`. 0은 정지 |
| `speeds[].ease` | 선택 | `"instant"` \| `"linear"`. 생략 = `"instant"` |

- 변속은 **채보(난이도)마다** 따로 있다. 곡 전체 설정(`song.json`)이 아니다.
- 의미와 계산은 3.6절.

**겹침 금지**: 같은 트랙 안에서 두 노트의 구간 `[tick, endTick ?? tick]`(양 끝 포함)이 겹치지 않는다. 그래서 `"<track>:<tick>"`은 채보 안에서 노트를 유일하게 식별하는 키로 쓸 수 있다.

**예전 포맷**: 루트에 `lanes`가 있거나 노트에 `lane` 숫자가 있으면 지원하지 않는 예전 포맷이다. 읽기를 거부한다.

### 2.3 `editor.json` — 게임은 읽지 않는다

```jsonc
{ "formatVersion": 1, "markers": [ { "ms": 15234.5, "label": "드럼 시작" } ] }
```
에디터에서 박자를 맞출 때 쓰는 표시선이다. 게임 로직과 무관하다.

---

## 3. 시간 계산 (가장 중요)

### 3.1 기본 단위

- `TICKS_PER_BEAT = 480` (1박 = 4분음표 = 480 tick)
- 스냅 단위 `1/N`의 한 칸 = `480 * 4 / N` tick → 1/4=480, 1/8=240, 1/12=160, 1/16=120, 1/24=80, 1/32=60
- tick은 BPM이 바뀌어도 박자 위치에 붙어 있다. ms는 반드시 아래 공식으로 계산한다.

### 3.2 tick → ms (음악 파일 기준 시각)

`timing` 배열의 각 지점 i에 대해 구간 시작 ms를 미리 계산한다.

```
segment[0].startMs = offsetMs
segment[i].startMs = segment[i-1].startMs
                   + (timing[i].tick - timing[i-1].tick) * 60000 / (timing[i-1].bpm * 480)

tickToMs(tick):
  s = tick이 속한 구간 (startTick <= tick 인 마지막 구간; tick < 0 이면 0번 구간)
  return s.startMs + (tick - s.startTick) * 60000 / (s.bpm * 480)
```

- tick 0 이전(음수 tick)은 첫 구간의 BPM으로 연장한다.
- 결과는 **음악 파일의 재생 위치(ms)** 와 같은 축이다. 즉 오디오를 0초부터 틀었을 때 `tickToMs(note.tick)` ms에 그 노트를 쳐야 한다.

### 3.3 ms → tick (역변환, 입력 기록·에디터용)

```
msToTick(ms):
  s = startMs <= ms 인 마지막 구간 (ms가 첫 구간보다 앞이면 0번 구간)
  return s.startTick + (ms - s.startMs) * s.bpm * 480 / 60000     // 실수 tick
```

### 3.4 검산 예시

`offsetMs = 0`, `timing = [{tick:0, bpm:120}, {tick:1920, bpm:60}]` 이면

| tick | ms | 이유 |
|---|---|---|
| 480 | 500 | 120 BPM에서 1박 = 500ms |
| 1920 | 2000 | 4박 |
| 2400 | 3000 | 1920 이후는 60 BPM, 1박 = 1000ms |

`offsetMs = 100`, `timing = [{tick:0, bpm:120}]` 이면 `tickToMs(0) = 100`, `tickToMs(480) = 600`, `tickToMs(-480) = -400`.

### 3.5 TypeScript에서는 그냥 이걸 쓴다

```ts
import { parseSong, parseChart, TimingMap } from '@rcm/core';

const song = parseSong(songJsonText);                 // { ok: true, value } | { ok: false, errors: string[] }
const chart = parseChart(chartJsonText, 'hard.chart.json');
if (!song.ok || !chart.ok) throw new Error([...(song.ok ? [] : song.errors), ...(chart.ok ? [] : chart.errors)].join('\n'));

const tm = new TimingMap(song.value.timing, song.value.offsetMs);
const notes = chart.value.notes.map(n => ({
  track: n.track,
  type: n.type,
  startMs: tm.tickToMs(n.tick),
  endMs: n.type === 'hold' ? tm.tickToMs(n.endTick) : undefined,
}));
```

`parseSong`/`parseChart`는 2장의 모든 규칙을 검사하고, 오류는 `"hard.chart.json › notes[3].track: ..."` 형식의 한국어 메시지 배열로 돌려준다.

### 3.6 변속(스크롤 속도)

`speeds`는 **노트가 내려오는 속도 배율**을 바꾼다. BPM과는 무관하다 (BPM이 바뀌어도 스크롤 속도는 ms 기준으로 일정하고, 변속 지점만 배율을 바꾼다). 실제 속도 = 유저 개인 노트 속도 설정 × 채보 속도 배율.

**① 시각별 속도 v(t).** 변속 지점의 tick을 3.2의 `tickToMs`로 ms로 바꾼 뒤 (`t_i`, `v_i`, `ease_i`):

- `t < t_0` (첫 지점 전): `v = 1`
- `t_i ≤ t < t_{i+1}`:
  - 다음 지점의 `ease_{i+1} = instant`: `v = v_i`
  - 다음 지점의 `ease_{i+1} = linear`: `v = v_i + (v_{i+1} − v_i) · (t − t_i) / (t_{i+1} − t_i)` (`linear`는 "**이전 지점에서 이 지점까지** 서서히 바뀐다"는 뜻)
- `t ≥ t_last`: `v = v_last` (마지막 속도 유지)
- 첫 지점이 `linear`면 "이전 지점"은 `(tickToMs(0), 1)`로 본다. 첫 지점 tick이 0이고 `linear`면 즉시와 같다.

**② 스크롤 위치 S(t).** `S(t) = ∫ v(τ) dτ` (ms 단위, 속도를 시간에 대해 적분한 값). 기준은 `S(tickToMs(0)) = 0`. 첫 지점 전은 `v = 1`이므로 tick 0 이전도 `S(t) = t − tickToMs(0)`.

구간 시작마다 누적값 `S_i`를 미리 계산해 두고, 시각은 이진 탐색으로 구간을 찾는다 (`d = t − t_i`, `D = t_{i+1} − t_i`).

```
즉시 구간:   S(t) = S_i + v_i · d
서서히 구간: S(t) = S_i + v_i · d + (v_{i+1} − v_i) · d² / (2 · D)
마지막 지점 뒤: S(t) = S_last + v_last · d
```

`v ≥ 0`이므로 S는 줄어들지 않는다 (노트가 거꾸로 움직이지 않는다). `v = 0`인 구간은 S가 일정해서 노트가 멈춘다.

**③ 화면 위치.** 노트 y는 4.4절처럼 `S`의 차이로 계산한다. **판정은 변속과 상관없이 ms 기준 그대로**다.

**검산값** (`offsetMs = 0`, `timing = [{tick:0, bpm:120}]`, 1박 = 500ms):

| `speeds` | t (ms) | S(t) | 이유 |
|---|---|---|---|
| `[{tick:960, speed:2}]` (즉시 ×2) | 1500 | 2000 | 0~1000ms는 ×1 → 1000, 이후 500ms를 ×2 → +1000 |
| `[{tick:960, speed:1}, {tick:1920, speed:3, ease:"linear"}]` (×1에서 ×3으로 서서히) | 1500 | 1750 | 1000 + 500 + (3−1)·500²/(2·1000) |
| 위와 같음 | 2000 | 3000 | 1000 + 1000 + (3−1)·1000/2 |
| `[{tick:960, speed:0}, {tick:1440, speed:1}]` (정지 후 ×1) | 1200 | 1000 | 1000ms에 멈춤 |
| 위와 같음 | 1700 | 1200 | 1500ms에서 다시 흐름: 1000 + 200 |

**TypeScript에서는 `ScrollMap`을 쓴다.**

```ts
import { ScrollMap } from '@rcm/core';

const scroll = new ScrollMap(chart.value.speeds, tm);   // speeds가 undefined면 항상 ×1 (S(t) = t − tickToMs(0))
scroll.speedAt(1500);       // 그 시각의 배율 v(t)
scroll.positionAt(1500);    // 스크롤 위치 S(t)

// 노트마다 한 번만 미리 계산해 둔다
const startPos = notes.map(n => scroll.positionAt(n.startMs));
const endPos = notes.map(n => (n.endMs === undefined ? undefined : scroll.positionAt(n.endMs)));
```

> 주의: 부동소수점 오차로 `positionAt`이 구간 경계에서 1e-13쯤 줄어들 수 있다. 위치 배열에 이진 탐색을 쓸 때는 앞에서부터 누적 최댓값을 취해 오름차순으로 만든다.

---

## 4. 게임 구현 방법 (권장 구조)

### 4.1 로딩

1. 곡 폴더에서 `song.json`을 읽고 검증한다.
2. `*.chart.json`을 모두 찾아 검증하고 `name`·`level`로 난이도 목록을 만든다. 검증에 실패한 파일은 목록에서 빼고 이유를 로그에 남긴다.
3. 음악 파일을 **전부 디코딩**해 둔다 (웹이면 `AudioContext.decodeAudioData`).
4. 고른 채보의 노트를 3장 공식으로 ms로 바꾸고 `startMs` 오름차순으로 정렬한 배열을 만든다. 트랙별로도 나눠 둔다 (판정은 트랙별로 한다).

### 4.2 트랙 이름 → 게임 규칙 대응

트랙 이름의 의미는 채보 파일이 정하지 않는다. 게임이 정한다. 권장 방식:

- **이름 규칙으로 해석**: 예를 들어
  - `Note_1`…`Note_N` → 일반 레인 (번호 순서대로 왼쪽부터)
  - `Side_L` / `Side_R` → 사이드 트랙 (예: 왼쪽/오른쪽 Shift, 넓은 판정 영역)
  - `Trigger_1` 등 → 게임이 정의하는 특수 입력
- **배열 순서를 화면 배치로 사용**: `tracks` 배열 순서가 에디터의 왼쪽→오른쪽 순서다. 특별한 배치가 없다면 이 순서대로 레인을 그리면 된다.
- **모르는 트랙 이름**: 게임이 지원하지 않는 트랙이 있으면 (a) 그 채보를 "지원하지 않음"으로 표시하거나 (b) 그 트랙 노트를 무시한다. 조용히 다른 레인에 옮기지 말 것.
- **키 배치는 게임 설정이다**: 에디터의 키 배치(프리셋)는 앱 설정에만 있고 채보 파일에는 없다. 에디터 기본값을 따르고 싶다면: 4K `D F J K` / 5K `D F Space J K` / 6K `S D F J K L` / 7K `S D F Space J K L` / 8K `A S D F J K L ;` / 6K+사이드 `LShift, S D F J K L, RShift`.

### 4.3 시계 (싱크의 핵심)

- **오디오 시계 하나만 기준으로 삼는다.** 웹이면 `AudioContext.currentTime`.
  ```
  재생 시작: source.start(ctx.currentTime + delaySec, offsetSec)
  현재 곡 위치(ms) = (ctx.currentTime - 시작한 ctx 시각) * 1000 + 시작 위치(ms)
  ```
  - 시작 위치가 음수(준비 시간)면 `delaySec = -startMs/1000`, `offsetSec = 0`으로 늦게 시작한다.
- `requestAnimationFrame`·`Date.now()`·프레임 수로 시간을 누적하지 않는다 (오디오와 점점 어긋난다).
- 매 프레임 "현재 곡 위치(ms)"를 한 번 읽고, 그 값으로 그리기와 판정 갱신을 모두 한다.
- 출력 지연(블루투스 이어폰 등)과 입력 지연 보정용으로 **사용자 오프셋(ms)** 설정을 두고, 판정에 쓰는 노트 시각에 더한다. 채보의 `offsetMs`와는 별개다.

### 4.4 노트 그리기 (세로 스크롤)

- 판정선 위치 `judgeY`, 유저 스크롤 속도 `pxPerMs`(예: `속도 × 0.1`)일 때, 노트 y는 시각이 아니라 **스크롤 위치**(3.6절의 `S`)의 차이로 계산한다.
  ```
  nowPos = S(nowMs)
  noteY  = judgeY - (S(note.startMs) - nowPos) * pxPerMs     // 미래 노트는 판정선 위쪽
  ```
  변속(`speeds`)이 없으면 `S(t) = t − tickToMs(0)`이라 `S(a) − S(b) = a − b`가 되어 예전 공식(`judgeY - (note.startMs - nowMs) * pxPerMs`)과 같다.
- 롱노트는 머리(`S(startMs)`)부터 끝(`S(endMs)`)까지 몸통을 그린다. 정지(×0) 구간이 끼면 그 구간은 몸통 길이가 0이다.
- 정지(×0) 구간 동안에는 그 구간의 노트가 모두 같은 스크롤 위치라 판정선에 겹쳐 쌓여 있다가 판정되거나 지나가면 사라진다 (예상된 동작).
- 노트마다 `S(startMs)`, `S(endMs)`를 미리 계산해 둔다 (매 프레임 계산하지 않는다). 매 프레임 `nowPos`만 새로 구한다.
- 화면에 보이는 **스크롤 위치 범위**만 그린다: `nowPos - (화면 아래 여백)/pxPerMs` ~ `nowPos + judgeY/pxPerMs`. S는 줄어들지 않고 노트는 `startMs` 순이므로 `S(startMs)` 배열도 오름차순이다. 이진 탐색으로 시작 위치를 찾되, 정지 구간처럼 같은 값이 이어질 수 있으니 "≥ 값인 **첫** 인덱스"를 찾는다. 롱노트 머리가 화면 아래로 지나가도 몸통이 보일 수 있으므로 시작 값을 가장 긴 롱노트의 `S` 길이만큼 더 당긴다.
- BPM이 바뀌어도 스크롤 속도는 변하지 않는다. 속도를 바꾸는 것은 `speeds`뿐이다.

### 4.5 판정 (에디터 테스트 플레이와 같은 규칙)

아래는 **기본 판정 규칙**이다. 사용자가 7장에서 다른 판정 방식을 고르면 그 방식을 따른다.

판정 창 (입력 시각 − 노트 시각의 절댓값):

| 판정 | 범위 |
|---|---|
| PERFECT | ≤ 40ms |
| GREAT | ≤ 80ms |
| GOOD | ≤ 120ms |
| (치지 않은 것) | > 120ms — 입력이 노트를 소비하지 않음 |

규칙:
1. **누름**: 그 트랙에서 아직 판정 안 된 가장 이른 노트 머리 중 ±120ms 안에 있는 것을 판정한다. 범위 밖이면 아무 일도 없다 (헛누름은 벌점 없음).
2. **놓침**: 노트 머리 시각 + 120ms가 지나도록 판정되지 않았으면 MISS. 롱노트면 꼬리도 MISS (MISS 2개).
3. **롱노트**: 머리를 맞히면 "누르는 중"이 된다.
   - `endMs − 120ms` 이전에 떼면 꼬리 MISS
   - 그 이후에 떼거나 `endMs`까지 누르고 있으면 꼬리 PERFECT
   - 롱노트 하나는 판정 2개(머리, 꼬리)를 만든다.
4. **콤보**: MISS면 0으로, 그 외에는 +1. 최대 콤보를 따로 기록한다.
5. 키 반복(keydown repeat) 이벤트는 무시한다. Ctrl/Alt/Meta와 함께 누른 키는 게임 입력으로 보지 않는다 (Shift는 사이드 트랙 키로 쓰일 수 있으므로 허용).

TypeScript라면 `@rcm/playfield`의 `PlayState`가 이 규칙을 그대로 구현한다:

```ts
import { PlayState, JUDGE_WINDOWS } from '@rcm/playfield';

const state = new PlayState(chart.value, tm, /* fromMs */ 0);  // fromMs 이전 노트는 제외
// lane = tracks 배열에서의 위치 (trackIndex(chart.tracks, id))
state.press(lane, nowMs);    // → JudgeEvent[]  { lane, judgement, part: 'head'|'tail', ms }
state.release(lane, nowMs);
state.update(nowMs);         // 매 프레임: 놓친 노트 MISS, 끝까지 누른 롱노트 성공 처리
state.combo; state.maxCombo; state.counts; // { perfect, great, good, miss }
```

`@rcm/playfield`의 `Playfield` 클래스는 Canvas에 노트·판정선·키 라벨·판정 문구·콤보를 그리는 완성된 플레이 화면이다 (옵션: `chart`, `tm`, `getTimeMs`, `fromMs`, `speed`, `keymap: Map<trackId, KeyboardEvent.code | null>`). 웹 게임이라면 이걸로 시작해서 바꿔 나가는 것이 빠르다.

### 4.6 점수 (포맷이 정하지 않음 — 제안)

판정 개수의 총합 = `tap 수 + hold 수 × 2`. 예: `점수 = 1,000,000 × (PERFECT×1 + GREAT×0.7 + GOOD×0.4) / 총 판정 수`. 게임 성격에 맞게 정한다.

---

## 5. 구현 체크리스트

- [ ] `formatVersion !== 1`이거나 예전 포맷(`lanes`/`lane`)이면 읽기 거부
- [ ] 2장의 검증 규칙 적용 (또는 `@rcm/core`의 `parseSong`/`parseChart` 사용)
- [ ] tick → ms 변환에 `offsetMs`와 **모든** BPM 변경 지점 반영 (3.4 검산값으로 테스트)
- [ ] 노트 시각은 정수 반올림하지 말고 실수 ms로 유지
- [ ] `speeds`가 있으면 노트 y를 스크롤 위치(3.6절 `S`)로 계산, 3.6 검산값으로 테스트 (`speeds`가 없으면 ms 차이와 같음)
- [ ] 오디오 시계 하나만 사용, 프레임마다 현재 위치를 한 번 읽음
- [ ] 판정은 트랙별, 창 40/80/120ms, 롱노트는 머리·꼬리 2판정
- [ ] 모르는 트랙 이름 처리 방침 정하기 (거부 또는 무시)
- [ ] 키 반복·조합키 입력 무시
- [ ] 사용자 오프셋(지연 보정) 설정
- [ ] 코드를 쓰기 전에 7장 질문으로 게임 플레이·판정 방식을 묻고 `docs/GAME_RULES.md`에 기록

## 6. 흔한 실수

| 실수 | 결과 | 올바른 방법 |
|---|---|---|
| tick을 `tick / 480 * (60000/bpm)`로 한 BPM만 써서 변환 | BPM이 바뀌는 곡에서 뒤로 갈수록 어긋남 | 3.2의 구간 누적 공식 |
| `offsetMs`를 빼먹음 | 모든 노트가 일정하게 밀림 | `tickToMs`의 시작값이 `offsetMs` |
| 노트 위치를 레인 번호(`lane`)로 기대 | 파싱 실패 | 노트는 `track` 문자열, 위치는 `tracks` 배열에서 찾음 |
| 프레임 시간으로 곡 위치 누적 | 몇 분 뒤 싱크가 밀림 | 오디오 시계에서 매번 계산 |
| 롱노트를 판정 1개로 계산 | 총 판정 수·콤보가 에디터와 다름 | 머리·꼬리 2개 |
| 변속 구간에서 노트 y를 ms 차이로 계산 | 변속·정지 구간에서 노트가 화면 위치에 맞지 않고 어긋남 | 3.6절의 스크롤 위치 `S`의 차이로 계산 (판정은 ms 그대로) |
| 120ms 밖의 누름에 MISS를 줌 | 헛누름에 콤보가 끊김 | 창 밖 입력은 무시, MISS는 시간이 지나서만 |

---

## 7. 구현 전에 사용자에게 물어볼 것 (필수)

채보 파일이 정하는 것(시간 계산, 노트 위치, 변속)은 바꿀 수 없다. 하지만 **게임 플레이 방식과 판정 방식은 게임이 정한다.** 사용자가 원하는 게임은 저마다 다르므로, AI 에이전트는 게임 플레이·판정 코드를 쓰기 전에 아래 순서를 지킨다.

### 7.1 진행 순서

1. **묻기**: 7.2와 7.3의 질문을 한 번에 보낸다. 질문마다 번호와 보기를 붙이고, 기본값에 `(기본)`을 표시한다. 사용자가 "기본으로" 또는 "알아서"라고 하면 `(기본)`을 고른다. 기본값은 에디터 테스트 플레이와 같은 규칙이다.
2. **정리하기**: 답을 7.4 형식의 "게임 규칙 요약"으로 정리해 보여 주고 "이대로 만들까요?"라고 확인받는다. 확인받기 전에는 게임 플레이·판정 코드를 쓰지 않는다. 답과 상관없는 부분(파일 읽기·검증, tick → ms 계산)은 먼저 해도 된다.
3. **기록하기**: 확정한 규칙을 게임 프로젝트의 `docs/GAME_RULES.md`에 저장하고, 이후 작업은 이 파일을 따른다. 규칙을 바꿀 때는 사용자에게 묻고 이 파일부터 고친다.
4. **구현하기**: 기본과 다른 판정 범위나 롱노트 규칙을 고르면 `@rcm/playfield`의 `PlayState`를 그대로 쓸 수 없다. 그 부분은 직접 구현하고, 고른 판정 범위의 경계값(예: 40ms와 41ms)으로 테스트를 만든다.
5. `docs/GAME_RULES.md`가 이미 있으면 다시 묻지 않고 그 파일을 따른다. 빠진 항목만 묻는다.

### 7.2 게임 플레이 스타일 질문

| # | 질문 | 보기 |
|---|---|---|
| 1 | 플랫폼: 어디서 돌아가는 게임인가? | **웹 브라우저 + TypeScript (기본)**, `@rcm/core`·`@rcm/playfield` 사용 / 다른 엔진·언어 (Unity, Godot 등), 3장 공식과 판정 규칙을 옮긴다 |
| 2 | 화면 방향: 노트가 어떻게 움직이나? | **위에서 아래로 떨어지고 판정선은 아래 (기본)** / 아래에서 위로 / 오른쪽에서 왼쪽 (가로) / 직접 설명 |
| 3 | 레인 배치: 트랙을 어떻게 놓나? | **`tracks` 배열 순서대로 왼쪽부터, 모두 같은 너비 (기본)** / 사이드 트랙(`Side_L`·`Side_R`)은 양 끝에 넓게 / 직접 지정 |
| 4 | 입력: 무엇으로 치나? | **키보드 (기본, 4.2절 키 배치)** / 터치 (레인 영역을 터치) / 게임패드 / 여러 개 함께 |
| 5 | 모르는 트랙: 게임이 모르는 트랙 이름이 있으면? | **그 채보를 "지원하지 않음"으로 표시 (기본)** / 그 트랙 노트만 무시 |
| 6 | 롱노트: 어떻게 판정하나? | **머리 판정 + 끝까지 누르고 있으면 꼬리 PERFECT, 판정 2개 (기본)** / 꼬리도 떼는 타이밍으로 판정 (osu!mania 방식) / 누르는 동안 일정 간격으로 콤보가 오름 (DJMAX 방식) / 머리만 판정 |
| 7 | 노트 속도: 유저 배속과 변속 | 배속: **설정 있음, 1.0~10.0, 0.1 단위 (기본)** / 고정 속도. 채보의 변속(`speeds`): **적용 (기본)** / 무시 |
| 8 | 화면 요소: 무엇을 보여 주나? (여러 개 고르기) | **판정 문구, 콤보, 점수, 진행 바 (기본)** / 누른 레인 빛내기(키빔) / 정확도(%) / FAST·SLOW 표시 / 라이프 게이지 |
| 9 | 화면 흐름: 플레이 앞뒤에 무엇이 있나? | **곡 선택 → 난이도 선택 → 플레이 → 결과 (기본)** / 플레이 화면만 |

### 7.3 판정 스타일 질문

| # | 질문 | 보기 |
|---|---|---|
| 1 | 판정 단계와 범위 (입력 시각 − 노트 시각의 절댓값) | **PERFECT ≤ 40ms / GREAT ≤ 80ms / GOOD ≤ 120ms (기본, 에디터와 같음)** / 엄격: PERFECT ≤ 25 / GREAT ≤ 50 / GOOD ≤ 90 / 느슨: PERFECT ≤ 60 / GREAT ≤ 110 / GOOD ≤ 160 / 직접 지정 (판정 이름과 ms) |
| 2 | 헛누름: 판정 범위 밖에서 누르면? | **무시, 벌점 없음 (기본)** / 노트 바로 앞의 이른 누름(가장 넓은 판정 범위 밖 ~ +60ms)은 MISS로 콤보를 끊음 / 모든 헛누름에 벌점 |
| 3 | FAST·SLOW 표시 | **표시 안 함 (기본)** / PERFECT가 아닐 때만 표시 / 항상 표시 |
| 4 | 점수 | **4.6절 제안 공식, 최대 1,000,000점 (기본)** / 정확도(%)만 / 콤보 보너스 포함 / 직접 지정 |
| 5 | 클리어 조건 | **항상 클리어, 결과만 보여 줌 (기본)** / 라이프 게이지가 0이 되면 실패 / 정확도 기준 (예: 70% 이상) |
| 6 | 등급 | **없음 (기본)** / 정확도 등급 (예: S ≥ 95%, A ≥ 90%, B ≥ 80%, C 그 밖) / 직접 지정 |
| 7 | 지연 보정 | **설정 화면에 사용자 오프셋(ms) (기본)** / 오프셋 + 박자에 맞춰 탭해서 자동으로 재기 |

판정 범위나 롱노트 규칙을 기본과 다르게 고르면, 에디터의 테스트 플레이와 게임의 판정 결과가 달라진다는 점을 사용자에게 함께 알린다.

### 7.4 게임 규칙 요약 형식 (`docs/GAME_RULES.md`)

```markdown
# 게임 규칙

## 게임 플레이
- 플랫폼: 웹 브라우저 + TypeScript (@rcm/core, @rcm/playfield)
- 화면: 위에서 아래로 떨어지고 판정선은 아래
- 레인: tracks 순서대로, 같은 너비
- 입력: 키보드 (4K D F J K)
- 모르는 트랙: 채보를 "지원하지 않음"으로 표시
- 롱노트: 머리 판정 + 끝까지 누르면 꼬리 PERFECT (판정 2개)
- 속도: 배속 1.0~10.0 (0.1 단위), 채보 변속 적용
- 화면 요소: 판정 문구, 콤보, 점수, 진행 바
- 흐름: 곡 선택 → 난이도 선택 → 플레이 → 결과

## 판정
- PERFECT ≤ 40ms / GREAT ≤ 80ms / GOOD ≤ 120ms, 범위 밖 누름은 무시
- FAST·SLOW: 표시 안 함
- 점수: 1,000,000 × (PERFECT×1 + GREAT×0.7 + GOOD×0.4) / 총 판정 수
- 클리어: 항상 클리어 / 등급: 없음
- 지연 보정: 사용자 오프셋(ms)

## 에디터 테스트 플레이와 다른 점
- 없음
```
