import { describe, expect, it, vi } from 'vitest'
import { applyUpdate, setUpdateReady, subscribeUpdateReady } from '../src/renderer/src/web/pwaStore'

describe('applyUpdate', () => {
  it('saves then updates', async () => {
    const calls: string[] = []
    await applyUpdate({
      save: async () => void calls.push('save'),
      update: async (r) => void calls.push(`update:${r}`),
      onError: () => calls.push('error')
    })
    expect(calls).toEqual(['save', 'update:true'])
  })

  it('does not reload when save fails', async () => {
    const update = vi.fn(async () => {})
    const onError = vi.fn()
    await applyUpdate({
      save: async () => {
        throw new Error('x')
      },
      update,
      onError
    })
    expect(update).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers on setUpdateReady', () => {
    const l = vi.fn()
    const off = subscribeUpdateReady(l)
    setUpdateReady(async () => {})
    expect(l).toHaveBeenCalledTimes(1)
    off()
    setUpdateReady(null)
  })
})
