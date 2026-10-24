import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clearHitEffectFiles,
  importHitEffectFiles,
  naturalCompare,
  readHitEffectFiles,
  sourceWithFiles,
  withStoredFiles
} from '../../src/main/hitEffectFiles'
import type { HitEffectSettings } from '../../src/shared/hitEffects'

let tmp: string
let root: string
let src: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-fx-'))
  root = path.join(tmp, 'hit-effects')
  src = path.join(tmp, 'src')
  await fs.mkdir(src)
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

/** 원본 폴더에 내용이 이름인 파일을 만든다 */
async function source(name: string, content: string | Buffer = name): Promise<string> {
  const p = path.join(src, name)
  await fs.writeFile(p, content)
  return p
}

const slotDir = (slot: string) => path.join(root, slot)
const list = async (slot: string) => (await fs.readdir(slotDir(slot))).sort()

describe('naturalCompare', () => {
  it('숫자를 크기 순으로, 대소문자 무시', () => {
    expect(['f10.png', 'f2.png', 'F1.png'].sort(naturalCompare)).toEqual(['F1.png', 'f2.png', 'f10.png'])
  })
})

describe('importHitEffectFiles', () => {
  it('시트: sheet.png 하나', async () => {
    const names = await importHitEffectFiles(root, 'perfect', 'sheet', [await source('fx.png')])
    expect(names).toEqual(['sheet.png'])
    expect(await fs.readFile(path.join(slotDir('perfect'), 'sheet.png'), 'utf8')).toBe('fx.png')
  })

  it('프레임: 자연 정렬 순서로 0001.png부터 복사하고 예전 파일은 지움', async () => {
    await importHitEffectFiles(root, 'normal', 'sheet', [await source('old.png')])
    const names = await importHitEffectFiles(root, 'normal', 'frames', [
      await source('f10.png'),
      await source('f2.png'),
      await source('f1.png')
    ])
    expect(names).toEqual(['0001.png', '0002.png', '0003.png'])
    expect(await list('normal')).toEqual(['0001.png', '0002.png', '0003.png'])
    expect(await fs.readFile(path.join(slotDir('normal'), '0001.png'), 'utf8')).toBe('f1.png')
    expect(await fs.readFile(path.join(slotDir('normal'), '0003.png'), 'utf8')).toBe('f10.png')
  })

  it('슬롯끼리 섞이지 않음', async () => {
    await importHitEffectFiles(root, 'perfect', 'sheet', [await source('a.png')])
    await importHitEffectFiles(root, 'normal', 'sheet', [await source('b.png')])
    expect(await fs.readFile(path.join(slotDir('perfect'), 'sheet.png'), 'utf8')).toBe('a.png')
  })

  it('png가 아니면 거절하고 기존 파일은 그대로', async () => {
    await importHitEffectFiles(root, 'perfect', 'sheet', [await source('keep.png')])
    await expect(importHitEffectFiles(root, 'perfect', 'sheet', [await source('x.jpg')])).rejects.toThrow(
      'PNG 파일만 쓸 수 있어요'
    )
    expect(await list('perfect')).toEqual(['sheet.png'])
  })

  it('10MB를 넘는 파일은 거절', async () => {
    const big = await source('big.png', Buffer.alloc(10 * 1024 * 1024 + 1))
    await expect(importHitEffectFiles(root, 'perfect', 'sheet', [big])).rejects.toThrow('파일 하나가 10MB를 넘어요')
  })

  it('121장이면 거절', async () => {
    const files = await Promise.all(Array.from({ length: 121 }, (_, i) => source(`f${i}.png`)))
    await expect(importHitEffectFiles(root, 'normal', 'frames', files)).rejects.toThrow(
      '프레임은 120장까지 넣을 수 있어요'
    )
  })
})

describe('clearHitEffectFiles / readHitEffectFiles', () => {
  it('순서대로 바이트를 읽고, 지우면 폴더가 없어짐', async () => {
    await importHitEffectFiles(root, 'normal', 'frames', [await source('a1.png'), await source('a2.png')])
    const bytes = await readHitEffectFiles(root, 'normal', ['0002.png', '0001.png'])
    expect(bytes.map((b) => Buffer.from(b).toString('utf8'))).toEqual(['a2.png', 'a1.png'])
    expect(bytes[0]).toBeInstanceOf(Uint8Array)
    await clearHitEffectFiles(root, 'normal')
    await expect(fs.stat(slotDir('normal'))).rejects.toThrow()
    await expect(readHitEffectFiles(root, 'normal', ['0001.png'])).rejects.toThrow()
  })

  it('비어 있는 슬롯을 지워도 괜찮음', async () => {
    await expect(clearHitEffectFiles(root, 'perfect')).resolves.toBeUndefined()
  })

  it('안전하지 않은 이름은 읽지 않음', async () => {
    await expect(readHitEffectFiles(root, 'normal', ['../x.png'])).rejects.toThrow()
  })
})

describe('sourceWithFiles', () => {
  it('처음 넣는 시트는 1×1 · 30fps', () => {
    expect(sourceWithFiles(undefined, 'sheet', ['sheet.png'])).toEqual({
      type: 'sheet',
      file: 'sheet.png',
      cols: 1,
      rows: 1,
      count: 1,
      fps: 30
    })
  })

  it('시트였던 슬롯에 시트를 다시 넣으면 칸·줄·count·fps 유지', () => {
    const prev = { type: 'sheet', file: 'sheet.png', cols: 4, rows: 2, count: 7, fps: 24 } as const
    expect(sourceWithFiles(prev, 'sheet', ['sheet.png'])).toEqual(prev)
  })

  it('프레임은 이전 fps를 유지', () => {
    const prev = { type: 'sheet', file: 'sheet.png', cols: 4, rows: 2, count: 7, fps: 24 } as const
    expect(sourceWithFiles(prev, 'frames', ['0001.png'])).toEqual({ type: 'frames', files: ['0001.png'], fps: 24 })
    expect(sourceWithFiles(undefined, 'frames', ['0001.png'])).toEqual({ type: 'frames', files: ['0001.png'], fps: 30 })
  })
})

describe('withStoredFiles', () => {
  const stored: HitEffectSettings = {
    enabled: true,
    size: 128,
    blend: 'normal',
    perfect: { type: 'sheet', file: 'sheet.png', cols: 4, rows: 2, count: 8, fps: 30 },
    normal: { type: 'frames', files: ['0001.png', '0002.png'], fps: 30 }
  }

  it('켜기·크기·합치기와 숫자는 받고 파일 이름은 저장된 값', () => {
    const merged = withStoredFiles(stored, {
      enabled: false,
      size: 64,
      blend: 'add',
      perfect: { type: 'sheet', file: 'evil.png', cols: 2, rows: 2, count: 3, fps: 12 },
      normal: { type: 'frames', files: ['x.png'], fps: 60 }
    })
    expect(merged).toEqual({
      enabled: false,
      size: 64,
      blend: 'add',
      perfect: { type: 'sheet', file: 'sheet.png', cols: 2, rows: 2, count: 3, fps: 12 },
      normal: { type: 'frames', files: ['0001.png', '0002.png'], fps: 60 }
    })
  })

  it('저장된 슬롯이 없으면 renderer가 보낸 슬롯은 버림', () => {
    const merged = withStoredFiles(undefined, {
      enabled: true,
      size: 128,
      blend: 'normal',
      perfect: { type: 'sheet', file: 'sheet.png', cols: 1, rows: 1, count: 1, fps: 30 }
    })
    expect(merged.perfect).toBeUndefined()
  })

  it('형태가 다르거나 슬롯을 빼고 보내면 저장된 슬롯 그대로', () => {
    const merged = withStoredFiles(stored, { enabled: true, size: 128, blend: 'normal' })
    expect(merged.perfect).toEqual(stored.perfect)
    expect(merged.normal).toEqual(stored.normal)
    const swapped = withStoredFiles(stored, {
      enabled: true,
      size: 128,
      blend: 'normal',
      perfect: { type: 'frames', files: ['0001.png'], fps: 99 }
    })
    expect(swapped.perfect).toEqual(stored.perfect)
  })
})
