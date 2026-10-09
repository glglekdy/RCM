# 이름 붙은 트랙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채보의 "레인 수 + 레인 번호" 모델을 "이름 붙은 트랙 + 트랙 프리셋" 모델로 바꾼다.

**Architecture:** core의 `Chart`가 `tracks: Track[]`를 갖고 `Note`는 `track: string`(트랙 id)을 가리킨다. 화면 계산(타임라인 열, 플레이 화면 열, 사각 선택, 이동)은 계속 "트랙 위치(0..n-1)"로 하고 채보와 만나는 곳에서만 id로 바꾼다. 프리셋(트랙 + 키)은 editor의 `src/shared/presets.ts`에 순수 로직으로 두고 main(설정 저장)과 renderer(키 배치·화면)가 함께 쓴다.

**Tech Stack:** 기존과 같음 (TypeScript, Vitest, Electron + electron-vite + React)

**Spec:** `docs/superpowers/specs/2026-10-10-named-tracks-design.md` (이하 "트랙 스펙", 절 번호는 이 문서). 바탕 스펙: `docs/superpowers/specs/2026-10-09-chart-editor-design.md`

## Global Constraints

- 트랙 id 정규식 `^[A-Za-z0-9_-]{1,32}$`, 채보 안에서 유일(대소문자 구분), 트랙 수 1~16
- 트랙 `color`는 `#rrggbb`, 생략 시 `#f2f2f2`. `width`는 `narrow` | `normal` | `wide`, 생략 시 `normal`. 직렬화 시 기본값이면 생략
- 에디터 타임라인 트랙 폭: narrow 32px, normal 48px, wide 80px. 테스트 플레이: 64px × (0.67 / 1 / 1.67)
- 노트 키: `` `${track}:${tick}` ``. 노트 정렬: tick 오름차순, 같은 tick이면 `tracks` 배열 순서
- `formatVersion`은 1 유지. 예전 포맷(`lanes` 필드, 노트의 `lane`)은 오류 `예전 포맷은 지원하지 않아요`
- 자동 배정 키 줄: `KeyA KeyS KeyD KeyF KeyJ KeyK KeyL Semicolon KeyQ KeyW KeyE KeyR KeyU KeyI KeyO KeyP`
- 기본 프리셋 6개와 키는 트랙 스펙 2.2 표 그대로. 사이드 트랙 이름은 `Side_L`, `Side_R`
- UI 문구는 한국어. 기존 디자인 토큰·컴포넌트(`src/renderer/src/ui`)를 쓴다
- **진행 중 상태**: Task 1~4는 아직 바뀌지 않은 패키지 때문에 루트 `npm run typecheck`가 실패할 수 있다. 각 Task가 이름을 댄 테스트·타입 검사만 통과하면 된다. **Task 5부터는 루트 `npm test`와 `npm run typecheck`가 모두 통과해야 한다**
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session: https://claude.ai/code/session_0193KVdVcsVXdi6XcDzTsVW4`

## Review Focus

1. **트랙 이름을 바꾼 직후 Undo** — 노트가 다시 원래 트랙 이름으로 돌아가야 하고, 선택(노트 키에 트랙 이름이 들어 있음)이 사라진 노트를 가리키지 않아야 한다 → Task 4 테스트
2. **트랙 순서를 바꾼 뒤 녹음·테스트 플레이** — 키는 트랙 id로 따라가야 한다(위치가 아님). `D`로 `Note_1`을 치던 사람은 순서를 바꿔도 `D`가 `Note_1`이다 → Task 3 테스트
3. **폭이 서로 다른 트랙 경계 클릭** — `wide` 옆 `normal` 트랙의 경계 1px 차이로 다른 트랙에 노트가 찍히지 않아야 한다 → Task 4 테스트
4. **다른 트랙 구성의 채보로 붙여넣기** — 6K+사이드에서 복사한 노트를 4K 채보에 붙이면 거부되어야 한다(조용히 일부만 붙지 않음) → Task 4 테스트
5. **설정 파일의 프리셋이 깨져 있거나 손으로 고쳐진 경우** — 규칙을 어긴 프리셋은 버리고, 하나도 안 남으면 기본 프리셋으로 시작해야 한다 → Task 6 테스트

---

## 파일 구조

```
packages/core/src/types.ts          Track, TrackWidth, Chart.tracks, Note.track, noteKey
packages/core/src/constants.ts      MIN_TRACKS, MAX_TRACKS, TRACK_ID_PATTERN, DEFAULT_NOTE_COLOR (MIN_LANES/MAX_LANES 삭제)
packages/core/src/tracks.ts         (새) isValidTrackId, trackErrors, basicTracks, nextTrackId, trackIndex, compareNotes
packages/core/src/validate.ts       트랙 검증, 트랙별 겹침
packages/core/src/serialize.ts      tracks 직렬화(기본값 생략), 트랙 순서 정렬
packages/playfield/src/keymap.ts    keyLabel, trackForKey (LANE_KEYS/laneForCode/laneForKey 삭제)
packages/playfield/src/view.ts      trackPixelWidth, trackColumns (LANE_WIDTH/lanesLeft 대체)
packages/playfield/src/playState.ts 트랙 id → 위치 변환
packages/playfield/src/Playfield.ts keymap 옵션, 트랙 폭·색
apps/editor/src/shared/presets.ts   (새) TrackPreset, DEFAULT_PRESETS, AUTO_KEYS, presetErrors, sanitizePresets, resolveKeymap
apps/editor/src/shared/api.ts       CreateProjectOptions.tracks, RecentProject.charts.trackCount, 프리셋 IPC
apps/editor/src/main/project/       settings(presets, lastPresetId), projectFs(tracks)
apps/editor/src/renderer/src/
  editor/commands/tracks.ts         (새) 트랙 편집 명령
  editor/commands/{notes,charts,meta,record,editActions}.ts
  editor/input/recorder.ts
  editor/timeline/{view,hitTest,tools,drawTimeline,TimelineCanvas}.ts(x)
  editor/minimap/*, editor/playtest/PlaytestOverlay.tsx, editor/EditorScreen.tsx, editor/toolbar/BottomToolbar.tsx
  editor/panels/ChartPanel.tsx      트랙 카드, 키 배치 카드, 프리셋으로 저장
  presets/presetStore.ts            (새) 프리셋 읽기/저장 + 구독
  presets/PresetPicker.tsx          (새) 프리셋 드롭다운 + 트랙 칩 미리보기
  presets/PresetsPage.tsx           (새) 시작 화면의 트랙 프리셋 페이지
  presets/TrackRowsEditor.tsx       (새) 트랙 표(드래그 손잡이, id, 색, 폭, [키], 삭제) — 프리셋 페이지와 채보 탭 공용
  ui/reorder.ts, ui/SortableList.tsx (새) 드래그 순서 변경
  home/{HomeScreen,RecentTable,NewProjectDialog}.tsx
```

---

### Task 1: core — 트랙 포맷

**Files:**
- Create: `packages/core/src/tracks.ts`, `packages/core/test/tracks.test.ts`
- Modify: `packages/core/src/{types,constants,validate,serialize,index}.ts`, `packages/core/test/{constants,parse,serialize}.test.ts`

**Interfaces:**
- Produces (`@rcm/core`):
  - `type TrackWidth = 'narrow' | 'normal' | 'wide'`
  - `interface Track { id: string; color?: string; width?: TrackWidth }`
  - `Chart { formatVersion: 1; name; level; tracks: Track[]; notes: Note[] }` (`lanes` 삭제)
  - `type Note = { tick: number; track: string; type: 'tap' } | { tick: number; track: string; type: 'hold'; endTick: number }`
  - `noteKey(note)` → `` `${track}:${tick}` ``
  - 상수 `MIN_TRACKS = 1`, `MAX_TRACKS = 16`, `TRACK_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`, `DEFAULT_NOTE_COLOR = '#f2f2f2'`, `TRACK_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/`. `MIN_LANES`, `MAX_LANES` 삭제
  - `isValidTrackId(id: string): boolean`
  - `trackErrors(tracks: unknown, prefix: string): string[]` — 배열 여부, 개수 1~16, 각 트랙 id 형식·중복, color 형식, width 값. 메시지는 `` `${prefix}[${i}].id: ...` `` 형태(prefix 예: `hard.chart.json › tracks`)
  - `basicTracks(n: number): Track[]` — `Note_1`~`Note_n`
  - `nextTrackId(tracks: readonly Track[], prefix = 'Note_'): string` — `prefix + N`, N은 1부터 비어 있는 가장 작은 수
  - `trackIndex(tracks: readonly Track[], id: string): number` (없으면 -1)
  - `compareNotes(tracks: readonly Track[]): (a: Note, b: Note) => number` — tick, 같으면 트랙 순서
  - `notesOverlap(a, b)`는 `a.track === b.track` 비교

규칙: 트랙 스펙 1.1~1.4. `validateChart`는 `tracks`를 `trackErrors`로 검사하고, 노트 `track`이 목록에 없으면 `` `notes[${i}].track: '${id}' 트랙이 없음` ``. 루트에 `lanes`가 있거나 노트에 `lane`이 있으면 `` `${file}: 예전 포맷은 지원하지 않아요` `` 하나만 반환. 직렬화: 트랙의 `color`가 `#f2f2f2`(대소문자 무시)거나 없으면 생략, `width`가 `normal`이거나 없으면 생략. 필드 순서 `formatVersion, name, level, tracks, notes`.

- [ ] **Step 1: 기존 core 테스트의 `lanes`/`lane`을 새 포맷으로 바꾸고 새 테스트 작성**

```ts
// tracks.test.ts
it('트랙 id 규칙', () => {
  expect(isValidTrackId('Side_L')).toBe(true);
  expect(isValidTrackId('a-1')).toBe(true);
  expect(isValidTrackId('')).toBe(false);
  expect(isValidTrackId('노트')).toBe(false);
  expect(isValidTrackId('x'.repeat(33))).toBe(false);
});
it('basicTracks / nextTrackId', () => {
  expect(basicTracks(3).map(t => t.id)).toEqual(['Note_1', 'Note_2', 'Note_3']);
  expect(nextTrackId([{ id: 'Note_1' }, { id: 'Note_3' }])).toBe('Note_2');
  expect(nextTrackId([{ id: 'Side_L' }])).toBe('Note_1');
});
it('트랙 순서 정렬', () => {
  const tracks = [{ id: 'Side_L' }, { id: 'Note_1' }];
  const notes: Note[] = [{ tick: 0, track: 'Note_1', type: 'tap' }, { tick: 0, track: 'Side_L', type: 'tap' }];
  expect([...notes].sort(compareNotes(tracks)).map(n => n.track)).toEqual(['Side_L', 'Note_1']);
});

// parse.test.ts (추가/교체)
const tr = (ids: string[]) => ids.map(id => ({ id }));
it.each([
  [{ tracks: [] }, 'tracks'],
  [{ tracks: tr(Array.from({ length: 17 }, (_, i) => `T${i}`)) }, 'tracks'],
  [{ tracks: tr(['A', 'A']) }, 'tracks[1].id'],
  [{ tracks: tr(['bad id']) }, 'tracks[0].id'],
  [{ tracks: [{ id: 'A', color: 'red' }] }, 'tracks[0].color'],
  [{ tracks: [{ id: 'A', width: 'huge' }] }, 'tracks[0].width'],
  [{ notes: [{ tick: 0, track: 'Nope', type: 'tap' }] }, 'notes[0].track'],
])('트랙 오류 %#', (patch, needle) => {
  // chartText(notes, extra)는 기본 tracks = basicTracks(4)로 바꾼 기존 헬퍼
  const errors = errorsOf(parseChart(chartText((patch as { notes?: unknown[] }).notes ?? [], patch), 'hard.chart.json'));
  expect(errors.join('\n')).toContain('hard.chart.json');
  expect(errors.join('\n')).toContain(needle);
});
it('예전 포맷 거부', () => {
  const errors = errorsOf(parseChart(JSON.stringify({ formatVersion: 1, name: 'N', level: 1, lanes: 4, notes: [] }), 'n.chart.json'));
  expect(errors).toEqual(['n.chart.json: 예전 포맷은 지원하지 않아요']);
});
it('겹침은 트랙별', () => {
  const ok = parseChart(chartText([{ tick: 0, track: 'Note_1', type: 'tap' }, { tick: 0, track: 'Note_2', type: 'tap' }]), 'n.chart.json');
  expect(ok.ok).toBe(true);
});

// serialize.test.ts (추가)
it('기본 색·폭은 생략, 나머지는 유지', () => {
  const text = serializeChart({ formatVersion: 1, name: 'N', level: 1, notes: [],
    tracks: [{ id: 'Side_L', color: '#f59e0b', width: 'wide' }, { id: 'Note_1', color: '#F2F2F2', width: 'normal' }] });
  expect(JSON.parse(text).tracks).toEqual([{ id: 'Side_L', color: '#f59e0b', width: 'wide' }, { id: 'Note_1' }]);
});
it('같은 tick은 트랙 순서로 저장', () => {
  const text = serializeChart({ formatVersion: 1, name: 'N', level: 1, tracks: [{ id: 'B' }, { id: 'A' }],
    notes: [{ tick: 0, track: 'A', type: 'tap' }, { tick: 0, track: 'B', type: 'tap' }] });
  expect(JSON.parse(text).notes.map((n: Note) => n.track)).toEqual(['B', 'A']);
});
```

- [ ] **Step 2: `npx vitest run packages/core` → FAIL (새 export 없음, 예전 lane 동작)**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npx vitest run packages/core` → PASS, `npx tsc -p packages/core` → 오류 없음**
- [ ] **Step 5: 커밋** — `feat(core): named tracks chart format`

### Task 2: playfield — 트랙 기반 판정·화면

**Files:**
- Modify: `packages/playfield/src/{keymap,view,playState,Playfield}.ts`, `packages/playfield/test/{keymap,playState}.test.ts` (+ view 테스트가 있으면 함께)

**Interfaces:**
- Consumes: Task 1 `Track`, `Note.track`, `trackIndex`, `DEFAULT_NOTE_COLOR`
- Produces (`@rcm/playfield`):
  - `keyLabel(code: string): string` — 기존 `laneKeyLabel` 이름 변경, 추가 매핑: `ShiftLeft` → `L Shift`, `ShiftRight` → `R Shift`, `Semicolon` → `;`, `Space` → `Space`, `KeyX` → `X`, `DigitN` → `N`, 그 외 code 그대로
  - `trackForKey(keymap: ReadonlyMap<string, string | null>, e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string | null` — keymap은 트랙 id → code. Ctrl/Meta/Alt면 null. code에 해당하는 트랙 id
  - `trackForCode(keymap, code: string): string | null` (keyup용, 조합키 무시)
  - `LANE_KEYS`, `laneKeyLabel`, `laneForCode`, `laneForKey` 삭제
  - `view.ts`: `TRACK_BASE_WIDTH = 64`, `TRACK_WIDTH_FACTOR = { narrow: 0.67, normal: 1, wide: 1.67 }`, `trackPixelWidth(w?: TrackWidth): number` (= `Math.round(64 * factor)`), `trackColumns(canvasWidth: number, tracks: readonly Track[]): { x: number; width: number }[]` (합계 가운데 정렬, `Math.floor`). `LANE_WIDTH`, `lanesLeft` 삭제
  - `PlayState`: 생성자 시그니처 그대로. 내부에서 `trackIndex(chart.tracks, note.track)`로 위치를 구한다. `press(lane, ms)`·`release(lane, ms)`의 `lane`은 트랙 위치(이름 유지). `JudgeEvent.lane`도 트랙 위치
  - `PlayfieldOptions`에 `keymap: ReadonlyMap<string, string | null>` 추가. 열 폭은 `trackColumns`, 노트 색은 트랙 `color ?? DEFAULT_NOTE_COLOR`, 키 라벨은 `keyLabel(code)`, 키 없으면 `-`. 키 없는 트랙 노트는 칠 수 없으므로 판정 창이 지나면 기존 규칙대로 Miss

- [ ] **Step 1: 테스트 갱신·추가**

```ts
// keymap.test.ts
const km = new Map<string, string | null>([['Side_L', 'ShiftLeft'], ['Note_1', 'KeyS'], ['Note_2', null]]);
it('키 → 트랙', () => {
  expect(trackForKey(km, { code: 'ShiftLeft', ctrlKey: false, metaKey: false, altKey: false })).toBe('Side_L');
  expect(trackForKey(km, { code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
  expect(trackForCode(km, 'KeyS')).toBe('Note_1');
  expect(trackForCode(km, 'KeyZ')).toBeNull();
});
it('키 라벨', () => {
  expect(['KeyD', 'Semicolon', 'ShiftLeft', 'ShiftRight', 'Space'].map(keyLabel)).toEqual(['D', ';', 'L Shift', 'R Shift', 'Space']);
});
// view.test.ts
it('트랙 열: 폭 합계 가운데 정렬', () => {
  const cols = trackColumns(400, [{ id: 'S', width: 'wide' }, { id: 'N' }, { id: 'T', width: 'narrow' }]);
  expect(cols.map(c => c.width)).toEqual([107, 64, 43]);
  expect(cols[0].x).toBe(Math.floor((400 - 214) / 2));
  expect(cols[1].x).toBe(cols[0].x + 107);
});
// playState.test.ts — chart 헬퍼를 tracks: basicTracks(4), note.track: 'Note_1' 등으로 바꾸고 기존 기대값 유지. 추가:
it('트랙 순서가 바뀌어도 id로 판정', () => {
  const chart: Chart = { formatVersion: 1, name: 't', level: 1, tracks: [{ id: 'B' }, { id: 'A' }], notes: [{ tick: 480, track: 'A', type: 'tap' }] };
  const s = new PlayState(chart, tm, 0);
  expect(s.press(1, 500)).toEqual([{ lane: 1, judgement: 'perfect', part: 'head', ms: 500 }]);
});
```

- [ ] **Step 2: `npx vitest run packages/playfield` → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: `npx vitest run packages/playfield packages/core` → PASS, `npx tsc -p packages/playfield` → 오류 없음**
- [ ] **Step 5: 커밋** — `feat(playfield): track-based judging and layout`

### Task 3: 프리셋 순수 로직 (`src/shared/presets.ts`)

**Files:**
- Create: `apps/editor/src/shared/presets.ts`, `apps/editor/test/shared/presets.test.ts`

**Interfaces:**
- Consumes: core `Track`, `isValidTrackId`, `TRACK_COLOR_PATTERN`, `MIN_TRACKS`, `MAX_TRACKS`
- Produces:
  - `interface PresetTrack extends Track { key: string | null }`
  - `interface TrackPreset { id: string; name: string; tracks: PresetTrack[] }`
  - `AUTO_KEYS: readonly string[]` — Global Constraints의 16개
  - `DEFAULT_PRESETS: readonly TrackPreset[]` — 트랙 스펙 2.2 표. id는 `4k`, `5k`, `6k`, `7k`, `8k`, `6k-side`. Side_L/R는 `color: '#f59e0b'`, `width: 'wide'`, 키 `ShiftLeft`/`ShiftRight`
  - `interface PresetIssues { name?: string; tracks: { id?: string; color?: string; key?: string }[]; count?: string }`
  - `presetErrors(p: TrackPreset): PresetIssues` — name 비면 `이름을 입력하세요`, 트랙 수 1~16 아니면 count, id 형식(`영문·숫자·_·-만, 1~32자`)·중복(`이미 있는 이름`), color 형식, key 중복(`다른 트랙과 같은 키`). null 키는 중복 검사 제외
  - `hasPresetErrors(i: PresetIssues): boolean`
  - `sanitizePresets(raw: unknown): TrackPreset[]` — 배열이 아니거나 남는 게 없으면 `DEFAULT_PRESETS` 복사본. 구조가 틀리거나 `hasPresetErrors`인 프리셋은 버림. 프리셋 id가 겹치면 뒤의 것 버림
  - `newPresetId(existing: readonly TrackPreset[]): string` — `p-${Date.now().toString(36)}` 형식, 겹치면 뒤에 `-2`…
  - `interface ResolvedKeymap { keys: Map<string, string | null>; source: { kind: 'preset'; name: string } | { kind: 'auto' } }`
  - `resolveKeymap(tracks: readonly Track[], presets: readonly TrackPreset[]): ResolvedKeymap` — 트랙 스펙 3.4: id **집합**이 같은 첫 프리셋의 키(id로 매칭), 없으면 트랙 순서대로 `AUTO_KEYS`(17번째 이후는 null)
  - `presetToChartTracks(p: TrackPreset): Track[]` — key를 뺀 사본, 기본값(`#f2f2f2`, `normal`)인 color/width는 생략

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const t = (id: string, key: string | null = null): PresetTrack => ({ id, key });
it('기본 프리셋', () => {
  expect(DEFAULT_PRESETS.map(p => p.name)).toEqual(['4K', '5K', '6K', '7K', '8K', '6K + 사이드']);
  const side = DEFAULT_PRESETS[5];
  expect(side.tracks.map(x => `${x.id}=${x.key}`)).toEqual(['Side_L=ShiftLeft', 'Note_1=KeyS', 'Note_2=KeyD', 'Note_3=KeyF', 'Note_4=KeyJ', 'Note_5=KeyK', 'Note_6=KeyL', 'Side_R=ShiftRight']);
  expect(DEFAULT_PRESETS.every(p => !hasPresetErrors(presetErrors(p)))).toBe(true);
});
it('키는 위치가 아니라 id로 매칭', () => {
  const r = resolveKeymap([{ id: 'Note_2' }, { id: 'Note_1' }, { id: 'Note_3' }, { id: 'Note_4' }], DEFAULT_PRESETS);
  expect(r.source).toEqual({ kind: 'preset', name: '4K' });
  expect(r.keys.get('Note_1')).toBe('KeyD');
  expect(r.keys.get('Note_2')).toBe('KeyF');
});
it('맞는 프리셋이 없으면 자동 배정, 16개 넘으면 null', () => {
  const tracks = Array.from({ length: 17 }, (_, i) => ({ id: `T${i}` }));
  const r = resolveKeymap(tracks, DEFAULT_PRESETS);
  expect(r.source).toEqual({ kind: 'auto' });
  expect(r.keys.get('T0')).toBe('KeyA');
  expect(r.keys.get('T15')).toBe('KeyP');
  expect(r.keys.get('T16')).toBeNull();
});
it('검사: 이름·id·키 중복', () => {
  const i = presetErrors({ id: 'x', name: '', tracks: [t('A', 'KeyD'), t('A', 'KeyD'), t('bad id')] });
  expect(i.name).toBeDefined();
  expect(i.tracks[1].id).toBeDefined();
  expect(i.tracks[1].key).toBeDefined();
  expect(i.tracks[2].id).toBeDefined();
  expect(presetErrors({ id: 'x', name: 'P', tracks: [t('A'), t('B')] }).tracks.every(r => !r.key)).toBe(true);  // null 키 중복 아님
});
it('설정 파일 프리셋 정리', () => {
  expect(sanitizePresets(undefined)).toEqual(DEFAULT_PRESETS);
  expect(sanitizePresets([{ id: 'a', name: '', tracks: [] }])).toEqual(DEFAULT_PRESETS);
  const good = { id: 'a', name: 'A', tracks: [t('Note_1', 'KeyD')] };
  expect(sanitizePresets([good, { id: 'a', name: 'dup', tracks: [t('X')] }, 42])).toEqual([good]);
});
it('채보로 복사할 때 키와 기본값 제거', () => {
  expect(presetToChartTracks(DEFAULT_PRESETS[5])[0]).toEqual({ id: 'Side_L', color: '#f59e0b', width: 'wide' });
  expect(presetToChartTracks(DEFAULT_PRESETS[0])[0]).toEqual({ id: 'Note_1' });
});
```

- [ ] **Step 2: `npx vitest run apps/editor/test/shared/presets.test.ts` → FAIL → 구현 → PASS**
- [ ] **Step 3: 커밋** — `feat(editor): track presets and keymap resolution`

### Task 4: 에디터 모델·main 이전 (UI 제외)

**Files:**
- Create: `apps/editor/src/renderer/src/editor/commands/tracks.ts`, `apps/editor/test/renderer/commands/tracks.test.ts`
- Modify: `editor/commands/{notes,charts,meta,record,editActions}.ts`, `editor/input/recorder.ts`, `editor/timeline/{view,hitTest}.ts`, `editor/minimap/geometry.ts`(레인 참조가 있으면), `src/shared/api.ts`, `src/main/project/{projectFs,settings}.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `apps/editor/test/**`(fixtures 포함 기존 테스트를 새 포맷으로)

**Interfaces:**
- Consumes: Task 1 core, Task 2 `trackForCode`, Task 3 presets
- Produces:
  - `TimelineLayout { tracksX: number; totalWidth: number; columns: { id: string; x: number; width: number; color: string }[]; waveX: number; waveWidth: number; labelX: number }`, `TRACK_PX = { narrow: 32, normal: 48, wide: 80 }`, `layoutTimeline(width: number, tracks: readonly Track[]): TimelineLayout` (`tracksX = Math.round((width − totalWidth)/2)`, color는 `track.color ?? DEFAULT_NOTE_COLOR`). `xToLane(l, x): number | null`는 열 위치(트랙 위치)를 돌려준다(`x`가 `[col.x, col.x+width)`). `LANE_WIDTH` 삭제
  - `pointerToCell(...)` → `{ lane: number; track: string; tick: number } | null`
  - `hitTestNote(...)` 시그니처 그대로, 비교는 `note.track === layout.columns[lane].id`
  - `notesInRect(notes: Note[], tracks: readonly Track[], lane0, lane1, tick0, tick1): Set<string>` (lane = 트랙 위치)
  - `commands/notes.ts`: `shiftNote(note, dTick, dLane, tracks: readonly Track[]): Note | null` (트랙 위치 범위 밖이면 null), `moveNotes`·`mirrorNotes`·`copyNotes`·`pasteClip` 시그니처 그대로. 반전은 위치 `i → n−1−i`의 id. 붙여넣기는 클립 노트의 track이 채보에 하나라도 없으면 null
  - `commands/charts.ts`: `addChart(doc, name: string, tracks: Track[]): { doc; file } | null` — `trackErrors(tracks)`가 있으면 null
  - `commands/meta.ts`: `setChartLanes` 삭제
  - `commands/tracks.ts` (모두 `(doc, file, …) => … | null`, null = 거부·변화 없음):
    - `addTrack(doc, file): ProjectDoc | null` — 끝에 `{ id: nextTrackId(tracks) }`, 16개면 null
    - `renameTrack(doc, file, index: number, id: string): ProjectDoc | null` — 형식 틀림·중복·같은 이름이면 null. 그 트랙 노트의 `track`도 변경
    - `moveTrack(doc, file, from: number, to: number): ProjectDoc | null` — 같으면 null. 노트는 그대로(정렬만 다시)
    - `updateTrackLook(doc, file, index: number, patch: { color?: string; width?: TrackWidth }): ProjectDoc | null` — 형식 틀리면 null. 기본값이면 필드 삭제
    - `removeTrack(doc, file, index: number): { doc: ProjectDoc; removed: number } | null` — 마지막 트랙이면 null
    - `notesOnTrack(chart: Chart, id: string): number`
  - `Press { track: string; downMs; upMs }`; `class Recorder { constructor(keymap: ReadonlyMap<string, string | null>) … }` — keymap은 트랙 id → code, 내부에서 `trackForCode`. `pressed(): ReadonlyMap<string, number>` (트랙 id → 누른 시각)
  - `quantizePresses`·`mergeRecorded`·`applyRecording`은 track 사용, 정렬은 `compareNotes(chart.tracks)`
  - `api.ts`: `CreateProjectOptions.tracks: Track[]`(`lanes` 삭제), `RecentProject.charts: { name: string; trackCount: number }[]`, RcmApi 추가 `getPresets(): Promise<{ presets: TrackPreset[]; lastPresetId: string | null }>`, `savePresets(presets: TrackPreset[]): Promise<void>`, `setLastPresetId(id: string): Promise<void>`
  - main: `Settings`에 `presets?: TrackPreset[]`, `lastPresetId?: string`. `getPresets`는 `sanitizePresets(settings.presets)`. `savePresets`는 `sanitizePresets` 결과가 입력과 같은 개수가 아니면(버려진 게 있으면) reject `프리셋에 잘못된 값이 있어요`. `createProject`는 `trackErrors(opts.tracks)`가 있으면 reject, 채보는 `tracks: opts.tracks`. `summarizeProject`는 `trackCount`

- [ ] **Step 1: fixtures 갱신** — `files()`의 채보를 `tracks: basicTracks(4)`로, `withNotes(doc, notes, trackCount?: number, file?)`는 `trackCount`가 있으면 `basicTracks(trackCount)`로 교체. 기존 테스트의 `lane: n`은 `track: 'Note_{n+1}'`로, 키 `'n:tick'`은 `'Note_{n+1}:tick'`으로 바꾼다
- [ ] **Step 2: 새 테스트 작성**

```ts
// commands/tracks.test.ts
const F = 'normal.chart.json';
const tap = (tick: number, track: string): Note => ({ tick, track, type: 'tap' });
it('이름 변경은 노트를 따라가고, Undo하면 되돌아감', () => {
  const base = withNotes(d0, [tap(0, 'Note_1'), tap(0, 'Note_2')]);
  const d = renameTrack(base, F, 0, 'Side_L')!;
  expect(getChart(d, F).notes.map(noteKey)).toEqual(['Side_L:0', 'Note_2:0']);
  expect(getChart(base, F).notes.map(noteKey)).toEqual(['Note_1:0', 'Note_2:0']);   // 이전 문서는 그대로 (Undo 복원 대상)
  expect(renameTrack(base, F, 0, 'Note_2')).toBeNull();
  expect(renameTrack(base, F, 0, 'bad id')).toBeNull();
  expect(renameTrack(base, F, 0, 'Note_1')).toBeNull();
});
it('순서 변경: 노트는 그대로, 같은 자리는 null', () => {
  const d = moveTrack(d0, F, 0, 3)!;
  expect(getChart(d, F).tracks.map(t => t.id)).toEqual(['Note_2', 'Note_3', 'Note_4', 'Note_1']);
  expect(moveTrack(d0, F, 2, 2)).toBeNull();
});
it('삭제: 노트도 삭제, 마지막 트랙 거부', () => {
  const r = removeTrack(withNotes(d0, [tap(0, 'Note_1'), tap(480, 'Note_1'), tap(0, 'Note_2')]), F, 0)!;
  expect(r.removed).toBe(2);
  expect(removeTrack(withNotes(d0, [], 1), F, 0)).toBeNull();
});
it('추가와 모양 변경', () => {
  expect(getChart(addTrack(d0, F)!, F).tracks.at(-1)!.id).toBe('Note_5');
  expect(addTrack(withNotes(d0, [], 16), F)).toBeNull();
  expect(getChart(updateTrackLook(d0, F, 0, { color: '#f59e0b', width: 'wide' })!, F).tracks[0]).toEqual({ id: 'Note_1', color: '#f59e0b', width: 'wide' });
  expect(getChart(updateTrackLook(d0, F, 0, { color: '#f2f2f2', width: 'normal' })!, F).tracks[0]).toEqual({ id: 'Note_1' });
  expect(updateTrackLook(d0, F, 0, { color: 'red' })).toBeNull();
});

// commands/notes.test.ts (추가)
it('8트랙 반전: 사이드끼리 교체', () => {
  const tracks = [{ id: 'Side_L' }, ...basicTracks(6), { id: 'Side_R' }];
  const d = replaceChart(d0, F, { ...getChart(d0, F), tracks, notes: [tap(0, 'Side_L'), tap(0, 'Note_2')] });
  expect(getChart(mirrorNotes(d, F, new Set(['Side_L:0', 'Note_2:0']))!.doc, F).notes.map(noteKey).sort()).toEqual(['Note_5:0', 'Side_R:0']);
});
it('다른 트랙 구성으로 붙여넣기 거부', () => {
  expect(pasteClip(d0, F, { notes: [tap(0, 'Side_L'), tap(0, 'Note_1')] }, 0)).toBeNull();
  expect(getChart(d0, F).notes).toEqual([]);
});
it('이동: 트랙 범위 밖이면 거부', () => {
  const d = withNotes(d0, [tap(0, 'Note_4')]);
  expect(moveNotes(d, F, new Set(['Note_4:0']), 0, 1)).toBeNull();
  expect([...moveNotes(d, F, new Set(['Note_4:0']), 0, -3)!.keys]).toEqual(['Note_1:0']);
});

// timeline/view.test.ts (교체)
it('폭이 다른 트랙 레이아웃과 경계', () => {
  const l = layoutTimeline(1000, [{ id: 'Side_L', width: 'wide' }, { id: 'Note_1' }, { id: 'T', width: 'narrow' }]);
  expect(l.totalWidth).toBe(160);
  expect(l.tracksX).toBe(420);
  expect(l.columns.map(c => [c.id, c.x, c.width])).toEqual([['Side_L', 420, 80], ['Note_1', 500, 48], ['T', 548, 32]]);
  expect(xToLane(l, 499)).toBe(0);
  expect(xToLane(l, 500)).toBe(1);
  expect(xToLane(l, 547)).toBe(1);
  expect(xToLane(l, 548)).toBe(2);
  expect(xToLane(l, 580)).toBeNull();
  expect(l.waveX).toBe(420 - 8 - 64);
  expect(l.labelX).toBe(420 + 160 + 8);
});

// input/recorder.test.ts (교체 핵심)
it('키 반복은 하나의 누름, 트랙 id로 기록', () => {
  const r = new Recorder(new Map([['Note_1', 'KeyD'], ['Side_L', 'ShiftLeft']]));
  r.keyDown('ShiftLeft', 100); r.keyDown('ShiftLeft', 130); r.keyUp('ShiftLeft', 900);
  expect(r.finish(1000)).toEqual([{ track: 'Side_L', downMs: 100, upMs: 900 }]);
});

// main/projectFs.test.ts (교체·추가)
it('트랙 프리셋으로 프로젝트 만들기', async () => {
  const dir = await createProject({ ...opts, title: 'side', tracks: [{ id: 'Side_L', color: '#f59e0b', width: 'wide' }, { id: 'Note_1' }] });
  const chart = parseChart((await openProjectFiles(dir)).charts[0].text, 'normal.chart.json');
  expect(chart.ok && chart.value.tracks.map(t => t.id)).toEqual(['Side_L', 'Note_1']);
  expect((await summarizeProject(dir)).charts).toEqual([{ name: 'NORMAL', trackCount: 2 }]);
});
it('잘못된 트랙이면 만들지 않음', async () => {
  await expect(createProject({ ...opts, title: 'bad', tracks: [{ id: 'A' }, { id: 'A' }] })).rejects.toThrow();
  expect(existsSync(path.join(tmp, 'bad'))).toBe(false);
});
```

- [ ] **Step 3: `npx vitest run apps/editor/test` → FAIL**
- [ ] **Step 4: 구현 (위 Interfaces 전부, 기존 레인 기반 코드 교체). UI 파일(`*.tsx`, `drawTimeline.ts`, `tools.ts`)은 이 Task에서 고치지 않는다**
- [ ] **Step 5: `npx vitest run` (루트 전체) → PASS. 루트 typecheck는 UI 파일 때문에 실패할 수 있음 — 실패 목록이 UI 파일뿐인지 보고서에 기록**
- [ ] **Step 6: 커밋** — `feat(editor): track-based editing model and project files`

### Task 5: 에디터 UI 이전 (타임라인·미니맵·녹음·테스트 플레이·만들기 창)

**Files:**
- Create: `apps/editor/src/renderer/src/presets/PresetPicker.tsx` (+ css)
- Modify: `editor/timeline/{drawTimeline.ts,TimelineCanvas.tsx,tools.ts}`, `editor/minimap/*`, `editor/EditorScreen.tsx`, `editor/toolbar/BottomToolbar.tsx`(난이도 추가 창), `editor/playtest/PlaytestOverlay.tsx`, `editor/panels/ChartPanel.tsx`(레인 수 컨트롤 삭제만), `home/{NewProjectDialog,RecentTable}.tsx`

**Interfaces:**
- Consumes: Task 1~4 전부. 이 Task에서는 프리셋 목록으로 `DEFAULT_PRESETS`를 직접 쓴다(Task 6에서 저장된 프리셋으로 교체)
- Produces:
  - `<PresetPicker presets: readonly TrackPreset[]; value: string /* preset id */; onChange(id: string) />` — 드롭다운(`Menu` 또는 select 스타일 버튼) + 아래 트랙 칩 줄(칩 너비 = 트랙 폭 비율, 테두리/글자 색 = 트랙 색, 12px, `--bg-input` 바탕)
  - 새 프로젝트 창: `첫 난이도 레인 수` 행 → `트랙 프리셋` 행(`PresetPicker`). `createProject`에 `tracks: presetToChartTracks(preset)`
  - 난이도 추가 창: 레인 수 → `PresetPicker`, `addChart(doc, name, presetToChartTracks(preset))`
  - 최근 목록 난이도 칸: `` `${name} · ${trackCount}트랙` ``
  - `drawTimeline`: 열 위치·폭은 `layout.columns`, 노트 색은 열 color(롱노트 몸통 60%), **맨 위 20px 트랙 이름 라벨 줄**(12px `--text-muted` 색 값, 열 가운데 정렬, 넘치면 `…`로 자름), 녹음 중 키 라벨은 `keyLabel(resolveKeymap(...).keys.get(id))`
  - 미니맵: 노트 x/폭을 트랙 폭 비율로, 색은 트랙 색
  - 녹음: `new Recorder(resolveKeymap(chart.tracks, presets).keys)`. 테스트 플레이: `Playfield`에 같은 `keys` 전달
  - `ChartPanel`: 레인 수 행 삭제 (트랙 카드는 Task 7)

- [ ] **Step 1: 구현**
- [ ] **Step 2: `npm test` → 전체 PASS, `npm run typecheck` → 오류 없음 (여기서부터 필수)**
- [ ] **Step 3: `npm run dev`로 실행해 오류 없이 뜨는지 확인 후 종료. 사람이 볼 항목 기록**: 6K+사이드로 새 프로젝트 → 사이드 트랙이 넓고 주황, 이름 라벨 줄, 녹음 시 Shift로 사이드 노트, 테스트 플레이 키 라벨 `L Shift`, 최근 목록 `NORMAL · 8트랙`
- [ ] **Step 4: 커밋** — `feat(editor): render and play named tracks`

### Task 6: 프리셋 저장 + 트랙 프리셋 페이지

**Files:**
- Create: `apps/editor/src/renderer/src/ui/reorder.ts`, `ui/SortableList.tsx` (+ css), `presets/presetStore.ts`, `presets/TrackRowsEditor.tsx` (+ css), `presets/PresetsPage.tsx` (+ css)
- Modify: `home/HomeScreen.tsx`(사이드바 `트랙 프리셋` 메뉴), `home/NewProjectDialog.tsx`·`editor/toolbar/BottomToolbar.tsx`·`editor/EditorScreen.tsx`(`DEFAULT_PRESETS` → 저장된 프리셋), `src/main/project/settings.ts`(`loadSettings`의 프리셋 정리). 프리셋 IPC(`getPresets`/`savePresets`/`setLastPresetId`)는 Task 4가 이미 연결했다
- Test: `apps/editor/test/renderer/ui/reorder.test.ts`, `apps/editor/test/main/settings.test.ts`(추가)

**Interfaces:**
- Produces:
  - `moveIndex<T>(list: readonly T[], from: number, to: number): T[]` — `to`는 옮긴 뒤 위치
  - `dropSlot(pointerY: number, listTop: number, rowHeight: number, count: number): number` — 0..count, 행 가운데를 넘으면 다음 칸
  - `slotToIndex(from: number, slot: number): number` — `slot > from ? slot − 1 : slot`
  - `<SortableList<T> items: readonly T[]; rowHeight: number; getKey(item: T): string; onMove(from: number, to: number): void; renderRow(item: T, index: number, handle: { onPointerDown(e: React.PointerEvent): void }): ReactNode />` — 트랙 스펙 2.3의 드래그 동작: 손잡이 pointerdown → pointer capture, 끄는 동안 원래 행 `opacity: 0.4`, 놓일 칸에 `--accent` 2px 선, pointerup에서 `slotToIndex`로 `onMove`(같은 자리면 호출 안 함), Esc 또는 리스트 밖에서 놓으면 취소
  - `presetStore`: `loadPresets(): Promise<void>`, `getPresets(): readonly TrackPreset[]`, `getLastPresetId(): string | null`, `savePresets(next: TrackPreset[]): Promise<void>`(낙관적 반영 후 실패 시 이전 값 복원 + 오류 throw), `setLastPresetId(id)`, `usePresets(): readonly TrackPreset[]` (`useSyncExternalStore`)
  - `<TrackRowsEditor tracks: readonly (Track | PresetTrack)[]; showKeys: boolean; issues?: PresetIssues['tracks']; onRename(i, id); onLook(i, patch); onKey?(i, code: string | null); onMove(from, to); onRemove(i); onAdd() />` — 행: 손잡이(`GripVertical`), id `TextField`(blur/Enter 커밋), 색 스와치 + `#rrggbb` 입력, 폭 `SegmentedControl`(좁게/보통/넓게), [키 버튼: 클릭 → `키를 누르세요`, 다음 keydown code로 지정, Esc 취소, Backspace/Delete는 null], 삭제 아이콘. 행 높이 36px. 위반 칸은 `--danger` 테두리 + title 툴팁에 메시지
  - `PresetsPage`: 왼쪽 목록(선택 강조) + `새 프리셋`(`basicTracks(4)` + AUTO_KEYS 앞 4개), `복제`(이름 뒤 ` 복사본`), `삭제`(1개 남으면 비활성, `confirm`), `기본값 복원`(`confirm` 후 `DEFAULT_PRESETS`). 오른쪽 이름 입력 + `TrackRowsEditor(showKeys)`. 편집할 때마다 `presetErrors` 검사 → 오류 없으면 `savePresets`, 있으면 화면에만 반영하고 저장 안 함(페이지를 떠날 때 오류가 남아 있으면 그 프리셋 변경은 버려짐 — 안내 문구 표시)
  - main `loadSettings`: `presets`를 `sanitizePresets`로 정리해 반환
  - `PresetPicker`의 기본 선택: `getLastPresetId()`가 가리키는 프리셋, 없으면 첫 프리셋. 새 프로젝트·난이도를 만들 때 고른 프리셋 id를 `setLastPresetId`로 기억 (트랙 스펙 3.1)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// reorder.test.ts
it('moveIndex', () => {
  expect(moveIndex(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(moveIndex(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  expect(moveIndex(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
});
it('dropSlot / slotToIndex', () => {
  expect(dropSlot(100 + 17, 100, 36, 4)).toBe(0);
  expect(dropSlot(100 + 19, 100, 36, 4)).toBe(1);
  expect(dropSlot(100 + 999, 100, 36, 4)).toBe(4);
  expect(dropSlot(50, 100, 36, 4)).toBe(0);
  expect(slotToIndex(0, 3)).toBe(2);
  expect(slotToIndex(3, 0)).toBe(0);
});
// settings.test.ts (추가)
it('깨진 프리셋은 버리고, 없으면 기본 프리셋', async () => {
  await fs.writeFile(file, JSON.stringify({ recent: [], presets: [{ id: 'x', name: '', tracks: [] }] }));
  expect((await loadSettings(file)).presets).toEqual(DEFAULT_PRESETS);
});
```

- [ ] **Step 2: 해당 테스트 → FAIL → 구현 → PASS**
- [ ] **Step 3: 화면 구현·연결, `npm test`·`npm run typecheck` 통과**
- [ ] **Step 4: `npm run dev` 실행 확인 후 종료. 사람이 볼 항목 기록**: 프리셋 페이지 드래그 순서 변경(선 표시·Esc 취소), 키 지정, 중복 키 빨간 표시, 기본값 복원, 앱 재시작 후 유지, 새 프로젝트 창에 새 프리셋 표시
- [ ] **Step 5: 커밋** — `feat(editor): track preset page with drag reorder`

### Task 7: 채보 탭 트랙 카드 + 키 배치 카드 + 프리셋으로 저장

**Files:**
- Modify: `apps/editor/src/renderer/src/editor/panels/ChartPanel.tsx`
- Create(필요 시): `editor/panels/SavePresetDialog.tsx`

**Interfaces:**
- Consumes: Task 4 `commands/tracks.ts`, Task 6 `TrackRowsEditor`, `presetStore`, Task 3 `resolveKeymap`, `newPresetId`, Task 2 `keyLabel`
- Produces (트랙 스펙 3.2):
  - 트랙 카드: `TrackRowsEditor(showKeys=false)` → 각 동작을 `store.apply(label, next, chartFile)`로. 라벨 `트랙 추가`, `트랙 이름 변경`, `트랙 순서 변경`, `트랙 모양 변경`, `트랙 삭제`. 이름 변경이 null이면 토스트 `이름을 바꿀 수 없어요 (형식이 틀렸거나 이미 있는 이름)` 후 입력칸 원래 값. 삭제는 `notesOnTrack > 0`이면 `confirm({ title: '트랙 삭제', message: 'N개 노트가 함께 삭제돼요', danger: true })`. 마지막 트랙의 삭제 버튼은 비활성
  - 이름 변경·삭제·순서 변경 후 선택(`selection`)은 비운다
  - 키 배치 카드(읽기 전용): 트랙별 `id — keyLabel` (없으면 `-`), 아래에 출처 문구 `프리셋 '<이름>'의 키` 또는 `자동 배정 (맞는 프리셋 없음)`
  - `프리셋으로 저장` 버튼: Modal에서 이름 입력(IME 조합 중 Enter 무시, 기존 `TextField` 규칙) → `{ id: newPresetId(presets), name, tracks: 채보 트랙 + 현재 키 배치의 key }`로 `savePresets([...presets, p])` → 토스트 `프리셋 '<이름>'을 저장했어요`. 이름이 비면 저장 버튼 비활성
  - 재생 중이거나 녹음·테스트 플레이 중에는 트랙 카드 편집을 막는다(입력·버튼 비활성)

- [ ] **Step 1: 구현, `npm test`·`npm run typecheck` 통과**
- [ ] **Step 2: `npm run dev` 실행 확인 후 종료. 사람이 볼 항목 기록**: 채보 탭에서 트랙 드래그 순서 변경 → 타임라인 열 순서 즉시 반영, Ctrl+Z 한 번에 복원, 이름 변경 후 노트 유지, 삭제 확인 문구, 키 배치 카드 출처, 프리셋으로 저장 후 프리셋 페이지에 표시
- [ ] **Step 3: 커밋** — `feat(editor): edit chart tracks and save as preset`
