# 게임플레이 레이아웃 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 페이지의 게임플레이 섹션에서 판정선 두께·위치, 노트 두께·너비, 노트 모양(바/동그라미)을 바꾸고, 4키 미리보기(전체화면 포함)와 테스트 플레이에 그대로 반영한다.

**Architecture:** `packages/playfield`에 순수 레이아웃 모듈(`layout.ts`)과 자동 플레이(`autoplay.ts`)를 두고, `Playfield`가 레이아웃·자동 플레이·입력 끄기 옵션을 받는다. 에디터는 레이아웃을 `settings.json`에 저장하고 렌더러 store로 구독한다. 미리보기는 실제 `Playfield`를 자동 플레이로 돌린다.

**Tech Stack:** 기존과 같음 (TypeScript, Vitest, Electron + electron-vite + React, lucide-react). 새 의존성 없음

**Spec:** `docs/superpowers/specs/2026-10-12-gameplay-layout-design.md` (이하 "스펙")

## Global Constraints

- 레이아웃 키·범위·기본값 (스펙 1절): `laneWidth` 30~200 기본 64, `noteHeight` 4~60 기본 14, `judgeLineThickness` 1~20 기본 3, `judgeLineFromBottom` 0~400 기본 120, `noteShape` `'bar' | 'circle'` 기본 `'bar'`. 숫자는 정수(반올림)
- 기본 레이아웃에서 테스트 플레이 모습이 지금과 같아야 한다 (노트 inset 3px, 모서리 3px, 롱노트 몸통 44px, 판정선 3px, 키 표시 judgeY+48)
- 롱노트 몸통 너비 `round(laneWidth × 0.69)`. 동그라미 반지름 `(laneWidth − 6) / 2`
- 판정선을 옮겨도 낙하 시간은 `2692.857 / 배속` ms (`pxPerMsForSpeed(speed, judgeY)` 그대로)
- `judgeLineFromBottom < 48`이면 키 표시를 그리지 않는다
- 테스트 플레이 레인 너비는 트랙 `width`를 무시한다. 에디터 타임라인·미니맵은 손대지 않는다
- 저장 디바운스 300ms, 저장 실패는 `console.warn`만
- UI 문구는 한국어, 기존 디자인 토큰·CSS module
- 테스트는 `packages/playfield/test/`, `apps/editor/test/` (루트에서 `npm test`)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session: https://claude.ai/code/session_0193KVdVcsVXdi6XcDzTsVW4`. `git add`는 파일을 지정한다

## Review Focus

1. **동그라미 + 좁은 레인** — `laneWidth` 30에서 반지름 12, 롱노트 몸통 21px로 그려지고 0 이하 크기가 나오지 않아야 한다 → Task 2 테스트 `최소 레인에서도 양수 크기`
2. **판정선 0px(화면 맨 아래)** — 판정선이 화면 끝에 붙어도 노트가 보이고 키 표시는 숨겨져야 한다 → Task 2 테스트 `keyLabelsVisible`
3. **설정 파일의 깨진 `gameplay` 값** — 문자열·NaN·범위 밖 값이 섞여도 그 키만 기본값이 되고 나머지는 유지 → Task 1 테스트 `잘못된 키만 기본값`
4. **자동 플레이에서 같은 레인 롱노트 직후 단타** — 롱노트 끝 시각에 바로 다음 노트가 와도 둘 다 PERFECT → Task 3 테스트 `롱노트 끝과 같은 시각의 다음 노트`
5. **슬라이더를 빠르게 끌 때 저장 폭주** — 300ms 디바운스로 마지막 값만 저장 → Task 5 테스트 `연달아 바꾸면 마지막 값만 저장`

---

### Task 1: 레이아웃 값 (`packages/playfield/src/layout.ts`)

**Files:**
- Create: `packages/playfield/src/layout.ts`
- Modify: `packages/playfield/src/index.ts` (`export * from './layout'`)
- Test: `packages/playfield/test/layout.test.ts`

**Interfaces:**
- Produces: `type NoteShape = 'bar' | 'circle'`, `interface PlayfieldLayout { laneWidth; noteHeight; noteShape; judgeLineThickness; judgeLineFromBottom }`, `DEFAULT_LAYOUT: PlayfieldLayout`, `LAYOUT_LIMITS: Record<'laneWidth' | 'noteHeight' | 'judgeLineThickness' | 'judgeLineFromBottom', { min: number; max: number }>`, `sanitizeLayout(raw: unknown): PlayfieldLayout`, `layoutEquals(a, b): boolean`

- [ ] **Step 1: 실패하는 테스트**
  - `기본값과 범위`: `DEFAULT_LAYOUT`이 `{ laneWidth: 64, noteHeight: 14, noteShape: 'bar', judgeLineThickness: 3, judgeLineFromBottom: 120 }`, `LAYOUT_LIMITS.laneWidth`가 `{ min: 30, max: 200 }` 등 스펙 표 그대로
  - `객체가 아니면 기본값`: `sanitizeLayout(null | 'x' | [] | undefined)` → `DEFAULT_LAYOUT`과 같고 같은 참조가 아님
  - `범위로 자르고 반올림`: `{ laneWidth: 10, noteHeight: 99, judgeLineThickness: 2.6, judgeLineFromBottom: 500, noteShape: 'circle' }` → `{ 30, 60, 'circle', 3, 400 }`
  - `잘못된 키만 기본값`: `{ laneWidth: '80', noteHeight: NaN, noteShape: 'square', judgeLineThickness: 5 }` → `{ 64, 14, 'bar', 5, 120 }`
  - `layoutEquals`: 같은 값 true, 한 키만 달라도 false

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield/test/layout.test.ts` / Expected: FAIL (모듈 없음)
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — Expected: PASS
- [ ] **Step 5: 커밋** — `feat(playfield): gameplay layout values`

---

### Task 2: 레이아웃 기준 계산 (`packages/playfield/src/view.ts`)

**Files:**
- Modify: `packages/playfield/src/view.ts`
- Test: `packages/playfield/test/view.test.ts`

**Interfaces:**
- Consumes: Task 1 `PlayfieldLayout`, `DEFAULT_LAYOUT`
- Produces:
  - `trackColumns(canvasWidth: number, laneCount: number, laneWidth: number): { x: number; width: number }[]` (기존 시그니처 대체. `TRACK_BASE_WIDTH`, `TRACK_WIDTH_FACTOR`, `trackPixelWidth` 삭제)
  - `judgeLineY(height: number, layout: PlayfieldLayout): number` = `height − judgeLineFromBottom`
  - `holdBodyWidth(laneWidth: number): number` = `Math.round(laneWidth * 0.69)`
  - `NOTE_INSET = 3` (export)
  - `noteHalfExtent(layout: PlayfieldLayout): number` — 바 `noteHeight / 2`, 동그라미 `(laneWidth − 2·NOTE_INSET) / 2`
  - `KEY_LABEL_OFFSET = 48`, `keyLabelsVisible(layout): boolean` = `judgeLineFromBottom >= KEY_LABEL_OFFSET`
  - `JUDGE_LINE_FROM_BOTTOM` 삭제 (`DEFAULT_LAYOUT.judgeLineFromBottom`로 대체)

- [ ] **Step 1: 기존 `트랙 열` 테스트를 바꾸고 새 테스트 추가**
  - `트랙 열: 모두 같은 너비, 가운데 정렬`: `trackColumns(400, 3, 64)` → 너비 `[64, 64, 64]`, `x[0] = floor((400 − 192) / 2) = 104`, `x[1] = 168`
  - `holdBodyWidth`: `64 → 44`, `30 → 21`, `200 → 138`
  - `noteHalfExtent`: 기본 → 7, `{ ...DEFAULT_LAYOUT, noteShape: 'circle' }` → 29
  - `최소 레인에서도 양수 크기`: `laneWidth: 30` 동그라미 → 12, `holdBodyWidth(30) > 0`
  - `keyLabelsVisible`: 120 → true, 48 → true, 47 → false, 0 → false
  - `판정선을 옮겨도 낙하 시간 유지`: `height = 800`, `judgeLineFromBottom` 0과 400에서 `judgeY / pxPerMsForSpeed(4, judgeY)` 둘 다 673.214에 가깝다

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield/test/view.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — `Playfield.ts`의 기존 `trackColumns(width, tracks)` 호출과 `JUDGE_LINE_FROM_BOTTOM` import는 이 Task에서 `trackColumns(width, this.lanes, DEFAULT_LAYOUT.laneWidth)`, `judgeLineY(height, DEFAULT_LAYOUT)`로 임시 교체해 컴파일만 유지 (Task 4에서 레이아웃으로 바꿈)
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run packages/playfield && npx tsc -p packages/playfield` / Expected: PASS, 오류 없음
- [ ] **Step 5: 커밋** — `feat(playfield): layout-based lane, note and judge line geometry`

---

### Task 3: 자동 플레이 (`packages/playfield/src/autoplay.ts`)

**Files:**
- Create: `packages/playfield/src/autoplay.ts`
- Modify: `packages/playfield/src/index.ts`
- Test: `packages/playfield/test/autoplay.test.ts`

**Interfaces:**
- Consumes: `PlayState` (`notes`, `heldNote`, `press`, `release`), `JudgeEvent`
- Produces: `autoplayStep(state: PlayState, now: number): JudgeEvent[]`
  1. 레인마다 누르는 중인 롱노트의 `endMs <= now`면 `release(lane, endMs)`
  2. 시작 시각 순으로 `!headJudged && startMs <= now`인 노트를 `press(lane, startMs)`
  3. 생긴 이벤트를 순서대로 모아 돌려준다

- [ ] **Step 1: 실패하는 테스트** (`playState.test.ts`의 `chart`·`tm` 헬퍼 방식, 120BPM)
  - `모두 PERFECT`: 단타 2개, 동시치기(두 레인 같은 tick), 롱노트 1개 → 0ms부터 5000ms까지 16ms마다 `autoplayStep` 뒤 `state.update(now)` → `counts`가 `{ perfect: 노트 머리 수 + 롱노트 꼬리 수, great: 0, good: 0, miss: 0 }`
  - `롱노트는 끝 시각에 뗀다`: 롱노트(480→1440 tick = 500→1500ms)에서 꼬리 이벤트의 `ms === 1500`, `judgement === 'perfect'`
  - `롱노트 끝과 같은 시각의 다음 노트`: 같은 레인 롱노트 끝 tick에 단타 → 둘 다 PERFECT, MISS 0
  - `아직 오지 않은 노트는 누르지 않음`: `autoplayStep(state, 499)` → `[]`
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield/test/autoplay.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — Expected: PASS
- [ ] **Step 5: 커밋** — `feat(playfield): autoplay step`

---

### Task 4: `Playfield`에 레이아웃·자동 플레이·입력 끄기

**Files:**
- Modify: `packages/playfield/src/Playfield.ts`

**Interfaces:**
- Consumes: Task 1~3
- Produces: `PlayfieldOptions`에 `layout?: PlayfieldLayout`, `input?: boolean`(기본 true), `autoplay?: boolean`(기본 false). 메서드 `setLayout(layout: PlayfieldLayout): void`

- [ ] **Step 1: 구현** (DOM 그리기라 단위 테스트 대신 Step 2의 타입 검사와 Task 7 수동 확인)
  - 생성자: `this.layout = sanitizeLayout(opts.layout ?? DEFAULT_LAYOUT)`. `NOTE_HEIGHT`, `HOLD_BODY_INSET` 상수 삭제
  - `start()`/`stop()`: `input === false`면 keydown/keyup/blur 리스너를 등록·해제하지 않는다
  - `frame`: `autoplay`면 `this.show(autoplayStep(this.state, now))`를 `state.update(now)`보다 먼저. 키빔은 `this.pressed[lane] || (autoplay && this.state.heldNote(lane) >= 0)`
  - `draw`: `trackColumns(width, this.lanes, layout.laneWidth)`, `judgeY = judgeLineY(height, layout)`, 판정선 `fillRect(left, judgeY − t/2, fieldWidth, t)` (`t = judgeLineThickness`), 키 표시는 `keyLabelsVisible(layout)`일 때만
  - `drawNotes`: `pad = noteHalfExtent(layout) / pxPerMs`, 롱노트 몸통 `bw = holdBodyWidth(w)`를 `x + (w − bw)/2`에 그린다
  - `drawHead`: 바는 지금과 같되 높이 `layout.noteHeight`, 동그라미는 `arc(laneX + w/2, y, (w − 2·NOTE_INSET)/2, 0, 2π)`
- [ ] **Step 2: 검증** — Run: `npx tsc -p packages/playfield && npx vitest run packages/playfield` / Expected: 오류 없음, PASS
- [ ] **Step 3: 커밋** — `feat(playfield): layout, autoplay and input options`

---

### Task 5: 설정 저장과 레이아웃 store

**Files:**
- Modify: `apps/editor/src/main/project/settings.ts`, `apps/editor/src/main/ipc.ts`, `apps/editor/src/shared/api.ts`, `apps/editor/src/preload/index.ts`, `apps/editor/src/renderer/src/App.tsx`, `apps/editor/src/renderer/src/editor/playtest/PlaytestOverlay.tsx`
- Create: `apps/editor/src/renderer/src/gameplay/layoutStore.ts`
- Test: `apps/editor/test/main/settings.test.ts`(추가), `apps/editor/test/renderer/layoutStore.test.ts`

**Interfaces:**
- Consumes: Task 1 `sanitizeLayout`, `DEFAULT_LAYOUT`, `layoutEquals`; Task 4 `layout` 옵션
- Produces:
  - `Settings.gameplay?: PlayfieldLayout` (읽을 때 필드가 있으면 `sanitizeLayout`)
  - IPC `rcm:get-gameplay-layout` → `PlayfieldLayout`(없으면 기본값), `rcm:set-gameplay-layout`(raw → `sanitizeLayout` 후 저장)
  - `RcmApi.getGameplayLayout(): Promise<PlayfieldLayout>`, `setGameplayLayout(layout: PlayfieldLayout): Promise<void>`
  - `layoutStore.ts`: `loadLayout(): Promise<void>`, `getLayout(): PlayfieldLayout`, `useLayout(): PlayfieldLayout`(`useSyncExternalStore`), `setLayout(next: PlayfieldLayout): void`(바로 반영·알림, 300ms 디바운스 저장, 같은 값이면 아무것도 안 함)

- [ ] **Step 1: 실패하는 테스트**
  - settings: `gameplay: 깨진 값은 정리하고 다른 설정은 유지` — `{ recent: [...], gameplay: { laneWidth: 999, noteShape: 'x' } }` → `gameplay`가 `{ ...DEFAULT_LAYOUT, laneWidth: 200 }`, recent 그대로; 필드가 없으면 `undefined`
  - layoutStore (`playtestSpeed.test.ts`처럼 `window.rcm`을 stub, `vi.resetModules`):
    - `불러오기 전에는 기본값, 불러오면 저장된 값`
    - `연달아 바꾸면 마지막 값만 저장`: `setLayout` 세 번 → 299ms에 호출 0, 300ms에 마지막 값으로 1회
    - `같은 값이면 저장하지 않음`
    - `저장 실패해도 값 유지`: reject → `getLayout()`은 새 값, `console.warn` 호출
    - `구독자에게 알림`: `subscribe` 콜백이 `setLayout`마다 불린다 (store가 `subscribe`를 export)
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/main/settings.test.ts apps/editor/test/renderer/layoutStore.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — settings·IPC·preload·api, store, `App` 시작 때 `loadLayout().catch(() => {})`, `PlaytestOverlay`의 `new Playfield(..., layout: getLayout())`
- [ ] **Step 4: 검증** — Run: `npm test` 그리고 `npm run typecheck` / Expected: 전부 PASS, 오류 없음
- [ ] **Step 5: 커밋** — `feat(editor): save gameplay layout and use it in playtest`

---

### Task 6: 설정 화면 (게임플레이 카드, 미리보기, 전체화면)

**Files:**
- Create: `apps/editor/src/renderer/src/ui/Slider.tsx`, `Slider.module.css`, `apps/editor/src/renderer/src/gameplay/previewChart.ts`, `GameplaySettings.tsx`, `LayoutPreview.tsx`, `LayoutPreview.module.css`, `PreviewFullscreen.tsx`
- Modify: `apps/editor/src/renderer/src/ui/index.ts`, `apps/editor/src/renderer/src/settings/SettingsPage.tsx`, `SettingsPage.module.css`
- Test: `apps/editor/test/renderer/previewChart.test.ts`

**Interfaces:**
- Consumes: Task 5 store, Task 4 `Playfield` 옵션, `getPlaytestSpeed()`
- Produces:
  - `Slider({ value, min, max, step?, onChange, label, disabled? })` — `<input type="range" aria-label={label}>`
  - `previewChart(): { chart: Chart; tm: TimingMap; lengthMs: number }` — 4키, 120BPM, 4마디 패턴(1마디 4분 단타 1→4, 2마디 8분 계단 1→4→1, 3마디 2박마다 동시치기 1+4 / 2+3, 4마디 2박 롱노트 2와 3)을 4번 반복, `lengthMs` = 마지막 노트 끝 + 1000
  - `LayoutPreview({ layout, className? })` — 캔버스를 채우는 자동 플레이 미리보기. `getTimeMs = performance.now() − 시작 − 1000`(1초 준비), `lengthMs`를 넘으면 `Playfield`를 새로 만들어 다시 시작. `layout`이 바뀌면 `setLayout`만
  - `GameplaySettings()` — 스펙 4.2 표 그대로. 값은 `useLayout()`, 바꾸면 `setLayout`. 슬라이더와 `NumberField`(min/max)를 나란히
  - `PreviewFullscreen({ onClose })` — `position: fixed; inset: 0` 오버레이 + `LayoutPreview` + 오른쪽 위 닫기(`X`), Esc로 닫기

- [ ] **Step 1: 실패하는 테스트** (`previewChart.test.ts`)
  - `4키 데모 채보가 형식 검사를 통과`: `serializeChart` → `parseChart` 결과가 ok
  - `롱노트와 동시치기를 포함`: hold 노트 ≥ 2, 같은 tick 노트 쌍 존재
  - `lengthMs는 마지막 노트 끝 + 1000`
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/renderer/previewChart.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — `previewChart` → `Slider` → `LayoutPreview`·`PreviewFullscreen` → `GameplaySettings` → `SettingsPage` 두 칸 배치(왼쪽 카드들, 오른쪽 300×480 미리보기, 폭 760px 미만이면 세로로). 미리보기 위 마우스 호버·포커스 때 오른쪽 아래 `전체화면으로 보기` 버튼(lucide `Maximize2`)
- [ ] **Step 4: 검증** — Run: `npm test`, `npm run typecheck` / Expected: PASS, 오류 없음
- [ ] **Step 5: 커밋** — `feat(editor): gameplay settings with live preview`

---

### Task 7: 문서와 수동 확인

**Files:**
- Modify: `docs/CHART_FORMAT_GUIDE.md`

- [ ] **Step 1: 문서** — 트랙 `width` 설명(표와 "표시 힌트" 문단)을 "에디터 화면 표시용. 테스트 플레이와 게임의 레인 너비는 게임이 정한다(모든 레인 같은 너비 권장)"로, 4.4절에 RCM 기본 레이아웃(레인 64px, 노트 14px, 판정선 3px, 화면 아래에서 120px, 롱노트 몸통 = 레인 × 0.69) 참고값 추가. `packages/`, `@rcm/`, `apps/editor` 같은 저장소 경로를 쓰지 않는다
- [ ] **Step 2: 검증** — Run: `npx vitest run apps/editor/test/shared/chartFormatGuide.test.ts` / Expected: PASS
- [ ] **Step 3: 커밋** — `docs: AI guide treats track width as an editor hint`
- [ ] **Step 4: 수동 확인** (`npm run dev`) — 기본값에서 테스트 플레이가 이전과 같은지 / 각 슬라이더가 미리보기에 바로 반영 / 동그라미 선택 시 노트 두께 비활성 / 전체화면 열기·Esc 닫기 / 테스트 플레이에 반영 / 앱 재시작 후 유지 / 기본값으로 되돌리기
