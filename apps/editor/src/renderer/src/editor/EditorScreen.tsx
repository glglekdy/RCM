import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectFiles } from '../../../shared/api'
import { TitleBar, useDialogs } from '../ui'
import type { ProjectDoc } from './state/doc'
import { isDirty } from './state/dirty'
import { loadProject } from './state/loadProject'
import { EditorStore } from './state/store'
import { StoreContext, useEditor } from './state/useStore'

interface EditorScreenProps {
  files: ProjectFiles
  onExit: () => void
}

export function EditorScreen({ files, onExit }: EditorScreenProps) {
  const dialogs = useDialogs()
  const loaded = useMemo(() => loadProject(files), [files])
  const reported = useRef(false)

  useEffect(() => {
    if (loaded.ok || reported.current) return
    reported.current = true
    void dialogs.alert('프로젝트를 열 수 없어요', loaded.errors).then(onExit)
  }, [loaded, dialogs, onExit])

  if (!loaded.ok) return <TitleBar title="RCM" />
  return <LoadedEditor files={files} doc={loaded.doc} />
}

function LoadedEditor({ files, doc }: { files: ProjectFiles; doc: ProjectDoc }) {
  const [store] = useState(() => new EditorStore(files, doc))
  const dialogs = useDialogs()
  const closing = useRef(false)

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
      <EditorBody />
    </StoreContext.Provider>
  )
}

function EditorBody() {
  const title = useEditor((s) => s.doc.song.title)
  const dirty = useEditor((s) => isDirty(s.doc, s.saved))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar title={title} dirty={dirty} />
      <div style={{ flex: 1 }} />
    </div>
  )
}
