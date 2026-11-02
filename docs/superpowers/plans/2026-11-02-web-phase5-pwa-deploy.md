# 웹 Phase 5 (PWA·자동 저장·배포) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 에디터를 홈 화면에 설치해 오프라인으로 쓰고, 화면이 가려지면 자동 저장되고, 릴리스 태그를 push하면 `glglekdy.github.io/RCM/main/`이 자동으로 갱신되게 한다.

**Architecture:** 렌더러(PC·웹 공용)에 자동 저장 설정 저장소·자동 저장 훅·설치 안내·업데이트 토스트를 넣고, 웹 전용 동작은 `caps()`(웹: `windowControls: false`, `autoSave: true`)로 가른다. 서비스 워커 등록과 `beforeinstallprompt` 수신은 `apps/web/src/main.ts`가 하고, 결과를 렌더러의 작은 저장소 모듈(`web/pwaStore.ts`)에 넘긴다. 배포는 `release.yml`에 독립 `web` job을 더한다.

**Tech Stack:** React 19 + CSS Modules, Vite 8, `vite-plugin-pwa`, vitest(node), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-01-web-mobile-design.md` (3.1 저장 공간, 3.5 자동 저장, 6.3, 7장)

## Global Constraints

- 렌더러 코드 스타일: 세미콜론 없음, 작은따옴표, 2칸 들여쓰기. 폰 CSS는 `:global(html[data-layout^='phone'])`만 쓴다.
- PC 앱은 지금처럼 동작한다: 자동 저장 없음(`caps().autoSave`가 false), 설치 안내·업데이트 토스트·저장 공간 표시 없음.
- 자동 저장은 웹에서 **기본 켬**(`getAutoSave()`는 값이 없으면 true — 이미 구현됨).
- 웹 주소는 `/RCM/main/`(사용자 결정, 스펙 7.2의 `app/` 대신). 배포는 gh-pages 브랜치의 `main/` 폴더만 바꾸고 소개 페이지 파일은 건드리지 않는다. 소개 페이지 버튼은 이미 있다.
- manifest: `name: 'RCM 채보 에디터'`, `short_name: 'RCM'`, `display: 'standalone'`, `background_color`·`theme_color`: `#141414`(`tokens.css`의 `--bg-app`), 아이콘 192·512px(`apps/editor/build/icon.png`에서).
- 서비스 워커: 빌드 결과 전부 precache, `registerType: 'prompt'`, 개발 모드에서 끔.
- 문구(그대로): `새 버전이 있어요`, 버튼 `새로고침`, 설치 버튼 `앱으로 설치`, iPhone 안내 `공유 → 홈 화면에 추가`와 `설치하지 않으면 7일 동안 열지 않았을 때 브라우저가 프로젝트를 지울 수 있어요`, 저장 공간 `사용 중 120MB` 형식, 설정 스위치 `자동 저장`, 설명 `화면이 가려지면 저장하지 않은 변경을 저장해요`.
- 검증: `npm test && npm run typecheck && npm run build:web && npm -w @rcm/editor run build`.
- 커밋은 main에 바로, trailer 두 줄(Co-Authored-By, Claude-Session)을 붙인다. push는 하지 않는다.

## Review Focus

1. 자동 저장 중 저장이 실패(용량 부족) — 대화상자 없이 토스트로만 알리고 dirty 유지. (Task 1 테스트 `autoSaveOnHidden reports failure without throwing`)
2. 자동 저장 중 이미 일반 저장이 진행 중 — `store.save()`가 이어 붙이므로 두 번 써도 안전해야 한다; 훅은 dirty가 아니면 부르지 않는다. (Task 1 `does nothing when clean`)
3. 업데이트 새로고침을 눌렀는데 저장 실패 — 새로고침하지 않고 알린다(편집 내용 보존). (Task 4 `applyUpdate does not reload when save fails`)
4. 이미 설치된 PWA(standalone)나 PC 앱에서 설치 안내가 뜸 — 뜨면 안 된다. (Task 3 `installNoticeKind` 표)
5. `navigator.storage`가 없는 브라우저 — 표시만 생략하고 오류 없음. (Task 2 `readStorageUsage returns null without storage api`)

---

### Task 1: 자동 저장

**Files:**
- Create: `apps/editor/src/renderer/src/editor/autoSave.ts`, `apps/editor/src/renderer/src/settings/autoSaveStore.ts`, `apps/editor/src/renderer/src/settings/AutoSaveSettings.tsx`
- Create: `apps/editor/src/renderer/src/editor/activeSave.ts`
- Modify: `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (beforeunload 효과 옆), `apps/editor/src/renderer/src/settings/SettingsPage.tsx`, `apps/editor/src/renderer/src/App.tsx` (다른 설정 load 옆)
- Test: `apps/editor/test/autoSave.test.ts`

**Interfaces:**
- Produces:
  - `autoSaveStore.ts`: `loadAutoSave(): Promise<void>`, `getAutoSave(): boolean`, `useAutoSave(): boolean`, `setAutoSave(next: boolean): void` — `judgeOffsetStore.ts`와 같은 모양(즉시 반영, `window.rcm.setAutoSave` 저장, 실패 시 되돌림 없이 무시). 기본값 true.
  - `autoSave.ts`: `autoSaveOnHidden(opts: { enabled: boolean; hidden: boolean; dirty: boolean; save: () => Promise<void>; onError: (err: unknown) => void }): Promise<boolean>` — 셋 다 참일 때만 `save`를 부르고 부르면 true. 오류는 `onError`로 넘기고 throw하지 않는다.
  - `activeSave.ts`: `setActiveSave(fn: (() => Promise<void>) | null): void`, `saveActiveIfDirty(): Promise<void>` — 편집 화면이 등록한 "dirty면 저장" 함수를 부른다(없으면 바로 resolve). 실패는 reject로 전달. Task 4가 쓴다.

- [ ] **Step 1: 실패하는 테스트**

```ts
describe('autoSaveOnHidden', () => {
  it('saves when enabled, hidden and dirty', async () => {
    const save = vi.fn(async () => {})
    expect(await autoSaveOnHidden({ enabled: true, hidden: true, dirty: true, save, onError: vi.fn() })).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it.each([
    [false, true, true], [true, false, true], [true, true, false]
  ])('does nothing when clean / visible / disabled (%s,%s,%s)', async (enabled, hidden, dirty) => {
    const save = vi.fn(async () => {})
    expect(await autoSaveOnHidden({ enabled, hidden, dirty, save, onError: vi.fn() })).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
  it('reports failure without throwing', async () => {
    const err = new Error('저장 공간이 부족해요')
    const onError = vi.fn()
    await expect(autoSaveOnHidden({ enabled: true, hidden: true, dirty: true, save: async () => { throw err }, onError })).resolves.toBe(true)
    expect(onError).toHaveBeenCalledWith(err)
  })
})
describe('saveActiveIfDirty', () => {
  it('resolves with nothing registered, calls the registered fn, propagates failure', async () => { /* setActiveSave(null) → resolves; setActiveSave(fn) → fn called once; fn rejects → rejects */ })
})
```

- [ ] **Step 2:** `npx vitest run apps/editor/test/autoSave.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3:** 세 모듈 구현.
- [ ] **Step 4: EditorScreen 연결** — `caps().autoSave`일 때만 `document`의 `visibilitychange`를 듣고 `autoSaveOnHidden({ enabled: getAutoSave(), hidden: document.visibilityState === 'hidden', dirty: store.isDirty(), save: () => { commitFocusedField(); return store.save() }, onError: (e) => toast(\`자동 저장하지 못했어요: ${message}\`) })`. 테스트 플레이 중에도 저장한다(모드를 바꾸지 않는다). 같은 효과에서 `setActiveSave(async () => { if (store.isDirty()) { commitFocusedField(); await store.save() } })`, cleanup에서 `setActiveSave(null)`.
- [ ] **Step 5: 설정 화면** — `AutoSaveSettings`: `Card`(제목 `저장`) 안에 `Switch` 한 줄, 라벨 `자동 저장`, 설명 `화면이 가려지면 저장하지 않은 변경을 저장해요`. `SettingsPage`에서 `caps().autoSave`일 때만 맨 위에 둔다. `App.tsx`에서 `loadAutoSave()`를 다른 설정과 함께 부른다.
- [ ] **Step 6:** 검증 명령 통과 → 커밋 `feat(editor): autosave on hide for web with settings toggle`

---

### Task 2: 저장 공간 유지·사용량 표시 (스펙 3.1)

**Files:**
- Create: `apps/editor/src/renderer/src/home/storageUsage.ts`
- Modify: `apps/editor/src/renderer/src/home/HomeScreen.tsx` (홈 내용 맨 아래), `HomeScreen.module.css`, `apps/web/src/main.ts`
- Test: `apps/editor/test/storageUsage.test.ts`

**Interfaces:**
- Produces: `formatUsage(bytes: number): string` (`사용 중 ${n}MB`, MB = bytes/1024/1024 반올림, 1MB 미만은 `사용 중 1MB 미만`), `readStorageUsage(nav?: { storage?: { estimate?: () => Promise<{ usage?: number }> } }): Promise<string | null>` (기본값 `navigator`; API 없음·실패·usage 없음이면 null).

- [ ] **Step 1: 테스트** — `formatUsage(120 * 1024 * 1024) === '사용 중 120MB'`, `formatUsage(500_000) === '사용 중 1MB 미만'`, `formatUsage(1.6 * 1024 * 1024) === '사용 중 2MB'`; `readStorageUsage({})` → null(`returns null without storage api`), estimate가 reject → null, `{ usage: 120MiB }` → `'사용 중 120MB'`.
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현.
- [ ] **Step 4:** HomeScreen: `!caps().windowControls`일 때 마운트·최근 목록 새로고침 때 읽어서 홈 내용 맨 아래에 작은 회색 글자(`var(--text-tertiary)` 계열 토큰, 12px)로 보여 준다. null이면 안 그린다. `apps/web/src/main.ts`: 렌더러 import 전에 `void navigator.storage?.persist?.().catch(() => {})`.
- [ ] **Step 5:** 검증 → 커밋 `feat(web): request persistent storage and show usage on home`

---

### Task 3: 설치 안내 (스펙 6.3)

**Files:**
- Create: `apps/editor/src/renderer/src/web/pwaStore.ts`, `apps/editor/src/renderer/src/home/InstallNotice.tsx`
- Modify: `apps/editor/src/renderer/src/home/HomeScreen.tsx` (`RuleNotice` 옆, 같은 `styles.notice` 모양), `apps/web/src/main.ts`
- Test: `apps/editor/test/installNotice.test.ts`

**Interfaces:**
- Produces (`pwaStore.ts`, 작은 구독 저장소; 이 파일은 Task 4도 확장한다):
  - `setInstallPrompt(e: { prompt(): Promise<unknown> } | null): void`, `useInstallPrompt()`, `getInstallPrompt()`
  - `installNoticeKind(env: { pc: boolean; standalone: boolean; ios: boolean; canPrompt: boolean }): 'prompt' | 'ios' | null`
  - `isIos(ua: string, maxTouchPoints: number): boolean` — `/iPhone|iPad|iPod/` 또는 (`Macintosh` && maxTouchPoints > 1)
- `INSTALL_NOTICE_ID = 'install-pwa'`

- [ ] **Step 1: 테스트** — `installNoticeKind` 표: pc → null; standalone → null; ios(canPrompt false) → 'ios'; canPrompt → 'prompt'; 둘 다 아님(데스크톱 Firefox 등) → null. `isIos` 표: iPhone UA → true, iPad 데스크톱 UA + 5 터치 → true, Android UA → false, Mac + 0 터치 → false.
- [ ] **Step 2:** FAIL → **Step 3:** 구현.
- [ ] **Step 4:** `apps/web/src/main.ts`가 렌더러 import 전에 `beforeinstallprompt`를 듣고 `preventDefault()` 후 렌더러 모듈을 동적 import해서 `setInstallPrompt(e)` (렌더러 import가 끝나기 전에 온 이벤트는 변수에 보관했다가 넘긴다). `appinstalled`이면 `setInstallPrompt(null)`.
- [ ] **Step 5:** `InstallNotice`: env는 `caps().windowControls`, `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`, `isIos(...)`, `useInstallPrompt() !== null`. 'prompt'면 `앱으로 설치` 버튼(`prompt()` 후 `setInstallPrompt(null)`), 'ios'면 두 안내 문구. 닫기는 `dismiss(INSTALL_NOTICE_ID)`, `isNew`가 거짓이면 안 그린다.
- [ ] **Step 6:** 검증 → 커밋 `feat(web): home screen install notice for android and iphone`

---

### Task 4: PWA(서비스 워커·manifest·업데이트 토스트)

**Files:**
- Modify: `apps/web/package.json` (devDependency `vite-plugin-pwa`), `apps/web/vite.config.ts`, `apps/web/src/main.ts`, `apps/web/src/env.d.ts` (`/// <reference types="vite-plugin-pwa/client" />`)
- Create: `apps/web/public/icons/icon-192.png`, `icon-512.png` (`apps/editor/build/icon.png`를 한 번 줄여 커밋; PowerShell `System.Drawing` 고품질 보간으로 충분)
- Modify: `apps/editor/src/renderer/src/web/pwaStore.ts`, `apps/editor/src/renderer/src/ui/toast.tsx` (액션 토스트), `apps/editor/src/renderer/src/App.tsx`
- Create: `apps/editor/src/renderer/src/web/UpdateReadyToast.tsx`
- Test: `apps/editor/test/pwaUpdate.test.ts`

**Interfaces:**
- Consumes: `saveActiveIfDirty()` (Task 1), `pwaStore.ts` (Task 3)
- Produces: `setUpdateReady(apply: ((reload: boolean) => Promise<void>) | null)`, `useUpdateReady()`; `applyUpdate(deps: { save: () => Promise<void>; update: (reload: boolean) => Promise<void>; onError: (err: unknown) => void }): Promise<void>` — save 성공 후에만 `update(true)`; 실패면 `onError`, update 안 부름.

- [ ] **Step 1: 테스트** — `applyUpdate saves then updates`(호출 순서 save→update(true)), `applyUpdate does not reload when save fails`(update 미호출, onError 1회), pwaStore 구독자가 `setUpdateReady` 때 알림 받음.
- [ ] **Step 2:** FAIL → **Step 3:** 구현.
- [ ] **Step 4: vite-plugin-pwa** — `VitePWA({ registerType: 'prompt', injectRegister: false, manifest: { name, short_name, display, background_color, theme_color, start_url: '/RCM/main/', scope: '/RCM/main/', icons: [192, 512 png, purpose any] }, workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2,ogg,mp3,json}'], maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 }, devOptions: { enabled: false } })`. `apps/web/index.html`에 `<meta name="theme-color" content="#141414">`.
- [ ] **Step 5: 등록** — `main.ts`에서 `import { registerSW } from 'virtual:pwa-register'`; 렌더러 import 뒤 `const updateSW = registerSW({ onNeedRefresh: () => setUpdateReady(updateSW) })`.
- [ ] **Step 6: 토스트** — `toast.tsx`에 `toast(message, { action?: { label: string; onClick: () => void }, sticky?: boolean })` 두 번째 인자를 더한다(기존 호출 그대로 동작). `UpdateReadyToast`(App에서 `!caps().windowControls`일 때 그림)가 `useUpdateReady()`가 생기면 한 번 sticky 토스트 `새 버전이 있어요` + 액션 `새로고침` → `applyUpdate({ save: saveActiveIfDirty, update: apply, onError: (e) => toast(\`저장하지 못해서 새로고침하지 않았어요: ${message}\`) })`. 새로고침 뒤 업데이트 내역은 기존 `checkWhatsNew`가 띄운다(변경 없음).
- [ ] **Step 7:** 검증 + `apps/web/dist`에 `sw.js`·`manifest.webmanifest`·`icons/icon-512.png`가 있는지 `ls`로 확인 → 커밋 `feat(web): installable PWA with offline precache and update prompt`

---

### Task 5: 자동 배포 job과 문서

**Files:**
- Modify: `.github/workflows/release.yml` (새 job `web`), `README.md`, `README.en.md`, `docs/DEVELOPMENT.md`

- [ ] **Step 1: `web` job** — `release`와 독립(needs 없음). `runs-on: ubuntu-latest`, `timeout-minutes: 15`. 단계: `actions/checkout@v7`(`fetch-depth: 0`, AI 가이드 시각 때문) → `actions/setup-node@v7`(node 24, cache npm) → `npm ci` → `node scripts/check-tag.mjs "$GITHUB_REF_NAME"` → `npm test` → `npm run typecheck` → `npm -w @rcm/web run build` → `actions/checkout@v7`로 `ref: gh-pages`, `path: site` → `rm -rf site/main && mkdir site/main && cp -r apps/web/dist/. site/main/` → `site`에서 user `github-actions[bot]` / `41898799+github-actions[bot]@users.noreply.github.com`로 `chore: deploy web ${GITHUB_REF_NAME}` 커밋(변경 없으면 건너뜀) → push. 권한은 기존 `contents: write`. typecheck가 Electron 실행 파일을 요구하지 않는지 확인한다(요구하면 `node node_modules/electron/install.js` 단계를 넣는다).
- [ ] **Step 2: 확인** — `npx --yes yaml-lint`가 없으면 `node -e "require('yaml')"` 대신 `python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/release.yml'))"`로 문법 확인. 실제 실행은 다음 릴리스 태그에서 확인한다.
- [ ] **Step 3: 문서** — README(한·영): 웹 주소 `https://glglekdy.github.io/RCM/main/`, 설치 없이 폰·PC 브라우저에서 편집, 차이점(브라우저 저장소에만 저장·기기 간 이동은 프로젝트 ZIP, 실시간 녹음·앱 내 업데이트·Discord 없음, 자동 저장 기본 켬, 홈 화면 설치 권장). `DEVELOPMENT.md`: `apps/web` 구성(웹 `RcmApi`, IndexedDB), `npm run dev:web -- --host`로 폰 확인, 서비스 워커는 개발 모드에서 꺼짐, 릴리스 태그 push 시 `web` job이 gh-pages `main/`에 배포.
- [ ] **Step 4:** 검증 → 커밋 `ci: deploy web editor to gh-pages on release; docs for web version`
