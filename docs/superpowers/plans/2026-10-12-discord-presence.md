# 디스코드 활동 표시(Rich Presence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에디터를 켜 두면 디스코드 프로필 활동에 RCM(홈) 또는 작업 중인 곡·채보(편집 화면)와 "채보 짜러가기!" 버튼을 보여주고, 홈의 새 설정 페이지에서 끄고 켤 수 있게 한다.

**Architecture:** 렌더러는 `PresenceInfo | null`만 메인에 보낸다. 메인의 `DiscordPresence` 서비스가 켜짐 여부·마지막 상태·연결·재연결·전송 간격을 관리하고, 라이브러리 없이 직접 만든 named pipe IPC 클라이언트(`ipcFrame` + `connection`)로 디스코드에 `SET_ACTIVITY`를 보낸다. activity 모양은 `src/shared/presence.ts`의 순수 함수가 만든다.

**Tech Stack:** 기존과 같음 (TypeScript, Vitest, Electron + electron-vite + React, lucide-react). 새 의존성 없음 (`node:net`, `node:crypto`만 사용)

**Spec:** `docs/superpowers/specs/2026-10-12-discord-presence-design.md` (이하 "스펙", 절 번호는 이 문서)

## Global Constraints

- 새 npm 의존성 금지
- 디스코드 Application ID 상수: `DISCORD_CLIENT_ID` (`apps/editor/src/main/discord/config.ts`). 실행 전에 사용자에게 받은 값을 넣는다. 빈 문자열이면 서비스는 연결을 시도하지 않는다
- 이미지 key `rcm`, `large_text` `RCM - Rhythm Chaebo Maker`
- 버튼 정확히 하나: label `채보 짜러가기!`, url `https://github.com/glglekdy/RCM/tags`
- 편집 화면: `details` = `{제목} - {아티스트}` (아티스트가 공백뿐이면 `{제목}`), `state` = `{채보 이름} Lv.{레벨} 편집 중`. 홈: `details`·`state` 없음
- `details`·`state` 길이 2~128 (코드 포인트 기준). 128 초과면 127자 + `…`, 2 미만이면 U+2800으로 채움
- `timestamps.start`: 홈은 앱을 켠 시각, 편집은 프로젝트를 연 시각 (ms 단위 epoch)
- activity `type: 0`
- 전송 최소 간격 4000ms, 재연결 간격 15000ms, handshake READY 대기 5000ms
- 파이프 경로 `\\?\pipe\discord-ipc-0` ~ `\\?\pipe\discord-ipc-9`
- 설정 키 `discordPresence?: boolean`, 없거나 읽지 못하면 `true`
- 디스코드 관련 오류는 `console.warn`만, 밖으로 throw하지 않는다
- UI 문구는 한국어. 기존 디자인 토큰(`styles/tokens.css`)과 CSS module을 쓴다
- 테스트는 `apps/editor/test/` 아래 (`npm test`는 루트에서 실행)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session: https://claude.ai/code/session_0193KVdVcsVXdi6XcDzTsVW4`
- 작업 트리에 사용자가 고치고 있는 `apps/editor/src/renderer/src/home/greetings.json`이 있다. 커밋에 넣지 않는다 (항상 파일을 지정해 `git add`)

## Review Focus

1. **연결 시도 중에 끄기** — `connect()`가 아직 끝나지 않았을 때 스위치를 끄면, 늦게 도착한 연결을 닫고 활동을 보내지 않아야 한다 → Task 3 테스트 `연결 중에 끄면 늦게 온 연결을 닫음`
2. **전송 대기 중에 연결이 끊김** — 4초 간격 대기 중에 디스코드가 꺼지면 throw 없이 재연결을 예약하고, 다시 연결되면 마지막 상태를 보내야 한다 → Task 3 테스트 `대기 중에 끊겨도 재연결 후 마지막 상태`
3. **파이프 쓰기 실패** — `setActivity`가 reject해도 앱이 죽지 않고, 그 연결을 버리고 재연결해야 한다 → Task 3 테스트 `전송 실패하면 연결을 닫고 재연결`
4. **렌더러의 잘못된 값** — `level`이 NaN, 문자열이 아닌 제목 등은 무시(현재 상태 유지)해야 한다 → Task 1 테스트 `isPresenceInfo`
5. **이모지·한글이 섞인 긴 제목** — 128자에서 자를 때 서로게이트 쌍을 쪼개지 않아야 한다 → Task 1 테스트 `이모지를 쪼개지 않고 자름`

---

### Task 1: activity 만들기 (`shared/presence.ts`)

**Files:**
- Create: `apps/editor/src/shared/presence.ts`
- Test: `apps/editor/test/shared/presence.test.ts`

**Interfaces:**
- Produces:
  - `interface PresenceInfo { title: string; artist: string; chart: string; level: number; since: number }`
  - `interface DiscordActivity { type: 0; details?: string; state?: string; timestamps: { start: number }; assets: { large_image: string; large_text: string }; buttons: { label: string; url: string }[] }`
  - `buildActivity(info: PresenceInfo | null, appStartedAt: number): DiscordActivity`
  - `isPresenceInfo(raw: unknown): raw is PresenceInfo`: 문자열 필드 셋, 유한한 `level`·`since`일 때만 true
  - 상수 `PRESENCE_BUTTON = { label: '채보 짜러가기!', url: 'https://github.com/glglekdy/RCM/tags' }`, `PRESENCE_IMAGE = 'rcm'`, `PRESENCE_IMAGE_TEXT = 'RCM - Rhythm Chaebo Maker'`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const info = { title: '별의 노래', artist: '아티스트', chart: 'HARD', level: 12, since: 1000 }

it('홈: 앱 시작 시각, 곡 정보 없음, 버튼 하나', () => {
  expect(buildActivity(null, 500)).toEqual({
    type: 0,
    timestamps: { start: 500 },
    assets: { large_image: 'rcm', large_text: 'RCM - Rhythm Chaebo Maker' },
    buttons: [{ label: '채보 짜러가기!', url: 'https://github.com/glglekdy/RCM/tags' }]
  })
})
it('편집: 제목 - 아티스트 / 채보 Lv 편집 중, 프로젝트 연 시각', () => {
  const a = buildActivity(info, 500)
  expect(a.details).toBe('별의 노래 - 아티스트')
  expect(a.state).toBe('HARD Lv.12 편집 중')
  expect(a.timestamps.start).toBe(1000)
  expect(a.buttons).toHaveLength(1)
})
it('아티스트가 비면 제목만', () => {
  expect(buildActivity({ ...info, artist: '  ' }, 0).details).toBe('별의 노래')
})
it('128자 넘으면 127자 + …', () => {
  const d = buildActivity({ ...info, title: 'a'.repeat(200) }, 0).details!
  expect([...d]).toHaveLength(128)
  expect(d.endsWith('…')).toBe(true)
})
it('이모지를 쪼개지 않고 자름', () => {
  const d = buildActivity({ ...info, title: '🎵'.repeat(200) }, 0).details!
  expect([...d]).toHaveLength(128)
  expect(d.slice(0, -1)).toBe('🎵'.repeat(127))
})
it('2자 미만이면 U+2800으로 채움', () => {
  expect(buildActivity({ ...info, title: 'A', artist: '' }, 0).details).toBe('A⠀')
})
it('isPresenceInfo', () => {
  expect(isPresenceInfo(info)).toBe(true)
  expect(isPresenceInfo(null)).toBe(false)
  expect(isPresenceInfo({ ...info, level: NaN })).toBe(false)
  expect(isPresenceInfo({ ...info, title: 3 })).toBe(false)
  expect(isPresenceInfo({ ...info, since: undefined })).toBe(false)
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/shared/presence.test.ts` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: `apps/editor/src/shared/presence.ts` 구현** — 길이 규칙은 `Array.from(s)`(코드 포인트)로 센다. 128 초과면 앞 127개 + `…`, 2 미만이면 길이 2가 될 때까지 `⠀`을 붙인다. `details`·`state`는 `info`가 null이면 키 자체를 넣지 않는다 (`toEqual` 비교)

- [ ] **Step 4: 통과 확인** — Run: 같은 명령 / Expected: PASS

- [ ] **Step 5: 커밋** — `git add apps/editor/src/shared/presence.ts apps/editor/test/shared/presence.test.ts` → `feat(editor): build discord activity from presence info`

---

### Task 2: IPC 프레임 인코딩·디코딩 (`main/discord/ipcFrame.ts`)

**Files:**
- Create: `apps/editor/src/main/discord/ipcFrame.ts`
- Test: `apps/editor/test/main/discord/ipcFrame.test.ts`

**Interfaces:**
- Produces:
  - `const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const`
  - `interface Frame { op: number; payload: unknown }`
  - `encodeFrame(op: number, payload: unknown): Buffer`: `[op u32 LE][byteLength u32 LE][UTF-8 JSON]`
  - `class FrameDecoder { push(chunk: Buffer): Frame[] }`: 남은 바이트는 다음 `push`까지 보관. JSON이 깨졌으면 throw

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('인코딩 형식: op, 바이트 길이(LE), JSON', () => {
  const buf = encodeFrame(OP.FRAME, { t: '한' })
  const json = Buffer.from(JSON.stringify({ t: '한' }), 'utf8')
  expect(buf.readUInt32LE(0)).toBe(1)
  expect(buf.readUInt32LE(4)).toBe(json.length)
  expect(buf.subarray(8).equals(json)).toBe(true)
})
it('왕복', () => {
  expect(new FrameDecoder().push(encodeFrame(OP.PING, { a: 1 }))).toEqual([{ op: 3, payload: { a: 1 } }])
})
it('한 조각에 프레임 여러 개', () => {
  const both = Buffer.concat([encodeFrame(1, { n: 1 }), encodeFrame(1, { n: 2 })])
  expect(new FrameDecoder().push(both).map((f) => f.payload)).toEqual([{ n: 1 }, { n: 2 }])
})
it('한 프레임이 여러 조각 (헤더 중간에서도 끊김)', () => {
  const buf = encodeFrame(1, { long: 'x'.repeat(100) })
  const d = new FrameDecoder()
  expect(d.push(buf.subarray(0, 3))).toEqual([])
  expect(d.push(buf.subarray(3, 50))).toEqual([])
  expect(d.push(buf.subarray(50))).toEqual([{ op: 1, payload: { long: 'x'.repeat(100) } }])
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/main/discord/ipcFrame.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현** — 내부 버퍼에 `Buffer.concat`으로 쌓고, 길이 8 이상이고 `8 + length`만큼 모였을 때만 프레임을 꺼내는 루프

- [ ] **Step 4: 통과 확인** — Expected: PASS

- [ ] **Step 5: 커밋** — `feat(editor): discord ipc frame codec`

---

### Task 3: 연결·전송 관리 서비스 (`main/discord/presence.ts`)

**Files:**
- Create: `apps/editor/src/main/discord/presence.ts`
- Test: `apps/editor/test/main/discord/presence.test.ts`

**Interfaces:**
- Consumes: Task 1 `PresenceInfo`, `DiscordActivity`, `buildActivity`
- Produces:
  - `interface Transport { setActivity(activity: DiscordActivity | null): Promise<void>; close(): void; onClose(cb: () => void): void }`
  - `type Connect = () => Promise<Transport>`
  - `interface DiscordPresence { setEnabled(enabled: boolean): void; setInfo(info: PresenceInfo | null): void; dispose(): void }`
  - `createDiscordPresence(opts: { connect: Connect; appStartedAt: number }): DiscordPresence` — 처음에는 꺼진 상태(`setEnabled(true)`를 불러야 연결 시작), info는 null
  - 상수 `SEND_INTERVAL_MS = 4000`, `RETRY_MS = 15000` (export)

동작 (스펙 3.4):
- 켜짐 + 연결 없음 + 연결 시도 중 아님 → `connect()`. reject면 `RETRY_MS` 뒤 다시
- 연결되면 마지막으로 보낸 값 기록을 지우고 현재 activity(`buildActivity(info, appStartedAt)`)를 바로 보낸다
- `setInfo` → 직전 전송 후 `SEND_INTERVAL_MS`가 지났으면 바로, 아니면 그 시각에 한 번 예약 (예약이 있으면 새로 만들지 않음, 보낼 때 최신 info 사용)
- 보내려는 activity의 `JSON.stringify`가 직전에 보낸 값과 같으면 보내지 않는다
- `setActivity` reject → `console.warn`, 그 transport를 `close()`하고 연결 없음으로 처리, `RETRY_MS` 뒤 재연결
- transport `onClose` → 연결 없음, 켜져 있으면 `RETRY_MS` 뒤 재연결
- 끄기 → 예약 타이머 모두 정리. 연결돼 있으면 `setActivity(null)`(실패는 무시) 뒤 `close()`. 연결 시도 중이었으면 결과가 오는 즉시 `close()`하고 아무것도 보내지 않는다
- `dispose()` → 끄기와 같되 `setActivity(null)`은 보내지 않고 바로 `close()`
- 모든 시간은 `setTimeout`·`Date.now()` (vitest 가짜 타이머로 제어)

- [ ] **Step 1: 실패하는 테스트 작성** — 가짜 transport와 가짜 connect를 만드는 헬퍼:

```ts
function fakeTransport() {
  const sent: (DiscordActivity | null)[] = []
  let closeCb = () => {}
  const t = {
    sent, closed: false, fail: false,
    setActivity: vi.fn(async (a: DiscordActivity | null) => { if (t.fail) throw new Error('pipe'); sent.push(a) }),
    close: vi.fn(() => { t.closed = true }),
    onClose: (cb: () => void) => { closeCb = cb },
    drop: () => closeCb()
  }
  return t
}
// connect 결과를 테스트가 정하도록 queue 사용. vi.useFakeTimers(); 각 단계 뒤 await vi.advanceTimersByTimeAsync(n)
```

테스트 (이름과 확인 내용):
- `켜면 연결하고 홈 activity를 보냄`: `setEnabled(true)` → `sent` = `[buildActivity(null, appStartedAt)]`
- `꺼진 동안에는 연결하지 않음`: `setInfo(info)`만 부르고 `connect` 호출 0회
- `4초 안의 여러 변경은 마지막 값 하나로`: 연결 직후 `setInfo(a)`, `setInfo(b)`, `setInfo(c)` → 3999ms 진행까지 `sent.length === 1`, 4000ms에서 2이고 마지막이 `buildActivity(c, …)`
- `같은 값은 다시 보내지 않음`: 4초 넘게 지난 뒤 같은 info로 `setInfo` 두 번 → 전송 1회만 늘어남
- `연결 실패하면 15초 뒤 다시 시도`: 첫 connect reject → 14999ms에 호출 1회, 15000ms에 2회
- `대기 중에 끊겨도 재연결 후 마지막 상태`: 연결 → `setInfo(a)` 직후 `setInfo(b)`(예약됨) → `drop()` → 4초가 지나도 끊긴 transport에 추가 전송 없음 → 15초 뒤 새 transport에 `buildActivity(b, …)`가 첫 전송
- `전송 실패하면 연결을 닫고 재연결`: `fail = true`인 transport → `close` 호출됨, 15초 뒤 connect 2회째
- `끄면 활동을 지우고 닫음, 재연결 안 함`: 연결 후 `setEnabled(false)` → 마지막 `sent`가 `null`, `closed === true`, 이후 60초 진행해도 connect 1회
- `연결 중에 끄면 늦게 온 연결을 닫음`: connect를 아직 resolve하지 않은 채 `setEnabled(false)` → resolve → 그 transport `closed === true`, `sent` 비어 있음
- `다시 켜면 다시 연결`: 끄고 다시 켜면 connect 2회째, 새 transport에 현재 activity 전송
- `dispose는 지우기 메시지 없이 닫음`: `sent`에 null 없음, `closed === true`

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/main/discord/presence.test.ts` / Expected: FAIL

- [ ] **Step 3: `createDiscordPresence` 구현** — 위 동작 그대로. 연결 시도마다 세대 번호(또는 시도 객체)를 두어, 끄기·dispose 뒤에 resolve된 연결은 닫고 버린다

- [ ] **Step 4: 통과 확인** — Expected: PASS (11개)

- [ ] **Step 5: 커밋** — `feat(editor): discord presence service with throttle and reconnect`

---

### Task 4: 실제 파이프 연결과 메인 배선

**Files:**
- Create: `apps/editor/src/main/discord/config.ts`, `apps/editor/src/main/discord/connection.ts`, `apps/editor/src/main/discord/register.ts`
- Modify: `apps/editor/src/main/project/settings.ts` (`Settings`, `parseSettings`), `apps/editor/src/main/ipc.ts` (`settingsFile` export), `apps/editor/src/main/index.ts`, `apps/editor/src/shared/api.ts` (`RcmApi`), `apps/editor/src/preload/index.ts`
- Test: `apps/editor/test/main/settings.test.ts` (케이스 추가)

**Interfaces:**
- Consumes: Task 1 `isPresenceInfo`, `PresenceInfo`; Task 2 `OP`, `encodeFrame`, `FrameDecoder`; Task 3 `createDiscordPresence`, `Transport`
- Produces:
  - `config.ts`: `export const DISCORD_CLIENT_ID = '<사용자에게 받은 Application ID>'` — 실행자는 이 Task를 시작할 때 사용자에게 값을 받는다. 아직 없으면 `''`로 두고 보고한다
  - `connection.ts`: `connectDiscord(clientId: string): Promise<Transport>`
  - `register.ts`: `startDiscordPresence(settingsFile: string): () => void` (반환값 = dispose)
  - `RcmApi`에 `setPresence(info: PresenceInfo | null): void`, `getDiscordPresence(): Promise<boolean>`, `setDiscordPresence(enabled: boolean): Promise<void>`
  - IPC 채널 `rcm:set-presence`(send), `rcm:get-discord-presence`(invoke), `rcm:set-discord-presence`(invoke)

- [ ] **Step 1: settings 실패 테스트 추가** — `it('discordPresence: boolean만 읽고, 없으면 필드 없음')`: `{ "recent": [], "discordPresence": false }`를 쓴 파일을 `loadSettings` → `discordPresence === false`; `"discordPresence": "no"`면 `undefined`; `updateSettings`로 `discordPresence = false` 저장 뒤 다시 읽으면 `false`이고 기존 프리셋·최근 목록 유지

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/main/settings.test.ts` / Expected: 새 케이스 FAIL

- [ ] **Step 3: `settings.ts`에 `discordPresence?: boolean` 추가** — `parseSettings`에서 `typeof === 'boolean'`일 때만 채운다. 통과 확인

- [ ] **Step 4: `connection.ts` 구현** — `connectDiscord`:
  - `i = 0..9` 순서로 `net.createConnection(\`\\\\?\\pipe\\discord-ipc-${i}\`)`. `error`면 다음 번호, 다 실패하면 reject
  - 연결되면 `encodeFrame(OP.HANDSHAKE, { v: 1, client_id: clientId })` 전송, `FrameDecoder`로 `FRAME` 중 `evt === 'READY'`를 5000ms 안에 받으면 resolve (못 받으면 소켓 닫고 reject)
  - 이후 수신: `PING` → 같은 payload로 `PONG`; `FRAME` 중 `evt === 'ERROR'` → `console.warn`; `CLOSE`·소켓 `close`·`error`·디코딩 throw → 소켓 정리 후 `onClose` 콜백 (한 번만)
  - `setActivity(a)`: `encodeFrame(OP.FRAME, { cmd: 'SET_ACTIVITY', args: a ? { pid: process.pid, activity: a } : { pid: process.pid }, nonce: randomUUID() })`를 `socket.write` 콜백으로 resolve/reject

- [ ] **Step 5: `register.ts` 구현** — `startDiscordPresence(settingsFile)`:
  - `DISCORD_CLIENT_ID`가 빈 문자열이면 IPC 핸들러는 등록하되(get은 설정값, set은 저장만) 서비스는 만들지 않는다
  - 서비스: `createDiscordPresence({ connect: () => connectDiscord(DISCORD_CLIENT_ID), appStartedAt: Date.now() })`; `loadSettings` 뒤 `setEnabled(settings.discordPresence ?? true)`
  - `ipcMain.on('rcm:set-presence', (_e, raw) => { if (raw === null || isPresenceInfo(raw)) service.setInfo(raw) })` — 그 밖의 값은 무시
  - `ipcMain.handle('rcm:get-discord-presence', async () => (await loadSettings(settingsFile)).discordPresence ?? true)`
  - `ipcMain.handle('rcm:set-discord-presence', async (_e, raw) => { if (typeof raw !== 'boolean') throw new Error(...); await updateSettings(...); service?.setEnabled(raw) })`
  - 반환: `() => service?.dispose()`

- [ ] **Step 6: 배선** — `ipc.ts`의 `settingsFile`을 export. `index.ts`의 `whenReady`에서 `registerProjectIpc()` 다음에 `const stopDiscord = startDiscordPresence(settingsFile())`, `app.on('will-quit', stopDiscord)`. `api.ts`·`preload/index.ts`에 세 메서드 추가 (`setPresence`는 `ipcRenderer.send`)

- [ ] **Step 7: 검증** — Run: `npm test` / Expected: 전부 PASS. Run: `npm run typecheck` / Expected: 오류 없음

- [ ] **Step 8: 커밋** — `git add`로 위 파일만 → `feat(editor): connect discord presence over named pipe`

---

### Task 5: 설정 페이지와 렌더러 연결

**Files:**
- Create: `apps/editor/src/renderer/src/ui/Switch.tsx`, `apps/editor/src/renderer/src/ui/Switch.module.css`, `apps/editor/src/renderer/src/settings/SettingsPage.tsx`, `apps/editor/src/renderer/src/settings/SettingsPage.module.css`
- Modify: `apps/editor/src/renderer/src/ui/index.ts`, `apps/editor/src/renderer/src/home/HomeScreen.tsx` (`Page`, `NAV`, 페이지 분기), `apps/editor/src/renderer/src/App.tsx`, `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (`EditorBody`)

**Interfaces:**
- Consumes: Task 4 `window.rcm.setPresence / getDiscordPresence / setDiscordPresence`; Task 1 `PresenceInfo`
- Produces: `Switch({ checked, onChange, label, disabled? }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean })` — `<button role="switch" aria-checked aria-label={label}>`, 클릭·Space·Enter로 토글. 켜짐 색 `var(--accent)`, 꺼짐 `var(--border)`

- [ ] **Step 1: `Switch` 작성 후 `ui/index.ts`에 export**

- [ ] **Step 2: `SettingsPage`** — 레이아웃은 `PresetsPage.module.css`의 `.page`·`.title`을 따른다. 제목 `설정`, 섹션 제목 `디스코드`, 한 줄: 왼쪽에 `디스코드에 활동 표시`와 그 아래 설명 `작업 중인 곡과 채보를 디스코드 프로필에 보여줘요. 끄면 아무것도 표시하지 않아요.`(보조 텍스트 색), 오른쪽에 `Switch`. 처음 값은 `getDiscordPresence()`(받기 전에는 `disabled`). 누르면 화면을 먼저 바꾸고 `setDiscordPresence`를 부르고, 실패하면 되돌린 뒤 `useToast`로 `설정을 저장하지 못했어요` 표시

- [ ] **Step 3: 홈 NAV** — `Page`에 `'settings'`, `NAV` 끝(AI 가이드 아래)에 `{ page: 'settings', icon: Settings, label: '설정' }` (lucide `Settings`), `main` 분기에 `SettingsPage`

- [ ] **Step 4: presence 보내기**
  - `App`: `useEffect(() => { if (state.screen === 'home') window.rcm.setPresence(null) }, [state.screen])`
  - `EditorBody`: `const [since] = useState(() => Date.now())`; `song.title`, `song.artist`, `chart.name`, `chart.level`이 바뀔 때마다 `window.rcm.setPresence({ title, artist, chart: chart.name, level: chart.level, since })` (위 네 값과 `since`를 deps로 하는 `useEffect`)

- [ ] **Step 5: 검증** — Run: `npm run typecheck` / Expected: 오류 없음. Run: `npm test` / Expected: PASS

- [ ] **Step 6: 커밋** — `feat(editor): settings page with discord presence toggle`

---

### Task 6: 실제 디스코드로 수동 확인

디스코드 데스크톱 앱을 켜고 로그인한 상태에서 `npm run dev` (Application ID와 `rcm` 이미지가 등록돼 있어야 한다)

- [ ] 홈: 몇 초 안에 `RCM` 활동, 아이콘, 경과 시간이 보인다 (버튼은 다른 계정에서 확인)
- [ ] 프로젝트 열기: `제목 - 아티스트` / `채보 Lv.N 편집 중`, 경과 시간이 0부터
- [ ] 채보 바꾸기, 메타데이터에서 제목 고치기: 몇 초 안에 따라 바뀜
- [ ] 홈으로: 곡 정보가 사라지고 앱 시작 기준 경과 시간
- [ ] 설정에서 끄기: 바로 사라짐. 앱 재시작해도 꺼진 상태 유지. 다시 켜면 다시 뜸
- [ ] 에디터를 켠 채로 디스코드 종료 → 다시 실행: 15초 안팎으로 다시 뜸. 그동안 에디터 정상
- [ ] 결과(되는 것과 안 되는 것)를 사용자에게 보고
