# 타격 이펙트 설계

- 작성일: 2026-10-25
- 범위: `playfield` 이펙트 렌더링 → 에디터 설정 저장(main) → 설정 화면(renderer)

## 0. 사용자가 정한 것
- DJMAX처럼 노트를 치면 판정선에서 이펙트가 터진다. **에디터 테스트 플레이 전용**이라 채보 포맷·곡 폴더·AI 가이드는 바뀌지 않는다.
- 스프라이트 형태: **시트 PNG 1장**(가로 칸 × 세로 줄)과 **프레임별 PNG 여러 장** 둘 다 지원.
- 슬롯 2개: **PERFECT 전용**, **GREAT·GOOD 공용**. **MISS는 이펙트 없음.**
- **레인형 + 모바일(자유형)** 테스트 플레이 모두 적용.
- 롱노트·슬라이드는 **누르고 있는 동안 반복**해서 터진다.

## 1. 정한 기본값
- 스프라이트가 없는 슬롯은 캔버스로 그리는 **기본 이펙트**(판정 색 링이 퍼지고 파편이 흩어짐, 약 300ms)를 쓴다.
- 설정: 켜기/끄기(기본 켬), 크기(px, 기본 128, 범위 32~512), 합치기 방식(`normal` | `add`, 기본 `normal`. `add`는 `globalCompositeOperation = 'lighter'`로 검은 배경 에셋용).
- 롱노트 반복 간격: 고정 150ms(BPM 무관). 반복 이펙트는 머리 판정의 슬롯을 따른다.
- 이펙트 시각은 **곡 시각(`getTimeMs`)** 기준이다. 일시정지하면 멈추고, 되감으면(시각이 생성 시각보다 앞서면) 지운다.

## 2. playfield (`packages/playfield/src/hitEffects.ts`)

```ts
export type HitEffectSlot = 'perfect' | 'normal';   // normal = GREAT·GOOD
export interface SpriteFrame { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }
export interface HitEffectSprite { frames: SpriteFrame[]; fps: number }
export interface HitEffects {
  enabled: boolean;
  size: number;
  blend: 'normal' | 'add';
  perfect?: HitEffectSprite;   // 없으면 기본 이펙트
  normal?: HitEffectSprite;
}
```

- `slotFor(judgement)`: `perfect` → `'perfect'`, `great`·`good` → `'normal'`, `miss` → `null`.
- `sheetFrames(image, w, h, cols, rows, count)`: 시트를 왼→오, 위→아래 순으로 잘라 `count`개 프레임(≤ cols×rows)을 만든다.
- `frameAt(sprite, ageMs)`: `floor(ageMs * fps / 1000)`, 끝나면 `null`.
- `HitEffectLayer`
  - `spawn(x, y, slot, judgement, ms)`: 살아 있는 이펙트는 최대 64개, 넘치면 가장 오래된 것부터 버린다.
  - `draw(ctx, ms, effects, colors)`: 스프라이트는 가로세로 비율을 지켜 긴 변을 `size`에 맞추고 `(x, y)` 중심에 그린다. 기본 이펙트는 판정 색(`colors.perfect` 등)으로 그린다. 끝난 이펙트는 지운다.
  - `clear()`
- `HoldRepeater`: 레인(또는 노트) 키별 마지막 반복 시각을 기억하고, 잡고 있는 동안 150ms가 지나면 다시 터뜨리라고 알려 준다. 놓으면 지운다.

### 레인형 `Playfield`
- `opts.hitEffects?: HitEffects`, `setHitEffects(e)`.
- `show(events)`에서 이벤트마다(머리·꼬리) `slotFor`가 null이 아니면 그 레인 가운데 x, 판정선 y에서 `spawn`한다. 레인 x는 마지막으로 그린 `cols`를 쓴다.
- 매 프레임 `state.heldNote(lane) >= 0`인 레인(자동 플레이 포함)은 `HoldRepeater`로 반복한다. 슬롯은 그 노트 머리 판정을 따른다.
- 이펙트는 판정선 위, 콤보·판정 글자 아래 층에 그린다.

### 모바일 `FreePlayfield`
- 같은 옵션·메서드.
- 탭·트레이스·플릭 머리: `x + width/2` 칸 위치, 판정선 y.
- 슬라이드의 머리·중간 지점(`tick`)·꼬리, 잡고 있는 동안의 반복: 그 시각의 `slideSpan(note, ms)` 가운데.
- 잡고 있음: `state.isHeld(i) || state.autoHolding(i)`.

## 3. 설정 저장 (main)
`settings.json`에 추가:

```jsonc
"hitEffects": {
  "enabled": true, "size": 128, "blend": "normal",
  "perfect": { "type": "sheet", "file": "sheet.png", "cols": 4, "rows": 2, "count": 8, "fps": 30 },
  "normal":  { "type": "frames", "files": ["0001.png", "0002.png"], "fps": 30 }
}
```

- 파일은 `userData/hit-effects/<slot>/`에 **복사해 둔 이름**이다. 슬롯에 새로 불러오면 그 폴더를 비우고 다시 채운다.
- 시트 `cols`·`rows` 1~32, `count` 1~cols×rows, `fps` 1~120. 프레임 묶음 최대 120장. 파일 하나 최대 10MB, `.png`만 받는다.
- 프레임 묶음은 고른 파일 이름을 자연 정렬(숫자 인식)한 순서로 재생한다.
- `sanitizeHitEffects(raw)`: 잘못된 키는 기본값, 숫자는 범위로 자른다. 잘못된 슬롯은 비운다. 파일 이름에 경로 구분자나 `..`가 있으면 버린다.
- IPC (`rcm:` 접두사)
  - `get-hit-effects` → 설정값
  - `set-hit-effects(raw)` → 정리해서 저장 (켜기·크기·합치기·칸·줄·fps 등 숫자 변경)
  - `pick-hit-effect(slot, type)` → 파일 대화상자(시트는 1장, 프레임은 여러 장) → 복사 → 새 설정값. 취소하면 `null`
  - `clear-hit-effect(slot)` → 폴더 삭제, 슬롯 비움
  - `read-hit-effect-images(slot)` → 파일 순서대로 `Uint8Array[]`

## 4. 설정 화면 (renderer)
- `gameplay/hitEffectStore.ts`: `layoutStore`처럼 불러오기·구독·늦게 저장. 슬롯 이미지를 `createImageBitmap(new Blob([bytes]))`로 읽고, 시트는 `sheetFrames`로 잘라 `HitEffects`를 만든다. 디코드 실패나 파일 없음은 슬롯별 오류 문구로 남기고 그 슬롯은 기본 이펙트를 쓴다.
- `gameplay/HitEffectSettings.tsx`: 설정 페이지 `게임플레이` 카드 아래 `타격 이펙트` 카드.
  - 켜기/끄기, 크기 슬라이더+숫자, 합치기 방식(보통 / 더하기)
  - 슬롯 2칸(PERFECT / GREAT·GOOD): [시트 PNG 불러오기] [PNG 여러 장 불러오기] [기본으로], 시트면 칸·줄·프레임 수, 공통 fps, 반복 재생 미리보기(작은 캔버스), 오류 문구
- 테스트 플레이(`PlaytestOverlay`)와 레이아웃 미리보기가 `HitEffects`를 넘겨받고, 바뀌면 `setHitEffects`로 바로 반영한다.

## 5. 테스트
- 단위: `slotFor`, `sheetFrames` 영역, `frameAt` 끝, `HitEffectLayer` 생성·만료·되감기·최대 개수, `HoldRepeater` 간격, `sanitizeHitEffects`, 프레임 파일 자연 정렬.
- 앱 실행: 레인형·모바일 테스트 플레이에서 PERFECT/GREAT·GOOD 슬롯과 MISS 무반응, 롱노트·슬라이드 반복, 시트·프레임 묶음 불러오기와 기본으로 되돌리기를 눈으로 확인.
