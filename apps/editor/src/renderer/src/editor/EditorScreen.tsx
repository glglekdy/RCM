import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelRight } from 'lucide-react'
import { TimingMap } from '@rcm/core'
import { trackForCode, trackForKey } from '@rcm/playfield'
import type { ProjectFiles } from '../../../shared/api'
import { resolveKeymap } from '../../../shared/presets'
import { NewProjectDialog } from '../home/NewProjectDialog'
import { getPresets } from '../presets/presetStore'
import { addMarker, neighborMarkerMs } from './commands/markers'
import { applyRecording, recordingMessage, type RecordSession } from './commands/record'
import { runEditAction } from './commands/editActions'
import { pushTap } from './commands/tap'
import { IconButton, TitleBar, useDialogs, useToast } from '../ui'
import { AudioEngine } from './audio/AudioEngine'
import { inputTimeMs } from './audio/inputTime'
import { hitTimesForChart } from './audio/schedule'
import { computePeaks, type WaveformPeaks } from './audio/waveform'
import { Recorder } from './input/recorder'
import { resolveShortcut, resolveTypingShortcut, type Action } from './input/shortcuts'
import { Minimap } from './minimap/Minimap'
import { RightPanel } from './panels/RightPanel'
import { PlaytestOverlay } from './playtest/PlaytestOverlay'
import { getChart, type ProjectDoc } from './state/doc'
import { isDirty } from './state/dirty'
import { loadProject } from './state/loadProject'
import { EditorStore } from './state/store'
import { StoreContext, useEditor, useStore } from './state/useStore'
import { TimelineCanvas } from './timeline/TimelineCanvas'
import { clampPlayheadMs } from './timeline/view'
import { BottomToolbar } from './toolbar/BottomToolbar'
import styles from './EditorScreen.module.css'

interface EditorScreenProps {
  files: ProjectFiles
  onExit: () => void
  /** 편집 화면에서 다른 프로젝트를 열 때 */
  onOpenProject: (files: ProjectFiles) => void
}

export function EditorScreen({ files, onExit, onOpenProject }: EditorScreenProps) {
  const dialogs = useDialogs()
  const loaded = useMemo(() => loadProject(files), [files])
  const reported = useRef(false)

  useEffect(() => {
    if (loaded.ok || reported.current) return
    reported.current = true
    void dialogs.alert('프로젝트를 열 수 없어요', loaded.errors).then(onExit)
  }, [loaded, dialogs, onExit])

  if (!loaded.ok) return <TitleBar title="RCM" />
  return (
    <LoadedEditor files={files} doc={loaded.doc} onExit={onExit} onOpenProject={onOpenProject} />
  )
}

interface LoadedEditorProps extends EditorScreenProps {
  doc: ProjectDoc
}

function LoadedEditor({ files, doc, onExit, onOpenProject }: LoadedEditorProps) {
  const [store] = useState(() => new EditorStore(files, doc))
  const [engine, setEngine] = useState<AudioEngine | null>(null)
  const dialogs = useDialogs()
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  // 프로젝트마다 오디오 엔진 하나. 디코딩에 실패하면 곡을 열지 않는다 (5.14절)
  useEffect(() => {
    const e = new AudioEngine()
    let cancelled = false
    window.rcm
      .readAudio(files.audioPath)
      .then((data) => e.load(data))
      .then(
        () => {
          if (!cancelled) setEngine(e)
        },
        async (err: unknown) => {
          if (cancelled) return
          await dialogs.alert('오디오를 열 수 없어요', err instanceof Error ? err.message : String(err))
          onExitRef.current()
        }
      )
    return () => {
      cancelled = true
      e.dispose()
    }
  }, [files.audioPath, dialogs])

  // 홈으로 돌아가면 닫기 보호를 해제한다 (닫기 요청 처리는 EditorBody가 한다)
  useEffect(() => () => window.rcm.setDirty(false), [])

  return (
    <StoreContext.Provider value={store}>
      {engine ? (
        <EditorBody engine={engine} onExit={onExit} onOpenProject={onOpenProject} />
      ) : (
        <LoadingBody />
      )}
    </StoreContext.Provider>
  )
}

function LoadingBody() {
  const title = useEditor((s) => s.doc.song.title)
  return (
    <div className={styles.screen}>
      <TitleBar title={title} />
      <div className={styles.main} />
    </div>
  )
}

/** 테스트 플레이에서 시작 위치보다 먼저 재생하는 준비 시간(ms) */
const PLAYTEST_LEAD_IN_MS = 1500

/** 진행 중인 녹음: 누름 기록과 시작할 때 정한 대상 채보·스냅·키 배치 */
interface Recording {
  recorder: Recorder
  session: RecordSession
  /** 트랙 id → 키 code (3.4절) */
  keymap: ReadonlyMap<string, string | null>
}

interface EditorBodyProps {
  engine: AudioEngine
  onExit: () => void
  onOpenProject: (files: ProjectFiles) => void
}

/** 모달·메뉴가 열려 있으면 전역 단축키를 받지 않는다. */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="menu"]') !== null
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

/** 포커스된 입력 필드를 blur해서 고치던 값을 확정(onCommit)한다. 저장·닫기 전에 부른다. */
function commitFocusedField(): void {
  if (document.activeElement instanceof HTMLElement && isTyping(document.activeElement)) {
    document.activeElement.blur()
  }
}

function EditorBody({ engine, onExit, onOpenProject }: EditorBodyProps) {
  const store = useStore()
  const dialogs = useDialogs()
  const toast = useToast()
  const title = useEditor((s) => s.doc.song.title)
  const dirty = useEditor((s) => isDirty(s.doc, s.saved))
  const song = useEditor((s) => s.doc.song)
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))
  const playing = useEditor((s) => s.playing)
  const panelOpen = useEditor((s) => s.panelOpen)
  const [creating, setCreating] = useState(false)

  const tm = useMemo(() => new TimingMap(song.timing, song.offsetMs), [song.timing, song.offsetMs])
  const tmRef = useRef(tm)
  tmRef.current = tm

  // 파형 피크: 첫 화면을 그린 뒤에 계산해서 store 밖에 둔다
  const [peaks, setPeaks] = useState<WaveformPeaks | undefined>()
  useEffect(() => {
    const buffer = engine.decodedBuffer
    if (!buffer) return
    const timer = setTimeout(() => {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i)
      )
      setPeaks(computePeaks(channels, buffer.sampleRate))
    }, 0)
    return () => clearTimeout(timer)
  }, [engine])

  // ---- 재생 ----
  const play = useCallback(() => {
    if (store.getState().playing) return
    // 곡 끝에서 누르면 처음부터 다시 재생한다
    if (store.getState().playheadMs >= engine.durationMs - 1) {
      store.set({ playheadMs: clampPlayheadMs(tmRef.current, -Infinity, engine.durationMs) })
    }
    const s = store.getState()
    engine.setHits(hitTimesForChart(getChart(s.doc, s.activeChart), tmRef.current))
    engine.setHitVolume(s.hitsoundVolume)
    engine.play(s.playheadMs)
    if (engine.playing) store.set({ playing: true })
  }, [engine, store])

  // ---- 녹음 (5.10절) ----
  const recordingRef = useRef<Recording | null>(null)

  /** 녹음을 끝내고 누른 키를 녹음 시작 때의 스냅으로 정렬해 그 채보에 합친다 (Undo 한 번). */
  const finishRecording = useCallback(
    (endMs: number) => {
      const recording = recordingRef.current
      if (!recording) return
      recordingRef.current = null
      const { session } = recording
      const presses = recording.recorder.finish(endMs)
      const result = applyRecording(store.getState().doc, session, tmRef.current, presses)
      store.set({ mode: 'edit' })
      if (result.added > 0) store.apply('녹음', result.doc, session.file)
      toast(recordingMessage(result))
    },
    [store, toast]
  )

  /** 재생을 멈춘다. 녹음 중이면 녹음도 끝낸다. */
  const stop = useCallback(() => {
    if (!store.getState().playing) return
    const pos = engine.stop()
    store.set({ playing: false, playheadMs: pos })
    finishRecording(pos)
  }, [engine, store, finishRecording])

  const record = useCallback(() => {
    const s = store.getState()
    if (s.mode === 'recording') {
      stop()
      return
    }
    if (s.playing) return
    play()
    if (!store.getState().playing) return
    const { keys } = resolveKeymap(getChart(s.doc, s.activeChart).tracks, getPresets())
    recordingRef.current = {
      recorder: new Recorder(keys),
      session: { file: s.activeChart, snap: s.snap },
      keymap: keys
    }
    store.set({ mode: 'recording' })
  }, [play, stop, store])

  // ---- 테스트 플레이 (5.11절) ----
  /** 테스트 플레이의 판정 시작 위치. null이면 테스트 플레이 중이 아니다. */
  const [playtestFromMs, setPlaytestFromMs] = useState<number | null>(null)
  /** 끝나면 돌아갈 재생선 위치 */
  const playtestReturnRef = useRef(0)

  const startPlaytest = useCallback(
    (fromStart: boolean) => {
      if (store.getState().mode !== 'edit') return
      stop()
      const s = store.getState()
      const first = getChart(s.doc, s.activeChart).notes[0]
      const fromMs = fromStart
        ? Math.min(0, first ? tmRef.current.tickToMs(first.tick) : 0)
        : s.playheadMs
      // 효과음 없이, 준비 시간을 두고 재생한다 (음수 위치는 AudioEngine이 지연으로 처리)
      engine.setHits([])
      engine.play(fromMs - PLAYTEST_LEAD_IN_MS)
      if (!engine.playing) return
      // 툴바 버튼에 포커스가 남아 Enter 등으로 눌리지 않게 한다
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      playtestReturnRef.current = s.playheadMs
      setPlaytestFromMs(fromMs)
      store.set({ mode: 'playtest' })
    },
    [engine, store, stop]
  )

  /** 테스트 플레이를 끝내고 재생선을 시작 전 위치로 돌린다. 결과는 저장하지 않는다. */
  const exitPlaytest = useCallback(() => {
    if (store.getState().mode !== 'playtest') return
    engine.stop()
    const s = store.getState()
    engine.setHits(hitTimesForChart(getChart(s.doc, s.activeChart), tmRef.current))
    setPlaytestFromMs(null)
    store.set({ mode: 'edit', playing: false, playheadMs: playtestReturnRef.current })
  }, [engine, store])

  const getTimeMs = useCallback(() => engine.positionMs(), [engine])

  useEffect(() => {
    engine.onEnded(() => {
      if (store.getState().mode === 'playtest') {
        exitPlaytest()
        return
      }
      store.set({ playing: false, playheadMs: engine.durationMs })
      finishRecording(engine.durationMs)
    })
  }, [engine, store, finishRecording, exitPlaytest])

  // 재생 중에는 화면 프레임마다 오디오 시계를 읽어 재생선을 옮긴다
  useEffect(() => {
    if (!playing) return
    let id = 0
    const loop = () => {
      if (engine.playing) store.set({ playheadMs: engine.positionMs() })
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [playing, engine, store])

  const hitsoundVolume = useEditor((s) => s.hitsoundVolume)
  useEffect(() => {
    engine.setHitVolume(hitsoundVolume)
  }, [engine, hitsoundVolume])

  // 재생 중 채보·타이밍이 바뀌면 효과음 예약을 다시 계산한다
  useEffect(() => {
    if (engine.playing) engine.setHits(hitTimesForChart(chart, tm))
  }, [chart, tm, engine])

  // ---- 파일 ----
  const save = useCallback(async () => {
    // 입력 중인 필드 값까지 저장한다
    commitFocusedField()
    try {
      await store.save()
      toast('저장했어요')
    } catch (err) {
      await dialogs.alert('저장하지 못했어요', err instanceof Error ? err.message : String(err))
    }
  }, [store, toast, dialogs])

  /**
   * 이 프로젝트를 떠나도(창을 닫아도) 되는지 묻는다. 입력 중인 필드를 확정하고 녹음·테스트 플레이를
   * 끝낸 뒤(녹음한 노트도 변경에 들어간다) 저장 안 된 변경이 있으면 저장/버리기/취소.
   */
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    commitFocusedField()
    if (store.getState().mode === 'playtest') exitPlaytest()
    else stop()
    if (!store.isDirty()) return true
    const choice = await dialogs.choose({
      title: '저장하지 않은 변경',
      message: '변경 내용을 저장할까요?',
      choices: [
        { value: 'save', label: '저장', variant: 'primary' },
        { value: 'discard', label: '저장 안 함', variant: 'danger' },
        { value: 'cancel', label: '취소' }
      ]
    })
    if (choice === 'discard') return true
    if (choice !== 'save') return false
    try {
      await store.save()
      return true
    } catch (err) {
      await dialogs.alert('저장하지 못했어요', err instanceof Error ? err.message : String(err))
      return false
    }
  }, [stop, exitPlaytest, store, dialogs])

  // 창 닫기: main은 닫기 보호(저장 안 된 변경·녹음 중·입력 중)가 켜져 있으면 닫지 않고 물어본다
  const closing = useRef(false)
  useEffect(
    () =>
      window.rcm.onCloseRequested(async () => {
        if (closing.current) return
        closing.current = true
        try {
          if (await confirmLeave()) window.rcm.forceClose()
          else window.rcm.closeCancelled()
        } finally {
          closing.current = false
        }
      }),
    [confirmLeave]
  )

  // 입력 필드에 포커스가 있는 동안에도 닫기 보호를 켠다 (확정 안 된 값이 있을 수 있다)
  useEffect(() => {
    const update = (focused: EventTarget | null) => {
      const fieldFocused = isTyping(focused)
      if (store.getState().fieldFocused !== fieldFocused) store.set({ fieldFocused })
    }
    const onFocusIn = (e: FocusEvent) => update(e.target)
    const onFocusOut = (e: FocusEvent) => update(e.relatedTarget)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [store])

  const openDir = useCallback(
    async (dir: string) => {
      try {
        onOpenProject(await window.rcm.openProject(dir))
      } catch (err) {
        await dialogs.alert('프로젝트를 열 수 없어요', err instanceof Error ? err.message : String(err))
      }
    },
    [onOpenProject, dialogs]
  )

  const newProject = useCallback(async () => {
    if (await confirmLeave()) setCreating(true)
  }, [confirmLeave])

  const openProject = useCallback(async () => {
    if (!(await confirmLeave())) return
    const dir = await window.rcm.pickFolder()
    if (dir) await openDir(dir)
  }, [confirmLeave, openDir])

  const goHome = useCallback(async () => {
    if (await confirmLeave()) onExit()
  }, [confirmLeave, onExit])

  const selectChart = useCallback(
    (file: string) => {
      stop()
      store.set({ activeChart: file, selection: new Set() })
    },
    [stop, store]
  )

  // ---- 단축키 ----
  const runAction = (action: Action) => {
    if (typeof action === 'object') {
      store.set({ snap: action.division })
      return
    }
    switch (action) {
      case 'playPause':
        if (store.getState().playing) stop()
        else play()
        break
      case 'stop':
        if (store.getState().mode === 'playtest') exitPlaytest()
        else stop()
        break
      case 'record':
        record()
        break
      case 'playtestHere':
        startPlaytest(false)
        break
      case 'playtestStart':
        startPlaytest(true)
        break
      case 'save':
        void save()
        break
      case 'undo':
        // 다른 난이도로 전환될 수 있으므로 재생을 먼저 멈춘다
        stop()
        store.undo()
        break
      case 'redo':
        stop()
        store.redo()
        break
      case 'copy':
      case 'cut':
      case 'paste':
      case 'delete':
      case 'mirror': {
        const message = runEditAction(store, action, tmRef.current)
        if (message) toast(message)
        break
      }
      case 'tap': {
        const st = store.getState()
        if (!st.playing) break
        const ms = inputTimeMs(engine, st.playheadMs)
        store.set({ taps: pushTap(st.taps, ms), panelOpen: true, panelTab: 'timing' })
        break
      }
      case 'marker': {
        const st = store.getState()
        store.apply('마커 추가', addMarker(st.doc, inputTimeMs(engine, st.playheadMs)))
        break
      }
      case 'toolDraw':
        store.set({ tool: 'draw' })
        break
      case 'toolErase':
        store.set({ tool: 'erase' })
        break
      case 'toolSelect':
        store.set({ tool: 'select' })
        break
      case 'markerPrev':
      case 'markerNext': {
        const st = store.getState()
        if (st.playing) break
        const dir = action === 'markerNext' ? 1 : -1
        const ms = neighborMarkerMs(st.doc.editorData.markers, st.playheadMs, dir)
        if (ms !== null) store.set({ playheadMs: ms })
        break
      }
      default:
        // 나머지는 이후 Task에서 연결한다
        break
    }
  }
  const runActionRef = useRef(runAction)
  runActionRef.current = runAction

  useEffect(() => {
    /** 녹음 중이면 진행 중인 녹음. */
    const activeRecording = (): Recording | null =>
      store.getState().mode === 'recording' ? recordingRef.current : null
    /** 입력을 처리하는 지금의 오디오 시계 (탭·마커와 같은 시계) */
    const now = () => inputTimeMs(engine, store.getState().playheadMs)
    const onKeyDown = (e: KeyboardEvent) => {
      if (overlayOpen()) return
      // 입력 필드에서는 Ctrl+S(필드를 확정하고 저장)와 Esc만 받는다
      const typing = isTyping(e.target)
      const rec = typing ? null : activeRecording()
      // Ctrl/Alt/Meta 조합(Ctrl+S 등)은 트랙 키로 치지 않는다
      if (rec && trackForKey(rec.keymap, e) !== null) {
        // 키 반복(e.repeat)은 Recorder가 무시한다
        e.preventDefault()
        rec.recorder.keyDown(e.code, now())
        return
      }
      const input = { code: e.code, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }
      const mode = store.getState().mode
      const action = typing ? resolveTypingShortcut(input, mode) : resolveShortcut(input, mode)
      if (!action) return
      // 포커스된 버튼이 Space/Enter로 눌리는 기본 동작과 겹치지 않게 막는다
      e.preventDefault()
      if (e.repeat && action !== 'undo' && action !== 'redo') return
      runActionRef.current(action)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const rec = activeRecording()
      if (rec && trackForCode(rec.keymap, e.code) !== null) {
        e.preventDefault()
        rec.recorder.keyUp(e.code, now())
        return
      }
      // 버튼은 Space를 뗄 때 클릭되므로 keyup도 막는다
      if (e.code === 'Space' && !overlayOpen() && !isTyping(e.target)) e.preventDefault()
    }
    // 창이 포커스를 잃으면 keyup이 오지 않으므로 눌린 키를 모두 뗀 것으로 한다
    const onBlur = () => recordingRef.current?.recorder.releaseAll(now())
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [store, engine])

  return (
    <div className={styles.screen}>
      <TitleBar title={title} dirty={dirty} />
      <div className={styles.main}>
        <div className={styles.timeline}>
          <TimelineCanvas
            tm={tm}
            durationMs={engine.durationMs}
            peaks={peaks}
            recordingRef={recordingRef}
          />
          {!panelOpen && (
            <div className={styles.panelToggle}>
              <IconButton
                icon={PanelRight}
                label="패널 펼치기"
                onClick={() => store.set({ panelOpen: true })}
              />
            </div>
          )}
        </div>
        <Minimap tm={tm} durationMs={engine.durationMs} />
        {panelOpen && <RightPanel />}
      </div>
      <BottomToolbar
        onSelectChart={selectChart}
        onPlayPause={() => runAction('playPause')}
        onRecord={() => runAction('record')}
        onPlaytest={() => runAction('playtestHere')}
        onNewProject={() => void newProject()}
        onOpenProject={() => void openProject()}
        onSave={() => void save()}
        onHome={() => void goHome()}
      />
      {playtestFromMs !== null && (
        <PlaytestOverlay
          fromMs={playtestFromMs}
          tm={tm}
          getTimeMs={getTimeMs}
          onExit={exitPlaytest}
        />
      )}
      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(dir) => {
          setCreating(false)
          void openDir(dir)
        }}
      />
    </div>
  )
}
