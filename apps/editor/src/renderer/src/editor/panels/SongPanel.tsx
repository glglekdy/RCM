import { Button, Card, NumberField, Row, TextField } from '../../ui'
import { updateSong } from '../commands/meta'
import { setOffset } from '../commands/timing'
import { useEditor, useStore } from '../state/useStore'
import styles from './Panel.module.css'

const OFFSET_STEPS = [-10, -1, 1, 10]

export function SongPanel() {
  const store = useStore()
  const song = useEditor((s) => s.doc.song)
  const volume = useEditor((s) => s.hitsoundVolume)

  const applyOffset = (offsetMs: number) =>
    store.apply('오프셋 변경', setOffset(store.getState().doc, offsetMs))
  const applySong = (patch: Parameters<typeof updateSong>[1]) =>
    store.apply('곡 정보 변경', updateSong(store.getState().doc, patch))

  return (
    <>
      <Card title="곡 정보">
        <Row label="제목">
          <TextField value={song.title} onCommit={(title) => applySong({ title })} />
        </Row>
        <Row label="아티스트">
          <TextField value={song.artist} onCommit={(artist) => applySong({ artist })} />
        </Row>
      </Card>
      <Card title="오프셋">
        <Row label="오프셋">
          <NumberField value={song.offsetMs} suffix="ms" onCommit={applyOffset} />
        </Row>
        <div className={styles.buttons}>
          {OFFSET_STEPS.map((d) => (
            <Button key={d} onClick={() => applyOffset(song.offsetMs + d)}>
              {d < 0 ? `−${-d}` : `+${d}`}
            </Button>
          ))}
        </div>
      </Card>
      <Card title="미리듣기">
        <Row label="시작">
          <NumberField
            value={song.previewStartMs}
            suffix="ms"
            min={0}
            onCommit={(previewStartMs) => applySong({ previewStartMs })}
          />
        </Row>
        <div className={styles.buttons}>
          <Button
            onClick={() =>
              applySong({ previewStartMs: Math.max(0, Math.round(store.getState().playheadMs)) })
            }
          >
            현재 위치로
          </Button>
        </div>
      </Card>
      <Card title="재생">
        <Row label="효과음 볼륨">
          <NumberField
            value={Math.round(volume * 100)}
            min={0}
            max={100}
            onCommit={(v) => store.set({ hitsoundVolume: v / 100 })}
          />
        </Row>
      </Card>
    </>
  )
}
