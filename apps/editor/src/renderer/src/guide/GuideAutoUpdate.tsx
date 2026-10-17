import { useEffect, useState } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'
import type { GuideFile } from '../../../shared/api'
import { Button, IconButton, useDialogs } from '../ui'
import styles from './GuidePage.module.css'

const STATUS_TEXT: Record<GuideFile['status'], string> = {
  current: '최신',
  updated: '방금 업데이트했어요',
  missing: '파일을 찾을 수 없어요',
  error: '업데이트하지 못했어요'
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** AI 가이드 맨 위: 사용자가 넣어 둔 가이드 파일을 에디터가 업데이트될 때마다 새 내용으로 바꾼다. */
export function GuideAutoUpdate({ fileName }: { fileName: string }) {
  const dialogs = useDialogs()
  const [files, setFiles] = useState<GuideFile[] | null>(null)
  const [busy, setBusy] = useState(false)

  // 페이지를 열 때도 한 번 맞춘다 (앱을 켤 때도 main이 맞춘다)
  useEffect(() => {
    let cancelled = false
    window.rcm
      .getGuideFiles()
      .then((list) => {
        if (!cancelled) setFiles(list)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (action: () => Promise<GuideFile[] | null>, failTitle: string) => {
    setBusy(true)
    try {
      const list = await action()
      if (list) setFiles(list)
    } catch (err) {
      await dialogs.alert(failTitle, messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.section}>
      <h2>
        <RefreshCw size={16} /> 자동 문서 업데이트
      </h2>
      <p className={styles.muted}>
        게임 프로젝트에 넣어 둔 <code>{fileName}</code>를 여기에 추가하면, 에디터가 업데이트될 때마다 새 가이드로
        바꿔 줘요. 같은 이름의 다른 파일을 덮어쓰지 않도록 직접 추가한 파일만 바꿔요.
      </p>
      {files !== null && files.length > 0 && (
        <ul className={styles.guideFiles}>
          {files.map((f) => (
            <li key={f.path} className={styles.guideFile}>
              <div className={styles.guideFileText}>
                <span className={styles.guideFilePath} title={f.path}>
                  {f.path}
                </span>
                <span
                  className={f.status === 'missing' || f.status === 'error' ? styles.guideFileBad : styles.muted}
                  title={f.error}
                >
                  {STATUS_TEXT[f.status]}
                  {f.error ? ` (${f.error})` : ''}
                </span>
              </div>
              <IconButton
                icon={X}
                label="자동 업데이트에서 빼기 (파일은 지우지 않아요)"
                disabled={busy}
                onClick={() =>
                  void run(() => window.rcm.removeGuideFile(f.path), '목록에서 빼지 못했어요')
                }
              />
            </li>
          ))}
        </ul>
      )}
      {files !== null && files.length === 0 && <p className={styles.muted}>아직 추가한 파일이 없어요.</p>}
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void run(() => window.rcm.addGuideFile(), '추가하지 못했어요')}>
          <Plus size={16} /> 위치 추가
        </Button>
      </div>
      <p className={styles.muted}>
        위치를 고르면 그 자리에 지금 가이드를 저장해요. 이미 있는 가이드 파일을 고르면 새 내용으로 덮어써요.
      </p>
    </section>
  )
}
