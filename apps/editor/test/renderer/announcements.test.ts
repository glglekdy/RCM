import { describe, expect, it } from 'vitest'
import { parseAnnouncements } from '../../src/renderer/src/announcements/parseAnnouncements'

describe('parseAnnouncements', () => {
  it('## 날짜 제목마다 공지 하나, 첫 ## 전 글과 주석은 버림', () => {
    const list = parseAnnouncements(
      [
        '# RCM 공지사항',
        '<!-- 작성 방법:',
        '## 2000-01-01 이건 주석 안이라 공지가 아님',
        '-->',
        '앱에 안 보이는 소개',
        '',
        '## 2026-11-02 둘째 공지',
        '본문 **굵게**',
        '',
        '### 소제목',
        '- 목록',
        '',
        '## 2026-11-01 첫 공지',
        '내용'
      ].join('\r\n')
    )
    expect(list.map((a) => [a.date, a.title, a.body])).toEqual([
      ['2026-11-02', '둘째 공지', '본문 **굵게**\n\n### 소제목\n- 목록'],
      ['2026-11-01', '첫 공지', '내용']
    ])
  })

  it('날짜가 없어도 제목만으로 공지가 됨, 제목이 비면 버림', () => {
    const list = parseAnnouncements('## 날짜 없는 공지\n본문\n## 2026-11-01\n버려짐')
    expect(list.map((a) => [a.date, a.title])).toEqual([['', '날짜 없는 공지']])
  })

  it('id: 설정에 저장할 수 있는 형식, 같은 날짜·제목이면 같은 id, 겹치면 번호를 붙임', () => {
    const [a, b, c] = parseAnnouncements('## 2026-11-01 공지\n가\n## 2026-11-01 공지\n나\n## 다른 공지')
    expect(a.id).toMatch(/^2026-11-01-[0-9a-f]{8}$/)
    expect(b.id).toBe(`${a.id}-2`)
    expect(c.id).toMatch(/^[0-9a-f]{8}$/)
    expect(parseAnnouncements('## 2026-11-01 공지\n본문만 바뀜')[0].id).toBe(a.id)
  })

  it('빈 파일이면 빈 목록', () => {
    expect(parseAnnouncements('')).toEqual([])
    expect(parseAnnouncements('# 제목만')).toEqual([])
  })
})
