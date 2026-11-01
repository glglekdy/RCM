import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ANNOUNCEMENTS_URL } from '../../../shared/announcementsSource'
import { Button, Modal } from '../ui'
import { Notes } from '../whatsNew/WhatsNewDialog'
import notesStyles from '../whatsNew/WhatsNewDialog.module.css'
import { closeAnnouncements, refreshAnnouncements, useAnnouncements } from './announcementsStore'
import styles from './AnnouncementsDialog.module.css'

/** 공지사항 창: 처음엔 공지 제목 목록, 누르면 그 공지 본문 */
export function AnnouncementsDialog() {
  const state = useAnnouncements()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (!state.open) return null

  const selected = state.items.find((a) => a.id === selectedId) ?? null
  const close = (): void => {
    setSelectedId(null)
    closeAnnouncements()
  }

  return (
    <Modal
      open
      title={selected ? selected.title : '공지사항'}
      width={520}
      onClose={close}
      footer={
        <>
          {selected && (
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              <ChevronLeft size={16} /> 공지 목록
            </Button>
          )}
          <Button variant="primary" onClick={close}>
            확인
          </Button>
        </>
      }
    >
      {selected ? (
        <div className={notesStyles.notes}>
          {selected.date && <div className={styles.date}>{selected.date}</div>}
          <section className={notesStyles.version}>
            <Notes text={selected.body} imageBase={ANNOUNCEMENTS_URL} />
          </section>
        </div>
      ) : state.items.length > 0 ? (
        <div className={notesStyles.versionButtons}>
          {state.items.map((a) => (
            <button key={a.id} type="button" className={notesStyles.versionButton} onClick={() => setSelectedId(a.id)}>
              <span className={styles.title}>{a.title}</span>
              {state.fresh.includes(a.id) && <span className={notesStyles.latest}>새 글</span>}
              {a.date && <span className={styles.itemDate}>{a.date}</span>}
              <ChevronRight size={16} className={notesStyles.chevron} />
            </button>
          ))}
        </div>
      ) : state.status === 'error' ? (
        <div className={styles.empty}>
          <p>공지사항을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
          <Button onClick={() => void refreshAnnouncements()}>다시 시도</Button>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>{state.status === 'ok' ? '아직 공지사항이 없어요.' : '불러오는 중…'}</p>
        </div>
      )}
    </Modal>
  )
}
