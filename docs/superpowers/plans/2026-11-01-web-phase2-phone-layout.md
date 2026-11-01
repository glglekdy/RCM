# 웹 2단계 (폰 화면 배치) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰 세로·가로에서 편집 화면·홈·대화상자가 화면에 맞게 나온다. 조작은 아직 PC식(마우스·탭 클릭)이다.

**Architecture:** 화면 크기로 `desktop | phone-portrait | phone-landscape`를 고르는 `LayoutProvider`를 App 맨 위에 두고, `<html data-layout>`로 CSS가 폰 규칙을 고른다. PC 앱은 항상 `desktop`이다. 편집 화면은 상태·명령을 그대로 두고 화면 틀만 `DesktopShell`·`PortraitShell`·`LandscapeShell`로 나누며, 셋은 `BottomToolbar`에서 쪼갠 같은 항목 컴포넌트를 배치만 다르게 쓴다.

**Tech Stack:** React 19, CSS Modules, vitest(순수 함수만, DOM 테스트 없음). 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-01-web-mobile-design.md` — 4장(화면 배치). 5장 터치 조작(제스처, 이동 도구, 길게 누르기)은 3단계라서 이 계획에 없다.

## Global Constraints

- 모드 판정: `phone-portrait`: `width < 700 && height >= width`, `phone-landscape`: `height < 500 && width > height`, 그 밖 `desktop`. `capabilities.windowControls`가 true(PC 앱)면 항상 `desktop`.
- PC 앱은 화면·문구·동작이 바뀌지 않는다. `DesktopShell`은 지금 `EditorScreen`·`BottomToolbar`·`RightPanel`과 같은 DOM 구조와 클래스를 낸다.
- 태블릿·PC 브라우저(모드 `desktop`)는 지금 배치 그대로.
- `BottomSheet` 높이 단계: `closed | half(50%) | full(100% - TopBar)`. `half`에서는 뒤 타임라인을 계속 조작할 수 있다(배경 막음 없음).
- 폰 모드의 터치 대상은 최소 40px.
- 폰 규칙은 CSS Modules 안에서 `:global(html[data-layout^='phone']) .클래스`(두 모드 공통), `:global(html[data-layout='phone-portrait'])`, `:global(html[data-layout='phone-landscape'])` 선택자로만 건다. `@media`로 폭을 직접 재지 않는다(PC 고정 규칙과 어긋나므로).
- 문구는 해요체. 세미콜론 없음, 작은따옴표, vitest 테스트 이름은 한국어.
- `npm test`, `npm run typecheck`, `npm run build:web`, `npm -w @rcm/editor run build`가 모든 task 끝에서 성공한다.
- 커밋은 `main`에 바로 한다.

## Review Focus

1. 편집 중 폰을 돌려 세로↔가로가 바뀌어도 저장 안 한 편집·선택·재생 위치·고른 난이도가 그대로다(상태는 store에 있으므로 틀만 바뀐다). → Task 7 확인 목록 1번.
2. 세로에서 입력 칸을 눌러 키보드가 올라오면 높이만 줄어 모드가 가로로 뒤집히고 입력이 끊길 수 있다 → 폭이 그대로고 입력 칸에 포커스가 있으면 모드를 유지한다. → Task 1 테스트 `입력 중 높이만 줄면 모드를 유지한다`.
3. 긴 곡 제목, 난이도 10개, 레인 12개 채보가 390px 폭에서 가로로 넘치지 않는다(제목은 말줄임, 난이도는 메뉴로). → Task 4 확인 단계.
4. 화면 가장자리의 메뉴(오른쪽 위 ⋯, 왼쪽 줄 스냅)가 화면 밖으로 나가지 않는다. → Task 4·5 확인 단계.
5. 폰에서 대화상자(새 프로젝트, 난이도 추가)를 열고 키보드가 올라와도 확인·취소 버튼에 닿을 수 있다. → Task 7 확인 목록 5번.

---

### Task 1: 화면 모드 (`layoutMode`, `LayoutProvider`)

**Files:**
- Create: `apps/editor/src/renderer/src/ui/layoutMode.ts`, `apps/editor/src/renderer/src/ui/LayoutProvider.tsx`, `apps/editor/test/renderer/ui/layoutMode.test.ts`
- Modify: `apps/editor/src/renderer/src/App.tsx` (맨 바깥을 `LayoutProvider`로 감싼다), `apps/editor/src/renderer/src/ui/index.ts` (내보내기)
- Add: `apps/web/phone-preview.html` (이미 작업 트리에 있음, 개발 서버 전용 미리보기 — 세로 390×844, 가로 844×390 iframe. 빌드에 들어가지 않는다)
- Modify: `docs/DEVELOPMENT.md` 웹 개발 실행 절에 미리보기 주소 `http://localhost:5173/RCM/app/phone-preview.html` 한 줄

**Interfaces:**
- Produces:
  - `type LayoutMode = 'desktop' | 'phone-portrait' | 'phone-landscape'`
  - `layoutMode(width: number, height: number, pinnedDesktop: boolean): LayoutMode`
  - `nextLayoutMode(prev: LayoutMode, prevWidth: number, width: number, height: number, opts: { pinnedDesktop: boolean; typing: boolean }): LayoutMode` — `typing && width === prevWidth`면 `prev`, 아니면 `layoutMode(...)`
  - `LayoutProvider({ children })` — `window.innerWidth/innerHeight`로 시작, `resize`마다 `nextLayoutMode`(typing = `document.activeElement`가 input·textarea·contenteditable), `document.documentElement.dataset.layout`에 모드를 쓴다. `pinnedDesktop = caps().windowControls`
  - `useLayoutMode(): LayoutMode`

- [ ] **Step 1: 실패하는 테스트**

```ts
describe('layoutMode', () => {
  it('폰 세로', () => expect(layoutMode(390, 844, false)).toBe('phone-portrait'))
  it('폰 가로', () => expect(layoutMode(844, 390, false)).toBe('phone-landscape'))
  it('정사각형 좁은 창은 세로', () => expect(layoutMode(600, 600, false)).toBe('phone-portrait'))
  it('폭 700 이상 세로는 데스크톱(태블릿)', () => expect(layoutMode(768, 1024, false)).toBe('desktop'))
  it('높이 500 이상 가로는 데스크톱', () => expect(layoutMode(1024, 500, false)).toBe('desktop'))
  it('PC 앱은 늘 데스크톱', () => expect(layoutMode(390, 844, true)).toBe('desktop'))
})
describe('nextLayoutMode', () => {
  it('입력 중 높이만 줄면 모드를 유지한다', () =>
    expect(nextLayoutMode('phone-portrait', 360, 360, 340, { pinnedDesktop: false, typing: true })).toBe('phone-portrait'))
  it('입력 중이어도 폭이 바뀌면(회전) 다시 판정한다', () =>
    expect(nextLayoutMode('phone-portrait', 390, 844, 390, { pinnedDesktop: false, typing: true })).toBe('phone-landscape'))
  it('입력 중이 아니면 높이 변화로도 다시 판정한다', () =>
    expect(nextLayoutMode('phone-portrait', 360, 360, 340, { pinnedDesktop: false, typing: false })).toBe('phone-landscape'))
})
```

- [ ] **Step 2:** `npx vitest run apps/editor/test/renderer/ui/layoutMode.test.ts` → 모듈 없음으로 FAIL
- [ ] **Step 3:** `layoutMode.ts`, `LayoutProvider.tsx` 구현, App 감싸기
- [ ] **Step 4:** 테스트 PASS, 전체 확인(Global Constraints 명령 4개)
- [ ] **Step 5: 커밋** `feat(editor): layout mode for phone portrait and landscape`

### Task 2: 툴바 항목과 패널 쪼개기 (화면 변화 없음)

**Files:**
- Create: `apps/editor/src/renderer/src/editor/editorActions.ts`, `apps/editor/src/renderer/src/editor/toolbar/items.tsx`, `apps/editor/src/renderer/src/editor/toolbar/AddChartDialog.tsx`(지금 `BottomToolbar.tsx` 안의 것을 옮김), `apps/editor/test/renderer/editorActions.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/toolbar/BottomToolbar.tsx`, `apps/editor/src/renderer/src/editor/panels/RightPanel.tsx`, `apps/editor/src/renderer/src/editor/EditorScreen.tsx`

**Interfaces:**
- Produces (`editorActions.ts`):
  - `interface EditorActions { selectChart(file: string): void; playPause(): void; record(): void; playtest(): void; newProject(): void; openProject(): void; save(): void; importCharts(): void; exportChart(): void; exportZip(): void; home(): void; undo(): void; redo(): void; edit(action: 'copy' | 'cut' | 'paste' | 'delete' | 'mirror'): void }`
  - `fileMenuItems(actions: EditorActions, canChooseFolder: boolean): MenuItem[]` — 지금 파일 메뉴와 같은 순서·문구: 새 프로젝트, (열기), 저장, 채보 불러오기, 채보 내보내기, 프로젝트 ZIP으로 내보내기, 홈으로. `MenuItem`은 `ui/Menu`의 항목 타입(없으면 export 추가)
- Produces (`items.tsx`, 모두 감싸는 div 없이 Fragment를 돌려준다 — 감싸기·방향은 각 Shell이 정한다):
  - `ChartPicker({ onSelect, variant }: { onSelect: (file: string) => void; variant: 'tabs' | 'menu' })` — `tabs`는 지금 난이도 탭 줄 + "난이도 추가" 버튼, `menu`는 고른 난이도 이름이 적힌 드롭다운 버튼(항목: 각 난이도, 마지막에 "난이도 추가"). 둘 다 `AddChartDialog`를 연다
  - `ToolButtons()` — 그리기, (자유형이면) 연속 그리기, 지우기, 선택
  - `NoteKindPicker({ placement }: { placement: 'up' | 'down' })` — 자유형일 때 노트 종류 탭, `GimmickList`, 방향 플릭 메뉴. 레인형이면 `null`
  - `WidthControl()` — 자유형일 때 폭 −/+. 레인형이면 `null`
  - `SnapPicker({ placement, align }: { placement: 'up' | 'down'; align?: 'left' | 'right' })`
  - `ZoomControl()`
  - `PlayControls({ actions }: { actions: EditorActions })` — 재생/정지, (caps().recording이면) 녹음/REC, 테스트 플레이
  - `FileMenu({ actions, placement, align }: { actions: EditorActions; placement: 'up' | 'down'; align?: 'left' | 'right' })`
- Produces (`RightPanel.tsx`): `PanelTabs({ onTabClick }: { onTabClick?: (tab: EditorState['panelTab']) => void })` (기본 동작: `store.set({ panelTab })`), `PanelBody()`, 그리고 지금과 같은 `RightPanel`(위 둘 + 접기 버튼)
- `BottomToolbar` props는 `{ actions: EditorActions; inert?: boolean }`로 바꾸고 지금과 같은 그룹 div·클래스 안에 위 항목을 같은 순서로 놓는다. `EditorScreen`은 `useMemo`로 `EditorActions`를 만들고(`undo`/`redo`/`edit`는 기존 `runAction` 경로를 탄다) 넘긴다.

- [ ] **Step 1: 실패하는 테스트** (`editorActions.test.ts`)

```ts
it('PC 파일 메뉴는 열기를 포함한 7개', () =>
  expect(fileMenuItems(fakeActions(), true).map((i) => i.label)).toEqual(
    ['새 프로젝트', '열기', '저장', '채보 불러오기', '채보 내보내기', '프로젝트 ZIP으로 내보내기', '홈으로']))
it('폴더를 고를 수 없으면 열기가 없다', () =>
  expect(fileMenuItems(fakeActions(), false).map((i) => i.label)).not.toContain('열기'))
it('항목을 고르면 해당 동작을 부른다', () => {
  const a = fakeActions()
  fileMenuItems(a, true).find((i) => i.label === '저장')!.onSelect()
  expect(a.save).toHaveBeenCalledOnce()
})
```
(`fakeActions()`는 모든 메서드가 `vi.fn()`인 객체)

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현. 화면(DOM 구조·클래스·문구·순서)은 바뀌지 않아야 한다
- [ ] **Step 4:** 테스트 PASS, 전체 확인. `npm run dev:web`으로 PC 크기 브라우저에서 툴바·패널이 이전과 같은지 눈으로 확인하고 보고서에 적는다
- [ ] **Step 5: 커밋** `refactor(editor): split toolbar into items and panel into tabs/body`

### Task 3: `DesktopShell`과 `BottomSheet`

**Files:**
- Create: `apps/editor/src/renderer/src/editor/shells/DesktopShell.tsx`, `apps/editor/src/renderer/src/editor/shells/shellProps.ts`, `apps/editor/src/renderer/src/ui/BottomSheet.tsx`, `apps/editor/src/renderer/src/ui/BottomSheet.module.css`, `apps/editor/src/renderer/src/ui/sheetStage.ts`, `apps/editor/test/renderer/ui/sheetStage.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (편집 틀 부분을 `DesktopShell`로 옮긴다; 끌어다 놓기·테스트 플레이·대화상자는 EditorScreen에 남는다), `apps/editor/src/renderer/src/editor/EditorScreen.module.css`(틀 관련 클래스는 Shell CSS로 옮겨도 된다)

**Interfaces:**
- Produces (`shellProps.ts`): `interface ShellProps { title: string; dirty: boolean; actions: EditorActions; timeline: ReactNode; minimap: ReactNode; inert: boolean }` — `timeline`은 `<TimelineCanvas …/>`, `minimap`은 `<Minimap …/>` 요소
- Produces (`sheetStage.ts`):
  - `type SheetStage = 'closed' | 'half' | 'full'`
  - `sheetHeightPx(stage: SheetStage, availablePx: number): number` — closed 0, half `Math.round(availablePx * 0.5)`, full `availablePx`
  - `stageAfterDrag(start: SheetStage, dyPx: number, availablePx: number): SheetStage` — 시작 높이 − dy(아래로 끌면 양수)에 가장 가까운 단계. 같은 거리면 작은 쪽
- Produces (`BottomSheet.tsx`): `BottomSheet({ stage, onStageChange, header, children }: { stage: SheetStage; onStageChange: (s: SheetStage) => void; header?: ReactNode; children: ReactNode })` — 부모(위치가 정해진 영역) 아래쪽에 `position: absolute`로 붙고, 높이는 부모 높이 기준 `sheetHeightPx`. 손잡이(높이 24px 이상, `touch-action: none`)를 pointer로 끌면 따라 움직이고 놓을 때 `stageAfterDrag`. 배경 막음 없음. `closed`면 아무것도 그리지 않는다
- `DesktopShell(props: ShellProps)` — 지금 화면 그대로(TitleBar, `.main` 안 타임라인·패널 펼치기 버튼·미니맵·`RightPanel`, `BottomToolbar`)

- [ ] **Step 1: 실패하는 테스트**

```ts
it('반 열린 시트를 많이 내리면 닫힌다', () => expect(stageAfterDrag('half', 300, 1000)).toBe('closed'))
it('반 열린 시트를 조금 내리면 그대로', () => expect(stageAfterDrag('half', 200, 1000)).toBe('half'))
it('반 열린 시트를 많이 올리면 끝까지', () => expect(stageAfterDrag('half', -300, 1000)).toBe('full'))
it('끝까지 연 시트를 조금 내리면 그대로', () => expect(stageAfterDrag('full', 100, 1000)).toBe('full'))
it('닫힌 시트를 올리면 반', () => expect(stageAfterDrag('closed', -400, 1000)).toBe('half'))
it('끌기 범위를 넘어도 단계 안에 머문다', () => expect(stageAfterDrag('full', -500, 1000)).toBe('full'))
it('높이', () => expect([sheetHeightPx('closed', 801), sheetHeightPx('half', 801), sheetHeightPx('full', 801)]).toEqual([0, 401, 801]))
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현. EditorScreen은 `useLayoutMode()`로 고르되, 이 task에서는 모든 모드에서 `DesktopShell`을 쓴다
- [ ] **Step 4:** 테스트 PASS, 전체 확인. PC 크기 브라우저 화면이 Task 2와 같은지 확인
- [ ] **Step 5: 커밋** `refactor(editor): editor shell slot and bottom sheet`

### Task 4: `PortraitShell` (세로)

**Files:**
- Create: `apps/editor/src/renderer/src/editor/shells/PortraitShell.tsx`, `apps/editor/src/renderer/src/editor/shells/PortraitShell.module.css`, `apps/editor/src/renderer/src/editor/shells/TopBar.tsx`, `apps/editor/src/renderer/src/editor/shells/TopBar.module.css`, `apps/editor/src/renderer/src/editor/shells/moreMenu.ts`, `apps/editor/test/renderer/moreMenu.test.ts`
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (`phone-portrait`이면 `PortraitShell`)

**Interfaces:**
- Consumes: `ShellProps`, 항목 컴포넌트, `PanelTabs`/`PanelBody`, `BottomSheet`/`SheetStage`
- `TopBar({ title, dirty, actions })` (높이 48px): 뒤로(`actions.home`, 아이콘 `ChevronLeft`, 라벨 "홈으로"), 제목(한 줄 말줄임), `ChartPicker variant="menu"`, 되돌리기(`Undo2`, "되돌리기"), 다시하기(`Redo2`, "다시 하기"), 저장 상태 점(저장 안 한 변경이 있으면 강조색 점, 라벨 "저장 안 한 변경이 있어요 — 눌러서 저장", 없으면 회색 점 "저장됨"; 누르면 `actions.save`), ⋯ 메뉴(`MoreHorizontal`, "더 보기", `placement="down" align="right"`)
- ⋯ 메뉴: `moreMenuItems(actions: EditorActions, opts: { canChooseFolder: boolean; includeUndo: boolean; zoomIn: () => void; zoomOut: () => void }): MenuItem[]` (`shells/moreMenu.ts`). 순서: (`includeUndo`면) 되돌리기·다시 하기, `fileMenuItems(...)` 전부, 복사·잘라내기·붙여넣기·좌우 반전·삭제(`actions.edit(...)`), 확대·축소. 세로는 TopBar에 되돌리기가 있으므로 `includeUndo: false`. 설정 페이지는 홈에 있으므로 넣지 않는다
- 배치(위→아래): `TopBar` / 가운데(타임라인 + 오른쪽 미니맵, `flex: 1`, `position: relative` — 시트가 여기와 아래 두 줄을 덮는 영역 안에 있다) / 아래 첫 줄(가로 스크롤, 줄바꿈 없음): `ToolButtons`, `NoteKindPicker placement="up"`, `WidthControl` / 아래 둘째 줄: 곡·타이밍·채보 탭 버튼 3개, `SnapPicker placement="up"`, `PlayControls`
- 시트: 단계는 `PortraitShell` 지역 상태, 처음 `closed`(store의 `panelOpen`은 세로에서 쓰지 않는다). 둘째 줄 탭을 누르면 `panelTab`을 바꾸고 `closed`면 `half`로. 시트 `header`는 `PanelTabs`이고, 지금 고른 탭을 다시 누르면 `closed`. 시트 본문은 `PanelBody`. 시트는 `TopBar` 아래 전체 영역(가운데 + 아래 두 줄) 기준으로 `full`이 된다
- 테스트 플레이 오버레이·끌어다 놓기 안내는 EditorScreen에 있으므로 그대로 위에 뜬다

- [ ] **Step 1: 실패하는 테스트** (`moreMenu.test.ts`, `fakeActions()`는 Task 2 테스트와 같은 모양)

```ts
it('세로 ⋯ 메뉴는 파일 메뉴 다음에 편집과 확대가 온다', () =>
  expect(moreMenuItems(fakeActions(), { canChooseFolder: false, includeUndo: false, zoomIn: vi.fn(), zoomOut: vi.fn() }).map((i) => i.label)).toEqual(
    ['새 프로젝트', '저장', '채보 불러오기', '채보 내보내기', '프로젝트 ZIP으로 내보내기', '홈으로', '복사', '잘라내기', '붙여넣기', '좌우 반전', '삭제', '확대', '축소']))
it('가로 ⋯ 메뉴는 되돌리기·다시 하기로 시작한다', () =>
  expect(moreMenuItems(fakeActions(), { canChooseFolder: false, includeUndo: true, zoomIn: vi.fn(), zoomOut: vi.fn() }).slice(0, 2).map((i) => i.label)).toEqual(['되돌리기', '다시 하기']))
it('좌우 반전은 mirror 편집을 부른다', () => {
  const a = fakeActions()
  moreMenuItems(a, { canChooseFolder: false, includeUndo: false, zoomIn: vi.fn(), zoomOut: vi.fn() }).find((i) => i.label === '좌우 반전')!.onSelect()
  expect(a.edit).toHaveBeenCalledWith('mirror')
})
```

- [ ] **Step 2:** FAIL 확인 후 `moreMenu.ts`, `TopBar`, `PortraitShell` 구현
- [ ] **Step 3: 확인** `npm run dev:web` → `phone-preview.html` 세로 프레임에서: 가로 스크롤바가 페이지에 생기지 않는다; 긴 제목(40자)은 말줄임; 난이도 10개를 만들어도 TopBar가 넘치지 않는다; ⋯ 메뉴와 난이도 메뉴가 화면 안에 열린다; 자유형 채보에서 첫 줄이 가로로 스크롤된다; 레인형에서는 노트 종류·폭이 없다; 탭 → 반 시트, 손잡이 위로 → 끝까지, 같은 탭 → 닫힘; 반 시트 상태에서 타임라인 클릭으로 노트를 찍을 수 있다. 결과를 보고서에 적는다
- [ ] **Step 4:** 테스트 PASS, 전체 확인 명령 4개
- [ ] **Step 5: 커밋** `feat(editor): phone portrait editor layout`

### Task 5: `LandscapeShell` (가로)

**Files:**
- Create: `apps/editor/src/renderer/src/editor/shells/LandscapeShell.tsx`, `apps/editor/src/renderer/src/editor/shells/LandscapeShell.module.css`
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (`phone-landscape`이면 `LandscapeShell`)

**Interfaces:**
- Consumes: Task 4와 같음. ⋯ 메뉴는 `moreMenuItems(actions, { …, includeUndo: true })`
- 배치(왼→오): 왼쪽 세로 줄(폭 52px, 세로 스크롤 가능): 뒤로, `ToolButtons`, `SnapPicker placement="down"`, `PlayControls`, ⋯(`placement="up"`) / 가운데: 타임라인 + 미니맵 / 오른쪽 패널(폭 280px): 위쪽 고정 영역에 `ChartPicker variant="menu"`, `NoteKindPicker placement="down"`, `WidthControl`(자유형만), 그 아래 `PanelTabs` + 접기 버튼 + `PanelBody`(세로 스크롤)
- 접기: store `panelOpen`을 쓴다. 접으면 패널 대신 폭 44px 아이콘 줄(곡·타이밍·채보 아이콘 버튼 + 펼치기 버튼)만 남고, 아이콘을 누르면 그 탭으로 펼친다

- [ ] **Step 1:** 구현
- [ ] **Step 2: 확인** `phone-preview.html` 가로 프레임에서: 왼쪽 줄이 넘치면 세로로 스크롤된다; 스냅·⋯ 메뉴가 화면 안에 열린다; 패널 접기/펼치기, 아이콘으로 탭 열기; 자유형에서 노트 종류·폭이 패널 위에 있다; 타임라인 폭이 접었을 때 넓어진다. 결과를 보고서에 적는다
- [ ] **Step 3:** 전체 확인 명령 4개
- [ ] **Step 4: 커밋** `feat(editor): phone landscape editor layout`

### Task 6: 홈 화면 (서랍 메뉴, 카드 목록)

**Files:**
- Modify: `apps/editor/src/renderer/src/home/HomeScreen.tsx`, `HomeScreen.module.css`, `RecentTable.tsx`, `RecentTable.module.css`

**Interfaces:**
- Consumes: `useLayoutMode()`
- 폰 모드(두 모드 공통):
  - 사이드바를 숨기고 맨 위에 높이 48px 줄: 메뉴 버튼(`Menu` 아이콘, "메뉴 열기"), `RCM`, 오른쪽에 새 프로젝트 아이콘 버튼(`Plus`, "새 프로젝트")
  - 메뉴 버튼 → 지금 사이드바 내용(접기 버튼 제외, 늘 펼친 모습)을 왼쪽 서랍(폭 `min(280px, 85vw)`)으로 띄우고 뒤에 반투명 배경. 배경을 누르거나, 항목을 고르거나, Esc면 닫힌다
  - `RecentTable`에 `variant: 'table' | 'cards'` prop을 더해 폰에서는 `cards`: 카드마다 이름(굵게, 말줄임), 아티스트 · 난이도 요약, 최근 열람(오른쪽 위). 한 번 누르면 연다(삭제 모드에서는 고르기). 찾을 수 없는 프로젝트의 기존 버튼(다시 연결·목록에서 제거)은 카드 아래쪽에 그대로. 우클릭 메뉴는 카드에서도 지금 규칙 그대로(웹은 "열기"만)
  - 목록 머리(검색·정렬·삭제)는 한 줄에 맞지 않으면 검색 칸이 다음 줄 전체 폭으로 내려간다
- `desktop`은 지금 그대로

- [ ] **Step 1:** 구현
- [ ] **Step 2: 확인** 세로·가로 프레임에서 서랍 열기/닫기, 페이지 이동, 카드 누르면 열기, 삭제 모드 고르기, 공지 카드·인사말이 넘치지 않음. PC 크기에서는 이전과 같음. 결과를 보고서에 적는다
- [ ] **Step 3:** 전체 확인 명령 4개
- [ ] **Step 4: 커밋** `feat(editor): phone home with drawer menu and project cards`

### Task 7: 대화상자·페이지·터치 대상, 수동 확인

**Files:**
- Modify: `apps/editor/src/renderer/src/ui/Modal.module.css`, `ui/dialogs.module.css`, `ui/IconButton.module.css`, `ui/Button.module.css`, `ui/Row.module.css`, `ui/Menu.module.css`, `settings/SettingsPage.module.css`, `presets/PresetsPage.module.css`, `presets/TrackRowsEditor.module.css`, `guide/GuidePage.module.css`, `gameplay/*.module.css`, `home/NewProjectDialog.module.css` (필요한 것만)

- 폰 모드:
  - `Modal`: 아래에 붙는 전체 폭 시트(위 모서리만 둥글게, `max-height: 90dvh`, 본문 스크롤, 아래 버튼 줄은 늘 보임). 데스크톱은 그대로
  - `IconButton`·`Button`·탭 버튼·메뉴 항목: 최소 높이·폭 40px
  - `Row`(라벨 + 입력)·설정·프리셋·가이드·게임 화면 설정 페이지: 두 칸 배치를 한 칸으로 내려 쌓고, 390px 폭에서 페이지에 가로 스크롤이 생기지 않는다
- 이 task의 마지막에 아래 확인 목록을 `phone-preview.html`(세로·가로)로 돌리고, 결과를 커밋 메시지 본문에 적는다. 실제 폰(Android Chrome·iPhone Safari) 확인은 사용자가 한다
  1. 편집 중(저장 안 함, 노트 선택, 재생 위치 이동, 두 번째 난이도 선택) 세로↔가로 프레임 대신 창 크기를 바꿔 모드를 넘겨도 모두 그대로
  2. 홈 → 새 프로젝트 → 편집 → 저장 → 홈 흐름이 세로에서 끝까지 된다
  3. 설정·트랙 프리셋·유저 가이드·AI 가이드 페이지에 가로 스크롤이 없다
  4. PC 크기 브라우저와 PC 앱(`npm run dev`)은 이전과 같다
  5. 새 프로젝트·난이도 추가 대화상자가 아래 시트로 뜨고, 확인·취소 버튼이 보인다

- [ ] **Step 1:** CSS 구현
- [ ] **Step 2:** 확인 목록 실행
- [ ] **Step 3:** 전체 확인 명령 4개
- [ ] **Step 4: 커밋** `feat(editor): phone dialogs, pages and touch targets` (본문에 확인 결과)
