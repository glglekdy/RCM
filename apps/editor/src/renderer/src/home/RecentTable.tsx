import { useState } from 'react'
import type { RecentProject } from '../../../shared/api'
import { ContextMenu } from '../ui'
import { relativeTime } from './relativeTime'
import styles from './RecentTable.module.css'
import { stagger } from '../ui/motion'

interface RecentTableProps {
  projects: RecentProject[]
  onOpen: (p: RecentProject) => void
  onShowInExplorer: (p: RecentProject) => void
  onRemove: (p: RecentProject) => void
}

export function RecentTable({ projects, onOpen, onShowInExplorer, onRemove }: RecentTableProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; project: RecentProject } | null>(null)
  const now = Date.now()

  return (
    <div className={styles.table} role="table">
      <div className={`${styles.row} ${styles.head}`} role="row">
        <span role="columnheader">이름</span>
        <span role="columnheader">아티스트</span>
        <span role="columnheader">난이도</span>
        <span role="columnheader" className={styles.time}>
          최근 열람
        </span>
      </div>
      <div className={styles.body}>
        {projects.map((p, i) => (
          <div
            key={p.dir}
            role="row"
            tabIndex={0}
            className={`${styles.row} ${styles.item} ${p.missing ? styles.missing : ''} enter-drop`}
            style={stagger(i)}
            title={p.dir}
            onDoubleClick={() => onOpen(p)}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(p)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, project: p })
            }}
          >
            <span className={styles.name} role="cell">
              {p.missing ? folderName(p.dir) : p.title}
            </span>
            <span className={styles.artist} role="cell">
              {p.missing || !p.artist ? '-' : p.artist}
            </span>
            <span className={styles.charts} role="cell">
              {p.missing
                ? '찾을 수 없음'
                : p.charts.map((c) => `${c.name} · ${c.columns !== undefined ? `${c.columns}칸` : `${c.trackCount}트랙`}`).join(', ')}
            </span>
            <span className={`${styles.time} ${styles.muted}`} role="cell">
              {relativeTime(p.lastOpened, now)}
            </span>
          </div>
        ))}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: '열기', onSelect: () => onOpen(menu.project) },
            { label: '탐색기에서 보기', onSelect: () => onShowInExplorer(menu.project) },
            { label: '목록에서 제거', danger: true, onSelect: () => onRemove(menu.project) }
          ]}
        />
      )}
    </div>
  )
}

function folderName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dir
}
