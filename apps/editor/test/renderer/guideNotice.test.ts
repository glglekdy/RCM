import { describe, expect, it } from 'vitest'
import { guideNoticeId } from '../../src/renderer/src/guide/guideNotice'

describe('guideNoticeId', () => {
  it('같은 내용이면 같은 id, 줄바꿈 방식은 무시', () => {
    expect(guideNoticeId('# 가이드\n본문')).toBe(guideNoticeId('# 가이드\r\n본문'))
  })

  it('내용이 바뀌면 id도 바뀜', () => {
    expect(guideNoticeId('# 가이드\n본문')).not.toBe(guideNoticeId('# 가이드\n본문!'))
  })

  it('설정에 저장할 수 있는 공지 id 형식', () => {
    expect(guideNoticeId('아무 내용')).toMatch(/^ai-guide-[0-9a-f]{8}$/)
  })
})
