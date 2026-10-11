# 노트 속도 변경(변속) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채보마다 구간별 노트 스크롤 속도 배율(즉시·서서히, 0=정지)을 저장·편집하고 테스트 플레이와 게임 화면에 반영한다.

**Architecture:** core에 `Chart.speeds`와 순수 계산 클래스 `ScrollMap`(시각 → 스크롤 위치)을 둔다. playfield는 노트 y를 ms 차이 대신 스크롤 위치 차이로 계산한다. 에디터는 타임라인을 시간 비례로 유지하고 변속을 선·칩·속도 그래프로만 표시하며, 편집은 타이밍 탭 카드와 순수 명령 함수로 한다.

**Tech Stack:** 기존과 같음 (TypeScript, Vitest, Electron + electron-vite + React)

**Spec:** `docs/superpowers/specs/2026-10-11-scroll-speed-design.md` (이하 "변속 스펙", 절 번호는 이 문서)

## Global Constraints

- `speeds[]`: `tick` 0 이상 정수·엄격 증가, `speed` 유한한 수 `0 ≤ speed ≤ 20`, `ease` `"instant"` | `"linear"` (생략 = instant)
- 상수 이름 `MIN_SCROLL_SPEED = 0`, `MAX_SCROLL_SPEED = 20` (playfield 유저 속도 상수 `MIN_SPEED`/`MAX_SPEED`와 다름)
- 직렬화: `speeds`가 비면 필드 생략, `ease: "instant"`는 생략, 필드 순서 `formatVersion, name, level, tracks, speeds, notes`
- `linear` 지점 = "이전 지점에서 이 지점까지 선형". 첫 지점이 linear면 이전 지점은 `(tickToMs(0), 1)`. 첫 지점 전 속도 1, 마지막 지점 뒤는 마지막 속도 유지
- 스크롤 위치 기준 `S(tickToMs(0)) = 0`
- 타임라인: 변속 선·칩 색 `#34d399`, 칩 배경 `rgba(52, 211, 153, 0.16)`. 속도 그래프 띠 폭 20px, 표시 상한 ×4
- 칩 문구: 즉시 `×2.0`, 서서히 `→×3.0`, 0이면 `×0 정지`. 배율 숫자는 소수 둘째 자리까지, 최소 한 자리 (`2` → `2.0`, `1.25` → `1.25`)
- Undo 라벨 `속도 추가`, `속도 수정`, `속도 삭제`. 중복 위치 토스트 `이미 이 위치에 속도 변경이 있어요`
- 판정은 ms 기준 그대로 (변속과 무관)
- UI 문구는 한국어. 기존 디자인 토큰·컴포넌트를 쓴다
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session: https://claude.ai/code/session_0193KVdVcsVXdi6XcDzTsVW4`

## Review Focus

1. **변속이 없는 기존 채보** — `speeds` 필드가 없는 채보를 열고 저장해도 파일에 `speeds`가 생기지 않고, 테스트 플레이 노트 위치가 이전과 똑같아야 한다 → Task 1·2 테스트
2. **정지(×0) 구간에 있는 롱노트** — 화면에서 사라지거나 몸통이 뒤집히지 않아야 하고, 보이는 노트 고르기가 정지 구간의 노트를 빼먹지 않아야 한다 → Task 2 테스트
3. **BPM 변경 지점과 같은 tick의 변속 지점** — 타임라인에서 두 칩이 겹쳐 하나가 가려지지 않아야 한다 → Task 4에서 칩을 아래로 비켜 그림 (수동 확인 항목)
4. **변속 지점 뒤에 BPM을 바꾸는 경우** — 변속은 tick에 붙어 있으므로 BPM을 고치면 변속 시각도 따라 움직여야 한다 (ms로 저장하지 않음) → Task 1 테스트 (BPM이 바뀌는 곡의 ScrollMap)
5. **배율 입력칸에 범위 밖 값(25, -1) 입력** — 거부되고 원래 값으로 돌아가야 하며 Undo 기록이 생기지 않아야 한다 → Task 3 테스트

---

## 파일 구조

```
packages/core/src/types.ts        SpeedEase, SpeedPoint, Chart.speeds?
packages/core/src/constants.ts    MIN_SCROLL_SPEED, MAX_SCROLL_SPEED
packages/core/src/scroll.ts       (새) ScrollMap
packages/core/src/validate.ts     speeds 검증
packages/core/src/serialize.ts    speeds 직렬화
packages/playfield/src/view.ts    visibleScrollRange, firstAtOrAbove
packages/playfield/src/Playfield.ts  ScrollMap으로 노트 y
docs/CHART_FORMAT_GUIDE.md        speeds 문서화
apps/editor/src/renderer/src/editor/commands/speeds.ts   (새) 속도 지점 명령
apps/editor/src/renderer/src/editor/timeline/view.ts     speedX, SPEED_GRAPH_WIDTH, labelX 이동
apps/editor/src/renderer/src/editor/timeline/drawTimeline.ts  변속 선·칩·그래프
apps/editor/src/renderer/src/editor/panels/TimingPanel.tsx    노트 속도 카드 (필요하면 SpeedCard.tsx로 분리)
```

---

### Task 1: core — speeds 포맷과 ScrollMap

**Files:**
- Create: `packages/core/src/scroll.ts`, `packages/core/test/scroll.test.ts`
- Modify: `packages/core/src/{types,constants,validate,serialize,index}.ts`, `packages/core/test/{parse,serialize}.test.ts`

**Interfaces:**
- Produces (`@rcm/core`):
  - `type SpeedEase = 'instant' | 'linear'`, `interface SpeedPoint { tick: number; speed: number; ease?: SpeedEase }`, `Chart.speeds?: SpeedPoint[]`
  - `MIN_SCROLL_SPEED = 0`, `MAX_SCROLL_SPEED = 20`
  - `class ScrollMap { constructor(speeds: readonly SpeedPoint[] | undefined, tm: TimingMap); speedAt(ms: number): number; positionAt(ms: number): number }` — 변속 스펙 2.1~2.2. 구간 누적값을 생성자에서 미리 계산하고 이진 탐색
  - `formatSpeed(speed: number): string` — Global Constraints의 숫자 규칙 (`2` → `'2.0'`, `1.25` → `'1.25'`, `0.5` → `'0.5'`, `1.234` → `'1.23'`)
- 검증 오류 경로: `speeds`, `speeds[i].tick`, `speeds[i].speed`, `speeds[i].ease`. 메시지 형식은 기존 (`${file} › ${path}: ...`)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// scroll.test.ts — tm120: 120 BPM, offset 0 → tick 480 = 500ms
const tm120 = new TimingMap([{ tick: 0, bpm: 120 }], 0);
it('지점 없음: 위치 = 시간', () => {
  const s = new ScrollMap(undefined, tm120);
  expect(s.positionAt(1000)).toBe(1000);
  expect(s.positionAt(-200)).toBe(-200);
  expect(s.speedAt(5000)).toBe(1);
  expect(new ScrollMap(undefined, new TimingMap([{ tick: 0, bpm: 120 }], 100)).positionAt(1100)).toBe(1000);
});
it('즉시 ×2', () => {
  const s = new ScrollMap([{ tick: 960, speed: 2 }], tm120);   // 1000ms
  expect(s.speedAt(999)).toBe(1);
  expect(s.speedAt(1000)).toBe(2);
  expect(s.positionAt(1500)).toBe(2000);
});
it('서서히 ×1 → ×3', () => {
  const s = new ScrollMap([{ tick: 960, speed: 1 }, { tick: 1920, speed: 3, ease: 'linear' }], tm120); // 1000→2000ms
  expect(s.speedAt(1500)).toBe(2);
  expect(s.positionAt(1500)).toBe(1750);
  expect(s.positionAt(2000)).toBe(3000);
  expect(s.positionAt(2500)).toBe(4500);
});
it('정지 구간에서는 위치가 그대로', () => {
  const s = new ScrollMap([{ tick: 960, speed: 0 }, { tick: 1440, speed: 1 }], tm120); // 1000→1500ms
  expect(s.positionAt(1200)).toBe(1000);
  expect(s.positionAt(1500)).toBe(1000);
  expect(s.positionAt(1700)).toBe(1200);
});
it('BPM이 바뀌는 곡: 변속 지점은 tick을 따라간다', () => {
  const tm = new TimingMap([{ tick: 0, bpm: 120 }, { tick: 960, bpm: 60 }], 0);   // tick 1440 = 2000ms
  const s = new ScrollMap([{ tick: 1440, speed: 2 }], tm);
  expect(s.positionAt(2000)).toBe(2000);
  expect(s.positionAt(2500)).toBe(3000);
});
it('첫 지점이 서서히면 곡 시작(×1)부터 바뀐다', () => {
  const s = new ScrollMap([{ tick: 960, speed: 3, ease: 'linear' }], tm120);
  expect(s.speedAt(500)).toBe(2);
  expect(s.positionAt(1000)).toBe(2000);
  expect(new ScrollMap([{ tick: 0, speed: 2, ease: 'linear' }], tm120).positionAt(500)).toBe(1000);
});
it('위치는 줄어들지 않는다', () => {
  const s = new ScrollMap([{ tick: 480, speed: 0 }, { tick: 960, speed: 5, ease: 'linear' }, { tick: 1440, speed: 0.5 }], tm120);
  let prev = -Infinity;
  for (let ms = -500; ms <= 3000; ms += 7) { const p = s.positionAt(ms); expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
});
it('formatSpeed', () => {
  expect([2, 1.25, 0.5, 1.234, 0].map(formatSpeed)).toEqual(['2.0', '1.25', '0.5', '1.23', '0.0']);
});

// parse.test.ts (추가) — chartText(notes, extra) 기존 헬퍼
it.each([
  [{ speeds: {} }, 'speeds'],
  [{ speeds: [{ tick: -1, speed: 1 }] }, 'speeds[0].tick'],
  [{ speeds: [{ tick: 1.5, speed: 1 }] }, 'speeds[0].tick'],
  [{ speeds: [{ tick: 480, speed: 1 }, { tick: 480, speed: 2 }] }, 'speeds[1].tick'],
  [{ speeds: [{ tick: 960, speed: 1 }, { tick: 480, speed: 2 }] }, 'speeds[1].tick'],
  [{ speeds: [{ tick: 0, speed: -0.1 }] }, 'speeds[0].speed'],
  [{ speeds: [{ tick: 0, speed: 20.5 }] }, 'speeds[0].speed'],
  [{ speeds: [{ tick: 0, speed: '2' }] }, 'speeds[0].speed'],
  [{ speeds: [{ tick: 0, speed: 1, ease: 'bounce' }] }, 'speeds[0].ease'],
])('잘못된 speeds %#', (patch, needle) => {
  const errors = errorsOf(parseChart(chartText([], patch), 'hard.chart.json'));
  expect(errors.join('\n')).toContain('hard.chart.json');
  expect(errors.join('\n')).toContain(needle);
});
it('정상 speeds (0과 20 경계 포함)', () => {
  const r = parseChart(chartText([], { speeds: [{ tick: 0, speed: 0 }, { tick: 480, speed: 20, ease: 'linear' }] }), 'n.chart.json');
  expect(r.ok && r.value.speeds).toEqual([{ tick: 0, speed: 0 }, { tick: 480, speed: 20, ease: 'linear' }]);
});

// serialize.test.ts (추가)
it('speeds가 없거나 비면 필드 생략', () => {
  const base = { formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4), notes: [] } as Chart;
  expect(serializeChart(base)).not.toContain('speeds');
  expect(serializeChart({ ...base, speeds: [] })).not.toContain('speeds');
});
it('instant 생략, 필드 순서, 왕복', () => {
  const chart = { formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4), notes: [],
    speeds: [{ tick: 0, speed: 2, ease: 'instant' }, { tick: 480, speed: 1, ease: 'linear' }] } as Chart;
  const text = serializeChart(chart);
  expect(JSON.parse(text).speeds).toEqual([{ tick: 0, speed: 2 }, { tick: 480, speed: 1, ease: 'linear' }]);
  expect(Object.keys(JSON.parse(text))).toEqual(['formatVersion', 'name', 'level', 'tracks', 'speeds', 'notes']);
  const back = parseChart(text, 'n.chart.json');
  expect(back.ok && back.value.speeds).toEqual([{ tick: 0, speed: 2 }, { tick: 480, speed: 1, ease: 'linear' }]);
});
```

- [ ] **Step 2: `npx vitest run packages/core` → FAIL**
- [ ] **Step 3: 구현** — `parseChart`가 돌려주는 값에는 `speeds`가 있을 때만 필드를 둔다(빈 배열이면 생략)
- [ ] **Step 4: `npx vitest run packages/core` → PASS, 루트 `npm test`·`npm run typecheck` 통과 (다른 패키지는 선택 필드라 깨지지 않아야 함)**
- [ ] **Step 5: 커밋** — `feat(core): per-chart scroll speed points and ScrollMap`

### Task 2: playfield — 변속 반영 + 게임 문서

**Files:**
- Modify: `packages/playfield/src/{view,Playfield}.ts`, `packages/playfield/test/view.test.ts`, `docs/CHART_FORMAT_GUIDE.md`

**Interfaces:**
- Consumes: Task 1 `ScrollMap`, `formatSpeed`(문서 예시용 아님, 필요 시)
- Produces (`@rcm/playfield`):
  - `visibleScrollRange(nowPos: number, height: number, judgeY: number, pxPerMs: number): { fromPos: number; toPos: number }` — `visibleRange`와 같은 식을 스크롤 위치 단위로
  - `firstAtOrAbove(sorted: readonly number[], value: number): number` — 오름차순 배열에서 `≥ value`인 첫 인덱스 (없으면 길이)
  - `Playfield`: 생성자에서 `new ScrollMap(chart.speeds, tm)`을 만들고 `state.notes` 순서대로 `startPos[]`, `endPos[]`, 최대 롱노트 길이(위치 단위)를 미리 계산. 노트 y = `judgeY − (pos − nowPos) × pxPerMs`. 화면 노트 고르기는 `firstAtOrAbove(startPos, fromPos − pad − maxHoldSpanPos)`부터 `startPos > toPos + pad`에서 멈춤. `state.notes`는 startMs 순이고 위치는 줄어들지 않으므로 startPos도 오름차순
  - 기존 `visibleRange`/`firstAtOrAfter`는 다른 곳에서 안 쓰면 삭제
- 문서 (`docs/CHART_FORMAT_GUIDE.md`): 2.2절 표에 `speeds` 행 추가, 새 절 "3.6 변속(스크롤 속도)"에 변속 스펙 2.1~2.3 공식과 Task 1의 검산값(즉시 ×2: 1500ms → 2000, 서서히: 1500ms → 1750, 정지), `ScrollMap` 사용 예, 4.4절 노트 그리기 공식을 스크롤 위치로 교체, "변속(스크롤 속도 변화) 이벤트는 포맷에 없다" 문장 삭제, 체크리스트에 "speeds가 있으면 노트 y를 스크롤 위치로 계산" 추가, 흔한 실수 표에 "변속 구간에서 노트 y를 ms 차이로 계산 → 화면 위치가 어긋남" 추가

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('스크롤 위치 단위의 화면 범위', () => {
  expect(visibleScrollRange(1000, 800, 680, 0.5)).toEqual({ fromPos: 760, toPos: 2360 });
});
it('firstAtOrAbove: 정지 구간처럼 같은 값이 이어져도 첫 것', () => {
  expect(firstAtOrAbove([0, 500, 1000, 1000, 1000, 1500], 1000)).toBe(2);
  expect(firstAtOrAbove([0, 500], 600)).toBe(2);
  expect(firstAtOrAbove([], 0)).toBe(0);
});
```

- [ ] **Step 2: `npx vitest run packages/playfield` → FAIL → 구현 → PASS**
- [ ] **Step 3: `Playfield.ts` 변경, 문서 갱신. 루트 `npm test`·`npm run typecheck` 통과**
- [ ] **Step 4: `npm run dev`로 실행해 오류 없이 뜨는지 확인 후 종료. 사람이 볼 항목 기록**: 변속 없는 채보의 테스트 플레이가 이전과 같음, ×2 구간 빨라짐, 서서히 구간 부드럽게 변함, 정지 구간에서 노트 멈춤(롱노트 포함)
- [ ] **Step 5: 커밋** — `feat(playfield): scroll speed in play view; document speeds`

### Task 3: 에디터 — 속도 지점 명령

**Files:**
- Create: `apps/editor/src/renderer/src/editor/commands/speeds.ts`, `apps/editor/test/renderer/commands/speeds.test.ts`

**Interfaces:**
- Consumes: Task 1 `SpeedPoint`, `SpeedEase`, `ScrollMap`, `MIN_SCROLL_SPEED`, `MAX_SCROLL_SPEED`; 기존 `getChart`, `replaceChart`, `ProjectDoc`
- Produces (모두 null = 거부·변화 없음):
  - `addSpeedPoint(doc: ProjectDoc, file: string, tick: number, speed: number): ProjectDoc | null` — tick이 0 이상 정수가 아니거나, 같은 tick이 있거나, speed 범위 밖이면 null. tick 정렬 위치에 `{ tick, speed }` 삽입
  - `updateSpeedPoint(doc, file, index: number, patch: { speed?: number; ease?: SpeedEase }): ProjectDoc | null` — index 범위 밖, speed 범위 밖, ease 값이 틀림, 결과가 같으면 null. `ease: 'instant'`는 필드 삭제
  - `removeSpeedPoint(doc, file, index: number): ProjectDoc | null` — 범위 밖이면 null. 마지막 하나를 지우면 `speeds` 필드 자체를 없앤다
  - `defaultSpeedAt(chart: Chart, tm: TimingMap, tick: number): number` — `new ScrollMap(chart.speeds, tm).speedAt(tm.tickToMs(tick))`를 소수 둘째 자리 반올림

- [ ] **Step 1: 실패하는 테스트 작성** (fixtures `d0`: 120 BPM, offset 0, `normal.chart.json` 4트랙, speeds 없음)

```ts
const F = 'normal.chart.json';
const speeds = (d: ProjectDoc) => getChart(d, F).speeds;
it('추가: 정렬, 중복·범위 거부', () => {
  let d = addSpeedPoint(d0, F, 1920, 2)!;
  d = addSpeedPoint(d, F, 960, 0)!;
  expect(speeds(d)).toEqual([{ tick: 960, speed: 0 }, { tick: 1920, speed: 2 }]);
  expect(addSpeedPoint(d, F, 960, 3)).toBeNull();
  expect(addSpeedPoint(d0, F, 0, 25)).toBeNull();
  expect(addSpeedPoint(d0, F, 0, -1)).toBeNull();
  expect(addSpeedPoint(d0, F, -480, 1)).toBeNull();
  expect(addSpeedPoint(d0, F, 1.5, 1)).toBeNull();
});
it('수정: 배율·방식, instant는 필드 삭제, 변화 없거나 범위 밖이면 null', () => {
  const d = addSpeedPoint(d0, F, 960, 2)!;
  expect(speeds(updateSpeedPoint(d, F, 0, { ease: 'linear' })!)).toEqual([{ tick: 960, speed: 2, ease: 'linear' }]);
  expect(speeds(updateSpeedPoint(updateSpeedPoint(d, F, 0, { ease: 'linear' })!, F, 0, { ease: 'instant' })!)).toEqual([{ tick: 960, speed: 2 }]);
  expect(updateSpeedPoint(d, F, 0, { speed: 2 })).toBeNull();
  expect(updateSpeedPoint(d, F, 0, { speed: 25 })).toBeNull();
  expect(updateSpeedPoint(d, F, 0, { speed: -1 })).toBeNull();
  expect(updateSpeedPoint(d, F, 5, { speed: 1 })).toBeNull();
});
it('삭제: 마지막 하나면 필드 제거', () => {
  const d = addSpeedPoint(d0, F, 960, 2)!;
  const r = removeSpeedPoint(d, F, 0)!;
  expect('speeds' in getChart(r, F)).toBe(false);
  expect(removeSpeedPoint(d0, F, 0)).toBeNull();
});
it('추가할 때 기본 배율 = 그 위치의 현재 속도', () => {
  const tm = new TimingMap(d0.song.timing, d0.song.offsetMs);
  const d = addSpeedPoint(updateSpeedPoint(addSpeedPoint(d0, F, 1920, 3)!, F, 0, { ease: 'linear' })!, F, 0, 1)!; // 0:×1 → 1920: 서서히 ×3
  expect(defaultSpeedAt(getChart(d, F), tm, 960)).toBe(2);
  expect(defaultSpeedAt(getChart(d0, F), tm, 960)).toBe(1);
});
it('노트·트랙은 그대로 (속도만 바뀜)', () => {
  const base = withNotes(d0, [{ tick: 0, track: 'Note_1', type: 'tap' }]);
  const d = addSpeedPoint(base, F, 960, 2)!;
  expect(getChart(d, F).notes).toBe(getChart(base, F).notes);
  expect(getChart(d, F).tracks).toBe(getChart(base, F).tracks);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/commands/speeds.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 커밋** — `feat(editor): scroll speed point commands`

### Task 4: 에디터 — 노트 속도 카드 + 타임라인 표시

**Files:**
- Modify: `apps/editor/src/renderer/src/editor/timeline/{view,drawTimeline}.ts`, `apps/editor/src/renderer/src/editor/timeline/TimelineCanvas.tsx`(DrawParams 전달), `apps/editor/src/renderer/src/editor/panels/TimingPanel.tsx`
- Create(권장): `apps/editor/src/renderer/src/editor/panels/SpeedCard.tsx`
- Test: `apps/editor/test/renderer/timeline/view.test.ts`

**Interfaces:**
- Consumes: Task 1 `ScrollMap`, `formatSpeed`; Task 3 명령과 `defaultSpeedAt`; 기존 `measureBeatAt`(commands/timing.ts), `snapTick`, `useDialogs`/`useToast`, `NumberField`, `SegmentedControl`, `Card`, `Row`, `IconButton`
- Produces:
  - `TimelineLayout`에 `speedX: number` 추가, `SPEED_GRAPH_WIDTH = 20`. `speedX = tracksX + totalWidth + 8`, `labelX = speedX + 20 + 8`
  - `speedLabel(point: SpeedPoint): string` (drawTimeline 또는 view에 export) — `×${formatSpeed}` / `→×${formatSpeed}` (linear) / `×0 정지` (speed 0, ease 무관)
  - `drawTimeline`:
    - 변속 지점: 트랙 영역을 가로지르는 `#34d399` 1px 선 + `labelX`의 칩(배경 `rgba(52, 211, 153, 0.16)`, 글자 `#34d399`). 같은 tick에 BPM 칩이 있으면 칩을 `CHIP_HEIGHT + 2`만큼 아래로
    - 속도 그래프 띠: `speedX`부터 20px, 바탕 `--bg-card` 값. 화면 각 1px 줄의 시각에서 `speedAt` → `min(speed, 4) / 4 × 20` 폭 막대를 `--accent-soft` 값으로, ×1 위치(5px)에 `--border` 값 1px 세로선
    - `ScrollMap`은 채보의 `speeds`·`tm`이 바뀔 때만 새로 만든다 (TimelineCanvas에서 memo해 DrawParams로 전달)
  - 노트 속도 카드 (변속 스펙 3.1): 제목 `노트 속도 — <난이도 이름>`, 행(위치 `마디:박`, `NumberField` step 0.1 min 0 max 20 접미어 `×`, `SegmentedControl` `즉시`/`서서히`, 삭제), 비었으면 `변속 없음 (×1)`, `현재 위치에 추가`(재생선 tick을 현재 스냅으로, 기본 배율 `defaultSpeedAt`; 같은 tick이면 토스트), 재생·녹음·테스트 플레이 중 비활성. 배율은 blur/Enter 커밋(기존 NumberField 규칙), null이면 원래 값으로 복원. Undo 라벨과 `chartFile` 지정

- [ ] **Step 1: 실패하는 테스트 작성/수정** — `view.test.ts`의 기존 `labelX` 기대값을 `+ 28`로 바꾸고 추가:

```ts
it('속도 그래프 띠와 라벨 위치', () => {
  const l = layoutTimeline(1000, [{ id: 'Side_L', width: 'wide' }, { id: 'Note_1' }, { id: 'T', width: 'narrow' }]);
  expect(l.speedX).toBe(420 + 160 + 8);
  expect(l.labelX).toBe(420 + 160 + 8 + 20 + 8);
});
it('변속 칩 문구', () => {
  expect(speedLabel({ tick: 0, speed: 2 })).toBe('×2.0');
  expect(speedLabel({ tick: 0, speed: 3, ease: 'linear' })).toBe('→×3.0');
  expect(speedLabel({ tick: 0, speed: 0 })).toBe('×0 정지');
  expect(speedLabel({ tick: 0, speed: 0, ease: 'linear' })).toBe('×0 정지');
  expect(speedLabel({ tick: 0, speed: 1.25 })).toBe('×1.25');
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/timeline/view.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 카드·그리기 구현, 루트 `npm test`·`npm run typecheck` 통과**
- [ ] **Step 4: `npm run dev` 실행 확인 후 종료. 사람이 볼 항목 기록**: 카드에서 추가·배율 변경·서서히 전환·삭제·Undo, 초록 선과 칩, BPM과 같은 tick에서 칩이 겹치지 않음, 속도 그래프 모양(즉시 계단·서서히 경사·정지 빈칸), 재생 중 카드 비활성
- [ ] **Step 5: 커밋** — `feat(editor): edit scroll speed points and show them on the timeline`
