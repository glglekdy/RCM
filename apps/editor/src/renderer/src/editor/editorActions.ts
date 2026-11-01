import { createContext, useContext } from 'react'
import type { MenuItem } from '../ui/Menu'

/** 툴바·메뉴가 편집 화면에 시키는 일. 단축키와 같은 경로로 처리된다. */
export interface EditorActions {
  selectChart(file: string): void
  /** 난이도 추가 창을 연다. 창은 편집 화면이 가지고 있어 화면 모드가 바뀌어도 열려 있다 */
  addChart(): void
  playPause(): void
  record(): void
  playtest(): void
  newProject(): void
  openProject(): void
  save(): void
  importCharts(): void
  exportChart(): void
  exportZip(): void
  home(): void
  undo(): void
  redo(): void
  /** 박자 탭을 기록한다 (재생 중일 때만). T 키와 같다 */
  tap(): void
  edit(action: 'copy' | 'cut' | 'paste' | 'delete' | 'mirror'): void
}

/** 파일 메뉴 항목. 프로젝트 폴더를 고를 수 없는 환경(웹)에서는 '열기'가 빠진다. */
export function fileMenuItems(actions: EditorActions, canChooseFolder: boolean): MenuItem[] {
  return [
    { label: '새 프로젝트', onSelect: actions.newProject },
    ...(canChooseFolder ? [{ label: '열기', onSelect: actions.openProject }] : []),
    { label: '저장', onSelect: actions.save },
    { label: '채보 불러오기', onSelect: actions.importCharts },
    { label: '채보 내보내기', onSelect: actions.exportChart },
    { label: '프로젝트 ZIP으로 내보내기', onSelect: actions.exportZip },
    { label: '홈으로', onSelect: actions.home }
  ]
}

export const EditorActionsContext = createContext<EditorActions | null>(null)

export function useEditorActions(): EditorActions {
  const actions = useContext(EditorActionsContext)
  if (!actions) throw new Error('EditorScreen 안에서만 쓸 수 있어요')
  return actions
}
