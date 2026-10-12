import { useState } from 'react'
import { Button, Card, NumberField, Row, TextField, useDialogs } from '../../ui'
import { updateSong } from '../commands/meta'
import { setOffset } from '../commands/timing'
import { useEditor, useStore } from '../state/useStore'
import styles from './Panel.module.css'

const OFFSET_STEPS = [-10, -1, 1, 10]

/** 고른 파일을 실제로 디코딩할 수 있는지 (프로젝트에 넣기 전에 확인한다). */
async function canDecode(path: string): Promise<boolean> {
  try {
    const data = await window.rcm.readAudio(path)
    await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data)
    return true
  } catch {
    return false
  }
}

export function SongPanel() {
  const store = useStore()
  const song = useEditor((s) => s.doc.song)
  const volume = useEditor((s) => s.hitsoundVolume)
  const musicVolume = useEditor((s) => s.musicVolume)
  // 재생·녹음·테스트 플레이 중에는 음악을 바꾸지 않는다
  const busy = useEditor((s) => s.playing || s.mode !== 'edit')
  const [changingMusic, setChangingMusic] = useState(false)
  const dialogs = useDialogs()

  const applyOffset = (offsetMs: number) =>
    store.apply('오프셋 변경', setOffset(store.getState().doc, offsetMs))
  const applySong = (patch: Parameters<typeof updateSong>[1]) =>
    store.apply('곡 정보 변경', updateSong(store.getState().doc, patch))

  /** 음악 파일을 골라 프로젝트 폴더에 복사하고 song.json이 그 파일을 가리키게 한다 (Undo 가능). */
  const changeMusic = async () => {
    setChangingMusic(true)
    try {
      const source = await window.rcm.pickAudioFile()
      if (!source) return
      if (!(await canDecode(source))) {
        await dialogs.alert('이 파일은 재생할 수 없어요', source)
        return
      }
      const audio = await window.rcm.importProjectAudio(store.getState().dir, source)
      const s = store.getState()
      // 파일을 확인하는 사이 재생을 시작했으면 바꾸지 않는다 (복사한 파일은 다음에 열 때 정리된다)
      if (s.playing || s.mode !== 'edit') return
      store.apply('음악 변경', updateSong(s.doc, { audio }))
    } catch (err) {
      await dialogs.alert('음악을 바꾸지 못했어요', err instanceof Error ? err.message : String(err))
    } finally {
      setChangingMusic(false)
    }
  }

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
      <Card title="음악">
        <Row label="파일">
          <span className={styles.fileName} title={song.audio}>
            {song.audio || '없음'}
          </span>
          <Button disabled={busy || changingMusic} onClick={() => void changeMusic()}>
            {song.audio ? '변경' : '선택'}
          </Button>
        </Row>
        {!song.audio && <p className={styles.hint}>음악 없이 편집 중이에요. 재생하면 노트 효과음만 들려요.</p>}
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
        <Row label="음악 볼륨">
          <NumberField
            value={Math.round(musicVolume * 100)}
            min={0}
            max={100}
            onCommit={(v) => store.set({ musicVolume: v / 100 })}
          />
        </Row>
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
