# 웹(모바일) 버전 설계

- 작성일: 2026-11-01
- 범위: 공유 로직 분리(`shared/project`) → `RcmApi` 확장 → 웹 앱(`apps/web`, IndexedDB) → 폰 화면 배치 → 터치 조작 → 테스트 플레이 → PWA·배포

## 0. 사용자가 정한 것
- PC 앱의 기능을 **웹사이트**로도 쓴다. 폰 브라우저에서 설치 없이 **편집까지** 할 수 있어야 한다.
- 저장은 **브라우저 저장소만** 쓴다. 서버·계정·클라우드 동기화는 없다. 기기 간 이동은 **프로젝트 ZIP**으로 한다.
- **폰 세로와 가로**를 모두 지원한다. 태블릿·PC 브라우저는 지금 데스크톱 배치를 그대로 쓴다.
- **레인형과 모바일(자유형) 채보 모두** 웹에서 만들고 편집한다.
- 첫 버전 범위: 편집, 두 방식의 테스트 플레이(**레인형은 터치 레인**), ZIP·채보 가져오기와 내보내기, **타격 이펙트 이미지**, **홈 화면 설치·오프라인(PWA)**. **실시간 녹음은 나중에** 한다(웹에서 숨긴다).
- 접근 방식: **renderer 코드를 PC와 웹이 함께 쓰고**, 웹용 `RcmApi` 구현을 끼운다(별도 모바일 UI를 만들지 않는다).
- 폰 배치: **하단 툴바 + 아래 시트**(가로 화면은 왼쪽 도구 줄 + 오른쪽 패널).
- 터치 조작: **한 손가락 = 편집, 두 손가락 = 스크롤·줌, 이동(✋) 도구 추가**.
- 웹은 화면이 가려질 때 **자동 저장**한다(설정에서 끌 수 있음).
- 웹 주소는 `https://glglekdy.github.io/RCM/app/`이고, **릴리스 태그와 함께** 배포한다.

## 1. 정한 기본값
- 웹은 PC 앱과 **같은 버전 번호**를 쓴다(`apps/editor/package.json`).
- 웹에서 숨기는 기능: 창 제목 표시줄·창 조작, 앱 내 업데이트(`UpdatePanel`, `UpdateNotice`), Discord 활동 표시, 탐색기에서 보기, AI 가이드 자동 문서 업데이트 목록, 프로젝트 저장 위치 고르기, 찾을 수 없는 프로젝트 다시 연결, 실시간 녹음.
- 웹 ZIP 가져오기 한도는 풀었을 때 **500MB**(PC는 1GB 그대로).
- 판정 오프셋 범위는 **±200ms**, 기본 0. PC에도 같이 넣는다.
- 자동 저장은 웹에서만 **기본 켬**. PC는 지금처럼 직접 저장만 한다.
- 길게 누르기 판정: **500ms**, 움직임 **8px** 이하.
- iPhone Safari에서 ogg가 재생되지 않으면 "이 브라우저는 ogg를 재생하지 못해요. mp3를 써 주세요"라고 안내한다(디코딩 실패 메시지).

## 2. 구조

```
packages/core, packages/playfield     그대로
apps/editor/src/shared/api.ts          RcmApi + Capabilities + 새 메서드
apps/editor/src/shared/project/        PC·웹 공용 순수 로직 (2.2)
apps/editor/src/main, preload          PC 전용 (Electron)
apps/editor/src/renderer               화면 코드 (PC·웹 공용)
apps/web/
  index.html, vite.config.ts           renderer를 웹으로 빌드, PWA 설정
  src/main.ts                          window.rcm = createWebApi() 후 renderer의 main.tsx 시작
  src/api/
    db.ts          IndexedDB 열기·스키마·트랜잭션 도우미
    projects.ts    만들기·열기·저장·삭제·최근 목록·음악 가져오기
    picked.ts      고른 File ↔ 가상 경로("picked:<id>")
    zip.ts         ZIP 가져오기·내보내기 (fflate)
    downloads.ts   저장 대화상자 대신 다운로드
    settings.ts    프리셋·레이아웃·배속·오프셋·이펙트·공지·업데이트 내역 상태
    hitEffects.ts  이펙트 PNG 저장·읽기
    index.ts       createWebApi(): RcmApi
```

- `apps/web`은 Vite로 `apps/editor/src/renderer/src`를 그대로 가져다 빌드한다. `@renderer` 별칭과 `__AI_GUIDE_UPDATED_AT__` define은 electron-vite 설정과 같은 값을 쓴다(가이드 시각 계산 함수는 두 설정이 함께 쓰도록 `scripts/`나 공용 파일로 뺀다).
- 웹 빌드에는 `__APP_VERSION__`(editor 패키지 버전)도 define한다.
- 웹 쪽 코드는 `electron`, `node:*`를 import하지 않는다. `shared/api.ts`가 `main/update/updateState`에서 타입만 가져오는 것은 `import type`이라 번들에 들어가지 않는다.

### 2.1 `RcmApi` 변경

```ts
export interface Capabilities {
  windowControls: boolean      // 제목 표시줄·최소화·최대화·닫기
  autoUpdate: boolean          // 앱 내 업데이트
  discord: boolean
  revealInExplorer: boolean
  guideFileSync: boolean       // AI 가이드 자동 문서 업데이트
  chooseProjectFolder: boolean // 새 프로젝트 저장 위치, 다시 연결
  trash: boolean               // false면 삭제가 영구 삭제
  recording: boolean           // 실시간 녹음
  autoSave: boolean            // 화면이 가려질 때 자동 저장을 지원
}

interface RcmApi {
  readonly capabilities: Capabilities
  /** 프로젝트를 ZIP으로 내보낸다. 취소하면 null, 저장하면 파일 이름(웹) 또는 경로(PC). */
  exportProjectZip(dir: string): Promise<string | null>
  /** 대화상자에서 ZIP을 고른다. 취소하면 null. 결과는 importProjectZip에 넘기는 경로. */
  pickProjectZip(): Promise<string | null>
  /** 판정 오프셋(ms). 저장된 값이 없으면 0. */
  getJudgeOffset(): Promise<number>
  /** 범위(-200~200) 밖이면 reject. */
  setJudgeOffset(ms: number): Promise<void>
  /** 웹 자동 저장 설정 (없으면 켬). PC는 항상 false를 돌려준다. */
  getAutoSave(): Promise<boolean>
  setAutoSave(enabled: boolean): Promise<void>
  /** 편집 화면을 나갈 때 부른다. 웹은 탭 잠금을 푼다(3.5), PC는 아무 일도 안 한다. */
  closeProject(dir: string): Promise<void>
  // ...기존 메서드는 그대로
}
```

- PC preload는 `capabilities`를 `{ windowControls, autoUpdate, discord, revealInExplorer, guideFileSync, chooseProjectFolder, trash, recording: true, autoSave: false }`로 돌려준다.
- 웹은 `autoSave: true`, 나머지는 모두 `false`.
- PC의 `exportProjectZip`은 저장 대화상자(기본 위치: 다운로드 폴더, 기본 이름 `<폴더 이름>.zip`)로 저장한다. ZIP 쓰기는 웹과 같은 `fflate`를 쓰고, 파일 목록은 프로젝트 파일만(2.2 `isProjectFileName`) 넣는다.
- 홈 화면의 ZIP 가져오기는 지금처럼 끌어다 놓기도 되고, 새로 "ZIP 가져오기" 버튼(`pickProjectZip`)도 둔다.
- 편집 화면 파일 메뉴에 "프로젝트 ZIP으로 내보내기"를 추가한다(PC·웹 모두).

### 2.2 공용 순수 로직 (`shared/project/`)
`main/project/projectFs.ts`, `folderName.ts`, `importZip.ts`에서 fs를 쓰지 않는 부분을 옮긴다. PC 코드는 이 함수들을 불러 쓰기만 하고 동작은 바뀌지 않는다.

- `validateCreateProjectOptions(raw)`
- `buildNewProject(opts, audioName)`: 새 프로젝트의 `song.json` 텍스트와 첫 채보 `{ file, text }`를 만든다.
- `summarizeProject(songText, charts)`: 최근 목록용 요약(`title`, `artist`, `charts`).
- `isChartFileName`, `isAudioFile`, `isProjectFileName`
- `copiedAudioName(source, exists)`: `"원래이름 (RCM).확장자"` 규칙과 중복 시 번호.
- `sanitizeFolderName`, `uniqueChildName`
- `projectPrefix(names)`: ZIP 안 프로젝트 폴더 찾기(`__MACOSX` 무시, song.json 0개/여러 개 오류).
- `isSafeZipEntry(name)`: `../`, 절대 경로, 드라이브 문자 거부(웹용. PC는 yauzl이 이미 거부한다).

## 3. 웹 저장소

### 3.1 IndexedDB (`rcm`, 버전 1)

| 저장소 | 키 | 값 |
|---|---|---|
| `projects` | `id` (UUID) | `{ id, createdAt, lastOpened }` |
| `files` | `[projectId, name]` | `{ text: string }` 또는 `{ blob: Blob }`(음악) |
| `settings` | 이름 | 값 (PC `settings.json`의 같은 항목과 같은 모양, 같은 sanitize 함수 사용) |
| `hitEffects` | 슬롯 | `{ names: string[], images: Blob[] }` |

- 프로젝트 `dir`은 `"web:<id>"`. `projectAudioPath(dir, audio)`는 `dir`이 `web:`으로 시작하면 `"web:<id>/<audio>"`를 만든다(구분자를 `/`로). `readAudio`는 이 형태와 `picked:<id>`를 모두 읽는다.
- `writeProjectFiles`는 넘어온 파일 전부를 **트랜잭션 하나**로 쓴다. 실패하면 전부 취소된다.
- `createProject`: 고른 음악(`picked:`)을 `copiedAudioName`으로 `files`에 복사하고 `buildNewProject` 결과를 같은 트랜잭션에 쓴다. `parentDir`은 무시한다.
- `importProjectAudio(dir, source)`: PC와 같은 규칙으로 복사하고 이름을 돌려준다.
- `getRecentProjects`: `projects`를 `lastOpened` 내림차순으로, 각 프로젝트 파일을 `summarizeProject`로 요약한다. `missing`은 항상 `false`.
- `trashProjects`: 영구 삭제(`projects`와 그 프로젝트의 `files` 전부를 트랜잭션 하나로). 화면 문구는 `capabilities.trash`가 false면 "영구 삭제"로 바꾸고, 확인 대화상자에 "지우기 전에 ZIP으로 내보낼 수 있어요"를 덧붙인다.
- 앱 시작 시 `navigator.storage.persist()`를 요청한다. 홈 화면 하단에 `navigator.storage.estimate()`로 사용량을 보여 준다(`사용 중 120MB`).

### 3.2 고른 파일 (`picked.ts`)
- `pickAudioFile`, `pickChartFiles`, `pickProjectZip`, `pickHitEffect`는 숨긴 `<input type="file">`로 고르고, `File`을 메모리 Map에 넣어 `"picked:<id>"`를 돌려준다.
- `pathForFile(file)`(끌어다 놓기)도 같은 Map에 넣고 가상 경로를 돌려준다.
- Map은 새로고침하면 사라진다. 고른 파일은 바로 프로젝트에 복사하므로 문제없다. 없는 `picked:` 경로를 읽으면 "파일을 다시 골라 주세요"로 reject.
- 취소 감지: `<input>`의 `cancel` 이벤트를 쓴다. 지원하지 않는 브라우저는 창 `focus`가 돌아온 뒤 300ms 안에 `change`가 없으면 취소로 본다.

### 3.3 ZIP (`zip.ts`, fflate)
- 가져오기: `unzip`으로 항목 이름을 먼저 읽고 `projectPrefix`·`isSafeZipEntry`·`isProjectFileName`으로 거른 뒤, 풀었을 때 합계가 500MB를 넘으면 거부한다. song.json을 `parseSong`으로 확인하고 새 프로젝트로 저장한다(트랜잭션 하나). 오류 문구는 PC와 같다.
- 내보내기: `<sanitizeFolderName(title)>/` 아래에 프로젝트 파일을 넣어 `zip`하고 `<폴더 이름>.zip`으로 다운로드한다.

### 3.4 다운로드 (`downloads.ts`)
- `saveTextFile`, `exportChart`, `exportProjectZip`, AI 가이드 저장은 Blob + `<a download>`로 받는다. 웹은 저장 위치를 알 수 없으므로 파일 이름을 돌려준다. 화면 문구 "○○에 저장했어요"는 웹에서 "○○을(를) 내려받았어요"로 바꾼다.

### 3.5 오류와 안전장치
- `QuotaExceededError`는 "저장 공간이 부족해요. 쓰지 않는 프로젝트를 ZIP으로 내보내고 지워 주세요"로 바꿔 reject한다. 저장 실패 시 편집 내용은 화면에 남고 dirty 상태가 유지된다.
- 같은 프로젝트를 탭 두 개에서 열기: `openProject`가 `navigator.locks.request('rcm-project:<id>', { ifAvailable: true })`로 잠금을 잡고, 못 잡으면 "다른 탭에서 열려 있어요"로 reject한다. 잠금은 홈으로 돌아가거나 탭을 닫으면 풀린다. 이를 위해 `RcmApi.closeProject(dir)`(PC는 아무 일도 안 함)를 추가하고 편집 화면을 나갈 때 부른다.
- 닫기 가드: 웹은 `onCloseRequested`가 오지 않는다. `setDirty(true)`인 동안 `beforeunload`로 브라우저 기본 경고를 띄운다.
- 자동 저장: `capabilities.autoSave && getAutoSave()`이면 `visibilitychange`로 `hidden`이 될 때 dirty면 저장한다(일반 저장과 같은 경로). 테스트 플레이 중에도 저장한다.
- iPhone Safari 7일 삭제: 설치(PWA) 안내에서 설명한다(6.3).

## 4. 화면 배치

### 4.1 모드
`layoutMode(width, height)` (순수 함수) + `useLayoutMode()` 훅:
- `phone-portrait`: `width < 700 && height >= width`
- `phone-landscape`: `height < 500 && width > height`
- `desktop`: 그 밖

PC 앱(`capabilities.windowControls`)은 항상 `desktop`으로 고정한다.

### 4.2 편집 화면
- `EditorScreen.tsx`에서 상태·효과·명령 연결은 그대로 두고, 화면 틀만 떼어 `DesktopShell`(지금 배치), `PortraitShell`, `LandscapeShell`로 나눈다. 셋은 같은 props(타임라인, 미니맵, 패널, 툴바 항목 요소)를 받아 배치만 다르게 한다.
- `BottomToolbar`를 항목 컴포넌트로 쪼갠다: `ChartPicker`, `ToolButtons`, `NoteKindPicker`(자유형), `WidthControl`(자유형), `SnapPicker`, `ZoomControl`, `PlayControls`, `FileMenu`. `DesktopShell`은 지금과 같은 순서로 한 줄에 놓는다.
- **PortraitShell**
  - 위: `TopBar` — 뒤로(홈), 제목, `ChartPicker`, 되돌리기·다시하기, 저장 상태 점, ⋯(파일 메뉴·복사·붙여넣기·좌우 반전·설정).
  - 가운데: 타임라인 + 오른쪽 미니맵 띠.
  - 아래 첫 줄(가로 스크롤): `ToolButtons`, `NoteKindPicker`, `WidthControl`.
  - 아래 둘째 줄: 곡·타이밍·채보 탭, `SnapPicker`, 재생, 테스트 플레이. 줌은 핀치로 하므로 `ZoomControl`은 ⋯ 안에 둔다.
  - 탭을 누르면 `BottomSheet`가 해당 패널로 열린다. 같은 탭을 다시 누르거나 아래로 끌면 닫힌다.
- **LandscapeShell**
  - 왼쪽 세로 줄: 뒤로, `ToolButtons`, `SnapPicker`, 재생, 테스트 플레이, ⋯.
  - 가운데: 타임라인 + 미니맵 띠.
  - 오른쪽: 패널(탭 + 내용), 접기 버튼. 접으면 탭 아이콘 줄만 남는다. 자유형의 `NoteKindPicker`·`WidthControl`은 패널 위쪽 고정 영역에 둔다.
- `BottomSheet`(새 UI 컴포넌트): 높이 단계 `closed | half(50%) | full(100% - TopBar)`, 손잡이를 끌어 단계 이동, `half`에서는 뒤 타임라인을 계속 조작할 수 있다(배경 막음 없음).

### 4.3 그 밖의 화면
- 홈: 폰에서는 사이드바를 위쪽 메뉴 버튼(서랍)으로 바꾸고, 최근 프로젝트 표(`RecentTable`)를 카드 목록으로 보여 준다.
- `Modal`·대화상자: 폰에서는 전체 너비 시트로 띄운다.
- 설정·프리셋·가이드 페이지: 한 줄 배치로 내려 쌓는다(CSS 미디어 쿼리).
- 터치 대상은 최소 40px.

## 5. 터치 조작

### 5.1 제스처 계층
`TimelineCanvas`의 pointer 처리 앞에 `GestureRouter`(순수 상태 기계 + 얇은 React 연결)를 둔다. 기존 `tools.ts`·`freeTools.ts`는 바꾸지 않는다.

| 입력 | 결과 |
|---|---|
| 마우스·펜 | 지금처럼 바로 도구로 넘긴다 |
| 손가락 1개, 이동 도구 | 끌면 스크롤(관성 없음), 탭하면 노트 선택(빈 곳이면 선택 해제) |
| 손가락 1개, 그 밖의 도구 | 도구로 넘긴다(PC 마우스 왼쪽 버튼과 같음) |
| 손가락 2개 | 스크롤 + 핀치 줌. 도구로 넘기던 중이면 도구에 취소를 보내고(진행 중 편집 버림) 제스처로 바꾼다 |
| 길게 누르기(이동·선택 도구) | 그 위치의 `contextmenu`와 같은 메뉴를 띄운다 |

- 도구 취소를 위해 도구 쪽에 `cancel()`이 없으면 추가한다(진행 중 drag를 버리고 미리보기를 지움). 이것이 도구 코드의 유일한 변경이다.
- 미니맵 띠: 한 손가락으로 누르고 끌면 그 위치로 이동(지금 마우스 동작과 같음). 띠 너비는 폰에서 18px.
- 핀치 줌은 두 손가락 중심의 시각을 고정한 채 확대·축소한다.
- 캔버스에 `touch-action: none`을 준다.

### 5.2 이동 도구
- `EditorState['tool']`에 `'pan'`을 추가한다. PC 마우스로는 왼쪽 끌기 = 스크롤.
- 툴바 `ToolButtons`에 ✋ 버튼을 둔다(PC·웹 모두).

### 5.3 단축키 대신 버튼
- 되돌리기·다시하기: `TopBar`(세로), 왼쪽 줄 ⋯(가로).
- 복사·잘라내기·붙여넣기·좌우 반전·삭제: 길게 누르기 메뉴와 ⋯ 메뉴.
- BPM 탭(`T`): 타이밍 패널에 큰 "탭" 버튼(재생 중에만 활성).
- 저장: ⋯ 메뉴, `TopBar` 저장 상태 점을 누르면 저장.
- 다중 선택(Shift·Ctrl): 선택 도구에 "추가 선택" 토글. 켜면 탭·사각형 선택이 기존 선택에 더해진다.
- 테스트 플레이(`F5`): 툴바 버튼.

## 6. 테스트 플레이

### 6.1 레인형 터치
- 플레이 화면 아래쪽 판정선 주변(판정선 위 40% ~ 화면 아래)을 판정 트랙 수만큼 세로 칸으로 나눈다. 칸 경계는 playfield가 그리는 레인 위치와 같게 한다.
- `laneAt(x, layout)`(순수 함수)로 칸을 찾고, 손가락마다(`pointerId`) 누른 레인을 기억해 키 누름·뗌과 같은 입력으로 넘긴다. 손가락이 다른 칸으로 미끄러지면 원래 레인은 떼고 새 레인을 누른다.
- 기믹 트랙은 칸을 만들지 않는다.

### 6.2 공통
- 시작할 때 `requestFullscreen()`과 Wake Lock을 요청하고, 끝나면 푼다. Android에서는 지금 고른 방향(세로·가로)으로 `screen.orientation.lock()`을 시도한다(실패는 무시).
- 판정 오프셋: 입력 시각에서 오프셋을 빼고 판정한다(`judge`에 넘기기 전). 설정은 게임플레이 설정 페이지에 둔다.
- 자유형 터치는 지금 구현을 그대로 쓴다.

### 6.3 PWA 설치 안내
- 홈 화면에 한 번 띄우고, 닫으면 공지 닫기(`dismissNotice('install-pwa')`)로 기억한다. 이미 설치된 상태(`display-mode: standalone`)면 띄우지 않는다.
- Android Chrome: `beforeinstallprompt`를 잡아 "앱으로 설치" 버튼.
- iPhone Safari: "공유 → 홈 화면에 추가" 안내와 "설치하지 않으면 7일 동안 열지 않았을 때 브라우저가 프로젝트를 지울 수 있어요".

## 7. PWA와 배포

### 7.1 PWA (`vite-plugin-pwa`)
- `base: '/RCM/app/'`, manifest: `name: 'RCM 채보 에디터'`, `short_name: 'RCM'`, 아이콘은 `apps/editor/build/icon.png`에서 192·512px, `display: 'standalone'`, `background_color`·`theme_color`는 `tokens.css`의 배경색.
- 서비스 워커는 빌드 결과 전부를 precache한다. `registerType: 'prompt'`.
- 새 서비스 워커가 기다리면 토스트 "새 버전이 있어요 · 새로고침". 누르면 dirty면 먼저 저장하고 `updateSW(true)`. 새로고침 후에는 기존 업데이트 내역 대화상자가 뜬다(`getWhatsNewState`는 웹 settings에 저장).

### 7.2 배포 (`release.yml`에 job 추가)
- `web` job: `ubuntu-latest`, `npm ci` → `npm test` → `npm run typecheck` → `npm -w @rcm/web run build` → `gh-pages` 브랜치를 checkout해 `app/` 폴더만 빌드 결과로 바꾸고 `chore: deploy web vX.Y.Z` 커밋·push. 소개 페이지 파일은 건드리지 않는다.
- 권한: 같은 저장소 `contents: write`(이미 있음). 기존 `release` job과 독립이라 한쪽 실패가 다른 쪽에 영향 없다.
- `gh-pages` 소개 페이지에 "웹에서 열기" 버튼(`./app/`)을 추가한다(별도 커밋, gh-pages 브랜치).

### 7.3 개발
- 루트 스크립트: `dev:web`(`npm -w @rcm/web run dev`), `typecheck`에 웹 추가.
- 폰에서 확인: `npm run dev:web -- --host`로 같은 와이파이에서 접속한다. 서비스 워커는 개발 모드에서 끈다.
- README(한·영)에 웹 버전 주소와 차이점, `DEVELOPMENT.md`에 웹 구성·개발·배포를 추가한다.

## 8. 테스트
- vitest
  - `shared/project`: 옮긴 함수의 기존 PC 테스트가 그대로 통과한다.
  - 웹 API(`fake-indexeddb`): 만들기·열기·저장 원자성(중간 실패 시 이전 내용 유지)·삭제·최근 목록 정렬·설정 sanitize·이펙트 이미지·용량 부족 오류 문구·탭 잠금.
  - ZIP 왕복: 웹 `exportProjectZip` 결과를 PC `importProjectZip`이 연다. PC 형식(폴더째 압축, ZIP 바로 안) ZIP을 웹이 연다. 잘못된 ZIP(song.json 없음/여러 개, `../` 경로, 한도 초과)은 PC와 같은 오류.
  - 순수 함수: `layoutMode`, `GestureRouter` 상태 기계(손가락 순서 → 도구/스크롤/줌/취소/길게 누르기), `laneAt`, 판정 오프셋 적용, `copiedAudioName`, `isSafeZipEntry`.
- 수동 확인: 단계마다 확인 목록을 만들고 Android Chrome·iPhone Safari에서 확인한다. 먼저 PC Chrome 모바일 흉내 모드로 확인한다.
- CI: 기존 `npm test`·`npm run typecheck`(웹 포함)를 PC·웹 job 모두에서 돌린다.

## 9. 작업 단계
단계마다 앱이 동작하는 상태로 끝나고, PC 앱은 모든 단계에서 지금처럼 동작한다. 구현 계획은 단계별로 따로 쓴다.

1. **기반**: 2.1·2.2, `apps/web` 뼈대, 3장 전부(자동 저장 제외), ZIP 내보내기(PC 포함), 판정 오프셋 API. → PC 브라우저에서 데스크톱 배치로 편집·저장·ZIP.
2. **폰 배치**: 4장. → 폰 세로·가로에서 화면이 맞게 나온다(조작은 PC식).
3. **터치 조작**: 5장. → 폰에서 손가락으로 편집.
4. **테스트 플레이**: 6.1·6.2, 판정 오프셋 화면. → 폰에서 두 방식 모두 플레이.
5. **PWA와 배포**: 3.5 자동 저장, 6.3, 7장, 문서. → `glglekdy.github.io/RCM/app/` 공개.

웹 배포 job은 5단계에서 넣으므로 그 전에 릴리스해도 덜 만든 웹은 공개되지 않는다.
