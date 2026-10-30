import { describe, expect, it } from 'vitest'
import type { RecentProject } from '../../src/shared/api'
import { projectName, sortProjects } from '../../src/renderer/src/home/sortProjects'

const project = (title: string, lastOpened: number, missing = false): RecentProject => ({
  dir: `C:\\RCM Projects\\${title}-folder`,
  lastOpened,
  missing,
  title: missing ? '' : title,
  artist: '',
  charts: []
})

const list = [project('banana', 2), project('가나다', 3), project('Apple', 1), project('song10', 5), project('song9', 4)]
const names = (l: RecentProject[]) => l.map(projectName)

describe('sortProjects', () => {
  it('이름순: 한글 먼저, 대소문자 무시, 숫자는 크기대로', () => {
    expect(names(sortProjects(list, 'name'))).toEqual(['가나다', 'Apple', 'banana', 'song9', 'song10'])
  })
  it('최근 수정순 / 오래된 순', () => {
    expect(names(sortProjects(list, 'recent'))).toEqual(['song10', 'song9', '가나다', 'banana', 'Apple'])
    expect(names(sortProjects(list, 'oldest'))).toEqual(['Apple', 'banana', '가나다', 'song9', 'song10'])
  })
  it('원래 배열은 그대로', () => {
    const before = names(list)
    sortProjects(list, 'name')
    expect(names(list)).toEqual(before)
  })
  it('찾을 수 없는 프로젝트는 폴더 이름으로', () => {
    expect(projectName(project('gone', 1, true))).toBe('gone-folder')
    expect(names(sortProjects([project('b', 1), project('a', 2, true)], 'name'))).toEqual(['a-folder', 'b'])
  })
})
