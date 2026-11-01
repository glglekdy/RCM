# 웹 3단계 (터치 조작) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰에서 손가락으로 편집한다. 한 손가락은 편집, 두 손가락은 스크롤·핀치 줌, 이동(✋) 도구, 길게 누르기 메뉴, 단축키 대신 쓰는 버튼(추가 선택, 탭 BPM)을 넣는다.

**Architecture:** `TimelineCanvas`의 포인터 처리 앞에 순수 상태 기계 `GestureRouter`를 둔다. 라우터는 포인터 입력을 받아 "도구로 넘기기 / 스크롤 / 줌 / 탭 / 길게 누르기 / 도구 취소" 효과 목록을 돌려주고, `TimelineCanvas`가 그 효과를 store와 기존 도구 컨트롤러에 적용한다. `tools.ts`·`freeTools.ts`는 이미 `cancel()`이 있어 바꾸지 않는다. 길게 누르기 메뉴와 탭 버튼은 `EditorActions`를 context로 받아 단축키와 같은 경로로 실행한다.

**Tech Stack:** React 19, CSS Modules, Pointer Events, vitest(순수 함수만, DOM 테스트 없음). 새 의존성 없음 (아이콘은 이미 쓰는 `lucide-react`의 `Hand`, `SquarePlus`).

**Spec:** `docs/superpowers/specs/2026-11-01-web-mobile-design.md` — 5장(터치 조작), 1장의 길게 누르기 값. 테스트 플레이(6장)는 4단계라서 이 계획에 없다.

## Global Constraints

- 길게 누르기 판정: **500ms**, 움직임 **8px** 이하 (`LONG_PRESS_MS = 500`, `SLOP_PX = 8`).
- 마우스·펜 입력은 지금처럼 바로 도구로 넘긴다. 단, 이동 도구일 때 마우스 왼쪽 끌기는 스크롤이다.
- `tools.ts`·`freeTools.ts`의 동작은 바꾸지 않는다(이미 있는 `cancel()`만 쓴다). 라우터는 도구가 `'pan'`일 때 왼쪽 버튼·손가락 입력을 도구로 넘기지 않는다.
- 타임라인 캔버스(`TimelineCanvas`의 `.wrap`)에 `touch-action: none`.
- 미니맵 띠 너비는 폰 모드(`useLayoutMode() !== 'desktop'`)에서 **18px**, 데스크톱은 지금처럼 72px.
- 핀치 줌은 두 손가락 중심의 시각을 고정한 채 확대·축소한다. 줌 범위는 기존 `clampZoom`.
- 재생 중에는 스크롤·줌·길게 누르기를 무시한다(지금 휠이 재생 중에 무시되는 것과 같다).
- PC 앱에서 바뀌는 것은 스펙이 정한 추가분뿐이다: 툴바의 ✋ 이동 도구 버튼과 `H` 단축키, 선택 도구일 때의 "추가 선택" 토글, 타이밍 패널의 "탭" 버튼. 우클릭 삭제·Shift 선택·휠·Ctrl+휠·Escape는 그대로다.
- 폰 CSS 규칙은 `:global(html[data-layout^='phone'])` 같은 선택자로만 건다. `@media`로 폭을 재지 않는다.
- 문구는 해요체. 세미콜론 없음, 작은따옴표, vitest 테스트 이름은 한국어.
- `npm test`, `npm run typecheck`, `npm run build:web`, `npm -w @rcm/editor run build`가 모든 task 끝에서 성공한다.
- 커밋은 `main`에 바로 한다.

## Review Focus

1. Android Chrome은 손가락을 길게 누르면 `contextmenu` 이벤트도 보낸다. 이것이 PC 우클릭 경로(노트 삭제)로 가면 길게 누르기만 했는데 노트가 지워진다 → 터치로 누른 뒤의 `contextmenu`는 도구로 넘기지 않는다. → Task 1 테스트 `터치로 누른 뒤에는 contextmenu를 막는다`, Task 2에서 연결.
2. 길게 누르기로 메뉴가 뜬 뒤 그 손가락을 떼면, 손가락 아래 메뉴 항목이 눌리면 안 된다. → Task 3 `ContextMenu`의 `armOnPointerUp`, 확인 목록 4번.
3. 핀치를 시작할 때 보통 두 번째 손가락이 첫 손가락보다 몇십 ms 늦게 닿는다. 첫 손가락이 그리던 노트·지우던 노트·사각 선택이 남으면 안 된다 → 두 번째 손가락이 오면 도구에 취소를 보낸다. → Task 1 테스트 `두 번째 손가락이 오면 도구를 취소하고 핀치로 바뀐다`.
4. 핀치 중 손가락 하나를 먼저 떼면, 남은 손가락이 그리기를 시작하거나 스크롤을 튀게 하면 안 된다. → Task 1 테스트 `핀치 중 한 손가락을 떼면 남은 손가락은 아무 일도 하지 않는다`.
5. 줌이 한계(`clampZoom`)에 닿은 뒤 계속 벌려도 재생 위치가 밀리면 안 된다. → Task 1 테스트 `줌이 한계에 막히면 재생 위치가 그대로다`.

---

### Task 1: 제스처 라우터와 스크롤·줌 계산 (순수 함수)

**Files:**
- Create: `apps/editor/src/renderer/src/editor/timeline/gesture.ts`
- Create: `apps/editor/test/renderer/timeline/gesture.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/timeline/view.ts` (스크롤·줌 계산 함수 추가)
- Modify: `apps/editor/test/renderer/timeline/view.test.ts`

**Interfaces:**
- Produces (`view.ts`):
  - `panPlayhead(v: TimelineView, dy: number): number` — 손가락이 아래로 `dy`px 움직이면 내용도 아래로 움직인다: `v.playheadMs + dy / v.pxPerMs`. 클램프는 호출하는 쪽이 한다.
  - `zoomAround(v: TimelineView, anchorY: number, pxPerMs: number): number` — 새 배율 `pxPerMs`에서 `yToMs(v, anchorY)`가 같은 y에 오도록 하는 새 `playheadMs`. `pxPerMs === v.pxPerMs`면 `v.playheadMs`를 그대로 돌려준다.
- Produces (`gesture.ts`):

```ts
export const LONG_PRESS_MS = 500
export const SLOP_PX = 8

export type PointerKind = 'mouse' | 'pen' | 'touch'

export interface GesturePointer {
  id: number
  kind: PointerKind
  x: number
  y: number
  /** 0 왼쪽(손가락), 2 오른쪽 */
  button: number
  shift: boolean
}

export type GestureEffect =
  | { type: 'tool-down'; p: GesturePointer }
  | { type: 'tool-move'; p: GesturePointer }
  | { type: 'tool-up'; p: GesturePointer }
  | { type: 'tool-cancel' }
  /** 손가락이 아래로 움직인 px (위로는 음수) */
  | { type: 'pan'; dy: number }
  /** pxPerMs에 곱할 배율과 고정할 y */
  | { type: 'zoom'; scale: number; anchorY: number }
  /** 이동 도구로 움직이지 않고 짧게 누름 */
  | { type: 'tap'; x: number; y: number }
  | { type: 'long-press'; x: number; y: number }

export interface GestureRouter {
  down(p: GesturePointer, tool: EditorState['tool']): GestureEffect[]
  move(p: GesturePointer): GestureEffect[]
  up(p: GesturePointer): GestureEffect[]
  /** pointercancel, 포인터 붙잡기를 잃음 */
  cancel(id: number): GestureEffect[]
  /** 터치로 누른 지 LONG_PRESS_MS 뒤에 연결 코드가 부른다. 아직 길게 누르기로 볼 수 있으면 효과를 낸다 */
  longPress(id: number): GestureEffect[]
  /** 누르고 있는 포인터가 있다 */
  readonly active: boolean
  /** 마지막으로 누른 포인터가 터치가 아니면 true. 터치 길게 누르기가 보내는 contextmenu를 막는 데 쓴다 */
  allowsContextMenu(): boolean
}

export function createGestureRouter(): GestureRouter
```

동작 규칙 (스펙 5.1 표):

| 입력 | 결과 |
|---|---|
| 마우스·펜, 도구가 `'pan'`이 아니거나 버튼이 0이 아님 | `tool-down/move/up`을 그대로 낸다. 길게 누르기 없음 |
| 마우스·펜 왼쪽, 도구 `'pan'` | 터치 이동 도구와 같다(끌기 = `pan`, 8px 이하로 떼면 `tap`). 길게 누르기 없음 |
| 손가락 1개, 도구 `'pan'` | 8px 넘게 움직이기 전에는 아무것도 내지 않다가, 넘으면 그때부터 `pan`(첫 `pan`의 `dy`는 누른 곳부터의 거리). 8px 넘게 움직이지 않고 떼면 `tap`. `longPress(id)` → `long-press` |
| 손가락 1개, 도구 `'select'` | 바로 `tool-down`·`tool-move`·`tool-up`. 8px 넘게 움직이지 않은 채 `longPress(id)` → `[tool-cancel, long-press]` |
| 손가락 1개, 그 밖의 도구 | 바로 `tool-*`. 길게 누르기 없음 |
| 손가락 2개 | 첫 손가락을 도구로 넘기던 중이면 `tool-cancel`을 먼저 낸다. 그 뒤 움직일 때마다 두 손가락 중심 y의 변화로 `pan`, 거리 비율로 `zoom`(`anchorY` = 지금 중심 y)을 이 순서로 낸다. 거리가 1px 미만이면 `zoom`을 내지 않는다 |
| 핀치 중 한 손가락을 뗌 | 남은 손가락은 뗄 때까지 아무것도 내지 않는다. 그동안 새 손가락이 닿으면 다시 핀치 |
| 세 번째 손가락, 마우스·펜을 누른 중의 터치 | 무시 |
| 길게 누르기를 낸 뒤 | 그 손가락을 뗄 때까지 `move`·`up`은 아무것도 내지 않는다 |
| `cancel(id)` | 그 포인터를 도구로 넘기던 중이면 `tool-cancel`. 남은 포인터가 없으면 처음 상태로 |

- [ ] **Step 1: 실패하는 테스트 (`view.test.ts`에 추가)**

```ts
describe('panPlayhead · zoomAround', () => {
  const v = { playheadMs: 1000, pxPerMs: 0.5, height: 400 }
  it('손가락을 아래로 끌면 재생 위치가 앞으로 간다', () => expect(panPlayhead(v, 50)).toBe(1100))
  it('위로 끌면 뒤로 간다', () => expect(panPlayhead(v, -50)).toBe(900))
  it('줌해도 기준 y의 시각이 그대로다', () => {
    const anchorY = 100
    const before = yToMs(v, anchorY)
    const playheadMs = zoomAround(v, anchorY, 1)
    expect(yToMs({ ...v, pxPerMs: 1, playheadMs }, anchorY)).toBeCloseTo(before)
  })
  it('줌이 한계에 막히면 재생 위치가 그대로다', () => expect(zoomAround(v, 100, 0.5)).toBe(1000))
})
```

- [ ] **Step 2: 실패하는 테스트 (`gesture.test.ts`)**

```ts
const touch = (id: number, x: number, y: number): GesturePointer => ({ id, kind: 'touch', x, y, button: 0, shift: false })
const mouse = (x: number, y: number, button = 0): GesturePointer => ({ id: 1, kind: 'mouse', x, y, button, shift: false })
const types = (effects: GestureEffect[]) => effects.map((e) => e.type)

describe('GestureRouter', () => {
  it('마우스는 바로 도구로 넘긴다', () => {
    const r = createGestureRouter()
    expect(types(r.down(mouse(10, 10), 'draw'))).toEqual(['tool-down'])
    expect(types(r.move(mouse(10, 50)))).toEqual(['tool-move'])
    expect(types(r.up(mouse(10, 50)))).toEqual(['tool-up'])
  })
  it('마우스 오른쪽 버튼은 이동 도구여도 도구로 넘긴다', () => {
    const r = createGestureRouter()
    expect(types(r.down(mouse(10, 10, 2), 'pan'))).toEqual(['tool-down'])
  })
  it('이동 도구의 마우스 왼쪽 끌기는 스크롤이다', () => {
    const r = createGestureRouter()
    expect(r.down(mouse(10, 10), 'pan')).toEqual([])
    expect(r.move(mouse(10, 40))).toEqual([{ type: 'pan', dy: 30 }])
  })
  it('그리기 도구의 한 손가락은 바로 도구로 넘긴다', () => {
    const r = createGestureRouter()
    expect(types(r.down(touch(1, 10, 10), 'draw'))).toEqual(['tool-down'])
    expect(types(r.move(touch(1, 10, 60)))).toEqual(['tool-move'])
    expect(types(r.up(touch(1, 10, 60)))).toEqual(['tool-up'])
  })
  it('이동 도구는 8px까지 움직여도 스크롤하지 않고, 떼면 탭이다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    expect(r.move(touch(1, 10, 18))).toEqual([])
    expect(r.up(touch(1, 10, 18))).toEqual([{ type: 'tap', x: 10, y: 18 }])
  })
  it('이동 도구로 8px 넘게 끌면 누른 곳부터 스크롤한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    expect(r.move(touch(1, 10, 30))).toEqual([{ type: 'pan', dy: 20 }])
    expect(r.move(touch(1, 10, 25))).toEqual([{ type: 'pan', dy: -5 }])
    expect(r.up(touch(1, 10, 25))).toEqual([])
  })
  it('두 번째 손가락이 오면 도구를 취소하고 핀치로 바뀐다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 100, 100), 'draw')
    expect(types(r.down(touch(2, 100, 200), 'draw'))).toEqual(['tool-cancel'])
    expect(r.move(touch(2, 100, 300))).toEqual([
      { type: 'pan', dy: 50 },
      { type: 'zoom', scale: 2, anchorY: 200 }
    ])
  })
  it('핀치 중 한 손가락을 떼면 남은 손가락은 아무 일도 하지 않는다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 100, 100), 'draw')
    r.down(touch(2, 100, 200), 'draw')
    expect(r.up(touch(2, 100, 200))).toEqual([])
    expect(r.move(touch(1, 100, 150))).toEqual([])
    expect(r.up(touch(1, 100, 150))).toEqual([])
    expect(r.active).toBe(false)
  })
  it('세 번째 손가락은 무시한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 100, 100), 'draw')
    r.down(touch(2, 100, 200), 'draw')
    expect(r.down(touch(3, 50, 50), 'draw')).toEqual([])
    expect(r.move(touch(3, 50, 90))).toEqual([])
  })
  it('선택 도구로 길게 누르면 도구를 취소하고 메뉴를 연다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'select')
    r.move(touch(1, 14, 13))
    expect(r.longPress(1)).toEqual([{ type: 'tool-cancel' }, { type: 'long-press', x: 14, y: 13 }])
    expect(r.move(touch(1, 60, 60))).toEqual([])
    expect(r.up(touch(1, 60, 60))).toEqual([])
  })
  it('이동 도구로 길게 누르면 메뉴를 연다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    expect(r.longPress(1)).toEqual([{ type: 'long-press', x: 10, y: 10 }])
    expect(r.up(touch(1, 10, 10))).toEqual([])
  })
  it('8px 넘게 움직인 뒤에는 길게 누르기가 아니다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'select')
    r.move(touch(1, 10, 30))
    expect(r.longPress(1)).toEqual([])
  })
  it('그리기 도구에는 길게 누르기가 없다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'draw')
    expect(r.longPress(1)).toEqual([])
  })
  it('이미 뗀 손가락의 길게 누르기는 무시한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    r.up(touch(1, 10, 10))
    expect(r.longPress(1)).toEqual([])
  })
  it('도구로 넘기던 포인터가 취소되면 도구를 취소한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'draw')
    expect(r.cancel(1)).toEqual([{ type: 'tool-cancel' }])
    expect(r.active).toBe(false)
  })
  it('마우스를 누른 중의 터치는 무시한다', () => {
    const r = createGestureRouter()
    r.down(mouse(10, 10), 'draw')
    expect(r.down(touch(5, 50, 50), 'draw')).toEqual([])
  })
  it('터치로 누른 뒤에는 contextmenu를 막는다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'select')
    expect(r.allowsContextMenu()).toBe(false)
    r.up(touch(1, 10, 10))
    r.down(mouse(10, 10, 2), 'select')
    expect(r.allowsContextMenu()).toBe(true)
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run apps/editor/test/renderer/timeline/gesture.test.ts apps/editor/test/renderer/timeline/view.test.ts`
Expected: FAIL (`createGestureRouter`, `panPlayhead`, `zoomAround`이 없음)

- [ ] **Step 4: `view.ts`에 `panPlayhead`, `zoomAround`, `gesture.ts`에 `createGestureRouter` 구현**

라우터는 포인터 id → `{ kind, startX, startY, x, y }` 맵과 상태 하나(`idle | tool | pan-pending | panning | pinch | pinch-rest | consumed`)로 만든다. `pan`의 `dy`는 직전에 낸 위치(첫 `pan`은 누른 위치)와의 차이, 핀치의 `pan`은 두 손가락 중심 y의 직전 대비 차이, `zoom.scale`은 지금 거리 / 직전 거리다. React·DOM을 import하지 않는다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run apps/editor/test/renderer/timeline/gesture.test.ts apps/editor/test/renderer/timeline/view.test.ts`
Expected: PASS

- [ ] **Step 6: 전체 확인과 커밋**

Run: `npm test && npm run typecheck`

```bash
git add apps/editor/src/renderer/src/editor/timeline/gesture.ts apps/editor/src/renderer/src/editor/timeline/view.ts apps/editor/test/renderer/timeline/gesture.test.ts apps/editor/test/renderer/timeline/view.test.ts
git commit -m "feat(editor): gesture router state machine for touch input"
```

---

### Task 2: 이동 도구와 타임라인 터치 연결

**Files:**
- Create: `apps/editor/src/renderer/src/editor/timeline/target.ts`, `apps/editor/test/renderer/timeline/target.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/state/store.ts` (`tool`에 `'pan'`)
- Modify: `apps/editor/src/renderer/src/editor/input/shortcuts.ts`, `apps/editor/test/renderer/input/shortcuts.test.ts` (`KeyH` → `'toolPan'`)
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (`case 'toolPan'`)
- Modify: `apps/editor/src/renderer/src/editor/toolbar/items.tsx` (`ToolButtons`에 ✋)
- Modify: `apps/editor/src/renderer/src/editor/timeline/TimelineCanvas.tsx`, `TimelineCanvas.module.css`
- Modify: `apps/editor/src/renderer/src/editor/minimap/geometry.ts`, `Minimap.tsx` (폰 18px)

**Interfaces:**
- Consumes: Task 1의 `createGestureRouter`, `LONG_PRESS_MS`, `GesturePointer`, `GestureEffect`, `panPlayhead`, `zoomAround`.
- Produces:
  - `EditorState['tool']` = `'draw' | 'erase' | 'select' | 'brush' | 'pan'`
  - `Action`에 `'toolPan'`
  - `target.ts`:
    ```ts
    export type TimelineTarget =
      | { kind: 'note'; key: string }
      | { kind: 'marker'; index: number }
      /** 트랙(칸) 안의 빈 곳 */
      | { kind: 'empty' }
      /** 트랙 밖이면서 마커도 아님, 또는 트랙 이름 띠 */
      | { kind: 'none' }
    export function timelineTargetAt(doc: ProjectDoc, activeChart: string, g: ToolGeometry, x: number, y: number): TimelineTarget
    ```
    레인형: `xToLane(g.layout, x) === null`이면 `markerAtY(doc.editorData.markers, g.view, y)`가 0 이상일 때 marker, 아니면 none. `inTrackNameBand`면 none. `hitTestNote`가 맞으면 `noteKey(note)`, 아니면 empty. 자유형: 같은 순서로 `hitTestFree(...).key`. 도구 컨트롤러의 `onContextMenu`와 같은 판정이다.
  - `MINIMAP_PHONE_WIDTH = 18` (`minimap/geometry.ts`)

- [ ] **Step 1: 실패하는 테스트**

`target.test.ts` — `test/renderer/timeline/hitTest.test.ts`·`tools.test.ts`의 픽스처(문서·`TimingMap`·`layoutTimeline`/`layoutFreeTimeline`) 만드는 방식을 따른다:

```ts
describe('timelineTargetAt', () => {
  it('레인형 노트 위는 그 노트', () => expect(timelineTargetAt(doc, laneFile, g, noteX, noteY)).toEqual({ kind: 'note', key: noteKey(note) }))
  it('레인형 트랙 안 빈 곳은 empty', () => expect(timelineTargetAt(doc, laneFile, g, noteX, emptyY).kind).toBe('empty'))
  it('트랙 밖의 마커 위는 그 마커', () => expect(timelineTargetAt(doc, laneFile, g, waveX, markerY)).toEqual({ kind: 'marker', index: 0 }))
  it('트랙 밖 마커 없는 곳은 none', () => expect(timelineTargetAt(doc, laneFile, g, waveX, emptyY).kind).toBe('none'))
  it('자유형 노트 위는 그 노트', () => expect(timelineTargetAt(doc, freeFile, gFree, freeX, freeY)).toEqual({ kind: 'note', key: freeNoteKey(freeNote) }))
})
```

`shortcuts.test.ts`:

```ts
it('H는 이동 도구', () => expect(resolveShortcut({ code: 'KeyH', ctrl: false, shift: false }, 'edit')).toBe('toolPan'))
it('Ctrl+H는 그대로 좌우 반전', () => expect(resolveShortcut({ code: 'KeyH', ctrl: true, shift: false }, 'edit')).toBe('mirror'))
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/renderer/timeline/target.test.ts apps/editor/test/renderer/input/shortcuts.test.ts` → FAIL

- [ ] **Step 3: store·단축키·툴바**

- `tool` 타입에 `'pan'`. `EditorScreen`의 단축키 switch에 `case 'toolPan': store.set({ tool: 'pan' })`.
- `ToolButtons` 맨 끝(선택 다음)에 `<IconButton icon={Hand} label="이동 (H) — 끌어서 스크롤, 눌러서 선택" active={tool === 'pan'} onClick={() => store.set({ tool: 'pan' })} />`.

- [ ] **Step 4: `target.ts` 구현, 테스트 통과 확인**

- [ ] **Step 5: `TimelineCanvas` 연결**

- `const router = useState(createGestureRouter)[0]`. React 포인터 이벤트에서 `GesturePointer`를 만든다: `kind = e.pointerType`(알 수 없으면 `'mouse'`), x·y는 캔버스 기준, `button`, `shift = e.shiftKey`.
- `onPointerDown`: 라우터가 비어 있고(`!router.active`) `button === 0`이며 칩 위면 지금처럼 칩 처리 후 끝. 아니면 `setPointerCapture`(모든 포인터 종류, 버튼 0·2) 후 `router.down(p, store.getState().tool)`의 효과를 적용한다. 터치면 `setTimeout(LONG_PRESS_MS)`으로 `router.longPress(id)`를 부르고, 그 포인터의 up·cancel에서 타이머를 지운다(포인터 id별 맵). 언마운트 때 모든 타이머를 지운다.
- `onPointerMove`: 라우터가 그 포인터를 알고 있으면(`router.active`) `router.move`. 아니면 지금 호버 커서 코드 그대로(도구가 `'pan'`이면 커서 `grab`).
- `onPointerUp` → `router.up`, `onPointerCancel`·`onLostPointerCapture` → `router.cancel(e.pointerId)`.
- 효과 적용 `applyEffects(effects)`:
  - `tool-down/move/up` → `tools().onPointerDown/Move/Up({ x, y, button, shift })`, `tool-cancel` → `tools().cancel()`
  - `pan`(재생 중이면 무시) → `store.set({ playheadMs: clampPlayheadMs(tm, panPlayhead(view, dy), durationMs) })`
  - `zoom`(재생 중이면 무시) → `const pxPerMs = clampZoom(s.pxPerMs * scale)`, `playheadMs = clampPlayheadMs(tm, zoomAround(view, anchorY, pxPerMs), durationMs)`를 한 번에 `store.set`
  - `tap` → `timelineTargetAt`이 note면 `selection: new Set([key])`, 그 밖이면 `selection: new Set()`
  - `long-press` → 이 task에서는 무시한다(Task 3에서 메뉴)
  - 효과를 적용한 뒤 `tools().refresh()`와 `drawRef.current()`
- `onContextMenu`: 늘 `preventDefault()`. `router.allowsContextMenu()`가 false면 끝(터치 길게 누르기가 보낸 것). 아니면 지금처럼 도구로 넘긴다.
- 휠·Escape 처리는 그대로.
- `TimelineCanvas.module.css` `.wrap`에 `touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`. `.pan { cursor: grab; }` 클래스를 도구가 `'pan'`일 때 붙인다.

- [ ] **Step 6: 미니맵 폭**

`Minimap`의 `style={{ width: mode === 'desktop' ? MINIMAP_WIDTH : MINIMAP_PHONE_WIDTH }}` (`mode = useLayoutMode()`). 그리기는 이미 `clientWidth`를 따른다.

- [ ] **Step 7: 확인**

Run: `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`
눈 확인(자기 포트의 개발 서버, `phone-preview.html` 또는 Chrome 기기 흉내 모드의 터치): 그리기 도구 한 손가락 탭·끌기로 노트·롱노트, 이동 도구 끌기 스크롤·탭 선택, 미니맵 띠가 폰에서 18px. 데스크톱 폭에서 마우스 그리기·우클릭 삭제·Shift 선택·휠이 그대로.

- [ ] **Step 8: 커밋**

```bash
git commit -m "feat(editor): pan tool and touch gestures on the timeline"
```

---

### Task 3: 길게 누르기 메뉴

**Files:**
- Create: `apps/editor/src/renderer/src/editor/timeline/longPressMenu.ts`, `apps/editor/test/renderer/timeline/longPressMenu.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/editorActions.ts` (context)
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (provider)
- Modify: `apps/editor/src/renderer/src/ui/ContextMenu.tsx` (`armOnPointerUp`, 바깥 누름, 위치 보정)
- Modify: `apps/editor/src/renderer/src/editor/timeline/TimelineCanvas.tsx` (`long-press` 효과)

**Interfaces:**
- Consumes: Task 2의 `timelineTargetAt`, `TimelineTarget`. Phase 2의 `EditorActions.edit(action)`.
- Produces:
  - `EditorActionsContext: React.Context<EditorActions | null>`, `useEditorActions(): EditorActions` (provider가 없으면 throw). `EditorBody`가 셸 전체를 `EditorActionsContext.Provider value={actions}`로 감싼다.
  - `ContextMenuItem` 타입을 `ui/ContextMenu.tsx`에서 export.
  - `longPressMenuItems(target: TimelineTarget, actions: EditorActions, opts: { hasSelection: boolean; canPaste: boolean; deleteMarker: (index: number) => void }): ContextMenuItem[]`
    - note: `복사`, `잘라내기`, `붙여넣기`(`disabled: !canPaste`), `좌우 반전`, `삭제`(`danger`)
    - empty: `hasSelection`이면 note와 같은 다섯 항목, 아니면 `붙여넣기` 하나
    - marker: `마커 삭제`(`danger`, `deleteMarker(index)`)
    - none: `[]`
  - `ContextMenu` props에 `armOnPointerUp?: boolean` — true면 메뉴가 뜬 뒤 `window`에서 `pointerup`이 한 번 오기 전까지 항목 클릭을 무시한다.

- [ ] **Step 1: 실패하는 테스트 (`longPressMenu.test.ts`, `fakeActions()` 사용)**

```ts
const labels = (items: ContextMenuItem[]) => items.map((i) => i.label)
describe('longPressMenuItems', () => {
  const opts = { hasSelection: false, canPaste: true, deleteMarker: vi.fn() }
  it('노트 위는 편집 다섯 항목', () =>
    expect(labels(longPressMenuItems({ kind: 'note', key: 'k' }, fakeActions(), opts))).toEqual(['복사', '잘라내기', '붙여넣기', '좌우 반전', '삭제']))
  it('클립보드가 비면 붙여넣기를 끈다', () => {
    const items = longPressMenuItems({ kind: 'note', key: 'k' }, fakeActions(), { ...opts, canPaste: false })
    expect(items.find((i) => i.label === '붙여넣기')?.disabled).toBe(true)
  })
  it('선택 없는 빈 곳은 붙여넣기만', () => expect(labels(longPressMenuItems({ kind: 'empty' }, fakeActions(), opts))).toEqual(['붙여넣기']))
  it('선택이 있으면 빈 곳도 다섯 항목', () =>
    expect(labels(longPressMenuItems({ kind: 'empty' }, fakeActions(), { ...opts, hasSelection: true }))).toHaveLength(5))
  it('마커 위는 마커 삭제', () => {
    const deleteMarker = vi.fn()
    const [item] = longPressMenuItems({ kind: 'marker', index: 2 }, fakeActions(), { ...opts, deleteMarker })
    item.onSelect()
    expect(deleteMarker).toHaveBeenCalledWith(2)
  })
  it('항목은 같은 편집 명령을 부른다', () => {
    const actions = fakeActions()
    longPressMenuItems({ kind: 'note', key: 'k' }, actions, opts).find((i) => i.label === '삭제')!.onSelect()
    expect(actions.edit).toHaveBeenCalledWith('delete')
  })
  it('트랙 밖 빈 곳은 메뉴가 없다', () => expect(longPressMenuItems({ kind: 'none' }, fakeActions(), opts)).toEqual([]))
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/renderer/timeline/longPressMenu.test.ts` → FAIL

- [ ] **Step 3: `longPressMenu.ts`, context 구현 후 통과 확인**

- [ ] **Step 4: `ContextMenu` 고치기**

- 바깥을 누르면 닫기: `document`의 `mousedown` 대신 `pointerdown`(마우스에서는 같은 동작, 터치에서도 닫힌다).
- 위치 보정: 항목 수 × 28px 추정 대신, `useLayoutEffect`에서 메뉴의 실제 크기를 재 화면 안(가장자리 8px 여백)으로 옮긴다(폰에서는 항목이 40px).
- `armOnPointerUp`.
- 홈 `RecentTable`의 우클릭 메뉴는 `armOnPointerUp` 없이 지금처럼 동작해야 한다.

- [ ] **Step 5: `TimelineCanvas`의 `long-press` 효과**

재생 중이거나 `mode !== 'edit'`이면 무시. `target = timelineTargetAt(...)`. note이고 그 노트가 선택에 없으면 먼저 `selection: new Set([key])`. `items = longPressMenuItems(target, actions, { hasSelection: selection.size > 0, canPaste: clipboard !== null, deleteMarker: (i) => store.apply('마커 삭제', removeMarker(doc, i)) })`. 항목이 있으면 `navigator.vibrate?.(10)` 후 화면 좌표(`clientX/Y`)로 메뉴 상태를 연다. 메뉴는 `createPortal(<ContextMenu ... armOnPointerUp />, document.body)`로 그린다(셸의 transform·overflow에 갇히지 않게). `actions`는 `useEditorActions()`.

- [ ] **Step 6: 확인**

Run: `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`
눈 확인: 이동·선택 도구로 노트를 길게 누르면 진동(지원 기기) 후 메뉴, 손가락을 떼도 항목이 눌리지 않고 다시 탭해야 실행, 복사 → 빈 곳 길게 누르기 → 붙여넣기, 마커 길게 누르기 → 마커 삭제, 메뉴 바깥 탭으로 닫힘, 화면 오른쪽·아래 가장자리에서도 메뉴가 화면 안. 데스크톱 홈의 프로젝트 우클릭 메뉴가 그대로.

- [ ] **Step 7: 커밋**

```bash
git commit -m "feat(editor): long-press menu on the timeline"
```

---

### Task 4: 단축키 대신 버튼 (추가 선택, 탭 BPM)과 확인 목록

**Files:**
- Modify: `apps/editor/src/renderer/src/editor/state/store.ts` (`additiveSelect`)
- Modify: `apps/editor/src/renderer/src/editor/toolbar/items.tsx` (추가 선택 토글)
- Modify: `apps/editor/src/renderer/src/editor/timeline/TimelineCanvas.tsx` (shift 계산)
- Modify: `apps/editor/src/renderer/src/editor/editorActions.ts`, `EditorScreen.tsx`, `apps/editor/test/renderer/fakeActions.ts` (`tap`)
- Modify: `apps/editor/src/renderer/src/editor/panels/TimingPanel.tsx`, `Panel.module.css` (탭 버튼)
- Test: `apps/editor/test/renderer/state/` 안의 store 테스트(있는 파일에 추가), `apps/editor/test/renderer/editorActions.test.ts`

**Interfaces:**
- Consumes: Task 3의 `useEditorActions()`.
- Produces:
  - `EditorState.additiveSelect: boolean` (기본 `false`)
  - `EditorActions.tap(): void` — `EditorBody`에서 `runAction('tap')` (재생 중일 때만 기록되는 기존 경로)

- [ ] **Step 1: 실패하는 테스트**

```ts
it('추가 선택은 처음에 꺼져 있다', () => expect(new EditorStore({ dir: 'd' }, doc).getState().additiveSelect).toBe(false))
```

`fakeActions()`에 `tap: vi.fn()`이 있어야 typecheck가 통과한다.

- [ ] **Step 2: 실패 확인 후 store·actions 구현, 통과 확인**

- [ ] **Step 3: 추가 선택 토글**

`ToolButtons`에서 도구가 `'select'`일 때만 선택 버튼 바로 뒤에 `<IconButton icon={SquarePlus} label="추가 선택 — 켜면 누른 노트가 기존 선택에 더해져요" active={additiveSelect} onClick={() => store.set({ additiveSelect: !additiveSelect })} />`. `TimelineCanvas`가 도구로 넘기는 `shift`는 `p.shift || (s.tool === 'select' && s.additiveSelect)`. 이동 도구의 `tap`은 이 토글과 상관없이 하나만 선택한다.

- [ ] **Step 4: 탭 버튼**

`TimingPanel`의 "탭 BPM" 카드 맨 위에 큰 버튼 `탭` (`Button variant="primary"`, 폭 100%, 높이 56px — `Panel.module.css`에 `.tapButton`). `disabled={!playing}`. 박자 정확도를 위해 `onPointerDown`에서 `actions.tap()`을 부르고 `e.preventDefault()`로 포커스 이동을 막는다. 키보드로 누른 경우(`onClick`에서 `e.detail === 0`)도 `actions.tap()`. 안내 문구는 `재생 중 T 키나 탭 버튼을 박자에 맞춰 4번 이상 눌러 주세요 ({taps.length}회)`.

- [ ] **Step 5: 확인과 수동 확인 목록**

Run: `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`

수동 확인 목록 — 자기 포트의 개발 서버에서 Chrome 기기 흉내 모드(터치, Shift+끌기로 핀치)로 확인하고, 각 항목을 PASS / FAIL / NOT RUN으로 커밋 본문과 보고서에 적는다. 실제 Android Chrome·iPhone Safari 확인은 사용자 몫으로 남긴다.

1. 그리기 도구: 한 손가락 탭 → 노트, 위로 끌기 → 롱노트(자유형: 플릭·슬라이드·연속 그리기).
2. 두 손가락: 끌기 → 스크롤, 벌리기·오므리기 → 줌(손가락 사이의 시각이 제자리), 한 손가락으로 그리던 노트는 남지 않는다.
3. 이동 도구: 끌기 스크롤, 노트 탭 → 선택, 빈 곳 탭 → 선택 해제. PC 마우스 왼쪽 끌기도 스크롤.
4. 길게 누르기 메뉴: 손을 떼도 항목이 실행되지 않음, 복사 → 붙여넣기, 삭제, 마커 삭제.
5. 추가 선택 토글을 켜고 노트 두 개를 차례로 탭·사각형 선택 → 둘 다 선택.
6. 재생 중 탭 버튼 4번 → BPM 추정이 나온다. 정지 중에는 버튼이 꺼져 있다.
7. 미니맵 띠(폰 18px)를 끌어 이동.
8. 데스크톱 폭: 우클릭 삭제, Shift 선택, 휠, Ctrl+휠, Escape가 그대로.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(editor): additive-select toggle and tap button for touch"
```
(본문에 확인 목록 결과)
