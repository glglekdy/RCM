import { describe, it, expect } from 'vitest'
import { buildActivity, isPresenceInfo } from '../../src/shared/presence'

const info = { title: '별의 노래', artist: '아티스트', chart: 'HARD', level: 12, since: 1000 }

describe('buildActivity', () => {
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
})

describe('isPresenceInfo', () => {
  it('문자열 셋과 유한한 숫자 둘일 때만 true', () => {
    expect(isPresenceInfo(info)).toBe(true)
    expect(isPresenceInfo(null)).toBe(false)
    expect(isPresenceInfo({ ...info, level: NaN })).toBe(false)
    expect(isPresenceInfo({ ...info, title: 3 })).toBe(false)
    expect(isPresenceInfo({ ...info, since: undefined })).toBe(false)
  })
})
