import { Fragment } from 'react'
import { Button, Modal } from '../ui'
import { parseInline, parseNotes } from './markdown'
import { RELEASE_NOTES } from './notes'
import { closeWhatsNew, useWhatsNew } from './whatsNewStore'
import styles from './WhatsNewDialog.module.css'

/** 업데이트 내역 창. 여러 버전을 건너뛰었으면 버전마다 제목을 붙여 최신부터 잇는다 */
export function WhatsNewDialog() {
  const view = useWhatsNew()
  if (!view) return null
  const many = view.versions.length > 1

  return (
    <Modal
      open
      title={view.title}
      width={520}
      onClose={closeWhatsNew}
      footer={
        <Button variant="primary" onClick={closeWhatsNew}>
          확인
        </Button>
      }
    >
      <div className={styles.notes}>
        {view.versions.map((v) => (
          <section key={v} className={styles.version}>
            {many && <h3 className={styles.versionTitle}>v{v}</h3>}
            <Notes text={RELEASE_NOTES.get(v) ?? ''} />
          </section>
        ))}
      </div>
    </Modal>
  )
}

function Notes({ text }: { text: string }) {
  return parseNotes(text).map((block, i) =>
    block.type === 'heading' ? (
      <h4 key={i} className={styles.heading}>
        <Inline text={block.text} />
      </h4>
    ) : block.type === 'list' ? (
      <ul key={i} className={styles.list}>
        {block.items.map((item, j) => (
          <li key={j}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    ) : (
      <p key={i} className={styles.paragraph}>
        <Inline text={block.text} />
      </p>
    )
  )
}

function Inline({ text }: { text: string }) {
  return parseInline(text).map((part, i) =>
    part.kind === 'code' ? (
      <code key={i} className={styles.code}>
        {part.text}
      </code>
    ) : part.kind === 'bold' ? (
      <b key={i}>{part.text}</b>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    )
  )
}
