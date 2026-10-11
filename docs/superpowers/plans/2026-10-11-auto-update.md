# GitHub 배포 + 자동 업데이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 버전 태그 push로 GitHub Actions가 Windows 설치 파일을 공개 저장소 `glglekdy/RCM-releases`에 배포하고, 설치된 앱이 그걸 받아 재시작 알림으로 업데이트한다.

**Architecture:** 배포는 `scripts/release.mjs`(버전·태그) → `.github/workflows/release.yml`(테스트·빌드·electron-builder publish). 앱은 main 프로세스의 `update/` 모듈이 `electron-updater`를 감싸고, 상태 전환·캐시 정리 판단은 순수 함수로 둔다. renderer는 IPC로 상태를 구독해 시작 화면 패널과 하단 알림을 그린다.

**Tech Stack:** 기존 + `electron-updater`, GitHub Actions (`windows-latest`)

**Spec:** `docs/superpowers/specs/2026-10-11-auto-update-design.md` (이하 "업데이트 스펙")

## Global Constraints

- 앱 이름 `productName: RCM`, 설치 프로그램 설명 `RCM - Rhythm Chaebo Maker`, `appId: com.rcm.chart-editor` 유지
- 설치 파일 이름 `RCM-Setup-${version}.${ext}` (공백 없음)
- 배포 저장소: `provider: github`, `owner: glglekdy`, `repo: RCM-releases`, `releaseType: release`. 토큰은 환경변수 `GH_TOKEN` (= Actions Secret `RELEASES_TOKEN`). 로컬 `npm run dist`는 `--publish never`
- 태그 형식 `vX.Y.Z`. 버전 인자 `X.Y.Z` (숫자 세 개, 선행 0 없음)
- updater: `autoDownload = true`, `autoInstallOnAppQuit = true`, `allowDowngrade = false`, `allowPrerelease = false`. 시작 5초 뒤 한 번 + 버튼으로만 확인. `app.isPackaged`가 false면 꺼짐
- UI 문구(한국어 그대로): `업데이트 확인`, `확인 중…`, `최신 버전이에요`, `<버전> 받는 중 <n>%`, `<버전> 준비됨`, `확인하지 못했어요`, 알림 `새 버전 <버전> 준비됨` + `지금 재시작`, 개발 모드 `(개발 모드 · 업데이트 꺼짐)`
- 비밀값(토큰)은 저장소·앱·로그 어디에도 넣지 않는다
- 기존 규칙: renderer는 `window.rcm` API로만 main과 통신, 파일 저장은 원자적, UI는 기존 토큰·컴포넌트
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session: https://claude.ai/code/session_0193KVdVcsVXdi6XcDzTsVW4`

## Review Focus

1. **저장 안 한 채보가 있을 때 `지금 재시작`** — 저장/저장 안 함/취소를 묻고, 취소하면 앱이 그대로 남아야 한다 (설치로 넘어가 작업이 사라지면 안 됨) → Task 3 테스트(설치 요청 흐름 순수 함수) + 수동 확인
2. **오프라인·GitHub 장애에서 앱 시작** — 업데이트 확인 실패가 앱 시작이나 편집을 막지 않고 상태 한 줄만 `확인하지 못했어요` → Task 2 테스트(error 전환) + 수동 확인
3. **받는 중에 `업데이트 확인`을 연타** — 다운로드가 두 번 시작되지 않는다 → Task 2 테스트(`shouldCheck`)
4. **이미 받아 둔 0.1.1이 있는데 0.1.2가 나옴** — 0.1.1 설치 파일이 지워지고 0.1.2 하나만 남는다 → Task 2 테스트(`pendingToDelete`)
5. **태그와 package.json 버전 불일치** — Actions가 배포하지 않고 실패한다 → Task 4의 버전 확인 단계 (스크립트로 검증, 로컬에서 실행해 확인)

---

## 파일 구조

```
scripts/version.mjs                 (새) 순수: parseVersion, compareVersions, isValidVersion
scripts/release.mjs                 (새) npm run release -- X.Y.Z
scripts/check-tag.mjs               (새) Actions: 태그 버전 == apps/editor/package.json 버전 확인
scripts/test/version.test.ts        (새)
package.json                        scripts.release, vitest include에 scripts/test
vitest.config.ts                    include 추가
apps/editor/electron-builder.yml    productName, artifactName, publish, signExecutable
apps/editor/package.json            description, dist 스크립트 --publish never, electron-updater
apps/editor/electron.vite.config.ts electron-updater를 main 번들에 포함
apps/editor/src/main/update/updateState.ts   (새) 순수: UpdateState, nextState, shouldCheck
apps/editor/src/main/update/cache.ts          (새) 순수: installerVersion, pendingToDelete + 정리 실행 함수
apps/editor/src/main/update/updater.ts        (새) electron-updater 연결, IPC 등록, 설치 요청
apps/editor/src/main/index.ts       updater 시작, 설치 요청 시 창 닫기 흐름
apps/editor/src/shared/api.ts, src/preload/index.ts   업데이트 IPC
apps/editor/src/renderer/src/update/updateStore.ts   (새) 상태 구독 + useUpdateState
apps/editor/src/renderer/src/update/UpdatePanel.tsx  (새) 시작 화면 사이드바용
apps/editor/src/renderer/src/update/UpdateNotice.tsx (새) 준비됨 알림
apps/editor/src/renderer/src/update/updateText.ts    (새) 순수: 상태 → 문구
apps/editor/src/renderer/src/home/HomeScreen.tsx     UpdatePanel 한 줄 추가
apps/editor/src/renderer/src/App.tsx                 UpdateNotice 추가
.github/workflows/release.yml       (새)
README.md                           배포 준비·배포 방법
```

**주의 (병합 때):** main 작업 폴더에 커밋 안 된 가이드 작업이 `ipc.ts`, `preload/index.ts`, `shared/api.ts`, `HomeScreen.tsx`를 고치고 있다. 이 계획은 커밋된 main에서 시작하므로 구현 중에는 영향이 없지만, 병합 전에 그 작업을 커밋해야 한다. HomeScreen 변경은 컴포넌트 한 줄 추가로 최소화한다.

---

### Task 1: 릴리스 스크립트

**Files:**
- Create: `scripts/version.mjs`, `scripts/release.mjs`, `scripts/check-tag.mjs`, `scripts/test/version.test.ts`
- Modify: `package.json` (scripts `release`: `node scripts/release.mjs`), `vitest.config.ts` (include `scripts/test/**/*.test.ts`)

**Interfaces:**
- `scripts/version.mjs` (ESM, 순수):
  - `isValidVersion(v: string): boolean` — `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`
  - `compareVersions(a: string, b: string): -1 | 0 | 1` — 숫자 비교
  - `tagFor(v: string): string` → `v${v}`
- `scripts/release.mjs <버전>`: 업데이트 스펙 1.1 순서. 실패 시 한국어 메시지와 종료 코드 1. 성공 시 마지막 줄 `다음 명령으로 배포하세요: git push --follow-tags`
- `scripts/check-tag.mjs <태그>`: 태그가 `v` + `apps/editor/package.json` 버전이면 종료 코드 0, 아니면 `태그 v0.1.2와 앱 버전 0.1.1이 달라요` 출력 후 1. 태그 인자가 없으면 `GITHUB_REF_NAME` 환경변수 사용

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { compareVersions, isValidVersion, tagFor } from '../version.mjs'
it('버전 형식', () => {
  expect(['0.1.0', '1.2.3', '10.0.11'].every(isValidVersion)).toBe(true)
  expect(['1.2', 'v1.2.3', '01.2.3', '1.2.3-beta', '', '1..3'].some(isValidVersion)).toBe(false)
})
it('크기 비교는 숫자로', () => {
  expect(compareVersions('0.1.10', '0.1.9')).toBe(1)
  expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
  expect(compareVersions('0.2.0', '0.2.0')).toBe(0)
  expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
})
it('태그', () => expect(tagFor('0.1.0')).toBe('v0.1.0'))
```

- [ ] **Step 2: `npx vitest run scripts/test` → FAIL → 구현 → PASS**
- [ ] **Step 3: 스크립트 수동 확인** — 커밋 안 된 변경이 있는 상태에서 `npm run release -- 0.1.0` → 거부 메시지. `node scripts/check-tag.mjs v9.9.9` → 불일치 메시지와 종료 코드 1, `node scripts/check-tag.mjs v0.0.0` → 0. (실제 release 실행·태그 생성은 하지 않는다. 했다면 커밋과 태그를 되돌린다)
- [ ] **Step 4: 루트 `npm test`·`npm run typecheck` 통과 후 커밋** — `chore: release and tag check scripts`

### Task 2: main 프로세스 업데이터 + 빌드 설정

**Files:**
- Create: `apps/editor/src/main/update/{updateState,cache,updater}.ts`, `apps/editor/test/main/update/{updateState,cache}.test.ts`
- Modify: `apps/editor/electron-builder.yml`, `apps/editor/package.json`, `apps/editor/electron.vite.config.ts`, `apps/editor/src/main/index.ts`, `apps/editor/src/shared/api.ts`, `apps/editor/src/preload/index.ts`

**Interfaces:**
- `updateState.ts` (electron import 없음):
  - `type UpdateState` — 업데이트 스펙 2.2 그대로 (`idle`, `checking`, `latest{version}`, `downloading{version, percent}`, `ready{version}`, `error{message}`)
  - `type UpdaterEvent = { type: 'checking' } | { type: 'available'; version: string } | { type: 'not-available'; version: string } | { type: 'progress'; percent: number } | { type: 'downloaded'; version: string } | { type: 'error'; message: string }`
  - `nextState(s: UpdateState, e: UpdaterEvent): UpdateState` — available → downloading(0), progress → downloading(같은 버전, `Math.floor(percent)`), not-available → latest, downloaded → ready, error → error. **ready 상태에서는 checking/error/not-available이 와도 ready 유지** (받아 둔 업데이트를 잃지 않음). progress가 downloading이 아닐 때 오면 무시
  - `shouldCheck(s: UpdateState): boolean` — `checking`·`downloading`·`ready`면 false
- `cache.ts`:
  - `installerVersion(fileName: string): string | null` — `RCM-Setup-X.Y.Z.exe` → `'X.Y.Z'`, 아니면 null
  - `pendingToDelete(files: string[], keepVersion: string | null, appVersion: string): string[]` — 설치 파일 중 (버전 ≤ appVersion) 또는 (keepVersion이 있고 버전 ≠ keepVersion)인 것. 설치 파일이 아닌 파일(`update-info.json` 등)은 건드리지 않는다. 버전 비교는 숫자 비교(scripts/version.mjs와 같은 규칙, 이 파일 안에 작은 비교 함수를 둔다)
  - `cleanPendingInstallers(dir: string, keepVersion: string | null, appVersion: string): Promise<void>` — 폴더가 없으면 아무것도 안 함, 지우기 실패는 로그만
- `updater.ts`:
  - `startUpdater(getWindows: () => BrowserWindow[]): void` — `app.isPackaged`가 false면 IPC만 등록하고 상태 `idle` 고정. 패키지면 Global Constraints 설정, 이벤트를 `nextState`로 반영해 모든 창에 `rcm:update-state` 전송, 시작 5초 뒤 확인, 시작할 때 `cleanPendingInstallers(pendingDir, null, app.getVersion())`, `update-available` 때 `cleanPendingInstallers(pendingDir, 새 버전, app.getVersion())`
  - pending 폴더: `autoUpdater`가 쓰는 캐시 폴더의 `pending` 하위 폴더. 경로 계산은 `process.resourcesPath/app-update.yml`의 `updaterCacheDirName`과 `%LOCALAPPDATA%`로 한다 (electron-updater 소스에서 같은 계산을 확인하고 보고서에 근거 기록)
  - IPC: `rcm:get-app-version` → `app.getVersion()`, `rcm:is-packaged` → `app.isPackaged`, `rcm:get-update-state`, `rcm:check-for-updates`(→ `shouldCheck`면 `autoUpdater.checkForUpdates()` 호출, 현재 상태 반환), `rcm:install-update`(→ 3.1의 설치 요청 흐름)
- `shared/api.ts` / preload: `getAppVersion(): Promise<string>`, `isPackaged(): Promise<boolean>`, `getUpdateState(): Promise<UpdateState>`, `checkForUpdates(): Promise<UpdateState>`, `installUpdate(): void`, `onUpdateState(cb: (s: UpdateState) => void): () => void`. `UpdateState` 타입은 shared에서 다시 export
- 설치 요청 흐름 (main/index.ts + updater.ts): `installUpdate`가 오면 `installRequested = true`로 두고 모든 창에 `close()`. 기존 닫기 가드가 저장 안 한 창이면 renderer에 확인을 묻는다(취소하면 창이 남고 설치되지 않음). 모든 창이 닫혀 `window-all-closed`가 오면 `installRequested`면 `autoUpdater.quitAndInstall(true, true)`, 아니면 기존처럼 `app.quit()`. 판단은 순수 함수 `afterAllClosed(installRequested: boolean, updateReady: boolean): 'install' | 'quit'`(`updateState.ts`)로 두고 테스트
- 빌드 설정:
  - `electron-builder.yml`: `productName: RCM`, `artifactName: RCM-Setup-${version}.${ext}`, `publish: { provider: github, owner: glglekdy, repo: RCM-releases, releaseType: release }`, `win.signAndEditExecutable: false` → `win.signExecutable: false`
  - `apps/editor/package.json`: `description: "RCM - Rhythm Chaebo Maker"`, `dist`: `npm run build && electron-builder --win nsis --publish never`, 새 스크립트 `dist:publish`: `npm run build && electron-builder --win nsis --publish always`, `electron-updater`를 devDependencies에 추가
  - `electron.vite.config.ts`: main의 `externalizeDepsPlugin` exclude에 `electron-updater` 추가 (번들에 포함 — 워크스페이스 구조에서 electron-builder가 node_modules를 수집하지 못하므로)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// updateState.test.ts
const s0: UpdateState = { kind: 'idle' }
it('확인 → 받는 중 → 준비됨', () => {
  let s = nextState(s0, { type: 'checking' })
  expect(s).toEqual({ kind: 'checking' })
  s = nextState(s, { type: 'available', version: '0.1.1' })
  expect(s).toEqual({ kind: 'downloading', version: '0.1.1', percent: 0 })
  s = nextState(s, { type: 'progress', percent: 42.7 })
  expect(s).toEqual({ kind: 'downloading', version: '0.1.1', percent: 42 })
  s = nextState(s, { type: 'downloaded', version: '0.1.1' })
  expect(s).toEqual({ kind: 'ready', version: '0.1.1' })
})
it('최신·오류', () => {
  expect(nextState({ kind: 'checking' }, { type: 'not-available', version: '0.1.0' })).toEqual({ kind: 'latest', version: '0.1.0' })
  expect(nextState({ kind: 'checking' }, { type: 'error', message: 'net' })).toEqual({ kind: 'error', message: 'net' })
})
it('준비된 업데이트는 이후 오류·확인으로 사라지지 않는다', () => {
  const ready: UpdateState = { kind: 'ready', version: '0.1.1' }
  expect(nextState(ready, { type: 'error', message: 'x' })).toBe(ready)
  expect(nextState(ready, { type: 'checking' })).toBe(ready)
  expect(nextState(ready, { type: 'not-available', version: '0.1.1' })).toBe(ready)
})
it('받는 중이 아닐 때의 progress는 무시', () => {
  expect(nextState({ kind: 'checking' }, { type: 'progress', percent: 10 })).toEqual({ kind: 'checking' })
})
it('중복 확인 방지', () => {
  expect(shouldCheck({ kind: 'idle' })).toBe(true)
  expect(shouldCheck({ kind: 'latest', version: '1.0.0' })).toBe(true)
  expect(shouldCheck({ kind: 'error', message: '' })).toBe(true)
  expect(shouldCheck({ kind: 'checking' })).toBe(false)
  expect(shouldCheck({ kind: 'downloading', version: '1', percent: 3 })).toBe(false)
  expect(shouldCheck({ kind: 'ready', version: '1' })).toBe(false)
})
it('모든 창이 닫힌 뒤', () => {
  expect(afterAllClosed(true, true)).toBe('install')
  expect(afterAllClosed(true, false)).toBe('quit')
  expect(afterAllClosed(false, true)).toBe('quit')
})

// cache.test.ts
it('설치 파일 버전', () => {
  expect(installerVersion('RCM-Setup-0.1.10.exe')).toBe('0.1.10')
  expect(installerVersion('update-info.json')).toBeNull()
  expect(installerVersion('RCM-Setup-0.1.exe')).toBeNull()
})
it('정리 대상: 설치 끝난 것과 다른 버전', () => {
  const files = ['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.1.exe', 'RCM-Setup-0.1.2.exe', 'update-info.json']
  expect(pendingToDelete(files, null, '0.1.1').sort()).toEqual(['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.1.exe'])
  expect(pendingToDelete(files, '0.1.2', '0.1.0').sort()).toEqual(['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.1.exe'])
  expect(pendingToDelete(['RCM-Setup-0.1.10.exe'], null, '0.1.9')).toEqual([])
})
it('정리 실행: 없는 폴더는 그냥 통과, 대상만 지움', async () => {
  await expect(cleanPendingInstallers(path.join(tmp, 'none'), null, '0.1.0')).resolves.toBeUndefined()
  // tmp에 RCM-Setup-0.1.0.exe, RCM-Setup-0.1.2.exe, update-info.json 생성 후
  await cleanPendingInstallers(tmp, null, '0.1.1')
  expect((await fs.readdir(tmp)).sort()).toEqual(['RCM-Setup-0.1.2.exe', 'update-info.json'])
})
```

- [ ] **Step 2: `npx vitest run apps/editor/test/main/update` → FAIL → 구현 → PASS**
- [ ] **Step 3: updater.ts·IPC·preload·index.ts·빌드 설정 구현. 루트 `npm test`·`npm run typecheck` 통과**
- [ ] **Step 4: `npm run dist` 확인** — `apps/editor/dist/RCM-Setup-0.0.0.exe`와 `latest.yml`이 생기고, `apps/editor/dist/win-unpacked/resources/app-update.yml`에 `owner: glglekdy`, `repo: RCM-releases`가 있음. `out/main/index.js`에 `require("electron-updater")`가 없음(번들됨). `win-unpacked\RCM.exe`를 실행해 오류 없이 뜨는지 확인(릴리스 저장소가 아직 없으면 상태가 `확인하지 못했어요`가 되는 것이 정상) 후 종료. `npm run dev`에서는 업데이트 확인이 꺼져 있는지 확인
- [ ] **Step 5: 커밋** — `feat(editor): auto-update via electron-updater`

### Task 3: renderer — 업데이트 패널·알림

**Files:**
- Create: `apps/editor/src/renderer/src/update/{updateStore.ts,updateText.ts,UpdatePanel.tsx,UpdateNotice.tsx}` (+ css), `apps/editor/test/renderer/update/updateText.test.ts`
- Modify: `apps/editor/src/renderer/src/home/HomeScreen.tsx` (사이드바 아래에 `<UpdatePanel />` 한 줄), `apps/editor/src/renderer/src/App.tsx` (`<UpdateNotice />`)

**Interfaces:**
- Consumes: Task 2의 `window.rcm` 업데이트 API, `UpdateState`
- Produces:
  - `updateStatusText(s: UpdateState): string | null` — idle → null, checking → `확인 중…`, latest → `최신 버전이에요`, downloading → `0.1.2 받는 중 42%`, ready → `0.1.2 준비됨`, error → `확인하지 못했어요`
  - `updateStore`: 앱 시작 때 `getUpdateState()`로 초기값을 받고 `onUpdateState`로 갱신. `useUpdateState(): UpdateState`
  - `UpdatePanel`: `v<버전>` (+ 개발 모드면 ` (개발 모드 · 업데이트 꺼짐)`), `업데이트 확인` 버튼(개발 모드·`checking`·`downloading`이면 비활성), 상태 문구. 오류일 때는 `title`에 오류 메시지
  - `UpdateNotice`: 상태가 `ready`가 되면 하단 가운데 고정 알림 `새 버전 <버전> 준비됨` + `지금 재시작` 버튼(`--accent`) + 닫기(×). 닫으면 같은 버전은 이번 실행 동안 다시 띄우지 않는다. 기존 토스트와 겹치지 않게 토스트보다 위(아래에서 64px)
  - `지금 재시작` → `window.rcm.installUpdate()`. 저장 안 한 채보 확인은 기존 닫기 가드가 처리한다(EditorScreen의 `onCloseRequested` 흐름 그대로)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it.each([
  [{ kind: 'idle' }, null],
  [{ kind: 'checking' }, '확인 중…'],
  [{ kind: 'latest', version: '0.1.1' }, '최신 버전이에요'],
  [{ kind: 'downloading', version: '0.1.2', percent: 42 }, '0.1.2 받는 중 42%'],
  [{ kind: 'ready', version: '0.1.2' }, '0.1.2 준비됨'],
  [{ kind: 'error', message: 'net' }, '확인하지 못했어요'],
])('%#', (s, text) => expect(updateStatusText(s as UpdateState)).toBe(text))
```

- [ ] **Step 2: `npx vitest run apps/editor/test/renderer/update` → FAIL → 구현 → PASS**
- [ ] **Step 3: 패널·알림 구현, 루트 `npm test`·`npm run typecheck` 통과**
- [ ] **Step 4: `npm run dev` 실행 확인 후 종료. 사람이 볼 항목 기록**: 시작 화면에 `v0.0.0 (개발 모드 · 업데이트 꺼짐)`, 버튼 비활성. (실제 업데이트 알림과 재시작은 Task 4 뒤 첫 두 배포로 확인)
- [ ] **Step 5: 커밋** — `feat(editor): update panel and restart notice`

### Task 4: GitHub Actions 워크플로 + README

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md`

**Interfaces:**
- 워크플로 (업데이트 스펙 1.2):
  ```yaml
  name: release
  on:
    push:
      tags: ['v*.*.*']
  permissions:
    contents: read
  jobs:
    release:
      runs-on: windows-latest
      steps: checkout(전체 이력 불필요) → setup-node(node-version 24, cache npm) → npm ci → node node_modules/electron/install.js
             → node scripts/check-tag.mjs (태그는 GITHUB_REF_NAME) → npm test → npm run typecheck
             → npm -w @rcm/editor run dist:publish  (env GH_TOKEN: ${{ secrets.RELEASES_TOKEN }})
  ```
  - 액션 버전은 고정 메이저 태그(`actions/checkout@v4`, `actions/setup-node@v4`)
  - Secret이 비어 있으면 publish 단계 전에 `RELEASES_TOKEN Secret이 없어요` 메시지로 실패하는 단계를 둔다
- README: "배포" 절 — 업데이트 스펙 4장의 1~6을 단계별로(토큰 권한: 저장소 `RCM-releases`만, `Contents: Read and write`), 평소 배포 방법(`npm run release -- X.Y.Z` → `git push --follow-tags`), 실패했을 때 확인할 곳(Actions 탭 로그), 업데이트 파일이 저장되는 위치와 정리 규칙 한 줄

- [ ] **Step 1: 워크플로와 README 작성**
- [ ] **Step 2: 확인** — YAML 문법 확인(`node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release.yml','utf8'))"`, js-yaml은 electron-builder 의존성으로 이미 설치됨), `node scripts/check-tag.mjs v0.0.0` 종료 코드 0. 루트 `npm test`·`npm run typecheck` 통과
- [ ] **Step 3: 커밋** — `ci: release workflow publishing to RCM-releases`
