# 프리셋 템플릿과 트랙 종류 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트랙 폭(`width`)을 없애고 트랙 종류(플레이 / 기믹)를 넣고, `새 프리셋`을 게임별 템플릿 창으로 바꾼다.

**Architecture:** `Track.kind`(생략 = 플레이)를 core에서 검사·저장하고 `width`는 읽고 버린다. 키맵·판정은 기믹 트랙을 건너뛰고(키 `[]`, `PlayState`에서 제외) 그리기만 따로 한다. 템플릿은 얼린 고정 데이터(`shared/presetTemplates.ts`)와 순수 생성 함수, 그 위의 모달 하나다.

**Tech Stack:** TypeScript, React 19, Electron(electron-vite), Canvas 2D, Vitest. 저장소 루트에서 `npx vitest run <경로>`, 전체 타입 검사 `npm run typecheck`.

**Spec:** `docs/superpowers/specs/2026-10-13-preset-templates-and-track-kind-design.md`

## Global Constraints

- 이 버전부터 저장하는 채보(`.chart.json`)·설정 파일 프리셋에 `width` 필드를 **절대 쓰지 않는다**
- 포맷 버전은 `1` 그대로. 트랙 필드 순서 `id, color, kind`. `kind`는 `"gimmick"`일 때만 쓴다
- `kind` 값은 `'play' | 'gimmick'`만. `'play'`는 읽을 때 생략형으로 정규화
- 예전 파일의 `width`는 값이 무엇이든 에러 없이 버린다
- 기믹 트랙: 키 없음(`[]`), 판정·콤보·결과·자동 플레이 제외, 노트는 속이 빈 테두리로 표시
- 문구는 한국어 해요체. 오류 메시지 형식은 기존(`${prefix}[i].필드: 이유`)을 따른다
- 각 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session: https://claude.ai/code/session_01KJ9W4d9VyLhjixNSdXt6dm`

## Review Focus

- `width: "huge"`처럼 예전에는 에러였던 값이 든 채보 → 이제 에러 없이 열려야 한다 (Task 1 테스트)
- 채보 트랙을 기믹으로 바꿨는데 같은 트랙 id 집합의 프리셋이 그 트랙에 키를 준 경우 → 그 트랙은 키 없음, 녹음·플레이에 안 잡힘 (Task 2 테스트)
- 설정 파일에서 기믹 트랙이 플레이 트랙과 같은 키를 들고 있는 프리셋 → 중복 에러 없이 살아남고 그 키는 플레이 트랙만 친다 (Task 2 테스트)
- 기믹 트랙만 있거나 기믹 롱노트가 있는 채보의 테스트 플레이·자동 플레이 → 판정 0개, 예외 없음 (Task 5 테스트)
- 템플릿 창에서 이름을 비우거나 같은 템플릿으로 두 번 만들기 → 이름은 템플릿 기본 이름, id는 서로 다름, 원본 템플릿은 그대로 (Task 6 테스트)

---

### Task 1: core 트랙 종류와 `width` 제거 (전 코드베이스)

`TrackWidth`를 지우면 편집기 컴파일이 깨지므로, 폭을 쓰던 곳을 이 태스크에서 함께 정리한다(폭 UI 제거, 타임라인 고정 폭). 종류 UI는 Task 3.

**Files:**
- Modify: `packages/core/src/types.ts`, `packages/core/src/constants.ts`, `packages/core/src/tracks.ts`, `packages/core/src/validate.ts:116-121`, `packages/core/src/serialize.ts:33-38`
- Modify: `apps/editor/src/main/project/projectFs.ts:58-63`
- Modify: `apps/editor/src/renderer/src/editor/timeline/view.ts:31,57`, `apps/editor/src/renderer/src/presets/PresetPicker.tsx:44`
- Modify: `apps/editor/src/renderer/src/editor/commands/tracks.ts:50-70` (패치를 `{ color? }`만 — `kind`는 Task 2)
- Modify: `apps/editor/src/renderer/src/presets/TrackRowsEditor.tsx` (`WIDTH_OPTIONS`, `WidthPicker`, 폭 `SegmentedControl` 삭제, `LookPatch = { color?: string }`), `TrackRowsEditor.module.css` (`.widths`, `.widthPicker`, `.widthOption`, `.widthSelected`, `.widthBar`, `.narrow/.normal/.wide` 삭제)
- Modify: `apps/editor/src/shared/presets.ts` (`parseTrack`의 `width` 분기 삭제 = 무시, `presetToChartTracks`의 `width` 삭제, `6k-side`의 `width: 'wide'` 삭제)
- Modify: `docs/CHART_FORMAT_GUIDE.md` 2.2절 표·예시·설명, 3.5절 참고 구현 `Track` 타입
- Test: `packages/core/test/parse.test.ts`, `packages/core/test/serialize.test.ts`, `packages/core/test/tracks.test.ts`, `apps/editor/test/renderer/commands/tracks.test.ts`, `apps/editor/test/renderer/timeline/view.test.ts`, `apps/editor/test/renderer/timeline/hitTest.test.ts`, `apps/editor/test/shared/presets.test.ts`

**Interfaces:**
- Produces: `type TrackKind = 'play' | 'gimmick'`; `interface Track { id: string; color?: string; kind?: TrackKind }`; `TRACK_KINDS: readonly TrackKind[] = ['play', 'gimmick']`; `isGimmick(t: { kind?: TrackKind }): boolean` (core `tracks.ts`, `index.ts`로 export); 편집기 `TRACK_PX: number = 48`

- [ ] **Step 1: 실패하는 테스트**
  - `parse.test.ts`: 기존 `[{ tracks: [{ id: 'A', width: 'huge' }] }, 'tracks[0].width'` 에러 기대 행을 `kind: 'boss'` → `'tracks[0].kind'`로 바꾼다. 새 테스트 `width는 값과 상관없이 버린다`: `width: 'huge'`·`'wide'` 트랙 채보가 `ok`이고 결과 트랙이 `{ id: 'A' }`. `kind: 'play'` → `{ id: 'A' }`, `kind: 'gimmick'` → `{ id: 'A', kind: 'gimmick' }`
  - `serialize.test.ts` `'기본 색·폭은 생략, 나머지는 유지'` → `'기본 색은 생략, 기믹은 kind로'`: 입력 `{ id: 'A', color: '#F2F2F2' }, { id: 'B', kind: 'gimmick', color: '#ff0000' }, { id: 'C', width: 'wide' } as never` → 출력 문자열에 `"width"`가 없고 B는 키 순서 `id, color, kind`
  - `tracks.test.ts`: `trackErrors([{ id: 'A', kind: 'x' }], 'tracks')`에 `tracks[0].kind: play, gimmick 중 하나여야 함`, `width: 'huge'`는 에러 없음. `isGimmick({ kind: 'gimmick' })` true, `{}` false
  - 편집기 `tracks.test.ts`·`view.test.ts`·`hitTest.test.ts`·`presets.test.ts`의 `width` 기대값을 고정 48px / `width` 없음으로 갱신 (`layoutTimeline(1000, [A, B, C])` → 열 폭 모두 48, `tracksX = round((1000 - 144) / 2) = 428`). `presets.test.ts` `'채보로 복사할 때 키와 기본값 제거'`: `6K + 사이드` 첫 트랙 → `{ id: 'Side_L', color: '#f59e0b' }`. 설정 파일 `width: 'wide'` 트랙 프리셋이 버려지지 않고 `width` 없이 읽힘

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/core apps/editor/test` / Expected: 위 테스트 FAIL

- [ ] **Step 3: 구현**
  - core 타입·상수·`isGimmick`. `trackErrors`는 `width` 검사를 지우고 `kind` 검사(`TRACK_KINDS` 포함 여부). `validateChart`는 `kind === 'gimmick'`만 넣는다. `trackOut`은 `width`를 무시하고 `kind === 'gimmick'`만 쓴다
  - 편집기 폭 소비처 정리(Files 목록). `updateTrackLook`의 "바뀐 것 없음" 비교는 색만
  - 가이드 2.2절: 표 `width` 행 → `kind` 행(`선택`, `"play"` \| `"gimmick"`, 생략 = `"play"`), 예시 JSON에서 `"width": "wide"` 삭제, `width` 설명 문단을 스펙 6절 세 줄로 교체. 3.5절 `Track` 타입 `kind?: 'play' | 'gimmick'`

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: 모두 PASS, 타입 에러 0. `grep -rn "TrackWidth\|TRACK_WIDTHS\|'narrow'\|'wide'" packages apps/editor/src` 결과 없음

- [ ] **Step 5: Commit** — `feat(core): track kind (play/gimmick) replaces width; width is read and dropped`

---

### Task 2: 키맵·프리셋·채보 명령이 기믹을 안다

**Files:**
- Modify: `apps/editor/src/shared/presets.ts` (`parseTrack`, `presetErrors`, `resolveKeymap`, `presetToChartTracks`)
- Modify: `apps/editor/src/renderer/src/editor/commands/tracks.ts` (`updateTrackLook`)
- Modify: `apps/editor/src/renderer/src/editor/panels/ChartPanel.tsx:106-108` (되돌리기 이름)
- Test: `apps/editor/test/shared/presets.test.ts`, `apps/editor/test/renderer/commands/tracks.test.ts`

**Interfaces:**
- Consumes: Task 1의 `TrackKind`, `isGimmick`
- Produces: `updateTrackLook(doc, file, index, patch: { color?: string; kind?: TrackKind }): ProjectDoc | null`; `resolveKeymap`은 기믹 채보 트랙에 `[]`

- [ ] **Step 1: 실패하는 테스트** (`presets.test.ts`)
  - `기믹 트랙은 키 검사를 건너뛴다`: `[{ id: 'A', key: 'KeyD' }, { id: 'G', kind: 'gimmick', key: 'KeyD', subKey: 'KeyD' }]` → 모든 행 `key`·`subKey` 이슈 없음
  - `채보 트랙이 기믹이면 프리셋 키와 상관없이 키 없음`: 프리셋 `[A=KeyD, B=KeyF]`, 채보 `[{ id: 'A' }, { id: 'B', kind: 'gimmick' }]` → `A: ['KeyD']`, `B: []`, source는 프리셋
  - `자동 배정은 기믹을 건너뛴다`: 맞는 프리셋 없는 `[{id:'X'}, {id:'G', kind:'gimmick'}, {id:'Y'}]` → `X: ['KeyA']`, `G: []`, `Y: ['KeyS']`
  - `설정 파일 kind`: `kind: 'gimmick'` 유지, `kind: 'play'` 생략형, `kind: 'boss'` 프리셋 버림. 기믹 트랙이 플레이 트랙과 같은 키를 가진 프리셋은 살아남음
  - `presetToChartTracks`가 `kind: 'gimmick'`을 복사
  - `tracks.test.ts`: `updateTrackLook(d, F, 0, { kind: 'gimmick' })` → 트랙 `kind: 'gimmick'`, 같은 값 다시 → `null`, `{ kind: 'play' }` → 필드 삭제, `{ kind: 'boss' as never }` → `null`, 노트는 그대로

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/shared/presets.test.ts apps/editor/test/renderer/commands/tracks.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현** — `resolveKeymap`은 프리셋이 맞아도 채보 트랙(`tracks` 인자)의 `isGimmick`으로 키를 `[]`로 덮는다. 자동 배정은 플레이 트랙 순번으로 `AUTO_KEYS`를 매긴다. `ChartPanel`의 `onLook`은 `'kind' in patch ? '트랙 종류 변경' : '트랙 모양 변경'`

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: PASS

- [ ] **Step 5: Commit** — `feat(presets): gimmick tracks get no keys and skip key checks`

---

### Task 3: 트랙 표의 종류 선택과 기믹 표시 (UI)

**Files:**
- Modify: `apps/editor/src/renderer/src/presets/TrackRowsEditor.tsx`, `TrackRowsEditor.module.css`
- Modify: `apps/editor/src/renderer/src/presets/PresetsPage.tsx` (`onLook`)
- Modify: `apps/editor/src/renderer/src/presets/PresetPicker.tsx`, `PresetPicker.module.css`
- Modify: `apps/editor/src/renderer/src/editor/panels/ChartPanel.tsx` (키 배치 카드)
- Modify: `apps/editor/src/renderer/src/guide/UserGuidePage.tsx:156` (`이름 · 색 · 폭` → `이름 · 색 · 종류(플레이·기믹)`)

**Interfaces:**
- Consumes: Task 2의 `updateTrackLook` 패치 `{ color?, kind? }`
- Produces: `TrackRowsEditor`의 `onLook(i, patch: { color?: string; kind?: TrackKind })`

- [ ] **Step 1: 구현**
  - 넓은 표: `SegmentedControl` 옵션 `[{ value: 'play', label: '플레이' }, { value: 'gimmick', label: '기믹' }]`
  - `compact`: 아이콘 버튼 하나(lucide `Music` = 플레이, `Cog` = 기믹), `aria-pressed`는 기믹일 때 true, title `플레이 트랙` / `기믹 트랙 (판정 없음)`, 누르면 반대 종류로
  - 기믹 행: 키·보조 키 `KeyButton`에 `disabled`, 글자 `—`, title `기믹 트랙은 키가 없어요`
  - `PresetsPage` `onLook`: `patch.kind === 'gimmick'`이면 `withTrack(p, i, { ...patch, key: null, subKey: undefined })`
  - `PresetPicker` 칩: `flexGrow: 1`(같은 폭), 기믹은 `border-style: dashed`, title에 `(기믹)`
  - `ChartPanel` 키 배치 행: 기믹 트랙은 `${t.id} — ⚙ 기믹`

- [ ] **Step 2: 확인** — Run: `npm run typecheck && npx vitest run` / Expected: PASS. 앱(`npm run dev`)에서 프리셋 페이지 행이 종류 선택을 보이고 기믹 행 키 버튼이 `—`·비활성, 채보 탭 좁은 표의 토글이 동작

- [ ] **Step 3: Commit** — `feat(editor): choose play/gimmick per track instead of width`

---

### Task 4: 타임라인·미니맵의 기믹 표시

**Files:**
- Modify: `apps/editor/src/renderer/src/editor/timeline/view.ts` (`TimelineColumn`에 `gimmick: boolean`)
- Modify: `apps/editor/src/renderer/src/editor/timeline/drawTimeline.ts` (레인 빗금, 트랙 이름 `⚙ `, `drawNote` 테두리 모드)
- Modify: `apps/editor/src/renderer/src/editor/minimap/Minimap.tsx`
- Test: `apps/editor/test/renderer/timeline/view.test.ts`

**Interfaces:**
- Consumes: `isGimmick`
- Produces: `TimelineColumn { id; x; width; color; gimmick: boolean }`

- [ ] **Step 1: 실패하는 테스트** — `layoutTimeline(1000, [{ id: 'A' }, { id: 'G', kind: 'gimmick' }]).columns.map(c => c.gimmick)` → `[false, true]`

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/renderer/timeline/view.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현**
  - 레인 배경: 기믹 열에 트랙 색 6% 불투명도 45° 빗금(간격 8px, 열로 clip)
  - 트랙 이름: 기믹이면 `⚙ ` + id (`fitText` 그대로)
  - `drawNote`: `col.gimmick`이면 `fill` 대신 `strokeStyle = color`, `lineWidth = 2`로 `stroke`(머리·롱노트 몸통 모두). 선택 테두리는 기존대로 그 위에
  - 미니맵: 기믹 노트는 `globalAlpha = NOTE_ALPHA * 0.4`

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: PASS. 앱에서 기믹 트랙 노트가 속 빈 테두리, 레인 빗금, 이름 앞 ⚙

- [ ] **Step 5: Commit** — `feat(timeline): hatched gimmick lanes with outlined notes`

---

### Task 5: 테스트 플레이에서 기믹 제외·표시 (+ 가이드 참고 구현)

**Files:**
- Modify: `packages/playfield/src/playState.ts` (생성자에서 기믹 레인 노트 건너뛰기)
- Create: `packages/playfield/src/gimmick.ts`, export from `packages/playfield/src/index.ts`
- Modify: `packages/playfield/src/Playfield.ts` (기믹 그리기, 라벨 `⚙`)
- Modify: `docs/CHART_FORMAT_GUIDE.md` 4.5절 참고 `PlayState` 생성자(같은 건너뛰기 한 줄 + 주석), 4.2절에 `kind: "gimmick"` 트랙은 판정 대상이 아니라는 한 줄
- Test: `packages/playfield/test/playState.test.ts`, `packages/playfield/test/autoplay.test.ts`, `apps/editor/test/shared/chartFormatGuide.test.ts`

**Interfaces:**
- Produces: `interface GimmickNote { lane: number; startMs: number; endMs?: number }`; `gimmickNotes(chart: Chart, tm: TimingMap, fromMs: number): GimmickNote[]` (시작 시각 순, `fromMs` 이전 제외 — `PlayState`와 같은 규칙)

- [ ] **Step 1: 실패하는 테스트**
  - `playState.test.ts` `기믹 레인 노트는 판정하지 않는다`: 트랙 `[A, G(gimmick)]`, 노트 A tap 1개 + G tap·hold 각 1개 → `state.notes.length === 1`, `update(10_000)` 후 `counts.miss === 1`(A만), G 레인 `press` → `[]`
  - `기믹만 있는 채보`: `notes.length === 0`, `update`·`press` 예외 없음, `autoplayStep(state, 10_000)` → `[]`
  - `gimmickNotes`: 위 채보에서 G 노트 2개, 시작 순, hold는 `endMs` 있음, `fromMs` 이후만
  - `chartFormatGuide.test.ts` `PlayState: 같은 입력에 같은 판정` 채보에 기믹 트랙·노트를 하나 더해 참고 구현과 결과 일치

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield apps/editor/test/shared/chartFormatGuide.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현**
  - `PlayState`·가이드 참고 구현: `if (chart.tracks[lane].kind === 'gimmick') continue;`
  - `Playfield`: 생성자에서 `gimmickNotes`와 그 `notePositions`를 따로 계산. `drawNotes` 뒤에 기믹 노트를 같은 화면 범위 계산으로 그린다 — `globalAlpha 0.5`, 트랙 색 `strokeStyle`, `lineWidth 2`, 바/동그라미 모양은 `drawHead`와 같은 경로를 `stroke`로(롱노트 몸통은 테두리 사각형). 판정선을 지나도 계속 내려가 화면 밖에서 사라진다
  - 라벨: 기믹 레인은 `⚙`(키맵이 `[]`라도 `-` 대신)

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: PASS. 앱 테스트 플레이에서 기믹 노트가 흐린 테두리로 내려오고 결과 수에 안 들어감

- [ ] **Step 5: Commit** — `feat(playfield): gimmick notes are drawn but never judged`

---

### Task 6: 템플릿 데이터와 생성 함수

**Files:**
- Create: `apps/editor/src/shared/presetTemplates.ts`
- Test: `apps/editor/test/shared/presetTemplates.test.ts`

**Interfaces:**
- Consumes: `PresetTrack`, `TrackPreset`, `DEFAULT_PRESETS`, `newPresetId`, `presetErrors`, `hasPresetErrors` (`shared/presets.ts`)
- Produces:
  - `interface PresetTemplate { id: string; name: string; tracks: readonly PresetTrack[] }`
  - `interface TemplateGroup { id: string; name: string; shortName: string; templates: readonly PresetTemplate[] }`
  - `BLANK_TEMPLATE: PresetTemplate` (`{ id: 'blank', name: '빈 프리셋', tracks: [{ id: 'Note_1', key: null }] }`)
  - `TEMPLATE_GROUPS: readonly TemplateGroup[]` — 순서·id: `basic`(기본, shortName `''`), `djmax`(DJMAX RESPECT V, `DJMAX`), `ez2on`(EZ2ON REBOOT : R, `EZ2ON`), `musedash`(Muse Dash, `Muse Dash`), `osu`(osu!mania, `osu!mania`)
  - `defaultTemplateName(group: TemplateGroup, t: PresetTemplate): string` — shortName이 비면 `t.name`, 아니면 `${shortName} ${t.name}`
  - `presetFromTemplate(t: PresetTemplate, name: string, existing: readonly TrackPreset[], fallbackName: string): TrackPreset` — id `newPresetId(existing)`, 이름 trim이 비면 `fallbackName`, 트랙 깊은 복사

- [ ] **Step 1: 실패하는 테스트**
  - 모든 그룹·템플릿이 `hasPresetErrors(presetErrors({ id: 'x', name: t.name, tracks: [...t.tracks] }))` false
  - 그룹 id 유일, 그룹 안 템플릿 id 유일. `basic`의 첫 템플릿이 `BLANK_TEMPLATE`, 나머지가 `DEFAULT_PRESETS`와 같은 이름 순서
  - 템플릿·트랙이 얼려 있음 (`Object.isFrozen`)
  - 스펙 5.2절 값 고정 (예): DJMAX 5B 트랙 `Side_L=ShiftLeft, Note_1=KeyA, Note_2=KeyS, Note_3=KeyD+KeyL, Note_4=Semicolon, Note_5=Quote, Side_R=ShiftRight`; DJMAX 8B 순서 `Side_L, Note_1..3(A S D), FX_L=KeyC, FX_R=Comma, Note_4..6(L ; '), Side_R`; EZ2ON 8K `A S D F J K L ;`; Muse Dash `Air=KeyF+KeyD, Ground=KeyJ+KeyK, Saw_Air(gimmick, key null), Saw_Ground(gimmick, key null)`; osu 7K `S D F Space J K L`
  - `presetFromTemplate(t, '  ', [], 'DJMAX 5B').name === 'DJMAX 5B'`; 같은 템플릿 두 번(두 번째 `existing`에 첫 결과 포함, `Date.now` 고정) → id 다름; 결과 트랙을 바꿔도 템플릿 그대로

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/shared/presetTemplates.test.ts` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — 스펙 5.2절 표 그대로. 키 code: `'` = `Quote`, `;` = `Semicolon`, `,` = `Comma`. 템플릿 이름: DJMAX `4B/5B/6B/8B`, EZ2ON·osu `4K/5K/6K/7K/8K`, Muse Dash `2레인`. 얼리기는 `presets.ts`의 `preset()`과 같은 방식(필요하면 그 함수를 export해 재사용)

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: PASS

- [ ] **Step 5: Commit** — `feat(presets): built-in game templates (DJMAX, EZ2ON, Muse Dash, osu!mania)`

---

### Task 7: 새 프리셋 템플릿 창

**Files:**
- Create: `apps/editor/src/renderer/src/presets/NewPresetDialog.tsx`, `NewPresetDialog.module.css`
- Modify: `apps/editor/src/renderer/src/ui/Modal.tsx`, `Modal.module.css` (선택 prop `wide?: boolean` → 박스 `width: min(860px, 100vw - 48px)`)
- Modify: `apps/editor/src/renderer/src/presets/PresetsPage.tsx` (`addPreset` → 창 열기, 지금의 4트랙 생성 코드 삭제)
- Modify: `apps/editor/src/renderer/src/guide/UserGuidePage.tsx` 트랙 프리셋 항목에 한 줄: `새 프리셋을 누르면 빈 프리셋이나 DJMAX · EZ2ON · Muse Dash · osu!mania 배치를 골라 시작할 수 있어요.`

**Interfaces:**
- Consumes: Task 6의 `TEMPLATE_GROUPS`, `defaultTemplateName`, `presetFromTemplate`; `keysLabel`(`@rcm/playfield`), `presetTrackKeys`
- Produces: `NewPresetDialog({ open, onClose, onCreate }: { open: boolean; onClose(): void; onCreate(p: TrackPreset): void })`

- [ ] **Step 1: 구현**
  - 상태: 그룹 id(처음 `basic`), 템플릿 id(처음 `blank`), 이름(템플릿을 고를 때마다 `defaultTemplateName`으로 채움). 열릴 때마다 초기화
  - 위 탭: `TEMPLATE_GROUPS`의 `name`. 왼쪽 카드 그리드(3열, 세로 스크롤): 레인 그림(트랙마다 같은 폭 칩, 트랙 색 테두리, 기믹 점선), 이름, 키 요약(트랙별 `keysLabel(presetTrackKeys(t))`, 기믹은 `⚙`, 공백으로 이음). 선택 카드는 `--accent` 테두리
  - 오른쪽: `이름` `TextField`, 트랙 목록(`id · 플레이/기믹 · 키`), 아래 `닫기` / `만들기`(primary)
  - 카드 더블클릭·`만들기`·Enter(`isSubmitEnter`) → `onCreate(presetFromTemplate(t, name, getPresets(), defaultTemplateName(g, t)))`
  - `PresetsPage`: `onCreate`에서 `setSelectedId(p.id)`, `save([...getPresets(), p])`, 창 닫기

- [ ] **Step 2: 확인** — Run: `npm run typecheck && npx vitest run` / Expected: PASS. 앱에서: `새 프리셋` → 기본 탭·빈 프리셋 선택 상태 → DJMAX 탭 5B 더블클릭 → 목록 끝에 `DJMAX 5B`가 생기고 선택됨, 가운데 트랙 키 `D`·보조 키 `L`. 이름 비우고 만들기 → 템플릿 기본 이름. Esc로 닫힘

- [ ] **Step 3: Commit** — `feat(presets): template gallery for new presets`
