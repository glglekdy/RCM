import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen, House, Plus, Search } from 'lucide-react'
import type { ProjectFiles, RecentProject } from '../../../shared/api'
import { Button, TextField, useDialogs } from '../ui'
import { NewProjectDialog } from './NewProjectDialog'
import { RecentTable } from './RecentTable'
import styles from './HomeScreen.module.css'

interface HomeScreenProps {
  onOpened: (files: ProjectFiles) => void
}

export function HomeScreen({ onOpened }: HomeScreenProps) {
  const dialogs = useDialogs()
  const [recent, setRecent] = useState<RecentProject[] | null>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    const list = await window.rcm.getRecentProjects()
    setRecent([...list].sort((a, b) => b.lastOpened - a.lastOpened))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openDir = useCallback(
    async (dir: string) => {
      try {
        onOpened(await window.rcm.openProject(dir))
      } catch (err) {
        await dialogs.alert('프로젝트를 열 수 없어요', err instanceof Error ? err.message : String(err))
        void refresh()
      }
    },
    [dialogs, onOpened, refresh]
  )

  const removeFromList = useCallback(
    async (p: RecentProject) => {
      await window.rcm.removeRecentProject(p.dir)
      await refresh()
    },
    [refresh]
  )

  const openRecent = async (p: RecentProject) => {
    if (p.missing) {
      const ok = await dialogs.confirm({
        title: '프로젝트를 찾을 수 없어요',
        message: '목록에서 제거할까요?',
        confirmLabel: '제거',
        danger: true
      })
      if (ok) await removeFromList(p)
      return
    }
    await openDir(p.dir)
  }

  const pickAndOpen = async () => {
    const dir = await window.rcm.pickFolder()
    if (dir) await openDir(dir)
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!recent || !q) return recent ?? []
    return recent.filter((p) => p.title.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q))
  }, [recent, query])

  return (
    <div className={styles.home}>
      <aside className={styles.sidebar}>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> 새 프로젝트
        </Button>
        <Button variant="ghost" onClick={() => void pickAndOpen()}>
          <FolderOpen size={16} /> 프로젝트 열기
        </Button>
        <div className={styles.divider} />
        <div className={styles.navItem}>
          <House size={16} /> 홈
        </div>
      </aside>
      <main className={styles.main}>
        <h1 className={styles.welcome}>RCM 채보 에디터</h1>
        {recent !== null && recent.length === 0 ? (
          <div className={styles.empty}>
            <p>새 프로젝트를 만들어 보세요</p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> 새 프로젝트
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.listHead}>
              <h2 className={styles.sectionTitle}>최근 프로젝트</h2>
              <div className={styles.search}>
                <Search size={14} className={styles.searchIcon} />
                <TextField value={query} onChange={setQuery} placeholder="검색" />
              </div>
            </div>
            {recent !== null && (
              <RecentTable
                projects={shown}
                onOpen={(p) => void openRecent(p)}
                onShowInExplorer={(p) =>
                  void window.rcm.showInExplorer(p.dir).catch(async (err: unknown) => {
                    await dialogs.alert(
                      '탐색기에서 열 수 없어요',
                      err instanceof Error ? err.message : String(err)
                    )
                  })
                }
                onRemove={(p) => void removeFromList(p)}
              />
            )}
          </>
        )}
      </main>
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
