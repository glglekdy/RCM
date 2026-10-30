import type { RecentProject } from '../../../shared/api'

export type ProjectSort = 'name' | 'recent' | 'oldest'

export const PROJECT_SORTS: { value: ProjectSort; label: string }[] = [
  { value: 'name', label: '이름순' },
  { value: 'recent', label: '최근 수정순' },
  { value: 'oldest', label: '오래된 순' }
]

/** 표에 보이는 이름. 찾을 수 없는 프로젝트는 곡 제목 대신 폴더 이름 */
export function projectName(p: RecentProject): string {
  if (!p.missing) return p.title
  const parts = p.dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p.dir
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })

/** 새 배열로 정렬한다. 이름이 같으면 최근에 연 것이 먼저 */
export function sortProjects(list: RecentProject[], sort: ProjectSort): RecentProject[] {
  const byRecent = (a: RecentProject, b: RecentProject) => b.lastOpened - a.lastOpened
  return [...list].sort(
    sort === 'name'
      ? (a, b) => collator.compare(projectName(a), projectName(b)) || byRecent(a, b)
      : sort === 'oldest'
        ? (a, b) => a.lastOpened - b.lastOpened
        : byRecent
  )
}
