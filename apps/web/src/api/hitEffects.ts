import type { HitEffectSlot } from '@rcm/playfield'
import type { RcmApi } from '../../../editor/src/shared/api'
import {
  DEFAULT_HIT_EFFECT_SETTINGS,
  HIT_EFFECT_LIMITS,
  SHEET_FILE,
  frameName,
  isHitEffectSlot,
  pickedHitEffectOrder,
  sanitizeHitEffectSettings,
  sourceWithFiles,
  withStoredFiles,
  type HitEffectSettings
} from '../../../editor/src/shared/hitEffects'
import { req, tx } from './db'
import { SETTING_KEYS, type WebSettings } from './settings'

export type WebHitEffects = Pick<
  RcmApi,
  'getHitEffects' | 'setHitEffects' | 'clearHitEffect' | 'readHitEffectImages'
> & {
  /** 고른 PNG를 슬롯에 저장하고 새 설정값을 돌려준다. 파일이 맞지 않으면 reject, 슬롯은 그대로 */
  importFiles(slot: HitEffectSlot, type: 'sheet' | 'frames', files: File[]): Promise<HitEffectSettings>
}

/** 슬롯 하나의 저장된 이미지 (`hitEffects` 저장소, 키는 슬롯) */
interface SlotRecord {
  names: string[]
  images: Blob[]
}

const checkSlot = (raw: unknown): HitEffectSlot => {
  if (!isHitEffectSlot(raw)) throw new Error('이펙트 슬롯이 올바르지 않아요')
  return raw
}

/** 복사 전에 모두 검사한다 (PC `checkSources`와 같은 문구): 실패하면 슬롯은 그대로다 */
function checkFiles(type: 'sheet' | 'frames', files: File[]): void {
  if (files.length === 0) throw new Error('고른 파일이 없어요')
  if (type === 'frames' && files.length > HIT_EFFECT_LIMITS.maxFrames) {
    throw new Error(`프레임은 ${HIT_EFFECT_LIMITS.maxFrames}장까지 넣을 수 있어요`)
  }
  for (const f of files) {
    if (!/\.png$/i.test(f.name)) throw new Error('PNG 파일만 쓸 수 있어요')
  }
  for (const f of files) {
    if (f.size > HIT_EFFECT_LIMITS.maxFileBytes) throw new Error('파일 하나가 10MB를 넘어요')
  }
}

/** `pickedHitEffectOrder`가 정한 이름 순서대로 파일을 늘어놓는다 (같은 이름이 여러 개여도 하나씩 쓴다) */
function inPickedOrder(type: 'sheet' | 'frames', files: File[]): File[] {
  const byName = new Map<string, File[]>()
  for (const f of files) byName.set(f.name, [...(byName.get(f.name) ?? []), f])
  return pickedHitEffectOrder(
    type,
    files.map((f) => f.name)
  ).map((name) => byName.get(name)!.shift()!)
}

export function createHitEffects(db: IDBDatabase, settings: WebSettings): WebHitEffects {
  const fromRaw = (raw: unknown): HitEffectSettings =>
    raw === undefined ? { ...DEFAULT_HIT_EFFECT_SETTINGS } : sanitizeHitEffectSettings(raw)

  /** 저장된 설정. 없으면 기본값 */
  const stored = async (): Promise<HitEffectSettings> => fromRaw(await settings.getRaw(SETTING_KEYS.hitEffects))

  /** 설정과 슬롯 이미지를 한 트랜잭션에서 바꾼다 */
  const change = (
    run: (current: HitEffectSettings, t: IDBTransaction) => HitEffectSettings
  ): Promise<HitEffectSettings> =>
    tx(db, ['settings', 'hitEffects'], 'readwrite', async (t) => {
      const store = t.objectStore('settings')
      const current = fromRaw(await req<unknown>(store.get(SETTING_KEYS.hitEffects)))
      const next = run(current, t)
      store.put(next, SETTING_KEYS.hitEffects)
      return next
    })

  return {
    getHitEffects: stored,

    // 숫자·켜기·합치기만 바꾼다. 슬롯 파일은 importFiles·clearHitEffect로만 바뀐다
    async setHitEffects(raw) {
      const incoming = sanitizeHitEffectSettings(raw)
      await change((current) => withStoredFiles(current, incoming))
    },

    async importFiles(rawSlot, type, files) {
      const slot = checkSlot(rawSlot)
      if (type !== 'sheet' && type !== 'frames') throw new Error('이펙트 형식이 올바르지 않아요')
      const picked = inPickedOrder(type, files)
      checkFiles(type, picked)
      const names = type === 'sheet' ? [SHEET_FILE] : picked.map((_, i) => frameName(i))
      // 트랜잭션 밖에서 읽는다 (안에서 await하면 트랜잭션이 끝난다)
      const images = await Promise.all(picked.map(async (f) => new Blob([await f.arrayBuffer()], { type: 'image/png' })))
      const record: SlotRecord = { names, images }
      return change((current, t) => {
        t.objectStore('hitEffects').put(record, slot)
        return { ...current, [slot]: sourceWithFiles(current[slot], type, names) }
      })
    },

    async clearHitEffect(rawSlot) {
      const slot = checkSlot(rawSlot)
      return change((current, t) => {
        t.objectStore('hitEffects').delete(slot)
        const next = { ...current }
        delete next[slot]
        return next
      })
    },

    async readHitEffectImages(rawSlot) {
      const slot = checkSlot(rawSlot)
      const source = (await stored())[slot]
      if (!source) return []
      const record = await tx(db, ['hitEffects'], 'readonly', (t) =>
        req<SlotRecord | undefined>(t.objectStore('hitEffects').get(slot))
      )
      const wanted = source.type === 'sheet' ? [source.file] : source.files
      const blobs = wanted.map((name) => {
        const i = record?.names.indexOf(name) ?? -1
        if (!record || i < 0) throw new Error('이펙트 파일을 찾을 수 없어요')
        return record.images[i]
      })
      return Promise.all(blobs.map(async (b) => new Uint8Array(await b.arrayBuffer())))
    }
  }
}
