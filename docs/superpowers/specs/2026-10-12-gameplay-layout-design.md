# 게임플레이 레이아웃 설정 설계

- 작성일: 2026-10-12
- 기반: `docs/superpowers/specs/2026-10-12-discord-presence-design.md`(설정 페이지), DJMAX 고정 배속 변경(`packages/playfield/src/view.ts`)
- 대상: `packages/playfield`, `apps/editor`, `docs/CHART_FORMAT_GUIDE.md`

## 0. 목표

### 사용자가 정한 것
- 홈의 **설정** 페이지에 **게임플레이** 섹션을 만든다
- 조절 항목: **판정선 두께**, **노트 두께(위아래)**, **노트 너비(= 레인 너비)**, **판정선 위치(위아래)**, **노트 모양(바 / 동그라미)**
- 설정 페이지 오른쪽에 **4키 미리보기**를 두고, 마우스를 올리면 **전체화면으로 보기** 버튼이 나온다
- 테스트 플레이의 레인 너비는 채보의 트랙 너비(`width`: 좁게/보통/넓게)와 **무관하게** 게임플레이 설정을 따른다
- 트랙 너비(`width`)는 **삭제하지 않고** 에디터 타임라인·미니맵 표시용으로만 남긴다

### 성공 기준
- 설정을 바꾸면 미리보기와 다음 테스트 플레이에 바로 반영되고, 앱을 다시 켜도 유지된다
- 미리보기(작은 화면·전체화면)와 테스트 플레이가 같은 그리기 코드로 같은 모습이다
- 판정선 위치를 바꿔도 노트 낙하 시간은 디맥 공식(`2692.857 / 배속` ms) 그대로다
- 기본값에서는 지금 테스트 플레이 화면과 똑같다

### 하지 않는 것
- 노트·판정선 색, 판정 문구·콤보 위치 등 다른 스킨 항목
- 트랙별로 다른 레인 너비 (모든 레인 같은 너비)
- 브라우저/OS 전체화면 API (앱 창을 덮는 오버레이로 대신한다)

## 1. 레이아웃 값 (`packages/playfield/src/layout.ts`, 순수)

```ts
type NoteShape = 'bar' | 'circle'
interface PlayfieldLayout {
  laneWidth: number            // 노트 너비 = 레인 너비 (px)
  noteHeight: number           // 바 노트 두께 (px). 동그라미일 때는 쓰지 않는다
  noteShape: NoteShape
  judgeLineThickness: number   // px
  judgeLineFromBottom: number  // 화면 아래 끝에서 판정선 중심까지 (px)
}
```

| 키 | 범위 | 기본 (지금 값) | 단위 |
|---|---|---|---|
| `laneWidth` | 30 ~ 200 | 64 | 1px |
| `noteHeight` | 4 ~ 60 | 14 | 1px |
| `judgeLineThickness` | 1 ~ 20 | 3 | 1px |
| `judgeLineFromBottom` | 0 ~ 400 | 120 | 1px |
| `noteShape` | `bar` \| `circle` | `bar` | |

- `DEFAULT_LAYOUT`, `LAYOUT_LIMITS`(키별 `{ min, max }`) 상수
- `sanitizeLayout(raw: unknown): PlayfieldLayout`: 객체가 아니면 기본값. 숫자 키는 유한한 수면 반올림 후 범위로 자르고, 아니면 그 키만 기본값. `noteShape`가 둘 중 하나가 아니면 `bar`
- `layoutEquals(a, b): boolean` (저장 생략 판단용)

## 2. 그리기 (`packages/playfield`)

### 2.1 `view.ts`
- `trackColumns(canvasWidth, laneCount, laneWidth)`: 모든 레인 같은 너비, 합계를 가운데 정렬. 트랙의 `width`는 보지 않는다 (`trackPixelWidth`, `TRACK_BASE_WIDTH`, `TRACK_WIDTH_FACTOR` 삭제)
- `judgeLineY(height, layout) = height − judgeLineFromBottom`. `pxPerMsForSpeed(speed, judgeY)`는 그대로 (판정선을 옮겨도 낙하 시간 유지)
- `holdBodyWidth(laneWidth) = round(laneWidth × 0.69)` (기본 64 → 44로 지금과 같음)
- `noteExtent(layout)`: 노트가 판정선 위아래로 차지하는 반높이. 바 = `noteHeight / 2`, 동그라미 = `(laneWidth − 6) / 2`. 화면 밖 여유(`pad`) 계산에 쓴다

### 2.2 `Playfield.ts`
- `PlayfieldOptions`에 추가
  - `layout?: PlayfieldLayout` (없으면 `DEFAULT_LAYOUT`)
  - `input?: boolean` (기본 true). false면 `start()`가 키 이벤트를 등록하지 않는다
  - `autoplay?: boolean` (기본 false). true면 매 프레임 지금 시각까지 머리가 지난 노트를 눌렀다고 처리하고, 롱노트는 끝 시각에 뗀다 (모두 PERFECT)
- `setLayout(layout)`: 다음 프레임부터 반영
- 노트 머리
  - 바: `roundRect(laneX + 3, y − noteHeight/2, laneWidth − 6, noteHeight, 3)` (지금과 같음)
  - 동그라미: 중심 `(laneX + laneWidth/2, y)`, 반지름 `(laneWidth − 6) / 2`
- 롱노트 몸통 너비 `holdBodyWidth(laneWidth)`, 레인 가운데 정렬. 모양과 무관
- 판정선: `fillRect(left, judgeY − thickness/2, fieldWidth, thickness)`
- 키 표시(D F J K)는 `judgeY + 48`에 그리고, `judgeLineFromBottom < 48`이면 그리지 않는다. 콤보·판정 문구 위치는 지금처럼 `judgeY` 기준

### 2.3 자동 플레이 (`autoplay`, `packages/playfield/src/autoplay.ts`, 순수)
- `autoplayStep(state: PlayState, now: number): JudgeEvent[]`: 머리 시각이 `now` 이하인데 아직 판정되지 않은 노트는 그 노트 시각으로 `press`, 누르는 중인 롱노트는 끝 시각이 `now` 이하면 끝 시각으로 `release`. 노트 시각 그대로 누르므로 모두 PERFECT (판정 규칙은 바꾸지 않는다)
- `Playfield`는 `autoplay`면 매 프레임 `state.update(now)` 전에 `autoplayStep`을 부르고, 누르는 중인 레인을 키빔으로 보여 준다
- 미리보기 전용 기능이지만 `Playfield` 옵션이므로 게임도 쓸 수 있다

## 3. 설정 저장 (`apps/editor`)

- `Settings`에 `gameplay?: PlayfieldLayout`. 읽을 때 `sanitizeLayout`, 필드가 없으면 저장하지 않은 것으로 본다
- IPC: `getGameplayLayout(): Promise<PlayfieldLayout>` (없으면 기본값), `setGameplayLayout(layout): Promise<void>` (메인에서 `sanitizeLayout` 후 저장)
- 렌더러 `gameplay/layoutStore.ts`: 앱 시작 때 불러오기, `getLayout()`, `useLayout()`(구독), `setLayout(next)` = 바로 반영 + 300ms 디바운스 저장 (실패하면 경고만, 값 유지)
- 테스트 플레이(`PlaytestOverlay`)는 `layout: getLayout()`으로 `Playfield`를 만든다

## 4. 설정 화면

### 4.1 배치
- 설정 페이지를 두 칸으로: 왼쪽 설정 카드들(디스코드, 게임플레이), 오른쪽 미리보기(고정 너비 약 300px, 높이 약 480px)
- 창이 좁으면(설정 페이지 폭 760px 미만) 미리보기를 설정 아래로 내린다

### 4.2 게임플레이 카드
| 줄 | 컨트롤 |
|---|---|
| 노트 모양 | `SegmentedControl` [바 \| 동그라미] |
| 노트 너비 | 슬라이더 + 숫자 칸 (30~200) |
| 노트 두께 | 슬라이더 + 숫자 칸 (4~60). 동그라미면 비활성 + 설명 `동그라미는 노트 너비를 따라가요` |
| 판정선 두께 | 슬라이더 + 숫자 칸 (1~20) |
| 판정선 위치 | 슬라이더 + 숫자 칸 (0~400), 설명 `화면 아래에서 판정선까지 거리` |
| | [기본값으로 되돌리기] (기본값과 같으면 비활성) |

- 숫자 칸은 기존 `NumberField`를 쓰고, 범위 밖 입력은 범위로 자른다
- 슬라이더는 새 `ui/Slider.tsx` (`<input type="range">`, 디자인 토큰 색)

### 4.3 미리보기
- `gameplay/LayoutPreview.tsx`: 캔버스에 `Playfield({ input: false, autoplay: true, layout, speed: 저장된 테스트 플레이 배속 })`
- 데모 채보: 4키(`Note_1`~`Note_4`, 기본 트랙 색), 120BPM, 4마디 패턴(4분 단타 → 8분 계단 → 동시치기 → 2박 롱노트 둘)을 반복. 끝나면 `Playfield`를 새로 만들어 처음부터
- 레이아웃이 바뀌면 `setLayout`만 부른다 (다시 만들지 않음)
- 마우스를 올리면 오른쪽 아래에 `전체화면으로 보기` 버튼(아이콘 `Maximize2`)이 나타난다. 키보드 포커스로도 보인다
- 전체화면: 앱 창 전체를 덮는 오버레이에 같은 미리보기를 창 크기로 그린다. 오른쪽 위 닫기 버튼, Esc로 닫는다. 오버레이 안에는 설정 컨트롤이 없다

## 5. 문서 (`docs/CHART_FORMAT_GUIDE.md`)
- 트랙 `width`: "에디터 표시용. 테스트 플레이와 게임의 레인 너비는 게임이 정한다"로 고친다
- 4.4절에 RCM 테스트 플레이 기본 레이아웃(레인 64px, 노트 14px, 판정선 3px, 아래에서 120px)을 참고값으로 적는다

## 6. 테스트
- `packages/playfield/test/layout.test.ts`: 기본값, 범위 자르기·반올림, 잘못된 키만 기본값, `noteShape` 검사, 객체가 아닌 입력
- `packages/playfield/test/view.test.ts`: `trackColumns`가 같은 너비·가운데 정렬이고 트랙 `width`를 무시, `holdBodyWidth(64) === 44`, `noteExtent` 바·동그라미, 판정선을 옮겨도 낙하 시간 유지
- `packages/playfield/test/autoplay.test.ts`: `autoplayStep`을 프레임 간격(16ms)으로 끝까지 부르면 단타·롱노트·동시치기가 모두 PERFECT, MISS 없음, 롱노트는 끝 시각에 뗌
- `apps/editor/test/main/settings.test.ts`: `gameplay` 읽기·정리, 다른 설정 유지
- `apps/editor/test/renderer/layoutStore.test.ts`: 바로 반영, 300ms 디바운스로 마지막 값만 저장, 실패해도 값 유지
- 수동: 설정 변경 → 미리보기 반영, 전체화면 열고 닫기, 테스트 플레이 반영, 앱 재시작 후 유지, 기본값에서 지금 화면과 같음
