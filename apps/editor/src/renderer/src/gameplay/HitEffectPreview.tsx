import { useEffect, useRef } from 'react'
import {
  DEFAULT_EFFECT_MS,
  DEFAULT_PLAYFIELD_COLORS,
  HitEffectLayer,
  spriteDurationMs,
  type HitEffectSlot
} from '@rcm/playfield'
import { useHitEffects } from './hitEffectStore'

/** 캔버스 CSS 크기(px)와 그 안에 그릴 이펙트 크기 */
const BOX = 96
const PREVIEW_SIZE = 88
/** 한 번 끝나고 다시 터지기까지 쉬는 시간 */
const GAP_MS = 200

/** 슬롯 이펙트 하나를 가운데에서 반복해 터뜨리는 작은 미리보기. 크기·켜기 설정과 상관없이 보여 준다 */
export function HitEffectPreview({ slot, className }: { slot: HitEffectSlot; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const effects = useHitEffects()
  const effectsRef = useRef(effects)
  effectsRef.current = effects

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const layer = new HitEffectLayer()
    let nextAt = 0
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dpr = window.devicePixelRatio || 1
      const px = Math.round(BOX * dpr)
      if (canvas.width !== px) canvas.width = canvas.height = px
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, BOX, BOX)
      const fx = { ...effectsRef.current, enabled: true, size: PREVIEW_SIZE }
      if (now >= nextAt) {
        const sprite = fx[slot]
        layer.spawn(BOX / 2, BOX / 2, slot === 'perfect' ? 'perfect' : 'great', now)
        nextAt = now + Math.max(sprite ? spriteDurationMs(sprite) : DEFAULT_EFFECT_MS, DEFAULT_EFFECT_MS) + GAP_MS
      }
      layer.draw(ctx, now, fx, DEFAULT_PLAYFIELD_COLORS)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [slot])

  return <canvas ref={canvasRef} className={className} style={{ width: BOX, height: BOX }} />
}
