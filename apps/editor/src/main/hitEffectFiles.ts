import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import type { HitEffectSlot } from '@rcm/playfield'
import {
  HIT_EFFECT_LIMITS,
  HIT_EFFECT_SLOTS,
  isSafeEffectFileName,
  type HitEffectSettings,
  type HitEffectSource
} from '../shared/hitEffects'

/** 타격 이펙트 PNG는 `<root>/<slot>/`에 복사해 둔다. 원본을 옮기거나 지워도 계속 쓸 수 있다 */

const SHEET_FILE = 'sheet.png'
const DEFAULT_FPS = 30

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** 파일 이름 안의 숫자를 크기로 비교한다 (`f2` < `f10`), 대소문자 무시 */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

const frameName = (i: number): string => `${String(i + 1).padStart(4, '0')}.png`

/** 복사 전에 모두 검사한다: 실패하면 슬롯 폴더는 그대로다 */
async function checkSources(type: 'sheet' | 'frames', sources: string[]): Promise<void> {
  if (sources.length === 0) throw new Error('고른 파일이 없어요')
  if (type === 'frames' && sources.length > HIT_EFFECT_LIMITS.maxFrames) {
    throw new Error(`프레임은 ${HIT_EFFECT_LIMITS.maxFrames}장까지 넣을 수 있어요`)
  }
  for (const s of sources) {
    if (extname(s).toLowerCase() !== '.png') throw new Error('PNG 파일만 쓸 수 있어요')
  }
  for (const s of sources) {
    if ((await fs.stat(s)).size > HIT_EFFECT_LIMITS.maxFileBytes) throw new Error('파일 하나가 10MB를 넘어요')
  }
}

/**
 * 슬롯 폴더를 비우고 `sources`를 복사한다. 시트는 `sheet.png`, 프레임은 원본 이름을 자연 정렬한 순서로
 * `0001.png`…. 복사한 이름 목록을 돌려준다.
 */
export async function importHitEffectFiles(
  root: string,
  slot: HitEffectSlot,
  type: 'sheet' | 'frames',
  sources: string[]
): Promise<string[]> {
  const picked = type === 'sheet' ? sources.slice(0, 1) : [...sources].sort(naturalCompare)
  await checkSources(type, picked)
  const dir = join(root, slot)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  const names = type === 'sheet' ? [SHEET_FILE] : picked.map((_, i) => frameName(i))
  for (let i = 0; i < picked.length; i++) await fs.copyFile(picked[i], join(dir, names[i]))
  return names
}

export async function clearHitEffectFiles(root: string, slot: HitEffectSlot): Promise<void> {
  await fs.rm(join(root, slot), { recursive: true, force: true })
}

/** 복사해 둔 파일을 순서대로 읽는다. 없거나 이름이 안전하지 않으면 reject */
export async function readHitEffectFiles(root: string, slot: HitEffectSlot, names: string[]): Promise<Uint8Array[]> {
  return Promise.all(
    names.map(async (name) => {
      if (!isSafeEffectFileName(name)) throw new Error('이펙트 파일 이름이 올바르지 않아요')
      return new Uint8Array(await fs.readFile(join(root, slot, name)))
    })
  )
}

/** 새로 복사한 파일로 슬롯 설정을 만든다. 시트를 다시 넣으면 칸·줄·프레임 수를, 어느 쪽이든 fps를 이어 쓴다 */
export function sourceWithFiles(
  prev: HitEffectSource | undefined,
  type: 'sheet' | 'frames',
  names: string[]
): HitEffectSource {
  const fps = prev?.fps ?? DEFAULT_FPS
  if (type === 'frames') return { type, files: names, fps }
  if (prev?.type === 'sheet') return { ...prev, file: names[0] }
  return { type, file: names[0], cols: 1, rows: 1, count: 1, fps }
}

/**
 * renderer가 보낸(정리한) 설정에서 켜기·크기·합치기와 슬롯 숫자만 받는다.
 * 슬롯의 형태와 파일 이름은 저장된 값을 지킨다 (파일은 `pick`·`clear`로만 바뀐다).
 */
export function withStoredFiles(stored: HitEffectSettings | undefined, incoming: HitEffectSettings): HitEffectSettings {
  const merged: HitEffectSettings = { enabled: incoming.enabled, size: incoming.size, blend: incoming.blend }
  for (const slot of HIT_EFFECT_SLOTS) {
    const keep = stored?.[slot]
    if (!keep) continue
    const next = incoming[slot]
    if (next?.type === 'sheet' && keep.type === 'sheet') {
      merged[slot] = { ...keep, cols: next.cols, rows: next.rows, count: next.count, fps: next.fps }
    } else if (next?.type === 'frames' && keep.type === 'frames') {
      merged[slot] = { ...keep, fps: next.fps }
    } else {
      merged[slot] = keep
    }
  }
  return merged
}
