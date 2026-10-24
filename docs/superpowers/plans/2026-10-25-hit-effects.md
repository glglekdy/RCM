# 타격 이펙트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테스트 플레이에서 노트를 치면 판정선에서 이펙트가 터지고, 사용자가 PNG 스프라이트(시트 1장 또는 프레임 여러 장)로 바꿀 수 있다.

**Architecture:** `packages/playfield/src/hitEffects.ts`가 이펙트 수명·프레임·그리기를 맡고 `Playfield`/`FreePlayfield`가 판정 이벤트로 터뜨린다. 설정값(파일 이름·칸·줄·fps 등)은 `settings.json`의 `hitEffects`, PNG는 `userData/hit-effects/<slot>/`에 복사한다. renderer의 `hitEffectStore`가 바이트를 `ImageBitmap`으로 읽어 스프라이트를 만들어 플레이 화면에 넘긴다.

**Tech Stack:** TypeScript, Canvas 2D, Electron(main/preload IPC), React, vitest

**Spec:** `docs/superpowers/specs/2026-10-25-hit-effects-design.md`

## Global Constraints

- 에디터 전용: `packages/core`, 채보 포맷, 곡 폴더, `docs/CHART_FORMAT_GUIDE.md`는 바꾸지 않는다.
- 슬롯 `'perfect'`(PERFECT) / `'normal'`(GREAT·GOOD). MISS는 터지지 않는다.
- 기본값: `enabled: true`, `size: 128`(32~512), `blend: 'normal'`(`'normal' | 'add'`, `add` = `globalCompositeOperation = 'lighter'`).
- 시트 `cols`·`rows` 1~32, `count` 1~cols×rows, `fps` 1~120. 프레임 묶음 최대 120장. 파일 하나 최대 10MB, `.png`만.
- 롱노트·슬라이드 반복 간격 150ms, 머리 판정의 슬롯을 따른다.
- 이펙트 시각은 곡 시각. 시각이 생성 시각보다 앞서면(되감기) 지운다. 살아 있는 이펙트 최대 64개.
- 기본 이펙트(스프라이트 없는 슬롯): 판정 색 링 + 파편, 300ms.
- 사용자 문구는 기존 화면처럼 해요체 한국어. 코드 주석도 한국어, 주변 밀도에 맞춘다.
- `packages/playfield`는 세미콜론·작은따옴표, `apps/editor`는 세미콜론 없음 — 파일마다 주변 스타일을 따른다.
- 커밋은 main에 바로 한다.

## Review Focus

1. **설정 파일에 남은 파일 이름이 실제로 없음** (사용자가 userData를 지움) → 그 슬롯만 오류 문구 + 기본 이펙트, 테스트 플레이는 정상. Task 5 테스트 `파일을 못 읽은 슬롯은 기본 이펙트와 오류`.
2. **시트 칸·줄을 이미지보다 크게 입력** (예: 64px 이미지에 32칸) → 프레임 폭이 1px 이상으로 잘리고 0 크기 영역을 만들지 않는다. Task 1 테스트 `작은 시트도 0 크기 프레임을 만들지 않음`.
3. **악의적·깨진 설정 값** (`files: ["../../x.png"]`, 음수 fps) → 경로 구분자·`..` 이름은 버리고 숫자는 범위로 자른다. Task 3 테스트.
4. **프레임 묶음 이름 순서** (`f2.png`, `f10.png`, `f1.png`) → 1, 2, 10 순서. Task 4 테스트.
5. **테스트 플레이 중 시크(되감기)** → 미래 시각에 생성된 이펙트가 남아 멈춰 있지 않는다. Task 1 테스트 `되감으면 지움`.

---

### Task 1: playfield 이펙트 모듈

**Files:**
- Create: `packages/playfield/src/hitEffects.ts`
- Modify: `packages/playfield/src/index.ts` (export 추가)
- Test: `packages/playfield/test/hitEffects.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HitEffectSlot = 'perfect' | 'normal';
  export type HitEffectBlend = 'normal' | 'add';
  export interface SpriteFrame { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }
  export interface HitEffectSprite { frames: SpriteFrame[]; fps: number }
  export interface HitEffects { enabled: boolean; size: number; blend: HitEffectBlend; perfect?: HitEffectSprite; normal?: HitEffectSprite }
  export const DEFAULT_HIT_EFFECTS: Readonly<HitEffects>;      // { enabled: true, size: 128, blend: 'normal' }
  export const HOLD_EFFECT_INTERVAL_MS = 150;
  export const DEFAULT_EFFECT_MS = 300;
  export const MAX_LIVE_EFFECTS = 64;
  export function slotFor(j: Judgement): HitEffectSlot | null;
  export function sheetFrames(image: CanvasImageSource, width: number, height: number, cols: number, rows: number, count: number): SpriteFrame[];
  export function spriteDurationMs(s: HitEffectSprite): number;  // frames.length * 1000 / fps
  export function frameAt(s: HitEffectSprite, ageMs: number): SpriteFrame | null;
  export type EffectColors = Pick<PlayfieldColors, 'perfect' | 'great' | 'good'>;
  export class HitEffectLayer {
    spawn(x: number, y: number, judgement: Exclude<Judgement, 'miss'>, ms: number): void;
    draw(ctx: CanvasRenderingContext2D, ms: number, effects: HitEffects, colors: EffectColors): void;
    clear(): void;
    get count(): number;   // 살아 있는 이펙트 수 (테스트용)
  }
  export class HoldRepeater<K> {
    /** 잡고 있으면 true를 돌려줄 때마다 다시 터뜨린다. 처음 잡은 프레임은 false (머리 이벤트가 이미 터뜨림) */
    tick(key: K, ms: number): boolean;
    /** 이번 프레임에 tick하지 않은(놓은) 키를 지운다 */
    sweep(): void;
  }
  ```
  `PlayfieldColors`는 `Playfield.ts`에 있으므로 `EffectColors`는 `Record<'perfect' | 'great' | 'good', string>`로 직접 정의해 순환 import를 피한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `packages/playfield/test/hitEffects.test.ts`. 그리기는 호출을 기록하는 가짜 ctx(`drawImage`, `arc`, `stroke`, `save`, `restore`, `beginPath`, `moveTo`, `lineTo` 등 `vi.fn()`과 `globalAlpha`, `globalCompositeOperation`, `strokeStyle`, `lineWidth` 필드)로 한다.

```ts
it('slotFor: PERFECT만 단독, GREAT·GOOD 공용, MISS 없음', () => {
  expect(slotFor('perfect')).toBe('perfect');
  expect(slotFor('great')).toBe('normal');
  expect(slotFor('good')).toBe('normal');
  expect(slotFor('miss')).toBeNull();
});
it('sheetFrames: 왼→오, 위→아래, count에서 멈춤', () => {
  const f = sheetFrames(img, 400, 200, 4, 2, 6);
  expect(f).toHaveLength(6);
  expect(f[0]).toMatchObject({ sx: 0, sy: 0, sw: 100, sh: 100 });
  expect(f[3]).toMatchObject({ sx: 300, sy: 0 });
  expect(f[4]).toMatchObject({ sx: 0, sy: 100 });
});
it('작은 시트도 0 크기 프레임을 만들지 않음', () => {
  const f = sheetFrames(img, 16, 16, 32, 32, 1024);
  expect(f.every(fr => fr.sw >= 1 && fr.sh >= 1)).toBe(true);
});
it('frameAt: fps로 프레임을 고르고 끝나면 null', () => {
  const s = { frames: sheetFrames(img, 400, 100, 4, 1, 4), fps: 10 }; // 400ms
  expect(frameAt(s, 0)).toBe(s.frames[0]);
  expect(frameAt(s, 250)).toBe(s.frames[2]);
  expect(frameAt(s, 400)).toBeNull();
  expect(spriteDurationMs(s)).toBe(400);
});
it('스프라이트 슬롯은 drawImage, 끝나면 지움', () => { /* perfect 슬롯 sprite 400ms, spawn(…, 'perfect', 0) → draw(ms=100) drawImage 1회, draw(ms=401) 후 count 0 */ });
it('스프라이트 없는 슬롯은 기본 이펙트를 판정 색으로 그리고 300ms 뒤 지움', () => { /* spawn great → draw(100) strokeStyle === colors.great, arc 호출; draw(301) 후 count 0 */ });
it('긴 변을 size에 맞추고 가운데에 그림', () => { /* 프레임 100×50, size 128, spawn(200,300) → drawImage(img, sx,sy,100,50, 136, 268, 128, 64) */ });
it('add면 lighter로 합치고 원래대로 돌림', () => { /* draw 중 globalCompositeOperation === 'lighter' 기록, 끝나면 save/restore 쌍 */ });
it('enabled false면 그리지 않음', () => {});
it('되감으면 지움', () => { /* spawn(…, 1000) → draw(ms=500) 후 count 0 */ });
it('최대 64개, 넘치면 오래된 것부터', () => { /* 70번 spawn → count 64 */ });
it('HoldRepeater: 처음 false, 150ms마다 true, 놓으면 다시 처음부터', () => {
  const r = new HoldRepeater<number>();
  expect(r.tick(0, 0)).toBe(false); r.sweep();
  expect(r.tick(0, 149)).toBe(false); r.sweep();
  expect(r.tick(0, 150)).toBe(true); r.sweep();
  expect(r.tick(0, 299)).toBe(false); r.sweep();
  expect(r.tick(0, 300)).toBe(true); r.sweep();
  r.sweep(); // 이번 프레임엔 안 잡음 → 지워짐
  expect(r.tick(0, 400)).toBe(false);
});
it('HoldRepeater: 시각이 되돌아가면 그 시각부터 다시 잰다', () => { /* tick(0,1000) → tick(0,500) false → tick(0,650) true */ });
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run packages/playfield/test/hitEffects.test.ts` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: `hitEffects.ts` 구현**
  - `sheetFrames`: `sw = max(1, floor(width / cols))`, `sh = max(1, floor(height / rows))`, `count`는 `cols*rows`로 자른다.
  - 기본 이펙트: 진행률 `p = age / 300`, `globalAlpha = 1 - p`, 링 반지름 `size * (0.15 + 0.35 * easeOut(p))` 선 두께 `max(1, size * 0.04 * (1 - p))`, 파편 8개는 45°마다 반지름 `size * (0.2 + 0.3p)` ~ `size * (0.3 + 0.3p)` 선분. 색은 판정 색.
  - `draw`는 `ctx.save()` 후 `blend === 'add'`이면 `'lighter'`, 끝에 `ctx.restore()`. 만료(스프라이트 `frameAt === null`, 기본은 age ≥ 300)·되감기(`ms < spawnMs`) 이펙트는 배열에서 뺀다.
  - `HoldRepeater`: `Map<K, { last: number; seen: boolean }>`; `tick`은 없으면 `{last: ms}` 넣고 false, `ms < last`면 `last = ms` false, `ms - last >= 150`이면 `last = ms` true. `sweep`은 이번 프레임 `seen` 아닌 키 삭제 후 `seen` 리셋.
  - `index.ts`에 `export * from './hitEffects';`

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run packages/playfield/test/hitEffects.test.ts` / Expected: PASS

- [ ] **Step 5: Commit** — `git add packages/playfield && git commit -m "feat(playfield): hit effect layer with sprite frames and a built-in burst"`

---

### Task 2: 레인형·모바일 플레이 화면에 연결

**Files:**
- Modify: `packages/playfield/src/Playfield.ts`
- Modify: `packages/playfield/src/FreePlayfield.ts`

**Interfaces:**
- Consumes: Task 1 전부.
- Produces: 두 클래스 모두 `PlayfieldOptions.hitEffects?: HitEffects`(없으면 `DEFAULT_HIT_EFFECTS`), `setHitEffects(e: HitEffects): void`. `FreePlayfield`의 옵션 타입에도 같은 필드.

- [ ] **Step 1: `Playfield` 연결**
  - 필드: `effects: HitEffects`, `effectLayer = new HitEffectLayer()`, `holdRepeat = new HoldRepeater<number>()`, `holdJudgement: (Judgement | undefined)[]`(레인별 머리 판정), 마지막으로 그린 `cols`·`judgeY`.
  - `show(events)`: 이벤트마다 `part === 'head'`면 `holdJudgement[lane] = judgement`. `slotFor`가 null이 아니고 `cols`가 있으면 `spawn(레인 가운데 x, judgeY, judgement, e.ms)`. (기존 `last` 갱신은 그대로)
  - `draw`: 판정선을 그린 바로 뒤, 키 라벨·콤보 앞에서 — 레인마다 `state.heldNote(lane) >= 0`이면 `holdRepeat.tick(lane, now)`가 true일 때 `holdJudgement[lane] ?? 'perfect'`(miss면 건너뜀)로 spawn. 그 뒤 `holdRepeat.sweep()`, `effectLayer.draw(ctx, now, this.effects, colors)`.
  - `stop()`에서 `effectLayer.clear()`.
- [ ] **Step 2: `FreePlayfield` 연결**
  - `headJudgement = new Map<number, Judgement>()`(노트 인덱스별).
  - `show(events)`: 노트 `n = state.notes[e.note]`. 위치 칸: 슬라이드면 `state.slideSpan(n, e.ms)`, 아니면 `{x: n.x, width: n.width}`; 화면 x = `rect.fieldX + (x + width/2) * rect.colPx`, y = 마지막 `judgeY`. 머리면 `headJudgement.set(e.note, judgement)`.
  - `draw`: 판정선 뒤, 터치 원 앞에서 — 슬라이드 중 `state.isHeld(i) || (autoplay && state.autoHolding(i))`인 노트를 `holdRepeat.tick(i, now)`로 반복, 위치는 `slideSpan(n, now)`. `firstAtOrAbove(this.startPos, nowPos - this.maxHoldSpanPos)`부터 `startPos[i] > nowPos`가 될 때까지 훑어 `kind === 'slide' && headJudged && !tailJudged`이면서 잡힌 노트만 반복한다.
- [ ] **Step 3: 확인** — Run: `npm run typecheck && npx vitest run packages/playfield` / Expected: 오류 없음, 기존 테스트 PASS
- [ ] **Step 4: Commit** — `git commit -am "feat(playfield): burst hit effects on judged notes and held holds/slides"`

---

### Task 3: 설정 값 형식과 정리 (shared + settings.ts)

**Files:**
- Create: `apps/editor/src/shared/hitEffects.ts`
- Modify: `apps/editor/src/main/project/settings.ts` (`Settings.hitEffects?`, `parseSettings`)
- Test: `apps/editor/test/shared/hitEffects.test.ts`, `apps/editor/test/main/settings.test.ts`(케이스 1개 추가)

**Interfaces:**
- Consumes: `HitEffectSlot`, `HitEffectBlend` from `@rcm/playfield`.
- Produces:
  ```ts
  export type HitEffectSource =
    | { type: 'sheet'; file: string; cols: number; rows: number; count: number; fps: number }
    | { type: 'frames'; files: string[]; fps: number }
  export interface HitEffectSettings { enabled: boolean; size: number; blend: HitEffectBlend; perfect?: HitEffectSource; normal?: HitEffectSource }
  export const HIT_EFFECT_SLOTS: readonly HitEffectSlot[]  // ['perfect', 'normal']
  export const DEFAULT_HIT_EFFECT_SETTINGS: Readonly<HitEffectSettings>
  export const HIT_EFFECT_LIMITS: { size: {min:32,max:512}; grid: {min:1,max:32}; fps: {min:1,max:120}; maxFrames: 120; maxFileBytes: 10*1024*1024 }
  export function isSafeEffectFileName(name: unknown): name is string   // 비어 있지 않고 / \ 없고 '..' 아니고 .png로 끝남
  export function sanitizeHitEffectSettings(raw: unknown): HitEffectSettings
  export function isHitEffectSlot(raw: unknown): raw is HitEffectSlot
  ```

- [ ] **Step 1: 실패하는 테스트**

```ts
it('없거나 깨진 값은 기본값', () => {
  expect(sanitizeHitEffectSettings(undefined)).toEqual(DEFAULT_HIT_EFFECT_SETTINGS)
  expect(sanitizeHitEffectSettings({ enabled: 'yes', size: 'big', blend: 'x' })).toEqual(DEFAULT_HIT_EFFECT_SETTINGS)
})
it('숫자는 반올림 후 범위로 자름', () => {
  const s = sanitizeHitEffectSettings({ size: 9999, perfect: { type: 'sheet', file: 'sheet.png', cols: 0, rows: 40, count: 999, fps: -3 } })
  expect(s.size).toBe(512)
  expect(s.perfect).toEqual({ type: 'sheet', file: 'sheet.png', cols: 1, rows: 32, count: 32, fps: 1 })
})
it('위험한 파일 이름은 버림', () => {
  expect(sanitizeHitEffectSettings({ normal: { type: 'sheet', file: '../x.png', cols: 1, rows: 1, count: 1, fps: 30 } }).normal).toBeUndefined()
  expect(sanitizeHitEffectSettings({ normal: { type: 'frames', files: ['0001.png', 'a/b.png', '..'], fps: 30 } }).normal)
    .toEqual({ type: 'frames', files: ['0001.png'], fps: 30 })
})
it('프레임이 하나도 없거나 120장을 넘으면', () => { /* files [] → 슬롯 없음; 130장 → 앞 120장 */ })
// settings.test.ts
it('hitEffects를 정리해서 읽음', () => { /* 기존 테스트 방식으로 settings.json에 hitEffects:{size:9999} → loadSettings 결과 size 512 */ })
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/shared/hitEffects.test.ts apps/editor/test/main/settings.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — `sanitizeLayout`과 같은 방식. `count` 기본 = `cols*rows`, 범위 1~cols×rows. `parseSettings`: `if (obj.hitEffects !== undefined) settings.hitEffects = sanitizeHitEffectSettings(obj.hitEffects)`.
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(editor): hit effect settings format and sanitizing"`

---

### Task 4: 이펙트 파일 복사·읽기와 IPC

**Files:**
- Create: `apps/editor/src/main/hitEffectFiles.ts`
- Modify: `apps/editor/src/main/ipc.ts`, `apps/editor/src/preload/index.ts`, `apps/editor/src/shared/api.ts`
- Test: `apps/editor/test/main/hitEffectFiles.test.ts`

**Interfaces:**
- Consumes: Task 3 전부.
- Produces (main):
  ```ts
  export function naturalCompare(a: string, b: string): number           // 'f2' < 'f10', 대소문자 무시
  /** 슬롯 폴더를 비우고 sources를 복사한다. 시트는 'sheet.png', 프레임은 이름 자연 정렬 후 '0001.png'…. 복사한 이름 목록을 돌려준다 */
  export async function importHitEffectFiles(root: string, slot: HitEffectSlot, type: 'sheet' | 'frames', sources: string[]): Promise<string[]>
  export async function clearHitEffectFiles(root: string, slot: HitEffectSlot): Promise<void>
  export async function readHitEffectFiles(root: string, slot: HitEffectSlot, names: string[]): Promise<Uint8Array[]>
  export function sourceWithFiles(prev: HitEffectSource | undefined, type: 'sheet' | 'frames', names: string[]): HitEffectSource
  ```
  `root` = `join(app.getPath('userData'), 'hit-effects')`. 오류는 사용자에게 보여 줄 한국어 메시지의 `Error`로 던진다: `'PNG 파일만 쓸 수 있어요'`, `'파일 하나가 10MB를 넘어요'`, `'프레임은 120장까지 넣을 수 있어요'`.
- Produces (renderer API, `window.rcm`):
  ```ts
  getHitEffects(): Promise<HitEffectSettings>
  setHitEffects(s: HitEffectSettings): Promise<void>
  /** 대화상자에서 고른 파일을 복사하고 새 설정값을 돌려준다. 취소하면 null */
  pickHitEffect(slot: HitEffectSlot, type: 'sheet' | 'frames'): Promise<HitEffectSettings | null>
  clearHitEffect(slot: HitEffectSlot): Promise<HitEffectSettings>
  readHitEffectImages(slot: HitEffectSlot): Promise<Uint8Array[]>   // 저장된 설정의 파일 순서
  ```

- [ ] **Step 1: 실패하는 테스트** (tmp 폴더: `fs.mkdtemp(path.join(os.tmpdir(), 'rcm-fx-'))`)

```ts
it('naturalCompare: 숫자를 크기 순으로', () => {
  expect(['f10.png', 'f2.png', 'F1.png'].sort(naturalCompare)).toEqual(['F1.png', 'f2.png', 'f10.png'])
})
it('프레임: 자연 정렬 순서로 0001.png부터 복사하고 예전 파일은 지움', async () => { /* 먼저 sheet 가져오기 → frames [f10,f2,f1] 가져오기 → 반환 ['0001.png','0002.png','0003.png'], 0001이 f1 내용, sheet.png 없음 */ })
it('시트: sheet.png 하나', async () => {})
it('png가 아니거나 10MB를 넘거나 121장이면 거절하고 기존 파일은 그대로', async () => { /* rejects.toThrow('PNG 파일만 쓸 수 있어요') 등. 검사는 복사 전에 한다 */ })
it('readHitEffectFiles: 순서대로 바이트, 없는 파일은 reject', async () => {})
it('sourceWithFiles: 시트였던 슬롯에 시트를 다시 넣으면 칸·줄·fps 유지, 아니면 1×1·30fps', () => {
  expect(sourceWithFiles(undefined, 'sheet', ['sheet.png'])).toEqual({ type: 'sheet', file: 'sheet.png', cols: 1, rows: 1, count: 1, fps: 30 })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/main/hitEffectFiles.test.ts` / Expected: FAIL
- [ ] **Step 3: `hitEffectFiles.ts` 구현** — 확장자·크기(`fs.stat`)·장수 검사를 모두 끝낸 뒤 `fs.rm(dir, {recursive, force})` → `mkdir` → `copyFile`. 프레임 묶음의 기존 설정 fps도 `sourceWithFiles`가 유지한다.
- [ ] **Step 4: IPC·preload·api** — `ipc.ts`에 `rcm:get-hit-effects`(없으면 `DEFAULT_HIT_EFFECT_SETTINGS` 복사본), `rcm:set-hit-effects`(정리 후 저장; 슬롯의 파일 이름은 저장된 값을 유지하고 숫자만 받는다 — 렌더러가 파일 이름을 바꾸지 못하게), `rcm:pick-hit-effect`(`isHitEffectSlot` 검사, `showOpenDialog` 필터 `[{ name: 'PNG', extensions: ['png'] }]`, 프레임은 `multiSelections`, 제목 `'타격 이펙트 시트 고르기'` / `'타격 이펙트 프레임 고르기'`), `rcm:clear-hit-effect`, `rcm:read-hit-effect-images`. 기존 `get/set-gameplay-layout` 옆에 둔다. preload·`api.ts`에 위 시그니처 추가.
- [ ] **Step 5: 확인** — Run: `npx vitest run apps/editor/test/main && npm run typecheck` / Expected: PASS, 오류 없음
- [ ] **Step 6: Commit** — `git commit -m "feat(editor): import, store and read hit effect sprites"`

---

### Task 5: renderer 이펙트 store

**Files:**
- Create: `apps/editor/src/renderer/src/gameplay/hitEffectStore.ts`
- Modify: `apps/editor/src/renderer/src/App.tsx` (`loadHitEffects()`를 `loadLayout()` 옆에서 호출, 실패는 무시 주석)
- Test: `apps/editor/test/renderer/hitEffectStore.test.ts`

**Interfaces:**
- Consumes: Task 1 `sheetFrames`, `HitEffects`, `HitEffectSprite`; Task 4 `window.rcm` API; Task 3 타입.
- Produces:
  ```ts
  export function buildSprite(source: HitEffectSource, images: readonly ImageBitmap[]): HitEffectSprite
  export function subscribe(l: () => void): () => void
  export async function loadHitEffects(): Promise<void>
  export function getHitEffects(): HitEffects               // 플레이 화면에 넘길 값 (참조는 바뀔 때만 새로)
  export function useHitEffectSettings(): HitEffectSettings
  export function useHitEffectErrors(): Partial<Record<HitEffectSlot, string>>
  export function useHitEffects(): HitEffects
  /** 숫자·켜기·합치기 변경. 바로 반영, 300ms 뒤 저장 (layoutStore와 같음) */
  export function updateHitEffectSettings(next: HitEffectSettings): void
  export async function pickHitEffect(slot: HitEffectSlot, type: 'sheet' | 'frames'): Promise<void>  // 취소면 아무것도 안 함, 오류는 throw
  export async function clearHitEffect(slot: HitEffectSlot): Promise<void>
  ```
  슬롯별 디코드한 `ImageBitmap[]`을 캐시해 두고, 칸·줄·count·fps만 바뀌면 다시 읽지 않고 `buildSprite`만 다시 한다. 이미지 디코드는 `createImageBitmap(new Blob([bytes], { type: 'image/png' }))`. 슬롯 오류 문구: `'이펙트 파일을 읽지 못해서 기본 이펙트를 써요'`.

- [ ] **Step 1: 실패하는 테스트** — `layoutStore.test.ts`처럼 `vi.stubGlobal('window', { rcm: api })`, `vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200, close() {} })))`, `freshStore()`.

```ts
it('buildSprite: 시트는 칸·줄·count로 자르고, 프레임은 이미지마다 한 장', () => {
  expect(buildSprite({ type: 'sheet', file: 'sheet.png', cols: 4, rows: 2, count: 6, fps: 24 }, [bmp400x200]).frames).toHaveLength(6)
  expect(buildSprite({ type: 'frames', files: ['0001.png', '0002.png'], fps: 24 }, [a, b]).frames.map(f => f.image)).toEqual([a, b])
})
it('불러오면 슬롯마다 이미지를 읽어 스프라이트를 만든다', async () => { /* getHitEffects 응답에 perfect 시트 → getHitEffects().perfect.frames 길이 count, normal 없음 */ })
it('파일을 못 읽은 슬롯은 기본 이펙트와 오류', async () => { /* readHitEffectImages('perfect') reject → getHitEffects().perfect undefined, errors.perfect 문구 */ })
it('칸 수만 바꾸면 다시 읽지 않고 바로 반영, 마지막 값만 저장', async () => { /* updateHitEffectSettings 두 번 → readHitEffectImages 호출 수 그대로, 300ms 뒤 setHitEffects 1회 */ })
it('pickHitEffect 취소면 그대로', async () => {})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run apps/editor/test/renderer/hitEffectStore.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현** — `layoutStore.ts` 구조를 따른다.
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(editor): hit effect store decodes sprites for the playfield"`

---

### Task 6: 설정 카드, 미리보기·테스트 플레이 연결, 유저 가이드

**Files:**
- Create: `apps/editor/src/renderer/src/gameplay/HitEffectSettings.tsx`, `HitEffectSettings.module.css`, `HitEffectPreview.tsx`
- Modify: `apps/editor/src/renderer/src/settings/SettingsPage.tsx` (`<GameplaySettings />` 아래 `<HitEffectSettings />`)
- Modify: `apps/editor/src/renderer/src/gameplay/LayoutPreview.tsx`, `apps/editor/src/renderer/src/editor/playtest/PlaytestOverlay.tsx` — 생성 시 `hitEffects: getHitEffects()`, `useHitEffects()` 값이 바뀌면 `setHitEffects`
- Modify: `apps/editor/src/renderer/src/guide/UserGuidePage.tsx` ("녹음과 테스트 플레이"에 항목 1개)

**Interfaces:**
- Consumes: Task 5 store 전부, Task 1 `HitEffectLayer`, `spriteDurationMs`, `DEFAULT_EFFECT_MS`, `DEFAULT_PLAYFIELD_COLORS`.

- [ ] **Step 1: `HitEffectPreview({ slot })`** — 작은 캔버스(96×96 CSS px, dpr 반영)에서 `HitEffectLayer`로 가운데에 `slot === 'perfect' ? 'perfect' : 'great'`를 `max(지속시간, 300) + 200`ms마다 spawn, rAF로 그린다. 시각은 `performance.now()`. 크기는 미리보기 칸에 맞게 `size: 88`로 덮어쓴 `HitEffects`를 넘긴다.
- [ ] **Step 2: `HitEffectSettings` 카드** — 제목 `타격 이펙트`. 행: `이펙트 켜기`(Switch), `크기`(Slider + NumberField `px`, 32~512), `합치기`(SegmentedControl `보통` / `더하기`, 설명 `검은 배경 이펙트는 더하기를 고르세요`). 슬롯 두 칸 `PERFECT`, `GREAT · GOOD`: 미리보기, 현재 상태 문구(`기본 이펙트` / `시트 4×2 · 8프레임` / `프레임 12장`), 버튼 `시트 PNG 불러오기` · `PNG 여러 장 불러오기` · `기본으로`(슬롯이 비었으면 disabled), 시트면 `칸`·`줄`·`프레임 수` NumberField, 스프라이트면 `fps` NumberField, `useHitEffectErrors()` 문구. 불러오기 오류는 `useToast()`로 `err.message`. 끄면 나머지 행은 `GameplaySettings`의 `styles.disabled`처럼 흐리게.
- [ ] **Step 3: 연결** — `LayoutPreview`와 `PlaytestOverlay`에 Interfaces대로. `UserGuidePage` "녹음과 테스트 플레이"에: `<b>설정 → 타격 이펙트</b>에서 노트를 칠 때 터지는 이펙트를 PNG로 바꿀 수 있어요. 시트 한 장(칸 · 줄 입력)이나 프레임별 PNG 여러 장을 넣고, PERFECT와 GREAT · GOOD에 따로 정해요.`
- [ ] **Step 4: 확인** — Run: `npm run typecheck && npm test` / Expected: 오류 없음, 전부 PASS
- [ ] **Step 5: 앱에서 확인** (`run` 스킬로 `npm run dev`) — 설정 미리보기에서 기본 이펙트가 레인마다 터짐 → PERFECT에 시트 PNG, GREAT·GOOD에 프레임 묶음을 불러와 칸·줄·fps 변경이 바로 반영됨 → 레인형 테스트 플레이: MISS는 안 터지고 롱노트는 잡는 동안 반복 → 모바일 채보 테스트 플레이: 탭은 노트 위치, 슬라이드는 따라가며 반복 → `기본으로` → 앱 재시작 후에도 설정 유지.
- [ ] **Step 6: Commit** — `git commit -m "feat(editor): hit effect settings card with sprite import and live preview"`
