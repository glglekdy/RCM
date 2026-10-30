import { useState } from 'react'
import { Check, Link2, TriangleAlert, X } from 'lucide-react'
import type { RecentProject } from '../../../shared/api'
import { ContextMenu } from '../ui'
import { relativeTime } from './relativeTime'
import { projectName } from './sortProjects'
import styles from './RecentTable.module.css'
import { stagger } from '../ui/motion'

interface RecentTableProps {
  projects: RecentProject[]
  onOpen: (p: RecentProject) => void
  onShowInExplorer: (p: RecentProject) => void
  onRemove: (p: RecentProject) => void
  /** 찾을 수 없는 프로젝트를 옮겨 간 폴더에 다시 연결 */
  onRelink: (p: RecentProject) => void
  /** 삭제 모드에서 고른 프로젝트 폴더들. 정하면 행을 누를 때 열지 않고 고르기만 한다 */
  selected?: ReadonlySet<string>
  onToggle?: (p: RecentProject) => void
}

export function RecentTable({
  projects,
  onOpen,
  onShowInExplorer,
  onRemove,
  onRelink,
  selected,
  onToggle
}: RecentTableProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; project: RecentProject } | null>(null)
  const now = Date.now()

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
                      <button
                        type="button"
                        className={styles.lostBtn}
                        title="옮겨 간 프로젝트 폴더를 골라 다시 연결해요"
                        onClick={() => onRelink(p)}
                      >
                        <Link2 size={14} /> 다시 연결
                      </button>
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.project.missing
              ? [
                  { label: '다시 연결', onSelect: () => onRelink(menu.project) },
                  { label: '목록에서 제거', danger: true, onSelect: () => onRemove(menu.project) }
                ]
              : [
                  { label: '열기', onSelect: () => onOpen(menu.project) },
                  { label: '탐색기에서 보기', onSelect: () => onShowInExplorer(menu.project) },
                  { label: '목록에서 제거', danger: true, onSelect: () => onRemove(menu.project) }
                ]
          }
        />
      )}
    </div>
  )
}
