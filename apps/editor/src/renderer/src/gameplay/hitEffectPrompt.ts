import { DEFAULT_EFFECT_MS, HOLD_EFFECT_INTERVAL_MS } from '@rcm/playfield'
import { DEFAULT_HIT_EFFECT_SETTINGS, HIT_EFFECT_LIMITS } from '../../../shared/hitEffects'

const { grid, fps, maxFrames, maxFileBytes } = HIT_EFFECT_LIMITS

const REFERENCE = `나한테 원하는 느낌의 레퍼런스가 있어. 만들기 전에 먼저 나에게 레퍼런스 이미지(스크린샷, GIF, 영상 캡처 등)를 달라고 해 줘.
받으면 색, 모양, 움직임, 길이를 분석해서 짧게 정리해 확인받은 뒤, 그 느낌대로 만들어 줘.`

const NO_REFERENCE = `레퍼런스는 없어. 나에게 묻지 말고 DJMAX 같은 리듬게임의 타격 이펙트 느낌으로 네가 직접 디자인해서 바로 만들어 줘.
어떤 컨셉(색, 모양, 움직임)으로 만들었는지는 결과와 함께 짧게 알려 줘.`

/** 설정의 `타격 이펙트` 카드에서 복사하는 프롬프트. AI가 에디터에 바로 넣을 수 있는 스프라이트를 만들게 한다 */
export function hitEffectPrompt(hasReference: boolean): string {
  return `RCM 채보 에디터의 테스트 플레이에서 노트를 쳤을 때 판정선에서 터지는 타격 이펙트 스프라이트를 만들어 줘.

[만들 것]
- 이펙트 2개: PERFECT 전용 하나, GREAT·GOOD이 함께 쓰는 하나. MISS는 이펙트가 없어.
- PERFECT 쪽이 더 화려하고 눈에 띄게, GREAT·GOOD 쪽은 같은 계열이지만 조금 수수하게 해 줘.

${hasReference ? REFERENCE : NO_REFERENCE}

[에디터가 읽는 파일 규칙]
- PNG만 쓸 수 있고, 파일 하나는 ${maxFileBytes / 1024 / 1024}MB를 넘으면 안 돼.
- 형식은 둘 중 하나로 골라 줘.
  1) 시트 PNG 한 장: 같은 크기 칸을 격자로 붙이고, 프레임 순서는 왼쪽 → 오른쪽, 위 → 아래. 가로·세로 각각 ${grid.max}칸까지.
  2) 프레임 PNG 여러 장: 0001.png, 0002.png …처럼 이름 순서가 곧 재생 순서. 최대 ${maxFrames}장.
- 프레임은 정사각형(예: 256×256)을 추천해. 에디터가 프레임의 긴 변을 이펙트 크기(기본 ${DEFAULT_HIT_EFFECT_SETTINGS.size}px)에 맞춰서 노트를 친 지점 한가운데에 그려. 그래서 이펙트 중심은 프레임 정중앙에 와야 해.
- 배경은 투명으로 해 줘. 검은 배경으로 만들면 에디터의 합치기를 "더하기"로 바꿔야 해.
- 재생 속도는 ${fps.min}~${fps.max}fps. 길이는 ${DEFAULT_EFFECT_MS / 1000}초 안팎(예: 12프레임 40fps)이 잘 어울려.
- 마지막 프레임은 거의 다 사라진 상태로 끝내 줘. 끝에서 뚝 끊기면 어색해.
- 롱노트와 슬라이드는 누르고 있는 동안 ${HOLD_EFFECT_INTERVAL_MS}ms마다 같은 이펙트가 겹쳐서 다시 터져. 겹쳐도 너무 하얗게 뭉개지지 않게 해 줘.

[결과물]
- 이미지 파일을 바로 만들 수 있으면 PNG로 줘. 못 만들면 내 컴퓨터에서 실행해서 PNG를 만드는 스크립트(Python + Pillow 등)와 실행 방법을 줘.
- 이펙트마다 에디터에 넣을 값도 알려 줘: 형식(시트 / 여러 장), 시트면 칸, 줄, 프레임 수, 재생 속도(fps), 그리고 합치기(보통 / 더하기).`
}
