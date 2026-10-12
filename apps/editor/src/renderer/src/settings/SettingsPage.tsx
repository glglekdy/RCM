import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { GameplaySettings } from '../gameplay/GameplaySettings'
import { LayoutPreview } from '../gameplay/LayoutPreview'
import { useLayout } from '../gameplay/layoutStore'
import { PreviewFullscreen } from '../gameplay/PreviewFullscreen'
import previewStyles from '../gameplay/LayoutPreview.module.css'
import { Card, Switch, useToast } from '../ui'
import styles from './SettingsPage.module.css'

/** 시작 화면의 `설정` 페이지. 바꾸면 바로 설정 파일에 저장한다. */
export function SettingsPage() {
  const toast = useToast()
  /** 설정을 읽기 전에는 null (스위치 비활성) */
  const [discord, setDiscord] = useState<boolean | null>(null)
  const layout = useLayout()
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let alive = true
    window.rcm
      .getDiscordPresence()
      .then((v) => alive && setDiscord(v))
      .catch(() => alive && setDiscord(true))
    return () => {
      alive = false
    }
  }, [])

  const changeDiscord = async (next: boolean) => {
    setDiscord(next)
    try {
      await window.rcm.setDiscordPresence(next)
    } catch {
      setDiscord(!next)
      toast('설정을 저장하지 못했어요')
    }
  }

  return (
    <div className={`${styles.page} stagger-children`}>
      <h1 className={styles.title}>설정</h1>
      <div className={styles.columns}>
        <div className={styles.cards}>
          <Card title="디스코드">
            <div className={styles.item}>
              <div className={styles.text}>
                <span>디스코드에 활동 표시</span>
                <span className={styles.desc}>
                  작업 중인 곡과 채보를 디스코드 프로필에 보여줘요. 끄면 아무것도 표시하지 않아요.
                </span>
              </div>
              <Switch
                label="디스코드에 활동 표시"
                checked={discord ?? false}
                disabled={discord === null}
                onChange={(v) => void changeDiscord(v)}
              />
            </div>
          </Card>
          <GameplaySettings />
        </div>
        <aside className={styles.preview}>
          <span className={styles.previewTitle}>미리보기</span>
          <div className={previewStyles.box}>
            <LayoutPreview layout={layout} className={previewStyles.canvas} fit />
            <button type="button" className={previewStyles.expand} onClick={() => setFullscreen(true)}>
              <Maximize2 size={14} /> 전체화면으로 보기
            </button>
          </div>
        </aside>
      </div>
      {fullscreen && <PreviewFullscreen onClose={() => setFullscreen(false)} />}
    </div>
  )
}
