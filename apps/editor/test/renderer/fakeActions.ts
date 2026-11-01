import { vi } from 'vitest'
import type { EditorActions } from '../../src/renderer/src/editor/editorActions'

/** 모든 동작이 vi.fn()인 EditorActions */
export function fakeActions(): EditorActions {
  return {
    selectChart: vi.fn(),
    playPause: vi.fn(),
    record: vi.fn(),
    playtest: vi.fn(),
    newProject: vi.fn(),
    openProject: vi.fn(),
    save: vi.fn(),
    importCharts: vi.fn(),
    exportChart: vi.fn(),
    exportZip: vi.fn(),
    home: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    edit: vi.fn()
  }
}
