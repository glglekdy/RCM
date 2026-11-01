import { useState } from 'react'
import { Check, Link2, TriangleAlert, X } from 'lucide-react'
import type { RecentProject } from '../../../shared/api'
import { ContextMenu } from '../ui'
import { relativeTime } from './relativeTime'
import { projectName } from './sortProjects'
import styles from './RecentTable.module.css'
import { stagger } from '../ui/motion'
import { caps } from '../ui/platform'

interface RecentTableProps {
  projects: RecentProject[]
  /** 'cards': 폰의 카드 목록. 한 번 누르면 연다 (기본은 표) */
  variant?: 'table' | 'cards'
  onOpen: (p: RecentProject) => void
  /** 없으면 "탐색기에서 보기"를 보이지 않는다 */
  onShowInExplorer?: (p: RecentProject) => void
  onRemove: (p: RecentProject) => void
  /** 찾을 수 없는 프로젝트를 옮겨 간 폴더에 다시 연결. 없으면 "다시 연결"을 보이지 않는다 */
  onRelink?: (p: RecentProject) => void
  /** 삭제 모드에서 고른 프로젝트 폴더들. 정하면 행을 누를 때 열지 않고 고르기만 한다 */
  selected?: ReadonlySet<string>
  onToggle?: (p: RecentProject) => void
}

export function RecentTable({
  projects,
  variant = 'table',
  onOpen,
  onShowInExplorer,
  onRemove,
  onRelink,
  selected,
  onToggle
}: RecentTableProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; project: RecentProject } | null>(null)
  const now = Date.now()

  const menuElement = menu && (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={
        menu.project.missing
          ? [
              ...(onRelink ? [{ label: '다시 연결', onSelect: () => onRelink(menu.project) }] : []),
              { label: '목록에서 제거', danger: true, onSelect: () => onRemove(menu.project) }
            ]
          : [
              { label: '열기', onSelect: () => onOpen(menu.project) },
              ...(onShowInExplorer
                ? [{ label: '탐색기에서 보기', onSelect: () => onShowInExplorer(menu.project) }]
                : []),
              // 휴지통이 없는 환경(웹)은 목록이 곧 저장소라 제거 = 영구 삭제다. 삭제는 선택 삭제(확인)로만 한다
              ...(caps().trash
                ? [{ label: '목록에서 제거', danger: true, onSelect: () => onRemove(menu.project) }]
                : [])
            ]
      }
    />
  )

  if (variant === 'cards') {
    return (
      <div className={`${styles.cards} ${selected ? styles.selecting : ''}`} role="list">
        {projects.map((p, i) => {
          const checked = selected?.has(p.dir) ?? false
          const summary = p.missing
            ? null
            : [
                p.artist,
                p.charts.map((c) => `${c.name} · ${c.columns !== undefined ? `${c.columns}칸` : `${c.trackCount}트랙`}`).join(', ')
              ]
                .filter(Boolean)
                .join(' · ')
          return (
            <div
              key={p.dir}
              role="listitem"
              tabIndex={0}
              aria-pressed={selected ? checked : undefined}
              className={`${styles.card} ${p.missing ? styles.missing : ''} ${checked ? styles.checked : ''} enter-drop`}
              style={stagger(i)}
              onClick={() => (selected ? onToggle?.(p) : onOpen(p))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || (selected && e.key === ' ')) {
                  e.preventDefault()
                  if (selected) onToggle?.(p)
                  else onOpen(p)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!selected) setMenu({ x: e.clientX, y: e.clientY, project: p })
              }}
            >
              {selected && (
                <span className={styles.checkCell}>
                  <span className={styles.checkBox}>{checked && <Check size={12} strokeWidth={3} />}</span>
                </span>
              )}
              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{projectName(p)}</span>
                  <span className={`${styles.cardTime} ${styles.muted}`}>{relativeTime(p.lastOpened, now)}</span>
                </div>
                {p.missing ? (
                  <div className={styles.cardLost}>
                    <span className={styles.lostLabel}>
                      <TriangleAlert size={14} /> 찾을 수 없음
                    </span>
                    {!selected && (
                      // 버튼을 눌러도 카드의 누름(찾을 수 없음 안내)이 함께 뜨지 않게
                      <span className={styles.lostActions} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {onRelink && (
                          <button type="button" className={styles.lostBtn} onClick={() => onRelink(p)}>
                            <Link2 size={14} /> 다시 연결
                          </button>
                        )}
                        <button type="button" className={styles.lostBtn} onClick={() => onRemove(p)}>
                          <X size={14} /> 목록에서 제거
                        </button>
                      </span>
                    )}
                  </div>
                ) : (
                  <div className={`${styles.cardSub} ${styles.muted}`}>{summary || '-'}</div>
                )}
              </div>
            </div>
          )
        })}
        {menuElement}
      </div>
    )
  }

  return (
    <div className={`${styles.table} ${selected ? styles.selecting : ''}`} role="table">
      <div className={`${styles.row} ${styles.head}`} role="row">
        {selected && <span role="columnheader" aria-label="선택" />}
        <span role="columnheader">이름</span>
        <span role="columnheader">아티스트</span>
        <span role="columnheader">난이도</span>
        <span role="columnheader" className={styles.time}>
          최근 열람
        </span>
      </div>
      <div className={styles.body}>
        {projects.map((p, i) => {
          const checked = selected?.has(p.dir) ?? false
          return (
            <div
              key={p.dir}
              role="row"
              tabIndex={0}
              aria-selected={selected ? checked : undefined}
              className={`${styles.row} ${styles.item} ${p.missing ? styles.missing : ''} ${checked ? styles.checked : ''} enter-drop`}
              style={stagger(i)}
              title={p.dir}
              onClick={() => selected && onToggle?.(p)}
              onDoubleClick={() => !selected && onOpen(p)}
              onKeyDown={(e) => {
                if (!selected) {
                  if (e.key === 'Enter') onOpen(p)
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle?.(p)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!selected) setMenu({ x: e.clientX, y: e.clientY, project: p })
              }}
            >
              {selected && (
                <span className={styles.checkCell} role="cell">
                  <span className={styles.checkBox}>{checked && <Check size={12} strokeWidth={3} />}</span>
                </span>
              )}
              <span className={styles.name} role="cell">
                {projectName(p)}
              </span>
              <span className={styles.artist} role="cell">
                {p.missing || !p.artist ? '-' : p.artist}
              </span>
              {p.missing ? (
                <span className={styles.lost} role="cell">
                  <span className={styles.lostLabel}>
                    <TriangleAlert size={14} /> 찾을 수 없음
                  </span>
                  {!selected && (
                    // 버튼을 눌러도 행의 더블클릭·Enter(찾을 수 없음 안내)가 함께 뜨지 않게
                    <span
                      className={styles.lostActions}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {onRelink && (
                        <button
                          type="button"
                          className={styles.lostBtn}
                          title="옮겨 간 프로젝트 폴더를 골라 다시 연결해요"
                          onClick={() => onRelink(p)}
                        >
                          <Link2 size={14} /> 다시 연결
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.lostBtn}
                        title="목록에서만 빼요 (디스크의 파일은 건드리지 않아요)"
                        onClick={() => onRemove(p)}
                      >
                        <X size={14} /> 목록에서 제거
                      </button>
                    </span>
                  )}
                </span>
              ) : (
                <span className={styles.charts} role="cell">
                  {p.charts.map((c) => `${c.name} · ${c.columns !== undefined ? `${c.columns}칸` : `${c.trackCount}트랙`}`).join(', ')}
                </span>
              )}
              <span className={`${styles.time} ${styles.muted}`} role="cell">
                {relativeTime(p.lastOpened, now)}
              </span>
            </div>
          )
        })}
      </div>
      {menuElement}
    </div>
  )
}
