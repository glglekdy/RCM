import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getChart, replaceChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { EditorStore } from '../../../src/renderer/src/editor/state/store'
import { d0 } from '../fixtures'

const setDirty = vi.fn()
const writeProjectFiles = vi.fn(async (_dir: string, _files: unknown[]) => {})
const deleteProjectFiles = vi.fn(async (_dir: string, _names: string[]) => {})

const N = 'normal.chart.json'
const H = 'hard.chart.json'
const withHard: ProjectDoc = {
  ...d0,
  charts: [...d0.charts, { file: H, chart: { ...getChart(d0, N), name: 'HARD' } }]
}
const titled = (title: string): ProjectDoc => ({ ...d0, song: { ...d0.song, title } })

function make(doc: ProjectDoc = d0): EditorStore {
  return new EditorStore({ dir: 'C:/p' }, doc)
}

beforeEach(() => {
  setDirty.mockClear()
  writeProjectFiles.mockClear()
  deleteProjectFiles.mockClear()
  ;(globalThis as unknown as { window: unknown }).window = {
    rcm: { setDirty, writeProjectFiles, deleteProjectFiles }
  }
})

describe('EditorStore active chart guard', () => {
  it('undo of add-chart falls back when the chart is gone', () => {
    const s = make()
    s.apply('add chart', withHard, H)
    s.set({ activeChart: H })
    s.undo()
    expect(s.getState().activeChart).toBe(N)
  })
  it('redo of delete-chart falls back when the chart is gone', () => {
    const s = make(withHard)
    s.apply('delete chart', d0, H)
    s.undo()
    s.set({ activeChart: H })
    s.redo()
    expect(s.getState().activeChart).toBe(N)
  })
  it('without chartFile keeps a still-existing active chart, else falls back', () => {
    const s = make(withHard)
    s.apply('song', { ...withHard, song: { ...withHard.song, title: 'x' } })
    s.set({ activeChart: H })
    s.undo()
    expect(s.getState().activeChart).toBe(H)
    const t = make(withHard)
    t.apply('song', { ...withHard, song: { ...withHard.song, title: 'x' } })
    t.set({ activeChart: 'gone.chart.json' })
    t.undo()
    expect(t.getState().activeChart).toBe(N)
  })
  it('undo of a chart edit switches to that chart and clears selection', () => {
    const s = make(withHard)
    s.apply('edit', replaceChart(withHard, H, { ...getChart(withHard, H), level: 5 }), H)
    s.set({ activeChart: N, selection: new Set(['a']) })
    s.undo()
    expect(s.getState().activeChart).toBe(H)
    expect(s.getState().selection.size).toBe(0)
  })
})

describe('EditorStore dirty reporting', () => {
  it('calls setDirty only on transitions', () => {
    const s = make()
    s.apply('a', titled('1'))
    expect(setDirty.mock.calls).toEqual([[true]])
    s.apply('b', titled('2'))
    expect(setDirty).toHaveBeenCalledTimes(1)
    s.undo()
    s.undo()
    expect(setDirty.mock.calls).toEqual([[true], [false]])
  })
  it('a recording or a focused field also arms the close guard, without being dirty', () => {
    const s = make()
    s.set({ mode: 'recording' })
    expect(setDirty.mock.calls).toEqual([[true]])
    expect(s.isDirty()).toBe(false)
    s.set({ mode: 'edit' })
    s.set({ fieldFocused: true })
    s.set({ fieldFocused: false })
    expect(setDirty.mock.calls).toEqual([[true], [false], [true], [false]])
  })
  it('an edit made while save() is pending stays dirty', async () => {
    const s = make()
    s.apply('a', titled('1'))
    let release!: () => void
    writeProjectFiles.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const saving = s.save()
    s.apply('b', titled('2'))
    release()
    await saving
    expect(s.isDirty()).toBe(true)
    expect(setDirty).toHaveBeenLastCalledWith(true)
  })
})

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('EditorStore save and history', () => {
  it('save, then undo is dirty, then redo is clean (Review Focus 3)', async () => {
    const s = make()
    s.apply('a', titled('1'))
    await s.save()
    expect(s.isDirty()).toBe(false)
    s.undo()
    expect(s.isDirty()).toBe(true)
    s.redo()
    expect(s.isDirty()).toBe(false)
    expect(setDirty).toHaveBeenLastCalledWith(false)
  })
  it('undo of a saved new difficulty is dirty and the next save deletes its file', async () => {
    const s = make()
    s.apply('add chart', withHard, H)
    await s.save()
    expect(writeProjectFiles.mock.calls[0][1]).toEqual([expect.objectContaining({ name: H })])
    s.undo()
    expect(s.isDirty()).toBe(true)
    expect(setDirty).toHaveBeenLastCalledWith(true)
    await s.save()
    expect(deleteProjectFiles.mock.calls).toEqual([['C:/p', [H]]])
    expect(s.isDirty()).toBe(false)
  })
  it('add difficulty, save, undo, redo is clean again', async () => {
    const s = make()
    s.apply('add chart', withHard, H)
    await s.save()
    s.undo()
    s.redo()
    expect(s.isDirty()).toBe(false)
    expect(setDirty).toHaveBeenLastCalledWith(false)
  })
  it('overlapping saves run one after another', async () => {
    const s = make()
    s.apply('a', titled('1'))
    let release!: () => void
    writeProjectFiles.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const first = s.save()
    s.apply('b', titled('2'))
    const second = s.save()
    await flush()
    expect(writeProjectFiles).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(writeProjectFiles).toHaveBeenCalledTimes(2)
    const secondFiles = writeProjectFiles.mock.calls[1][1] as { name: string; text: string }[]
    expect(secondFiles.map((f) => f.name)).toEqual(['song.json'])
    expect(secondFiles[0].text).toContain('"title": "2"')
    expect(s.isDirty()).toBe(false)
  })
  it('a failed save does not block the next one', async () => {
    const s = make()
    s.apply('a', titled('1'))
    writeProjectFiles.mockRejectedValueOnce(new Error('disk'))
    await expect(s.save()).rejects.toThrow('disk')
    expect(s.isDirty()).toBe(true)
    await s.save()
    expect(s.isDirty()).toBe(false)
  })
})
