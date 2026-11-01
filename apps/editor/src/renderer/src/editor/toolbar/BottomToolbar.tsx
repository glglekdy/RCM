import type { EditorActions } from '../editorActions'
import styles from './BottomToolbar.module.css'
import {
  ChartPicker,
  FileMenu,
  NoteKindPicker,
  PlayControls,
  SnapPicker,
  ToolButtons,
  useFreeChart,
  WidthControl,
  ZoomControl
} from './items'

interface BottomToolbarProps {
  actions: EditorActions
  /** 테스트 플레이 화면에 덮여 있는 동안 포커스·클릭을 받지 않는다 */
  inert?: boolean
}

/** 데스크톱 하단 툴바: 난이도 · 도구 · 노트 종류 · 폭 · 스냅 · 확대 · 재생 · 파일 */
export function BottomToolbar({ actions, inert }: BottomToolbarProps) {
  const freeChart = useFreeChart()

  return (
    <div className={styles.bar} inert={inert}>
      <div className={styles.side}>
        <div className={styles.group}>
          <ChartPicker variant="tabs" onSelect={actions.selectChart} />
        </div>
      </div>

      <div className={styles.center}>
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
        <div className={styles.group}>
          <SnapPicker placement="up" />
        </div>
        <div className={styles.group}>
          <ZoomControl />
        </div>
      </div>

      <div className={`${styles.side} ${styles.end}`}>
        <div className={styles.group}>
          <PlayControls actions={actions} />
        </div>
        <div className={styles.group}>
          <FileMenu actions={actions} placement="up" align="right" />
        </div>
      </div>
    </div>
  )
}
