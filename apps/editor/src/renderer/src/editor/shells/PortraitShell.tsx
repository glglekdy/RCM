import { useEffect, useState } from 'react'
import { Gauge, LayoutGrid, Music, type LucideIcon } from 'lucide-react'
import { BottomSheet, type SheetStage } from '../../ui'
import { PanelBody, PanelTabs } from '../panels/RightPanel'
import type { EditorState } from '../state/store'
import { useEditor, useStore } from '../state/useStore'
import { NoteKindPicker, PlayControls, SnapPicker, ToolButtons, useFreeChart, WidthControl } from '../toolbar/items'
import styles from './PortraitShell.module.css'
import type { ShellProps } from './shellProps'
import { TopBar } from './TopBar'

type PanelTab = EditorState['panelTab']

/** 아래 둘째 줄의 탭 버튼. 390px 폭에 맞추려고 'BPM · 변속'은 '타이밍'으로 줄여 쓴다 (시트 안 탭 줄은 원래 이름) */
const ROW_TABS: { value: PanelTab; label: string; icon: LucideIcon }[] = [
  { value: 'song', label: '곡', icon: Music },
  { value: 'timing', label: '타이밍', icon: Gauge },
  { value: 'chart', label: '채보', icon: LayoutGrid }
]

/**
 * 폰 세로 편집 틀: TopBar · (타임라인 + 미니맵) · 도구 줄 · 탭/스냅/재생 줄.
 * 패널은 바텀시트로 열린다. 시트는 TopBar 아래 전체 영역(타임라인 + 아래 두 줄) 기준이라 full이 그 높이다.
 */
export function PortraitShell({ title, dirty, actions, timeline, minimap, inert }: ShellProps) {
  const store = useStore()
  const panelTab = useEditor((s) => s.panelTab)
  const freeChart = useFreeChart()
  // 시트 단계는 이 틀의 지역 상태. store의 panelOpen/focusPoint는 '패널을 보여 달라'는 요청으로만 쓴다
  const [stage, setStage] = useState<SheetStage>('closed')

  /** 시트를 닫으면 panelOpen도 false로 돌려, 다음 요청(칩 · 탭 템포)이 진짜 false → true 변화가 되게 한다 */
  const changeStage = (next: SheetStage) => {
    setStage(next)
    if (next === 'closed') store.set({ panelOpen: false })
  }

  // 타임라인 칩 · 탭 템포가 패널을 열어 달라고 하면 닫힌 시트를 반만 연다 (이미 열려 있으면 단계를 그대로 둔다).
  // 이 틀이 떠 있는 동안은 시트가 닫혀 있으므로 panelOpen을 false로 맞추고, 틀이 사라지면 원래 값으로 되돌린다
  // (가로·데스크톱 패널은 panelOpen이 '펼침'이라 기본값 true를 이어받는다)
  useEffect(() => {
    const before = store.getState().panelOpen
    store.set({ panelOpen: false })
    let prevOpen = false
    let prevFocus = store.getState().focusPoint
    const off = store.subscribe(() => {
      const s = store.getState()
      const requested = (s.panelOpen && !prevOpen) || (s.focusPoint !== null && s.focusPoint !== prevFocus)
      prevOpen = s.panelOpen
      prevFocus = s.focusPoint
      if (requested) setStage((cur) => (cur === 'closed' ? 'half' : cur))
    })
    return () => {
      off()
      store.set({ panelOpen: before })
    }
  }, [store])

  /** 탭을 누르면 그 탭을 연다. 이미 열려 있는 탭을 다시 누르면 닫는다 */
  const onTab = (tab: PanelTab) => {
    if (stage !== 'closed' && tab === panelTab) {
      changeStage('closed')
      return
    }
    store.set({ panelTab: tab })
    if (stage === 'closed') changeStage('half')
  }

  return (
    <>
      <TopBar title={title} dirty={dirty} actions={actions} inert={inert} />
      {/* 테스트 플레이 화면 아래의 편집 화면은 Tab 등으로 포커스되지 않게 한다 */}
      <div className={styles.stage} inert={inert}>
        <div className={styles.main}>
          <div className={styles.timeline}>{timeline}</div>
          {minimap}
        </div>

        <div className={`${styles.row} ${styles.scroll}`}>
          <div className={styles.group}>
            <ToolButtons />
          </div>
          {freeChart && (
            <div className={styles.group}>
              <NoteKindPicker placement="up" />
            </div>
          )}
          {freeChart && (
            <div className={styles.group} title="클릭으로 그릴 노트 폭 (가로로 끌면 걸친 칸만큼)">
              <WidthControl />
            </div>
          )}
        </div>

        <div className={`${styles.row} ${styles.bottom}`}>
          <div className={`${styles.group} ${styles.tabs}`}>
            {ROW_TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`${styles.tab} ${stage !== 'closed' && panelTab === value ? styles.selected : ''}`}
                aria-pressed={stage !== 'closed' && panelTab === value}
                onClick={() => onTab(value)}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className={styles.tabLabel}>{label}</span>
              </button>
            ))}
          </div>
          <div className={styles.group}>
            <SnapPicker placement="up" align="right" />
          </div>
          <div className={styles.group}>
            <PlayControls actions={actions} />
          </div>
        </div>

        <BottomSheet stage={stage} onStageChange={changeStage} header={
            <div className={styles.sheetHeader}>
              <PanelTabs onTabClick={onTab} />
            </div>
          }>
          <div className={styles.sheetBody}>
            <PanelBody />
          </div>
        </BottomSheet>
      </div>
    </>
  )
}
