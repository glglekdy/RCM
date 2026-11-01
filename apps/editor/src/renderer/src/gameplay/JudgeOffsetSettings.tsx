import { JUDGE_OFFSET_LIMIT } from '../../../shared/settingsRules'
import { Button, Card, NumberField, Slider } from '../ui'
import { setJudgeOffset, useJudgeOffset } from './judgeOffsetStore'
import styles from './GameplaySettings.module.css'

/** 설정 페이지의 `판정` 카드. 바꾸면 다음 테스트 플레이부터 적용된다. */
export function JudgeOffsetSettings() {
  const offset = useJudgeOffset()

  return (
    <Card title="판정">
      <div className={styles.row}>
        <div className={styles.text}>
          <span className={styles.label}>판정 오프셋</span>
          <span className={styles.desc}>입력이 늦게 들어가는 기기면 + 쪽으로 올려요</span>
        </div>
        <div className={styles.control}>
          <Slider
            label="판정 오프셋"
            value={offset}
            min={-JUDGE_OFFSET_LIMIT}
            max={JUDGE_OFFSET_LIMIT}
            onChange={setJudgeOffset}
          />
          {/* min/max를 주면 범위 밖 입력을 되돌리므로 넘기지 않고 setJudgeOffset이 범위로 자른다 */}
          <NumberField value={offset} suffix="ms" onCommit={setJudgeOffset} />
          <Button variant="ghost" disabled={offset === 0} onClick={() => setJudgeOffset(0)}>
            0으로
          </Button>
        </div>
      </div>
    </Card>
  )
}
