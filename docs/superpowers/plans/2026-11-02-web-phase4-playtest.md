# 웹 4단계 (폰 테스트 플레이) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰에서 레인형·자유형 채보를 모두 테스트 플레이한다. 레인형은 판정선 주변을 손가락으로 치고, 플레이 중에는 전체 화면·화면 꺼짐 방지·방향 고정을 하며, 판정 오프셋을 설정 화면에서 맞춘다.

**Architecture:** 판정 칸 찾기·손가락별 레인 기억·레인 폭 맞춤·오프셋 적용은 `packages/playfield`의 순수 함수로 만들고, `Playfield`(레인형)가 캔버스 pointer 이벤트로 그것을 부른다. 판정 오프셋은 `Playfield`·`FreePlayfield`의 옵션으로 받아 판정 쪽 시계에만 빼고, 화면 그리기는 원래 시계를 쓴다. 렌더러는 오프셋 store·설정 카드, 폰 전용 플레이 화면(전체 화면·Wake Lock·방향 고정, 터치 버튼 HUD)을 더한다.

**Tech Stack:** TypeScript, Canvas 2D, Pointer Events, Fullscreen API, Screen Wake Lock API, Screen Orientation API, React 19, CSS Modules, vitest(node, DOM 없음 — `Playfield`는 기존 `playfieldEffects.test.ts`처럼 가짜 canvas·ctx로 테스트).

**Spec:** `docs/superpowers/specs/2026-11-01-web-mobile-design.md` — 6.1, 6.2, 1장(판정 오프셋 ±200ms), 8장(순수 함수 테스트: `laneAt`, 판정 오프셋 적용). 6.3 PWA 설치 안내는 5단계다.

## Global Constraints

- 터치 판정 칸: 판정선 위로 **화면 높이의 40%** 지점부터 화면 아래까지(`TOUCH_ZONE_ABOVE_JUDGE = 0.4`). 칸의 가로 경계는 `Playfield`가 그리는 레인 열(`trackColumns`)과 같다.
- 기믹 트랙(`track.kind === 'gimmick'`)은 칸을 만들지 않는다.
- 손가락마다(`pointerId`) 누른 레인을 기억한다. 다른 칸으로 미끄러지면 원래 레인을 떼고 새 레인을 누른다. 같은 레인을 여러 손가락(또는 키+손가락)이 누르면 모두 떼야 뗀 것이다.
- 레인형 터치는 `pointerType`이 `'touch'`·`'pen'`일 때만 받는다. 마우스 클릭은 지금처럼 아무 일도 하지 않는다(PC 앱 동작 그대로).
- 자동 플레이 중에는 터치 입력을 무시한다(키 입력과 같다).
- 판정 오프셋: 범위 **-200 ~ +200ms 정수, 기본 0** (`JUDGE_OFFSET_LIMIT`, 이미 있음). 판정 시각 = 화면 시계 − 오프셋. 키·터치 입력, 시간이 지나 MISS 처리, 자동 플레이 모두 이 시각을 쓴다. 그리기(노트 위치)는 화면 시계를 쓴다.
- 전체 화면·Wake Lock·방향 고정은 **웹(`!caps().windowControls`)이면서 폰 배치(`useLayoutMode() !== 'desktop'`)**일 때만 시도하고, 실패하거나 API가 없으면 조용히 넘어간다. 플레이가 끝나면 푼다. PC 앱(Electron)은 바뀌지 않는다.
- 방향 고정 대상: 자유형은 고른 화면 방향(`aspect`), 레인형은 플레이를 시작할 때의 화면 방향.
- 자유형 터치 판정은 지금 구현 그대로다(오프셋만 더해진다).
- 폰 CSS는 `:global(html[data-layout^='phone'])` 선택자로만 건다. `@media`로 폭을 재지 않는다.
- 문구는 해요체. 세미콜론 없음(playfield 패키지는 그 패키지의 기존 스타일, 세미콜론 있음), 작은따옴표, vitest 테스트 이름은 한국어.
- `npm test`, `npm run typecheck`, `npm run build:web`, `npm -w @rcm/editor run build`가 모든 task 끝에서 성공한다.
- 커밋은 `main`에 바로 한다.

## Review Focus

1. 손가락이 옆 레인으로 미끄러지면 원래 레인 롱노트는 떼지고 새 레인이 눌린다 → Task 1 `옆 칸으로 미끄러지면 원래 레인을 떼고 새 레인을 누른다`.
2. 같은 레인을 두 손가락이 누르다 하나를 떼도 롱노트는 이어진다 → Task 2 `같은 레인의 두 손가락 중 하나를 떼도 레인은 눌려 있다`.
3. 7레인 채보(64px × 7 = 448px)를 360px 폰에서 플레이하면 바깥 레인이 화면 밖으로 나가 칠 수 없다 → 레인 폭을 화면에 맞춘다. Task 1 `레인이 화면보다 넓으면 폭을 줄여 다 들어가게 한다`, Task 2에서 그리기·칸 판정에 같이 쓴다.
4. 오프셋 +100ms인 사용자가 노트보다 100ms 늦게 치면 PERFECT여야 하고, 그 전에 MISS로 넘어가면 안 된다 → Task 2 `오프셋만큼 늦게 친 입력은 PERFECT`.
5. iPhone Safari는 요소 전체 화면·방향 고정이 없고, Wake Lock이 거절될 수 있다. 그래도 플레이는 시작되고 처리 안 된 Promise 오류가 없어야 한다 → Task 4 `API가 없거나 거절돼도 오류 없이 시작하고 정리한다`.

---

### Task 1: 터치 칸·손가락 레인·오프셋 순수 함수 (`packages/playfield`)

**Files:**
- Modify: `packages/playfield/src/view.ts` (`TOUCH_ZONE_ABOVE_JUDGE`, `touchLaneAt`, `fitLaneWidth`)
- Create: `packages/playfield/src/touchInput.ts` (`TouchLanes`), `index.ts`에 export 추가
- Modify: `packages/playfield/src/judge.ts` (`judgeClockMs`)
- Test: `packages/playfield/test/view.test.ts`, `packages/playfield/test/touchInput.test.ts`(새 파일), `packages/playfield/test/judge.test.ts`

**Interfaces:**
- Produces:
  - `TOUCH_ZONE_ABOVE_JUDGE = 0.4`
  - `touchLaneAt(x: number, y: number, cols: readonly { x: number; width: number }[], judgeY: number, height: number, touchable: readonly boolean[]): number` — `y < judgeY - TOUCH_ZONE_ABOVE_JUDGE * height`이면 -1. 아니면 `cols[i].x <= x < cols[i].x + cols[i].width`이고 `touchable[i]`인 i, 없으면 -1.
  - `FIT_LANE_MARGIN = 8`, `fitLaneWidth(canvasWidth: number, laneCount: number, laneWidth: number): number` — `min(laneWidth, floor((canvasWidth - 2 * FIT_LANE_MARGIN) / laneCount))`, 최소 1. 레인이 0개면 `laneWidth`.
  - `interface LaneMove { release: number | null; press: number | null }`
  - `class TouchLanes { down(id: number, lane: number): LaneMove; move(id: number, lane: number): LaneMove; up(id: number): LaneMove; has(id: number): boolean; clear(): void }` — 포인터 id → 레인(-1은 칸 밖) 기억만 한다. 여러 손가락 셈은 하지 않는다(`Playfield`가 `HeldKeys`로 한다).
  - `judgeClockMs(nowMs: number, offsetMs: number): number` = `nowMs - offsetMs`

- [ ] **Step 1: 실패하는 테스트**

`view.test.ts`:

```ts
describe('touchLaneAt', () => {
  const cols = trackColumns(400, 4, 64) // x: 72, 136, 200, 264
  const all = [true, true, true, true]
  it('판정선 근처 레인 안은 그 레인', () => expect(touchLaneAt(150, 700, cols, 680, 800, all)).toBe(1))
  it('판정선 위 40% 지점까지는 칸이다', () => expect(touchLaneAt(150, 680 - 320, cols, 680, 800, all)).toBe(1))
  it('그보다 위는 칸이 아니다', () => expect(touchLaneAt(150, 680 - 321, cols, 680, 800, all)).toBe(-1))
  it('레인 밖은 칸이 아니다', () => expect(touchLaneAt(10, 700, cols, 680, 800, all)).toBe(-1))
  it('기믹 레인은 칸이 아니다', () => expect(touchLaneAt(150, 700, cols, 680, 800, [true, false, true, true])).toBe(-1))
  it('경계는 오른쪽 레인이다', () => expect(touchLaneAt(136, 700, cols, 680, 800, all)).toBe(1))
})

describe('fitLaneWidth', () => {
  it('들어가면 그대로', () => expect(fitLaneWidth(400, 4, 64)).toBe(64))
  it('레인이 화면보다 넓으면 폭을 줄여 다 들어가게 한다', () => expect(fitLaneWidth(360, 7, 64)).toBe(49))
  it('레인이 없으면 그대로', () => expect(fitLaneWidth(360, 0, 64)).toBe(64))
})
```

`touchInput.test.ts`:

```ts
describe('TouchLanes', () => {
  it('누르면 그 레인을 누른다', () => expect(new TouchLanes().down(1, 2)).toEqual({ release: null, press: 2 }))
  it('칸 밖을 누르면 아무것도 누르지 않지만 기억한다', () => {
    const t = new TouchLanes()
    expect(t.down(1, -1)).toEqual({ release: null, press: null })
    expect(t.has(1)).toBe(true)
    expect(t.move(1, 3)).toEqual({ release: null, press: 3 })
  })
  it('옆 칸으로 미끄러지면 원래 레인을 떼고 새 레인을 누른다', () => {
    const t = new TouchLanes()
    t.down(1, 0)
    expect(t.move(1, 1)).toEqual({ release: 0, press: 1 })
    expect(t.move(1, 1)).toEqual({ release: null, press: null })
  })
  it('칸 밖으로 나가면 뗀다', () => {
    const t = new TouchLanes()
    t.down(1, 2)
    expect(t.move(1, -1)).toEqual({ release: 2, press: null })
  })
  it('떼면 그 레인을 떼고 잊는다', () => {
    const t = new TouchLanes()
    t.down(1, 2)
    expect(t.up(1)).toEqual({ release: 2, press: null })
    expect(t.has(1)).toBe(false)
  })
  it('모르는 손가락은 아무 일도 없다', () => {
    const t = new TouchLanes()
    expect(t.move(9, 1)).toEqual({ release: null, press: null })
    expect(t.up(9)).toEqual({ release: null, press: null })
  })
})
```

`judge.test.ts`:

```ts
it('판정 시계는 화면 시계에서 오프셋을 뺀다', () => {
  expect(judgeClockMs(1000, 100)).toBe(900)
  expect(judgeClockMs(1000, -50)).toBe(1050)
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield/test/view.test.ts packages/playfield/test/touchInput.test.ts packages/playfield/test/judge.test.ts` → FAIL (없는 export)

- [ ] **Step 3: 구현** (`view.ts`, `touchInput.ts`, `judge.ts`, `index.ts`)

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, 그 뒤 `npm test && npm run typecheck`

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(playfield): touch lane zones, per-finger lanes, lane fit and judge clock"
```

---

### Task 2: `Playfield` 터치 입력·레인 폭 맞춤, 두 Playfield의 판정 오프셋

**Files:**
- Modify: `packages/playfield/src/Playfield.ts`, `packages/playfield/src/FreePlayfield.ts`
- Test: `packages/playfield/test/playfieldTouch.test.ts`(새 파일)

**Interfaces:**
- Consumes: Task 1의 `touchLaneAt`, `fitLaneWidth`, `TouchLanes`, `judgeClockMs`.
- Produces:
  - `PlayfieldOptions.judgeOffsetMs?: number`, `FreePlayfieldOptions`(그 파일의 옵션 타입)`.judgeOffsetMs?: number` — 없으면 0.
  - `Playfield`가 `input !== false`일 때 캔버스에 `pointerdown`·`pointermove`·`pointerup`·`pointercancel`을 듣는다.

- [ ] **Step 1: 실패하는 테스트 (`playfieldTouch.test.ts`)**

`playfieldEffects.test.ts`의 가짜 canvas·ctx·`requestAnimationFrame` 방식을 따르되, canvas의 `addEventListener`가 핸들러를 맵에 모으고, `getBoundingClientRect: () => ({ left: 0, top: 0 })`, `setPointerCapture: () => {}`를 준다. `W = 400`, `H = 800`, `basicTracks(4)`, 120BPM(480tick = 500ms). 터치는 `{ pointerId, pointerType: 'touch', button: 0, clientX, clientY, preventDefault() {} }`. 레인 i의 가운데 x는 `trackColumns(400, 4, 64)[i].x + 32`, y는 `judgeLineY(800, DEFAULT_LAYOUT)`. 이벤트를 보내기 전에 한 프레임 그린다(칸 위치는 그린 화면을 따른다).

```ts
it('판정선을 손가락으로 치면 그 레인 노트가 PERFECT', () => {
  // 노트 Note_2 @500ms, 500ms에 레인 1 터치
  expect(pf.state.counts.perfect).toBe(1)
})
it('마우스 클릭은 치지 않는다', ...)               // pointerType 'mouse' → counts.perfect 0
it('기믹 트랙 레인은 치지 않는다', ...)            // tracks[1].kind = 'gimmick' 로 바꾼 채보
it('같은 레인의 두 손가락 중 하나를 떼도 레인은 눌려 있다', ...)
// 롱노트 Note_1 500~1500ms: 500ms에 손가락 1·2로 레인 0 누름, 800ms에 손가락 1만 뗌,
// 1500ms 프레임 뒤 꼬리 판정이 MISS가 아니다(counts.miss === 0)
it('옆 레인으로 미끄러지면 원래 레인 롱노트를 뗀다', ...)
// 위 롱노트를 500ms에 누르고 800ms에 레인 1로 move → counts.miss === 1 (일찍 뗌)
it('자동 플레이 중에는 터치를 무시한다', ...)
it('오프셋만큼 늦게 친 입력은 PERFECT', ...)
// judgeOffsetMs: 100, 노트 @500ms. 600ms에 터치 → perfect 1. 그 전에 frameAt(580)을 그려도 MISS가 아니다
it('레인이 화면보다 넓으면 바깥 레인도 칠 수 있다', ...)
// basicTracks(7), W = 360: fitLaneWidth(360, 7, 64) 폭의 6번 레인 가운데를 터치 → 그 레인 노트 PERFECT
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield/test/playfieldTouch.test.ts` → FAIL

- [ ] **Step 3: `Playfield` 구현**

- `draw`: 미리보기가 아니면(`viewHeight === undefined`) 레인 폭을 `fitLaneWidth(width, lanes, layout.laneWidth)`로 줄여 `trackColumns`·노트·이펙트·키 표시에 쓴다(미리보기는 지금처럼 `fitScale`로 축소). 그린 `cols`·`judgeY`·`height`를 다음 터치 판정용으로 저장한다.
- 터치: `touchable = chart.tracks.map(t => t.kind !== 'gimmick')`. `pointerdown`에서 `pointerType === 'mouse'`이거나 자동 플레이면 무시, 아니면 `preventDefault`·`setPointerCapture` 후 `TouchLanes.down`. `move`는 `has(id)`일 때만. `up`·`cancel`은 `up(id)`. 받은 `LaneMove`는 키와 같은 길로 처리한다: 누름은 `held.down(trackId, 'touch:' + id)`가 true면 `pressed[lane] = true`와 `state.press`, 뗌은 `held.up(trackId, 'touch:' + id)`가 true이고 `pressed[lane]`이면 `release(lane)`. `onBlur`·`stop`에서 `TouchLanes.clear()`, `stop`에서 리스너를 뗀다.
- 오프셋: `const clock = () => judgeClockMs(this.opts.getTimeMs(), this.opts.judgeOffsetMs ?? 0)`. `state.press`·`state.release`·`state.update`·`autoplayStep`에 `clock()`을 넘긴다. `draw(now)`는 화면 시계 그대로. 판정 이벤트의 `ms`(판정 글자·이펙트 시작 시각)는 `show`에서 오프셋을 더해 화면 시계로 되돌린다.

- [ ] **Step 4: `FreePlayfield` 오프셋** — 같은 규칙: `state.down/move/up/update/autoStep`에 판정 시계, 그리기와 이벤트 표시 시각은 화면 시계. 터치 처리 방식은 바꾸지 않는다.

- [ ] **Step 5: 통과 확인** — `npx vitest run packages/playfield` PASS, 그 뒤 `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(playfield): touch input for lane playtest, fit lanes to width, judge offset"
```

---

### Task 3: 판정 오프셋 설정 (store, 설정 카드, 테스트 플레이 연결)

**Files:**
- Modify: `apps/editor/src/shared/settingsRules.ts` (`clampJudgeOffset`), `apps/editor/test/shared/settingsRules.test.ts`
- Create: `apps/editor/src/renderer/src/gameplay/judgeOffsetStore.ts`, `apps/editor/test/renderer/judgeOffsetStore.test.ts`
- Create: `apps/editor/src/renderer/src/gameplay/JudgeOffsetSettings.tsx` (기존 `GameplaySettings.module.css` 재사용)
- Modify: `apps/editor/src/renderer/src/settings/SettingsPage.tsx` (`<GameplaySettings />` 바로 아래), `apps/editor/src/renderer/src/App.tsx` (`loadJudgeOffset`), `apps/editor/src/renderer/src/editor/playtest/PlaytestOverlay.tsx`

**Interfaces:**
- Consumes: 기존 `window.rcm.getJudgeOffset()`, `setJudgeOffset(ms)`, `JUDGE_OFFSET_LIMIT`; Task 2의 `judgeOffsetMs` 옵션.
- Produces:
  - `clampJudgeOffset(ms: number): number` — 반올림 후 ±`JUDGE_OFFSET_LIMIT`로 자른다. 숫자가 아니면 0.
  - `judgeOffsetStore.ts`: `loadJudgeOffset(): Promise<void>`, `getJudgeOffset(): number`, `useJudgeOffset(): number`, `setJudgeOffset(ms: number): void` — `layoutStore.ts`와 같은 모양(바로 반영, 300ms 뒤 저장, 저장 실패는 `console.warn('판정 오프셋을 저장하지 못했어요', err)`). `setJudgeOffset`은 `clampJudgeOffset`을 거친다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// settingsRules.test.ts
describe('clampJudgeOffset', () => {
  it('범위 안은 반올림', () => expect(clampJudgeOffset(12.6)).toBe(13))
  it('범위 밖은 자른다', () => { expect(clampJudgeOffset(500)).toBe(200); expect(clampJudgeOffset(-500)).toBe(-200) })
  it('숫자가 아니면 0', () => expect(clampJudgeOffset(Number.NaN)).toBe(0))
})
```

`judgeOffsetStore.test.ts` — `layoutStore.test.ts`의 방식(`vi.resetModules`, `window.rcm` stub, 가짜 타이머)으로:
- `불러오기 전에는 0, 불러오면 저장된 값`
- `바꾸면 바로 반영하고 300ms 뒤 한 번만 저장한다`
- `범위 밖 값은 잘라서 저장한다` (`setJudgeOffset(999)` → `getJudgeOffset() === 200`, 저장 인자 200)

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/shared/settingsRules.test.ts apps/editor/test/renderer/judgeOffsetStore.test.ts` → FAIL

- [ ] **Step 3: 구현 후 통과 확인**

- [ ] **Step 4: 설정 카드와 연결**

- `JudgeOffsetSettings`: `<Card title="판정">` 한 줄 — 라벨 `판정 오프셋`, 설명 `입력이 늦게 들어가는 기기면 + 쪽으로 올려요`, `Slider`(-200~200) + `NumberField`(`suffix="ms"`, 값은 `setJudgeOffset`이 자른다), 줄 끝에 `0으로` 버튼(0이면 꺼짐). `GameplaySettings`의 행 스타일을 그대로 쓴다.
- `App.tsx`: `loadLayout` 옆에서 `loadJudgeOffset().catch(() => {})`.
- `PlaytestOverlay`: 두 Playfield 옵션에 `judgeOffsetMs: getJudgeOffset()`(플레이를 시작할 때의 값).

- [ ] **Step 5: 확인** — `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(editor): judge offset setting applied to playtest"
```

---

### Task 4: 폰 플레이 화면 (전체 화면·Wake Lock·방향 고정, 터치 HUD)

**Files:**
- Create: `apps/editor/src/renderer/src/editor/playtest/playtestScreen.ts`, `apps/editor/test/renderer/playtestScreen.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/playtest/PlaytestOverlay.tsx`, `PlaytestOverlay.module.css`
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (오버레이에 다시 시작·자동 콜백 전달)

**Interfaces:**
- Consumes: `caps()`, `useLayoutMode()`, Task 3까지의 `PlaytestOverlay`.
- Produces:
  - `type ScreenOrientationTarget = 'portrait' | 'landscape'`
  - `orientationTarget(free: boolean, aspect: FreeAspect, viewport: { width: number; height: number }): ScreenOrientationTarget` — 자유형은 `aspect`, 레인형은 `width > height`면 `'landscape'` 아니면 `'portrait'`.
  - `enterPlaytestScreen(target: ScreenOrientationTarget): () => void` — `document.documentElement.requestFullscreen?.()`, `navigator.wakeLock?.request('screen')`, (전체 화면이 된 뒤) `screen.orientation?.lock?.(target)`을 시도한다. 모든 실패·없음은 삼킨다(처리 안 된 Promise 거절이 없게 `.catch`). 돌려주는 정리 함수는 얻은 Wake Lock을 `release()`, 이 함수가 연 전체 화면이면 `document.exitFullscreen()`, 방향은 `screen.orientation.unlock?.()`. 정리는 여러 번 불러도 안전하다.
  - `PlaytestOverlay` props에 `onRestart: () => void`, `onToggleAutoplay: () => void` (EditorScreen의 `runAction('playtestRestart')`, `runAction('playtestAuto')`와 같은 경로).

- [ ] **Step 1: 실패하는 테스트 (`playtestScreen.test.ts`)**

```ts
describe('orientationTarget', () => {
  it('자유형은 고른 방향', () => expect(orientationTarget(true, 'landscape', { width: 390, height: 844 })).toBe('landscape'))
  it('레인형은 지금 화면 방향', () => {
    expect(orientationTarget(false, 'portrait', { width: 844, height: 390 })).toBe('landscape')
    expect(orientationTarget(false, 'landscape', { width: 390, height: 844 })).toBe('portrait')
  })
})

describe('enterPlaytestScreen', () => {
  it('API가 없거나 거절돼도 오류 없이 시작하고 정리한다', async () => { ... })
  // document.documentElement에 requestFullscreen 없음, navigator.wakeLock.request가 reject, screen 없음
  // → enterPlaytestScreen이 throw하지 않고, await Promise 몇 번 뒤에도 unhandled rejection이 없다
  //   (process.on('unhandledRejection') 스파이), 정리 함수를 두 번 불러도 throw하지 않는다
  it('얻은 것만 정리한다', async () => { ... })
  // requestFullscreen 성공·wakeLock 성공(release 스파이)·orientation.lock 성공(unlock 스파이) →
  // 정리하면 release·exitFullscreen·unlock이 한 번씩, 두 번째 정리는 아무것도 부르지 않는다
})
```

전역은 `vi.stubGlobal('document', ...)`, `vi.stubGlobal('navigator', ...)`, `vi.stubGlobal('screen', ...)`로 만든다.

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/renderer/playtestScreen.test.ts` → FAIL

- [ ] **Step 3: `playtestScreen.ts` 구현 후 통과 확인**

- [ ] **Step 4: `PlaytestOverlay` 폰 화면**

- 웹·폰일 때만(`!caps().windowControls && mode !== 'desktop'`) 마운트 시 `enterPlaytestScreen(orientationTarget(free, aspect, { width: innerWidth, height: innerHeight }))`, 언마운트 시 정리. 자유형에서 방향을 바꾸면 정리 후 새 방향으로 다시 부른다.
- 웹(`!caps().windowControls`)에서는 타이틀바가 없으므로 오버레이를 화면 맨 위부터 덮는다(`.overlay`의 `inset` 위쪽 36px을 0으로 하는 클래스).
- `.canvas`에 `touch-action: none`.
- 폰 배치에서는 HUD를 화면 위쪽 전체 폭의 한 줄로 바꾸고(`env(safe-area-inset-top)` 여백), 키 안내 대신 40px 버튼을 둔다: `종료`, `다시`, `자동`(켜져 있으면 강조, `aria-pressed`), `배속 −`·`배속 +`(aria-label `배속 내리기`·`배속 올리기`, 지금처럼 `clampSpeed`·`setPlaytestSpeed`), 자유형이면 `세로`/`가로` 전환. 판정 개수는 같은 줄 아래 작은 한 줄(`P 0 · G 0 · G 0 · M 0 · 최대 콤보 0` 꼴, 색은 지금 판정 색). 데스크톱 HUD는 지금 그대로다. 자유형 안내 문구(`마우스·터치로 쳐요…`)는 폰에서 숨긴다.

- [ ] **Step 5: 확인과 수동 확인 목록**

Run: `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`

수동 확인 목록 — PC Chrome(터치 흉내, `phone-preview.html` 또는 기기 흉내 모드)에서 PASS / FAIL / NOT RUN으로 기록한다. 실제 Android Chrome·iPhone Safari 확인은 사용자 몫으로 남긴다.

1. 레인형 테스트 플레이: 판정선 근처 레인을 손가락으로 치면 판정, 위쪽 60%를 치면 아무 일 없음, 롱노트를 누르고 있으면 이어짐, 옆 레인으로 미끄러지면 뗌.
2. 7레인 채보가 폰 세로 폭 안에 다 들어오고 바깥 레인도 쳐짐.
3. 자유형 테스트 플레이가 지금처럼 터치로 됨.
4. 폰 HUD 버튼: 종료·다시·자동·배속 −/+·(자유형) 방향 전환.
5. 설정 → 판정 오프셋을 바꾸면 다음 테스트 플레이부터 적용(예: +120ms에서 늦게 친 입력이 PERFECT).
6. 웹·폰에서 시작하면 전체 화면 요청(흉내 모드에서는 콘솔 오류 없음만 확인), 끝나면 풀림.
7. PC 배치(데스크톱 폭): HUD·키 입력·F4·F5·F6·↑↓·Esc가 그대로, 마우스 클릭은 레인형에서 아무 일 없음.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(editor): phone playtest screen with fullscreen, wake lock and touch HUD"
```
