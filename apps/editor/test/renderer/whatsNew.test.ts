import { describe, it, expect } from 'vitest'
import { parseInline, parseNotes } from '../../src/renderer/src/whatsNew/markdown'
import { RELEASE_NOTES } from '../../src/renderer/src/whatsNew/notes'
import { compareVersions, latestNotesVersion, notesHistory, whatsNewVersions } from '../../src/renderer/src/whatsNew/versions'

const available = ['0.4.0', '0.4.1', '0.5.0', '0.5.1', '0.5.2', '0.10.0']

describe('whatsNewVersions', () => {
  it('처음 설치면 보여 주지 않는다', () => {
    expect(whatsNewVersions(available, '0.5.2', { lastSeenVersion: null, firstRun: true })).toEqual([])
  })
  it('본 버전 기록이 없는 예전 사용자는 지금 버전만', () => {
    expect(whatsNewVersions(available, '0.5.2', { lastSeenVersion: null, firstRun: false })).toEqual(['0.5.2'])
    expect(whatsNewVersions(available, '0.6.0', { lastSeenVersion: null, firstRun: false })).toEqual([])
  })
  it('본 버전 다음부터 지금 버전까지, 최신부터', () => {
    expect(whatsNewVersions(available, '0.5.2', { lastSeenVersion: '0.5.1', firstRun: false })).toEqual(['0.5.2'])
    expect(whatsNewVersions(available, '0.5.2', { lastSeenVersion: '0.4.1', firstRun: false })).toEqual([
      '0.5.2',
      '0.5.1',
      '0.5.0'
    ])
  })
  it('이미 봤거나 더 새 버전을 봤으면 없음', () => {
    expect(whatsNewVersions(available, '0.5.2', { lastSeenVersion: '0.5.2', firstRun: false })).toEqual([])
    expect(whatsNewVersions(available, '0.5.1', { lastSeenVersion: '0.5.2', firstRun: false })).toEqual([])
  })
  it('지금 버전 이하에서 가장 최신 내역', () => {
    expect(latestNotesVersion(available, '0.5.2')).toBe('0.5.2')
    expect(latestNotesVersion(available, '0.9.0')).toBe('0.5.2')
    expect(latestNotesVersion(available, '0.3.0')).toBeNull()
  })
  it('지난 내역 전체: 지금 버전 이하, 최신부터', () => {
    expect(notesHistory(available, '0.5.1')).toEqual(['0.5.1', '0.5.0', '0.4.1', '0.4.0'])
    expect(notesHistory(available, '0.10.0')).toEqual(['0.10.0', '0.5.2', '0.5.1', '0.5.0', '0.4.1', '0.4.0'])
    expect(notesHistory(available, '0.3.0')).toEqual([])
  })
  it('버전은 숫자로 비교', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('0.5.2', '0.5.2')).toBe(0)
    expect(compareVersions('0.5.1', '0.5.2')).toBe(-1)
  })
})

describe('RELEASE_NOTES', () => {
  it('notes 폴더의 내역을 버전별로 읽는다', () => {
    // CI(Windows)는 CRLF로 받는다
    expect(RELEASE_NOTES.get('0.5.1')).toMatch(/^## 새 기능\r?\n/)
    expect([...RELEASE_NOTES.keys()].every((v) => /^\d+\.\d+\.\d+$/.test(v))).toBe(true)
  })
})

describe('parseNotes', () => {
  it('제목 · 목록 · 문단', () => {
    const text = '## 새 기능\n\n- 하나\n- 둘\n\n## 바뀐 점\n\n그냥 문장\n이어지는 줄\n\n- 셋\n'
    expect(parseNotes(text)).toEqual([
      { type: 'heading', text: '새 기능' },
      { type: 'list', items: ['하나', '둘'] },
      { type: 'heading', text: '바뀐 점' },
      { type: 'paragraph', text: '그냥 문장 이어지는 줄' },
      { type: 'list', items: ['셋'] }
    ])
  })
  it('CRLF와 * 목록도', () => {
    expect(parseNotes('## A\r\n* x\r\n')).toEqual([
      { type: 'heading', text: 'A' },
      { type: 'list', items: ['x'] }
    ])
  })
})

describe('parseInline', () => {
  it('코드와 굵게', () => {
    expect(parseInline('키 `Num1`처럼 **굵게** 끝')).toEqual([
      { kind: 'text', text: '키 ' },
      { kind: 'code', text: 'Num1' },
      { kind: 'text', text: '처럼 ' },
      { kind: 'bold', text: '굵게' },
      { kind: 'text', text: ' 끝' }
    ])
  })
  it('백슬래시 코드와 닫히지 않은 기호', () => {
    expect(parseInline('`\\` 키, 별 * 하나')).toEqual([
      { kind: 'code', text: '\\' },
      { kind: 'text', text: ' 키, 별 * 하나' }
    ])
  })
})
