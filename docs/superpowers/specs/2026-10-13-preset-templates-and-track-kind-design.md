# 프리셋 템플릿과 트랙 종류(플레이 / 기믹) 설계

- 작성일: 2026-10-13
- 기반: `docs/superpowers/specs/2026-10-10-named-tracks-design.md`(이름 붙은 트랙·프리셋), v0.4.1 보조 키(`PresetTrack.subKey`)
- 대상: `packages/core`, `packages/playfield`, `apps/editor`, `docs/CHART_FORMAT_GUIDE.md`

## 0. 목표

### 사용자가 정한 것
- **트랙 폭(`width`: 좁게/보통/넓게)을 없앤다.** 이 버전부터 저장하는 채보·프리셋에는 노트·트랙 넓이 관련 데이터를 **쓰지 않는다**
- 대신 트랙마다 **종류**를 고른다: **플레이**(치는 노트) / **기믹**(뮤즈대쉬 톱니바퀴처럼 게임이 해석하는 데이터)
- 기믹 노트는 **판정 없이 표시만** 한다: 키 없음, 콤보·정확도·결과에 들어가지 않음
- 파일 형식: 트랙에 `"kind": "gimmick"`을 더하고(생략 = 플레이) **포맷 버전은 1 그대로**. 예전 파일의 `width`는 에러 없이 읽고 버린다
- 프리셋 페이지의 `새 프리셋`은 포토샵 "새로운 문서 만들기"처럼 **템플릿 창**을 연다: 게임별 탭(기본 · DJMAX RESPECT V · EZ2ON REBOOT : R · Muse Dash · osu!mania), 카드 그리드, 오른쪽 세부 정보
- 기본 탭 맨 앞 카드는 **빈 프리셋**(트랙 1개 `Note_1`, 키 없음)
- 가운데 트랙처럼 한 트랙을 두 키로 치는 배치는 **각 게임의 기본값**을 따라 템플릿의 보조 키로 넣는다

### 성공 기준
- 이 버전에서 저장한 `.chart.json`과 설정 파일 프리셋에 `width` 필드가 하나도 없다
- `width`가 있는 예전 채보·설정 파일이 에러 없이 열리고, 한 번 저장하면 `width`가 사라진다 (노트·트랙은 그대로)
- 기믹 트랙의 노트는 타임라인·테스트 플레이에서 플레이 노트와 한눈에 구분되고, 테스트 플레이 결과(판정 수·콤보)에 영향을 주지 않는다
- `새 프리셋` → 템플릿 고르기 → `만들기` 한 번으로 그 게임 배치(보조 키 포함)의 프리셋이 생긴다
- 모든 내장 템플릿이 프리셋 검사(`presetErrors`)를 통과한다

### 하지 않는 것
- 기믹 노트의 판정·피격(장애물) 규칙, 기믹 종류 세분화(톱니·보스 등)
- 포맷 버전 올리기, `kind`를 모르는 예전 게임을 위한 변환
- 프리셋 목록 순서 바꾸기 / 앞 프리셋에 가려지는 규칙(트랙 스펙 3.4) 변경
- 템플릿을 사용자가 추가·편집하는 기능 (내장 고정 데이터만)

## 1. 트랙 종류 데이터 (`packages/core`)

### 1.1 타입·상수
```ts
type TrackKind = 'play' | 'gimmick'
interface Track { id: string; color?: string; kind?: TrackKind }  // kind 생략 = 'play'
```
- `TrackWidth`, `TRACK_WIDTHS` 삭제. `TRACK_KINDS: readonly TrackKind[] = ['play', 'gimmick']` 추가
- `isGimmick(t: Track): boolean` (`t.kind === 'gimmick'`)

### 1.2 검사 (`trackErrors`, `validateChart`)
- `kind`가 있으면 `'play'` 또는 `'gimmick'`이어야 한다. 아니면 `tracks[i].kind: play, gimmick 중 하나여야 함`
- `width`는 **검사하지 않고 버린다** (값이 무엇이든 에러 없음, 읽은 `Track`에 넣지 않음)
- `kind: 'play'`는 읽을 때 생략형으로 정규화한다 (`kind` 없음)

### 1.3 저장 (`serialize`)
- 트랙 필드 순서: `id, color, kind`. `kind`는 `'gimmick'`일 때만 쓴다
- `width`는 어떤 경우에도 쓰지 않는다 (메모리에 남아 있어도)

### 1.4 프로젝트 파일 (`apps/editor/src/main/project/projectFs.ts`)
- 트랙 복사 시 `{ id, color, kind }`만 옮긴다 (`width` 제거)

## 2. 프리셋 (`apps/editor/src/shared/presets.ts`)

- `PresetTrack extends Track`이므로 `kind`를 가진다. `width`는 없다
- `parseTrack`: `width`는 무시. `kind`가 있으면 `'play' | 'gimmick'`이어야 하고 아니면 그 프리셋을 버린다. `'play'`는 생략형으로
- `presetErrors`: **기믹 트랙의 `key`·`subKey`는 검사하지 않고 키 중복 집합에도 넣지 않는다**
- `resolveKeymap(tracks, presets)`: **채보 트랙이 기믹이면 프리셋과 상관없이 키 없음(`[]`)**. 자동 배정(`AUTO_KEYS`)도 플레이 트랙에만 순서대로 준다 (기믹 트랙은 건너뜀)
- `presetToChartTracks`: `kind`가 `'gimmick'`이면 복사, `width` 관련 코드 삭제
- 기본 프리셋 `6K + 사이드`: `Side_L`·`Side_R`의 `width: 'wide'`만 빠지고 플레이 트랙·주황색·Shift 키는 그대로

## 3. 편집기 화면

### 3.1 트랙 표 (`TrackRowsEditor`)
- `좁게/보통/넓게`(`SegmentedControl`·`WidthPicker`) 자리에 **종류 선택**:
  - 넓은 표(프리셋 페이지): `SegmentedControl` `플레이 | 기믹`
  - 좁은 표(채보 탭, `compact`): 아이콘 토글 버튼 하나 (플레이 = 음표, 기믹 = 톱니). title로 종류 표시
- `onLook` 패치: `{ color?, kind? }`
- 기믹 행의 키·보조 키 버튼은 비활성, 글자 `—`, title `기믹 트랙은 키가 없어요`
- 프리셋에서 트랙을 기믹으로 바꾸면 그 트랙의 `key`는 `null`, `subKey`는 지운다

### 3.2 채보 명령 (`editor/commands/tracks.ts`)
- 트랙 모양 바꾸기의 `width` 대신 `kind`. 이름 `트랙 종류 변경`으로 되돌리기 기록. `'play'`면 필드 삭제
- 기믹으로 바꿔도 노트는 그대로 둔다

### 3.3 타임라인·미니맵·프리셋 칩
- `TRACK_PX` 맵 → 단일 상수 `TRACK_PX = 48` (모든 트랙 같은 폭)
- 타임라인 기믹 트랙: 레인 배경에 옅은 빗금, 트랙 이름 앞에 `⚙`, 노트는 **속이 빈 테두리**(트랙 색, 2px)로. 롱노트 몸통도 테두리만
- 미니맵: 기믹 노트는 트랙 색 40% 불투명도
- 프리셋 칩(`PresetPicker`)·템플릿 카드 그림: 모든 칩 같은 폭, 기믹 칩은 점선 테두리
- 채보 탭 `키 배치` 카드: 기믹 트랙은 `⚙ 기믹`

### 3.4 녹음
- 기믹 트랙은 키맵이 비어 있으므로 녹음되지 않는다 (추가 코드 없음). 기믹 노트는 마우스로 찍는다

## 4. 테스트 플레이 (`packages/playfield`)

- `PlayState`: 기믹 레인의 노트는 판정 목록(`playNotes`)에 넣지 않는다 → 판정·콤보·결과·자동 플레이(`autoplayStep`)에서 자연히 빠진다
- 그리기용 기믹 노트 목록을 따로 둔다 (`gimmickNotes`, 시작 시각 순, 스크롤 위치 포함). 판정 상태가 없으므로 항상 그리고, 판정선을 지나면 그대로 내려가 사라진다
- `Playfield` 그리기: 기믹 노트는 속이 빈 테두리 + 50% 불투명도. 기믹 레인은 키 라벨 자리에 `⚙`, 눌림 표시 없음

## 5. 새 프리셋 템플릿 창

### 5.1 데이터 (`apps/editor/src/shared/presetTemplates.ts`, 순수)
```ts
interface PresetTemplate { id: string; name: string; tracks: PresetTrack[] }
interface TemplateGroup { id: string; name: string; templates: readonly PresetTemplate[] }
export const BLANK_TEMPLATE: PresetTemplate   // { id: 'blank', name: '빈 프리셋', tracks: [{ id: 'Note_1', key: null }] }
export const TEMPLATE_GROUPS: readonly TemplateGroup[]
```
- 기본 탭 = `[BLANK_TEMPLATE, ...DEFAULT_PRESETS]`
- 모든 템플릿은 얼려 둔다 (기본 프리셋과 같은 방식). 만들 때 복사한다

### 5.2 템플릿 키 배치 (⚠ 확인 필요 — 사용자 검토 후 확정)

`[X/Y]` = 주 키 X + 보조 키 Y. 트랙 id는 플레이 `Note_n`, 사이드 `Side_L`/`Side_R`. DJMAX 색(사용자 지정): 사이드 하늘색 `#38bdf8`, 트리거 빨강·분홍 `#f43f5e`.

| 탭 | 템플릿 | 트랙 (왼쪽→오른쪽) | 근거 |
|---|---|---|---|
| 기본 | 빈 프리셋 | `Note_1` (키 없음) | 사용자 결정 |
| | 4K~8K, 6K + 사이드 | 지금 `DEFAULT_PRESETS` (5K·7K 가운데는 `Space` 하나) | 기존 |
| DJMAX RESPECT V | 4B | Side_L(L Shift), A S ; ', Side_R(R Shift) | Steam 가이드 (확인 필요) |
| | 5B | Side_L, A S **[D/L]** ; ', Side_R | Steam 가이드: 가운데 레인을 두 키가 공유 (확인 필요) |
| | 6B | Side_L, A S D L ; ', Side_R | Steam 가이드 (확인 필요) |
| | 8B | Side_L, A S D, `Trigger_L`(C), `Trigger_R`(,), L ; ', Side_R (트리거 위치 확인 필요) | 사용자: 이름 Trigger_L/R |
| EZ2ON REBOOT : R | 4K / 5K / 6K / 8K | D F J K / D F Space J K / S D F J K L / A S D F J K L ; | 낮음 (5K·8K 보조 키가 기본으로 켜져 있다고 함 — 키 확인 전엔 보조 키 없이) |
| Muse Dash | 2레인 + 기믹 2 | `Air` [F/D], `Ground` [J/K], 기믹 `Saw_Air`, `Saw_Ground` (키 없음) | 낮음 |
| osu!mania | 4K / 5K / 6K / 7K | D F J K / D F Space J K / S D F J K L / S D F Space J K L | 중상 |

- 확정 전 구현은 이 표대로 하고, 사용자가 고친 값으로 바꾼다. 표가 바뀌어도 코드 구조는 그대로다

### 5.3 창 (`apps/editor/src/renderer/src/presets/NewPresetDialog.tsx`)
- 열기: 프리셋 페이지 `새 프리셋` 버튼 (지금의 4트랙 즉시 생성 대체)
- 구성 (넓은 모달, 약 860×560):
  - 위: 탭 (그룹 이름). 처음엔 기본 탭, `빈 프리셋` 선택
  - 왼쪽: 카드 그리드. 카드 = 레인 그림(같은 폭 칩, 트랙 색 테두리, 기믹 점선) + 이름 + 키 요약(`A S D/L ; '`, 기믹 `⚙`)
  - 오른쪽: 세부 정보 — `이름` 입력(기본값: 기본 탭은 템플릿 이름, 게임 탭은 `<게임 짧은 이름> <템플릿>` 예 `DJMAX 5B`), 트랙 목록(이름 · 종류 · 키), `만들기` / `닫기`
- 카드 클릭 = 선택, 더블클릭 = 바로 만들기. Enter(IME 조합 제외) = 만들기, Esc = 닫기
- 만들기: `newPresetId`로 새 id, 이름은 trim(비면 템플릿 이름), 트랙 복사 → 목록 끝에 추가·저장 → 새 프리셋 선택 → 창 닫기
- 저장 실패는 지금처럼 알림 창

## 6. 문서

- `docs/CHART_FORMAT_GUIDE.md`: `tracks[]` 표의 `width` 행을 `kind`로 교체. 예시 JSON에서 `width` 제거. 설명:
  - `kind`: `"play"`(기본, 생략) \| `"gimmick"`. 기믹 노트는 판정 대상이 아닌 **게임이 해석하는 데이터**(예: 장애물 등장 시각). 키를 배정하지 않는다
  - 예전 파일의 `width`는 무시한다. 이 버전부터는 쓰지 않는다
  - `kind`를 모르는 예전 게임은 기믹 노트를 일반 노트로 읽을 수 있다
- 사용 설명서(`UserGuidePage`): 트랙 설명의 `폭` → `종류(플레이·기믹)`, 프리셋 설명에 템플릿 창 한 줄
- `chartFormatGuide.test.ts`가 가이드와 코드 상수를 대조하면 함께 갱신

## 7. 테스트

- core: `width`가 있는 채보를 에러 없이 읽고 결과에 `width` 없음 / 잘못된 `kind` 에러 / `kind: 'play'` 정규화 / 저장 결과에 `width` 없음·`gimmick`만 기록
- presets: 설정 파일 `width` 무시 / 기믹 트랙 키 검사 생략 / `resolveKeymap`이 기믹 트랙에 `[]`, 자동 배정이 기믹을 건너뜀 / `presetToChartTracks` `kind` 복사
- presetTemplates: 모든 템플릿 `presetErrors` 통과, 그룹·템플릿 id 유일, 얼려 있음, 빈 프리셋 모양
- playfield: 기믹 노트가 판정·콤보·카운트·자동 플레이에 안 들어감, 그리기 목록에는 있음
- 편집기 명령: 트랙 종류 변경·되돌리기, `'play'`면 필드 삭제
