import { useSyncExternalStore } from 'react'
import { DEFAULT_HIT_EFFECTS, sheetFrames, type HitEffects, type HitEffectSlot, type HitEffectSprite } from '@rcm/playfield'
import { DEFAULT_HIT_EFFECT_SETTINGS, HIT_EFFECT_SLOTS, type HitEffectSettings, type HitEffectSource } from '../../../shared/hitEffects'
import { ipcErrorMessage } from '../home/importZips'

/** 숫자 입력을 끄는 동안에는 화면만 바꾸고, 멈춘 뒤 마지막 값만 설정 파일에 쓴다 */
const SAVE_DELAY_MS = 300
const READ_ERROR = '이펙트 파일을 읽지 못해서 기본 이펙트를 써요'

type SlotErrors = Partial<Record<HitEffectSlot, string>>

/** 설정 파일의 값. 불러오기 전에는 기본값 */
let settings: HitEffectSettings = { ...DEFAULT_HIT_EFFECT_SETTINGS }
/** 플레이 화면에 넘길 값. 바뀔 때만 새 객체 */
let effects: HitEffects = { ...DEFAULT_HIT_EFFECTS }
let errors: SlotErrors = {}
/** 슬롯별로 읽어 둔 이미지. 칸·줄·fps만 바뀌면 다시 읽지 않는다 */
const images: Partial<Record<HitEffectSlot, ImageBitmap[]>> = {}
/** 슬롯별 마지막으로 시작한 읽기 번호. 늦게 끝난 옛 읽기 결과는 버린다 */
const loads: Record<HitEffectSlot, number> = { perfect: 0, normal: 0 }
let saveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const l of listeners) l()
}

/** 시트는 칸·줄·프레임 수로 자르고, 프레임 묶음은 이미지 한 장이 한 프레임 */
export function buildSprite(source: HitEffectSource, bitmaps: readonly ImageBitmap[]): HitEffectSprite {
  if (source.type === 'sheet') {
    const img = bitmaps[0]
    return { frames: sheetFrames(img, img.width, img.height, source.cols, source.rows, source.count), fps: source.fps }
  }
  return {
    frames: bitmaps.map((image) => ({ image, sx: 0, sy: 0, sw: image.width, sh: image.height })),
    fps: source.fps
  }
}

function rebuild(): void {
  const next: HitEffects = { enabled: settings.enabled, size: settings.size, blend: settings.blend }
  for (const slot of HIT_EFFECT_SLOTS) {
    const source = settings[slot]
    const bitmaps = images[slot]
    if (source && bitmaps && bitmaps.length > 0) next[slot] = buildSprite(source, bitmaps)
  }
  effects = next
  emit()
}

function setImages(slot: HitEffectSlot, bitmaps: ImageBitmap[] | undefined): void {
  for (const b of images[slot] ?? []) b.close()
  if (bitmaps) images[slot] = bitmaps
  else delete images[slot]
}

function setError(slot: HitEffectSlot, message: string | undefined): void {
  if (errors[slot] === message) return
  const next = { ...errors }
  if (message) next[slot] = message
  else delete next[slot]
  errors = next
}

/** 슬롯 이미지를 다시 읽는다. 못 읽으면 그 슬롯은 기본 이펙트와 오류 문구 */
async function loadSlot(slot: HitEffectSlot): Promise<void> {
  const load = ++loads[slot]
  if (!settings[slot]) {
    setImages(slot, undefined)
    setError(slot, undefined)
    return
  }
  let bitmaps: ImageBitmap[] | undefined
  let failed: unknown
  try {
    const bytes = await window.rcm.readHitEffectImages(slot)
    bitmaps = await Promise.all(
      bytes.map((b) => createImageBitmap(new Blob([b as Uint8Array<ArrayBuffer>], { type: 'image/png' })))
    )
  } catch (err) {
    failed = err
  }
  if (load !== loads[slot]) {
    for (const b of bitmaps ?? []) b.close()
    return
  }
  if (bitmaps) {
    setImages(slot, bitmaps)
    setError(slot, undefined)
  } else {
    console.warn('타격 이펙트 파일을 읽지 못했어요', failed)
    setImages(slot, undefined)
    setError(slot, READ_ERROR)
  }
}

export async function loadHitEffects(): Promise<void> {
  settings = await window.rcm.getHitEffects()
  await Promise.all(HIT_EFFECT_SLOTS.map(loadSlot))
  rebuild()
}

export function getHitEffects(): HitEffects {
  return effects
}

export function getHitEffectSettings(): HitEffectSettings {
  return settings
}

export function getHitEffectErrors(): SlotErrors {
  return errors
}

export function useHitEffects(): HitEffects {
  return useSyncExternalStore(subscribe, getHitEffects)
}

export function useHitEffectSettings(): HitEffectSettings {
  return useSyncExternalStore(subscribe, getHitEffectSettings)
}

export function useHitEffectErrors(): SlotErrors {
  return useSyncExternalStore(subscribe, getHitEffectErrors)
}

/** 켜기·크기·합치기·슬롯 숫자 변경. 바로 반영하고 잠시 뒤 저장한다. 저장 실패는 경고만 남긴다 */
export function updateHitEffectSettings(next: HitEffectSettings): void {
  settings = next
  rebuild()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    window.rcm.setHitEffects(settings).catch((err: unknown) => {
      console.warn('타격 이펙트 설정을 저장하지 못했어요', err)
    })
  }, SAVE_DELAY_MS)
}

/** 파일을 골라 슬롯에 넣는다. 취소하면 그대로, 파일이 맞지 않으면 throw (IPC 접두사를 뗀 문구라 그대로 보여 줄 수 있다) */
export async function pickHitEffect(slot: HitEffectSlot, type: 'sheet' | 'frames'): Promise<void> {
  let next: HitEffectSettings | null
  try {
    next = await window.rcm.pickHitEffect(slot, type)
  } catch (err) {
    throw new Error(ipcErrorMessage(err))
  }
  if (!next) return
  settings = next
  await loadSlot(slot)
  rebuild()
}

/** 슬롯을 비워 기본 이펙트로 되돌린다 */
export async function clearHitEffect(slot: HitEffectSlot): Promise<void> {
  settings = await window.rcm.clearHitEffect(slot)
  loads[slot]++
  setImages(slot, undefined)
  setError(slot, undefined)
  rebuild()
}
