# 배속 플레이 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테스트 플레이에서 곡을 0.1~5.0배로 재생하는 "배속 플레이"를 추가한다.

**Architecture:** `AudioEngine`의 곡 위치 계산을 순수 클래스 `PlaybackClock`(위치 = 기준 + 경과 ctx 시간 × rate)으로 빼고, 음악 소스의 `playbackRate`를 같은 값으로 맞춘다. `@rcm/playfield`는 `rate`를 받아 판정 범위·판정 보정을 곡 시간으로 환산하고(× rate), 판정 글자·이펙트는 `RateClock`으로 실제 시간 빠르기로 그린다. 값은 저장하지 않는 모듈 스토어에 두고 `PlaytestOverlay`가 엔진과 플레이필드에 동시에 넘긴다.

**Tech Stack:** TypeScript, React, Web Audio API, Vitest (`npx vitest run <파일>`), `npm run typecheck`

**Spec:** `docs/superpowers/specs/2026-11-13-playback-rate-design.md`

## Global Constraints

- 범위 0.1 ~ 5.0, 0.1 단위, 기본 1.0. 숫자가 아니면 1.0.
- 이름은 "배속 플레이". 기존 "배속"(노트 낙하 빠르기, ↑/↓)의 이름·동작은 바꾸지 않는다.
- `rate`가 1이면 모든 계산 결과가 지금과 완전히 같아야 한다 (기존 테스트를 고치지 않고 통과).
- 편집 화면 재생은 항상 1.0. 설정 파일·설정 API·채보 포맷은 건드리지 않는다. 새 의존성 없음.
- 판정 범위(PERFECT 40 / GREAT 80 / GOOD 120ms), `HOLD_RELEASE_TOLERANCE`(120ms), 판정 보정, 준비 시간(1500ms), 판정 글자(400ms)·이펙트 길이는 **실제 시간 기준**.
- 주석과 화면 문구는 기존처럼 한국어 해요체. 커밋 메시지는 영어 conventional commits.

## Review Focus

1. 준비 시간(곡 위치 < 0) 중에 값을 바꾼다 → 음악이 곡 위치 0에서 정확히 시작한다. (Task 4 엔진 테스트)
2. ←/→를 꾹 눌러 같은 순간에 여러 번 바뀐다 → 곡 위치가 튀지 않는다. (Task 4 `PlaybackClock` 테스트)
3. 0.1씩 49번 올린다 → 부동소수 오차 없이 정확히 5.0, 그 위로는 안 올라간다. (Task 1 `clampRate` 테스트)
4. 곡이 끝나 결과만 남은 상태에서 값을 바꾸고 F5 → 예외 없이 새 값으로 다시 시작한다. (Task 4 엔진 테스트, Task 5 스토어 테스트)
5. 판정 보정을 쓰는 사용자가 2배로 친다 → 보정이 실제 시간 그대로 먹는다. (Task 3 테스트)

---

### Task 1: `clampRate`와 `RateClock` (`@rcm/playfield`)

**Files:**
- Create: `packages/playfield/src/rate.ts`
- Modify: `packages/playfield/src/index.ts` (`export * from './rate';` 추가)
- Test: `packages/playfield/test/rate.test.ts`

**Interfaces:**
- Produces:
  - `MIN_RATE = 0.1`, `MAX_RATE = 5`, `DEFAULT_RATE = 1`, `RATE_STEP = 0.1`
  - `clampRate(raw: number): number` — 범위로 자르고 0.1 단위 반올림(`Math.round(x * 10) / 10`), 유한한 수가 아니면 `DEFAULT_RATE`
  - `class RateClock { constructor(rate?: number); readonly rate: number; toReal(songMs: number): number; setRate(rate: number, songMs: number): void }` — 곡 시각을 "실제 시간 빠르기로 흐르는 시각"으로 바꾼다. `toReal(s) = realBase + (s - songBase) / rate`, 처음엔 두 base가 0. `setRate`는 `songMs` 시점의 값을 새 base로 잡아 연속성을 지킨다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { clampRate, RateClock, RATE_STEP } from '../src';

describe('clampRate', () => {
  it('0.1~5.0으로 자르고 0.1 단위로 반올림', () => {
    expect(clampRate(0)).toBe(0.1);
    expect(clampRate(-3)).toBe(0.1);
    expect(clampRate(99)).toBe(5);
    expect(clampRate(1.26)).toBe(1.3);
    expect(clampRate(Number.NaN)).toBe(1);
    expect(clampRate(Infinity)).toBe(1);
  });
  it('0.1부터 0.1씩 49번 올리면 정확히 5.0, 더 올려도 5.0', () => {
    let r = 0.1;
    for (let i = 0; i < 49; i++) r = clampRate(r + RATE_STEP);
    expect(r).toBe(5);
    expect(clampRate(r + RATE_STEP)).toBe(5);
  });
});

describe('RateClock', () => {
  it('rate 1이면 곡 시각 그대로', () => {
    expect(new RateClock().toReal(1234.5)).toBe(1234.5);
  });
  it('rate 2면 곡 2000ms가 실제 1000ms', () => {
    expect(new RateClock(2).toReal(2000)).toBe(1000);
  });
  it('도중에 바꿔도 그 순간 값이 이어진다', () => {
    const c = new RateClock();
    c.setRate(0.5, 1000);
    expect(c.toReal(1000)).toBe(1000);
    expect(c.toReal(1100)).toBe(1200);
    expect(c.rate).toBe(0.5);
  });
});
```

- [ ] **Step 2:** `npx vitest run packages/playfield/test/rate.test.ts` → FAIL (export 없음)
- [ ] **Step 3:** `rate.ts` 구현, `index.ts`에 export 추가
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** `git commit -m "feat(playfield): add clampRate and RateClock"`

---

### Task 2: 판정 범위를 rate에 맞춘다 (`judge.ts`, `PlayState`, `FreePlayState`)

**Files:**
- Modify: `packages/playfield/src/judge.ts`, `packages/playfield/src/playState.ts`, `packages/playfield/src/freePlayState.ts`
- Test: `packages/playfield/test/judge.test.ts`, `packages/playfield/test/playState.test.ts`, `packages/playfield/test/freePlayState.test.ts`

**Interfaces:**
- Produces:
  - `judgeDelta(deltaMs: number, rate = 1): Judgement | null` — 각 범위에 `× rate`
  - `PlayState.rate: number` (public, 기본 1), `FreePlayState.rate: number` (public, 기본 1). 두 클래스 안에서 `JUDGE_WINDOWS.*`와 `HOLD_RELEASE_TOLERANCE`가 쓰이는 **모든** 자리에 `× this.rate`, `judgeDelta` 호출에는 `this.rate`를 넘긴다. (`freePlayState.ts`의 180, 183, 246, 260, 269, 277, 329, 331, 341, 364, 375행 근처)
- `timingOf`, `judgeClockMs`, 생성자 시그니처는 그대로.

- [ ] **Step 1: 실패하는 테스트 추가**

`judge.test.ts`:
```ts
it('rate를 주면 범위가 곡 시간으로 늘거나 준다', () => {
  expect(judgeDelta(80, 2)).toBe('perfect');   // 실제 40ms
  expect(judgeDelta(81, 2)).toBe('great');
  expect(judgeDelta(30, 0.5)).toBe('great');   // 실제 60ms
  expect(judgeDelta(61, 0.5)).toBeNull();      // 실제 122ms
  expect(judgeDelta(40)).toBe('perfect');
});
```

`playState.test.ts` (파일의 `tm`·`chart` 헬퍼 사용, 480tick = 500ms):
```ts
it('rate 2: 곡 시간 80ms 늦어도 PERFECT, 놓침 판정은 240ms 뒤', () => {
  const s = new PlayState(chart([{ tick: 480, track: 'Note_1', type: 'tap' }, { tick: 960, track: 'Note_1', type: 'tap' }]), tm, 0);
  s.rate = 2;
  expect(s.press(0, 580)[0].judgement).toBe('perfect');
  expect(s.update(1240)).toEqual([]);
  expect(s.update(1241)[0].judgement).toBe('miss');
});
it('rate 2: 롱노트는 끝보다 곡 시간 240ms 전까지 떼도 PERFECT', () => {
  const s = new PlayState(chart([{ tick: 480, track: 'Note_1', type: 'hold', endTick: 1920 }]), tm, 0);
  s.rate = 2;
  s.press(0, 500);
  expect(s.release(0, 2000 - 240)[0].judgement).toBe('perfect');
});
```

`freePlayState.test.ts`: 그 파일의 기존 탭 노트 헬퍼로 같은 모양 1건 — `rate = 2`에서 곡 시간 80ms 늦은 `down`이 `perfect`, `rate = 0.5`에서 30ms 늦은 `down`이 `great`.

- [ ] **Step 2:** `npx vitest run packages/playfield/test` → 새 테스트만 FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run packages/playfield/test` → 전부 PASS (기존 테스트 수정 없이)
- [ ] **Step 5:** `git commit -m "feat(playfield): scale judge windows by playback rate"`

---

### Task 3: `Playfield`·`FreePlayfield`에 `rate` 옵션과 `setRate`

**Files:**
- Modify: `packages/playfield/src/Playfield.ts`, `packages/playfield/src/FreePlayfield.ts`
- Test: `packages/playfield/test/playfieldEffects.test.ts`, `packages/playfield/test/playfieldTouch.test.ts`

**Interfaces:**
- Consumes: Task 1 `clampRate`, `RateClock`; Task 2 `state.rate`
- Produces (두 클래스 모두):
  - 옵션 `rate?: number` — "배속 플레이(곡 재생 빠르기). 없으면 1. `setRate`로 바꿀 수 있다"
  - `setRate(rate: number): void` — `clampRate` 후 `this.state.rate`와 내부 `RateClock`에 반영. `RateClock.setRate`의 기준 시각은 `this.opts.getTimeMs()`.

**구현 규칙:**
- 판정 보정: `this.opts.judgeOffsetMs ?? 0`를 쓰는 모든 자리(`clock()`, `show()`의 기본 인자, `FreePlayfield` 350행 근처)를 `(judgeOffsetMs ?? 0) * rate`를 돌려주는 private 메서드 하나로 바꾼다.
- 연출 시각: 내부에는 지금처럼 곡 시각(ms)을 저장하고, 아래 **네 곳에 넘기는 순간에만** `RateClock.toReal()`로 바꾼다.
  1. `now - this.last.ms < JUDGEMENT_SHOW_MS` 비교의 양쪽
  2. `effectLayer.spawn(..., ms)`의 `ms`
  3. `effectLayer.draw(ctx, now, ...)`의 `now`
  4. `holdRepeat.tick(key, now)`의 `now`
- 노트 위치·판정에 쓰는 시각(`scroll.positionAt(now)`, `state.*`, `FreePlayfield` `spawn`의 네 번째 인자)은 곡 시각 그대로.

- [ ] **Step 1: 실패하는 테스트 추가**

`playfieldEffects.test.ts`의 `lanePlayfield`에 선택 인자 `rate?: number`를 더해 옵션으로 넘기고 (1fps 1프레임 스프라이트 = 실제 1초):
```ts
it('rate 2: 이펙트는 실제 1초(곡 2초) 동안 보인다', () => {
  lanePlayfield([{ tick: 480, track: 'Note_1', type: 'tap' }], true, effects, 2);
  expect(frameAt(500)).toHaveLength(1);
  expect(frameAt(2400)).toHaveLength(1);
  expect(frameAt(2600)).toEqual([]);
});
it('rate 0.5: 롱노트 반복 이펙트는 실제 150ms(곡 75ms)마다', () => {
  lanePlayfield([{ tick: 480, track: 'Note_2', type: 'hold', endTick: 960 }], true, effects, 0.5);
  expect(frameAt(500)).toHaveLength(1);
  expect(frameAt(570)).toHaveLength(1);
  expect(frameAt(575)).toHaveLength(2);
});
it('setRate로 도중에 바꿔도 이미 터진 이펙트가 튀지 않는다', () => {
  const pf = lanePlayfield([{ tick: 480, track: 'Note_1', type: 'tap' }], true);
  expect(frameAt(500)).toHaveLength(1);
  now = 900;            // 실제 400ms 지남
  pf.setRate(2);
  expect(frameAt(2000)).toHaveLength(1);   // 실제 950ms
  expect(frameAt(2200)).toEqual([]);       // 실제 1050ms
});
```

`playfieldTouch.test.ts` (그 파일의 플레이필드 생성·터치 헬퍼 사용): `judgeOffsetMs: 100`, `rate: 2`, 노트 500ms. 곡 시각 700에 누르면(판정 시계 = 700 − 100×2 = 500) `pf.state.counts.perfect`가 1.

- [ ] **Step 2:** `npx vitest run packages/playfield/test` → 새 테스트 FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run packages/playfield/test` → 전부 PASS, `npx tsc -p packages/playfield` 통과
- [ ] **Step 5:** `git commit -m "feat(playfield): rate option and setRate on playfields"`

---

### Task 4: `PlaybackClock`과 `AudioEngine` 재생 속도

**Files:**
- Create: `apps/editor/src/renderer/src/editor/audio/playbackClock.ts`
- Modify: `apps/editor/src/renderer/src/editor/audio/AudioEngine.ts`
- Test: `apps/editor/test/renderer/audio/playbackClock.test.ts`, `apps/editor/test/renderer/audio/audioEngine.test.ts` (새 파일)

**Interfaces:**
- Produces:
  - `class PlaybackClock { readonly rate: number; start(ctxSec: number, fromMs: number, rate: number): void; positionMs(ctxSec: number): number; ctxTimeAt(songMs: number): number; setRate(ctxSec: number, rate: number): void }` — `positionMs = anchorMs + (ctxSec − anchorCtxSec) × 1000 × rate`. `setRate`는 `ctxSec` 시점의 위치를 새 기준으로 잡는다. `ctxTimeAt`은 현재 rate로 그 곡 시각에 도달하는 ctx 시각.
  - `AudioEngine.play(fromMs: number, rate = 1): void` — 호출마다 rate를 이 값으로 정한다 (편집 화면은 인자를 안 넘기므로 항상 1).
  - `AudioEngine.setRate(rate: number): void` — 재생 중이 아니면 아무것도 하지 않는다.

**`AudioEngine` 구현 규칙:**
- `startCtxTime`·`fromMs` 필드를 `PlaybackClock`으로 대체. `positionMs()`는 `clock.positionMs(smooth.read(...))`를 `duration`으로 자르고, 재생 중에는 직전에 돌려준 값보다 작아지지 않게 한다 (`play()`에서 초기화).
- `play`: 소스의 `playbackRate.value = rate`. 시작 시각은 `now + delaySec / rate` (`playbackStartParams`는 그대로 쓴다).
- `setRate` (재생 중): `now = ctx.currentTime`(SmoothClock 아님)으로 `pos = clock.positionMs(now)`를 구하고 `clock.setRate(now, rate)`.
  - `pos < 0`(음악 시작 전): 기존 소스를 `onended = null` 후 `stop()`하고, 같은 버퍼로 새 소스를 만들어 `start(clock.ctxTimeAt(0), 0)`. 소스를 만드는 코드는 `play`와 공용 private 메서드로 뺀다.
  - 아니면 `music.playbackRate.setValueAtTime(rate, now)`.
  - 그 뒤 `setHits`와 같은 방식으로 아직 안 울린 효과음 예약을 취소하고 `cursor`를 현재 위치로 다시 잡는다.
- `tick`: 효과음 시각은 `Math.max(ctx.currentTime, clock.ctxTimeAt(hitMs))`. `LATE_GRACE_MS`·`LOOK_AHEAD_MS`는 실제 시간이므로 `× clock.rate`해서 곡 시간 창을 만든다.

- [ ] **Step 1: 실패하는 테스트 작성**

`playbackClock.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PlaybackClock } from '../../../src/renderer/src/editor/audio/playbackClock'

describe('PlaybackClock', () => {
  it('rate 1: 준비 시간은 음수 위치에서 흐른다', () => {
    const c = new PlaybackClock()
    c.start(10, -1500, 1)
    expect(c.positionMs(10)).toBe(-1500)
    expect(c.positionMs(11)).toBe(-500)
    expect(c.ctxTimeAt(0)).toBe(11.5)
  })
  it('rate 2: ctx 1초에 곡 2초', () => {
    const c = new PlaybackClock()
    c.start(10, 0, 2)
    expect(c.positionMs(11)).toBe(2000)
  })
  it('도중에 바꾸면 그 순간 위치가 이어진다', () => {
    const c = new PlaybackClock()
    c.start(10, 0, 2)
    c.setRate(11, 0.5)
    expect(c.positionMs(11)).toBe(2000)
    expect(c.positionMs(13)).toBe(3000)
    expect(c.ctxTimeAt(3000)).toBe(13)
    expect(c.rate).toBe(0.5)
  })
  it('같은 순간에 여러 번 바꿔도 위치가 튀지 않는다', () => {
    const c = new PlaybackClock()
    c.start(0, 0, 1)
    for (const r of [1.1, 1.2, 1.3, 1.4, 1.5]) c.setRate(4, r)
    expect(c.positionMs(4)).toBe(4000)
  })
})
```

`audioEngine.test.ts`: `AudioContext`를 가짜로 stub한다 (`currentTime`을 테스트가 바꿀 수 있고, `createBufferSource()`가 `start`·`stop`·`playbackRate.setValueAtTime`을 `vi.fn()`으로 기록하며 만든 소스를 배열에 모은다. `createBuffer`·`createGain`·`resume`·`close`는 최소 구현). `loadSilence(10_000)` 뒤:
```ts
it('play(-1500*2, 2): 음악은 실제 1.5초 뒤 처음부터, playbackRate 2', () => {
  ctx.currentTime = 5
  engine.play(-3000, 2)
  expect(sources[0].playbackRate.value).toBe(2)
  expect(sources[0].start).toHaveBeenCalledWith(6.5, 0)
})
it('준비 시간 중 setRate: 예약을 버리고 곡 위치 0에 맞춰 다시 예약한다', () => {
  ctx.currentTime = 5
  engine.play(-3000, 2)
  ctx.currentTime = 6          // 곡 위치 -1000
  engine.setRate(1)
  expect(sources[0].stop).toHaveBeenCalled()
  expect(sources[1].start).toHaveBeenCalledWith(7, 0)
  expect(sources[1].playbackRate.value).toBe(1)
})
it('음악이 시작된 뒤 setRate: 같은 소스의 속도만 바꾼다', () => {
  ctx.currentTime = 5
  engine.play(0)
  ctx.currentTime = 6
  engine.setRate(2)
  expect(sources).toHaveLength(1)
  expect(sources[0].playbackRate.setValueAtTime).toHaveBeenCalledWith(2, 6)
})
it('멈춘 상태의 setRate는 아무것도 하지 않고, 다음 play()는 1배', () => {
  engine.play(0, 3)
  engine.stop()
  expect(() => engine.setRate(2)).not.toThrow()
  engine.play(0)
  expect(sources.at(-1)!.playbackRate.value).toBe(1)
})
```
(효과음 소스도 `createBufferSource`로 만들어지므로 테스트에서는 `setHits([])` 상태로 둔다.)

- [ ] **Step 2:** `npx vitest run apps/editor/test/renderer/audio` → 새 테스트 FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run apps/editor/test/renderer/audio` → 전부 PASS
- [ ] **Step 5:** `git commit -m "feat(editor): playback rate in AudioEngine"`

---

### Task 5: 테스트 플레이 UI에 연결

**Files:**
- Create: `apps/editor/src/renderer/src/editor/playtest/rateStore.ts`
- Modify: `apps/editor/src/renderer/src/editor/playtest/PlaytestOverlay.tsx`, `apps/editor/src/renderer/src/editor/EditorScreen.tsx` (347~377행, 917행 근처), `apps/editor/src/renderer/src/guide/UserGuidePage.tsx` (238행 근처)
- Test: `apps/editor/test/renderer/playtestRate.test.ts`

**Interfaces:**
- Consumes: Task 1 `clampRate`, `RATE_STEP`, `DEFAULT_RATE`; Task 3 `rate` 옵션·`setRate`; Task 4 `engine.play(fromMs, rate)`, `engine.setRate(rate)`
- Produces:
  - `rateStore.ts`: `getPlaytestRate(): number`, `setPlaytestRate(next: number): void` — 모듈 변수 하나(기본 `DEFAULT_RATE`, `clampRate` 적용). 설정 파일에 저장하지 않는다.
  - `PlaytestOverlay` 새 prop `onRateChange: (rate: number) => void`

**구현 규칙:**
- `EditorScreen`: `startPlaytest`·`restartPlaytest`에서 `const rate = getPlaytestRate()` 후 `engine.play(fromMs - PLAYTEST_LEAD_IN_MS * rate, rate)`. 오버레이에 `onRateChange={(r) => engine.setRate(r)}`(안정된 콜백)를 넘긴다. 편집 화면의 `engine.play(...)` 호출은 건드리지 않는다.
- `PlaytestOverlay`: `speed`와 같은 모양으로 `rate` state + ref (`useState(getPlaytestRate)`). 플레이필드 생성 옵션에 `rate: rateRef.current`.
- `changeRate(step)`: `next = clampRate(rateRef.current + step)`, 값이 같으면 끝. 아니면 ref·state·스토어를 갱신하고 **같은 핸들러 안에서 순서대로** `onRateChange(next)` → `playfieldRef.current?.setRate(next)` (effect로 미루지 않는다: 엔진과 플레이필드가 같은 곡 시각에서 바뀌어야 한다).
- 키: 기존 `onKeyDown`에 `ArrowRight` → `+RATE_STEP`, `ArrowLeft` → `−RATE_STEP` (`preventDefault`). ↑/↓ 처리와 같은 방식.
- PC HUD: `배속 {speed} (↑/↓)` 바로 뒤에 `·` 구분점과 `<span>배속 플레이 {rate.toFixed(1)}x (←/→)</span>`.
- 폰 HUD: 기존 `배속 +` 버튼 뒤에 `플레이 −`(aria-label "배속 플레이 내리기"), `<span className={styles.phoneSpeed}>{rate.toFixed(1)}x</span>`, `플레이 +`(aria-label "배속 플레이 올리기"). 기존 `phoneButton` 스타일 사용.
- 가이드: 테스트 플레이 항목의 "…배속(노트가 내려오는 빠르기)을 바꿔요." 뒤에 `<kbd>←</kbd> <kbd>→</kbd>로 배속 플레이(곡이 재생되는 빠르기, 0.1~5.0배)를 바꿔요.` 추가.

- [ ] **Step 1: 실패하는 테스트 작성** (`playtestRate.test.ts`, `playtestSpeed.test.ts`의 `freshStore` 방식)

```ts
it('기본 1.0, 바꾸면 기억하고 범위를 지킨다', async () => {
  const store = await freshStore()
  expect(store.getPlaytestRate()).toBe(1)
  store.setPlaytestRate(2)
  expect(store.getPlaytestRate()).toBe(2)
  store.setPlaytestRate(99)
  expect(store.getPlaytestRate()).toBe(5)
  store.setPlaytestRate(0)
  expect(store.getPlaytestRate()).toBe(0.1)
})
it('모듈을 새로 읽으면(앱 재시작) 1.0으로 돌아간다', async () => {
  const a = await freshStore()
  a.setPlaytestRate(3)
  const b = await freshStore()
  expect(b.getPlaytestRate()).toBe(1)
})
```

- [ ] **Step 2:** `npx vitest run apps/editor/test/renderer/playtestRate.test.ts` → FAIL
- [ ] **Step 3:** `rateStore.ts` 구현 → PASS
- [ ] **Step 4:** `EditorScreen`·`PlaytestOverlay`·가이드 수정
- [ ] **Step 5:** `npm run typecheck` 통과, `npm test` 전부 PASS
- [ ] **Step 6: 앱에서 확인** (`npm run dev`, 음악이 있는 프로젝트)
  - F5 → →로 2.0x: 음악과 노트가 같이 빨라지고 끊기지 않는다. ←로 0.1x까지, →로 5.0x까지만 간다.
  - F4(자동) 켠 채 0.1x와 5.0x에서 전부 PERFECT, 노트가 판정선에서 맞는다.
  - 5.0x로 F5: 준비 시간이 약 1.5초. 준비 시간 중에 값을 바꿔도 첫 노트가 맞는다.
  - Esc 후 Space로 편집 화면 재생: 1.0배. 다시 F5: 마지막 값 유지.
  - 좁은 창(폰 배치)에서 `플레이 −` / `플레이 +` 버튼이 보이고 동작한다.
- [ ] **Step 7:** `git commit -m "feat(editor): 배속 플레이 in playtest"`
