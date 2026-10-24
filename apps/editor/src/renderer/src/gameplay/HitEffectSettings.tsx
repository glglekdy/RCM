import { useState } from 'react'
import { Copy, Sparkles } from 'lucide-react'
import type { HitEffectBlend, HitEffectSlot } from '@rcm/playfield'
import { HIT_EFFECT_LIMITS, type HitEffectSource } from '../../../shared/hitEffects'
import { Button, Card, NumberField, SegmentedControl, Slider, Switch, useToast } from '../ui'
import { HitEffectPreview } from './HitEffectPreview'
import { hitEffectPrompt } from './hitEffectPrompt'
import {
  clearHitEffect,
  pickHitEffect,
  updateHitEffectSettings,
  useHitEffectErrors,
  useHitEffectSettings
} from './hitEffectStore'
import styles from './HitEffectSettings.module.css'

const SLOTS: { slot: HitEffectSlot; label: string }[] = [
  { slot: 'perfect', label: 'PERFECT' },
  { slot: 'normal', label: 'GREAT · GOOD' }
]

const BLENDS: { value: HitEffectBlend; label: string }[] = [
  { value: 'normal', label: '보통' },
  { value: 'add', label: '더하기' }
]

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)))

function describe(source: HitEffectSource | undefined): string {
  if (!source) return '기본 이펙트'
  if (source.type === 'sheet') return `시트 ${source.cols}×${source.rows} · ${source.count}프레임`
  return `프레임 ${source.files.length}장`
}

/** 설정 페이지의 `타격 이펙트` 카드. 테스트 플레이에서 노트를 칠 때 터지는 이펙트를 PNG로 바꾼다 */
export function HitEffectSettings() {
  const settings = useHitEffectSettings()
  const errors = useHitEffectErrors()
  const toast = useToast()
  const { size, grid, fps } = HIT_EFFECT_LIMITS
  const off = !settings.enabled
  const [hasReference, setHasReference] = useState(false)
  const prompt = hitEffectPrompt(hasReference)

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      toast('프롬프트를 복사했어요')
    } catch {
      toast('클립보드에 복사하지 못했어요')
    }
  }

  const setSource = (slot: HitEffectSlot, source: HitEffectSource) => updateHitEffectSettings({ ...settings, [slot]: source })

  const pick = (slot: HitEffectSlot, type: 'sheet' | 'frames') => {
    pickHitEffect(slot, type).catch((err: unknown) => {
      toast(err instanceof Error ? err.message : '이펙트를 불러오지 못했어요')
    })
  }

  const reset = (slot: HitEffectSlot) => {
    clearHitEffect(slot).catch(() => toast('기본 이펙트로 되돌리지 못했어요'))
  }

  /** 시트 칸·줄을 바꾸면 프레임 수도 새 칸×줄 안으로 맞춘다 (칸×줄을 꽉 채운 상태였으면 계속 꽉 채운다) */
  const setGrid = (slot: HitEffectSlot, s: Extract<HitEffectSource, { type: 'sheet' }>, cols: number, rows: number) => {
    const full = s.count === s.cols * s.rows
    const count = full ? cols * rows : Math.min(s.count, cols * rows)
    setSource(slot, { ...s, cols, rows, count })
  }

  return (
    <Card title="타격 이펙트">
      <div className={styles.ai}>
        <div className={styles.text}>
          <span className={styles.slotTitle}>
            <Sparkles size={14} /> AI로 이펙트 만들기
          </span>
          <span className={styles.desc}>
            아래 프롬프트를 AI(ChatGPT, Claude 등)에게 주면 이 에디터에 바로 넣을 수 있는 이펙트 PNG를 만들어 줘요.
          </span>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={hasReference} onChange={(e) => setHasReference(e.target.checked)} />
          <span>레퍼런스가 있어요</span>
          <span className={styles.desc}>
            {hasReference ? 'AI가 먼저 레퍼런스 이미지를 달라고 해요' : 'AI가 묻지 않고 직접 디자인해요'}
          </span>
        </label>
        <pre className={styles.prompt}>{prompt}</pre>
        <div className={styles.buttons}>
          <Button variant="ghost" onClick={() => void copyPrompt()}>
            <Copy size={16} /> 프롬프트 복사
          </Button>
        </div>
      </div>
      <div className={styles.row}>
        <div className={styles.text}>
          <span>이펙트 켜기</span>
          <span className={styles.desc}>테스트 플레이에서 노트를 치면 판정선에서 이펙트가 터져요. MISS는 터지지 않아요.</span>
        </div>
        <Switch
          label="이펙트 켜기"
          checked={settings.enabled}
          onChange={(enabled) => updateHitEffectSettings({ ...settings, enabled })}
        />
      </div>
      <div className={off ? styles.disabled : undefined}>
        <div className={styles.row}>
          <span className={styles.label}>크기</span>
          <div className={styles.control}>
            <Slider
              label="크기"
              value={settings.size}
              min={size.min}
              max={size.max}
              disabled={off}
              onChange={(v) => updateHitEffectSettings({ ...settings, size: v })}
            />
            <NumberField
              value={settings.size}
              suffix="px"
              onCommit={(v) => updateHitEffectSettings({ ...settings, size: clamp(v, size.min, size.max) })}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.text}>
            <span className={styles.label}>합치기</span>
            <span className={styles.desc}>검은 배경 이펙트는 더하기를 고르세요</span>
          </div>
          <SegmentedControl
            options={BLENDS}
            value={settings.blend}
            onChange={(blend) => updateHitEffectSettings({ ...settings, blend })}
          />
        </div>
        <div className={styles.slots}>
          {SLOTS.map(({ slot, label }) => {
            const source = settings[slot]
            return (
              <div key={slot} className={styles.slot}>
                <div className={styles.slotHead}>
                  <HitEffectPreview slot={slot} className={styles.preview} />
                  <div className={styles.text}>
                    <span className={styles.slotTitle}>{label}</span>
                    <span className={styles.desc}>{describe(source)}</span>
                    {errors[slot] && <span className={styles.error}>{errors[slot]}</span>}
                  </div>
                </div>
                <div className={styles.buttons}>
                  <Button onClick={() => pick(slot, 'sheet')}>시트 PNG 불러오기</Button>
                  <Button onClick={() => pick(slot, 'frames')}>PNG 여러 장 불러오기</Button>
                  <Button variant="ghost" disabled={!source} onClick={() => reset(slot)}>
                    기본으로
                  </Button>
                </div>
                {source && (
                  <div className={styles.numbers}>
                    {source.type === 'sheet' && (
                      <>
                        <label className={styles.number}>
                          <span>칸</span>
                          <NumberField
                            value={source.cols}
                            onCommit={(v) => setGrid(slot, source, clamp(v, grid.min, grid.max), source.rows)}
                          />
                        </label>
                        <label className={styles.number}>
                          <span>줄</span>
                          <NumberField
                            value={source.rows}
                            onCommit={(v) => setGrid(slot, source, source.cols, clamp(v, grid.min, grid.max))}
                          />
                        </label>
                        <label className={styles.number}>
                          <span>프레임 수</span>
                          <NumberField
                            value={source.count}
                            onCommit={(v) => setSource(slot, { ...source, count: clamp(v, 1, source.cols * source.rows) })}
                          />
                        </label>
                      </>
                    )}
                    <label className={styles.number}>
                      <span>재생 속도</span>
                      <NumberField
                        value={source.fps}
                        suffix="fps"
                        onCommit={(v) => setSource(slot, { ...source, fps: clamp(v, fps.min, fps.max) })}
                      />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
