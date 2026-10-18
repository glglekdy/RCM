# RCM

세로 레인형 리듬게임을 위한 데스크톱 채보 에디터(Electron + TypeScript)와, 에디터와 게임이 함께 쓰는 공유 코어입니다.

- `packages/core`: 채보 포맷 타입, 읽기·검증·저장, 타이밍 계산
- `packages/playfield`: 노트가 떨어지는 화면 렌더링과 입력 판정
- `apps/editor`: Electron 채보 에디터

## 개발 실행

```
npm install
node node_modules/electron/install.js
npm run dev
```

Electron 44부터는 `npm install`만으로 실행 파일이 내려받아지지 않습니다. npm 11은 설치 스크립트 실행도 막으므로(`npm approve-scripts`로 허용해도 Electron 패키지에는 실행할 설치 스크립트가 없습니다), 처음 클론한 뒤에 위 두 번째 줄을 한 번 직접 실행해야 합니다. 이 단계를 건너뛰면 `npm run dev`와 `npm run dist`가 Electron을 찾지 못합니다.

`apps/editor/package.json`의 `electron`은 `^` 없이 정확한 버전으로 고정되어 있습니다. 워크스페이스에서 electron이 루트 `node_modules`로 올라가면 electron-builder가 버전 범위를 해석하지 못하고 빌드를 거부하기 때문입니다.

## 테스트

```
npm test
npm run typecheck
```

## 설치 파일 만들기

```
npm run dist
```

Windows용 NSIS 설치 파일이 `apps/editor/dist/RCM-Setup-<버전>.exe`로 만들어집니다. 로컬 `npm run dist`는 `--publish never`라서 GitHub에 올리지 않습니다. 코드 서명은 하지 않으므로 설치할 때 Windows SmartScreen 경고가 나올 수 있습니다. 설치 파일을 만들 때도 위의 Electron 설치 단계가 먼저 끝나 있어야 합니다.

## 배포

소스와 Actions는 비공개 저장소 `glglekdy/RCM-Dev`에 있고, 설치 파일은 공개 저장소 `glglekdy/RCM`의 Releases에 올라갑니다. 설치된 앱은 이 공개 저장소에서 새 버전을 확인합니다. 아래 1~3은 한 번만 하면 되는 준비입니다. 이미 끝났다면 하나씩 맞는지 확인만 하세요.

1. 저장소: `glglekdy/RCM`은 공개, `glglekdy/RCM-Dev`는 비공개이고, 로컬 `origin`이 `RCM-Dev`를 가리킵니다 (`git remote -v`로 확인).
2. 토큰: GitHub → Settings → Developer settings → Fine-grained tokens에서 저장소는 `RCM`만 선택하고 권한은 `Contents: Read and write`로 만듭니다.
3. Secret: `RCM-Dev` 저장소 → Settings → Secrets and variables → Actions에 위 토큰을 `RELEASE_TOKEN`이라는 이름으로 등록합니다. 토큰 값은 저장소나 파일에 적지 않습니다.
4. 코드 올리기: main 브랜치를 `RCM-Dev`에 push합니다.
5. 첫 배포: `npm run release -- 0.1.0` 다음 `git push --follow-tags`. Actions가 성공하면 `RCM` 저장소의 Release `v0.1.0`에서 설치 파일을 받아 설치합니다.
6. 업데이트 확인: `npm run release -- 0.1.1` 다음 `git push --follow-tags`. 설치해 둔 0.1.0 앱을 켜면 새 버전 알림이 뜹니다.

### 평소 배포

```
npm run release -- X.Y.Z
git push --follow-tags
```

`npm run release`는 `apps/editor`의 버전을 올리고 `chore: release vX.Y.Z` 커밋과 `vX.Y.Z` 태그를 만들 뿐 push는 하지 않습니다. 태그 메시지에는 업데이트 내역이 들어가고, 같은 내용이 `RCM` 저장소 Release 본문에도 올라갑니다. 내역은 지난 태그 뒤의 커밋 중 `feat`(새 기능), `fix`(버그 수정), `perf`(성능 개선)를 종류별로 모아 자동으로 만들고, 실행할 때 화면에 보여 줍니다. 직접 쓴 내역을 쓰려면 Markdown 파일을 저장소 밖에 만들어 `npm run release -- X.Y.Z --notes <파일 경로>`로 넘기세요 (저장소 안에 두면 커밋 안 된 변경으로 보여 거부됩니다). 태그의 내역은 `git tag -n99 vX.Y.Z`로 볼 수 있습니다. 태그가 push되면 `.github/workflows/release.yml`이 Windows에서 태그와 앱 버전이 같은지 확인하고 테스트와 타입 검사를 돌린 뒤, 설치 파일(`RCM-Setup-X.Y.Z.exe`, `.blockmap`, `latest.yml`)을 `RCM` 저장소에 초안 Release로 올리고, `latest.yml`과 설치 파일이 모두 있는지 확인한 뒤 정식 릴리스로 공개합니다. 공개되기 전의 초안은 사용자에게 보이지 않습니다.

### 실패했을 때

`RCM-Dev` 저장소의 Actions 탭에서 `release` 실행을 열어 실패한 단계의 로그를 확인합니다. `RELEASE_TOKEN Secret이 없어요`가 보이면 위 3번의 Secret 이름과 저장소를 확인하세요.

실패했다면 같은 실행에서 job을 다시 실행(Re-run)하세요. 다시 올릴 때는 같은 초안에 덮어씁니다. 공개 전에 실패한 초안은 `RCM` 저장소에서 사용자에게 보이지 않습니다. 그래도 꼬였다면 `RCM`의 해당 초안 Release를 지우고, `RCM-Dev`의 원격 태그를 먼저 지운 뒤 태그를 다시 push하세요.

게시 단계에서 `401`이나 `Bad credentials`가 나오면 fine-grained 토큰이 만료된 것입니다. 새 토큰을 만들어 `RCM-Dev`의 `RELEASE_TOKEN` Secret을 바꾸세요.

### 업데이트 파일 위치

받아 둔 업데이트 설치 파일은 `%LOCALAPPDATA%\@rcmeditor-updater\pending`에 저장되며 항상 하나만 남깁니다. 이미 설치했거나 더 낮은 버전의 파일은 앱을 시작할 때 지웁니다.

## 프로젝트 폴더 형식

에디터에서 한 곡은 폴더 하나(화면에서는 "프로젝트")입니다. 폴더 안의 `song.json`에는 제목, 아티스트, 음악 파일 이름, 오프셋, 미리듣기 시작 위치, BPM 변경 목록(타이밍)이 들어 있고, 난이도마다 `<이름>.chart.json`이 하나씩 있어 트랙 목록(`Note_1`, `Side_L` 같은 이름)과 노트(tap, hold)를 tick 단위로 저장합니다. `editor.json`에는 가이드 마커처럼 에디터만 쓰는 값이 들어 있으며 게임은 읽지 않아도 됩니다. 음악 파일(ogg, mp3, wav)도 같은 폴더에 복사되어 함께 옮길 수 있습니다. 음악 없이 프로젝트를 만들 수도 있고(`audio`가 빈 문자열), 나중에 곡 탭에서 음악을 고르거나 바꿀 수 있습니다. 모든 JSON은 들여쓰기 2칸에 끝에 개행을 붙여 저장하고, 1박은 480 tick입니다. 채보 파일에 `"layout": "free"`가 있으면 모바일 리듬게임용 자유형 채보(베타)로, 노트가 트랙 대신 가로 위치와 폭을 가지고 탭·트레이스·플릭·슬라이드를 씁니다.

채보 파일을 읽어 게임을 만드는 방법(시간 계산 공식, 판정 규칙, 트랙 이름 해석)은 [docs/CHART_FORMAT_GUIDE.md](docs/CHART_FORMAT_GUIDE.md)에 정리되어 있습니다. 다른 AI 에이전트에게 게임 구현을 맡길 때 이 문서를 넘겨 주면 됩니다.
