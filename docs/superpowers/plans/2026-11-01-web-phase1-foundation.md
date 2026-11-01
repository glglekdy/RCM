# 웹 버전 1단계(기반) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PC 브라우저에서 지금 데스크톱 화면 그대로 프로젝트를 만들고·편집하고·저장하고·ZIP으로 주고받을 수 있는 웹 앱(`apps/web`)을 만든다. PC 앱은 지금처럼 동작한다.

**Architecture:** fs를 쓰지 않는 프로젝트·설정 규칙을 `apps/editor/src/shared/`로 옮겨 PC(main)와 웹이 함께 쓴다. `RcmApi`에 `capabilities`와 새 메서드를 더하고, 화면은 capabilities로 PC 전용 기능을 숨긴다. `apps/web`은 renderer를 그대로 빌드하고 `window.rcm`에 IndexedDB 기반 구현을 넣는다.

**Tech Stack:** TypeScript, React 19, Vite 7, vitest, IndexedDB, `fflate`(ZIP, PC·웹 공용), `fake-indexeddb`(테스트).

**Spec:** `docs/superpowers/specs/2026-11-01-web-mobile-design.md` (이 계획은 9장 1단계: 2.1·2.2·3장(자동 저장 제외)·ZIP 내보내기·판정 오프셋 API)

**시작 전 확인:** 작업 폴더에 커밋되지 않은 공지사항(announcements) 작업(`NOTICES.md`, `main/announcements.ts`, `settings.ts`·`api.ts`·`preload` 수정 등)이 있었다. 이 계획은 그 작업이 **먼저 커밋된 상태**에서 시작한다. `git status`가 깨끗하지 않으면 시작하지 말고 사용자에게 묻는다.

## Global Constraints
- PC 앱 동작은 바뀌지 않는다. 기존 테스트(`npm test`)와 타입 검사(`npm run typecheck`)는 모든 태스크 끝에서 통과한다.
- 커밋은 `main`에 직접 한다(브랜치 없음). 커밋 메시지는 Conventional Commits(`feat(web): …`, `refactor(editor): …`), 끝에 저장소 규칙의 Co-Authored-By/Claude-Session 줄.
- 웹 코드(`apps/web/src`)와 `shared/`는 `electron`, `node:*`를 import하지 않는다(`import type`은 허용).
- 화면 문구는 지금 앱 말투(해요체)를 따른다. 오류 문구는 PC와 같은 경우 PC 문구를 그대로 쓴다.
- 웹 ZIP 가져오기 한도: 풀었을 때 **500MB**. PC는 1GB 그대로.
- 판정 오프셋: 정수 ms, **-200~200**, 기본 0.
- 웹 자동 저장 설정 기본값: 켬(이 단계는 저장·읽기 API만, 동작은 5단계).
- 웹 프로젝트 `dir` 형식: `"web:<uuid>"`. 고른 파일 경로 형식: `"picked:<id>"`.
- IndexedDB 이름 `rcm`, 버전 1, 저장소 `projects`·`files`·`settings`·`hitEffects`(스펙 3.1 표 그대로).

## Review Focus
1. **한글·특수문자 제목의 ZIP**: 웹에서 내보낸 `봄날 ♪` 프로젝트를 PC가 가져오면 폴더·파일 이름이 깨지지 않아야 한다 → Task 7 테스트 `한글 제목 ZIP을 PC가 그대로 연다`.
2. **대소문자만 다른 파일 이름**: Windows는 `Hard.chart.json`과 `hard.chart.json`을 같은 파일로 본다. 웹에서 둘이 따로 저장되면 내보낸 ZIP을 PC가 거부한다 → Task 6 테스트 `대소문자만 다른 이름은 같은 파일로 덮어쓴다`.
3. **새로고침 뒤 사라진 고른 파일**: `picked:` 경로가 메모리에서 사라진 뒤 읽으면 앱이 멈추지 말고 "파일을 다시 골라 주세요"로 실패해야 한다 → Task 5 테스트.
4. **가져오기·만들기 중간 실패**: 저장 공간 부족 등으로 중간에 실패하면 반쯤 만든 프로젝트가 최근 목록에 남지 않아야 한다 → Task 6 `만들기 중 쓰기가 실패하면 프로젝트가 남지 않는다`, Task 7 `가져오기 실패 시 프로젝트가 남지 않는다`.
5. **iPhone Safari의 ogg**: 디코딩에 실패하면 "이 브라우저는 ogg를 재생하지 못해요. mp3를 써 주세요"를 보여야 한다 → Task 4 `audioLoadError` 테스트.

---

### Task 1: 프로젝트 규칙을 `shared/project`로 옮기기

**Files:**
- Create: `apps/editor/src/shared/project/files.ts`, `folderName.ts`, `newProject.ts`, `summary.ts`, `zipLayout.ts`
- Modify: `apps/editor/src/main/project/projectFs.ts`, `importZip.ts`, `folderName.ts`(→ `export * from '../../shared/project/folderName'`)
- Test: `apps/editor/test/shared/project/files.test.ts`, `newProject.test.ts`, `summary.test.ts`, `zipLayout.test.ts` (기존 `test/main/projectFs.test.ts`, `importZip.test.ts`, `folderName.test.ts`는 그대로 통과)

**Interfaces:**
- Produces (`shared/project/files.ts`):
  - `extOf(name: string): string` — 소문자 확장자(`'.ogg'`), 없으면 `''`. 경로 구분자 `/`·`\` 모두 처리.
  - `isAudioFile(name: string): boolean` (`.ogg`·`.mp3`·`.wav`)
  - `isChartFileName(name: string): boolean`
  - `isProjectFileName(name: string): boolean` — `song.json`·`editor.json`·채보·음악
  - `isSafeZipEntry(name: string): boolean` — `..` 조각, `/`로 시작, `\` 포함, `C:` 같은 드라이브 문자면 false
  - `isCopiedAudioName(name: string): boolean` — 지금 `PROJECT_AUDIO_NAME` 정규식
  - `copiedAudioName(source: string, exists: (name: string) => boolean): string` — 지금 `uniqueAudioName` 규칙(`stem (RCM).ext`, `stem (2) (RCM).ext`…), `source`는 경로든 이름이든 마지막 조각만 쓴다
- Produces (`shared/project/newProject.ts`):
  - `interface CreateRules { isParentDir(v: unknown): v is string; isAudioSource(v: unknown): v is string }`
  - `validateCreateProjectOptions(raw: unknown, rules: CreateRules): CreateProjectOptions` — 지금 함수와 같은 검사·문구, 경로 검사만 `rules`로
  - `buildNewProject(opts: CreateProjectOptions, audio: string): { name: string; text: string }[]` — `song.json`, 첫 채보(`<sanitizeFolderName(chartName 소문자)>.chart.json`), `editor.json` 세 개
- Produces (`shared/project/summary.ts`): `summarizeProjectFiles(songText: string, charts: { file: string; text: string }[]): { title: string; artist: string; charts: RecentProject['charts'] }` — song을 못 읽으면 throw
- Produces (`shared/project/zipLayout.ts`): `projectPrefix(names: readonly string[]): string`(지금 함수 그대로), `projectEntries(names: readonly string[]): { prefix: string; files: string[] }` — prefix 바로 아래이면서 `isProjectFileName`인 이름만
- Produces (`shared/project/folderName.ts`): `sanitizeFolderName`, `uniqueChildName` (이동)

- [ ] **Step 1: 실패하는 테스트 작성** — `files.test.ts`:

```ts
expect(extOf('C:\\a\\Song.OGG')).toBe('.ogg'); expect(extOf('noext')).toBe('')
expect(isSafeZipEntry('My Song/song.json')).toBe(true)
for (const bad of ['../x', 'a/../../x', '/abs', 'C:/x', 'a\\b']) expect(isSafeZipEntry(bad)).toBe(false)
expect(copiedAudioName('C:\\m\\봄날.mp3', () => false)).toBe('봄날 (RCM).mp3')
expect(copiedAudioName('봄날 (RCM).mp3', (n) => n === '봄날 (RCM).mp3')).toBe('봄날 (2) (RCM).mp3')
expect(isCopiedAudioName('audio-2.wav')).toBe(true); expect(isCopiedAudioName('mine.ogg')).toBe(false)
```
`newProject.test.ts`: 자유형 옵션이면 채보 텍스트에 `"layout": "free"`와 `columns`, 레인형이면 `tracks`; 파일 이름 3개가 `['song.json', 'hard.chart.json', 'editor.json']`(chartName `'HARD'`); `rules.isAudioSource`가 false면 `'음악 파일은 ogg, mp3, wav만 쓸 수 있어요'`. `summary.test.ts`: 자유형 채보는 `{ name, trackCount: 0, columns }`, 깨진 채보는 건너뜀, 깨진 song은 throw. `zipLayout.test.ts`: `__MACOSX/…/song.json` 무시, 하위 폴더 파일 제외.

- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/project` → 모듈 없음으로 FAIL
- [ ] **Step 3: 구현** — 위 시그니처대로 만들고, `projectFs.ts`·`importZip.ts`는 이 함수들을 불러 쓰도록 바꾼다. PC `validateCreateProjectOptions`는 `rules = { isParentDir: 절대 경로 문자열, isAudioSource: 절대 경로 && isAudioFile }`로 감싼 같은 이름의 export를 유지한다(ipc·테스트 import 변경 없음). `createProject`는 `buildNewProject` 결과를 쓴다. `summarizeProject`는 `summarizeProjectFiles`를 감싸고 실패 시 지금처럼 `missing: true`.
- [ ] **Step 4: 통과 확인** — `npm test` 전체 PASS, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `refactor(editor): move pure project rules to shared/project`

---

### Task 2: 설정·이펙트 규칙을 `shared`로 옮기고 판정 오프셋 규칙 추가

**Files:**
- Create: `apps/editor/src/shared/settingsRules.ts`
- Modify: `apps/editor/src/main/project/settings.ts`(옮긴 함수 re-export), `apps/editor/src/shared/hitEffects.ts`, `apps/editor/src/main/hitEffectFiles.ts`(re-export)
- Test: `apps/editor/test/shared/settingsRules.test.ts` (기존 `settings.test.ts`, `hitEffectFiles.test.ts` 그대로 통과)

**Interfaces:**
- Produces (`shared/settingsRules.ts`): `validateLastSeenVersion`, `validateNoticeId`, `validateAnnouncementIds`, `addSeenAnnouncements`, `MAX_SEEN_ANNOUNCEMENTS`, `validatePlaytestSpeed`, `validatePresets`, `validateLastPresetId`, `presetsOf(s: { presets?: TrackPreset[]; lastPresetId?: string })`, `isVersion`, `isNoticeId`, `isPlaytestSpeed` (지금 구현 그대로 이동), 그리고 새로
  - `JUDGE_OFFSET_LIMIT = 200`
  - `validateJudgeOffset(raw: unknown): number` — 정수이고 `-200~200`이 아니면 `'판정 오프셋은 -200~200ms 사이 정수여야 해요'`로 throw
- Produces (`shared/hitEffects.ts`에 추가): `naturalCompare`, `sourceWithFiles`, `withStoredFiles`, `SHEET_FILE = 'sheet.png'`, `frameName(i: number): string`, `pickedHitEffectOrder(type, names): string[]`(시트면 첫 장, 프레임이면 자연 정렬) — `hitEffectFiles.ts`에서 이동

- [ ] **Step 1: 테스트 작성** — `validateJudgeOffset(0)`·`(-200)`·`(200)`은 그대로, `201`·`-201`·`1.5`·`'10'`·`NaN`은 throw. 옮긴 함수는 기존 테스트가 담당.
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/settingsRules.test.ts` → FAIL
- [ ] **Step 3: 구현** — 이동 후 `settings.ts`·`hitEffectFiles.ts`는 `export { … } from` 으로 같은 이름을 다시 내보낸다. `Settings` 타입에 `judgeOffset?: number`, `autoSave?: boolean`(PC는 쓰지 않음)을 추가하고 `parseSettings`에서 `isJudgeOffset`일 때만 채운다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `refactor(editor): share settings and hit effect rules; add judge offset rule`

---

### Task 3: `RcmApi` 확장과 PC 구현 (ZIP 내보내기 포함)

**Files:**
- Modify: `apps/editor/src/shared/api.ts`, `apps/editor/src/preload/index.ts`, `apps/editor/src/main/ipc.ts`, `apps/editor/electron.vite.config.ts`(`bundledMain`에 `'fflate'`), `apps/editor/package.json`(devDependencies `"fflate": "^0.8.2"`)
- Create: `apps/editor/src/main/project/exportZip.ts`
- Test: `apps/editor/test/main/exportZip.test.ts`

**Interfaces:**
- Produces (`shared/api.ts`): 스펙 2.1의 `Capabilities`(9개 필드)와 `RcmApi` 추가 멤버 그대로 — `capabilities`, `exportProjectZip(dir)`, `pickProjectZip()`, `getJudgeOffset()`, `setJudgeOffset(ms)`, `getAutoSave()`, `setAutoSave(enabled)`, `closeProject(dir)`. 그리고 스펙 3.1 사용량 표시를 위해 `getStorageUsage(): Promise<{ usedBytes: number } | null>`(PC는 null).
- Produces (`main/project/exportZip.ts`):
  - `buildProjectZip(dir: string): Promise<{ name: string; data: Uint8Array }>` — `name` = `<sanitizeFolderName(song.title)>.zip`, 항목은 `<폴더 이름>/<파일>`이고 `isProjectFileName`인 파일만. song.json을 못 읽으면 `'song.json을 찾을 수 없어요'`.
- PC capabilities 값: `{ windowControls: true, autoUpdate: true, discord: true, revealInExplorer: true, guideFileSync: true, chooseProjectFolder: true, trash: true, recording: true, autoSave: false }`
- IPC 채널: `rcm:export-project-zip`(저장 대화상자, 기본 위치 다운로드 폴더, 필터 ZIP), `rcm:pick-project-zip`(열기 대화상자, 필터 ZIP), `rcm:get-judge-offset`(없으면 0), `rcm:set-judge-offset`. `getAutoSave`는 preload에서 `Promise.resolve(false)`, `setAutoSave`·`closeProject`는 `Promise.resolve()`. `capabilities`는 preload 상수.

- [ ] **Step 1: 테스트 작성** — `exportZip.test.ts`: 임시 폴더에 `song.json`(title `'봄날 ♪'`), `hard.chart.json`, `editor.json`, `봄날 (RCM).mp3`, `notes.txt`, 하위 폴더 `sub/x.chart.json`을 만들고 `buildProjectZip` → `name === '봄날 ♪.zip'`, `fflate.unzipSync` 항목이 정확히 `['봄날 ♪/song.json', '봄날 ♪/hard.chart.json', '봄날 ♪/editor.json', '봄날 ♪/봄날 (RCM).mp3']`(순서 무관). 그리고 그 ZIP을 임시 파일로 써서 `importProjectZip`으로 다시 열면 같은 파일 내용.
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/main/exportZip.test.ts` → FAIL
- [ ] **Step 3: 구현** — `fflate.zipSync`, 파일명은 UTF-8(fflate 기본). ipc 핸들러와 preload 연결.
- [ ] **Step 4: 통과 확인** — 위 테스트 PASS, `npm test`, `npm run typecheck` PASS(웹 구현이 아직 없어도 PC만으로 타입이 맞아야 한다)
- [ ] **Step 5: 커밋** — `feat(editor): capabilities, project ZIP export, judge offset API`

---

### Task 4: 화면이 capabilities를 따르게 하기

**Files:**
- Create: `apps/editor/src/renderer/src/ui/platform.ts`
- Modify: `App.tsx`, `ui/TitleBar.tsx`, `update/updateStore.ts`, `update/UpdateNotice.tsx`, `update/UpdatePanel.tsx`의 사용처, `settings/SettingsPage.tsx`, `guide/AiGuidePage.tsx`, `guide/GuideAutoUpdate.tsx` 사용처, `home/HomeScreen.tsx`, `home/NewProjectDialog.tsx`, `editor/EditorScreen.tsx`, `editor/toolbar/BottomToolbar.tsx` (모두 `apps/editor/src/renderer/src/` 아래)
- Test: `apps/editor/test/renderer/platform.test.ts`

**Interfaces:**
- Consumes: Task 3의 `Capabilities`, `exportProjectZip`, `pickProjectZip`, `closeProject`, `getStorageUsage`
- Produces (`ui/platform.ts`):
  - `caps(): Capabilities` — `window.rcm.capabilities`
  - `deleteCopy(trash: boolean, count: number): { title: string; message: string; confirm: string }` — trash면 지금 휴지통 문구 그대로, 아니면 title `프로젝트 ${count}개를 영구 삭제할까요?`, message에 `'지우면 되돌릴 수 없어요. 지우기 전에 ZIP으로 내보낼 수 있어요.'`, confirm `'영구 삭제'`
  - `savedMessage(what: string, result: string, revealsPath: boolean): string` — PC(`true`): 지금 문구(`${what}을(를) ${result}에 저장했어요` 형태로 기존 문구와 맞춤), 웹: `${result}을(를) 내려받았어요`
  - `audioLoadError(fileName: string, err: unknown): string` — 확장자 `.ogg`이고 디코딩 오류(`EncodingError` 또는 메시지에 `decode` 포함)면 `'이 브라우저는 ogg를 재생하지 못해요. mp3를 써 주세요'`, 아니면 지금처럼 오류 메시지

동작 변경(모두 capability가 false일 때만):
- `windowControls`: `TitleBar`가 아무것도 그리지 않는다. 그리고 `EditorScreen`이 dirty 동안 `beforeunload`에 `preventDefault()`를 건다.
- `autoUpdate`: `startUpdateStore()`를 부르지 않고 `UpdateNotice`·`UpdatePanel`을 그리지 않는다.
- `discord`: 설정의 디스코드 항목을 숨기고 `setPresence` 호출을 건너뛴다.
- `guideFileSync`: AI 가이드 페이지의 자동 문서 업데이트 영역을 숨긴다.
- `chooseProjectFolder`: 새 프로젝트 대화상자의 저장 위치 줄, 홈 사이드바 "프로젝트 열기", 편집 파일 메뉴 "열기", 찾을 수 없는 프로젝트의 "다시 연결"을 숨긴다.
- `revealInExplorer`: "탐색기에서 보기"를 숨긴다.
- `trash`: 삭제 확인에 `deleteCopy(false, n)`을 쓴다.
- `recording`: 녹음 버튼과 `record` 단축키를 막는다.
- 모든 플랫폼: 홈 사이드바에 "ZIP 가져오기"(`pickProjectZip` → `importProjectZip` → 목록 새로고침, 실패는 기존 `ipcErrorMessage` 알림), 편집 파일 메뉴의 "채보 내보내기" 아래에 "프로젝트 ZIP으로 내보내기"(저장 안 한 변경이 있으면 먼저 저장할지 묻고, 결과는 `savedMessage`), 편집 화면이 언마운트될 때 `closeProject(files.dir)`, 음악 열기 실패 알림의 첫 줄은 `audioLoadError`, 홈 화면 아래에 `getStorageUsage()`가 null이 아니면 `사용 중 ${MB}MB`(소수점 없이 반올림).

- [ ] **Step 1: 테스트 작성** — `platform.test.ts`: `deleteCopy(false, 2)`의 세 문자열, `savedMessage('채보', 'hard.chart.json', false) === 'hard.chart.json을(를) 내려받았어요'`, `audioLoadError('a.ogg', new DOMException('x', 'EncodingError'))`는 ogg 문구, `audioLoadError('a.mp3', new DOMException('x', 'EncodingError'))`는 `'x'`.
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/renderer/platform.test.ts` → FAIL
- [ ] **Step 3: 구현** — `platform.ts`와 위 동작 변경. PC capabilities는 전부 true라 PC 화면은 "ZIP 가져오기"·"프로젝트 ZIP으로 내보내기"·사용량(null이라 안 보임) 말고는 바뀌지 않는다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS. `npm run dev`로 PC 앱을 띄워 홈의 ZIP 가져오기, 편집 화면의 ZIP 내보내기 → 다시 가져오기를 한 번 해 본다.
- [ ] **Step 5: 커밋** — `feat(editor): gate platform features by capabilities; ZIP import/export in menus`

---

### Task 5: 웹 저장소 기반 — DB, 설정, 이펙트, 고른 파일

**Files:**
- Create: `apps/web/package.json`(name `@rcm/web`, private, type module, devDependencies `fake-indexeddb ^6.0.0`, `fflate ^0.8.2`), `apps/web/tsconfig.json`, `apps/web/src/api/db.ts`, `settings.ts`, `hitEffects.ts`, `picked.ts`
- Modify: `vitest.config.ts`(include에 `'apps/web/test/**/*.test.ts'`), 루트 `package.json`(typecheck에 `&& tsc -p apps/web`)
- Test: `apps/web/test/db.test.ts`, `settings.test.ts`, `hitEffects.test.ts`, `picked.test.ts` (각 파일 첫 줄 `import 'fake-indexeddb/auto'`)

**Interfaces:**
- Produces (`db.ts`):
  - `openRcmDb(name?: string): Promise<IDBDatabase>` — 이름 기본 `'rcm'`, 테스트는 매번 새 이름
  - `tx<T>(db, stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => T | Promise<T>): Promise<T>` — 완료(`complete`) 후 resolve, 실패 시 reject. `QuotaExceededError`는 `new Error('저장 공간이 부족해요. 쓰지 않는 프로젝트를 ZIP으로 내보내고 지워 주세요')`로 바꾼다
  - `req<T>(r: IDBRequest<T>): Promise<T>`
- Produces (`settings.ts`): `createSettings(db): WebSettings` — `RcmApi`의 설정 메서드들을 그대로 구현하는 객체: `getPresets`, `savePresets`, `setLastPresetId`, `getWhatsNewState`(firstRun = `settings` 저장소가 처음 열렸을 때 비어 있었음), `setLastSeenVersion`, `getDismissedNotices`, `dismissNotice`, `getSeenAnnouncements`, `markAnnouncementsSeen`, `getPlaytestSpeed`, `setPlaytestSpeed`, `getGameplayLayout`, `setGameplayLayout`, `getJudgeOffset`, `setJudgeOffset`, `getAutoSave`(없으면 true), `setAutoSave`, `getDiscordPresence`(항상 false), `setDiscordPresence`(아무것도 안 함). 검사는 Task 2의 `shared/settingsRules.ts`와 `sanitizeLayout`을 쓴다.
- Produces (`hitEffects.ts`): `createHitEffects(db, settings): Pick<RcmApi, 'getHitEffects' | 'setHitEffects' | 'clearHitEffect' | 'readHitEffectImages'> & { importFiles(slot, type, files: File[]): Promise<HitEffectSettings> }` — `importFiles`는 PC `checkSources`와 같은 검사(PNG만, 최대 프레임 수, 장당 10MB)와 같은 문구, 이름은 `SHEET_FILE`·`frameName`, 순서는 `pickedHitEffectOrder`.
- Produces (`picked.ts`):
  - `registerPicked(file: File): string` → `"picked:<id>"`
  - `getPicked(path: string): File` — 없으면 `new Error('파일을 다시 골라 주세요')`
  - `isPickedPath(path: string): boolean`
  - `pickFiles(accept: string, multiple: boolean): Promise<File[]>` — 숨긴 `<input type="file">`, 취소면 `[]`(스펙 3.2의 `cancel` 이벤트 + focus 300ms 대체)

- [ ] **Step 1: 테스트 작성**
  - `db.test.ts`: `tx` 안에서 throw하면 같은 트랜잭션의 `put`이 남지 않는다. `QuotaExceededError` 이름의 DOMException을 던지면 위 문구로 reject.
  - `settings.test.ts`: 새 DB에서 `getWhatsNewState()` → `{ lastSeenVersion: null, firstRun: true }`, 값을 하나 저장하고 다시 `createSettings` → `firstRun: false`. `setJudgeOffset(300)` reject, `setJudgeOffset(-40)` 후 `getJudgeOffset() === -40`. `getAutoSave()` 기본 true. `getPresets()` 기본은 `sanitizePresets(undefined)`와 같다.
  - `hitEffects.test.ts`: 프레임 `f10.png, f2.png, f1.png` → `readHitEffectImages` 순서가 f1, f2, f10의 바이트. `.jpg`가 섞이면 `'PNG 파일만 쓸 수 있어요'`. `clearHitEffect` 후 빈 배열.
  - `picked.test.ts`: `getPicked(registerPicked(f)) === f`, `getPicked('picked:nope')`는 `'파일을 다시 골라 주세요'`로 throw.
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/web/test` → FAIL
- [ ] **Step 3: 구현** — 위 시그니처대로. `npm install`로 의존성을 받는다.
- [ ] **Step 4: 통과 확인** — `npx vitest run apps/web/test` PASS, `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `feat(web): IndexedDB base, settings, hit effects, picked files`

---

### Task 6: 웹 프로젝트 저장소

**Files:**
- Create: `apps/web/src/api/projects.ts`
- Test: `apps/web/test/projects.test.ts`

**Interfaces:**
- Consumes: Task 1 `validateCreateProjectOptions`·`buildNewProject`·`copiedAudioName`·`summarizeProjectFiles`·`isCopiedAudioName`·`isChartFileName`, Task 5 `tx`·`getPicked`
- Produces: `createProjects(db, deps: { locks: { request(name: string, opts: { ifAvailable: true }, cb: (lock: unknown) => Promise<void>): Promise<void> }; now(): number; uuid(): string }): WebProjects` —
  - `createProject(opts): Promise<{ dir }>` (rules: `isParentDir` = 문자열이면 통과, `isAudioSource` = `isPickedPath && isAudioFile`)
  - `openProject(dir): Promise<ProjectFiles>` — 탭 잠금을 잡고(못 잡으면 `'다른 탭에서 열려 있어요'`), `lastOpened` 갱신, song이 가리키지 않는 `isCopiedAudioName` 음악을 지운다(PC `removeUnusedAudio`와 같은 규칙)
  - `closeProject(dir): Promise<void>` — 잠금을 푼다
  - `writeProjectFiles(dir, files)` — 허용 이름은 PC와 같다(`song.json`·`editor.json`·채보), 모두 트랜잭션 하나. 대소문자만 다른 기존 키는 지우고 새 이름으로 쓴다
  - `deleteProjectFiles(dir, names)` — 채보 이름만
  - `readAudio(path): Promise<ArrayBuffer>` — `web:<id>/<name>` 또는 `picked:<id>`
  - `importProjectAudio(dir, source)` → 복사한 이름
  - `getRecentProjects(): Promise<RecentProject[]>` — `lastOpened` 내림차순, `missing: false`
  - `removeRecentProject(dir)` — 웹은 영구 삭제와 같다(목록에서 빼면 찾을 방법이 없으므로)
  - `trashProjects(dirs): Promise<TrashFailure[]>` — 영구 삭제, 다른 탭에서 열려 있으면 `{ dir, error: '다른 탭에서 열려 있어요' }`
  - `addImported(files: { name: string; data: string | Blob }[]): Promise<{ dir }>` — Task 7이 쓴다, 트랜잭션 하나
  - `listFiles(dir): Promise<{ name: string; data: string | Blob }[]>` — Task 7이 쓴다
  - 없는 `dir`이면 `'프로젝트를 찾을 수 없어요'`, 잘못된 형식이면 `'프로젝트 경로가 올바르지 않아요'`

- [ ] **Step 1: 테스트 작성** — 가짜 `locks`(Map 기반)와 고정 `now`·`uuid`로:
  - `만들기 → 열기`: `files.charts[0].file === 'hard.chart.json'`, `songText`의 `audio`가 `'봄날 (RCM).mp3'`, `readAudio('web:<id>/봄날 (RCM).mp3')` 바이트가 원본과 같다
  - `저장은 원자적이다`: `writeProjectFiles`에 허용 안 되는 이름(`'../x.json'`)이 섞이면 reject되고 다른 파일도 바뀌지 않는다
  - `대소문자만 다른 이름은 같은 파일로 덮어쓴다`: `Hard.chart.json`을 쓴 뒤 `openProject`의 채보는 하나뿐이고 이름은 `Hard.chart.json`
  - `만들기 중 쓰기가 실패하면 프로젝트가 남지 않는다`: 음악 경로가 등록되지 않은 `picked:` → reject, `getRecentProjects()`가 빈 배열
  - `다른 탭 잠금`: 가짜 locks가 잠금을 내주지 않으면 `openProject`가 `'다른 탭에서 열려 있어요'`로 reject, `trashProjects`는 그 dir을 실패로 돌려준다
  - `열 때 쓰지 않는 복사 음악을 지운다`: `importProjectAudio`로 두 번째 음악을 넣고 song을 바꾸지 않은 채 다시 열면 두 번째 파일이 사라진다
  - `최근 목록 정렬`: 두 프로젝트를 열람 순서대로 `lastOpened` 내림차순
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/web/test/projects.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `feat(web): project store on IndexedDB`

---

### Task 7: 웹 ZIP 가져오기·내보내기와 다운로드

**Files:**
- Create: `apps/web/src/api/zip.ts`, `apps/web/src/api/downloads.ts`
- Test: `apps/web/test/zip.test.ts`

**Interfaces:**
- Consumes: Task 1 `projectEntries`·`isSafeZipEntry`·`sanitizeFolderName`, Task 6 `addImported`·`listFiles`, `parseSong`(@rcm/core)
- Produces (`zip.ts`):
  - `WEB_ZIP_LIMIT = 500 * 1024 ** 2`
  - `importZip(projects: WebProjects, data: Uint8Array, limit = WEB_ZIP_LIMIT): Promise<{ dir: string }>` — 오류 문구는 PC `importZip.ts`와 같다(`'ZIP 파일을 열 수 없어요'`, `'ZIP 파일이 손상됐거나 폴더 밖을 가리키는 경로가 들어 있어요'`, `projectPrefix` 문구, `` `압축을 풀면 너무 커요 (500MB까지)` ``, `'song.json을 읽을 수 없어요'`, `'암호가 걸린 ZIP은 가져올 수 없어요'`). 크기는 fflate `unzip`의 `filter`에서 `originalSize` 합으로 먼저 막는다.
  - `exportZip(projects: WebProjects, dir: string): Promise<{ name: string; data: Uint8Array }>` — PC `buildProjectZip`과 같은 이름·항목 규칙
- Produces (`downloads.ts`): `download(name: string, data: Blob | string, type: string): string` — `<a download>`로 받고 `name`을 돌려준다(테스트 없음, Task 9 수동 확인)

- [ ] **Step 1: 테스트 작성** (`fake-indexeddb/auto`):
  - `한글 제목 ZIP을 PC가 그대로 연다`: title `'봄날 ♪'` 프로젝트를 `exportZip` → 임시 파일로 써서 PC `importProjectZip`(`apps/editor/src/main/project/importZip.ts`)으로 열면 폴더 이름 `'봄날 ♪'`, 파일 이름·내용이 같다
  - `PC 형식 ZIP을 연다`: `fflate.zipSync`로 만든 `{ 'My Song/song.json', 'My Song/hard.chart.json', 'My Song/a (RCM).ogg', 'My Song/readme.txt', '__MACOSX/My Song/song.json' }` → 프로젝트 하나, readme 없음
  - 잘못된 ZIP: 0바이트 → `'ZIP 파일을 열 수 없어요'`, song.json 두 개 → PC와 같은 문구, `../evil.chart.json` 항목 → 손상 문구, 한도 10바이트로 → `'압축을 풀면 너무 커요 (0MB까지)'`
  - `가져오기 실패 시 프로젝트가 남지 않는다`: 깨진 song.json ZIP → reject, `getRecentProjects()` 빈 배열
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/web/test/zip.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(web): project ZIP import/export compatible with desktop`

---

### Task 8: `createWebApi`와 웹 앱 뼈대

**Files:**
- Create: `apps/web/src/api/index.ts`, `apps/web/src/installApi.ts`, `apps/web/src/main.ts`, `apps/web/src/env.d.ts`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/editor/guideUpdatedAt.ts`
- Modify: `apps/editor/electron.vite.config.ts`(`guideUpdatedAt`을 새 파일에서 import), `apps/editor/tsconfig.json`(include에 `guideUpdatedAt.ts`), `apps/web/package.json`(scripts `dev: vite`, `build: vite build`, `preview: vite preview`, devDependencies에 `vite`·`@vitejs/plugin-react`·`react`·`react-dom`·`lucide-react`·`pretendard`는 editor와 같은 범위), 루트 `package.json`(`"dev:web": "npm -w @rcm/web run dev"`, `"build:web": "npm -w @rcm/web run build"`), 공지사항 URL·크기 한도를 `main/announcements.ts`에서 `shared/announcementsSource.ts`로 옮김
- Test: `apps/web/test/api.test.ts`

**Interfaces:**
- Consumes: Task 5~7 전부, Task 3 `RcmApi`
- Produces: `createWebApi(deps?: Partial<{ db: IDBDatabase; locks; now; uuid }>): Promise<RcmApi>` — 모든 멤버를 채운다:
  - `capabilities`: 모두 false, `autoSave: true`
  - 파일 고르기: `pickAudioFile`(accept `.ogg,.mp3,.wav`), `pickChartFiles`(`.json`, 여러 개), `pickProjectZip`(`.zip`), `pickHitEffect(slot, type)`(`.png`, frames면 여러 개, 고르면 `hitEffects.importFiles`), `pathForFile` = `registerPicked`
  - `readChartFile(path)`: `picked:`만, `.json`만, 32MB 한도(PC `chartFiles.ts`와 같은 문구)
  - `importProjectZip(path)`: `getPicked(path)` 바이트를 `importZip`에
  - `exportProjectZip(dir)`, `exportChart(name, text)`(이름은 PC `chartExportName` 규칙 — 이 함수도 Task 1처럼 `shared/project/files.ts`로 옮긴다), `saveTextFile(name, text)` → `download`
  - `getDefaultProjectDir()` → `'web:'`, `resolveProjectDir(_, title)` → `'web:' + sanitizeFolderName(title)`(표시용), `pickFolder()` → null, `relinkRecentProject`·`showInExplorer` → `'웹에서는 쓸 수 없어요'` reject
  - 창·업데이트·디스코드·가이드 파일: `minimize`·`toggleMaximize`·`close`·`installUpdate`·`forceClose`·`closeCancelled`·`setPresence` 아무것도 안 함, `isMaximized` false, `onCloseRequested`·`onUpdateState`는 해제 함수만 돌려줌, `getUpdateState`·`checkForUpdates`는 `{ status: 'idle' }`에 해당하는 `UpdateState` 값, `getGuideFiles` → `[]`, `addGuideFile` → null, `removeGuideFile` → `[]`
  - `setDirty(dirty)`: 저장만 해 두고(Task 4의 `beforeunload`가 renderer 쪽에서 처리)
  - `getAppVersion()` → `__APP_VERSION__`, `isPackaged()` → `!import.meta.env.DEV`
  - `fetchAnnouncements()`: `shared/announcementsSource.ts`의 URL을 `fetch`(no-store, 10초 타임아웃, 크기 한도) — PC와 같은 null/빈 문자열 규칙
  - `getStorageUsage()`: `navigator.storage.estimate()`의 `usage`, 없으면 null
  - 시작 시 `navigator.storage?.persist?.()`를 한 번 부른다(실패 무시)
- `installApi.ts`: `window.rcm = await createWebApi()` (top-level await). `main.ts`: `import './installApi'` 다음 줄에 `import '../../editor/src/renderer/src/main.tsx'`.
- `vite.config.ts`: `base: '/RCM/app/'`, `plugins: [react()]`, `define: { __AI_GUIDE_UPDATED_AT__: JSON.stringify(guideUpdatedAt()), __APP_VERSION__: JSON.stringify(<apps/editor/package.json version>) }`, `server.fs.allow: [<저장소 루트>]`, `build.target: 'es2022'`.
- `index.html`: editor의 `index.html`과 같은 구조, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<title>RCM</title>`, script `/src/main.ts`.

- [ ] **Step 1: 테스트 작성** — `api.test.ts`(`fake-indexeddb/auto`): `createWebApi({ locks: fake })`의 모든 `RcmApi` 키가 함수(또는 `capabilities` 객체)인지(`Object.keys`로 확인할 목록은 `api.ts`의 인터페이스 멤버를 테스트 안에 배열로 적는다), `capabilities.chooseProjectFolder === false`, `pickFolder()` → null, `readChartFile('picked:x')`(미등록) → `'파일을 다시 골라 주세요'`, `readChartFile(registerPicked(new File(['{}'], 'a.txt')))` → `'채보 파일(.chart.json)만 불러올 수 있어요'`.
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/web/test/api.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck`, `npm run build:web` 모두 성공(`apps/web/dist/index.html` 생성)
- [ ] **Step 5: 커밋** — `feat(web): web app shell with browser RcmApi`

---

### Task 9: PC 브라우저 수동 확인과 문서

**Files:**
- Modify: `docs/DEVELOPMENT.md`(구성 목록에 `apps/web`, "웹 개발 실행" 절: `npm run dev:web`, 폰 확인용 `npm run dev:web -- --host`, 웹 저장 위치는 브라우저 IndexedDB `rcm`이라는 설명), `apps/web/.gitignore` 또는 루트 `.gitignore`에 `apps/web/dist`

- [ ] **Step 1: 개발 서버 실행** — `npm run dev:web` → `http://localhost:5173/RCM/app/`가 홈 화면을 띄운다. 제목 표시줄·업데이트 패널·디스코드 설정·"프로젝트 열기"·저장 위치 줄이 보이지 않는다.
- [ ] **Step 2: 확인 목록** (모두 Chrome 데스크톱에서, 결과를 커밋 메시지 본문에 적는다)
  1. 새 프로젝트(mp3, 자유형) 만들기 → 노트 몇 개 → Ctrl+S → 새로고침 → 홈 목록에 있고 열면 노트가 그대로
  2. 레인형 프로젝트도 같은 흐름
  3. 곡 탭에서 음악 바꾸기 → 저장 → 다시 열기 → 새 음악 재생, 이전 복사본 정리
  4. 채보 내보내기(다운로드 `<이름>.chart.json`) → 다른 프로젝트에 채보 불러오기(파일 선택, 끌어다 놓기 둘 다)
  5. 프로젝트 ZIP 내보내기 → 받은 ZIP을 PC 앱(`npm run dev`)에서 끌어다 놓아 열림. PC에서 내보낸 ZIP을 웹 "ZIP 가져오기"로 열림
  6. 같은 프로젝트를 두 번째 탭에서 열면 `다른 탭에서 열려 있어요`
  7. 편집 후 저장하지 않고 탭 닫기 → 브라우저 기본 경고
  8. 타격 이펙트 PNG 시트·프레임 고르기 → 테스트 플레이에서 보임 → 새로고침 후에도 유지
  9. 프로젝트 삭제 확인 문구가 "영구 삭제"이고 지운 뒤 목록에서 사라짐
  10. 홈 아래 `사용 중 …MB` 표시
- [ ] **Step 3: 문서 수정** — 위 DEVELOPMENT.md 내용
- [ ] **Step 4: 전체 확인** — `npm test`, `npm run typecheck`, `npm run build:web` 성공
- [ ] **Step 5: 커밋** — `docs: web app development guide` (본문에 확인 목록 결과)
