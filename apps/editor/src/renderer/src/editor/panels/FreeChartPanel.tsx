import { ChevronDown, Trash2 } from 'lucide-react'
import { freeGimmickOf, freeNoteKey, MAX_COLUMNS, MIN_COLUMNS, type FlickDirection, type FreeNote } from '@rcm/core'
import { Card, IconButton, NumberField, Row, SegmentedControl, Switch, useToast } from '../../ui'
import {
  changeFreeType,
  changeToGimmick,
  removeSlidePoint,
  setFlickDirection,
  setFreeNoteWidth,
  setSlideEndFlick,
  updateFreeSettings,
  updateSlidePoint
} from '../commands/freeNotes'
import { getFreeChart, type ProjectDoc } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import { ChartInfoCard } from './ChartInfoCard'
import { FLICK_DIRECTION_OPTIONS, FLICK_MODE_OPTIONS, SLIDE_EASE_OPTIONS } from './freeLabels'
import styles from './Panel.module.css'

const TYPE_OPTIONS = [
  { value: 'tap' as const, label: '탭' },
  { value: 'trace' as const, label: '트레이스' },
  { value: 'flick' as const, label: '플릭' }
]

/** 자유형(모바일) 채보 탭: 채보 정보, 칸 수·플릭 방식, 선택한 노트 고치기. */
export function FreeChartPanel() {
  const store = useStore()
  const toast = useToast()
  const file = useEditor((s) => s.activeChart)
  const chart = useEditor((s) => getFreeChart(s.doc, s.activeChart))
  const selection = useEditor((s) => s.selection)
  const flickDirection = useEditor((s) => s.flickDirection)
  const locked = useEditor((s) => s.playing || s.mode !== 'edit')
  const selected = chart.notes.filter((n) => selection.has(freeNoteKey(n)))

  const isLocked = () => {
    const s = store.getState()
    return s.playing || s.mode !== 'edit'
  }

  /** 노트 편집을 기록한다. 바뀐 노트의 새 키로 선택을 옮긴다. */
  const edit = (label: string, run: (doc: ProjectDoc) => { doc: ProjectDoc; keys: Set<string> } | null) => {
    if (isLocked()) return
    const r = run(store.getState().doc)
    if (r && store.apply(label, r.doc, file)) store.set({ selection: r.keys })
  }

  const applySettings = (patch: { columns?: number; flickMode?: 'directional' | 'any' }) => {
    if (isLocked()) return
    const next = updateFreeSettings(store.getState().doc, file, patch)
    if (!next) {
      if (patch.columns !== undefined && patch.columns !== chart.columns) toast('칸을 벗어나는 노트가 있어서 줄일 수 없어요')
      return
    }
    store.apply('자유형 설정 변경', next, file)
  }

  const keys = () => store.getState().selection
  const flicky = (n: FreeNote) => n.type === 'flick' || (n.type === 'slide' && n.endFlick === true)
  const singles = selected.filter((n) => n.type !== 'slide')
  const commonType =
    singles.length > 0 && singles.every((n) => n.type === singles[0].type) ? singles[0].type : null
  const gimmicks = chart.gimmicks ?? []
  // 기믹 종류를 고를 수 있는 노트: 단발 노트와 기믹 슬라이드. 모두 같은 종류일 때만 그 이름을 보인다
  const gimmickTargets = selected.filter((n) => n.type !== 'slide' || n.gimmick !== undefined)
  const commonGimmick =
    gimmickTargets.length > 0 && gimmickTargets.every((n) => freeGimmickOf(n) === freeGimmickOf(gimmickTargets[0]))
      ? freeGimmickOf(gimmickTargets[0])
      : null
  const anyGimmick = gimmickTargets.some((n) => freeGimmickOf(n) !== null)
  const flicks = selected.filter(flicky)
  const flickDir = (n: FreeNote) => (n.type === 'flick' || n.type === 'slide' ? n.direction : undefined)
  const commonDir: FlickDirection | null =
    flicks.length > 0 && flicks.every((n) => flickDir(n) === flickDir(flicks[0])) ? (flickDir(flicks[0]) ?? null) : null
  const headWidth = (n: FreeNote) => (n.type === 'slide' ? n.points[0].width : n.width)
  // 슬라이드는 모든 지점의 폭이 같을 때만 같은 폭으로 본다
  const widthsOf = (n: FreeNote) => (n.type === 'slide' ? n.points.map((p) => p.width) : [n.width])
  const allWidths = selected.flatMap(widthsOf)
  const commonWidth = allWidths.length > 0 && allWidths.every((w) => w === allWidths[0]) ? allWidths[0] : null
  const slide = selected.length === 1 && selected[0].type === 'slide' ? selected[0] : null
  const slideKey = slide ? freeNoteKey(slide) : ''

  return (
    <>
      <ChartInfoCard />
      <Card title="자유형 설정">
        <Row label="칸 수">
          <NumberField
            value={chart.columns}
            min={MIN_COLUMNS}
            max={MAX_COLUMNS}
            onCommit={(columns) => applySettings({ columns: Math.round(columns) })}
          />
        </Row>
        <Row label="플릭">
          <SegmentedControl
            options={FLICK_MODE_OPTIONS.map((o) => ({ ...o, disabled: locked }))}
            value={chart.flickMode}
            onChange={(flickMode) => applySettings({ flickMode })}
          />
        </Row>
        <p className={styles.hint}>
          {chart.flickMode === 'directional'
            ? '플릭마다 정한 방향으로 튕겨야 해요'
            : '플릭은 아무 방향으로나 튕기면 돼요'}
        </p>
      </Card>
      <Card title={selected.length > 0 ? `선택한 노트 (${selected.length})` : '선택한 노트'}>
        {selected.length === 0 ? (
          <p className={styles.hint}>
            선택 도구(V)로 노트를 고르면 종류·방향·슬라이드 지점을 여기서 바꿀 수 있어요. 노트 양 끝을 끌면 폭이 바뀌어요.
          </p>
        ) : (
          <fieldset className={styles.pointList} disabled={locked}>
            <Row label={slide ? '폭 (전체)' : '폭'}>
              <NumberField
                value={commonWidth ?? headWidth(selected[0])}
                min={0.25}
                max={chart.columns}
                step={1}
                suffix={commonWidth === null ? '칸 (제각각)' : '칸'}
                onCommit={(width) => edit('노트 폭 조절', (doc) => setFreeNoteWidth(doc, file, keys(), width))}
              />
            </Row>
            {singles.length > 0 && (
              <Row label="종류">
                <SegmentedControl
                  options={TYPE_OPTIONS}
                  value={commonType === null || commonType === 'gimmick' ? ('' as never) : commonType}
                  onChange={(type) =>
                    edit('노트 종류 변경', (doc) =>
                      changeFreeType(doc, file, keys(), type, commonDir ?? flickDirection)
                    )
                  }
                />
              </Row>
            )}
            {gimmickTargets.length > 0 && gimmicks.length > 0 && (
              <Row label="기믹">
                <div className={styles.selectWrap}>
                  <select
                    className={styles.select}
                    value={commonGimmick ?? ''}
                    onChange={(e) =>
                      e.target.value &&
                      edit('노트 종류 변경', (doc) => changeToGimmick(doc, file, keys(), e.target.value))
                    }
                  >
                    <option value="">{commonGimmick === null && anyGimmick ? '(제각각)' : '—'}</option>
                    {gimmicks.map((g) => (
                      <option key={g.name} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className={styles.chevron} />
                </div>
              </Row>
            )}
            {flicks.length > 0 && chart.flickMode === 'directional' && (
              <Row label="방향">
                <SegmentedControl
                  options={FLICK_DIRECTION_OPTIONS}
                  value={commonDir ?? ('' as never)}
                  onChange={(direction) => {
                    store.set({ flickDirection: direction })
                    edit('플릭 방향 변경', (doc) => setFlickDirection(doc, file, keys(), direction))
                  }}
                />
              </Row>
            )}
            {slide && slide.type === 'slide' && (
              <>
                {slide.gimmick === undefined && (
                  <Row label="끝 플릭">
                    <Switch
                      label="끝 플릭"
                      checked={slide.endFlick === true}
                      onChange={(on) =>
                        edit('슬라이드 끝 변경', (doc) => setSlideEndFlick(doc, file, slideKey, on, flickDirection))
                      }
                    />
                  </Row>
                )}
                {slide.points.map((pt, i) => {
                  const last = i === slide.points.length - 1
                  const mid = i > 0 && !last
                  return (
                    <div key={`${i}-${pt.tick}`} className={styles.point}>
                      <div className={styles.pointRow}>
                        <span className={styles.position}>
                          지점 {i + 1}
                          {i === 0 ? ' · 시작' : last ? ' · 끝' : ''}
                        </span>
                        <span className={styles.pointWidth}>
                          <NumberField
                            value={pt.width}
                            min={0.25}
                            max={chart.columns}
                            step={1}
                            suffix="칸"
                            onCommit={(width) =>
                              edit('슬라이드 지점 폭 조절', (doc) => updateSlidePoint(doc, file, slideKey, i, { width }))
                            }
                          />
                        </span>
                        {mid && (
                          <IconButton
                            icon={Trash2}
                            label="지점 삭제"
                            onClick={() => edit('슬라이드 지점 삭제', (doc) => removeSlidePoint(doc, file, slideKey, i))}
                          />
                        )}
                      </div>
                      {!last && (
                        <div className={styles.pointRow}>
                          <SegmentedControl
                            options={SLIDE_EASE_OPTIONS}
                            value={pt.ease ?? 'linear'}
                            onChange={(ease) =>
                              edit('슬라이드 곡선 변경', (doc) => updateSlidePoint(doc, file, slideKey, i, { ease }))
                            }
                          />
                          {mid && (
                            <span className={styles.inlineSwitch}>
                              숨김
                              <Switch
                                label="숨은 지점"
                                checked={pt.hidden === true}
                                onChange={(hidden) =>
                                  edit('슬라이드 지점 변경', (doc) => updateSlidePoint(doc, file, slideKey, i, { hidden }))
                                }
                              />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className={styles.hint}>
                  {slide.gimmick === undefined ? '슬라이드' : '기믹'} 도구로 몸통을 누르면 지점이 생기고, 지점을 끌어 옮겨요. 숨은 지점은
                  판정 없이 경로만 꺾어요.
                </p>
              </>
            )}
          </fieldset>
        )}
      </Card>
    </>
  )
}
