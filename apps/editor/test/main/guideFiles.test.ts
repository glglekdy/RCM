import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MAX_GUIDE_FILES,
  addGuidePath,
  sameGuidePath,
  sanitizeGuidePaths,
  syncGuideFile,
  syncGuideFiles
} from '../../src/main/guide/guideFiles'
import { chartFormatGuide } from '../../src/main/guide/guideText'

let tmp: string
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-guide-'))
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('guideFiles', () => {
  it('앱에 든 가이드는 저장소의 문서와 같다', async () => {
    const doc = await fs.readFile(path.resolve(__dirname, '../../../../docs/CHART_FORMAT_GUIDE.md'), 'utf8')
    expect(chartFormatGuide.replace(/\r\n/g, '\n')).toBe(doc.replace(/\r\n/g, '\n'))
  })

  it('내용이 다르면 덮어쓰고, 같으면 그대로 둔다', async () => {
    const file = path.join(tmp, 'CHART_FORMAT_GUIDE.md')
    await fs.writeFile(file, 'old')
    expect(await syncGuideFile(file, 'new\n')).toEqual({ path: file, status: 'updated' })
    expect(await fs.readFile(file, 'utf8')).toBe('new\n')
    expect(await syncGuideFile(file, 'new\n')).toEqual({ path: file, status: 'current' })
    // 줄바꿈만 다르면 (git autocrlf 등) 건드리지 않는다
    await fs.writeFile(file, 'a\r\nb\r\n')
    expect((await syncGuideFile(file, 'a\nb\n')).status).toBe('current')
    expect(await fs.readFile(file, 'utf8')).toBe('a\r\nb\r\n')
  })

  it('없는 파일은 다시 만들지 않는다', async () => {
    const gone = path.join(tmp, 'gone.md')
    const noDir = path.join(tmp, 'nodir', 'x.md')
    expect(await syncGuideFiles([gone, noDir], 'x')).toEqual([
      { path: gone, status: 'missing' },
      { path: noDir, status: 'missing' }
    ])
    expect(existsSync(gone)).toBe(false)
    expect(existsSync(path.join(tmp, 'nodir'))).toBe(false)
  })

  it('읽을 수 없으면 오류로 알린다', async () => {
    const dir = path.join(tmp, 'folder.md')
    await fs.mkdir(dir)
    const r = await syncGuideFile(dir, 'x')
    expect(r.status).toBe('error')
    expect(r.error).toBeTruthy()
  })

  it('목록 정리와 추가', () => {
    const a = path.join(tmp, 'a.md')
    const b = path.join(tmp, 'b.MD')
    expect(sanitizeGuidePaths([a, a, 'rel.md', path.join(tmp, 'x.txt'), 3, b])).toEqual([a, b])
    expect(sanitizeGuidePaths('x')).toEqual([])
    expect(sanitizeGuidePaths(Array.from({ length: 60 }, (_, i) => path.join(tmp, `${i}.md`)))).toHaveLength(
      MAX_GUIDE_FILES
    )
    expect(addGuidePath([a], b)).toEqual([a, b])
    const same = [a]
    expect(addGuidePath(same, a)).toBe(same)
    expect(() => addGuidePath([], path.join(tmp, 'a.ts'))).toThrow('.md')
    expect(() => addGuidePath([], 'a.md')).toThrow('.md')
    const full = Array.from({ length: MAX_GUIDE_FILES }, (_, i) => path.join(tmp, `${i}.md`))
    expect(() => addGuidePath(full, a)).toThrow(`${MAX_GUIDE_FILES}개`)
  })

  it('Windows에서는 대소문자만 다른 경로를 같은 파일로 본다', () => {
    expect(sameGuidePath('C:\\G\\A.md', 'c:\\g\\a.md', 'win32')).toBe(true)
    expect(sameGuidePath('/g/A.md', '/g/a.md', 'linux')).toBe(false)
    expect(sameGuidePath('/g/x/../a.md', '/g/a.md', 'linux')).toBe(true)
  })
})
