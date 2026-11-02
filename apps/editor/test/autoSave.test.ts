import { describe, expect, it, vi } from 'vitest'
import { autoSaveOnHidden } from '../src/renderer/src/editor/autoSave'
import { saveActiveIfDirty, setActiveSave } from '../src/renderer/src/editor/activeSave'

describe('autoSaveOnHidden', () => {
  it('saves when enabled, hidden and dirty', async () => {
    const save = vi.fn(async () => {})
    expect(await autoSaveOnHidden({ enabled: true, hidden: true, dirty: true, save, onError: vi.fn() })).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it.each([
    [false, true, true],
    [true, false, true],
    [true, true, false]
  ])('does nothing when clean / visible / disabled (%s,%s,%s)', async (enabled, hidden, dirty) => {
    const save = vi.fn(async () => {})
    expect(await autoSaveOnHidden({ enabled, hidden, dirty, save, onError: vi.fn() })).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
  it('reports failure without throwing', async () => {
    const err = new Error('저장 공간이 부족해요')
    const onError = vi.fn()
    await expect(
      autoSaveOnHidden({
        enabled: true,
        hidden: true,
        dirty: true,
        save: async () => {
          throw err
        },
        onError
      })
    ).resolves.toBe(true)
    expect(onError).toHaveBeenCalledWith(err)
  })
})

describe('saveActiveIfDirty', () => {
  it('resolves with nothing registered, calls the registered fn, propagates failure', async () => {
    setActiveSave(null)
    await expect(saveActiveIfDirty()).resolves.toBeUndefined()
    const fn = vi.fn(async () => {})
    setActiveSave(fn)
    await saveActiveIfDirty()
    expect(fn).toHaveBeenCalledTimes(1)
    setActiveSave(async () => {
      throw new Error('x')
    })
    await expect(saveActiveIfDirty()).rejects.toThrow('x')
    setActiveSave(null)
  })
})
