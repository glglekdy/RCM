import { Fragment, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Modal } from '../ui'
import { parseInline, parseNotes, resolveImageSrc } from './markdown'
import { RELEASE_NOTES } from './notes'
import { closeWhatsNew, useWhatsNew, type WhatsNewView } from './whatsNewStore'
import styles from './WhatsNewDialog.module.css'

/** 업데이트 내역 창. 업데이트 뒤 새 버전 안내와, 사이드바에서 여는 지난 내역 보기 두 가지 */
export function WhatsNewDialog() {
  const view = useWhatsNew()
  if (!view) return null
  // 다시 열 때마다 버전 목록부터 보이게 한다
  return view.history ? <History key={view.versions.join()} versions={view.versions} /> : <Updates view={view} />
}

/** 새 버전 안내. 여러 버전을 건너뛰었으면 버전마다 제목을 붙여 최신부터 잇는다 */
function Updates({ view }: { view: WhatsNewView }) {
  const many = view.versions.length > 1
  return (
    <Modal open title={view.title} width={520} onClose={closeWhatsNew} footer={<CloseButton />}>
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

/** 지난 내역 보기: 처음엔 버전 버튼만 보이고, 누르면 그 버전 내역을 보여 준다 */
function History({ versions }: { versions: string[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <Modal
      open
      title={selected ? `v${selected} 업데이트 내역` : '업데이트 내역'}
      width={520}
      onClose={closeWhatsNew}
      footer={
        <>
          {selected && (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              <ChevronLeft size={16} /> 버전 목록
            </Button>
          )}
          <CloseButton />
        </>
      }
    >
      {selected ? (
        <div className={styles.notes}>
          <section className={styles.version}>
            <Notes text={RELEASE_NOTES.get(selected) ?? ''} />
          </section>
        </div>
      ) : (
        <div className={styles.versionButtons}>
          {versions.map((v, i) => (
            <button key={v} type="button" className={styles.versionButton} onClick={() => setSelected(v)}>
              <span>v{v}</span>
              {i === 0 && <span className={styles.latest}>최신</span>}
              <ChevronRight size={16} className={styles.chevron} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

function CloseButton() {
  return (
    <Button variant="primary" onClick={closeWhatsNew}>
      확인
    </Button>
  )
}

/** 업데이트 내역·공지사항 본문. `imageBase`는 그림의 상대 경로를 풀 기준 주소 */
export function Notes({ text, imageBase }: { text: string; imageBase?: string }) {
  return parseNotes(text).map((block, i) =>
    block.type === 'image' ? (
      <NoteImage key={i} alt={block.alt} src={resolveImageSrc(block.src, imageBase)} />
    ) : block.type === 'heading' ? (
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

/** 못 불러오면 그림 자리에 설명 글만 남긴다 */
function NoteImage({ alt, src }: { alt: string; src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return alt ? <p className={styles.paragraph}>[그림: {alt}]</p> : null
  return <img className={styles.image} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
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
