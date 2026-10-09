import { describe, expect, it } from 'vitest'
import {
  commitDraft,
  editDraft,
  initDraft,
  parseNumber,
  syncDraft
} from '../../../src/renderer/src/ui/fieldDraft'

const num = (t: string) => parseNumber(t, 1, 999)
const str = String

describe('fieldDraft', () => {
  it('입력 → Enter → blur: 정확히 한 번만 commit', () => {
    let d = editDraft('140')
    const first = commitDraft(d, 120, num, str) // Enter
    expect(first.commit).toBe(140)
    d = first.next
    const second = commitDraft(d, 140, num, str) // 이어지는 blur
    expect(second.commit).toBeNull()
  })

  it('포커스 중 바깥 값이 바뀌면(Undo) 고치지 않았을 때 새 값을 보여주고 blur에서 commit 없음', () => {
    let d = initDraft('140') // 포커스, 입력 없음
    d = syncDraft(d, '120') // Undo로 값 변경
    expect(d.text).toBe('120')
    const r = commitDraft(d, 120, num, str)
    expect(r.commit).toBeNull()
    expect(r.next.text).toBe('120')
  })

  it('고치는 중에는 바깥 값이 바뀌어도 draft를 덮어쓰지 않음', () => {
    const d = syncDraft(editDraft('14'), '120')
    expect(d.text).toBe('14')
  })

  it('잘못된 입력은 commit 없이 원래 값으로 복원', () => {
    for (const bad of ['', 'abc', '0', '1000']) {
      const r = commitDraft(editDraft(bad), 120, num, str)
      expect(r.commit).toBeNull()
      expect(r.next).toEqual({ text: '120', edited: false })
    }
  })

  it('고쳤다가 원래 값으로 돌아오면 commit 없음', () => {
    expect(commitDraft(editDraft('120'), 120, num, str).commit).toBeNull()
  })

  it('문자열 칸도 같은 규칙', () => {
    const parse = (t: string) => t
    expect(commitDraft(editDraft('B'), 'A', parse, str).commit).toBe('B')
    expect(commitDraft(initDraft('A'), 'A', parse, str).commit).toBeNull()
  })
})
