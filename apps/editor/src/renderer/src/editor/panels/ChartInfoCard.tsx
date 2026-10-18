import { Card, NumberField, Row, TextField } from '../../ui'
import { updateChartMeta } from '../commands/meta'
import { getChart } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'

/** 채보 이름과 레벨 (레인형·자유형 공통). */
export function ChartInfoCard() {
  const store = useStore()
  const file = useEditor((s) => s.activeChart)
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))

  const applyMeta = (patch: { name?: string; level?: number }) =>
    store.apply('채보 정보 변경', updateChartMeta(store.getState().doc, file, patch), file)

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
    </Card>
  )
}
