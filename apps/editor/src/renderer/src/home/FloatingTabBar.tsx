import { Plus } from 'lucide-react'
import { NAV, type Page } from './homeNav'
import styles from './FloatingTabBar.module.css'

interface FloatingTabBarProps {
  page: Page
  onNavigate: (p: Page) => void
  onNewProject: () => void
  /** 새 내용 표시 점을 달 페이지 */
  badges: ReadonlySet<Page>
}

/** 폰 홈의 아래쪽에 떠 있는 아이콘 전용 탭 바(알약)와 따로 떠 있는 새 프로젝트 버튼 */
export function FloatingTabBar({ page, onNavigate, onNewProject, badges }: FloatingTabBarProps) {
  const index = Math.max(
    0,
    NAV.findIndex((n) => n.page === page)
  )
  return (
    <div className={styles.dock}>
      <nav className={styles.pill} aria-label="홈 메뉴">
        {/* 고른 항목 뒤에서 미끄러지듯 옮겨 가는 표시 */}
        <span
          className={styles.indicator}
          style={{ transform: `translateX(calc(${index} * (var(--tab) + var(--gap))))` }}
          aria-hidden
        />
        {NAV.map(({ page: p, icon: Icon, label }) => (
          <button
            key={p}
            type="button"
            className={`${styles.tab} ${page === p ? styles.active : ''}`}
            aria-label={label}
            aria-current={page === p ? 'page' : undefined}
            title={label}
            onClick={() => onNavigate(p)}
          >
            <Icon size={22} strokeWidth={page === p ? 2.2 : 1.8} />
            {badges.has(p) && <span className={`${styles.badge} enter-fade`} aria-hidden />}
          </button>
        ))}
      </nav>
      <button type="button" className={styles.add} aria-label="새 프로젝트" title="새 프로젝트" onClick={onNewProject}>
        <Plus size={22} strokeWidth={2.4} />
      </button>
    </div>
  )
}
