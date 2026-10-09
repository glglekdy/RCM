import { Card, NumberField, Row, SegmentedControl, TextField, useDialogs } from '../../ui'
import { setChartLanes, updateChartMeta } from '../commands/meta'
import { getChart } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'

const LANE_OPTIONS = [4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))

export function ChartPanel() {
  const store = useStore()
  const dialogs = useDialogs()
  const file = useEditor((s) => s.activeChart)
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))

  const applyMeta = (patch: { name?: string; level?: number }) =>
    store.apply('채보 정보 변경', updateChartMeta(store.getState().doc, file, patch), file)

  const changeLanes = async (lanes: number) => {
    if (lanes === chart.lanes) return
    const result = setChartLanes(store.getState().doc, file, lanes)
    if (!result) return
    if (result.removed > 0) {
      const ok = await dialogs.confirm({
        title: '레인 수 변경',
        message: `${result.removed}개 노트가 범위를 벗어나 삭제돼요`,
        danger: true
      })
      if (!ok) return
    }
    // 확인 창이 떠 있는 동안 문서가 바뀌었을 수 있어 다시 계산한다
    store.apply('레인 수 변경', setChartLanes(store.getState().doc, file, lanes)?.doc ?? null, file)
  }

  return (
    <Card title="채보 정보">
      <Row label="이름">
        <TextField value={chart.name} onCommit={(name) => applyMeta({ name })} />
      </Row>
      <Row label="레벨">
        <NumberField
          value={chart.level}
          min={1}
          max={99}
          onCommit={(level) => applyMeta({ level: Math.round(level) })}
        />
      </Row>
      <Row label="레인 수">
        <SegmentedControl
          options={LANE_OPTIONS}
          value={chart.lanes}
          onChange={(n) => void changeLanes(n)}
        />
      </Row>
    </Card>
  )
}
