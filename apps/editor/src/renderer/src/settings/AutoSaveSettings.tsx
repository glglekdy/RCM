import { Card, Switch } from '../ui'
import { setAutoSave, useAutoSave } from './autoSaveStore'
import styles from './SettingsPage.module.css'

/** 설정 페이지의 `저장` 카드 (웹). */
export function AutoSaveSettings() {
  const on = useAutoSave()
  return (
    <Card title="저장">
      <div className={styles.item}>
        <div className={styles.text}>
          <span>자동 저장</span>
          <span className={styles.desc}>화면이 가려지면 저장하지 않은 변경을 저장해요</span>
        </div>
        <Switch label="자동 저장" checked={on} onChange={setAutoSave} />
      </div>
    </Card>
  )
}
