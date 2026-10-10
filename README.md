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

Windows용 NSIS 설치 파일이 `apps/editor/dist/RCM Chart Editor Setup <버전>.exe`로 만들어집니다. 코드 서명은 하지 않으므로 설치할 때 Windows SmartScreen 경고가 나올 수 있습니다. 설치 파일을 만들 때도 위의 Electron 설치 단계가 먼저 끝나 있어야 합니다.

## 프로젝트 폴더 형식

에디터에서 한 곡은 폴더 하나(화면에서는 "프로젝트")입니다. 폴더 안의 `song.json`에는 제목, 아티스트, 음악 파일 이름, 오프셋, 미리듣기 시작 위치, BPM 변경 목록(타이밍)이 들어 있고, 난이도마다 `<이름>.chart.json`이 하나씩 있어 트랙 목록(`Note_1`, `Side_L` 같은 이름)과 노트(tap, hold)를 tick 단위로 저장합니다. `editor.json`에는 가이드 마커처럼 에디터만 쓰는 값이 들어 있으며 게임은 읽지 않아도 됩니다. 음악 파일(ogg, mp3, wav)도 같은 폴더에 복사되어 함께 옮길 수 있습니다. 모든 JSON은 들여쓰기 2칸에 끝에 개행을 붙여 저장하고, 1박은 480 tick입니다.

채보 파일을 읽어 게임을 만드는 방법(시간 계산 공식, 판정 규칙, 트랙 이름 해석)은 [docs/CHART_FORMAT_GUIDE.md](docs/CHART_FORMAT_GUIDE.md)에 정리되어 있습니다. 다른 AI 에이전트에게 게임 구현을 맡길 때 이 문서를 넘겨 주면 됩니다.
