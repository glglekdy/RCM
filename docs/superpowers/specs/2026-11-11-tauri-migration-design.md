# Tauri 전환 설계

- 작성일: 2026-11-11
- 범위: PC 앱을 Electron에서 Tauri 2로 옮긴다. 화면(React)·`packages/*`·웹 버전은 그대로 쓴다.

## 0. 사용자가 정한 것
- 목적은 **설치 용량 줄이기**다. 설치 파일과 업데이트 내려받기 크기를 줄인다.
- 방식은 **Tauri 2 전환**이다. UI까지 Rust로 다시 쓰지 않고, core·playfield를 WASM으로 옮기지도 않는다.
- Rust는 **운영체제 기능만** 맡는다. 판단 로직(설정 검사, 프리셋 정리, 프로젝트 만들기, 최근 목록)은 TS에 두고 웹과 함께 쓴다.
- 기존 v0.9 사용자는 **아무 조작 없이** 자동 업데이트로 넘어온다. 설정·최근 프로젝트는 잃지 않는다.
- 테스트 플레이가 가끔 끊기는 문제는 **이 작업과 별개**다. Tauri도 같은 Chromium 계열 엔진(WebView2)이라 이 전환으로는 바뀌지 않는다. 전환이 끝난 뒤 따로 측정해서 고친다.

## 1. 기대 효과와 한계
- 설치 파일: Chromium·Node를 같이 싣지 않으므로 지금(약 80~100MB, 실측해서 기록)에서 **15MB 이하**로 줄인다.
- 업데이트도 설치 파일 전체를 받으므로 같은 만큼 줄어든다.
- 엔진 보안 패치는 Windows가 WebView2를 업데이트하며 받는다.
- 메모리·시작 시간은 조금 나아진다(수십 MB 수준).
- 바뀌지 않는 것: 편집·테스트 플레이 렌더링 속도, 오디오 지연, 웹 버전.
- 대가: PC마다 WebView2 버전이 다를 수 있다. Rust 툴체인과 업데이트 서명 키를 관리해야 한다.

## 2. 구조

```
packages/core, packages/playfield     그대로
apps/editor/src/renderer               화면 코드 (Electron·Tauri·웹 공용, 전환 중에도 한 벌)
apps/editor/src/shared/                PC·웹 공용 순수 로직 (main/에서 옮겨 온 것 포함, 2.1)
apps/editor/src/main, preload          Electron 전용. 7단계에서 지운다
apps/web/                              그대로
apps/desktop/                          새로 만든다
  index.html, vite.config.ts           renderer를 Tauri용으로 빌드
  src/main.ts                          window.rcm = createDesktopApi() 후 renderer의 main.tsx 시작
  src/api/                             PC용 RcmApi 구현 (TS). Rust 명령은 invoke로 부른다
  src-tauri/                           Rust
    tauri.conf.json                    창(frame 없음, 1280×800, 최소 1000×640), CSP, 번들(NSIS), updater
    src/main.rs, lib.rs                앱 시작, 플러그인 등록, 창 닫기 확인
    src/fs.rs                          파일 명령 (2.2)
    src/zip.rs                         ZIP 풀기·묶기
    src/discord.rs                     Discord named pipe 읽기·쓰기 (규칙은 TS)
    src/paths.rs                       앱 데이터 폴더 (3.3)
```

### 2.1 TS로 남기는 것 (`shared/host/`로 옮김)
- 지금 `main/`의 로직(설정 저장소, 프로젝트 파일, 채보 파일, AI 가이드 파일, 타격 이펙트 파일, ZIP 가져오기·내보내기, `ipc.ts`의 처리 순서, Discord 연결·전송 규칙, 업데이트 상태)은 `node:fs`·`electron`을 직접 쓰지 않도록 고친다. 대신 **포트**(`HostFs`, `HostPath`, `HostZip`, `HostDialogs`, `HostShell`, `HostDirs`, `PipeSocket`)를 받아 쓰게 하고 `shared/`로 옮긴다.
- Electron `main/`은 Node로 만든 포트를 넣어 이 코드를 쓰고, Tauri 앱은 Rust 명령으로 만든 포트를 넣어 같은 코드를 쓴다. 1단계가 끝났을 때 Electron 앱 동작과 테스트 결과는 그대로여야 한다.
- 경로 계산: Electron 포트는 `node:path`, Tauri 포트는 `path.win32`와 같은 결과를 내는 자체 구현(`winPath.ts`)을 쓴다.
- 설정 파일 쓰기는 지금처럼 하나씩 줄 세운다(창이 하나뿐이므로 프로세스 간 잠금은 필요 없다).

### 2.2 Rust 명령
범용 명령 20개 안팎이다. 판단은 TS가 하지만, 큰 사고를 막는 안전장치는 Rust에도 둔다.

| 명령 | 하는 일 | 안전장치 |
|---|---|---|
| `fs_read_text`, `fs_read_bytes` | 파일 읽기. `fs_read_bytes`는 `tauri::ipc::Response`로 원시 바이트를 돌려준다 | 절대 경로만 받는다 |
| `fs_write_text`, `fs_write_bytes` | 원자적 저장(`atomic`) 또는 새 파일만 만들기(`new`). 바이트는 JSON 없이 원시 본문으로 받는다 | 절대 경로만 받는다 |
| `fs_copy`, `fs_mkdir`, `fs_read_dir`, `fs_stat`, `fs_rename` | 폴더·파일 다루기 | 절대 경로만 받는다 |
| `fs_remove(path, recursive)` | 지우기 | 재귀 없이는 파일만 지운다. 재귀 삭제는 앱 데이터 폴더 안이거나, 이번 실행에서 `fs_mkdir`로 만든 폴더만 지운다 |
| `trash_project(dir)` | 폴더를 휴지통으로 (`trash` 크레이트) | `song.json`이 있는 폴더만 |
| `open_folder(dir)` | 탐색기로 폴더 열기 | 이미 있는 폴더만(파일을 실행하지 않도록) |
| `zip_list`, `zip_read_text`, `zip_extract`, `zip_write` | ZIP 풀기·묶기 (`zip` 크레이트) | 폴더 밖으로 나가는 항목 거부, 새 파일로만 풀기, 적힌 크기보다 크게 풀리면 중단. 파일 배치 규칙은 TS(`zipLayout`)에서 정해 넘긴다 |
| `app_paths` | 앱 데이터·문서·다운로드 폴더 | |
| `set_dirty`, `force_close` | 창 닫기 확인 (2.3) | |
| `pipe_open`, `pipe_write`, `pipe_close`, `process_id` | Discord named pipe. 연결·전송 규칙은 TS(`shared/discord`)에 있다 | `\\?\pipe\discord-ipc-N`만 연다 |

- 열기·저장 대화상자, 탐색기에서 보기는 공식 플러그인(`dialog`, `opener`)을 TS에서 바로 부른다.
- 창 최소화·최대화·닫기는 Tauri 창 API를 TS에서 바로 부른다.
- 공지사항은 웹 버전처럼 화면에서 `fetch`로 받는다. CSP `connect-src`에 공지 주소의 origin만 더한다.

### 2.3 까다로운 부분
- **끌어다 놓은 파일**: Tauri에는 `webUtils.getPathForFile`이 없다. 웹 버전의 `picked.ts` 방식을 쓴다.
  - 놓은 `File`을 메모리에 맡기고 `picked:…` 토큰을 경로 대신 돌려준다.
  - `readAudio`는 토큰을 받으면 `File`에서 바로 읽는다.
  - `importProjectZip`·`readChartFile`·`importProjectAudio`·`createProject`는 토큰을 받으면 `File` 바이트를 앱 데이터 폴더의 `tmp/picked/`에 써서 실제 경로로 바꾼 뒤 공용 로직에 넘긴다. `tmp/`는 앱을 켤 때 비운다.
  - HTML5 드래그 앤 드롭이 동작하도록 `dragDropEnabled: false`로 둔다. renderer 코드는 바꾸지 않는다.
- **음악 파일 전송**: `read_bytes`가 JSON 없이 원시 바이트를 돌려준다. renderer는 지금처럼 `ArrayBuffer`를 받는다.
- **창 닫기 확인**: Rust가 `CloseRequested`를 받는다.
  - 저장 안 한 변경이 있으면 닫기를 막고 `close-requested` 이벤트를 보낸다.
  - `forceClose`·`closeCancelled`·업데이트 설치 후 재시작은 지금(`index.ts`, `updater.ts`)과 같은 순서로 동작한다.
  - 페이지를 다시 불러오면 dirty 표시를 지운다(지금 `did-navigate` 처리와 같다).
- **제목 표시줄 끌기**: 제목 표시줄 컴포넌트에 `data-tauri-drag-region`을 더한다. Electron은 이 속성을 무시한다.
- **앱 밖 이동 막기**: Tauri는 기본으로 막지 않으므로, Rust `on_navigation` hook에 지금 `navigation.ts`와 같은 규칙을 걸어 다른 주소 이동과 새 창 열기를 막는다. CSP는 지금 `contentSecurityPolicy()`와 같은 정책을 `tauri.conf.json`에 넣는다.

### 2.4 Capabilities
PC용 API는 지금 preload와 같은 값을 쓴다. `windowControls`, `autoUpdate`, `discord`, `revealInExplorer`, `guideFileSync`, `chooseProjectFolder`, `trash`, `recording`은 true, `autoSave`는 false다.

## 3. 업데이트와 기존 사용자 이전

### 3.1 앞으로의 업데이트
- `tauri-plugin-updater`를 쓴다. GitHub Release에 `RCM-Setup-x.y.z.exe`, `.sig`, `latest.json`을 올린다.
- 업데이트 서명 키를 새로 만들어 GitHub Secret(`TAURI_SIGNING_PRIVATE_KEY`, 비밀번호)에 넣는다.
  - 이 키를 잃으면 이후 업데이트를 배포할 수 없다. 사용자가 따로 백업한다.
  - Windows 코드 서명은 지금처럼 하지 않는다.
- 화면의 `UpdateState`(확인 중·받는 중·준비됨·오류)와 첫 확인 지연(5초)은 그대로 둔다. 상태 전이 함수(`updateState.ts`)는 TS에서 그대로 쓴다.

### 3.2 Electron 사용자 넘기기
- Tauri 릴리스마다 electron-updater가 읽는 **`latest.yml`도 함께** 만들어 올린다(버전, 설치 파일 이름, sha512, 크기).
  - 옛 앱은 평소처럼 Tauri 설치 파일을 받아 실행한다. 늦게 업데이트하는 사람도 바로 최신으로 넘어온다.
- Tauri 설치 파일(NSIS)의 설치 hook이 옛 Electron 앱을 조용히 제거한다.
  - 찾는 방법: 레지스트리 Uninstall 항목에서 electron-builder가 등록한 RCM을 찾는다.
  - 사용자 데이터는 지우지 않는다(electron-builder 기본값도 지우지 않는다).
- **0단계 실험**에서 확인할 것:
  - electron-updater가 Tauri 설치 파일을 넘기는 인자(`/S`, `--updated`, `--force-run`)로 조용히 설치되는지
  - 설치 후 새 앱이 다시 실행되는지
  - 옛 앱 제거가 동작하는지
- 실험이 실패할 때의 대안: v0.9.x Electron 다리 버전을 하나 낸다. 업데이트가 준비되면 "새 버전을 설치할게요" 안내 후 Tauri 설치 파일을 일반 모드로 실행한다.

### 3.3 사용자 데이터
- Tauri 앱도 Electron과 **같은 폴더**(`%APPDATA%\RCM\`)를 앱 데이터 폴더로 쓴다. 경로는 Rust `paths.rs`에서 직접 정한다. 복사·이전 단계가 없다.
  - 그대로 남는 것: `settings.json`(최근 프로젝트, 프리셋, 레이아웃, 판정 오프셋, 공지, 가이드 파일 목록)과 `hit-effects/`
- WebView2 자체 데이터는 Tauri 기본 위치(`%LOCALAPPDATA%\<identifier>\`)에 둔다.
  - 홈 사이드바 접힘 상태(localStorage)만 초기화된다.
- 프로젝트는 사용자 폴더에 있으므로 영향이 없다. 기본 위치는 지금처럼 `문서\RCM Projects`다.
- identifier는 지금 appId인 `com.rcm.chart-editor`를 쓴다.

### 3.4 설치 파일
- NSIS, 현재 사용자 설치, 설치 위치 바꾸기 허용(지금과 같음).
- WebView2: `downloadBootstrapper`. 없을 때만 내려받는다.
- 이름 규칙 `RCM-Setup-${version}.exe`는 그대로 둔다.

### 3.5 릴리스 CI
- `release.yml`에 Rust 툴체인과 `cargo` 캐시를 추가하고, 빌드를 `tauri build`로 바꾼다.
- 업로드 파일: 설치 파일, `.sig`, `latest.json`, `latest.yml`.
- 지금의 초안 릴리스 흐름과 태그 메시지 업데이트 내역은 그대로 쓴다.
- `check-tag.mjs`는 `apps/desktop/package.json`, `tauri.conf.json`, `Cargo.toml`의 버전이 태그와 같은지 검사한다.
- `npm test`, `typecheck`, `cargo test`를 통과해야 올린다.
- 웹 배포(gh-pages)는 그대로다. 버전 번호는 `apps/desktop/package.json`을 따른다.

## 4. 테스트와 검증
- **TS**
  - `shared/`로 옮긴 로직은 기존 vitest 테스트도 같이 옮긴다.
  - PC용 API 구현은 `invoke`를 가짜로 바꿔 끼워 테스트한다(`apps/web/test`와 같은 방식).
- **Rust**
  - `cargo test`로 확인한다: `delete_chart_files` 이름 검사, ZIP 경로 탈출·한도, 원자적 저장, 앱 데이터 경로 검사.
  - Discord 프레임 처리와 재연결은 TS에 남으므로 기존 테스트를 `shared/`로 옮겨 그대로 쓴다.
- **직접 확인 체크리스트**
  - 새 프로젝트(음악 있음·없음, 레인형·자유형), 열기, 저장, 채보 추가·삭제
  - ZIP 가져오기·내보내기, 홈·편집 화면에 끌어다 놓기(ZIP·음악·채보)
  - 레인형·모바일 테스트 플레이, 실시간 녹음
  - 저장 안 한 상태로 닫기(확인·취소·저장 안 함)
  - 창 최소화·최대화·끌기, Discord 켜고 끄기
  - 업데이트 확인·받기·재시작 설치, 휴지통, 탐색기에서 보기
  - AI 가이드 파일 추가·자동 업데이트, 타격 이펙트 바꾸기, 공지사항
- **성공 기준**
  1. 설치 파일 15MB 이하. 지금 크기와 실측해 비교한다.
  2. 깨끗한 Windows 환경(새 Windows 사용자 계정 또는 VM. Windows 11 Home에는 Sandbox가 없다)에서 v0.9 Electron 앱이 아무 조작 없이 새 버전으로 바뀐다.
     - 설정·최근 프로젝트·프리셋·이펙트가 그대로 있다.
     - 바로가기와 설치 목록에 RCM이 하나만 있다.
  3. 체크리스트를 모두 통과한다. 웹 버전 동작은 바뀌지 않는다.

## 5. 진행 순서
단계마다 기존 Electron 앱은 계속 정상 동작해야 한다.

0. **실험(버리는 코드)**: 최소 Tauri 앱으로 3.2의 넘기기를 확인한다. 결과에 따라 대안을 쓸지 정한다.
1. `main/`의 순수 로직을 `shared/`로 옮긴다. Electron 앱 테스트가 통과해야 한다.
2. `apps/desktop` 뼈대를 만든다. renderer를 띄우고 창 조작, 제목 표시줄 끌기, CSP, 창 닫기 확인을 맞춘다.
3. Rust 명령과 PC용 API를 기능 묶음별로 만든다. 순서: 설정 → 프로젝트 → ZIP·끌어다 놓기 → 이펙트·가이드 → 휴지통·탐색기.
4. Discord pipe를 Rust로 만들고 TS 연결 규칙에 붙인다.
5. updater, `latest.yml` 생성, NSIS 설치 hook, 릴리스 CI를 바꾼다.
6. **베타**를 GitHub prerelease로 올린다. 옛 앱의 자동 업데이트는 prerelease를 받지 않으므로 직접 받아 체크리스트를 확인한다.
7. 정식 릴리스를 낸다. 넘기기가 확인되면 `apps/editor`의 Electron 코드(`main`, `preload`, electron-builder 설정과 의존성)를 지운다. renderer와 `shared`는 남긴다.

## 6. 하지 않는 것
- UI를 Rust로 다시 쓰기, core·playfield를 WASM으로 옮기기
- macOS·Linux 빌드(지금처럼 Windows만)
- Windows 코드 서명
- 테스트 플레이 끊김 수정(전환 후 별도 작업)
