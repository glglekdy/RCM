import { isFreeChart, MAX_COLUMNS, SNAP_DIVISIONS, type FreeChart } from '@rcm/core'
import { FREE_NOTE_COLORS } from '@rcm/playfield'
import {
  Brush,
  ChevronDown,
  Circle,
  Eraser,
  Folder,
  Gamepad2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  SquareDashedMousePointer
} from 'lucide-react'
import { IconButton, Menu } from '../../ui'
import { caps } from '../../ui/platform'
import { FLICK_DIRECTION_OPTIONS, FREE_TYPE_OPTIONS } from '../panels/freeLabels'
import { DEFAULT_PX_PER_MS } from '../minimap/geometry'
import { fileMenuItems, type EditorActions } from '../editorActions'
import { getChart } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import styles from './BottomToolbar.module.css'
import { GimmickList } from './GimmickList'
import { zoomIn, zoomOut } from './zoom'

/*
 * 하단 툴바 항목. 모두 감싸는 요소 없이 Fragment를 돌려준다:
 * 그룹으로 묶는 일과 펼치는 방향은 각 Shell(데스크톱·폰 세로·폰 가로)이 정한다.
 */

/** 지금 보는 채보가 자유형이면 그 채보, 아니면 null */
export function useFreeChart(): FreeChart | null {
  return useEditor((s) => {
    const chart = getChart(s.doc, s.activeChart)
    return isFreeChart(chart) ? chart : null
  })
}

interface ChartPickerProps {
  onSelect: (file: string) => void
  /** '난이도 추가'를 눌렀을 때. 추가 창은 편집 화면이 연다 */
  onAdd: () => void
  /** tabs: 난이도 탭 줄 + 추가 버튼 / menu: 고른 난이도 이름이 적힌 드롭다운 */
  variant: 'tabs' | 'menu'
  /** menu의 펼치는 방향. 기본 'up' (화면 아래쪽 툴바용). tabs에서는 쓰지 않는다 */
  placement?: 'up' | 'down'
}

export function ChartPicker({ onSelect, onAdd, variant, placement = 'up' }: ChartPickerProps) {
  const charts = useEditor((s) => s.doc.charts)
  const activeChart = useEditor((s) => s.activeChart)
  const activeName = charts.find((c) => c.file === activeChart)?.chart.name ?? ''

  return (
    <>
      {variant === 'tabs' ? (
        <>
          {charts.map((c) => (
            <button
              key={c.file}
              type="button"
              className={`${styles.tab} ${c.file === activeChart ? styles.selected : ''}`}
              onClick={() => onSelect(c.file)}
            >
              {c.chart.name}
            </button>
          ))}
          <IconButton icon={Plus} label="난이도 추가" onClick={onAdd} />
        </>
      ) : (
        <Menu
          placement={placement}
          trigger={
            <button type="button" className={styles.dropdown} title="난이도">
              <span className={styles.chartName}>{activeName}</span>
              <ChevronDown size={14} />
            </button>
          }
          items={[
            ...charts.map((c) => ({
              key: c.file,
              label: c.chart.name,
              checked: c.file === activeChart,
              onSelect: () => onSelect(c.file)
            })),
            { key: '__add__', label: '난이도 추가', onSelect: onAdd }
          ]}
        />
      )}
    </>
  )
}

/** 그리기 · (자유형이면) 연속 그리기 · 지우기 · 선택 */
export function ToolButtons() {
  const store = useStore()
  const tool = useEditor((s) => s.tool)
  const freeChart = useFreeChart()

  return (
    <>
      <IconButton
        icon={Pencil}
        label="그리기 (B)"
        active={tool === 'draw' || (tool === 'brush' && !freeChart)}
        onClick={() => store.set({ tool: 'draw' })}
      />
      {freeChart && (
        <IconButton
          icon={Brush}
          label="연속 그리기 (G) — 끌고 지나간 스냅마다 노트를 깔아요"
          active={tool === 'brush'}
          onClick={() => store.set({ tool: 'brush' })}
        />
      )}
      <IconButton
        icon={Eraser}
        label="지우기 (E)"
        active={tool === 'erase'}
        onClick={() => store.set({ tool: 'erase' })}
      />
      <IconButton
        icon={SquareDashedMousePointer}
        label="선택 (V)"
        active={tool === 'select'}
        onClick={() => store.set({ tool: 'select' })}
      />
    </>
  )
}

/** 자유형일 때 노트 종류 탭 · 기믹 노트 목록 · 방향 플릭 메뉴. 레인형이면 null */
export function NoteKindPicker({ placement }: { placement: 'up' | 'down' }) {
  const store = useStore()
  const tool = useEditor((s) => s.tool)
  const freeType = useEditor((s) => s.freeType)
  const flickDirection = useEditor((s) => s.flickDirection)
  const freeChart = useFreeChart()
  if (!freeChart) return null
  const directionLabel = FLICK_DIRECTION_OPTIONS.find((o) => o.value === flickDirection)?.label ?? ''

  return (
    <>
      {FREE_TYPE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.tab} ${freeType === o.value ? styles.selected : ''}`}
          title={`${o.label} 그리기`}
          // 연속 그리기 중이면 그대로, 지우기·선택 중이면 그리기로
          onClick={() => store.set({ freeType: o.value, tool: tool === 'brush' ? 'brush' : 'draw' })}
        >
          <span className={styles.typeDot} style={{ background: FREE_NOTE_COLORS[o.value] }} />
          {o.label}
        </button>
      ))}
      <GimmickList chart={freeChart} placement={placement} />
      {freeChart.flickMode === 'directional' && (
        <Menu
          placement={placement}
          trigger={
            <button type="button" className={styles.dropdown} title="새 플릭 방향">
              {directionLabel}
              <ChevronDown size={14} />
            </button>
          }
          items={FLICK_DIRECTION_OPTIONS.map((o) => ({
            label: o.label,
            onSelect: () => store.set({ flickDirection: o.value })
          }))}
        />
      )}
    </>
  )
}

/** 자유형일 때 클릭으로 그릴 노트 폭 −/+. 레인형이면 null */
export function WidthControl() {
  const store = useStore()
  const freeWidth = useEditor((s) => s.freeWidth)
  const freeChart = useFreeChart()
  if (!freeChart) return null
  // 폭은 1칸 ~ 채보의 칸 수
  const setWidth = (w: number) =>
    store.set({ freeWidth: Math.min(Math.max(1, w), freeChart.columns ?? MAX_COLUMNS) })

  return (
    <>
      <IconButton icon={Minus} label="폭 줄이기" onClick={() => setWidth(freeWidth - 1)} />
      <span className={styles.zoom}>폭 {freeWidth}</span>
      <IconButton icon={Plus} label="폭 늘리기" onClick={() => setWidth(freeWidth + 1)} />
    </>
  )
}

export function SnapPicker({ placement, align }: { placement: 'up' | 'down'; align?: 'left' | 'right' }) {
  const store = useStore()
  const snap = useEditor((s) => s.snap)

  return (
    <Menu
      placement={placement}
      align={align}
      trigger={
        <button type="button" className={styles.dropdown} title="스냅">
          1/{snap}
          <ChevronDown size={14} />
        </button>
      }
      items={SNAP_DIVISIONS.map((d) => ({
        label: `1/${d}`,
        onSelect: () => store.set({ snap: d })
      }))}
    />
  )
}

export function ZoomControl() {
  const store = useStore()
  const pxPerMs = useEditor((s) => s.pxPerMs)

  return (
    <>
      <IconButton icon={Minus} label="축소" onClick={() => store.set({ pxPerMs: zoomOut(pxPerMs) })} />
      <span className={styles.zoom}>{Math.round((pxPerMs / DEFAULT_PX_PER_MS) * 100)}%</span>
      <IconButton icon={Plus} label="확대" onClick={() => store.set({ pxPerMs: zoomIn(pxPerMs) })} />
    </>
  )
}

/** 재생/정지 · (녹음 가능한 환경이면) 녹음/REC · 테스트 플레이 */
export function PlayControls({ actions }: { actions: EditorActions }) {
  const playing = useEditor((s) => s.playing)
  const recording = useEditor((s) => s.mode === 'recording')

  return (
    <>
      <IconButton
        icon={playing ? Pause : Play}
        label={playing ? '정지 (Space)' : '재생 (Space)'}
        onClick={actions.playPause}
      />
      {!caps().recording ? null : recording ? (
        <button
          type="button"
          className={styles.rec}
          title="녹음 끝내기 (Esc)"
          aria-label="녹음 끝내기 (Esc)"
          onClick={actions.record}
        >
          <span className={styles.recDot} />
          REC
        </button>
      ) : (
        <IconButton icon={Circle} label="녹음 (R)" onClick={actions.record} />
      )}
      <IconButton icon={Gamepad2} label="테스트 플레이 (F5)" onClick={actions.playtest} />
    </>
  )
}

export function FileMenu({
  actions,
  placement,
  align
}: {
  actions: EditorActions
  placement: 'up' | 'down'
  align?: 'left' | 'right'
}) {
  return (
    <Menu
      placement={placement}
      align={align}
      trigger={
        <button type="button" className={styles.dropdown} title="파일">
          <Folder size={16} />
          <ChevronDown size={14} />
        </button>
      }
      items={fileMenuItems(actions, caps().chooseProjectFolder)}
    />
  )
}
