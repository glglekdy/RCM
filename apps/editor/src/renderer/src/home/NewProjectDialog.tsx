import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import {
  Button,
  IconButton,
  Modal,
  NumberField,
  Row,
  TextField,
  useDialogs
} from '../ui'
import { presetToChartTracks } from '../../../shared/presets'
import { PresetPicker } from '../presets/PresetPicker'
import { defaultPresetId, getPresets, setLastPresetId, usePresets } from '../presets/presetStore'
import styles from './NewProjectDialog.module.css'

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (dir: string) => void
}

type Audio =
  | { state: 'none' }
  | { state: 'decoding'; path: string }
  | { state: 'ok'; path: string; buffer: AudioBuffer }
  | { state: 'error'; path: string }

const TITLE_MAX = 100

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function formatDuration(sec: number): string {
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const dialogs = useDialogs()
  const presets = usePresets()
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [audio, setAudio] = useState<Audio>({ state: 'none' })
  const [bpm, setBpm] = useState(120)
  const [chartName, setChartName] = useState('NORMAL')
  const [presetId, setPresetId] = useState(() => defaultPresetId(presets))
  const [parentDir, setParentDir] = useState('')
  const [preview, setPreview] = useState('')
  const [playing, setPlaying] = useState(false)
  const [creating, setCreating] = useState(false)

  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const pickToken = useRef(0)

  const stopPlayback = useCallback(() => {
    const src = sourceRef.current
    sourceRef.current = null
    if (src) {
      src.onended = null
      try {
        src.stop()
      } catch {
        // 이미 멈춘 경우
      }
    }
    setPlaying(false)
  }, [])

  // 열릴 때 초기화, 닫힐 때 재생 정지 + 오디오 컨텍스트 정리
  useEffect(() => {
    if (!open) return
    setTitle('')
    setArtist('')
    setAudio({ state: 'none' })
    setBpm(120)
    setChartName('NORMAL')
    setPresetId(defaultPresetId(getPresets()))
    setPreview('')
    setCreating(false)
    pickToken.current++
    let cancelled = false
    void window.rcm
      .getDefaultProjectDir()
      .then((d) => {
        if (!cancelled) setParentDir(d)
      })
      .catch(() => {
        // 기본 위치를 못 읽으면 비워 두고 사용자가 직접 고르게 한다
      })
    return () => {
      cancelled = true
      pickToken.current++ // 진행 중인 디코딩 결과 무효화
      stopPlayback()
      void ctxRef.current?.close()
      ctxRef.current = null
    }
  }, [open, stopPlayback])

  // 저장 위치 미리보기
  useEffect(() => {
    if (!open || !parentDir || !title.trim()) {
      setPreview('')
      return
    }
    let cancelled = false
    setPreview('') // 새 결과가 올 때까지 이전 경로를 보이지 않는다
    void window.rcm
      .resolveProjectDir(parentDir, title.trim())
      .then((d) => {
        if (!cancelled) setPreview(d)
      })
      .catch(() => {
        if (!cancelled) setPreview('')
      })
    return () => {
      cancelled = true
    }
  }, [open, parentDir, title])

  const pickAudio = async () => {
    const before = pickToken.current
    const path = await window.rcm.pickAudioFile()
    if (!path || before !== pickToken.current) return
    stopPlayback()
    const token = ++pickToken.current
    setAudio({ state: 'decoding', path })
    try {
      const data = await window.rcm.readAudio(path)
      // 읽는 동안 창이 닫혔거나 다른 파일을 골랐다면 컨텍스트를 만들지 않는다
      if (token !== pickToken.current) return
      ctxRef.current ??= new AudioContext()
      const buffer = await ctxRef.current.decodeAudioData(data)
      if (token === pickToken.current) setAudio({ state: 'ok', path, buffer })
    } catch {
      if (token === pickToken.current) setAudio({ state: 'error', path })
    }
  }

  /** 고른 음악을 빼고 음악 없이 만들게 한다. */
  const clearAudio = () => {
    stopPlayback()
    pickToken.current++ // 진행 중인 디코딩 결과 무효화
    setAudio({ state: 'none' })
  }

  const togglePlay = () => {
    if (playing) {
      stopPlayback()
      return
    }
    const ctx = ctxRef.current
    if (!ctx || audio.state !== 'ok') return
    void ctx.resume()
    const src = ctx.createBufferSource()
    src.buffer = audio.buffer
    src.connect(ctx.destination)
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null
        setPlaying(false)
      }
    }
    sourceRef.current = src
    src.start()
    setPlaying(true)
  }

  const changeParent = async () => {
    const dir = await window.rcm.pickFolder(parentDir)
    if (dir) setParentDir(dir)
  }

  // 고른 프리셋이 목록에서 사라졌으면(다시 불러온 경우 등) 처음 선택으로
  const chosenId = presets.some((p) => p.id === presetId) ? presetId : defaultPresetId(presets)
  const preset = presets.find((p) => p.id === chosenId)

  const canCreate =
    !creating &&
    preset !== undefined &&
    title.trim() !== '' &&
    // 음악은 골라도 되고 안 골라도 되지만, 고른 파일은 열 수 있어야 한다
    (audio.state === 'none' || audio.state === 'ok') &&
    bpm > 0 &&
    chartName.trim() !== '' &&
    parentDir !== ''

  const create = async () => {
    if (!canCreate || !preset) return
    setCreating(true)
    stopPlayback()
    try {
      const { dir } = await window.rcm.createProject({
        parentDir,
        title: title.trim(),
        artist: artist.trim(),
        audioPath: audio.state === 'ok' ? audio.path : null,
        bpm,
        chartName: chartName.trim(),
        tracks: presetToChartTracks(preset)
      })
      void setLastPresetId(preset.id).catch(() => {
        // 마지막 선택을 기억하지 못해도 프로젝트는 만들어졌다
      })
      onCreated(dir)
    } catch (err) {
      setCreating(false)
      await dialogs.alert('프로젝트를 만들지 못했어요', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Modal
      open={open}
      title="새 프로젝트"
      onClose={creating ? () => {} : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={creating}>
            취소
          </Button>
          <Button variant="primary" disabled={!canCreate} onClick={() => void create()}>
            {creating ? '만드는 중…' : '만들기'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Row label="프로젝트 이름">
          <TextField
            value={title}
            onChange={(v) => setTitle(v.slice(0, TITLE_MAX))}
            placeholder="곡 제목"
            width={240}
          />
        </Row>
        <Row label="아티스트">
          <TextField value={artist} onChange={setArtist} placeholder="(선택)" width={240} />
        </Row>
        <Row label="음악 파일">
          <span className={styles.fileName} title={audio.state === 'none' ? '' : audio.path}>
            {audio.state === 'none' ? '(선택)' : baseName(audio.path)}
          </span>
          {audio.state !== 'none' && <Button onClick={clearAudio}>빼기</Button>}
          <Button onClick={() => void pickAudio()}>파일 선택</Button>
        </Row>
        {audio.state === 'none' && <div className={styles.hint}>나중에 곡 탭에서 고를 수 있어요</div>}
        {audio.state === 'ok' && (
          <div className={styles.audioInfo}>
            <IconButton
              icon={playing ? Square : Play}
              label={playing ? '정지' : '미리듣기'}
              onClick={togglePlay}
            />
            <span>{formatDuration(audio.buffer.duration)}</span>
          </div>
        )}
        {audio.state === 'decoding' && <div className={styles.hint}>불러오는 중…</div>}
        {audio.state === 'error' && <div className={styles.error}>이 파일은 재생할 수 없어요</div>}
        <Row label="BPM">
          <NumberField value={bpm} onChange={setBpm} min={0.01} max={999} step={1} />
        </Row>
        <div className={styles.hint}>모르면 나중에 탭 BPM으로 잡을 수 있어요</div>
        <Row label="첫 난이도 이름">
          <TextField value={chartName} onChange={setChartName} placeholder="NORMAL" width={140} />
        </Row>
        <PresetPicker presets={presets} value={chosenId} onChange={setPresetId} />
        <Row label="저장 위치">
          <span className={styles.fileName} title={parentDir}>
            {parentDir}
          </span>
          <Button onClick={() => void changeParent()}>변경</Button>
        </Row>
        <div className={styles.pathPreview} title={preview}>
          {preview ? `만들어질 폴더: ${preview}` : ''}
        </div>
      </div>
    </Modal>
  )
}
