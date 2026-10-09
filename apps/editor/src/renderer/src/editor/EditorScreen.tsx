import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelRight } from 'lucide-react'
import { snapTick, TimingMap } from '@rcm/core'
import type { ProjectFiles } from '../../../shared/api'
import { NewProjectDialog } from '../home/NewProjectDialog'
import { addMarker, neighborMarkerMs } from './commands/markers'
import { copyNotes, mirrorNotes, pasteClip, removeNotes } from './commands/notes'
import { pushTap } from './commands/tap'
import { IconButton, TitleBar, useDialogs, useToast } from '../ui'
import { AudioEngine } from './audio/AudioEngine'
import { hitTimesForChart } from './audio/schedule'
import { resolveShortcut, type Action } from './input/shortcuts'
import { RightPanel } from './panels/RightPanel'
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
  const closing = useRef(false)
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

  useEffect(() => {
    const off = window.rcm.onCloseRequested(async () => {
      if (closing.current) return
      closing.current = true
      try {
        const choice = await dialogs.choose({
          title: '저장하지 않은 변경',
          message: '변경 내용을 저장할까요?',
          choices: [
            { value: 'save', label: '저장', variant: 'primary' },
            { value: 'discard', label: '저장 안 함', variant: 'danger' },
            { value: 'cancel', label: '취소' }
          ]
        })
        if (choice === 'discard') {
          window.rcm.forceClose()
        } else if (choice === 'save') {
          try {
            await store.save()
            window.rcm.forceClose()
          } catch (err) {
            await dialogs.alert('저장하지 못했어요', err instanceof Error ? err.message : String(err))
          }
        }
      } finally {
        closing.current = false
      }
    })
    return () => {
      off()
      // 홈으로 돌아가면 닫기 보호를 해제한다
      window.rcm.setDirty(false)
    }
  }, [dialogs, store])

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

  const stop = useCallback(() => {
    if (!store.getState().playing) return
    store.set({ playing: false, playheadMs: engine.stop() })
  }, [engine, store])

  useEffect(() => {
    engine.onEnded(() => store.set({ playing: false, playheadMs: engine.durationMs }))
  }, [engine, store])

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
    try {
      await store.save()
      toast('저장했어요')
    } catch (err) {
      await dialogs.alert('저장하지 못했어요', err instanceof Error ? err.message : String(err))
    }
  }, [store, toast, dialogs])

  /** 이 프로젝트를 떠나도 되는지 묻는다. 저장 안 된 변경이 있으면 저장/버리기/취소. */
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    stop()
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
  }, [stop, store, dialogs])

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

  // ---- 노트 편집 ----
  const copy = (): boolean => {
    const s = store.getState()
    const clip = copyNotes(getChart(s.doc, s.activeChart), s.selection)
    if (!clip) return false
    store.set({ clipboard: clip })
    toast(`${clip.notes.length}개 복사`)
    return true
  }

  const removeSelected = (label: string) => {
    const s = store.getState()
    if (store.apply(label, removeNotes(s.doc, s.activeChart, s.selection), s.activeChart)) {
      store.set({ selection: new Set() })
    }
  }

  const paste = () => {
    const s = store.getState()
    if (!s.clipboard) return
    const tm = tmRef.current
    const atTick = snapTick(tm, Math.max(0, Math.round(tm.msToTick(s.playheadMs))), s.snap)
    const pasted = pasteClip(s.doc, s.activeChart, s.clipboard, atTick)
    if (!pasted) {
      toast('여기에는 붙여넣을 수 없어요 (겹치거나 레인 수가 달라요)')
      return
    }
    store.apply('붙여넣기', pasted.doc, s.activeChart)
    store.set({ selection: pasted.keys })
  }

  const mirror = () => {
    const s = store.getState()
    const mirrored = mirrorNotes(s.doc, s.activeChart, s.selection)
    if (mirrored && store.apply('좌우 반전', mirrored.doc, s.activeChart)) {
      store.set({ selection: mirrored.keys })
    }
  }

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
        stop()
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
        copy()
        break
      case 'cut':
        if (copy()) removeSelected('잘라내기')
        break
      case 'paste':
        paste()
        break
      case 'delete':
        removeSelected('노트 삭제')
        break
      case 'mirror':
        mirror()
        break
      case 'tap': {
        const st = store.getState()
        if (!st.playing) break
        store.set({ taps: pushTap(st.taps, st.playheadMs), panelOpen: true, panelTab: 'timing' })
        break
      }
      case 'marker': {
        const st = store.getState()
        store.apply('마커 추가', addMarker(st.doc, st.playheadMs))
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (overlayOpen()) return
      if (isTyping(e.target) && e.code !== 'Escape') return
      const action = resolveShortcut(
        { code: e.code, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey },
        store.getState().mode
      )
      if (!action) return
      // 포커스된 버튼이 Space/Enter로 눌리는 기본 동작과 겹치지 않게 막는다
      e.preventDefault()
      if (e.repeat && action !== 'undo' && action !== 'redo') return
      runActionRef.current(action)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      // 버튼은 Space를 뗄 때 클릭되므로 keyup도 막는다
      if (e.code === 'Space' && !overlayOpen() && !isTyping(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [store])

  return (
    <div className={styles.screen}>
      <TitleBar title={title} dirty={dirty} />
      <div className={styles.main}>
        <div className={styles.timeline}>
          <TimelineCanvas tm={tm} durationMs={engine.durationMs} />
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
        {panelOpen && <RightPanel />}
      </div>
      <BottomToolbar
        onSelectChart={selectChart}
        onPlayPause={() => runAction('playPause')}
        onNewProject={() => void newProject()}
        onOpenProject={() => void openProject()}
        onSave={() => void save()}
        onHome={() => void goHome()}
      />
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
