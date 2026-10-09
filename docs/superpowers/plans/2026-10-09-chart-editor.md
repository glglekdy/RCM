# RCM 채보 에디터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세로 레인형 웹 리듬게임용 채보를 만드는 Electron 데스크톱 에디터와, 게임과 공유할 `core`·`playfield` 패키지를 만든다.

**Architecture:** npm workspaces 모노레포. `packages/core`(포맷·검증·타이밍, 순수 TS) ← `packages/playfield`(판정·플레이 화면) ← `apps/editor`(electron-vite + React). 에디터의 편집 로직은 불변 `ProjectDoc`을 받아 새 `ProjectDoc`을 돌려주는 순수 함수로 두고, React는 store 구독만 한다. 시계는 `AudioContext.currentTime` 하나.

**Tech Stack:** Node 24, npm 11 workspaces, TypeScript 5 (strict), Vitest, Electron + electron-vite + Vite, React 18, lucide-react, pretendard, electron-builder

**Spec:** `docs/superpowers/specs/2026-10-09-chart-editor-design.md` (계획의 모든 "N절"은 이 문서의 절 번호)

## Global Constraints

- 1박 = `480` tick. 스냅 단위는 `4, 8, 12, 16, 24, 32` (1/4 = 1박 = 480 tick, 한 칸 = `480*4/division` tick)
- `formatVersion` = `1`. 레인 수 `4`~`8`
- 판정 창: Perfect ±40ms, Great ±80ms, Good ±120ms. 롱노트는 끝 −120ms 이전에 떼면 Miss
- 파일: `song.json`, `<name>.chart.json`, `editor.json`. JSON은 들여쓰기 2칸 + 끝에 개행. 노트는 tick, lane 오름차순 저장
- 레인 키 (`KeyboardEvent.code`): 4 `KeyD KeyF KeyJ KeyK` / 5 `KeyD KeyF Space KeyJ KeyK` / 6 `KeyS KeyD KeyF KeyJ KeyK KeyL` / 7 `KeyS KeyD KeyF Space KeyJ KeyK KeyL` / 8 `KeyA KeyS KeyD KeyF KeyJ KeyK KeyL Semicolon`
- 디자인 토큰·타임라인 색은 6장 표의 값을 그대로 쓴다
- UI 문구는 한국어. 화면에서는 곡 폴더를 "프로젝트"라고 부른다
- renderer는 Node 접근 없음: `contextIsolation: true`, `nodeIntegration: false`, 파일 접근은 preload의 `window.rcm` API로만
- 파일 저장은 항상 임시 파일에 쓴 뒤 rename (원자적 저장)
- 패키지 이름: `@rcm/core`, `@rcm/playfield`, `@rcm/editor`. 패키지는 빌드 없이 소스(`src/index.ts`)를 바로 내보낸다
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

**설계와 다르게 정한 것 (스펙도 같이 수정함):** Undo 기록은 난이도별이 아니라 **프로젝트 전체에 하나**. 곡 단위 변경(BPM·오프셋·마커)을 난이도별 기록에 나눠 두면 서로 덮어쓰는 문제가 있기 때문. 다른 난이도의 편집을 Undo하면 그 난이도로 전환된다.

## Review Focus

1. **한글·공백·특수문자가 들어간 프로젝트 이름과 경로** — `진격의 승리: Remix?` 같은 이름으로 만들고 다시 열 수 있어야 한다 → Task 7 테스트
2. **문제가 있는 프로젝트 폴더 열기** (`editor.json` 없음, 채보 하나만 검증 실패, `song.json` 없음) — 없는 `editor.json`은 빈 값, 검증 실패는 파일·항목이 담긴 오류 목록으로 열기 중단 → Task 7, Task 9 테스트
3. **저장 후 Undo / 다시 Redo** — 저장한 상태로 돌아오면 `*`가 사라지고, 벗어나면 다시 생겨야 한다 → Task 9 테스트
4. **녹음 중 키를 꾹 누를 때 생기는 키 반복 이벤트** — 노트가 여러 개 생기면 안 되고 하나의 롱노트가 돼야 한다 → Task 20 테스트
5. **재생선이 tick 0보다 앞(음수 시간)일 때 재생·스냅·스크롤** — 오프셋이 큰 곡의 앞부분에서 재생해도 멈추거나 튀지 않아야 한다 → Task 2, Task 10 테스트

---

## 파일 구조

```
package.json                      workspaces ["packages/*", "apps/*"], scripts: test, typecheck, dev, dist
tsconfig.base.json                strict, ES2022, moduleResolution "bundler", jsx "react-jsx"
vitest.config.ts                  include: packages/*/test/**/*.test.ts, apps/editor/test/**/*.test.ts
packages/core/src/
  constants.ts   types.ts   timing.ts   snap.ts   validate.ts   parse.ts   serialize.ts   tapTempo.ts   index.ts
packages/playfield/src/
  keymap.ts   judge.ts   playState.ts   Playfield.ts   index.ts
apps/editor/
  electron.vite.config.ts   electron-builder.yml
  src/shared/api.ts                       RcmApi 타입 (main·preload·renderer 공용)
  src/main/index.ts                       창 생성, 닫기 가드
  src/main/ipc.ts                         ipcMain 핸들러 등록
  src/main/project/folderName.ts          폴더 이름 정리, 중복 회피
  src/main/project/settings.ts            settings.json, 최근 목록
  src/main/project/projectFs.ts           createProject / openProject / writeProjectFiles / summarizeProject
  src/preload/index.ts                    window.rcm 노출
  src/renderer/index.html
  src/renderer/src/main.tsx  App.tsx
  src/renderer/src/styles/tokens.css  global.css
  src/renderer/src/ui/                    TitleBar, Button, IconButton, Card, Row, TextField, NumberField,
                                          SegmentedControl, Menu, Modal, dialogs.tsx, toast.tsx
  src/renderer/src/home/                  HomeScreen, RecentTable, NewProjectDialog, relativeTime.ts
  src/renderer/src/editor/EditorScreen.tsx
  src/renderer/src/editor/state/          doc.ts, loadProject.ts, history.ts, dirty.ts, store.ts, useStore.ts
  src/renderer/src/editor/commands/       notes.ts, timing.ts, meta.ts, markers.ts, tap.ts, record.ts, charts.ts
  src/renderer/src/editor/audio/          AudioEngine.ts, hitsound.ts, schedule.ts, waveform.ts
  src/renderer/src/editor/timeline/       view.ts, hitTest.ts, drawTimeline.ts, TimelineCanvas.tsx, tools.ts
  src/renderer/src/editor/minimap/        minimap.ts, Minimap.tsx
  src/renderer/src/editor/panels/         RightPanel, SongPanel, TimingPanel, ChartPanel
  src/renderer/src/editor/toolbar/        BottomToolbar.tsx
  src/renderer/src/editor/input/          shortcuts.ts, recorder.ts
  src/renderer/src/editor/playtest/       PlaytestOverlay.tsx
  test/...                                src 구조를 따라 *.test.ts
```

---

# 1단계 — 모노레포 + core

### Task 1: 모노레포 골격 + core 타입·상수

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`(`node_modules`, `out`, `dist`, `*.tmp-*`)
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/{constants,types,index}.ts`
- Create: `packages/playfield/package.json`, `packages/playfield/tsconfig.json`, `packages/playfield/src/index.ts` (빈 export — Task 20부터 채움)
- Test: `packages/core/test/constants.test.ts`

**Interfaces:**
- Produces (`@rcm/core`):
  - `TICKS_PER_BEAT = 480`, `FORMAT_VERSION = 1`, `MIN_LANES = 4`, `MAX_LANES = 8`
  - `type SnapDivision = 4 | 8 | 12 | 16 | 24 | 32`, `SNAP_DIVISIONS: readonly SnapDivision[]` (이 순서)
  - `snapStepTicks(division: SnapDivision): number`
  - `interface TimingPoint { tick: number; bpm: number; beatsPerMeasure?: number }`
  - `interface Song { formatVersion: 1; title: string; artist: string; audio: string; offsetMs: number; previewStartMs: number; timing: TimingPoint[] }`
  - `type Note = { tick: number; lane: number; type: 'tap' } | { tick: number; lane: number; type: 'hold'; endTick: number }`
  - `interface Chart { formatVersion: 1; name: string; level: number; lanes: number; notes: Note[] }`
  - `interface Marker { ms: number; label: string }`, `interface EditorData { formatVersion: 1; markers: Marker[] }`
  - `noteKey(note: Note): string` → `` `${lane}:${tick}` `` (겹침 금지 규칙 때문에 채보 안에서 유일)

- [ ] **Step 1: 루트·패키지 설정 파일 작성**

루트 `package.json`: `"private": true`, `"workspaces": ["packages/*", "apps/*"]`, scripts `"test": "vitest run"`, `"typecheck": "tsc -p packages/core && tsc -p packages/playfield"` (Task 5에서 editor 추가). devDependencies `typescript`, `vitest` 설치(`npm i -D typescript vitest`).
각 패키지 `package.json`: `"type": "module"`, `"main": "src/index.ts"`, `"types": "src/index.ts"`. playfield는 `"dependencies": { "@rcm/core": "*" }`.
각 패키지 `tsconfig.json`: `extends ../../tsconfig.base.json`, `"include": ["src", "test"]`, `"noEmit": true`.

- [ ] **Step 2: 실패하는 테스트 작성** — `packages/core/test/constants.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { TICKS_PER_BEAT, snapStepTicks, SNAP_DIVISIONS, noteKey } from '../src';

describe('constants', () => {
  it('1박은 480 tick', () => expect(TICKS_PER_BEAT).toBe(480));
  it('스냅 한 칸 tick', () => {
    expect(SNAP_DIVISIONS.map(snapStepTicks)).toEqual([480, 240, 160, 120, 80, 60]);
  });
  it('noteKey', () => expect(noteKey({ tick: 960, lane: 2, type: 'tap' })).toBe('2:960'));
});
```

- [ ] **Step 3: `npm test` 실행 → FAIL (모듈 없음)**
- [ ] **Step 4: `constants.ts`, `types.ts`, `index.ts`(둘 다 re-export) 구현**
- [ ] **Step 5: `npm test` → PASS, `npm run typecheck` → 오류 없음**
- [ ] **Step 6: 커밋** — `git add -A && git commit -m "chore: monorepo scaffold and core types"`

### Task 2: TimingMap + 스냅

**Files:**
- Create: `packages/core/src/timing.ts`, `packages/core/src/snap.ts` (index에 export 추가)
- Test: `packages/core/test/timing.test.ts`, `packages/core/test/snap.test.ts`

**Interfaces:**
- Consumes: Task 1 타입·상수
- Produces:
  - `class TimingMap { constructor(timing: TimingPoint[], offsetMs: number); tickToMs(tick: number): number; msToTick(ms: number): number /* 실수 */; segmentAt(tick: number): Segment; gridLines(fromTick: number, toTick: number, division: SnapDivision): GridLine[] }`
  - `interface Segment { index: number; startTick: number; startMs: number; bpm: number; beatsPerMeasure: number; endTick: number /* 다음 지점 tick, 없으면 Infinity */ }`
  - `interface GridLine { tick: number; kind: 'measure' | 'beat' | 'snap' }`
  - `snapTick(tm: TimingMap, tick: number, division: SnapDivision): number`
  - `stepTick(tm: TimingMap, tick: number, division: SnapDivision, dir: 1 | -1): number`

규칙: 반환하는 tick은 `-0`을 `0`으로 정규화한다(`toBe`가 `Object.is`로 비교). 각 BPM 변경 지점에서 마디·박·스냅 격자가 새로 시작한다. tick 0 이전은 첫 구간 BPM으로 연장한다(음수 tick/ms 허용). `beatsPerMeasure` 생략 시 직전 값, 첫 지점에서 생략되면 4. `msToTick`은 구간 시작 ms 배열에서 이진 탐색.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// timing.test.ts
const single = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }], 100);
it('단일 BPM', () => {
  expect(single.tickToMs(0)).toBe(100);
  expect(single.tickToMs(480)).toBe(600);
  expect(single.msToTick(600)).toBe(480);
  expect(single.tickToMs(-480)).toBe(-400);   // tick 0 이전 연장
  expect(single.msToTick(-400)).toBe(-480);
});
const multi = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }, { tick: 1920, bpm: 60 }], 0);
it('BPM 변경', () => {
  expect(multi.tickToMs(1920)).toBe(2000);
  expect(multi.tickToMs(2400)).toBe(3000);
  expect(multi.msToTick(3000)).toBe(2400);
  expect(multi.msToTick(1500)).toBe(1440);
  expect(multi.segmentAt(2400).beatsPerMeasure).toBe(4);  // 상속
  expect(multi.segmentAt(2400).bpm).toBe(60);
});
it('음수 오프셋', () => expect(new TimingMap([{ tick: 0, bpm: 120 }], -50).tickToMs(0)).toBe(-50));
it('격자는 BPM 변경 지점에서 다시 시작', () => {
  const tm = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }, { tick: 1000, bpm: 120, beatsPerMeasure: 3 }], 0);
  const lines = tm.gridLines(0, 2440, 4);
  expect(lines.filter(l => l.kind === 'measure').map(l => l.tick)).toEqual([0, 1000, 2440]);
  expect(lines.filter(l => l.kind === 'beat').map(l => l.tick)).toEqual([480, 960, 1480, 1960]);
});
it('스냅 선은 박/마디와 겹치면 높은 종류 하나만', () => {
  const lines = single.gridLines(0, 480, 8);
  expect(lines).toEqual([{ tick: 0, kind: 'measure' }, { tick: 240, kind: 'snap' }, { tick: 480, kind: 'beat' }]);
});

// snap.test.ts
const tm = new TimingMap([{ tick: 0, bpm: 120 }, { tick: 1000, bpm: 120 }], 0);
it('가장 가까운 스냅', () => {
  expect(snapTick(tm, 130, 16)).toBe(120);
  expect(snapTick(tm, 990, 4)).toBe(1000);  // 다음 구간 시작이 더 가까움
  expect(snapTick(tm, 1010, 4)).toBe(1000);
  expect(snapTick(tm, -100, 4)).toBe(0);
  expect(snapTick(tm, -300, 4)).toBe(-480);
});
it('한 칸 이동', () => {
  expect(stepTick(tm, 0, 4, 1)).toBe(480);
  expect(stepTick(tm, 130, 16, -1)).toBe(120);  // 격자 위가 아니면 바로 앞 격자
  expect(stepTick(tm, 960, 4, 1)).toBe(1000);   // 구간 경계를 넘지 않음
  expect(stepTick(tm, 0, 4, -1)).toBe(-480);
});
```

- [ ] **Step 2: `npx vitest run packages/core/test/timing.test.ts packages/core/test/snap.test.ts` → FAIL**
- [ ] **Step 3: `timing.ts`, `snap.ts` 구현** (구간별 `startMs` 미리 계산, ms/tick = `60000 / (bpm * 480)`)
- [ ] **Step 4: 같은 명령 → PASS**
- [ ] **Step 5: 커밋** — `feat(core): timing map and snapping`

### Task 3: 검증·파싱·직렬화

**Files:**
- Create: `packages/core/src/validate.ts`, `parse.ts`, `serialize.ts`
- Test: `packages/core/test/parse.test.ts`, `packages/core/test/serialize.test.ts`

**Interfaces:**
- Produces:
  - `type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }`
  - `parseSong(text: string, file?: string /* 기본 'song.json' */): ParseResult<Song>`
  - `parseChart(text: string, file: string): ParseResult<Chart>`
  - `parseEditorData(text: string, file?: string /* 기본 'editor.json' */): ParseResult<EditorData>`
  - `notesOverlap(a: Note, b: Note): boolean` — 같은 레인이고 `[tick, endTick ?? tick]` 구간이 겹치면(끝 포함) true
  - `serializeSong(song: Song): string`, `serializeChart(chart: Chart): string`, `serializeEditorData(data: EditorData): string`
  - `emptyEditorData(): EditorData`

오류 메시지 형식: `` `${file} › ${path}: ${이유}` `` (예: `hard.chart.json › notes[3]: lane 7은 범위를 벗어남 (0~6)`). 2.6절 규칙 전부 + JSON 문법 오류(`${file}: JSON 형식이 올바르지 않음`). 모르는 필드는 버린다. 직렬화는 필드 순서를 2.3~2.5절 예시대로, `beatsPerMeasure`가 없으면 생략, 노트는 tick→lane 정렬.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const chartText = (notes: unknown[], extra = {}) =>
  JSON.stringify({ formatVersion: 1, name: 'HARD', level: 12, lanes: 7, notes, ...extra });
const errorsOf = (r: ParseResult<unknown>) => (r.ok ? [] : r.errors);

it('정상 채보', () => {
  const r = parseChart(chartText([{ tick: 2400, lane: 3, type: 'hold', endTick: 3360 }, { tick: 0, lane: 0, type: 'tap' }]), 'hard.chart.json');
  expect(r.ok).toBe(true);
});
it.each([
  [chartText([], { formatVersion: 2 }), 'formatVersion'],
  [chartText([], { lanes: 9 }), 'lanes'],
  [chartText([{ tick: 0, lane: 0, type: 'tap' }, { tick: 0, lane: 7, type: 'tap' }]), 'notes[1]'],
  [chartText([{ tick: 480, lane: 0, type: 'hold', endTick: 480 }]), 'notes[0]'],
  [chartText([{ tick: -1, lane: 0, type: 'tap' }]), 'notes[0]'],
  [chartText([{ tick: 1.5, lane: 0, type: 'tap' }]), 'notes[0]'],
  [chartText([{ tick: 0, lane: 0, type: 'hold', endTick: 960 }, { tick: 480, lane: 0, type: 'tap' }]), '겹침'],
  ['{ not json', 'JSON'],
])('잘못된 채보 %#', (text, needle) => {
  const errors = errorsOf(parseChart(text, 'hard.chart.json'));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.join('\n')).toContain('hard.chart.json');
  expect(errors.join('\n')).toContain(needle);
});
it.each([
  [{ timing: [] }, 'timing'],
  [{ timing: [{ tick: 480, bpm: 120 }] }, 'timing[0]'],
  [{ timing: [{ tick: 0, bpm: 120 }, { tick: 0, bpm: 90 }] }, 'timing[1]'],
  [{ timing: [{ tick: 0, bpm: 0 }] }, 'timing[0]'],
])('잘못된 song %#', (patch, needle) => {
  const base = { formatVersion: 1, title: 't', artist: 'a', audio: 'audio.ogg', offsetMs: 0, previewStartMs: 0, timing: [{ tick: 0, bpm: 120 }] };
  expect(errorsOf(parseSong(JSON.stringify({ ...base, ...patch }))).join('\n')).toContain(needle);
});
it('editor.json markers 기본값', () => {
  const r = parseEditorData('{"formatVersion":1}');
  expect(r.ok && r.value.markers).toEqual([]);
});
it('notesOverlap 끝 포함', () => {
  expect(notesOverlap({ tick: 0, lane: 0, type: 'hold', endTick: 480 }, { tick: 480, lane: 0, type: 'tap' })).toBe(true);
  expect(notesOverlap({ tick: 0, lane: 0, type: 'hold', endTick: 480 }, { tick: 480, lane: 1, type: 'tap' })).toBe(false);
});

// serialize.test.ts
it('노트 정렬 + 2칸 들여쓰기 + 끝 개행 + 왕복', () => {
  const chart: Chart = { formatVersion: 1, name: 'N', level: 1, lanes: 4, notes: [
    { tick: 480, lane: 1, type: 'tap' }, { tick: 0, lane: 3, type: 'tap' }, { tick: 480, lane: 0, type: 'tap' } ] };
  const text = serializeChart(chart);
  expect(text.endsWith('\n')).toBe(true);
  expect(text).toContain('\n  "notes"');
  const back = parseChart(text, 'n.chart.json');
  expect(back.ok && back.value.notes.map(noteKey)).toEqual(['3:0', '0:480', '1:480']);
});
it('beatsPerMeasure 없으면 생략', () => {
  const song: Song = { formatVersion: 1, title: 't', artist: '', audio: 'a.ogg', offsetMs: 0, previewStartMs: 0, timing: [{ tick: 0, bpm: 120 }] };
  expect(serializeSong(song)).not.toContain('beatsPerMeasure');
});
```

- [ ] **Step 2: `npx vitest run packages/core/test/parse.test.ts packages/core/test/serialize.test.ts` → FAIL**
- [ ] **Step 3: `validate.ts`(필드별 검사 + 레인별 정렬 후 인접 비교로 겹침 검사), `parse.ts`, `serialize.ts` 구현**
- [ ] **Step 4: 같은 명령 → PASS**
- [ ] **Step 5: 커밋** — `feat(core): chart format validation, parse and serialize`

### Task 4: 탭 BPM 추정

**Files:**
- Create: `packages/core/src/tapTempo.ts`
- Test: `packages/core/test/tapTempo.test.ts`

**Interfaces:**
- Produces: `estimateTempo(tapsMs: number[]): TempoEstimate | null` (탭 4개 미만이면 null)
  `interface TempoEstimate { bpm: number /* 소수 둘째 자리 반올림 */; beatMs: number; firstTapMs: number /* 회귀 절편 */; firstBeatMs: number /* ((절편 % beatMs) + beatMs) % beatMs */; deviationMs: number /* 잔차 표준편차 */; count: number }`

5.8절: 탭 순번 i와 시각 tᵢ의 최소제곱 선형 회귀. 기울기 = beatMs, 절편 = firstTapMs.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('정확한 탭', () => {
  const r = estimateTempo([0, 1, 2, 3, 4, 5, 6, 7].map(i => 100 + i * 400))!;
  expect(r.bpm).toBe(150);
  expect(r.firstBeatMs).toBeCloseTo(100, 6);
  expect(r.deviationMs).toBeCloseTo(0, 6);
  expect(r.count).toBe(8);
});
it('첫 박은 첫 탭 이전의 가장 이른 박', () => {
  const r = estimateTempo([0, 1, 2, 3, 4].map(i => 1000 + i * 500))!;
  expect(r.bpm).toBe(120);
  expect(r.firstBeatMs).toBeCloseTo(0, 6);
});
it('흔들린 탭', () => {
  const r = estimateTempo([0, 402, 798, 1201, 1600])!;
  expect(Math.abs(r.bpm - 150)).toBeLessThan(0.5);
  expect(r.deviationMs).toBeGreaterThan(0);
});
it('3번 이하는 null', () => expect(estimateTempo([0, 400, 800])).toBeNull());
```

- [ ] **Step 2: `npx vitest run packages/core/test/tapTempo.test.ts` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: → PASS, 이어서 `npm test` 전체 PASS**
- [ ] **Step 5: 커밋** — `feat(core): tap tempo estimation`

---

# 2단계 — 에디터 기본

### Task 5: Electron 앱 골격 + 프레임 없는 창 + 디자인 토큰

**Files:**
- Create: `apps/editor/package.json`, `apps/editor/tsconfig.json`, `apps/editor/electron.vite.config.ts`
- Create: `apps/editor/src/main/index.ts`, `apps/editor/src/preload/index.ts`, `apps/editor/src/shared/api.ts`
- Create: `apps/editor/src/renderer/index.html`, `src/renderer/src/{main.tsx,App.tsx}`, `src/renderer/src/styles/{tokens.css,global.css}`, `src/renderer/src/ui/TitleBar.tsx` (+ `.module.css`)
- Modify: 루트 `package.json` (scripts `dev`: `npm -w @rcm/editor run dev`, typecheck에 editor 추가)

**Interfaces:**
- Produces:
  - `window.rcm: RcmApi` (`src/shared/api.ts`에서 선언. 이 Task에서는 `minimize()`, `toggleMaximize()`, `close()`, `isMaximized(): Promise<boolean>`만 구현, 나머지 메서드는 Task 7에서 추가)
  - `<TitleBar title: string; dirty?: boolean />` — 가운데 제목(dirty면 ` *`), 오른쪽 최소화/최대화/닫기(lucide `Minus`, `Square`, `X`), 빈 영역 `-webkit-app-region: drag`, 버튼은 `no-drag`
  - `tokens.css`: 6.1절 토큰 전부를 `:root` CSS 변수로, `global.css`: Pretendard 13px, `body { background: var(--bg-app); color: var(--text) }`, 6.2절 스크롤바

설정: `electron-vite`의 `externalizeDepsPlugin({ exclude: ['@rcm/core', '@rcm/playfield'] })` (소스 TS 패키지를 번들에 포함). 창: `frame: false`, `backgroundColor: '#141414'`, 기본 1280×800, 최소 1000×640, `Menu.setApplicationMenu(null)`. 의존성: `npm -w @rcm/editor i react react-dom lucide-react pretendard @rcm/core@* @rcm/playfield@*` 및 `-D electron electron-vite vite @vitejs/plugin-react @types/react @types/react-dom`. 폰트는 `import 'pretendard/dist/web/variable/pretendardvariable.css'`.

- [ ] **Step 1: 위 파일 작성. `App.tsx`는 `<TitleBar title="RCM" />` + 빈 본문**
- [ ] **Step 2: `npm run typecheck` → 오류 없음**
- [ ] **Step 3: `npm run dev` 실행 → 확인**: 테두리 없는 어두운 창, 가운데 "RCM", 타이틀바 드래그로 창 이동, 최소화/최대화/닫기 동작, 글꼴이 Pretendard
- [ ] **Step 4: 커밋** — `feat(editor): electron shell with custom title bar and design tokens`

### Task 6: 공통 UI 컴포넌트 + 대화상자·토스트

**Files:**
- Create: `apps/editor/src/renderer/src/ui/{Button,IconButton,Card,Row,TextField,NumberField,SegmentedControl,Menu,Modal}.tsx` (+ 각 `.module.css`), `ui/dialogs.tsx`, `ui/toast.tsx`, `ui/index.ts`

**Interfaces:**
- Produces (모두 6.2절 규칙대로):
  - `Button { variant?: 'primary' | 'default' | 'ghost'; disabled?; onClick; children }` — primary는 `--accent` 바탕
  - `IconButton { icon: LucideIcon; label: string /* title 툴팁 */; active?: boolean; onClick }`
  - `Card { title?: string; children }`, `Row { label: string; children }`
  - `TextField { value; onChange(v: string); placeholder? }`, `NumberField { value: number; onChange(v: number); prefix?: string; suffix?: string; step?: number; min?: number; max?: number }` — 입력 중 잘못된 값이면 blur 시 원래 값으로 복원
  - `SegmentedControl<T> { options: { value: T; label: string }[]; value: T; onChange(v: T) }`
  - `Menu { trigger: ReactNode; items: { label: string; onSelect(): void; disabled?: boolean; danger?: boolean }[] }` — 바깥 클릭·Esc로 닫힘
  - `Modal { open: boolean; title: string; onClose(); children; footer?: ReactNode }`
  - `DialogProvider` + `useDialogs(): { alert(title: string, message: string | string[]): Promise<void>; confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>; choose<T extends string>(opts: { title: string; message: string; choices: { value: T; label: string; variant?: 'primary' | 'default' | 'danger' }[] }): Promise<T | null> }`
  - `ToastProvider` + `useToast(): (message: string) => void` — 화면 아래 가운데, 2.5초 후 사라짐

- [ ] **Step 1: 컴포넌트 구현, `App.tsx`를 `DialogProvider`·`ToastProvider`로 감쌈**
- [ ] **Step 2: `npm run typecheck` → 오류 없음**
- [ ] **Step 3: 임시로 App 본문에 각 컴포넌트를 하나씩 배치하고 `npm run dev`로 6.2절과 비교 확인 (카드 여백 12px, 행 높이 32px, 칩 높이 28px, 세그먼트 선택 상태, 모달 덮개). 확인 후 임시 배치 제거**
- [ ] **Step 4: 커밋** — `feat(editor): shared UI components, dialogs and toasts`

### Task 7: main 프로세스 프로젝트 파일 서비스 + IPC

**Files:**
- Create: `apps/editor/src/main/project/{folderName,settings,projectFs}.ts`, `apps/editor/src/main/ipc.ts`
- Modify: `apps/editor/src/shared/api.ts`, `apps/editor/src/preload/index.ts`, `apps/editor/src/main/index.ts`
- Test: `apps/editor/test/main/{folderName,settings,projectFs}.test.ts`

**Interfaces:**
- Consumes: `@rcm/core`의 `serializeSong`, `serializeChart`, `serializeEditorData`, `emptyEditorData`, `parseSong`, `parseChart`, `FORMAT_VERSION`
- Produces (`src/shared/api.ts`):
  ```ts
  interface CreateProjectOptions { parentDir: string; title: string; artist: string; audioPath: string; bpm: number; chartName: string; lanes: number }
  interface ProjectFiles { dir: string; audioPath: string; songText: string; charts: { file: string; text: string }[]; editorText: string | null }
  interface RecentProject { dir: string; lastOpened: number; missing: boolean; title: string; artist: string; charts: { name: string; lanes: number }[] }
  interface RcmApi {
    pickAudioFile(): Promise<string | null>;              // 필터: ogg, mp3, wav
    pickFolder(defaultPath?: string): Promise<string | null>;
    getDefaultProjectDir(): Promise<string>;               // settings에 없으면 문서/RCM Projects
    resolveProjectDir(parentDir: string, title: string): Promise<string>;  // 미리보기용, 만들지 않음
    createProject(opts: CreateProjectOptions): Promise<{ dir: string }>;   // 실패 시 reject(Error 메시지 한국어)
    openProject(dir: string): Promise<ProjectFiles>;       // 최근 목록 갱신 포함
    readAudio(path: string): Promise<ArrayBuffer>;
    writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void>;
    getRecentProjects(): Promise<RecentProject[]>;          // lastOpened 내림차순
    removeRecentProject(dir: string): Promise<void>;
    showInExplorer(dir: string): Promise<void>;
    setDirty(dirty: boolean): void;
    onCloseRequested(cb: () => void): () => void;           // 반환값 = 구독 해제
    forceClose(): void;
    minimize(): void; toggleMaximize(): void; close(): void; isMaximized(): Promise<boolean>;
  }
  ```
- Produces (main 내부, electron import 없음 → 테스트 가능):
  - `sanitizeFolderName(name: string): string` — `\ / : * ? " < > |`와 제어문자를 `_`로, 앞뒤 공백과 끝의 `.` 제거, 결과가 비면 `untitled`
  - `uniqueChildName(name: string, exists: (candidate: string) => boolean): string` — `name`, `name (2)`, `name (3)`…
  - `touchRecent(list: RecentEntry[], dir: string, now: number): RecentEntry[]` — 중복 제거 후 맨 앞, 최대 20개. `RecentEntry { dir: string; lastOpened: number }`
  - `loadSettings(file: string): Promise<Settings>`, `saveSettings(file: string, s: Settings): Promise<void>` — `Settings { recent: RecentEntry[]; defaultProjectDir?: string }`, 파일 없거나 깨졌으면 `{ recent: [] }`
  - `createProject(opts: CreateProjectOptions): Promise<string /* dir */>` — 5.2.1절 순서. 차트 파일 이름은 `sanitizeFolderName(chartName.toLowerCase()) + '.chart.json'`. 실패하면 `fs.rm(dir, { recursive: true, force: true })` 후 다시 throw
  - `openProjectFiles(dir: string): Promise<ProjectFiles>` — `song.json` 없으면 `Error('song.json을 찾을 수 없어요')`. 차트는 `*.chart.json`을 이름순으로. `audioPath = path.join(dir, JSON.parse(songText).audio)` (audio가 문자열이 아니면 빈 문자열 → renderer 검증이 오류로 잡음)
  - `writeProjectFiles(dir, files)` — 각 파일을 `${name}.tmp-${process.pid}`에 쓰고 `fs.rename`
  - `summarizeProject(dir: string): Promise<Omit<RecentProject, 'lastOpened'>>` — 폴더·`song.json` 없거나 파싱 실패면 `missing: true`

- [ ] **Step 1: 실패하는 테스트 작성** (vitest, `beforeEach`에서 `os.tmpdir()` 아래 `fs.mkdtemp`로 `tmp`를 만들고 아무 바이트를 쓴 `mp3 = tmp/x.mp3`와 기본 `opts = { parentDir: tmp, title: 'p', artist: '', audioPath: mp3, bpm: 120, chartName: 'NORMAL', lanes: 4 }`를 준비)

```ts
it('폴더 이름 정리', () => {
  expect(sanitizeFolderName('진격의 승리: Remix?')).toBe('진격의 승리_ Remix_');
  expect(sanitizeFolderName('  song.  ')).toBe('song');
  expect(sanitizeFolderName('???')).toBe('___');
  expect(sanitizeFolderName('   ')).toBe('untitled');
});
it('중복 이름', () => {
  const taken = new Set(['a', 'a (2)']);
  expect(uniqueChildName('a', n => taken.has(n))).toBe('a (3)');
  expect(uniqueChildName('b', n => taken.has(n))).toBe('b');
});
it('최근 목록', () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ dir: `d${i}`, lastOpened: i }));
  const next = touchRecent(list, 'd5', 100);
  expect(next[0]).toEqual({ dir: 'd5', lastOpened: 100 });
  expect(next.filter(e => e.dir === 'd5')).toHaveLength(1);
  expect(touchRecent(list, 'new', 100)).toHaveLength(20);
});
it('프로젝트 만들고 다시 열기 (한글 이름)', async () => {
  const dir = await createProject({ parentDir: tmp, title: '진격의 승리: Remix?', artist: 'A', audioPath: mp3, bpm: 150, chartName: 'NORMAL', lanes: 7 });
  expect(path.basename(dir)).toBe('진격의 승리_ Remix_');
  const files = await openProjectFiles(dir);
  expect(path.basename(files.audioPath)).toBe('audio.mp3');
  const song = parseSong(files.songText);
  expect(song.ok && song.value.timing).toEqual([{ tick: 0, bpm: 150, beatsPerMeasure: 4 }]);
  expect(files.charts.map(c => c.file)).toEqual(['normal.chart.json']);
  const chart = parseChart(files.charts[0].text, 'normal.chart.json');
  expect(chart.ok && chart.value.lanes).toBe(7);
  expect(files.editorText).not.toBeNull();
});
it('같은 이름이면 (2)', async () => {
  await createProject({ ...opts, title: 'dup' });
  expect(path.basename(await createProject({ ...opts, title: 'dup' }))).toBe('dup (2)');
});
it('실패하면 폴더를 남기지 않음', async () => {
  await expect(createProject({ ...opts, title: 'bad', audioPath: path.join(tmp, 'none.mp3') })).rejects.toThrow();
  expect(existsSync(path.join(tmp, 'bad'))).toBe(false);
});
it('editor.json 없으면 null, song.json 없으면 오류', async () => {
  const dir = await createProject({ ...opts, title: 'noeditor' });
  await fs.rm(path.join(dir, 'editor.json'));
  expect((await openProjectFiles(dir)).editorText).toBeNull();
  await fs.rm(path.join(dir, 'song.json'));
  await expect(openProjectFiles(dir)).rejects.toThrow('song.json');
});
it('원자적 저장은 임시 파일을 남기지 않음', async () => {
  await writeProjectFiles(tmp, [{ name: 'x.chart.json', text: '{}\n' }]);
  expect(await fs.readFile(path.join(tmp, 'x.chart.json'), 'utf8')).toBe('{}\n');
  expect((await fs.readdir(tmp)).some(f => f.includes('.tmp-'))).toBe(false);
});
it('사라진 프로젝트 요약', async () => {
  expect((await summarizeProject(path.join(tmp, 'gone'))).missing).toBe(true);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/main` → FAIL**
- [ ] **Step 3: `folderName.ts`, `settings.ts`, `projectFs.ts` 구현**
- [ ] **Step 4: → PASS**
- [ ] **Step 5: `ipc.ts`(각 RcmApi 메서드를 `ipcMain.handle('rcm:<name>')`로; settings 파일은 `app.getPath('userData')/settings.json`; `createProject`·`openProject`는 최근 목록 갱신, `createProject`는 `defaultProjectDir = parentDir` 저장), `preload/index.ts`(`contextBridge.exposeInMainWorld('rcm', ...)`), `main/index.ts`의 닫기 가드(`setDirty`로 받은 값이 true면 `close` 이벤트에서 `preventDefault()` 후 `rcm:close-requested` 전송, `forceClose`면 가드 해제 후 `close()`) 구현**
- [ ] **Step 6: `npm run typecheck` → 오류 없음**
- [ ] **Step 7: 커밋** — `feat(editor): project file services and IPC api`

### Task 8: 시작 화면 + 새 프로젝트 만들기 창

**Files:**
- Create: `apps/editor/src/renderer/src/home/{HomeScreen,RecentTable,NewProjectDialog}.tsx` (+ css), `home/relativeTime.ts`
- Modify: `apps/editor/src/renderer/src/App.tsx`
- Test: `apps/editor/test/renderer/relativeTime.test.ts`

**Interfaces:**
- Consumes: Task 6 UI, Task 7 `window.rcm`
- Produces:
  - `App` 화면 상태: `{ screen: 'home' } | { screen: 'editor'; files: ProjectFiles }`. 홈에서 프로젝트를 만들거나 열면 `openProject(dir)` 결과로 editor 화면 전환. 이 Task에서 editor 화면은 Task 9가 채울 자리표시(`<div>{files.dir}</div>`)
  - `relativeTime(then: number, now: number): string` — 60초 미만 `방금 전`, 60분 미만 `N분 전`, 24시간 미만 `N시간 전`, 그 외 `N일 전`
  - `NewProjectDialog { open; onClose(); onCreated(dir: string) }`

5.2절 화면, 5.2.1절 표 그대로. 세부:
- 음악 파일 선택 후 `readAudio` → `new AudioContext().decodeAudioData`로 길이(`m:ss`) 표시, ▶/■ 미리듣기. 디코딩 실패 시 필드 아래 `--danger` 글자로 "이 파일은 재생할 수 없어요", 만들기 비활성
- 저장 위치 미리보기는 제목·위치가 바뀔 때마다 `resolveProjectDir` 호출 결과 표시
- 만들기 버튼은 제목·음악(디코딩 성공)·BPM>0·난이도 이름이 있을 때만 활성. 만드는 중엔 비활성 + "만드는 중…"
- `createProject` reject 시 `dialogs.alert('프로젝트를 만들지 못했어요', err.message)`
- 최근 목록: `missing`은 흐리게 + 난이도 칸 "찾을 수 없음"; 열기 시 `confirm`으로 목록 제거 여부 확인. 우클릭 `Menu`: 열기 / 탐색기에서 보기 / 목록에서 제거. 검색은 제목·아티스트 부분 일치(대소문자 무시). 비어 있으면 안내 문구 + 새 프로젝트 버튼
- `openProject` reject 시 `alert('프로젝트를 열 수 없어요', err.message)`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const now = 10 * 86400000;
it.each([[now - 5000, '방금 전'], [now - 5 * 60000, '5분 전'], [now - 3 * 3600000, '3시간 전'], [now - 2 * 86400000, '2일 전']])(
  '%#', (then, text) => expect(relativeTime(then, now)).toBe(text));
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/relativeTime.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 화면 구현, `npm run typecheck` → 오류 없음**
- [ ] **Step 4: `npm run dev`로 확인**: 첫 실행 시 빈 목록 안내 → 새 프로젝트(이름 `테스트: 곡?`, 실제 mp3/ogg 선택, 길이 표시·미리듣기) → 경로 미리보기가 `…\테스트_ 곡_` → 만들기 → 자리표시 화면 → 앱 재시작 후 목록에 표시, 우클릭 메뉴 3개 동작, 탐색기에서 폴더 삭제 후 "찾을 수 없음" 표시
- [ ] **Step 5: 커밋** — `feat(editor): home screen and new project dialog`

### Task 9: 프로젝트 문서 상태 + Undo 기록 + 저장

**Files:**
- Create: `apps/editor/src/renderer/src/editor/state/{doc,loadProject,history,dirty,store,useStore}.ts`
- Create: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (이 Task에서는 타이틀바 + 빈 본문 + 저장 단축키 없이 store 연결만)
- Modify: `App.tsx` (자리표시를 `EditorScreen`으로 교체)
- Test: `apps/editor/test/renderer/state/{loadProject,history,dirty}.test.ts`

**Interfaces:**
- Consumes: core 파서·직렬화, `ProjectFiles`
- Produces:
  - `interface ChartEntry { file: string; chart: Chart }`
  - `interface ProjectDoc { song: Song; charts: ChartEntry[]; editorData: EditorData }` — 항상 새 객체를 만들어 바꾼다(불변). 바뀌지 않은 부분은 같은 참조 유지
  - `getChart(doc: ProjectDoc, file: string): Chart` (없으면 throw)
  - `replaceChart(doc: ProjectDoc, file: string, chart: Chart): ProjectDoc`
  - `loadProject(files: ProjectFiles): { ok: true; doc: ProjectDoc } | { ok: false; errors: string[] }` — 모든 파일의 오류를 모아서 반환. `editorText`가 null이면 `emptyEditorData()`. 차트가 0개면 오류 `채보 파일(*.chart.json)이 없어요`
  - `class History { constructor(limit = 500); commit(entry: HistoryEntry): void; undo(): HistoryEntry | null; redo(): HistoryEntry | null; canUndo: boolean; canRedo: boolean }`, `interface HistoryEntry { label: string; before: ProjectDoc; after: ProjectDoc; chartFile?: string }`. 새 commit은 redo 스택을 비운다
  - `interface SavedRefs { song: Song; charts: Map<string, Chart>; editorData: EditorData }`, `savedRefsOf(doc): SavedRefs`
  - `dirtyFiles(doc: ProjectDoc, saved: SavedRefs): { name: string; text: string }[]` — 참조가 다른 파일만 직렬화 (`song.json`, `<file>`, `editor.json`)
  - `class EditorStore`:
    - 상태 `EditorState { dir: string; audioPath: string; doc: ProjectDoc; saved: SavedRefs; activeChart: string; tool: 'draw' | 'erase' | 'select'; snap: SnapDivision; playheadMs: number; pxPerMs: number; playing: boolean; mode: 'edit' | 'recording' | 'playtest'; selection: ReadonlySet<string>; panelOpen: boolean; panelTab: 'song' | 'timing' | 'chart'; hitsoundVolume: number; taps: number[] }` (기본값: 첫 차트, `'draw'`, `16`, `0`, `0.3`, `false`, `'edit'`, 빈 Set, `true`, `'song'`, `0.6`, `[]`). `clipboard: Clip | null`(기본 `null`)은 `Clip` 타입이 생기는 Task 15에서 추가한다
    - `getState(): EditorState`, `subscribe(fn): () => void`, `set(patch: Partial<EditorState>): void`
    - `apply(label: string, next: ProjectDoc | null, chartFile?: string): boolean` — null이면 false, 아니면 History에 commit하고 doc 교체
    - `undo()`, `redo()` — 항목에 `chartFile`이 있으면 `activeChart`를 그 파일로 전환, 선택 해제
    - `isDirty(): boolean` (= `dirtyFiles(...).length > 0`), 바뀔 때마다 `window.rcm.setDirty` 호출
    - `save(): Promise<void>` — `writeProjectFiles` 후 `saved = savedRefsOf(doc)`
  - `useEditor<T>(selector: (s: EditorState) => T): T` (`useSyncExternalStore`), `StoreContext`

`EditorScreen`: `loadProject` 실패 시 `alert('프로젝트를 열 수 없어요', errors)` 후 홈으로. 타이틀바 제목 = 곡 제목, dirty 표시. `onCloseRequested` → `choose`(저장 / 저장 안 함 / 취소) → 저장 성공 또는 저장 안 함이면 `forceClose()`. 저장 실패 시 `alert('저장하지 못했어요', err.message)`, 상태 유지.

- [ ] **Step 1: 실패하는 테스트 작성** (픽스처: `files()` 헬퍼가 정상 `ProjectFiles` 하나를 만든다)

```ts
it('정상 로드, editor.json 없으면 빈 마커', () => {
  const r = loadProject({ ...files(), editorText: null });
  expect(r.ok && r.doc.editorData.markers).toEqual([]);
});
it('여러 파일 오류를 모두 모음', () => {
  const r = loadProject({ ...files(), songText: '{', charts: [{ file: 'a.chart.json', text: '{' }] });
  expect(!r.ok && r.errors.join('\n')).toContain('song.json');
  expect(!r.ok && r.errors.join('\n')).toContain('a.chart.json');
});
it('history: undo/redo, 새 commit은 redo 삭제', () => {
  const h = new History();
  h.commit({ label: 'a', before: d0, after: d1 });
  h.commit({ label: 'b', before: d1, after: d2 });
  expect(h.undo()!.before).toBe(d1);
  h.commit({ label: 'c', before: d1, after: d3 });
  expect(h.canRedo).toBe(false);
});
it('history 최대 개수', () => {
  const h = new History(2);
  ['a', 'b', 'c'].forEach(label => h.commit({ label, before: d0, after: d0 }));
  expect(h.undo()!.label).toBe('c'); expect(h.undo()!.label).toBe('b'); expect(h.undo()).toBeNull();
});
it('dirty: 바뀐 파일만, 되돌리면 깨끗', () => {
  const saved = savedRefsOf(d0);
  expect(dirtyFiles(d0, saved)).toEqual([]);
  const d1 = { ...d0, song: { ...d0.song, title: 'x' } };
  expect(dirtyFiles(d1, saved).map(f => f.name)).toEqual(['song.json']);
  expect(dirtyFiles(d0, saved)).toEqual([]);   // undo로 같은 참조 복귀
});
it('dirty: 차트 하나만', () => {
  const d1 = replaceChart(d0, 'normal.chart.json', { ...getChart(d0, 'normal.chart.json'), level: 3 });
  expect(dirtyFiles(d1, savedRefsOf(d0)).map(f => f.name)).toEqual(['normal.chart.json']);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/state` → FAIL → 구현 → PASS**
- [ ] **Step 3: `EditorStore`, `useStore.ts`, `EditorScreen` 연결. `npm run typecheck` → 오류 없음**
- [ ] **Step 4: `npm run dev`로 확인**: 프로젝트 열면 제목 표시. 깨진 `song.json`(직접 `{` 하나로 수정)이 있는 프로젝트를 열면 오류 목록 모달 후 홈
- [ ] **Step 5: 커밋** — `feat(editor): project document state, history and saving`

### Task 10: 오디오 엔진 + 효과음 스케줄링

**Files:**
- Create: `apps/editor/src/renderer/src/editor/audio/{AudioEngine,hitsound,schedule}.ts`
- Test: `apps/editor/test/renderer/audio/schedule.test.ts`

**Interfaces:**
- Consumes: core `TimingMap`, `Chart`
- Produces:
  - `playbackStartParams(fromMs: number): { delaySec: number; offsetSec: number }` — `fromMs < 0`이면 `{ delaySec: -fromMs/1000, offsetSec: 0 }`, 아니면 `{ delaySec: 0, offsetSec: fromMs/1000 }`
  - `hitTimesForChart(chart: Chart, tm: TimingMap): number[]` — 각 노트 시작 ms, 오름차순, 같은 ms는 하나만
  - `collectDueHits(hits: number[], cursor: number, fromMs: number, untilMs: number): { due: number[]; cursor: number }` — `cursor`부터 `[fromMs, untilMs)`에 드는 것. `fromMs`보다 앞은 건너뜀
  - `createClickBuffer(ctx: BaseAudioContext): AudioBuffer` — 30ms, 2kHz 사인 × 지수 감쇠
  - `class AudioEngine { readonly ctx: AudioContext; load(data: ArrayBuffer): Promise<void>; readonly durationMs: number; readonly playing: boolean; play(fromMs: number): void; stop(): number /* 멈춘 위치 ms */; positionMs(): number; setHits(hits: number[]): void; setHitVolume(v: number /* 0~1 */): void; onEnded(cb: () => void): void; dispose(): void }`

  `positionMs()` = `(ctx.currentTime − startCtxTime) × 1000 + fromMs` (5.6절, 재생 중이 아니면 마지막 위치). 효과음: 재생 중 25ms 간격 `setInterval`로 `collectDueHits(hits, cursor, now, now + 100)`을 돌려 각 hit를 `ctx` 시각으로 바꿔 `AudioBufferSourceNode.start(when)` 예약. 곡 끝에 도달하면 `onEnded` 호출 후 정지. `play` 중 재호출하면 먼저 stop.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('음수 위치에서 재생 시작', () => {
  expect(playbackStartParams(-1500)).toEqual({ delaySec: 1.5, offsetSec: 0 });
  expect(playbackStartParams(2000)).toEqual({ delaySec: 0, offsetSec: 2 });
});
it('hit 시각: 시작 ms, 정렬, 중복 제거', () => {
  const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
  const chart = { formatVersion: 1, name: 'n', level: 1, lanes: 4, notes: [
    { tick: 480, lane: 1, type: 'tap' }, { tick: 0, lane: 0, type: 'hold', endTick: 960 }, { tick: 480, lane: 2, type: 'tap' } ] } as Chart;
  expect(hitTimesForChart(chart, tm)).toEqual([0, 500]);
});
it('due hits', () => {
  const hits = [0, 100, 200, 300];
  expect(collectDueHits(hits, 0, 50, 250)).toEqual({ due: [100, 200], cursor: 3 });
  expect(collectDueHits(hits, 3, 250, 350)).toEqual({ due: [300], cursor: 4 });
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/audio` → FAIL → `schedule.ts` 구현 → PASS**
- [ ] **Step 3: `hitsound.ts`, `AudioEngine.ts` 구현, `npm run typecheck`**
- [ ] **Step 4: 커밋** — `feat(editor): audio engine with scheduled hitsounds`

(재생 동작 확인은 화면이 생기는 Task 11에서 한다.)

### Task 11: 편집 화면 배치 + 타임라인 그리기 + 재생 + 단축키 표

**Files:**
- Create: `editor/timeline/{view,drawTimeline}.ts`, `editor/timeline/TimelineCanvas.tsx`, `editor/toolbar/BottomToolbar.tsx`, `editor/panels/RightPanel.tsx`, `editor/input/shortcuts.ts`
- Modify: `editor/EditorScreen.tsx`
- Test: `apps/editor/test/renderer/timeline/view.test.ts`, `apps/editor/test/renderer/input/shortcuts.test.ts`

**Interfaces:**
- Consumes: `EditorStore`, `AudioEngine`, core `TimingMap`·`gridLines`·`stepTick`
- Produces:
  - `interface TimelineView { playheadMs: number; pxPerMs: number; height: number }`, `PLAYHEAD_RATIO = 0.75`
  - `msToY(v: TimelineView, ms: number): number` = `v.height * 0.75 − (ms − v.playheadMs) * v.pxPerMs`; `yToMs(v, y)`는 역함수
  - `interface TimelineLayout { lanesX: number; laneWidth: number; lanes: number; waveX: number; waveWidth: number; labelX: number }`, `layoutTimeline(width: number, lanes: number): TimelineLayout` — `laneWidth 48`, `lanesX = round((width − lanes*48)/2)`, `waveWidth 64`, `waveX = lanesX − 8 − 64`, `labelX = lanesX + lanes*48 + 8`
  - `xToLane(l: TimelineLayout, x: number): number | null`
  - `clampZoom(pxPerMs: number): number` — `[0.05, 2]`
  - `stepPlayheadMs(tm: TimingMap, playheadMs: number, snap: SnapDivision, dir: 1 | -1): number` — `tm.tickToMs(stepTick(tm, tm.msToTick(playheadMs), snap, dir))`
  - `drawTimeline(ctx: CanvasRenderingContext2D, p: DrawParams): void` — `DrawParams { view; layout; tm: TimingMap; chart: Chart; snap: SnapDivision; selection: ReadonlySet<string>; markers: Marker[]; timing: TimingPoint[]; durationMs: number; peaks?: WaveformPeaks; preview?: Note | null; selectRect?: { lane0: number; lane1: number; tick0: number; tick1: number } | null }` (뒤 4개 필드는 이후 Task에서 채움, 이 Task에서는 생략 가능하게 optional로 선언)
  - `type Action = 'playPause' | 'save' | 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'delete' | 'mirror' | 'toolDraw' | 'toolErase' | 'toolSelect' | 'tap' | 'marker' | 'markerPrev' | 'markerNext' | 'record' | 'stop' | 'playtestHere' | 'playtestStart' | { kind: 'snap'; division: SnapDivision }`
  - `resolveShortcut(e: { code: string; ctrl: boolean; shift: boolean }, mode: 'edit' | 'recording' | 'playtest'): Action | null`

단축키 표 (`edit` 모드): `Space` playPause · `Ctrl+S` save · `Ctrl+Z` undo · `Ctrl+Y`, `Ctrl+Shift+Z` redo · `Ctrl+C/X/V` copy/cut/paste · `Delete` delete · `Ctrl+H` mirror · `KeyB` toolDraw · `KeyE` toolErase · `KeyV` toolSelect · `Digit1~6` snap 4/8/12/16/24/32 · `KeyT` tap · `KeyM` marker · `BracketLeft/Right` markerPrev/Next · `KeyR` record · `Escape` stop · `F5` playtestHere · `Shift+F5` playtestStart. `recording`·`playtest` 모드에서는 `Escape` → stop만, 나머지는 null. 텍스트 입력칸에 포커스가 있으면 EditorScreen이 단축키를 무시한다(`Escape` 제외).

화면: 5.3절 배치. 그리기 순서와 색은 6.3절: 점 패턴 배경(CSS) → 레인 바탕·구분선 → 격자(스냅/박/마디) → BPM 변경 선과 라벨 칩(`labelX`에 `150 BPM`) → 노트(tap 높이 10px 둥근 사각형, hold는 머리 + 60% 몸통) → 재생선. Canvas는 `devicePixelRatio` 반영, `ResizeObserver`로 크기 추적. 보이는 tick 범위만 그린다(`msToTick(yToMs(height))` ~ `msToTick(yToMs(0))`).
재생: `playPause` → 재생 중이 아니면 `engine.setHits(hitTimesForChart(...))`, `engine.play(playheadMs)`; rAF마다 `playheadMs = engine.positionMs()`. 정지하면 재생선은 멈춘 위치. 마우스 휠(정지 중) → `stepPlayheadMs` 한 칸씩, `Ctrl+휠` → `pxPerMs *= 1.1^(±1)` 후 `clampZoom`. 재생 중 휠은 무시.
하단 툴바: 5.3절 그룹 순서. 설정 버튼은 이번 범위에 들어갈 설정이 없으므로 만들지 않는다(효과음 볼륨은 곡 탭). 이 Task에서 동작: 난이도 탭(전환), 스냅 드롭다운, 재생/정지, 파일 메뉴(새 프로젝트 → `NewProjectDialog`, 열기 → 폴더 선택, 저장, 홈으로 → dirty면 `choose`). 도구·녹음·테스트 플레이 버튼은 렌더하되 각 Task에서 연결. 오른쪽 패널: `SegmentedControl` 3탭 + 접기 버튼(lucide `PanelRight`), 내용은 Task 12.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// view.test.ts
const v = { playheadMs: 1000, pxPerMs: 0.5, height: 800 };
it('재생선은 아래 1/4', () => expect(msToY(v, 1000)).toBe(600));
it('미래는 위쪽', () => expect(msToY(v, 1200)).toBe(500));
it('역변환', () => expect(yToMs(v, msToY(v, 1234))).toBeCloseTo(1234));
it('레이아웃', () => {
  const l = layoutTimeline(1000, 4);
  expect(l.lanesX).toBe(404); expect(l.waveX).toBe(332); expect(l.labelX).toBe(404 + 192 + 8);
  expect(xToLane(l, 404)).toBe(0); expect(xToLane(l, 595)).toBe(3); expect(xToLane(l, 403)).toBeNull(); expect(xToLane(l, 596)).toBeNull();
});
it('줌 범위', () => { expect(clampZoom(5)).toBe(2); expect(clampZoom(0.001)).toBe(0.05); });
it('재생선 한 칸 이동 (음수 구간 포함)', () => {
  const tm = new TimingMap([{ tick: 0, bpm: 120 }], 300);
  expect(stepPlayheadMs(tm, 300, 4, -1)).toBe(-200);
  expect(stepPlayheadMs(tm, -200, 4, 1)).toBe(300);
});

// shortcuts.test.ts
const k = (code: string, ctrl = false, shift = false) => ({ code, ctrl, shift });
it('편집 모드', () => {
  expect(resolveShortcut(k('Space'), 'edit')).toBe('playPause');
  expect(resolveShortcut(k('KeyZ', true, true), 'edit')).toBe('redo');
  expect(resolveShortcut(k('KeyV'), 'edit')).toBe('toolSelect');
  expect(resolveShortcut(k('KeyV', true), 'edit')).toBe('paste');
  expect(resolveShortcut(k('Digit4'), 'edit')).toEqual({ kind: 'snap', division: 16 });
  expect(resolveShortcut(k('F5', false, true), 'edit')).toBe('playtestStart');
});
it('녹음·테스트 플레이 모드는 Esc만', () => {
  for (const mode of ['recording', 'playtest'] as const) {
    expect(resolveShortcut(k('Escape'), mode)).toBe('stop');
    expect(resolveShortcut(k('KeyT'), mode)).toBeNull();
    expect(resolveShortcut(k('Space'), mode)).toBeNull();
  }
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/timeline apps/editor/test/renderer/input` → FAIL → `view.ts`, `shortcuts.ts` 구현 → PASS**
- [ ] **Step 3: `drawTimeline`, `TimelineCanvas`, `BottomToolbar`, `RightPanel` 껍데기, `EditorScreen` 배치·재생·휠·단축키 연결. `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: 새 프로젝트를 만들어 열면 5.3절 배치로 보임. Space로 재생 → 재생선 아래 1/4 고정으로 스크롤, 효과음은 노트가 없어 안 남. 휠로 박 단위 이동, Ctrl+휠 확대. 오프셋을 크게(예: 3000, `song.json` 직접 수정) 하고 처음 위치에서 재생해도 정상
- [ ] **Step 5: 커밋** — `feat(editor): editor layout, timeline rendering and playback`

### Task 12: 곡·타이밍·채보 패널 + BPM/오프셋 편집

**Files:**
- Create: `editor/commands/{timing,meta}.ts`, `editor/panels/{SongPanel,TimingPanel,ChartPanel}.tsx`
- Modify: `editor/panels/RightPanel.tsx`
- Test: `apps/editor/test/renderer/commands/{timing,meta}.test.ts`

**Interfaces:**
- Consumes: `ProjectDoc`, `getChart`, `replaceChart`, `EditorStore.apply`
- Produces (모두 `(doc, …) => ProjectDoc | null`, null = 거부):
  - `setOffset(doc, offsetMs: number)`
  - `addTimingPoint(doc, tick: number, bpm: number)` — tick 정렬 위치에 삽입, 같은 tick이 있으면 bpm만 교체. tick < 0이면 null
  - `updateTimingPoint(doc, index: number, patch: { bpm?: number; beatsPerMeasure?: number })` — bpm ≤ 0, beatsPerMeasure가 1~16 정수가 아니면 null
  - `removeTimingPoint(doc, index: number)` — index 0이면 null
  - `updateSong(doc, patch: Partial<Pick<Song, 'title' | 'artist' | 'previewStartMs'>>)`
  - `updateChartMeta(doc, file: string, patch: { name?: string; level?: number })` — name이 비면 null
  - `setChartLanes(doc, file: string, lanes: number): { doc: ProjectDoc; removed: number } | null` — 4~8 밖이면 null. `lane >= lanes`인 노트 삭제

패널 내용(5.3절, 6.2절 카드/행): 곡 탭 = 제목, 아티스트, 오프셋(`NumberField` suffix `ms` + `−10 −1 +1 +10` 버튼), 미리듣기 시작(`ms`, "현재 위치로" 버튼), 효과음 볼륨(0~100 `NumberField` → `hitsoundVolume`). 타이밍 탭 = BPM 변경 지점 목록(각 행: `마디:박` 위치 라벨, BPM, 박자 수, 삭제 아이콘 — 첫 행은 삭제 없음) + "현재 위치에 추가" 버튼(재생선 tick을 현재 스냅으로 맞추고 직전 구간 BPM으로 추가). 채보 탭 = 이름, 레벨(1~99), 레인 수(`SegmentedControl` 4~8; `removed > 0`이 예상되면 먼저 `confirm({ title: '레인 수 변경', message: 'N개 노트가 범위를 벗어나 삭제돼요', danger: true })`).
텍스트 입력은 blur 또는 Enter에서 한 번만 `apply`(타이핑 글자마다 기록하지 않음). Undo 라벨: `오프셋 변경`, `BPM 추가`, `BPM 수정`, `BPM 삭제`, `곡 정보 변경`, `채보 정보 변경`, `레인 수 변경`. 채보 관련 명령은 `chartFile` 지정.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('BPM 지점 추가: 정렬, 같은 tick은 교체', () => {
  let d = addTimingPoint(d0, 1920, 90)!;
  d = addTimingPoint(d, 960, 100)!;
  expect(d.song.timing.map(t => t.tick)).toEqual([0, 960, 1920]);
  d = addTimingPoint(d, 960, 110)!;
  expect(d.song.timing[1].bpm).toBe(110);
  expect(addTimingPoint(d0, -1, 100)).toBeNull();
});
it('첫 지점 삭제 불가, 잘못된 값 거부', () => {
  expect(removeTimingPoint(d0, 0)).toBeNull();
  expect(updateTimingPoint(d0, 0, { bpm: 0 })).toBeNull();
  expect(updateTimingPoint(d0, 0, { beatsPerMeasure: 0 })).toBeNull();
});
it('타이밍이 바뀌어도 노트 tick 유지', () => {
  const base = withNotes(d0, [{ tick: 960, lane: 0, type: 'tap' }]);
  const d = setOffset(base, 250)!;
  expect(getChart(d, 'normal.chart.json').notes[0].tick).toBe(960);
  expect(d.charts).toBe(base.charts);  // 차트 참조 그대로 → 차트는 dirty 아님
});
it('레인 수 줄이기', () => {
  const d = withNotes(d0, [{ tick: 0, lane: 6, type: 'tap' }, { tick: 0, lane: 1, type: 'tap' }], 7);
  const r = setChartLanes(d, 'normal.chart.json', 4)!;
  expect(r.removed).toBe(1);
  expect(getChart(r.doc, 'normal.chart.json').lanes).toBe(4);
  expect(setChartLanes(d, 'normal.chart.json', 9)).toBeNull();
});
it('채보 이름은 비울 수 없음', () => expect(updateChartMeta(d0, 'normal.chart.json', { name: '' })).toBeNull());
```

(테스트 헬퍼는 `apps/editor/test/renderer/fixtures.ts`에 모은다: Task 9의 `files()`와 `d0`(= `loadProject(files())`의 doc, 120 BPM·박자 4·오프셋 0, `normal.chart.json` 4키 빈 채보), 여기서 추가하는 `withNotes(doc, notes, lanes?)`, `withTiming(doc, timing)`.)

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/commands` → FAIL → 구현 → PASS**
- [ ] **Step 3: 패널 구현, `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: BPM을 실제 곡에 맞추고 오프셋을 ±로 조정하며 재생 → 박선이 박자에 맞음. BPM 변경 지점 추가 시 주황 선과 라벨. Ctrl+S 전이라도 파일 메뉴 저장으로 저장되고 `*`가 사라짐. Ctrl+Z는 Task 17에서 연결되므로 여기서는 확인하지 않음
- [ ] **Step 5: 커밋** — `feat(editor): song, timing and chart panels`

---

# 3단계 — 탭 BPM + 가이드 마커

### Task 13: 탭 BPM

**Files:**
- Create: `editor/commands/tap.ts`
- Modify: `editor/panels/TimingPanel.tsx`(탭 BPM 결과 카드), `editor/EditorScreen.tsx`(`tap` 액션)
- Test: `apps/editor/test/renderer/commands/tap.test.ts`

**Interfaces:**
- Consumes: core `estimateTempo`, `TempoEstimate`, `TimingMap`, `snapTick`; Task 12 `addTimingPoint`
- Produces:
  - `pushTap(taps: number[], ms: number): number[]` — 직전 탭보다 2000ms 넘게 뒤이거나 앞(되감기)이면 `[ms]`로 새로 시작
  - `applyTapWhole(doc, est: TempoEstimate): ProjectDoc` — `timing = [{ tick: 0, bpm: est.bpm, beatsPerMeasure: <기존 첫 지점 값 ?? 4> }]`, `offsetMs = Math.round(est.firstBeatMs)`
  - `applyTapFromHere(doc, est: TempoEstimate, firstTapMs: number): ProjectDoc` — `tick = snapTick(tm, tm.msToTick(firstTapMs), 4)`; tick ≤ 0이면 첫 지점 bpm만 교체, 아니면 `addTimingPoint(doc, tick, est.bpm)`

UI(5.8절): `T`는 재생 중일 때만 `taps = pushTap(taps, playheadMs)`. 타이밍 탭의 카드: 탭 4회 미만이면 "재생 중 T를 박자에 맞춰 4번 이상 눌러 주세요 (N회)", 이상이면 `BPM 150.21 · 첫 박 118ms · 편차 6ms · 탭 12회` + `곡 전체에 적용` / `이 지점부터 적용` / 초기화 버튼. `T`를 누르면 패널을 타이밍 탭으로 연다. 적용 Undo 라벨 `탭 BPM 적용`, 적용 후 `taps = []`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('2초 넘게 쉬거나 되감으면 새 세션', () => {
  expect(pushTap([0, 400], 800)).toEqual([0, 400, 800]);
  expect(pushTap([0, 400], 2401)).toEqual([2401]);
  expect(pushTap([0, 400], 100)).toEqual([100]);
});
const est = { bpm: 150, beatMs: 400, firstTapMs: 1100, firstBeatMs: 300, deviationMs: 0, count: 8 };
it('곡 전체에 적용', () => {
  const d = applyTapWhole(withTiming(d0, [{ tick: 0, bpm: 120, beatsPerMeasure: 3 }, { tick: 1920, bpm: 60 }]), est);
  expect(d.song.timing).toEqual([{ tick: 0, bpm: 150, beatsPerMeasure: 3 }]);
  expect(d.song.offsetMs).toBe(300);
});
it('이 지점부터 적용: 가장 가까운 박에 BPM 지점 추가', () => {
  // d0: 120 BPM, offset 0 → 1박 = 500ms. 첫 탭 2040ms ≈ tick 1958 → 박 스냅 1920
  const d = applyTapFromHere(d0, est, 2040);
  expect(d.song.timing).toEqual([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }, { tick: 1920, bpm: 150 }]);
});
it('이 지점부터 적용: 처음이면 첫 지점 BPM 교체', () => {
  expect(applyTapFromHere(d0, est, 100).song.timing).toEqual([{ tick: 0, bpm: 150, beatsPerMeasure: 4 }]);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/commands/tap.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: UI 연결, `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: BPM을 일부러 틀리게 둔 곡에서 T를 8번 이상 쳐서 곡 전체 적용 → 박선이 맞음
- [ ] **Step 5: 커밋** — `feat(editor): tap tempo`

### Task 14: 가이드 마커

**Files:**
- Create: `editor/commands/markers.ts`
- Modify: `editor/timeline/drawTimeline.ts`(청록 점선 `#22d3ee`), `editor/timeline/TimelineCanvas.tsx`(우클릭 삭제), `editor/panels/TimingPanel.tsx`(마커 목록), `editor/EditorScreen.tsx`(`marker`, `markerPrev`, `markerNext`)
- Test: `apps/editor/test/renderer/commands/markers.test.ts`

**Interfaces:**
- Produces:
  - `addMarker(doc, ms: number): ProjectDoc` — ms 오름차순 위치에 `{ ms, label: '' }` 삽입
  - `removeMarker(doc, index: number): ProjectDoc | null`, `renameMarker(doc, index: number, label: string): ProjectDoc | null`
  - `neighborMarkerMs(markers: Marker[], ms: number, dir: 1 | -1): number | null` — 현재 위치에서 1ms보다 멀리 있는 다음/이전 마커
  - `markerAtY(markers: Marker[], view: TimelineView, y: number, tolerancePx = 4): number /* index, 없으면 -1 */`

마커 명령은 `chartFile` 없음. Undo 라벨 `마커 추가`, `마커 삭제`, `마커 이름 변경`. 마커 목록 행: 시간(`m:ss.mmm`), 라벨 `TextField`, 이동 버튼(재생선을 그 위치로), 삭제. 우클릭 삭제는 노트 삭제보다 먼저 확인하지 않는다 — 노트가 있는 레인 영역 안의 우클릭은 노트 삭제(Task 16), 레인 밖(파형·라벨 영역)의 우클릭은 마커 삭제.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('정렬 삽입', () => {
  const d = addMarker(addMarker(d0, 500), 100);
  expect(d.editorData.markers.map(m => m.ms)).toEqual([100, 500]);
  expect(d.charts).toBe(d0.charts);
});
it('이웃 마커', () => {
  const ms = [{ ms: 100, label: '' }, { ms: 500, label: '' }];
  expect(neighborMarkerMs(ms, 100, 1)).toBe(500);
  expect(neighborMarkerMs(ms, 100.5, -1)).toBeNull();
  expect(neighborMarkerMs(ms, 300, -1)).toBe(100);
});
it('Y 위치로 찾기', () => {
  const v = { playheadMs: 0, pxPerMs: 1, height: 800 };
  expect(markerAtY([{ ms: 100, label: '' }], v, 600 - 100 + 3)).toBe(0);
  expect(markerAtY([{ ms: 100, label: '' }], v, 600 - 100 + 10)).toBe(-1);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/commands/markers.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: UI 연결, `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: 재생 중 M → 점선 표시, `[` `]` 이동, 라벨 편집 후 저장 → `editor.json`에 기록
- [ ] **Step 5: 커밋** — `feat(editor): guide markers`

---

# 4단계 — 노트 편집

### Task 15: 노트 편집 명령

**Files:**
- Create: `editor/commands/notes.ts`, `editor/commands/charts.ts`
- Modify: `editor/state/store.ts` (`clipboard: Clip | null` 필드 추가)
- Test: `apps/editor/test/renderer/commands/{notes,charts}.test.ts`

**Interfaces:**
- Consumes: core `notesOverlap`, `noteKey`, `Note`; `getChart`, `replaceChart`
- Produces (null = 겹침/범위 위반으로 거부, 문서 그대로):
  - `addNote(doc, file, note: Note): ProjectDoc | null` — lane 범위, tick ≥ 0, hold `endTick > tick`, 겹침 검사
  - `removeNotes(doc, file, keys: ReadonlySet<string>): ProjectDoc | null` — 지울 게 없으면 null
  - `moveNotes(doc, file, keys, dTick: number, dLane: number): { doc: ProjectDoc; keys: Set<string> } | null` — 옮긴 노트끼리는 겹침 검사에서 제외, 반환 keys는 이동 후 키
  - `mirrorNotes(doc, file, keys): { doc: ProjectDoc; keys: Set<string> } | null` — `lane → lanes − 1 − lane`
  - `interface Clip { notes: Note[] /* 첫 노트 tick이 0이 되도록 이동한 사본 */ }`
  - `copyNotes(chart: Chart, keys): Clip | null`
  - `pasteClip(doc, file, clip: Clip, atTick: number): { doc: ProjectDoc; keys: Set<string> } | null` — 레인이 현재 채보 범위를 넘거나 겹치면 전체 거부
  - `addChart(doc, name: string, lanes: number): { doc: ProjectDoc; file: string } | null` — 파일 이름은 이름 소문자에서 `\ / : * ? " < > |` → `_`, 이미 있으면 `name-2.chart.json`, `name-3…`. 이름이 비거나 lanes 범위 밖이면 null. 새 채보 level은 1

모든 결과 노트 배열은 tick→lane 정렬 유지.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const F = 'normal.chart.json';
const tap = (tick: number, lane: number): Note => ({ tick, lane, type: 'tap' });
it('추가: 겹침·범위 거부', () => {
  const d = addNote(d0, F, { tick: 0, lane: 0, type: 'hold', endTick: 960 })!;
  expect(addNote(d, F, tap(480, 0))).toBeNull();
  expect(addNote(d, F, tap(480, 1))).not.toBeNull();
  expect(addNote(d0, F, tap(0, 4))).toBeNull();   // 4키
  expect(addNote(d0, F, tap(-120, 0))).toBeNull();
  expect(addNote(d0, F, { tick: 480, lane: 0, type: 'hold', endTick: 480 })).toBeNull();
});
it('이동: 자기들끼리는 겹침 아님, 음수 tick 거부', () => {
  const d = withNotes(d0, [tap(0, 0), tap(480, 0)]);
  const r = moveNotes(d, F, new Set(['0:0', '0:480']), 480, 1)!;
  expect([...r.keys].sort()).toEqual(['1:480', '1:960']);
  expect(moveNotes(d, F, new Set(['0:0']), -480, 0)).toBeNull();
  expect(moveNotes(d, F, new Set(['0:0']), 480, 0)).toBeNull();   // 0:480과 겹침
});
it('좌우 반전 (7키)', () => {
  const d = withNotes(d0, [tap(0, 0), tap(0, 3)], 7);
  expect(getChart(mirrorNotes(d, F, new Set(['0:0', '3:0']))!.doc, F).notes.map(noteKey)).toEqual(['3:0', '6:0']);
});
it('복사·붙여넣기는 첫 노트가 재생선 위치', () => {
  const clip = copyNotes(getChart(withNotes(d0, [tap(960, 1), tap(1440, 2)]), F), new Set(['1:960', '2:1440']))!;
  expect(clip.notes.map(noteKey)).toEqual(['1:0', '2:480']);
  const r = pasteClip(d0, F, clip, 1920)!;
  expect(getChart(r.doc, F).notes.map(noteKey)).toEqual(['1:1920', '2:2400']);
});
it('붙여넣기: 레인 넘침 거부', () => {
  const clip = { notes: [tap(0, 6)] };
  expect(pasteClip(d0, F, clip, 0)).toBeNull();
});
it('난이도 추가: 파일 이름 중복 회피', () => {
  const r = addChart(d0, 'Normal', 7)!;
  expect(r.file).toBe('normal-2.chart.json');
  expect(getChart(r.doc, r.file).lanes).toBe(7);
  expect(addChart(d0, '', 4)).toBeNull();
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/commands/notes.test.ts apps/editor/test/renderer/commands/charts.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 커밋** — `feat(editor): note editing commands`

### Task 16: 그리기·지우기 도구 + 노트 hit-test

**Files:**
- Create: `editor/timeline/hitTest.ts`, `editor/timeline/tools.ts`
- Modify: `editor/timeline/TimelineCanvas.tsx`, `editor/timeline/drawTimeline.ts`(미리보기 노트 50% 투명, 선택 테두리 `--accent` 2px), `editor/toolbar/BottomToolbar.tsx`(도구 버튼 연결)
- Test: `apps/editor/test/renderer/timeline/hitTest.test.ts`

**Interfaces:**
- Consumes: `TimelineView`, `TimelineLayout`, `msToY`, `yToMs`, `xToLane`, core `snapTick`; Task 15 명령
- Produces:
  - `NOTE_HEIGHT = 10`
  - `pointerToCell(tm, view, layout, x, y, snap): { lane: number; tick: number } | null` — 레인 밖이면 null, tick은 스냅 후 `Math.max(0, …)`
  - `hitTestNote(notes: Note[], tm, view, layout, x, y): Note | null` — 머리 사각형(세로 중앙이 노트 y, 높이 10) 또는 hold 몸통(머리 y ~ 끝 y) 안이면 그 노트. 여러 개면 tick이 큰 것
  - `tools.ts`: `createToolController(store: EditorStore, getGeometry: () => { tm; view; layout }): { onPointerDown(e); onPointerMove(e); onPointerUp(e); onContextMenu(e) }` — 아래 규칙

규칙(5.4절):
- 그리기: 좌클릭 down = 시작 셀. move 중 같은 레인에서 위로 끌면 `preview = hold(endTick = 현재 셀 tick)`, 아니면 tap. up에서 `addNote` → null이면 아무 일도 안 함(토스트 없음). 이미 노트가 있는 자리 클릭도 같은 이유로 무시. Undo 라벨 `노트 추가`
- 우클릭(모든 도구): 레인 안이면 `hitTestNote` 노트 삭제(`노트 삭제`), 레인 밖이면 Task 14 마커 삭제
- 지우기: down~up 동안 지나간 노트 키를 모아 미리보기에서 숨기고, up에서 `removeNotes` 한 번(`노트 지우기`)
- 재생 중에는 편집 입력 무시

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);   // 1 tick = 500/480 ms
const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 };   // 480 tick = 240px
const layout = layoutTimeline(1000, 4);                      // lanesX 404
it('포인터 → 셀', () => {
  expect(pointerToCell(tm, view, layout, 410, 600, 4)).toEqual({ lane: 0, tick: 0 });
  expect(pointerToCell(tm, view, layout, 460, 600 - 230, 4)).toEqual({ lane: 1, tick: 480 });
  expect(pointerToCell(tm, view, layout, 460, 700, 4)).toEqual({ lane: 1, tick: 0 });   // 음수는 0
  expect(pointerToCell(tm, view, layout, 100, 600, 4)).toBeNull();
});
it('노트 hit-test', () => {
  const notes: Note[] = [{ tick: 0, lane: 0, type: 'hold', endTick: 960 }, { tick: 480, lane: 1, type: 'tap' }];
  expect(hitTestNote(notes, tm, view, layout, 410, 604)).toBe(notes[0]);        // 머리
  expect(hitTestNote(notes, tm, view, layout, 410, 600 - 300)).toBe(notes[0]);  // 몸통
  expect(hitTestNote(notes, tm, view, layout, 460, 600 - 240 + 4)).toBe(notes[1]);
  expect(hitTestNote(notes, tm, view, layout, 460, 600 - 240 + 8)).toBeNull();
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/timeline/hitTest.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: `tools.ts`와 캔버스 연결, `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: 클릭으로 tap, 위로 드래그로 hold(미리보기 보임), 겹치는 곳은 안 찍힘, 우클릭 삭제, 지우기 도구로 드래그 삭제, 재생 시 노트에서 효과음
- [ ] **Step 5: 커밋** — `feat(editor): draw and erase tools`

### Task 17: 선택 도구 + 편집 단축키 + 난이도 추가

**Files:**
- Modify: `editor/timeline/tools.ts`, `editor/timeline/hitTest.ts`, `editor/timeline/drawTimeline.ts`(선택 사각형 `--accent-soft` 채우기 + `--accent` 1px), `editor/EditorScreen.tsx`, `editor/toolbar/BottomToolbar.tsx`
- Test: `apps/editor/test/renderer/timeline/hitTest.test.ts`(추가)

**Interfaces:**
- Consumes: Task 15 명령, Task 11 `resolveShortcut`
- Produces:
  - `notesInRect(notes: Note[], lane0: number, lane1: number, tick0: number, tick1: number): Set<string>` — 머리가 범위 안(양 끝 포함, 인자 순서 무관)인 노트 키
  - 선택 도구: 빈 곳 드래그 = 사각 선택(Shift면 기존 선택에 추가), Shift+클릭 = 토글, 선택된 노트 위에서 드래그 = `moveNotes`(스냅 단위 tick 차이와 레인 차이, up에서 한 번 apply, 실패 시 원위치), 빈 곳 클릭 = 선택 해제
  - 단축키 처리(`EditorScreen`): `save`, `undo`, `redo`, `copy`(클립보드 저장 + 토스트 `N개 복사`), `cut`(복사 + `removeNotes`, 라벨 `잘라내기`), `paste`(`pasteClip` at `snapTick(msToTick(playheadMs))`; null이면 토스트 `여기에는 붙여넣을 수 없어요 (겹치거나 레인 수가 달라요)`; 성공하면 붙인 노트 선택), `delete`, `mirror`(라벨 `좌우 반전`), 도구 3개, 스냅 6개
  - 난이도 추가: 툴바 `+` → `Modal`(이름 `TextField`, 레인 수 `SegmentedControl`) → `addChart` → 그 난이도로 전환. Undo 라벨 `난이도 추가` (`chartFile` 없음 — Undo 시 activeChart가 사라지면 첫 차트로 전환하도록 `EditorStore.undo`에서 처리)

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
it('사각 선택은 머리 기준', () => {
  const notes: Note[] = [{ tick: 0, lane: 0, type: 'hold', endTick: 1920 }, { tick: 480, lane: 2, type: 'tap' }, { tick: 960, lane: 3, type: 'tap' }];
  expect(notesInRect(notes, 3, 1, 960, 240)).toEqual(new Set(['2:480']));
  expect(notesInRect(notes, 0, 0, 480, 1920)).toEqual(new Set());
});
```

- [ ] **Step 2: → FAIL → 구현 → PASS**
- [ ] **Step 3: 도구·단축키·난이도 추가 연결. `EditorStore.undo/redo`에 "activeChart가 doc에 없으면 첫 차트" 처리 추가. `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: 사각 선택 → Ctrl+C → 재생선 이동 → Ctrl+V, Ctrl+H 반전, 드래그 이동, Delete, Ctrl+Z/Ctrl+Y로 모두 되돌리기, 숫자키 스냅 전환, 난이도 추가 후 탭 전환, 다른 난이도 편집을 Undo하면 그 난이도로 전환, Ctrl+S 후 `*` 사라지고 Undo하면 다시 `*`
- [ ] **Step 5: `npm test` 전체 PASS 확인 후 커밋** — `feat(editor): selection, clipboard, shortcuts and difficulty management`

---

# 5단계 — 파형 + 미니맵

### Task 18: 파형

**Files:**
- Create: `editor/audio/waveform.ts`
- Modify: `editor/timeline/drawTimeline.ts`, `editor/EditorScreen.tsx`(오디오 로드 후 peaks 계산해 store 밖 ref로 보관)
- Test: `apps/editor/test/renderer/audio/waveform.test.ts`

**Interfaces:**
- Produces:
  - `interface WaveformPeaks { blockSize: number; sampleRate: number; peaks: Float32Array }`
  - `computePeaks(channels: Float32Array[], sampleRate: number, blockSize = 256): WaveformPeaks` — 블록마다 `max |채널 평균|`
  - `peakInRange(w: WaveformPeaks, fromMs: number, toMs: number): number` — 범위에 걸친 블록들의 최댓값, 범위가 곡 밖이면 0

그리기(5.12절, 6.3절): `waveX`~`waveX+waveWidth` 띠에 화면 1px 행마다 `peakInRange` → 가운데 기준 좌우 대칭 막대. 재생선보다 과거(아래)는 `#555555`, 미래는 `#3a3a3a`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('채널 평균의 블록 최대', () => {
  const l = new Float32Array([0.5, -1, 0, 0.2]); const r = new Float32Array([0.5, 1, 0, -0.6]);
  expect(Array.from(computePeaks([l, r], 1000, 2).peaks)).toEqual([0.5, 0.2]);
});
it('범위 최대, 곡 밖은 0', () => {
  const w = { blockSize: 2, sampleRate: 1000, peaks: new Float32Array([0.1, 0.9, 0.3]) };  // 블록 하나 = 2ms
  expect(peakInRange(w, 0, 1.9)).toBeCloseTo(0.1);
  expect(peakInRange(w, 0, 4)).toBeCloseTo(0.9);
  expect(peakInRange(w, -10, -5)).toBe(0);
  expect(peakInRange(w, 100, 200)).toBe(0);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/audio/waveform.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 그리기 연결, `npm run dev`로 확인**: 파형이 박선과 함께 보이고 확대/축소해도 끊기지 않음
- [ ] **Step 4: 커밋** — `feat(editor): waveform`

### Task 19: 미니맵

**Files:**
- Create: `editor/minimap/minimap.ts`, `editor/minimap/Minimap.tsx`
- Modify: `editor/EditorScreen.tsx` (타임라인 왼쪽 아래 겹쳐 배치)
- Test: `apps/editor/test/renderer/minimap.test.ts`

**Interfaces:**
- Consumes: `hitTimesForChart`, `TimelineView`, `clampZoom`
- Produces:
  - `densityBuckets(hitMs: number[], durationMs: number, buckets: number): number[]` — 구간별 개수, 곡 밖 hit는 버림
  - `minimapYToMs(y: number, height: number, durationMs: number): number` — 아래 = 0ms, 위 = 곡 끝, `[0, durationMs]`로 자름
  - `DEFAULT_PX_PER_MS = 0.3`
  - `<Minimap />` — 크기 120×180, `--bg-card` + `--radius-md`. 위쪽 줄: `+` `−` 버튼(`pxPerMs`를 ×1.25 / ÷1.25 후 clampZoom), `Math.round(pxPerMs / 0.3 * 100)%`. 아래 캔버스: 버킷 밀도를 가로 막대(`--text-muted` 투명도로), 현재 보이는 시간 범위를 `--accent` 테두리 상자. 클릭/드래그 → `playheadMs = minimapYToMs(...)` (재생 중이면 무시)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('밀도', () => expect(densityBuckets([0, 10, 50, 99, 150], 100, 2)).toEqual([2, 2]));
it('y → ms', () => {
  expect(minimapYToMs(180, 180, 60000)).toBe(0);
  expect(minimapYToMs(0, 180, 60000)).toBe(60000);
  expect(minimapYToMs(-5, 180, 60000)).toBe(60000);
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/minimap.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 화면 연결, `npm run dev`로 확인**: 노트 많은 구간이 진하게, 클릭으로 이동, 보이는 범위 상자가 스크롤을 따라감
- [ ] **Step 4: 커밋** — `feat(editor): minimap`

---

# 6단계 — 실시간 녹음

### Task 20: 레인 키 배치 + 녹음

**Files:**
- Create: `packages/playfield/src/keymap.ts` (index에서 export), `apps/editor/src/renderer/src/editor/input/recorder.ts`, `editor/commands/record.ts`
- Modify: `editor/EditorScreen.tsx`, `editor/toolbar/BottomToolbar.tsx`(녹음 버튼: 녹음 중 `--danger` 점 + "REC")
- Test: `packages/playfield/test/keymap.test.ts`, `apps/editor/test/renderer/input/recorder.test.ts`, `apps/editor/test/renderer/commands/record.test.ts`

**Interfaces:**
- Produces (`@rcm/playfield`):
  - `LANE_KEYS: Record<4 | 5 | 6 | 7 | 8, readonly string[]>` — Global Constraints의 code 값 그대로
  - `laneKeyLabel(code: string): string` — `KeyD` → `D`, `Space` → `Space`, `Semicolon` → `;`
  - `laneForCode(lanes: number, code: string): number | null`
- Produces (editor):
  - `interface Press { lane: number; downMs: number; upMs: number }`
  - `class Recorder { constructor(lanes: number); keyDown(code: string, ms: number): void /* 이미 눌린 레인이면 무시(키 반복) */; keyUp(code: string, ms: number): void; finish(endMs: number): Press[] /* 아직 눌린 키는 endMs에서 뗀 것으로 */ }`
  - `quantizePresses(presses: Press[], tm: TimingMap, snap: SnapDivision): Note[]` — `tick = snapTick(tm, tm.msToTick(downMs), snap)`; `tm.msToTick(upMs) − tm.msToTick(downMs) >= snapStepTicks(snap)`이면 hold(`endTick = max(snapTick(up), tick + step)`), 아니면 tap. tick < 0인 것은 버림
  - `mergeRecorded(doc, file, notes: Note[]): { doc: ProjectDoc; added: number; dropped: number }` — 기존 노트나 앞서 넣은 녹음 노트와 겹치면 버림(앞의 음수 tick 버림은 quantize 단계라 여기 dropped에 포함 안 함)

동작(5.10절): `record` → `mode = 'recording'`, 재생선에서 재생 시작, 윈도우 keydown/keyup을 `Recorder`로(`e.repeat`도 Recorder가 무시하지만 `preventDefault`는 항상). `stop`(Esc) 또는 곡 끝 → `finish(positionMs)` → quantize → merge → `apply('녹음', doc, activeChart)` (added 0이면 apply 안 함) → 토스트 `N개 노트 추가` + (dropped > 0이면 ` · M개는 겹쳐서 버림`) → `mode = 'edit'`. 녹음 중에는 타임라인 위에 레인별 키 라벨과 눌린 레인 강조를 그린다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// keymap.test.ts
it('레인 수와 키 개수가 같음', () => { for (const n of [4, 5, 6, 7, 8] as const) expect(LANE_KEYS[n]).toHaveLength(n); });
it('7키', () => expect(LANE_KEYS[7].map(laneKeyLabel)).toEqual(['S', 'D', 'F', 'Space', 'J', 'K', 'L']));
it('8키 세미콜론', () => expect(laneForCode(8, 'Semicolon')).toBe(7));
it('없는 키', () => expect(laneForCode(4, 'KeyA')).toBeNull());

// recorder.test.ts
it('키 반복은 하나의 누름', () => {
  const r = new Recorder(4);
  r.keyDown('KeyD', 100); r.keyDown('KeyD', 130); r.keyDown('KeyD', 160); r.keyUp('KeyD', 900);
  expect(r.finish(1000)).toEqual([{ lane: 0, downMs: 100, upMs: 900 }]);
});
it('끝날 때 눌려 있던 키', () => {
  const r = new Recorder(4);
  r.keyDown('KeyK', 200);
  expect(r.finish(700)).toEqual([{ lane: 3, downMs: 200, upMs: 700 }]);
});
it('레인 키가 아니면 무시', () => {
  const r = new Recorder(4); r.keyDown('KeyA', 0); r.keyUp('KeyA', 10);
  expect(r.finish(20)).toEqual([]);
});

// record.test.ts — d0: 120 BPM, offset 0 → 1 tick = 500/480 ms, 1/16 한 칸 = 120 tick = 125ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
it('스냅 정렬, 짧으면 tap, 한 칸 이상이면 hold', () => {
  expect(quantizePresses([{ lane: 0, downMs: 510, upMs: 560 }], tm, 16)).toEqual([{ tick: 480, lane: 0, type: 'tap' }]);
  expect(quantizePresses([{ lane: 1, downMs: 500, upMs: 1000 }], tm, 16)).toEqual([{ tick: 480, lane: 1, type: 'hold', endTick: 960 }]);
});
it('음수 tick 버림', () => expect(quantizePresses([{ lane: 0, downMs: -300, upMs: -250 }], tm, 16)).toEqual([]));
it('겹치면 기존 유지', () => {
  const d = withNotes(d0, [{ tick: 480, lane: 0, type: 'tap' }]);
  const r = mergeRecorded(d, 'normal.chart.json', [{ tick: 480, lane: 0, type: 'tap' }, { tick: 480, lane: 1, type: 'tap' }, { tick: 480, lane: 1, type: 'tap' }]);
  expect(r.added).toBe(1); expect(r.dropped).toBe(2);
});
```

- [ ] **Step 2: `npx vitest run packages/playfield apps/editor/test/renderer/input/recorder.test.ts apps/editor/test/renderer/commands/record.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 녹음 모드 연결, `npm run typecheck`**
- [ ] **Step 4: `npm run dev`로 확인**: 4키·7키 채보에서 R → 키보드로 치기(7키 Space 포함) → Esc → 노트 생성·토스트, 꾹 누른 키는 롱노트 하나, Ctrl+Z 한 번에 녹음 전체가 사라짐
- [ ] **Step 5: 커밋** — `feat: lane keymap and realtime recording`

---

# 7단계 — 테스트 플레이

### Task 21: 판정 로직

**Files:**
- Create: `packages/playfield/src/judge.ts`, `packages/playfield/src/playState.ts`
- Test: `packages/playfield/test/judge.test.ts`, `packages/playfield/test/playState.test.ts`

**Interfaces:**
- Consumes: core `Chart`, `TimingMap`
- Produces:
  - `JUDGE_WINDOWS = { perfect: 40, great: 80, good: 120 } as const`, `HOLD_RELEASE_TOLERANCE = 120`
  - `type Judgement = 'perfect' | 'great' | 'good' | 'miss'`
  - `judgeDelta(deltaMs: number): Judgement | null` — `|d| ≤ 40` perfect, `≤ 80` great, `≤ 120` good, 그 밖은 null(치지 않은 것으로 봄). 경계 포함
  - `interface JudgeEvent { lane: number; judgement: Judgement; part: 'head' | 'tail'; ms: number }`
  - `class PlayState { constructor(chart: Chart, tm: TimingMap, fromMs: number /* 시작 ms보다 앞의 노트는 제외 */); press(lane: number, ms: number): JudgeEvent[]; release(lane: number, ms: number): JudgeEvent[]; update(ms: number): JudgeEvent[]; readonly combo: number; readonly maxCombo: number; readonly counts: Record<Judgement, number> }`

규칙(4절): press는 그 레인에서 아직 판정 안 된 가장 이른 머리 중 `judgeDelta`가 null이 아닌 것을 판정. hold 머리를 miss가 아닌 판정으로 치면 누르는 중 상태. release 시 누르는 중인 hold가 있으면 `ms < endMs − 120` → tail miss, 아니면 tail perfect. update(ms): 누르는 중 hold가 `ms ≥ endMs`면 tail perfect. 판정 안 된 머리가 `ms > startMs + 120`이면 head miss (hold면 tail miss도 함께). miss는 combo를 0으로, 나머지는 +1.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it.each([[0, 'perfect'], [40, 'perfect'], [-41, 'great'], [80, 'great'], [120, 'good'], [-120, 'good'], [121, null]])(
  '판정 경계 %d', (d, j) => expect(judgeDelta(d)).toBe(j));

// playState.test.ts — tm: 120 BPM, offset 0 → tick 480 = 500ms
const chart = (notes: Note[]): Chart => ({ formatVersion: 1, name: 't', level: 1, lanes: 4, notes });
it('tap 판정과 콤보', () => {
  const s = new PlayState(chart([{ tick: 480, lane: 0, type: 'tap' }, { tick: 960, lane: 0, type: 'tap' }]), tm, 0);
  expect(s.press(0, 530)).toEqual([{ lane: 0, judgement: 'perfect', part: 'head', ms: 530 }]);
  expect(s.press(0, 700)).toEqual([]);   // 다음 노트(1000ms)까지 300ms → 판정 밖
  expect(s.combo).toBe(1);
});
it('지나간 노트는 miss', () => {
  const s = new PlayState(chart([{ tick: 480, lane: 0, type: 'tap' }]), tm, 0);
  expect(s.update(620)).toEqual([]);
  expect(s.update(621)).toEqual([{ lane: 0, judgement: 'miss', part: 'head', ms: 621 }]);
  expect(s.combo).toBe(0);
});
it('롱노트: 일찍 떼면 tail miss, 끝 −120 이후 떼면 성공', () => {
  const hold = chart([{ tick: 480, lane: 1, type: 'hold', endTick: 1440 }]);   // 500 ~ 1500ms
  const a = new PlayState(hold, tm, 0);
  a.press(1, 500);
  expect(a.release(1, 1379)).toEqual([{ lane: 1, judgement: 'miss', part: 'tail', ms: 1379 }]);
  const b = new PlayState(hold, tm, 0);
  b.press(1, 500);
  expect(b.release(1, 1380)).toEqual([{ lane: 1, judgement: 'perfect', part: 'tail', ms: 1380 }]);
  const c = new PlayState(hold, tm, 0);
  c.press(1, 500);
  expect(c.update(1500)).toEqual([{ lane: 1, judgement: 'perfect', part: 'tail', ms: 1500 }]);
});
it('놓친 롱노트는 head·tail 둘 다 miss', () => {
  const s = new PlayState(chart([{ tick: 480, lane: 1, type: 'hold', endTick: 1440 }]), tm, 0);
  expect(s.update(700).map(e => e.part)).toEqual(['head', 'tail']);
});
it('시작 위치 이전 노트 제외', () => {
  const s = new PlayState(chart([{ tick: 480, lane: 0, type: 'tap' }]), tm, 600);
  expect(s.update(5000)).toEqual([]);
});
```

- [ ] **Step 2: `npx vitest run packages/playfield` → FAIL → 구현 → PASS**
- [ ] **Step 3: 커밋** — `feat(playfield): judgement and play state`

### Task 22: 플레이 화면 + 에디터 테스트 플레이

**Files:**
- Create: `packages/playfield/src/Playfield.ts`, `apps/editor/src/renderer/src/editor/playtest/PlaytestOverlay.tsx`
- Modify: `packages/playfield/src/index.ts`, `editor/EditorScreen.tsx`, `editor/toolbar/BottomToolbar.tsx`(테스트 플레이 버튼)

**Interfaces:**
- Consumes: `PlayState`, `LANE_KEYS`, `laneForCode`, `laneKeyLabel`, core `TimingMap`
- Produces:
  - `interface PlayfieldOptions { chart: Chart; tm: TimingMap; getTimeMs: () => number; fromMs: number; speed: number /* 1~10, 기본 5 */; colors?: Partial<PlayfieldColors> }`
  - `class Playfield { constructor(canvas: HTMLCanvasElement, opts: PlayfieldOptions); start(): void /* rAF 루프 + window keydown/keyup */; stop(): void; setSpeed(speed: number): void; readonly state: PlayState }`
  - 화면: 레인 너비 64px 가운데 정렬, 판정선은 아래에서 120px, 노트는 `pxPerMs = speed * 0.1`로 위에서 떨어짐(hold 몸통 포함), 레인 아래 키 라벨, 누른 레인 밝게, 판정선 위에 마지막 판정 문구(PERFECT/GREAT/GOOD/MISS, 400ms 표시)와 콤보. 기본 색은 6.3절 노트 색, 판정선 `--accent`
  - `<PlaytestOverlay fromMs: number; onExit(): void />` — 화면 전체를 덮는 `--bg-app` 캔버스, 오른쪽 위에 `속도 5.0 (↑/↓)` · `Esc 종료` · 판정별 개수

동작(5.11절): `playtestHere` → `fromMs = playheadMs`, `playtestStart` → `fromMs = 0`과 첫 노트 시각 중 작은 값. 실제 재생은 `fromMs − 1500`부터(준비 시간, `AudioEngine.play`가 음수 처리), `mode = 'playtest'`, 효과음 끔(`setHits([])`). `↑/↓`로 속도 ±0.5(1~10). Esc 또는 곡 끝 → 정지, `playheadMs`를 원래 재생선 위치로 되돌림, `mode = 'edit'`.

- [ ] **Step 1: `Playfield.ts`, `PlaytestOverlay.tsx` 구현 및 연결, `npm run typecheck`**
- [ ] **Step 2: `npm run dev`로 확인**: F5 → 재생선 위치부터 1.5초 준비 후 플레이, 판정·콤보 표시, 롱노트 몸통, ↑/↓ 속도, Esc → 원래 위치. Shift+F5 → 처음부터. 7키 채보에서도 Space 레인 동작
- [ ] **Step 3: `npm test` 전체 PASS 후 커밋** — `feat: playfield renderer and editor playtest`

---

# 마무리

### Task 23: 설치 파일 빌드 + 전체 점검

**Files:**
- Create: `apps/editor/electron-builder.yml`
- Modify: `apps/editor/package.json` (scripts `build`: `electron-vite build`, `dist`: `npm run build && electron-builder --win nsis`), 루트 `package.json` (`dist`: `npm -w @rcm/editor run dist`), `README.md`(개발 실행·테스트·설치 파일 만드는 명령 3줄)

설정: `appId: com.rcm.chart-editor`, `productName: RCM Chart Editor`, `directories.output: dist`, `files: ["out/**"]`, `nsis: { oneClick: false, allowToChangeInstallationDirectory: true }`. 의존성 `npm -w @rcm/editor i -D electron-builder`.

- [ ] **Step 1: 설정 작성 후 `npm run dist` → `apps/editor/dist/RCM Chart Editor Setup *.exe` 생성 확인**
- [ ] **Step 2: 설치 파일로 설치 후 실행 → 성공 기준(0절) 세 가지를 순서대로 확인**: 새 프로젝트 만들기 → 탭 BPM으로 BPM·오프셋 맞추기 → 노트 찍기 + 녹음 → 저장 → 앱 재시작 후 최근 목록에서 열기 → 테스트 플레이
- [ ] **Step 3: `npm test`, `npm run typecheck` 모두 통과 확인**
- [ ] **Step 4: 커밋** — `chore: windows installer build`
