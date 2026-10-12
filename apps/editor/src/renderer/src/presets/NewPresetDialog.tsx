import { useEffect, useState } from 'react'
import { DEFAULT_NOTE_COLOR, isGimmick } from '@rcm/core'
import { keysLabel } from '@rcm/playfield'
import { presetTrackKeys, type PresetTrack, type TrackPreset } from '../../../shared/presets'
import {
  BLANK_TEMPLATE,
  TEMPLATE_GROUPS,
  defaultTemplateName,
  presetFromTemplate,
  type PresetTemplate,
  type TemplateGroup
} from '../../../shared/presetTemplates'
import { Button, isSubmitEnter, Modal, TextField } from '../ui'
import { getPresets } from './presetStore'
import styles from './NewPresetDialog.module.css'

interface NewPresetDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (p: TrackPreset) => void
}

const trackKeyText = (t: PresetTrack): string => (isGimmick(t) ? '⚙' : keysLabel(presetTrackKeys(t)))

/**
 * `새 프리셋` 창 (포토샵 "새로운 문서 만들기"처럼): 위 게임별 탭, 왼쪽 템플릿 카드, 오른쪽 이름·트랙 정보.
 * 카드 더블클릭·`만들기`·Enter로 고른 템플릿을 복사한 새 프리셋을 만든다.
 */
export function NewPresetDialog({ open, onClose, onCreate }: NewPresetDialogProps) {
  const [group, setGroup] = useState<TemplateGroup>(TEMPLATE_GROUPS[0])
  const [picked, setPicked] = useState<PresetTemplate>(BLANK_TEMPLATE)
  const [name, setName] = useState(BLANK_TEMPLATE.name)

  // 열 때마다 기본 탭의 빈 프리셋부터
  useEffect(() => {
    if (!open) return
    setGroup(TEMPLATE_GROUPS[0])
    setPicked(BLANK_TEMPLATE)
    setName(BLANK_TEMPLATE.name)
  }, [open])

  const pick = (g: TemplateGroup, t: PresetTemplate) => {
    setPicked(t)
    setName(defaultTemplateName(g, t))
  }

  const create = (g: TemplateGroup, t: PresetTemplate, n: string) =>
    onCreate(presetFromTemplate(t, n, getPresets(), defaultTemplateName(g, t)))

  // 고른 템플릿이 속한 탭 (다른 탭을 보는 중에도 오른쪽 정보와 만들기는 고른 템플릿 기준)
  const pickedGroup = TEMPLATE_GROUPS.find((g) => g.templates.includes(picked)) ?? group

  return (
    <Modal
      open={open}
      wide
      title="새 프리셋"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>닫기</Button>
          <Button variant="primary" onClick={() => create(pickedGroup, picked, name)}>
            만들기
          </Button>
        </>
      }
    >
      <div className={styles.layout}>
        <div className={styles.tabs} role="tablist">
          {TEMPLATE_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g === group}
              className={`${styles.tab} ${g === group ? styles.tabActive : ''}`}
              onClick={() => setGroup(g)}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className={styles.main}>
          <div className={styles.grid}>
            {group.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.card} ${t === picked ? styles.cardSelected : ''}`}
                aria-pressed={t === picked}
                onClick={() => pick(group, t)}
                onDoubleClick={() => create(group, t, defaultTemplateName(group, t))}
              >
                <LanePreview tracks={t.tracks} />
                <span className={styles.cardName}>{t.name}</span>
                <span className={styles.cardKeys}>{t.tracks.map(trackKeyText).join(' ')}</span>
              </button>
            ))}
          </div>
          <aside
            className={styles.details}
            onKeyDown={(e) => {
              // 한글 조합을 끝내는 Enter는 만들지 않는다
              if (isSubmitEnter(e) && e.target instanceof HTMLInputElement) create(pickedGroup, picked, name)
            }}
          >
            <label className={styles.field}>
              <span className={styles.label}>이름</span>
              <TextField value={name} onChange={setName} placeholder={defaultTemplateName(pickedGroup, picked)} width={220} />
            </label>
            <span className={styles.label}>트랙 {picked.tracks.length}개</span>
            <ul className={styles.trackList}>
              {picked.tracks.map((t) => (
                <li key={t.id} className={styles.trackRow}>
                  <span className={styles.trackId} style={{ color: t.color ?? DEFAULT_NOTE_COLOR }}>
                    {t.id}
                  </span>
                  <span className={styles.trackKind}>{isGimmick(t) ? '기믹' : '플레이'}</span>
                  <span className={styles.trackKey}>{isGimmick(t) ? '—' : keysLabel(presetTrackKeys(t))}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </Modal>
  )
}

/** 카드 위 레인 그림: 트랙마다 같은 폭 막대, 테두리 = 트랙 색, 기믹은 점선 */
function LanePreview({ tracks }: { tracks: readonly PresetTrack[] }) {
  return (
    <span className={styles.lanes} aria-hidden>
      {tracks.map((t) => (
        <span
          key={t.id}
          className={`${styles.lane} ${isGimmick(t) ? styles.laneGimmick : ''}`}
          style={{ borderColor: t.color ?? DEFAULT_NOTE_COLOR }}
        />
      ))}
    </span>
  )
}
