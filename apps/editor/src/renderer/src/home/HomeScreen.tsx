import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ArrowDownUp,
  FileArchive,
  FolderOpen,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { ProjectFiles, RecentProject, TrashFailure } from '../../../shared/api'
import { AiGuidePage } from '../guide/AiGuidePage'
import { AI_GUIDE_NOTICE_ID } from '../guide/chartFormatGuide'
import { UserGuidePage } from '../guide/UserGuidePage'
import { PresetsPage } from '../presets/PresetsPage'
import { SettingsPage } from '../settings/SettingsPage'
import { UpdatePanel } from '../update/UpdatePanel'
import { Button, IconButton, Menu, TextField, useDialogs, useLayoutMode, useToast } from '../ui'
import { caps, deleteCopy } from '../ui/platform'
import { FloatingTabBar } from './FloatingTabBar'
import { nextGreeting } from './greeting'
import { NAV, type Page } from './homeNav'
import { importZips, ipcErrorMessage } from './importZips'
import { NewProjectDialog } from './NewProjectDialog'
import { RecentTable } from './RecentTable'
import { PROJECT_SORTS, sortProjects, type ProjectSort } from './sortProjects'
import { readStorageUsage } from './storageUsage'
import styles from './HomeScreen.module.css'

/** 사이드바 항목 높이 + 간격 (px). 선택 표시가 이만큼씩 움직인다 */
const NAV_STEP = 34 + 8

/** 새 내용 표시가 없을 때 쓰는 빈 집합 (매번 새로 만들지 않게) */
const NO_BADGES: ReadonlySet<Page> = new Set()
const AI_GUIDE_BADGE: ReadonlySet<Page> = new Set<Page>(['aiGuide'])

interface HomeScreenProps {
  onOpened: (files: ProjectFiles) => void
}

export function HomeScreen({ onOpened }: HomeScreenProps) {
  const dialogs = useDialogs()
  const phone = useLayoutMode() !== 'desktop'
  const toast = useToast()
  const [recent, setRecent] = useState<RecentProject[] | null>(null)
  /** 저장소 사용량 문구. 측정할 수 없는 환경(PC)이면 null */
  const [usage, setUsage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>('recent')
  // 삭제 모드에서 고른 프로젝트 폴더들. null이면 삭제 모드가 아니다
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [creating, setCreating] = useState(false)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const [page, setPage] = useState<Page>('home')
  const [drop, setDrop] = useState<'none' | 'over' | 'importing'>('none')
  // 닫은 공지 id 목록. 읽기 전(null)에는 공지도 알림도 그리지 않는다: 닫아 둔 것이 잠깐 보였다 사라지지 않게
  const [dismissed, setDismissed] = useState<string[] | null>(null)
  // 자식 요소를 지날 때도 dragenter/dragleave가 오므로 깊이를 센다
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    setRecent(await window.rcm.getRecentProjects())
    // 사용량은 못 읽어도 목록은 그대로 보인다
    if (!caps().windowControls) void readStorageUsage().then(setUsage)
  }, [])

  // 홈으로 돌아오거나 창으로 돌아올 때마다 다시 읽는다: 탐색기에서 폴더를 옮기거나 지운 것이 바로 보이게
  useEffect(() => {
    if (page !== 'home') return
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [page, refresh])

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

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    writeSidebarCollapsed(next)
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
      try {
        await window.rcm.removeRecentProject(p.dir)
      } catch (err) {
        await dialogs.alert('목록에서 제거할 수 없어요', err instanceof Error ? err.message : String(err))
      }
      await refresh()
    },
    [dialogs, refresh]
  )

  /** 찾을 수 없는 프로젝트를 옮겨 간 폴더에 다시 연결한다 */
  const relink = async (p: RecentProject) => {
    const dir = await window.rcm.pickFolder()
    if (!dir) return
    try {
      await window.rcm.relinkRecentProject(p.dir, dir)
      toast('프로젝트를 다시 연결했어요')
    } catch (err) {
      await dialogs.alert('다시 연결할 수 없어요', err instanceof Error ? err.message : String(err))
    }
    await refresh()
  }

  const openRecent = async (p: RecentProject) => {
    if (p.missing) {
      const canRelink = caps().chooseProjectFolder
      const choice = await dialogs.choose({
        title: '프로젝트를 찾을 수 없어요',
        message: canRelink
          ? `${p.dir}\n폴더가 옮겨졌다면 다시 연결하고, 아니면 목록에서 제거하세요.`
          : `${p.dir}\n목록에서 제거할 수 있어요.`,
        choices: [
          { value: 'cancel', label: '취소' },
          { value: 'remove', label: '목록에서 제거', variant: 'danger' },
          ...(canRelink ? [{ value: 'relink', label: '다시 연결', variant: 'primary' as const }] : [])
        ]
      })
      if (choice === 'remove') await removeFromList(p)
      else if (choice === 'relink') await relink(p)
      return
    }
    await openDir(p.dir)
  }

  const pickAndOpen = async () => {
    const dir = await window.rcm.pickFolder()
    if (dir) await openDir(dir)
  }

  /** 대화상자에서 고른 프로젝트 ZIP을 풀어 최근 목록에 등록한다 (열지는 않는다) */
  const pickAndImportZip = async () => {
    let zipPath: string | null
    try {
      zipPath = await window.rcm.pickProjectZip()
    } catch (err) {
      await dialogs.alert('프로젝트를 가져오지 못했어요', ipcErrorMessage(err))
      return
    }
    if (!zipPath) return
    try {
      await window.rcm.importProjectZip(zipPath)
      toast('프로젝트를 가져왔어요')
    } catch (err) {
      await dialogs.alert('프로젝트를 가져오지 못했어요', ipcErrorMessage(err))
    }
    setPage('home')
    setQuery('')
    await refresh()
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
    const found = q
      ? (recent ?? []).filter((p) => p.title.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q))
      : (recent ?? [])
    return sortProjects(found, sort)
  }, [recent, query, sort])

  // 검색으로 가려진 프로젝트는 고른 것으로 치지 않는다 (보이지 않는 것을 지우지 않게)
  const picked = selected ? shown.filter((p) => selected.has(p.dir)) : []
  const allPicked = shown.length > 0 && picked.length === shown.length

  const toggleSelected = (p: RecentProject) =>
    setSelected((s) => {
      if (!s) return s
      const next = new Set(s)
      if (!next.delete(p.dir)) next.add(p.dir)
      return next
    })

  const trashPicked = async () => {
    const n = picked.length
    if (n === 0) return
    const trash = caps().trash
    const copy = deleteCopy(trash, n)
    const ok = await dialogs.confirm({
      title: copy.title,
      message: copy.message,
      confirmLabel: copy.confirm,
      danger: true
    })
    if (!ok) return
    let failed: TrashFailure[]
    try {
      failed = await window.rcm.trashProjects(picked.map((p) => p.dir))
    } catch (err) {
      await dialogs.alert('프로젝트를 삭제하지 못했어요', err instanceof Error ? err.message : String(err))
      return
    } finally {
      await refresh()
    }
    setSelected(null)
    if (failed.length > 0) {
      await dialogs.alert(
        n > failed.length
          ? `프로젝트 ${n - failed.length}개를 삭제했지만, 삭제하지 못한 프로젝트가 있어요`
          : '프로젝트를 삭제하지 못했어요',
        failed.map((f) => `${f.dir}: ${f.error}`)
      )
    } else {
      toast(trash ? `프로젝트 ${n}개를 휴지통으로 보냈어요` : `프로젝트 ${n}개를 삭제했어요`)
    }
  }

  return (
    <div
      className={styles.home}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      {phone && (
        <header className={styles.phoneTop}>
          <span className={styles.brand}>RCM</span>
          <IconButton icon={FileArchive} label="ZIP 가져오기" onClick={() => void pickAndImportZip()} />
        </header>
      )}
      {!phone && (
        <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
          <div className={styles.sidebarTop}>
            <IconButton
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
              onClick={toggleSidebar}
            />
          </div>
          <Button variant="primary" title={collapsed ? '새 프로젝트' : undefined} onClick={() => setCreating(true)}>
            <Plus size={16} />
            <span className={styles.label}>새 프로젝트</span>
          </Button>
          {caps().chooseProjectFolder && (
            <Button variant="ghost" title={collapsed ? '프로젝트 열기' : undefined} onClick={() => void pickAndOpen()}>
              <FolderOpen size={16} />
              <span className={styles.label}>프로젝트 열기</span>
            </Button>
          )}
          <Button variant="ghost" title={collapsed ? 'ZIP 가져오기' : undefined} onClick={() => void pickAndImportZip()}>
            <FileArchive size={16} />
            <span className={styles.label}>ZIP 가져오기</span>
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
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                onClick={() => goTo(p)}
              >
                <Icon size={16} />
                <span className={styles.label}>{label}</span>
                {p === 'aiGuide' && isNew(AI_GUIDE_NOTICE_ID) && (
                  <span className={`${styles.navBadge} enter-fade`} title="가이드가 바뀌었어요" aria-label="새 내용" />
                )}
              </button>
            ))}
          </nav>
          <UpdatePanel compact={collapsed} />
        </aside>
      )}
      <main className={phone && page === 'home' ? `${styles.main} ${styles.mainHome}` : styles.main}>
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
                  <div className={styles.tools}>
                    <div className={styles.search}>
                      <Search size={14} className={styles.searchIcon} />
                      <TextField value={query} onChange={setQuery} placeholder="검색" />
                    </div>
                    <Menu
                      align="right"
                      trigger={<IconButton icon={ArrowDownUp} label="정렬" />}
                      items={PROJECT_SORTS.map((s) => ({
                        label: s.label,
                        checked: s.value === sort,
                        onSelect: () => setSort(s.value)
                      }))}
                    />
                    <IconButton
                      icon={Trash2}
                      label={selected ? '삭제 그만하기' : '삭제'}
                      active={selected !== null}
                      onClick={() => setSelected((s) => (s ? null : new Set()))}
                    />
                  </div>
                </div>
                {selected && (
                  <div className={`${styles.selectBar} enter-fade`}>
                    <span className={styles.selectCount}>
                      {picked.length > 0 ? `${picked.length}개 선택됨` : '지울 프로젝트를 골라 주세요'}
                    </span>
                    <Button
                      variant="ghost"
                      disabled={shown.length === 0}
                      onClick={() => setSelected(allPicked ? new Set() : new Set(shown.map((p) => p.dir)))}
                    >
                      {allPicked ? '선택 해제' : '모두 선택'}
                    </Button>
                    <Button variant="default" onClick={() => setSelected(null)}>
                      취소
                    </Button>
                    <Button variant="danger" disabled={picked.length === 0} onClick={() => void trashPicked()}>
                      <Trash2 size={14} /> 삭제
                    </Button>
                  </div>
                )}
                {recent !== null && (
                  <RecentTable
                    projects={shown}
                    variant={phone ? 'cards' : 'table'}
                    selected={selected ?? undefined}
                    onToggle={toggleSelected}
                    onOpen={(p) => void openRecent(p)}
                    onShowInExplorer={
                      caps().revealInExplorer
                        ? (p) =>
                            void window.rcm.showInExplorer(p.dir).catch(async (err: unknown) => {
                              await dialogs.alert(
                                '탐색기에서 열 수 없어요',
                                err instanceof Error ? err.message : String(err)
                              )
                            })
                        : undefined
                    }
                    onRemove={(p) => void removeFromList(p)}
                    onRelink={caps().chooseProjectFolder ? (p) => void relink(p) : undefined}
                  />
                )}
              </>
            )}
            {phone && (
              <div className={styles.phoneUpdate}>
                <UpdatePanel />
              </div>
            )}
            {usage !== null && <p className={styles.usage}>{usage}</p>}
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
      {phone && (
        <FloatingTabBar
          page={page}
          onNavigate={goTo}
          onNewProject={() => setCreating(true)}
          badges={isNew(AI_GUIDE_NOTICE_ID) ? AI_GUIDE_BADGE : NO_BADGES}
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

/**
 * 사이드바를 접어 둔 상태. 편집기에서 돌아와도 처음부터 접힌 채로 그리도록(펼쳐졌다 접히지 않게)
 * 설정 파일 대신 바로 읽히는 localStorage에 둔다. 읽거나 쓸 수 없으면 펼친 채로 둔다.
 */
const SIDEBAR_KEY = 'rcm.sidebarCollapsed'

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  } catch {
    // 저장하지 못해도 이번 실행 동안은 접힌 채로 쓴다
  }
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
        크레딧에는 누르면 <code>https://glglekdy.github.io/RCM/</code>로 이동하는 <b>Made with RCM</b> 버튼으로 넣어주세요
      </p>
    </section>
  )
}
