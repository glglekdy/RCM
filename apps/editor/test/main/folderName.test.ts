import { describe, it, expect } from 'vitest'
import { sanitizeFolderName, uniqueChildName } from '../../src/main/project/folderName'

describe('folderName', () => {
  it('폴더 이름 정리', () => {
    expect(sanitizeFolderName('진격의 승리: Remix?')).toBe('진격의 승리_ Remix_')
    expect(sanitizeFolderName('  song.  ')).toBe('song')
    expect(sanitizeFolderName('???')).toBe('___')
    expect(sanitizeFolderName('   ')).toBe('untitled')
  })
  it('중복 이름', () => {
    const taken = new Set(['a', 'a (2)'])
    expect(uniqueChildName('a', (n) => taken.has(n))).toBe('a (3)')
    expect(uniqueChildName('b', (n) => taken.has(n))).toBe('b')
  })
})
