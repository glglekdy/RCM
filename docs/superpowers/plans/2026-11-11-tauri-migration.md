# Tauri 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PC 앱을 Electron에서 Tauri 2로 옮겨 설치 파일을 15MB 이하로 줄이고, v0.9 사용자가 아무 조작 없이 새 앱으로 넘어오게 한다.

**Architecture:**
- `main/`의 로직을 `node:fs`·`electron` 대신 포트(`HostFs`·`HostPath`·`HostZip`·`HostDialogs`·`HostShell`·`HostDirs`·`PipeSocket`)를 받도록 고쳐 `shared/host/`·`shared/discord/`로 옮긴다.
- Electron은 Node 포트로, 새 Tauri 앱(`apps/desktop`)은 Rust 명령 포트로 같은 코드를 쓴다.
- renderer와 웹 버전은 바꾸지 않는다(제목 표시줄 속성 하나만 더한다).

**Tech Stack:**
- TypeScript, React 19, Vite 7, vitest
- Tauri 2(`tauri`, `tauri-plugin-dialog`, `tauri-plugin-updater`, `tauri-plugin-process`)
- Rust 크레이트: `zip`, `trash`, `dirs`, `tokio`(named pipe), `percent-encoding`
- NSIS

**Spec:** `docs/superpowers/specs/2026-11-11-tauri-migration-design.md`

## Global Constraints
- **Electron 앱은 Task 16 전까지 그대로 동작한다.** 모든 태스크 끝에서 `npm test`·`npm run typecheck`가 통과하고, Task 8부터는 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`도 통과한다.
- `shared/`의 코드는 `electron`·`node:*`를 import하지 않는다(`import type`은 허용). 테스트용 Node 포트는 `src/main/host/`에 둔다.
- 브랜치는 `tauri-migration`이다. 커밋은 Conventional Commits(`refactor(editor): …`, `feat(desktop): …`, `ci: …`)로 쓰고, 끝에 저장소 규칙의 Co-Authored-By·Claude-Session 줄을 붙인다.
- identifier는 `com.rcm.chart-editor`, productName은 `RCM`이다. 설치 파일 이름은 `RCM-Setup-${version}.exe`다.
- 앱 데이터 폴더: 릴리스 빌드는 `%APPDATA%\RCM`, 디버그 빌드는 `%APPDATA%\RCM Dev`다.
- 창: 1280×800, 최소 1000×640, 테두리 없음(`decorations: false`), 배경 `#141414`, `dragDropEnabled: false`.
- 업데이트 주소: `https://github.com/glglekdy/RCM/releases/latest/download/latest.json`
- 설치 파일 15MB 이하. ZIP 가져오기 한도는 풀었을 때 1GB(`MAX_IMPORT_BYTES`) 그대로다.
- 화면·오류 문구는 해요체로 쓰고, 지금 있는 문구는 그대로 다시 쓴다.
- Windows만 빌드한다.
- **바깥으로 나가는 일(태그 push, Release 공개, GitHub Secret 등록)은 하기 전에 사용자에게 묻는다.**

## Review Focus
1. **한글·공백·기호가 든 경로**(`C:\Users\김\Documents\RCM Projects\봄날 ♪`): 원시 바이트 쓰기는 경로를 헤더로 보내므로 깨지기 쉽다. → Task 9 `fs_write_bytes_korean_path` (Rust), `tauriFs encodes path header` (TS)
2. **큰 음악 파일(100MB wav)을 끌어다 놓기·열기**: JSON 직렬화를 거치면 몇 초씩 멈춘다. → Task 11 `readAudio of a dropped file reads the File without invoke`, Task 15 체크리스트 항목
3. **저장 안 한 상태에서 업데이트 설치·새로고침**: 확인 없이 닫히거나, 새로고침 뒤 닫기가 영영 막히면 안 된다. → Task 8 `startup clears dirty flag`, Task 13 `install with unsaved changes asks first`
4. **잠긴(EBUSY)·없는·권한 없는 설정 파일**: Node와 같은 오류 코드가 나와야 기존 처리(깨진 파일 옮기기, 읽기 실패 시 덮어쓰지 않기)가 그대로 동작한다. → Task 9 `maps_io_errors_to_codes`
5. **베타 동안 Electron과 Tauri를 함께 켬**: 같은 `settings.json`을 쓴다. 마지막에 쓴 쪽이 이겨도 되지만, 파일이 반쯤 쓰여 깨지면 안 된다. → Task 9 `atomic_write_concurrent_never_partial`

---

### Task 0: 실험 — electron-updater가 Tauri 설치 파일로 넘겨주는지 (버리는 코드)

**Files:**
- Create: `docs/superpowers/notes/2026-11-tauri-handoff-spike.md` (결과만 남긴다. 실험 코드는 스크래치 폴더에 두고 커밋하지 않는다)

이 태스크는 TDD가 아니다. 결과에 따라 Task 14의 NSIS hook 내용과 대안(다리 버전)을 쓸지가 정해진다.

- [ ] **Step 1: 실험용 Electron v0.9.0 빌드**
  - 스크래치 worktree에서 `apps/editor/src/main/update/updater.ts`의 `startUpdater` 첫 줄에 `autoUpdater.setFeedURL({ provider: 'generic', url: 'http://localhost:8080' })`를 넣는다.
  - `npm -w @rcm/editor run dist`로 `RCM-Setup-0.9.0.exe`를 만든다.
- [ ] **Step 2: 실험용 Tauri 1.0.0 빌드**
  - 스크래치 폴더에서 `npm create tauri-app@latest`(vanilla)로 최소 앱을 만든다.
  - `productName: "RCM"`, `identifier: "com.rcm.chart-editor"`, `version: "1.0.0"`, `bundle.targets: ["nsis"]`, `nsis.installMode: "currentUser"`로 둔다.
  - `tauri build`로 설치 파일을 만들고 `RCM-Setup-1.0.0.exe`로 이름을 바꾼다.
- [ ] **Step 3: 업데이트 피드 만들기**
  - 같은 폴더에 `latest.yml`을 둔다. 내용은 `version: 1.0.0`, `files[0].url`·`path`는 설치 파일 이름, `sha512`는 `certutil -hashfile <exe> SHA512` 결과를 base64로 바꾼 값, `size`는 바이트 수, `releaseDate`다.
  - `npx http-server -p 8080`으로 띄운다.
- [ ] **Step 4: 실제 넘기기 확인**
  - 깨끗한 Windows 사용자 계정(또는 VM)에서 v0.9.0을 설치하고 실행한다.
  - 프로젝트 하나를 만들고 프리셋을 하나 저장한다.
  - 업데이트 패널에서 '지금 재시작'을 누르고 아래를 기록한다.
    1. Tauri 설치 파일이 조용히 실행됐는가
    2. 설치 후 새 앱이 저절로 켜졌는가 (`--force-run` 처리 필요 여부)
    3. 옛 앱이 설치 목록·바로가기에 남았는가
    4. `%APPDATA%\RCM\settings.json`이 그대로인가
- [ ] **Step 5: 옛 앱 제거 방법 확인**
  - `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall /s /f RCM`으로 electron-builder가 등록한 키 이름(GUID)과 `QuietUninstallString`을 기록한다.
  - 그 문자열을 직접 실행해 사용자 데이터가 남는지, 명령이 끝날 때까지 기다리는지(NSIS 제거 프로그램은 임시 폴더로 자신을 복사하고 바로 돌아올 수 있다. 그러면 `_?=<설치 폴더>` 인자가 필요하다) 확인한다.
- [ ] **Step 6: 결과 정리**
  - 노트에 1~4의 결과, 레지스트리 키, 동작하는 제거 명령 형태를 적는다.
  - **결론**을 적는다: "바로 넘기기" 또는 "다리 버전 필요".
  - 사용자에게 결과를 알리고 커밋한다(`docs: Tauri handoff spike results`).

---

### Task 1: 포트와 Node 구현

**Files:**
- Create: `apps/editor/src/shared/host/ports.ts`, `apps/editor/src/shared/host/winPath.ts`, `apps/editor/src/main/host/nodeFs.ts`, `apps/editor/src/main/host/nodeZip.ts`, `apps/editor/src/main/host/nodeHost.ts`
- Test: `apps/editor/test/shared/host/winPath.test.ts`, `apps/editor/test/main/host/nodeFs.test.ts`, `apps/editor/test/main/host/nodeZip.test.ts`

**Interfaces:**
- Produces (`ports.ts`):
  ```ts
  export type HostErrorCode = 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'EACCES' | 'EPERM' | 'EBUSY' | 'EDENIED' | 'EIO'
  export class HostError extends Error { constructor(readonly code: HostErrorCode, message: string) }
  export const errorCode = (err: unknown): string | undefined // HostError와 Node 오류 모두 `.code`
  export interface DirEntry { name: string; isFile: boolean; isDir: boolean }
  export interface FileStat { isFile: boolean; isDir: boolean; size: number }
  export interface HostFs {
    readText(path: string): Promise<string>
    readBytes(path: string): Promise<Uint8Array>
    writeAtomic(path: string, data: string | Uint8Array): Promise<void>
    writeNew(path: string, data: string | Uint8Array): Promise<void> // 있으면 EEXIST
    copy(src: string, dest: string, opts?: { exclusive?: boolean }): Promise<void>
    mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> // 재귀 없이 이미 있으면 EEXIST
    readDir(path: string): Promise<DirEntry[]>
    stat(path: string): Promise<FileStat | null> // 없으면 null
    remove(path: string, opts?: { recursive?: boolean }): Promise<void> // 없으면 그냥 성공
    rename(from: string, to: string): Promise<void>
  }
  export interface HostPath { join(...p: string[]): string; resolve(...p: string[]): string; dirname(p: string): string; basename(p: string): string; extname(p: string): string; isAbsolute(p: string): boolean; caseInsensitive: boolean }
  export interface ZipEntryInfo { name: string; size: number; encrypted: boolean }
  export interface HostZip {
    list(zipPath: string): Promise<ZipEntryInfo[]>
    readText(zipPath: string, name: string): Promise<string>
    extract(zipPath: string, items: { name: string; target: string }[]): Promise<void> // 새 파일로만
    write(dest: string, items: { source: string; name: string; store: boolean }[]): Promise<void> // 원자적
  }
  export interface FileFilter { name: string; extensions: string[] }
  export interface HostDialogs {
    openFiles(o: { title: string; filters?: FileFilter[]; multiple?: boolean }): Promise<string[]> // 취소 = []
    openFolder(o: { title: string; defaultPath?: string }): Promise<string | null>
    saveFile(o: { title: string; defaultPath: string; filters: FileFilter[] }): Promise<string | null>
  }
  export interface HostShell { trash(dir: string): Promise<void>; openFolder(dir: string): Promise<void> }
  export interface HostDirs { appData: string; documents: string; downloads: string }
  ```
- Produces (`winPath.ts`): `export const winPath: HostPath` — `path.win32`과 같은 결과를 내고, `caseInsensitive: true`
- Produces (`nodeFs.ts`): `export const nodeFs: HostFs` — `writeAtomic`은 지금 `atomicWrite.ts` 동작(재시도 포함)을 옮긴다. `atomicWrite.ts`는 이 함수를 다시 내보낸다.
- Produces (`nodeZip.ts`): `export const nodeZip: HostZip`
  - `list`는 yauzl `eachEntry`를 쓰고, 잘못된 이름은 `'ZIP 파일이 손상됐거나 폴더 밖을 가리키는 경로가 들어 있어요'`로 reject한다. 열지 못하면 `'ZIP 파일을 열 수 없어요'`.
  - `extract`는 `flags: 'wx'`로 쓴다.
  - `write`는 fflate `zipSync` 후 `nodeFs.writeAtomic`. `store: true`면 `level: 0`.
- Produces (`nodeHost.ts`): `export const nodePath: HostPath` (`node:path` + `caseInsensitive: process.platform === 'win32'`), `export function nodeHost(): { fs: HostFs; path: HostPath; zip: HostZip }`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `winPath.test.ts`: 아래 입력마다 `winPath.<fn>(x)`가 `path.win32.<fn>(x)`와 같은지 `it.each`로 확인한다.
    - `C:\a\b.txt`, `C:/a/b/`, `\\server\share\x.md`, `C:\a\..\b`, `a\b`, `C:\봄날 ♪\song.json`, `C:\a.b\c`, `.hidden`, `C:\`
    - `join('C:\\a', '..', 'b')`, `resolve('C:\\a', 'b', '..\\c')`
  - `nodeFs.test.ts`:
    - `writeNew rejects EEXIST`: 같은 경로에 두 번 쓰면 `errorCode(err) === 'EEXIST'`
    - `copy exclusive rejects EEXIST`
    - `stat returns null for missing`
    - `remove missing succeeds`
    - `readText missing rejects ENOENT`
  - `nodeZip.test.ts`:
    - `list rejects traversal`: fflate로 `../evil.json` 항목 ZIP을 만들고 `list`가 위 메시지로 reject
    - `write then list round-trips Korean names`: `봄날/song.json` 항목이 그대로 나온다
    - `extract refuses existing target`
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/host apps/editor/test/main/host` → 모듈이 없어 FAIL
- [ ] **Step 3: 구현** — `ports.ts`, `winPath.ts`(드라이브·UNC 루트를 처리하는 작은 구현. `path.win32`를 import하지 않는다), `nodeFs.ts`, `nodeZip.ts`, `nodeHost.ts`
- [ ] **Step 4: 통과 확인** — 같은 명령으로 PASS, `npm test`·`npm run typecheck`도 PASS
- [ ] **Step 5: 커밋** — `refactor(editor): add host ports with Node implementations`

---

### Task 2: 설정 저장소를 포트로 옮기기

**Files:**
- Create: `apps/editor/src/shared/host/settingsStore.ts`, `apps/editor/src/shared/host/guidePaths.ts`
- Modify: `apps/editor/src/main/project/settings.ts`(지운다. 쓰는 곳은 새 모듈을 import), `apps/editor/src/main/guide/guideFiles.ts`(경로 규칙은 `guidePaths.ts`로)
- Test: `apps/editor/test/main/settings.test.ts` → `apps/editor/test/shared/host/settingsStore.test.ts`로 옮긴다(`nodeHost()`와 임시 폴더 사용). `guideFiles.test.ts`의 경로 규칙 부분 → `apps/editor/test/shared/host/guidePaths.test.ts`

**Interfaces:**
- Consumes: Task 1 `HostFs`, `HostPath`, `errorCode`
- Produces (`guidePaths.ts`): `createGuidePaths(path: HostPath): { sanitize(raw: unknown): string[]; add(list: string[], file: string): string[]; same(a: string, b: string): boolean }` — `MAX_GUIDE_FILES = 50`. 문구는 지금 그대로다. 대소문자 무시는 `path.caseInsensitive`를 따른다.
- Produces (`settingsStore.ts`):
  - `export type { Settings, RecentEntry }` (지금 정의를 옮긴다)
  - `touchRecent`, `relinkRecent`, `presetsOf`, `parseSettings(raw: unknown, guide: ReturnType<typeof createGuidePaths>): Settings`
  - `createSettingsStore(o: { fs: HostFs; path: HostPath; file: string; now(): number; log(msg: string, err?: unknown): void }): SettingsStore`
  - `interface SettingsStore { load(): Promise<Settings>; update(mutate: (s: Settings) => void): Promise<void>; exists(): Promise<boolean> }`
  - 동작은 지금 `loadSettings`·`updateSettings`와 같다: 줄 세우기, 깨졌으면 `<file>.broken-<now()>`로 옮기기, ENOENT가 아닌 읽기 오류는 reject.

- [ ] **Step 1: 테스트 옮기기** — 기존 테스트의 `loadSettings(file)` → `store.load()`, `updateSettings(file, fn)` → `store.update(fn)`로 바꾼다. 다음 테스트를 더한다.
  - `update keeps presets when read fails with EBUSY`: `fs.readText`가 `new HostError('EBUSY', '')`로 reject하는 가짜 fs → `update` reject, `writeAtomic` 호출 0번
  - `broken file is renamed with now()`: `now = () => 123` → `settings.json.broken-123`이 생긴다
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/host` → FAIL
- [ ] **Step 3: 구현** — `settingsStore.ts`, `guidePaths.ts`. `ipc.ts`·`discord/register.ts`는 모듈 한 곳에서 `createSettingsStore({ ...nodeHost(), file: settingsFile(), now: Date.now, log: console.error })`로 만든 저장소를 쓴다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `refactor(editor): move settings store onto host ports`

---

### Task 3: 프로젝트 파일 로직을 포트로 옮기기

**Files:**
- Create: `apps/editor/src/shared/host/projectOps.ts`
- Delete: `apps/editor/src/main/project/projectFs.ts`, `chartFiles.ts`
- Test: `apps/editor/test/main/projectFs.test.ts`, `chartFiles.test.ts` → `apps/editor/test/shared/host/projectOps.test.ts`

**Interfaces:**
- Consumes: Task 1 포트
- Produces:
  ```ts
  export function createProjectOps(d: { fs: HostFs; path: HostPath }): ProjectOps
  export interface ProjectOps {
    resolveProjectDir(parentDir: string, title: string): Promise<string>
    makeProjectDir(parentDir: string, title: string): Promise<string>
    validateCreateProjectOptions(raw: unknown): CreateProjectOptions
    createProject(raw: CreateProjectOptions): Promise<string>
    openProjectFiles(dir: string): Promise<ProjectFiles>
    writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void>
    deleteProjectFiles(dir: string, names: string[]): Promise<void>
    summarizeProject(dir: string): Promise<Omit<RecentProject, 'lastOpened'>>
    assertDirectory(dir: string): Promise<void>
    isProjectDir(dir: string): Promise<boolean>
    importProjectAudio(dir: string, source: string): Promise<string>
    removeUnusedAudio(dir: string, songText: string): Promise<void>
    readAudioFile(file: string): Promise<ArrayBuffer>
    readChartFile(file: unknown): Promise<string>
  }
  ```
  - 동작과 문구는 지금 함수 그대로다.
  - 동기 `existsSync`로 하던 이름 겹침 검사는 `readDir` 한 번으로 만든 이름 집합(`path.caseInsensitive`면 소문자)으로 바꾼다. 폴더가 없으면 빈 집합이다.
  - 배타적 복사·만들기(`COPYFILE_EXCL`, `mkdir` EEXIST 재시도)는 `errorCode(e) === 'EEXIST'`로 판단한다.

- [ ] **Step 1: 테스트 옮기기** — `createProjectOps(nodeHost())`로 만든 `ops`를 쓰도록 기존 테스트를 바꾼다. 다음을 더한다.
  - `resolveProjectDir treats case-only duplicates as taken when caseInsensitive`: `nodeHost()`의 path를 `{ ...nodePath, caseInsensitive: true }`로 바꿔 `P` 폴더가 있으면 `p`는 `p (2)`가 된다
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/host/projectOps.test.ts` → FAIL
- [ ] **Step 3: 구현** — `projectOps.ts`. `ipc.ts`·`importZip.ts`는 `const projects = createProjectOps(nodeHost())`를 쓴다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `refactor(editor): move project file logic onto host ports`

---

### Task 4: AI 가이드 파일·타격 이펙트 파일·ZIP을 포트로 옮기기

**Files:**
- Create: `apps/editor/src/shared/host/guideFiles.ts`, `apps/editor/src/shared/host/hitEffectFiles.ts`, `apps/editor/src/shared/host/projectZip.ts`
- Delete: `apps/editor/src/main/guide/guideFiles.ts`, `apps/editor/src/main/hitEffectFiles.ts`, `apps/editor/src/main/project/importZip.ts`, `exportZip.ts`
- Test: `guideFiles.test.ts`, `hitEffectFiles.test.ts`, `importZip.test.ts`, `exportZip.test.ts`를 `apps/editor/test/shared/host/`로 옮긴다

**Interfaces:**
- Consumes: Task 1 포트, Task 2 `createGuidePaths`, Task 3 `ProjectOps.makeProjectDir`
- Produces:
  - `createGuideFiles(d: { fs: HostFs }): { syncGuideFile(file: string, text: string): Promise<GuideFile>; syncGuideFiles(files: string[], text: string): Promise<GuideFile[]> }`
  - `createHitEffectFiles(d: { fs: HostFs; path: HostPath }): { importHitEffectFiles(root: string, slot: HitEffectSlot, type: 'sheet' | 'frames', sources: string[]): Promise<string[]>; clearHitEffectFiles(root: string, slot: HitEffectSlot): Promise<void>; readHitEffectFiles(root: string, slot: HitEffectSlot, names: string[]): Promise<Uint8Array[]> }`
  - `createProjectZip(d: { fs: HostFs; path: HostPath; zip: HostZip; projects: ProjectOps }): { importProjectZip(zipPath: string, parentDir: string, limit?: number): Promise<string>; projectZipName(dir: string): Promise<string>; writeProjectZip(dir: string, dest: string): Promise<void> }`
  - `MAX_IMPORT_BYTES = 1024 ** 3`. 크기 검사는 `list`가 돌려준 `size` 합계로 한다. `encrypted`면 `'암호가 걸린 ZIP은 가져올 수 없어요'`.
  - `projectZipName`은 `${sanitizeFolderName(title)}.zip`이고, `writeProjectZip`의 항목 이름은 `${folder}/${file}`이다. 음악은 `store: true`.

- [ ] **Step 1: 테스트 옮기기**
  - `exportZip.test.ts`는 `buildProjectZip`의 바이트 대신 `writeProjectZip(dir, dest)` 후 `unzipSync(readFileSync(dest))`로 같은 내용을 확인한다.
  - 다음을 더한다: `importProjectZip removes the half-made folder when extract fails` — `zip.extract`가 reject하는 가짜 → 만들던 폴더가 없다
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/host` → FAIL
- [ ] **Step 3: 구현** — 세 모듈을 만든다. `ipc.ts`의 ZIP 내보내기는 `projectZipName` → 저장 대화상자 → `writeProjectZip` 순서로 바꾼다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `refactor(editor): move guide, hit effect and zip logic onto host ports`

---

### Task 5: Discord 연결·업데이트 상태·공지사항을 공용으로

**Files:**
- Create: `apps/editor/src/shared/discord/ipcFrame.ts`, `presence.ts`(service), `connection.ts`, `config.ts`; `apps/editor/src/shared/update/updateState.ts`; `apps/editor/src/shared/announcements.ts`; `apps/editor/src/main/discord/nodePipe.ts`
- Delete: `apps/editor/src/main/discord/ipcFrame.ts`, `presence.ts`, `connection.ts`, `config.ts`; `apps/editor/src/main/update/updateState.ts`
- Modify: `apps/editor/src/main/discord/register.ts`, `apps/editor/src/main/update/updater.ts`, `apps/editor/src/main/announcements.ts`, `apps/editor/src/shared/api.ts`(UpdateState import 경로), `apps/web/src/api/index.ts`(공지 함수 재사용)
- Test: `test/main/discord/*`, `test/main/update/updateState.test.ts` → `test/shared/discord/`, `test/shared/update/`. 새로 `test/shared/announcements.test.ts`

**Interfaces:**
- Produces (`ipcFrame.ts`): `encodeFrame(op: number, payload: unknown): Uint8Array`, `class FrameDecoder { push(chunk: Uint8Array): Frame[] }` — `Buffer` 대신 `TextEncoder`·`DataView`를 쓰고, 바이트 결과는 지금과 같다
- Produces (`connection.ts`):
  ```ts
  export interface PipeSocket { write(bytes: Uint8Array): Promise<void>; onData(cb: (b: Uint8Array) => void): void; onClose(cb: () => void): void; destroy(): void }
  export function connectDiscord(clientId: string, d: { openFirstPipe(): Promise<PipeSocket>; pid: number; uuid(): string; warn(msg: string, err?: unknown): void }): Promise<Transport>
  ```
  - 핸드셰이크, READY 5초 제한, PING→PONG, CLOSE 처리는 지금 그대로다.
- Produces (`nodePipe.ts`): `openFirstNodePipe(): Promise<PipeSocket>` — `\\?\pipe\discord-ipc-0..9`를 차례로 연다(지금 `openFirstPipe`)
- Produces (`announcements.ts`): `fetchAnnouncementsWith(fetchFn: typeof fetch, log: (msg: string, err?: unknown) => void): Promise<string | null>` — 지금 규칙(404면 `''`, 실패면 `null`, 크기 한도) 그대로다
- Produces (`updateState.ts`): `UpdateState`, `UpdaterEvent`, `nextState`, `shouldCheck`, `afterAllClosed` (이동)

- [ ] **Step 1: 테스트 옮기기·추가**
  - `connection.test.ts`(새 파일): 가짜 `PipeSocket`으로 아래를 확인한다.
    - `handshake then READY resolves`
    - `PING is answered with PONG`
    - `setActivity frame carries the given pid` (`pid: 4242`)
  - `announcements.test.ts`: 가짜 fetch로 404 → `''`, 500 → `null`, 너무 큰 본문 → `null`
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared` → FAIL
- [ ] **Step 3: 구현** — 이동하고 `register.ts`는 `connectDiscord(DISCORD_CLIENT_ID, { openFirstPipe: openFirstNodePipe, pid: process.pid, uuid: randomUUID, warn: console.warn })`를 쓴다
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `refactor(editor): share discord connection, update state and announcements`

---

### Task 6: `ipc.ts`의 처리 순서를 `createHostApi`로

**Files:**
- Create: `apps/editor/src/shared/host/hostApi.ts`, `apps/editor/src/main/host/electronDialogs.ts`
- Modify: `apps/editor/src/main/ipc.ts`(채널 → `host.<method>` 연결만 남긴다), `apps/editor/src/main/discord/register.ts`
- Test: `apps/editor/test/shared/host/hostApi.test.ts`

**Interfaces:**
- Consumes: Task 2~5의 모든 모듈
- Produces:
  ```ts
  export interface HostDeps {
    fs: HostFs; path: HostPath; zip: HostZip; dialogs: HostDialogs; shell: HostShell; dirs: HostDirs
    now(): number; guideText: string; log(msg: string, err?: unknown): void
  }
  export type HostApi = Pick<RcmApi,
    | 'pickAudioFile' | 'pickFolder' | 'getDefaultProjectDir' | 'resolveProjectDir' | 'createProject' | 'openProject'
    | 'importProjectZip' | 'exportProjectZip' | 'pickProjectZip' | 'readAudio' | 'importProjectAudio' | 'pickChartFiles'
    | 'readChartFile' | 'exportChart' | 'writeProjectFiles' | 'deleteProjectFiles' | 'getRecentProjects'
    | 'removeRecentProject' | 'relinkRecentProject' | 'trashProjects' | 'showInExplorer' | 'saveTextFile'
    | 'getGuideFiles' | 'addGuideFile' | 'removeGuideFile' | 'getPresets' | 'savePresets' | 'setLastPresetId'
    | 'getJudgeOffset' | 'setJudgeOffset' | 'getWhatsNewState' | 'setLastSeenVersion' | 'getDismissedNotices'
    | 'dismissNotice' | 'getSeenAnnouncements' | 'markAnnouncementsSeen' | 'getPlaytestSpeed' | 'setPlaytestSpeed'
    | 'getGameplayLayout' | 'setGameplayLayout' | 'getHitEffects' | 'setHitEffects' | 'pickHitEffect'
    | 'clearHitEffect' | 'readHitEffectImages' | 'getDiscordPresence'>
    & { syncGuideFilesOnStartup(): Promise<void>; saveDiscordPresence(enabled: unknown): Promise<boolean> }
  export function createHostApi(d: HostDeps): HostApi
  ```
  - 설정 파일은 `join(dirs.appData, 'settings.json')`, 이펙트 폴더는 `join(dirs.appData, 'hit-effects')`, 기본 프로젝트 폴더는 `join(dirs.documents, 'RCM Projects')`, 저장 대화상자 기본 위치는 `dirs.downloads`다.
  - 대화상자 제목·필터·문구는 지금 `ipc.ts` 그대로다. 메서드는 지금처럼 `unknown` 인자를 검사한다.
  - `saveDiscordPresence`는 boolean이 아니면 `'설정 값이 올바르지 않아요'`로 reject하고, 저장한 값을 돌려준다(호출한 쪽이 서비스에 반영한다).
- Produces (`electronDialogs.ts`): `electronDialogs: HostDialogs` — `BrowserWindow.getFocusedWindow()`를 부모 창으로 쓴다. `electronShell: HostShell` — `shell.trashItem`, `shell.openPath`(오류 문자열이면 throw).

- [ ] **Step 1: 실패하는 테스트 작성** — `nodeHost()`, 임시 폴더, 가짜 `dialogs`·`shell`로 아래를 확인한다.
  - `createProject records recent and default dir`
  - `trashProjects only trashes dirs in the recent list` (목록에 없는 폴더는 `shell.trash` 호출 0번)
  - `trashProjects skips non-project dirs but drops them from the list`
  - `exportProjectZip returns null when save dialog is cancelled`
  - `addGuideFile rejects non-md before writing`
  - `getWhatsNewState firstRun is true without settings file`
  - `pickHitEffect copies and stores names`
  - `relinkRecentProject rejects a folder without song.json`
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/editor/test/shared/host/hostApi.test.ts` → FAIL
- [ ] **Step 3: 구현** — `hostApi.ts`, `electronDialogs.ts`. `ipc.ts`는 `const host = createHostApi({ ...nodeHost(), dialogs: electronDialogs, shell: electronShell, dirs: { appData: app.getPath('userData'), documents: app.getPath('documents'), downloads: app.getPath('downloads') }, now: Date.now, guideText: chartFormatGuide, log: console.error })`를 만들고 채널마다 `ipcMain.handle('rcm:x', (_e, ...a) => host.x(...a))`만 남긴다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: Electron 수동 확인** — `npm run dev`
  - 새 프로젝트, 저장, 다시 열기, ZIP 내보내기·가져오기, 프리셋 저장, 휴지통, 탐색기에서 보기가 전과 같이 동작한다
- [ ] **Step 6: 커밋** — `refactor(editor): route Electron IPC through shared host api`

---

### Task 7: renderer 공용 준비 (제목 표시줄, 고른 파일 목록)

**Files:**
- Modify: `apps/editor/src/renderer/src/ui/TitleBar.tsx`(바깥 `div`와 제목 `div`에 `data-tauri-drag-region`)
- Create: `apps/editor/src/shared/picked.ts`(`registerPicked`, `getPicked`, `isPickedPath`를 `apps/web/src/api/picked.ts`에서 옮긴다)
- Modify: `apps/web/src/api/picked.ts`(위 세 함수를 `shared/picked`에서 다시 내보낸다. `pickFiles`는 남긴다)
- Test: `apps/web/test/picked.test.ts`가 그대로 통과한다

- [ ] **Step 1: 옮기기·속성 추가**
- [ ] **Step 2: 확인** — `npm test`, `npm run typecheck` PASS, `npm run dev`에서 Electron 창 끌기가 그대로 된다
- [ ] **Step 3: 커밋** — `refactor(editor): share picked-file registry and mark title bar drag region`

---

### Task 8: Tauri 앱 뼈대, 창 조작, 닫기 확인

**Files:**
- Create:
  - `apps/desktop/package.json` (`@rcm/desktop`, version은 `apps/editor/package.json`과 같게)
  - `apps/desktop/index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.ts`, `src/env.d.ts`, `src/api/index.ts`, `src/api/invoke.ts`, `src/api/window.ts`
  - `apps/desktop/src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `icons/*`, `src/main.rs`, `src/lib.rs`, `src/paths.rs`, `src/window.rs`, `src/navigation.rs`
- Modify: 루트 `package.json`(`dev:desktop`, `typecheck`에 `tsc -p apps/desktop`), `vitest.config.ts`(`apps/desktop/test/**/*.test.ts` 포함), `.gitignore`(`apps/desktop/src-tauri/target`, `apps/desktop/dist`)
- Test: `apps/desktop/test/window.test.ts`, `src-tauri/src/window.rs` 안의 `#[cfg(test)]`

**Interfaces:**
- Produces (Rust):
  - `paths::app_data_dir() -> PathBuf` — `dirs::data_dir()/"RCM"`(디버그 빌드는 `"RCM Dev"`)
  - `#[tauri::command] fn app_paths() -> AppPaths { app_data: String, documents: String, downloads: String }`
  - `struct DirtyState(Mutex<bool>)`
  - `#[tauri::command] fn set_dirty(dirty: bool, state)`
  - `#[tauri::command] fn force_close(window, state)` — dirty를 false로 하고 `window.close()`
  - `on_window_event`의 `CloseRequested`: dirty면 `api.prevent_close()` 후 `close-requested` 이벤트를 보낸다
  - `navigation::is_allowed(url: &Url, dev_url: Option<&Url>) -> bool` — 지금 `main/navigation.ts`와 같은 규칙(앱 페이지 origin만 허용)이다. 작은 plugin의 `on_navigation`에 건다. 새 창 열기 요청은 모두 거절한다.
- Produces (TS `invoke.ts`): `export type Invoke = <T>(cmd: string, args?: Record<string, unknown> | Uint8Array, options?: { headers: Record<string, string> }) => Promise<T>` — 진짜는 `@tauri-apps/api/core`의 `invoke`
- Produces (TS `window.ts`):
  ```ts
  export interface WindowDeps { invoke: Invoke; listen(event: string, cb: () => void): Promise<() => void>; win: { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean> } }
  export function createWindowApi(d: WindowDeps): Pick<RcmApi, 'setDirty' | 'onCloseRequested' | 'forceClose' | 'minimize' | 'toggleMaximize' | 'close' | 'isMaximized'> & { start(): Promise<void>; fireCloseRequested(): void }
  ```
  - `start()`는 `set_dirty(false)`를 부르고 `close-requested`를 듣는다(새로고침하면 닫기가 막히지 않게).
  - `fireCloseRequested()`는 Task 13이 쓴다.
- Produces (`src/api/index.ts`): `createDesktopApi(deps: DesktopDeps): Promise<RcmApi>` — 이 태스크에서는 창 메서드와 `capabilities`(preload와 같은 값)만 진짜다. 나머지는 `Promise.reject(new Error('아직 준비 중이에요'))`를 돌려주고 Task 11에서 채운다.
- 설정값:
  - `tauri.conf.json`: Global Constraints의 창 값, `productName`, `identifier`, `"version": "../package.json"`
  - `build`: `devUrl: http://localhost:1420`, `frontendDist: ../dist`, `beforeDevCommand: npm run dev:vite`, `beforeBuildCommand: npm run build:vite`
  - `bundle.targets: ["nsis"]`, `windows.webviewInstallMode: { type: "downloadBootstrapper" }`, `nsis.installMode: "currentUser"`
  - CSP는 `apps/editor/src/main/index.ts`의 `contentSecurityPolicy(false)`와 같은 지시어를 쓴다. `connect-src`에 `ipc: http://ipc.localhost https://raw.githubusercontent.com`을 더한다(공지는 Task 11에서 화면이 받는다).
  - `capabilities/default.json`: `core:default`, `core:window:allow-minimize`, `allow-toggle-maximize`, `allow-close`, `allow-is-maximized`, `allow-start-dragging`
  - `vite.config.ts`: `root`는 `apps/desktop`, `server.port: 1420`, `strictPort`, `fs.allow`는 저장소 루트. `define.__AI_GUIDE_UPDATED_AT__`는 `apps/editor/guideUpdatedAt`, alias `@renderer`. `build.target: 'es2022'`
  - `src/main.ts`: `window.rcm = await createDesktopApi(realDeps)` 후 `await import('../../editor/src/renderer/src/main')`
  - 아이콘: `npx tauri icon apps/editor/build/icon.png`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `window.test.ts`(가짜 deps):
    - `startup clears dirty flag` — `start()` 후 `invoke('set_dirty', { dirty: false })`가 불렸다
    - `onCloseRequested callback runs on event and unsubscribes`
  - `window.rs`: `close_guard_decision(dirty: bool) -> CloseDecision`(순수 함수)이 dirty면 `Prevent`, 아니면 `Allow`
  - `navigation.rs`: `blocks_external_navigation`(`https://example.com` 거부), `allows_app_origin`(`http://tauri.localhost/index.html`, 개발 모드 `http://localhost:1420/x` 허용). `apps/editor/test/main/navigation.test.ts`의 경우를 옮겨 쓴다.
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/desktop/test`, `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` → FAIL
- [ ] **Step 3: 구현** — 위 파일들을 만든다
- [ ] **Step 4: 통과 확인** — 두 명령 PASS, `npm run typecheck` PASS
- [ ] **Step 5: 수동 확인** — `npm run dev:desktop`
  - 창이 뜨고 홈 화면이 그려진다(데이터 호출 오류는 이 단계에서 정상이다)
  - 제목 표시줄로 끌기, 최소화, 최대화, 닫기가 된다
  - 개발자 도구에서 `rcm.setDirty(true)` 후 닫기를 누르면 저장 확인이 뜬다
  - 개발자 도구에서 `location.href = 'https://example.com'`이 막힌다
- [ ] **Step 6: 커밋** — `feat(desktop): Tauri shell with window controls and close guard`

---

### Task 9: Rust 파일 명령과 `tauriFs`

**Files:**
- Create: `apps/desktop/src-tauri/src/fs.rs`, `src/error.rs`, `apps/desktop/src/api/tauriFs.ts`
- Modify: `src-tauri/src/lib.rs`(명령 등록, `CreatedDirs` 상태)
- Test: `fs.rs`·`error.rs` 안의 `#[cfg(test)]`(`tempfile`), `apps/desktop/test/tauriFs.test.ts`

**Interfaces:**
- Consumes: Task 1 `HostFs`, `HostError`, `HostErrorCode`
- Produces (Rust):
  - `#[derive(Serialize)] struct HostError { code: &'static str, message: String }`
  - `fn code_of(e: &io::Error) -> &'static str` — NotFound→ENOENT, AlreadyExists→EEXIST, PermissionDenied→EACCES, raw os 32·33→EBUSY, raw os 267→ENOTDIR, 그 밖은 EIO. 경로 검사 거부는 EDENIED.
  - 명령(모든 경로는 절대 경로가 아니면 EDENIED):
    - `fs_read_text(path) -> String`
    - `fs_read_bytes(path) -> tauri::ipc::Response`
    - `fs_write_text(path, text, mode: "atomic" | "new")`
    - `fs_write_bytes(request: tauri::ipc::Request)` — 본문은 `InvokeBody::Raw`, 헤더 `rcm-path`(percent-encoded), `rcm-mode`
    - `fs_copy(src, dest, exclusive)`, `fs_mkdir(path, recursive)`(만든 폴더를 `CreatedDirs`에 넣는다)
    - `fs_read_dir(path) -> Vec<DirEntry>`, `fs_stat(path) -> Option<FileStat>`
    - `fs_remove(path, recursive)` — 재귀가 아니면 디렉터리일 때 EDENIED. 재귀면 `path`가 앱 데이터 폴더 안(`..` 조각 없음)이거나 `CreatedDirs`에 있어야 한다(Windows는 대소문자 무시 비교). 없으면 성공.
    - `fs_rename(from, to)`
  - `atomic_write(path, bytes)` — 같은 폴더의 `<name>.tmp-<pid>-<n>`에 쓰고 rename한다. PermissionDenied·EBUSY면 `10ms × 시도` 간격으로 10번까지 다시 시도하고, 실패하면 임시 파일을 지운다.
- Produces (TS): `createTauriFs(invoke: Invoke): HostFs`
  - Rust의 `{ code, message }` 오류를 `new HostError(code, message)`로 바꾼다.
  - `Uint8Array` 쓰기는 `invoke('fs_write_bytes', bytes, { headers: { 'rcm-path': encodeURIComponent(path), 'rcm-mode': mode } })`로 보낸다.
  - `readBytes`는 `new Uint8Array(await invoke<ArrayBuffer>(...))`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - Rust:
    - `maps_io_errors_to_codes`: NotFound·AlreadyExists·PermissionDenied·`from_raw_os_error(32)`가 각 코드로 바뀐다
    - `write_new_rejects_existing`
    - `fs_write_bytes_korean_path`: `봄날 ♪/x.bin` 경로를 percent-encode한 헤더 값을 디코딩해 쓰고 읽으면 같다
    - `remove_refuses_dir_without_recursive`
    - `remove_recursive_refuses_outside_app_data_and_created`
    - `remove_recursive_allows_created_dir`
    - `rejects_relative_paths`
    - `atomic_write_concurrent_never_partial`: 두 스레드가 100번씩 각자 1MB 내용을 쓰고, 마지막에 읽은 파일이 둘 중 하나와 정확히 같다
  - TS(`tauriFs.test.ts`, 가짜 invoke):
    - `maps rust errors to HostError with code`
    - `tauriFs encodes path header` — `C:\\봄날 ♪\\a.bin`이 `encodeURIComponent` 결과로 헤더에 담긴다
    - `stat passes null through`
- [ ] **Step 2: 실패 확인** — `cargo test …`, `npx vitest run apps/desktop/test/tauriFs.test.ts` → FAIL
- [ ] **Step 3: 구현** — `fs.rs`, `error.rs`, `tauriFs.ts`
- [ ] **Step 4: 통과 확인** — 두 명령 PASS
- [ ] **Step 5: 커밋** — `feat(desktop): Rust file commands behind HostFs`

---

### Task 10: Rust ZIP·휴지통·폴더 열기·경로

**Files:**
- Create: `apps/desktop/src-tauri/src/zip.rs`, `src/shell.rs`, `apps/desktop/src/api/tauriZip.ts`, `apps/desktop/src/api/tauriShell.ts`
- Modify: `src-tauri/src/lib.rs`
- Test: `zip.rs`·`shell.rs` 안의 `#[cfg(test)]`, `apps/desktop/test/tauriZip.test.ts`

**Interfaces:**
- Consumes: Task 1 `HostZip`, `HostShell`, Task 9 `HostError`, `atomic_write`
- Produces (Rust):
  - `zip_list(path) -> Vec<ZipEntryInfo { name, size, encrypted }>` — `enclosed_name()`이 `None`이면 `'ZIP 파일이 손상됐거나 폴더 밖을 가리키는 경로가 들어 있어요'`, 열지 못하면 `'ZIP 파일을 열 수 없어요'`
  - `zip_read_text(path, name) -> String`
  - `zip_extract(path, items: Vec<{ name, target }>)` — `create_new`로 열고, 항목에 적힌 `size`보다 1바이트라도 더 풀리면 그 파일을 지우고 EIO
  - `zip_write(dest, items: Vec<{ source, name, store }>)` — `store`면 `Stored`, 아니면 `Deflated`. 임시 파일에 쓴 뒤 `atomic_write`와 같은 rename
  - `trash_project(dir)` — 절대 경로이고 `dir`이 폴더이며 `dir/song.json`이 파일일 때만 `trash::delete`, 아니면 EDENIED
  - `open_folder(dir)` — 이미 있는 폴더일 때만 `explorer.exe <dir>`를 실행하고, 아니면 `'폴더를 찾을 수 없어요'`
- Produces (TS): `createTauriZip(invoke: Invoke): HostZip`, `createTauriShell(invoke: Invoke): HostShell`

- [ ] **Step 1: 실패하는 테스트 작성** (Rust)
  - `list_rejects_traversal` (`../evil.json`)
  - `list_rejects_absolute` (`C:/x.json`)
  - `write_then_list_roundtrip_korean` (`봄날 ♪/song.json`)
  - `extract_refuses_existing_target`
  - `#[cfg(windows)] extract_case_only_duplicates_fails` (`A.chart.json`·`a.chart.json`)
  - `trash_refuses_dir_without_song_json`
  - TS: `tauriZip passes items unchanged and maps errors`
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat(desktop): Rust zip, trash and explorer commands`

---

### Task 11: PC용 `RcmApi` 연결

**Files:**
- Create: `apps/desktop/src/api/dialogs.ts`, `apps/desktop/src/api/picked.ts`
- Modify: `apps/desktop/src/api/index.ts`, `apps/desktop/src/main.ts`, `src-tauri/capabilities/default.json`(`dialog:allow-open`, `dialog:allow-save`), `src-tauri/Cargo.toml`·`lib.rs`(`tauri-plugin-dialog`), `apps/desktop/package.json`(`@tauri-apps/plugin-dialog`)
- Test: `apps/desktop/test/api.test.ts`

**Interfaces:**
- Consumes: Task 6 `createHostApi`, Task 7 `shared/picked`, Task 8 `createWindowApi`, Task 9·10 포트, Task 1 `winPath`, Task 5 `fetchAnnouncementsWith`
- Produces:
  ```ts
  export interface DesktopDeps extends WindowDeps {
    invoke: Invoke
    dialogs: HostDialogs // 진짜는 createTauriDialogs(): plugin-dialog open/save
    appVersion(): Promise<string>
    isDev: boolean
    fetch: typeof fetch
  }
  export function createDesktopApi(d: DesktopDeps): Promise<RcmApi>
  ```
  - 시작할 때: `app_paths`를 부르고, `fs.remove(join(appData, 'tmp'), { recursive: true })`를 실행하고, `host.syncGuideFilesOnStartup()`을 기다리지 않고 시작한다.
  - `pathForFile(file)` → `registerPicked(file)`
  - `materialize(path): Promise<string>`(`picked.ts`): `picked:` 경로면 `File` 바이트를 `join(appData, 'tmp', 'picked', <n>, file.name)`에 `writeNew`하고 그 경로를 돌려준다. 아니면 그대로 돌려준다.
    - `importProjectZip`, `readChartFile`, `importProjectAudio`(source), `createProject`(`audioPath`)가 거쳐 간다.
  - `readAudio(path)`: `picked:`면 `getPicked(path).arrayBuffer()`, 아니면 `host.readAudio(path)`
  - `isPackaged` → `!isDev`
  - `getAppVersion` → `appVersion()`
  - `fetchAnnouncements` → `fetchAnnouncementsWith(fetch, console.error)`
  - `getAutoSave` → `false`, `setAutoSave`·`closeProject` → 아무것도 안 함, `getStorageUsage` → `null` (preload와 같음)
  - Discord·업데이트 메서드는 Task 12·13에서 채운다. 그 전에는 Discord 관련 메서드가 아무것도 하지 않고, 업데이트 상태는 `{ kind: 'idle' }`다.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 invoke가 메모리 파일 시스템을 흉내 낸다)
  - `dropped zip is written under appData tmp before import` — `importProjectZip(registerPicked(new File([zipBytes], 'a.zip')))` → `fs_write_bytes`의 `rcm-path`가 `<appData>\tmp\picked\`로 시작한다
  - `readAudio of a dropped file reads the File without invoke`
  - `startup clears appData tmp`
  - `capabilities match the Electron preload`
- [ ] **Step 2: 실패 확인** — `npx vitest run apps/desktop/test/api.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm test`, `npm run typecheck` PASS
- [ ] **Step 5: 수동 확인** — `npm run dev:desktop`
  - 새 프로젝트(음악 있음·없음, 레인형·자유형), 열기, 저장
  - ZIP 내보내기·가져오기, 홈과 편집 화면에 ZIP·음악·채보 끌어다 놓기
  - 휴지통, 탐색기에서 보기, 프리셋, 레이아웃, 판정 오프셋, 공지사항, AI 가이드 파일 추가, 타격 이펙트 바꾸기
  - 최근 목록이 Electron 개발 모드에서 쓰던 것과 별개(`RCM Dev`)인지 확인한다
- [ ] **Step 6: 커밋** — `feat(desktop): wire RcmApi to shared host logic`

---

### Task 12: Discord pipe (Rust)

**Files:**
- Create: `apps/desktop/src-tauri/src/discord.rs`, `apps/desktop/src/api/tauriPipe.ts`
- Modify: `src-tauri/Cargo.toml`(`tokio`의 `net`, `io-util`), `lib.rs`, `apps/desktop/src/api/index.ts`
- Test: `discord.rs` 안의 `#[cfg(test)]`, `apps/desktop/test/tauriPipe.test.ts`

**Interfaces:**
- Consumes: Task 5 `PipeSocket`, `connectDiscord`, `createDiscordPresence`, `DISCORD_CLIENT_ID`; Task 6 `HostApi.saveDiscordPresence`, `getDiscordPresence`
- Produces (Rust):
  - `pipe_open(app) -> Result<(), HostError>` — `tokio::net::windows::named_pipe::ClientOptions`로 `\\?\pipe\discord-ipc-0..9`를 차례로 연다. `tokio::io::split` 후 읽기 작업은 받은 바이트마다 `discord-pipe-data`(Vec<u8>), 끝나거나 오류면 `discord-pipe-closed`를 보낸다. 이미 열려 있으면 먼저 닫는다.
  - `pipe_write(data: Vec<u8>)`, `pipe_close()`, `process_id() -> u32`
  - `fn pipe_name(i: u8) -> String`
- Produces (TS): `createTauriPipe(d: { invoke: Invoke; listenBytes(event: string, cb: (b: Uint8Array) => void): Promise<() => void>; listen: WindowDeps['listen'] }): () => Promise<PipeSocket>`
  - `index.ts`: `setPresence` → 서비스 `setInfo`(지금 `register.ts`처럼 형식 검사). `setDiscordPresence(raw)` → `host.saveDiscordPresence(raw)` 후 `service.setEnabled`. 시작할 때 `service.setEnabled(await host.getDiscordPresence())`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - Rust `pipe_name_format`: `pipe_name(3) == r"\\?\pipe\discord-ipc-3"`
  - TS:
    - `socket forwards data events and close`
    - `destroy calls pipe_close once`
    - `setDiscordPresence(false) disables service`
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 수동 확인** — Discord를 켜 두고 `npm run dev:desktop`. 편집 화면에서 프로필에 활동이 보이고, 설정에서 끄면 사라진다
- [ ] **Step 6: 커밋** — `feat(desktop): Discord presence over Rust named pipe`

---

### Task 13: 자동 업데이트

**Files:**
- Create: `apps/desktop/src/api/updater.ts`
- Modify: `apps/desktop/src/api/index.ts`, `src-tauri/Cargo.toml`·`lib.rs`(`tauri-plugin-updater`, `tauri-plugin-process`), `tauri.conf.json`(`bundle.createUpdaterArtifacts: true`, `plugins.updater.endpoints`·`pubkey`·`windows.installMode: "passive"`), `capabilities/default.json`(`updater:default`, `process:allow-restart`), `apps/desktop/package.json`
- Test: `apps/desktop/test/updater.test.ts`

**Interfaces:**
- Consumes: Task 5 `nextState`, `shouldCheck`; Task 8 `fireCloseRequested`
- Produces:
  ```ts
  export interface UpdateHandle { version: string; download(onPercent: (p: number) => void): Promise<void>; install(): Promise<void> }
  export interface DesktopUpdater {
    getState(): UpdateState; check(): UpdateState; onState(cb: (s: UpdateState) => void): () => void
    requestInstall(dirty: boolean): Promise<void>; forceCloseInstead(): Promise<boolean>; cancelInstall(): void
  }
  export function createDesktopUpdater(d: { enabled: boolean; check(): Promise<UpdateHandle | null>; currentVersion: string; firstCheckDelayMs: number; setTimeout: typeof setTimeout; fireCloseRequested(): void }): DesktopUpdater
  ```
  - `enabled: false`(개발 모드)면 상태는 `idle`로 고정이고 확인하지 않는다.
  - 첫 확인은 5000ms 뒤다. `check()`가 `null`이면 `not-available(currentVersion)`, 오류면 `error`. 받으면 `available` → `progress` → `downloaded` 순서로 상태를 바꾼다.
  - `requestInstall(dirty)`: `ready`가 아니면 아무것도 안 한다. dirty면 `fireCloseRequested()`만 부르고(설치 요청 기억), 아니면 `install()`.
  - `forceCloseInstead()`: 설치 요청이 있고 `ready`면 `install()` 후 `true`. 아니면 `false`(호출한 쪽이 `force_close`).
  - `cancelInstall()`: 설치 요청을 지운다.
  - `index.ts` 연결: `installUpdate` → `requestInstall(dirty)`, `forceClose` → `forceCloseInstead()`가 false면 창 `forceClose`, `closeCancelled` → `cancelInstall()`
- **사용자 작업(구현자는 사용자에게 부탁한다):**
  - `! npx tauri signer generate -w %USERPROFILE%\.tauri\rcm-updater.key`로 키를 만든다.
  - 공개 키를 `tauri.conf.json`의 `pubkey`에 넣는다.
  - 개인 키와 비밀번호를 안전한 곳에 백업한다. GitHub Secret 등록은 Task 14에서 한다.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 handle·타이머)
  - `dev mode stays idle and never checks`
  - `first check after 5000ms`
  - `download progress then ready`
  - `ready survives a later check error` (`nextState` 규칙)
  - `install with unsaved changes asks first` — `requestInstall(true)` → `fireCloseRequested` 1번, `install` 0번 → `forceCloseInstead()` → `install` 1번, 결과 `true`
  - `cancel clears the request` — `requestInstall(true)`, `cancelInstall()`, `forceCloseInstead()` → `false`, `install` 0번
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS, `npm run typecheck` PASS
- [ ] **Step 5: 커밋** — `feat(desktop): in-app updates with tauri-plugin-updater`

---

### Task 14: 설치 hook, 업데이트 피드, 릴리스 CI

**Files:**
- Create:
  - `apps/desktop/src-tauri/windows/hooks.nsh`
  - `scripts/updateFeeds.mjs`, `scripts/write-feeds.mjs`
  - `scripts/test/updateFeeds.test.ts`
- Modify:
  - `tauri.conf.json`(`bundle.windows.nsis.installerHooks: "./windows/hooks.nsh"`)
  - `scripts/check-tag.mjs`(`apps/editor`·`apps/desktop` 두 package.json이 모두 태그와 같아야 한다)
  - `scripts/release.mjs`(`npm version`을 `@rcm/editor`·`@rcm/desktop` 둘 다에 적용하고, 두 package.json을 `git add`)
  - `.github/workflows/release.yml`(Windows job)

**Interfaces:**
- Consumes: Task 0 노트(레지스트리 키, 제거 명령 형태, `--force-run` 필요 여부)
- Produces:
  - `electronLatestYml(o: { version: string; fileName: string; sha512: string; size: number; releaseDate: string }): string` — electron-updater 형식(`version`, `files[0].url/sha512/size`, `path`, `sha512`, `releaseDate`)
  - `tauriLatestJson(o: { version: string; notes: string; pubDate: string; url: string; signature: string }): string` — `{ version, notes, pub_date, platforms: { 'windows-x86_64': { signature, url } } }`
  - `write-feeds.mjs <exe> <sig> <version> <notesFile> <outDir>`: sha512(base64)와 크기를 계산해 `latest.yml`·`latest.json`을 쓴다. url은 `https://github.com/glglekdy/RCM/releases/download/v${version}/RCM-Setup-${version}.exe`
  - `hooks.nsh`:
    - `NSIS_HOOK_PREINSTALL`: Task 0에서 확인한 Uninstall 키의 `QuietUninstallString`이 있으면 확인한 형태로 실행하고 끝날 때까지 기다린다
    - `NSIS_HOOK_POSTINSTALL`: 명령줄에 `--force-run`이 있으면 `$INSTDIR\RCM.exe`를 실행한다(Task 0에서 필요 없다고 나왔으면 넣지 않는다)
- `release.yml` Windows job 바뀌는 점:
  - `node node_modules/electron/install.js`와 `dist:publish`를 지운다
  - `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`(workspaces: `apps/desktop/src-tauri`)를 추가한다
  - `cargo test`를 추가한다
  - `npm -w @rcm/desktop run build`를 `TAURI_SIGNING_PRIVATE_KEY`·`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Secret으로 실행한다
  - NSIS 결과물을 `RCM-Setup-${version}.exe`(+`.sig`)로 이름을 바꾼다
  - `write-feeds.mjs`를 실행한다
  - 지금 있는 초안 릴리스에 `gh release upload`로 exe, `latest.yml`, `latest.json`을 올린다(`.sig` 내용은 `latest.json`에 들어간다)
  - 설치 파일이 15MB를 넘으면 `::error::`로 실패한다
  - 그 밖의 단계(Secret 확인, 태그 노트, 초안 준비·공개)는 그대로다. Secret 확인에 두 서명 Secret을 더한다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `electronLatestYml matches electron-builder layout`: 알려진 입력의 YAML 문자열 전체를 비교한다
  - `tauriLatestJson has windows-x86_64 platform`
- [ ] **Step 2: 실패 확인** — `npx vitest run scripts/test/updateFeeds.test.ts` → FAIL
- [ ] **Step 3: 구현** — 스크립트, `hooks.nsh`, `check-tag.mjs`, `release.mjs`, `release.yml`
- [ ] **Step 4: 통과 확인** — `npm test` PASS
  - 로컬에서 `npm -w @rcm/desktop run build`가 설치 파일을 만들고 크기가 15MB 이하인지 기록한다
- [ ] **Step 5: 사용자에게 Secret 등록 요청** — `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`(사용자가 GitHub에서 직접 넣는다)
- [ ] **Step 6: 커밋** — `ci: build and publish the Tauri installer with update feeds`

---

### Task 15: 베타 검증

**Files:**
- Create: `docs/superpowers/notes/2026-11-tauri-beta-check.md`(체크리스트 결과, 크기 비교, 넘기기 결과)

- [ ] **Step 1: 크기 비교** — v0.9.0 Electron 설치 파일 크기(GitHub Release)와 새 설치 파일 크기, 설치 후 폴더 크기를 기록한다
- [ ] **Step 2: 체크리스트** — 스펙 4장의 직접 확인 목록을 하나씩 실행하고 결과를 기록한다. 아래 두 가지를 더한다.
  - 100MB wav 끌어다 놓기·열기가 몇 초 안에 끝난다
  - 저장 안 한 상태에서 업데이트 '지금 재시작' → 확인 창 → 취소하면 앱이 남는다
- [ ] **Step 3: 넘기기 확인** — Task 0과 같은 방법(로컬 generic 피드)으로 v0.9.0 → 이번 빌드를 깨끗한 Windows 사용자 계정에서 확인한다. 스펙 성공 기준 2의 항목을 모두 기록한다.
- [ ] **Step 4: 사용자 확인 후 prerelease** — 사용자가 허락하면 `v1.0.0-beta.1` 같은 prerelease로 올린다. 옛 앱은 prerelease를 받지 않는다.
  - 베타 안내에 "Electron 앱과 동시에 켜지 마세요(같은 설정 파일을 써요)"를 적는다.
- [ ] **Step 5: 커밋** — `docs: Tauri beta verification results`

---

### Task 16: 정식 릴리스와 Electron 코드 제거 (베타 확인 후, 사용자 허락을 받고)

**Files:**
- Delete: `apps/editor/src/main/`, `apps/editor/src/preload/`, `apps/editor/electron.vite.config.ts`, `apps/editor/electron-builder.yml`, `apps/editor/test/main/`(Node 포트를 쓰던 테스트 도우미는 `apps/editor/test/helpers/nodeHost.ts`로 옮긴다)
- Modify:
  - `apps/editor/package.json`: electron·electron-builder·electron-updater·electron-vite·yauzl 의존성, `dev`·`build`·`dist` 스크립트를 지운다
  - `apps/editor/tsconfig.json`
  - 루트 `package.json`(`dev` → `dev:desktop`)
  - `apps/web/vite.config.ts`(버전을 `apps/desktop/package.json`에서 읽는다)
  - `scripts/check-tag.mjs`·`release.mjs`(desktop만)
  - `docs/DEVELOPMENT.md`, `README.md`·`README.en.md`의 개발자 안내

- [ ] **Step 1: 정식 릴리스** — 사용자가 허락하면 `npm run release`로 버전을 올리고 태그를 push한다. 첫 정식 릴리스 뒤 실제 v0.9 사용자 한 명 이상(사용자 본인 PC)이 넘어왔는지 확인한다.
- [ ] **Step 2: 제거** — 위 파일을 지우고 Node 포트 테스트 도우미를 옮긴다
- [ ] **Step 3: 확인** — `npm test`, `npm run typecheck`, `cargo test`, `npm -w @rcm/web run build`, `npm run dev:desktop` 모두 정상
- [ ] **Step 4: 커밋** — `chore: remove the Electron app`
