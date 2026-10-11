# GitHub 배포 + 자동 업데이트 설계

- 작성일: 2026-10-11
- 기반: `docs/superpowers/specs/2026-10-09-chart-editor-design.md`
- 대상: Windows NSIS 설치판 (`apps/editor`)

## 0. 목표

### 사용자가 정한 것
- 소스는 **비공개 개발 저장소 `glglekdy/RCM-Dev`**. 설치 파일은 **공개 릴리스 저장소 `glglekdy/RCM`의 Releases**로 배포
- **버전 태그(`vX.Y.Z`)를 push할 때만** 빌드·배포
- 앱은 **자동 다운로드 + 재시작 알림**. 재시작하지 않으면 종료할 때 설치
- **중복 다운로드·용량 낭비 방지**

### 성공 기준
- `npm run release -- 0.1.1` → `git push --follow-tags` 만으로 `RCM`에 Release v0.1.1이 생긴다
- 0.1.0이 설치된 PC에서 앱을 켜면 0.1.1을 받아 알림을 띄우고, 재시작하면 0.1.1이 된다
- 받아 둔 설치 파일은 최대 한 개이고, 설치 후에는 지워진다

## 1. 배포 파이프라인

### 1.1 `npm run release -- <버전>` (루트 스크립트 → `scripts/release.mjs`)
- 인자는 `X.Y.Z` (숫자 세 개, 선행 0 없음). 아니면 오류로 종료
- 현재 `apps/editor/package.json` 버전보다 커야 한다 (semver 비교). 아니면 오류
- 작업 트리에 커밋 안 된 변경이 있으면 오류 (`git status --porcelain`이 비어 있어야 함)
- `apps/editor/package.json`의 `version`을 바꾸고 `package-lock.json`의 해당 워크스페이스 버전도 맞춘다 (`npm version <버전> -w @rcm/editor --no-git-tag-version`)
- 커밋 `chore: release vX.Y.Z` + 주석 태그 `vX.Y.Z` 생성. **push는 하지 않는다** (마지막에 `git push --follow-tags` 안내 출력)
- 버전 판단 로직(형식 검사, 크기 비교)은 순수 함수로 분리해 테스트한다

### 1.2 GitHub Actions (`.github/workflows/release.yml`, `RCM-Dev` 저장소)
- 트리거: `push` 태그 `v*.*.*`
- 러너: `windows-latest`, Node 24
- 단계: checkout → `npm ci` → `node node_modules/electron/install.js` → 태그 버전과 `apps/editor/package.json` 버전 일치 확인(다르면 실패) → `npm test` → `npm run typecheck` → `npm run dist` → `RCM`에 초안(draft) Release 생성 및 파일 업로드 → 초안에 `latest.yml`과 `RCM-Setup-X.Y.Z.exe`가 있는지 확인 → 초안을 정식 릴리스로 공개
- 업로드 파일: `RCM-Setup-X.Y.Z.exe`, `.exe.blockmap`, `latest.yml`
- 업로드 방법: electron-builder `--publish always`와 `publish` 설정(`provider: github, owner: glglekdy, repo: RCM, releaseType: draft`) 사용, 재실행 시 `EP_GH_IGNORE_TIME=true`로 같은 초안에 다시 올림, 토큰은 `GH_TOKEN` 환경변수 = Secret `RELEASE_TOKEN`
- Release 이름 `vX.Y.Z`(`releaseInfo.releaseName`을 태그 이름으로 지정). 업로드 중에는 초안이라 사용자에게 보이지 않고, 검증을 통과한 뒤 `gh release edit --draft=false`로 공개하므로 최종 상태는 초안이 아닌 정식 릴리스
- 로컬 `npm run dist`는 지금처럼 업로드하지 않는다 (`--publish never`)

### 1.3 앱 이름·설치 파일 이름·아이콘
- 앱 이름(`productName`)은 **`RCM`** (Rhythm Chaebo Maker의 약자). 시작 메뉴·바탕화면 바로가기·설치 프로그램·작업 관리자에 `RCM`으로 표시된다. 설치 프로그램 설명(`description`)은 `RCM - Rhythm Chaebo Maker`
- 설치 파일 이름은 공백 없이: `artifactName: RCM-Setup-${version}.${ext}`
- `appId`는 `com.rcm.chart-editor` 그대로 (설치·업데이트 식별용이라 바꾸지 않는다)
- 앱 이름이 바뀌면 설정 폴더도 `%APPDATA%\RCM Chart Editor` → `%APPDATA%\RCM`으로 바뀐다. 아직 배포 전이라 옮기지 않는다 (지금 PC의 최근 목록·프리셋은 한 번 초기화됨)
- 아이콘: 사용자가 나중에 줄 이미지를 `apps/editor/build/icon.png`(512×512 이상 PNG)로 넣으면 electron-builder가 `.ico`로 변환해 설치 파일·exe·바로가기·창 아이콘에 쓴다. 아이콘을 넣으려면 `win.signAndEditExecutable: false`를 `win.signExecutable: false`로 바꾼다 (서명만 건너뛰고 아이콘·버전 정보는 exe에 기록). 아이콘이 아직 없으면 기본 Electron 아이콘으로 배포된다

## 2. 앱 업데이트 동작

### 2.1 main 프로세스 (`electron-updater`)
- `app.isPackaged`가 false(개발 모드)면 아무것도 하지 않는다
- 설정: `autoDownload = true`, `autoInstallOnAppQuit = true`, `allowDowngrade = false`, `allowPrerelease = false`
- 시작 5초 뒤 한 번 확인. 이후에는 사용자가 `업데이트 확인`을 눌렀을 때만 확인
- 상태(아래 2.2)를 renderer에 `rcm:update-state` 이벤트로 보낸다
- IPC: `getAppVersion(): Promise<string>`, `getUpdateState(): Promise<UpdateState>`, `checkForUpdates(): Promise<UpdateState>`, `installUpdate(): void`, `onUpdateState(cb): () => void`
- `installUpdate`는 저장 안 한 변경 확인(기존 닫기 가드)을 거친 뒤 `autoUpdater.quitAndInstall(true, true)`
- 네트워크 오류는 상태 `error`로만 남기고 앱 동작을 막지 않는다

### 2.2 상태 (순수 모듈 `src/main/update/updateState.ts`)
```
type UpdateState =
  | { kind: 'idle' }                                   // 확인 전 또는 최신
  | { kind: 'checking' }
  | { kind: 'latest'; version: string }                // 지금이 최신
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }                 // 받아 둠, 재시작 대기
  | { kind: 'error'; message: string }
```
- 전환 함수 `nextState(state, event)`로 updater 이벤트(`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`)를 반영
- `shouldCheck(state): boolean` — `checking`, `downloading`, `ready`이면 false (중복 확인·다운로드 방지)

### 2.3 화면
- 시작 화면 사이드바 아래: 현재 버전 `v0.1.1`과 `업데이트 확인` 버튼, 그 아래 상태 한 줄 (`확인 중…`, `최신 버전이에요`, `0.1.2 받는 중 42%`, `0.1.2 준비됨`, `확인하지 못했어요`)
- `ready`가 되면 어느 화면에서든 하단 가운데에 알림: `새 버전 0.1.2 준비됨` + `[지금 재시작]` + 닫기(×). 닫아도 종료할 때 설치된다. 앱을 다시 켜기 전까지 같은 버전 알림은 다시 띄우지 않는다
- 개발 모드에서는 버전 옆에 `(개발 모드 · 업데이트 꺼짐)`

## 3. 용량 보호
- 같은 버전 재다운로드 금지: electron-updater의 다운로드 캐시(`%LOCALAPPDATA%\@rcmeditor-updater\pending`)를 그대로 쓴다. 버전과 sha512가 같으면 다시 받지 않는다
- 받아 둔 설치 파일은 하나만: 새 버전을 받기 시작할 때 캐시 폴더의 이전 설치 파일을 지운다 (electron-updater 기본 동작을 확인하고, 아니면 직접 정리)
- 설치 후 정리: 앱 시작 시 캐시 폴더의 설치 파일 버전이 현재 앱 버전 이하이면 지운다. 판단 함수 `isStaleInstaller(fileVersion, appVersion): boolean`는 순수 함수로 테스트
- 동시 확인 금지: `shouldCheck`가 false면 `checkForUpdates`는 새로 확인하지 않고 현재 상태를 돌려준다
- 차등 다운로드: `.blockmap`을 함께 배포해 바뀐 부분만 받는다 (`differentialPackage` 기본값 유지)

## 4. 일회성 준비 (사용자 작업, README에 단계별로)
1. 지금의 비공개 `glglekdy/RCM`을 **공개**로 바꿔 릴리스 저장소로 쓰고, 비공개 개발 저장소 `glglekdy/RCM-Dev`를 새로 만든다. 로컬 `origin`을 `RCM-Dev`로 바꾼다
2. GitHub → Settings → Developer settings → Fine-grained token: 저장소 `RCM`만, 권한 `Contents: Read and write` → 생성
3. `RCM-Dev` 저장소 → Settings → Secrets and variables → Actions → `RELEASE_TOKEN`으로 등록
4. main을 `RCM-Dev`에 push
5. 첫 배포: `npm run release -- 0.1.0` → `git push --follow-tags` → Actions 성공 확인 → 공개 `RCM` 저장소의 Release v0.1.0 설치
6. 업데이트 확인: `npm run release -- 0.1.1` → push → 설치된 0.1.0 앱을 켜서 알림 확인

## 5. 테스트
- `scripts/release.mjs`의 순수 함수: 버전 형식(`1.2.3` 통과, `1.2`, `v1.2.3`, `01.2.3` 거부), 크기 비교(`0.1.10 > 0.1.9`)
- `updateState.ts`: 각 이벤트 전환, `shouldCheck`, `isStaleInstaller`
- 워크플로 파일은 실제 태그 push로 확인 (자동 테스트 없음)

## 6. 범위 밖
- 코드 서명 (설치 시 SmartScreen 경고 유지)
- macOS·Linux 빌드, 베타 채널
- 앱 안에서 변경 내역(릴리스 노트) 보여 주기
