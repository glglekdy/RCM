# 디스코드 활동 표시(Rich Presence) 설계

- 작성일: 2026-10-12
- 기반: `docs/superpowers/specs/2026-10-09-chart-editor-design.md`
- 대상: `apps/editor` (Windows)

## 0. 목표

### 사용자가 정한 것
- 에디터를 켜 두면 **디스코드 프로필 활동**에 RCM이 보인다
- 편집 화면에서는 **곡 제목·아티스트·채보 이름·레벨**까지 보인다
- 홈 화면에서는 **RCM을 켜 둔 것만** 보인다 (곡 정보 없음)
- 홈·편집 화면 모두 **"채보 짜러가기!" 버튼**이 붙고 `https://github.com/glglekdy/RCM/tags`로 연결된다
- 홈 사이드바에 **설정 페이지**를 새로 만들고, 거기에 **디스코드 표시 켜기/끄기 스위치**를 둔다 (기본값 켜짐)

### 성공 기준
- 디스코드 데스크톱 앱이 켜진 PC에서 에디터를 켜면 몇 초 안에 프로필에 `RCM` 활동이 뜬다
- 프로젝트를 열면 곡·채보 정보로 바뀌고, 채보를 바꾸거나 곡 제목을 고치면 몇 초 안에 따라 바뀐다
- 설정에서 끄면 활동이 바로 사라지고, 다시 켜면 다시 뜬다. 앱을 다시 켜도 선택이 유지된다
- 디스코드가 없거나 꺼져 있거나 중간에 꺼져도 에디터 동작에 영향이 없고, 디스코드가 다시 켜지면 저절로 다시 연결된다

### 하지 않는 것
- 연결 상태 표시 UI (필요하면 나중에)
- 디스코드 외 다른 서비스, 라이브러리 사용 (`discord-rpc` 등)
- 맥·리눅스 소켓 경로 (설치판이 Windows 전용)

## 1. 디스코드 쪽 준비 (사용자 작업, 코드 밖)

1. Discord Developer Portal에서 애플리케이션 `RCM` 생성
2. **Application ID**를 코드 상수로 넣는다 (`src/main/discord/config.ts`). 공개돼도 되는 값이라 비밀로 다루지 않는다
3. Rich Presence → Art Assets에 `apps/editor/build/icon.png`를 key **`rcm`**으로 업로드

## 2. 표시 내용

활동 종류는 Playing(`type: 0`). 디스코드가 애플리케이션 이름 `RCM`을 제목으로 보여준다.

| 필드 | 홈 화면 | 편집 화면 |
|---|---|---|
| `details` | 없음 | `{제목} - {아티스트}` (아티스트가 비면 `{제목}`) |
| `state` | 없음 | `{채보 이름} Lv.{레벨} 편집 중` |
| `timestamps.start` | 앱을 켠 시각 | 이 프로젝트를 연 시각 |
| `assets.large_image` / `large_text` | `rcm` / `RCM - Rhythm Chaebo Maker` | 같음 |
| `buttons` | `[{ label: '채보 짜러가기!', url: 'https://github.com/glglekdy/RCM/tags' }]` | 같음 |

- 디스코드 제한: `details`·`state`는 2~128자. 128자를 넘으면 자르고(끝에 `…`), 2자보다 짧으면 U+2800(빈 점자 문자)로 채운다
- 곡 정보는 **저장 전 편집 중인 값**을 그대로 쓴다 (메타데이터 패널에서 제목을 고치면 반영)
- 버튼은 디스코드 제한으로 **본인 프로필에서는 보이지 않거나 눌리지 않을 수 있다**. 다른 계정에서 확인한다

## 3. 구조

```
[렌더러]
  App: 홈 화면이면 setPresence(null)
  EditorScreen: 제목·아티스트·현재 채보 이름·레벨이 바뀔 때 setPresence({ title, artist, chart, level, since })
  SettingsPage: getDiscordPresence() / setDiscordPresence(enabled)
        │ IPC (preload의 window.rcm)
[메인]
  DiscordPresence 서비스 (앱 전체에 하나)
    - enabled: settings.json의 discordPresence (없으면 true)
    - desired: 마지막으로 받은 PresenceInfo | null
    - 연결·재연결·전송 간격 관리
        │ named pipe \\?\pipe\discord-ipc-0 … 9
[디스코드 데스크톱 앱]
```

### 3.1 `src/shared/presence.ts` (순수, 테스트 대상)
- `interface PresenceInfo { title: string; artist: string; chart: string; level: number; since: number }`
- `buildActivity(info: PresenceInfo | null, appStartedAt: number): DiscordActivity`: 2절의 표를 그대로 구현. 문자열 길이 규칙 포함
- 버튼 문구·URL·이미지 key는 이 파일의 상수

### 3.2 `src/main/discord/ipcFrame.ts` (순수, 테스트 대상)
- 프레임 형식: `[opcode u32 LE][길이 u32 LE][UTF-8 JSON]`
- opcode: `0 HANDSHAKE`, `1 FRAME`, `2 CLOSE`, `3 PING`, `4 PONG`
- `encodeFrame(op, payload): Buffer`
- `FrameDecoder`: 바이트 조각을 받아 완성된 프레임만 꺼낸다 (한 조각에 여러 프레임, 한 프레임이 여러 조각인 경우 모두 처리)

### 3.3 `src/main/discord/connection.ts`
- `connect(clientId): Promise<Transport>`: `discord-ipc-0`부터 `9`까지 차례로 `net.createConnection`을 시도하고, 처음 연결된 파이프에 handshake(`{ v: 1, client_id }`)를 보낸다. `READY` 응답을 받으면 resolve
- `Transport`: `setActivity(activity | null)`, `close()`, `onClose(cb)`
  - 전송: `{ cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() }`. `activity`가 null이면 활동을 지운다
  - `PING`이 오면 같은 내용으로 `PONG`을 보낸다. `CLOSE`나 소켓 오류·종료가 오면 `onClose`를 부른다
- 실제 파이프를 쓰는 얇은 층이라 단위 테스트하지 않는다. 대신 아래 서비스는 `connect`를 주입받는다

### 3.4 `src/main/discord/presence.ts` (테스트 대상)
- `createDiscordPresence({ connect, now, appStartedAt })`가 돌려주는 객체: `setEnabled(bool)`, `setInfo(PresenceInfo | null)`, `dispose()`
- 동작
  - 켜져 있고 연결이 없으면 연결 시도. 실패하거나 끊기면 **15초 뒤 다시 시도** (켜져 있는 동안 계속)
  - 연결되면 현재 `desired`를 바로 보낸다
  - 전송 간격: 디스코드 제한(20초에 5번)에 맞춰 **최소 4초 간격**. 그 사이에 바뀐 값은 모아 두었다가 마지막 값만 보낸다. 마지막 상태는 반드시 전송된다
  - 같은 activity를 연달아 보내지 않는다 (직렬화한 값으로 비교)
  - 끄면: 연결돼 있으면 활동을 지우는 메시지를 보낸 뒤 연결을 닫고, 재연결 타이머를 멈춘다
  - `dispose()`(앱 종료): 타이머 정리, 연결 닫기. 디스코드는 연결이 닫히면 활동을 스스로 지운다
- 모든 오류는 `console.warn`으로만 남기고 밖으로 던지지 않는다

### 3.5 설정 저장 (`src/main/project/settings.ts`)
- `Settings`에 `discordPresence?: boolean` 추가. 파싱할 때 boolean일 때만 채운다
- 읽지 못하거나 값이 없으면 `true`로 본다

### 3.6 IPC·preload·`RcmApi`
- `setPresence(info: PresenceInfo | null): void` (`ipcRenderer.send`). 메인에서 형식 검사 후 서비스에 전달 (문자열·숫자가 아니면 무시)
- `getDiscordPresence(): Promise<boolean>`
- `setDiscordPresence(enabled: boolean): Promise<void>`: 설정 파일에 저장하고 서비스에 바로 반영

### 3.7 렌더러
- `EditorScreen`: 마운트 시각을 `since`로 기억 (`files`가 바뀌면 화면이 새로 만들어지므로 프로젝트를 연 시각과 같다). doc의 제목·아티스트와 `activeChart` 채보의 이름·레벨이 바뀔 때마다 `setPresence`
- `App`: 홈 화면으로 바뀔 때 `setPresence(null)`
- 설정 페이지
  - `src/renderer/src/settings/SettingsPage.tsx`, 홈 `NAV`에 `설정` 항목(lucide `Settings` 아이콘) 추가, 가이드 항목들 아래
  - 섹션 `디스코드` 안에 한 줄: 제목 `디스코드에 활동 표시`, 설명 `작업 중인 곡과 채보를 디스코드 프로필에 보여줘요. 끄면 아무것도 표시하지 않아요.`, 오른쪽에 스위치
  - 스위치를 누르면 화면을 바로 바꾸고 `setDiscordPresence` 호출. 실패하면 되돌리고 토스트로 알린다
- `src/renderer/src/ui/Switch.tsx`: 새 토글 스위치 (`role="switch"`, `aria-checked`, 키보드 Space/Enter). 기존 UI 키트 스타일(CSS module, 색 토큰)을 따른다

### 3.8 보안
- CSP는 렌더러 대상이고, 디스코드 연결은 메인 프로세스에서만 하므로 바꿀 것 없음
- 렌더러에서 오는 `PresenceInfo`는 메인에서 형식과 길이를 다시 검사한다

## 4. 테스트

- `apps/editor/test/shared/presence.test.ts`: 홈·편집 activity 모양, 아티스트가 빈 경우, 128자 자르기, 2자 미만 채우기, 버튼 포함
- `apps/editor/test/main/discord/ipcFrame.test.ts`: 인코딩→디코딩 왕복, 여러 프레임이 한 조각으로 온 경우, 한 프레임이 여러 조각으로 나뉜 경우
- `apps/editor/test/main/discord/presence.test.ts` (가짜 `connect`, vitest 가짜 타이머)
  - 연결되면 현재 상태 전송
  - 4초 안의 여러 변경은 마지막 값 하나로 전송
  - 같은 값은 다시 보내지 않음
  - 연결 실패·끊김 후 15초 뒤 재연결하고 마지막 상태 재전송
  - 끄면 활동 지우기 → 연결 닫기, 재연결 안 함. 다시 켜면 연결
- `apps/editor/test/main/settings.test.ts`에 `discordPresence` 파싱 케이스 추가
- 수동 확인: 디스코드를 켜 두고 `npm run dev` → 홈 / 프로젝트 열기 / 채보 바꾸기 / 제목 고치기 / 설정 끄기·켜기 / 디스코드 껐다 켜기
