import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  BookOpen,
  Bot,
  FileArchive,
  FolderOpen,
  House,
  Megaphone,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  X,
  type LucideIcon
} from 'lucide-react'
import type { ProjectFiles, RecentProject } from '../../../shared/api'
import { AiGuidePage } from '../guide/AiGuidePage'
import { AI_GUIDE_NOTICE_ID } from '../guide/chartFormatGuide'
import { UserGuidePage } from '../guide/UserGuidePage'
import { PresetsPage } from '../presets/PresetsPage'
import { SettingsPage } from '../settings/SettingsPage'
import { UpdatePanel } from '../update/UpdatePanel'
import { Button, IconButton, TextField, useDialogs, useToast } from '../ui'
import { nextGreeting } from './greeting'
import { importZips } from './importZips'
import { NewProjectDialog } from './NewProjectDialog'
import { RecentTable } from './RecentTable'
import styles from './HomeScreen.module.css'

type Page = 'home' | 'presets' | 'userGuide' | 'aiGuide' | 'settings'

/** 사이드바 항목 높이 + 간격 (px). 선택 표시가 이만큼씩 움직인다 */
const NAV_STEP = 34 + 8

const NAV: { page: Page; icon: LucideIcon; label: string }[] = [
  { page: 'home', icon: House, label: '홈' },
  { page: 'presets', icon: SlidersHorizontal, label: '트랙 프리셋' },
  { page: 'userGuide', icon: BookOpen, label: '유저 가이드' },
  { page: 'aiGuide', icon: Bot, label: 'AI 가이드' },
  { page: 'settings', icon: Settings, label: '설정' }
]

interface HomeScreenProps {
  onOpened: (files: ProjectFiles) => void
}

export function HomeScreen({ onOpened }: HomeScreenProps) {
  const dialogs = useDialogs()
  const toast = useToast()
  const [recent, setRecent] = useState<RecentProject[] | null>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState<Page>('home')
  const [drop, setDrop] = useState<'none' | 'over' | 'importing'>('none')
  // 닫은 공지 id 목록. 읽기 전(null)에는 공지도 알림도 그리지 않는다: 닫아 둔 것이 잠깐 보였다 사라지지 않게
  const [dismissed, setDismissed] = useState<string[] | null>(null)
  // 자식 요소를 지날 때도 dragenter/dragleave가 오므로 깊이를 센다
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    const list = await window.rcm.getRecentProjects()
    setRecent([...list].sort((a, b) => b.lastOpened - a.lastOpened))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let alive = true
    void window.rcm
      .getDismissedNotices()
      .catch(() => [])
      .then((ids) => alive && setDismissed(ids))
    return () => {
      alive = false
    }
  }, [])

  const isNew = (id: string) => dismissed !== null && !dismissed.includes(id)

  const dismiss = (id: string) => {
    setDismissed((list) => (list === null || list.includes(id) ? list : [...list, id]))
    void window.rcm.dismissNotice(id).catch(() => {})
  }

  const goTo = (p: Page) => {
    setPage(p)
    if (p === 'aiGuide' && isNew(AI_GUIDE_NOTICE_ID)) dismiss(AI_GUIDE_NOTICE_ID)
  }

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

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e) || drop === 'importing') return
    dragDepth.current++
    setDrop('over')
  }

  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e) || drop === 'importing') return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDrop('none')
  }

  /** 끌어다 놓은 프로젝트 ZIP을 풀어 최근 목록에 등록한다 (열지는 않는다) */
  const onDrop = async (e: DragEvent) => {
    dragDepth.current = 0
    if (drop === 'importing') return
    const files = [...e.dataTransfer.files]
    if (files.length === 0) {
      setDrop('none')
      return
    }
    setDrop('importing')
    const result = await importZips(files, window.rcm)
    setDrop('none')
    setPage('home')
    setQuery('')
    await refresh()
    if (result.failed.length > 0) {
      await dialogs.alert(
        result.imported > 0
          ? `프로젝트 ${result.imported}개를 가져왔지만, 가져오지 못한 파일이 있어요`
          : '프로젝트를 가져오지 못했어요',
        result.failed
      )
    } else {
      toast(`프로젝트 ${result.imported}개를 가져왔어요`)
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!recent || !q) return recent ?? []
    return recent.filter((p) => p.title.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q))
  }, [recent, query])

  return (
    <div
      className={styles.home}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      <aside className={styles.sidebar}>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> 새 프로젝트
        </Button>
        <Button variant="ghost" onClick={() => void pickAndOpen()}>
          <FolderOpen size={16} /> 프로젝트 열기
        </Button>
        <div className={styles.divider} />
        <nav className={styles.nav}>
          {/* 선택 표시: 누른 항목으로 미끄러지듯 옮겨 간다 */}
          <span
            className={styles.navIndicator}
            style={{ transform: `translateY(${NAV.findIndex((n) => n.page === page) * NAV_STEP}px)` }}
            aria-hidden
          />
          {NAV.map(({ page: p, icon: Icon, label }) => (
            <button
              key={p}
              type="button"
              className={`${styles.navItem} ${page === p ? styles.navActive : ''}`}
              aria-current={page === p}
              onClick={() => goTo(p)}
            >
              <Icon size={16} /> {label}
              {p === 'aiGuide' && isNew(AI_GUIDE_NOTICE_ID) && (
                <span className={`${styles.navBadge} enter-fade`} title="가이드가 바뀌었어요" aria-label="새 내용" />
              )}
            </button>
          ))}
        </nav>
        <UpdatePanel />
      </aside>
      <main className={styles.main}>
        {page === 'presets' ? (
          <PresetsPage />
        ) : page === 'userGuide' ? (
          <UserGuidePage />
        ) : page === 'aiGuide' ? (
          <AiGuidePage />
        ) : page === 'settings' ? (
          <SettingsPage />
        ) : (
          <div className={`${styles.homeContent} stagger-children`}>
            {isNew(RULE_NOTICE_ID) && <RuleNotice onClose={() => dismiss(RULE_NOTICE_ID)} />}
            <Greeting />
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
          </div>
        )}
      </main>
      {drop !== 'none' && (
        <div className={`${styles.dropOverlay} enter-fade`} aria-live="polite">
          <div className={`${styles.dropBox} enter-pop`}>
            <FileArchive size={36} />
            <p className={styles.dropTitle}>
              {drop === 'importing' ? '프로젝트를 가져오는 중…' : '놓으면 프로젝트를 가져와요'}
            </p>
            <p className={styles.dropHint}>프로젝트 폴더를 압축한 ZIP 파일 · 여러 개도 돼요</p>
          </div>
        </div>
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

/** 홈 페이지가 보일 때마다 새로 마운트되어 문구를 다시 고른다. */
function Greeting() {
  const [text] = useState(nextGreeting)
  return <h1 className={styles.welcome}>{text}</h1>
}

/** 닫으면 설정에 저장한다. 새 규정을 다시 띄우려면 id를 바꾼다 */
const RULE_NOTICE_ID = 'made-with-rcm'

/** 홈 맨 위의 사용 규정 안내. 닫으면 다시 보이지 않는다 (AI 가이드에는 늘 보인다) */
function RuleNotice({ onClose }: { onClose: () => void }) {
  return (
    <section className={`${styles.notice} enter-fade`}>
      <div className={styles.noticeClose}>
        <IconButton icon={X} label="공지 닫기" onClick={onClose} />
      </div>
      <h2 className={styles.noticeTitle}>
        <Megaphone size={16} /> 새로운 규정!
      </h2>
      <p className={styles.noticeText}>
        만약 RCM 채보 프로그램을 통해서 새로운 게임을 만드실 예정 혹은 만드셨다면 크레딧에{' '}
        <b>Made with RCM</b>를 넣어주세요
      </p>
      <p className={styles.noticeText}>
        크레딧에는 누르면 <code>https://github.com/glglekdy/RCM/tags</code>로 이동하는 <b>Made with RCM</b> 버튼으로 넣어주세요
      </p>
    </section>
  )
}
