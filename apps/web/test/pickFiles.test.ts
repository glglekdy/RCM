import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 브라우저 없이 `pickFiles`가 쓰는 DOM만 흉내 낸다 */
function installFakeDom() {
  const windowListeners = new Map<string, Set<() => void>>()
  const inputs: {
    files: File[] | null
    fire: (type: string) => void
  }[] = []
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: () => void) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => windowListeners.get(type)?.delete(fn)
  })
  vi.stubGlobal('document', {
    body: { appendChild: () => {} },
    createElement: () => {
      const handlers = new Map<string, () => void>()
      const input = {
        files: null as File[] | null,
        style: {},
        remove: () => {},
        click: () => {},
        addEventListener: (type: string, fn: () => void) => handlers.set(type, fn),
        fire: (type: string) => handlers.get(type)?.()
      }
      inputs.push(input)
      return input
    }
  })
  return {
    inputs,
    focusWindow: () => windowListeners.get('focus')?.forEach((fn) => fn())
  }
}

async function freshPicked() {
  vi.resetModules()
  return import('../src/api/picked')
}

describe('pickFiles', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('change가 오면 고른 파일을 돌려줘요', async () => {
    const dom = installFakeDom()
    const { pickFiles } = await freshPicked()
    const promise = pickFiles('.json', true)
    const f = new File(['{}'], 'a.json')
    dom.inputs[0].files = [f]
    dom.inputs[0].fire('change')
    expect(await promise).toEqual([f])
  })

  it('cancel 이벤트가 오면 빈 배열이에요', async () => {
    const dom = installFakeDom()
    const { pickFiles } = await freshPicked()
    const promise = pickFiles('.json', false)
    dom.inputs[0].fire('cancel')
    expect(await promise).toEqual([])
  })

  it('cancel이 없는 브라우저: 포커스가 돌아오고 1500ms 안에 change가 없으면 취소로 봐요', async () => {
    const dom = installFakeDom()
    const { pickFiles } = await freshPicked()
    let result: File[] | null = null
    void pickFiles('.json', false).then((r) => (result = r))
    dom.focusWindow()
    await vi.advanceTimersByTimeAsync(1499)
    expect(result).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual([])
  })

  it('늦게 온 change(클라우드 파일)는 취소로 취급하지 않아요', async () => {
    const dom = installFakeDom()
    const { pickFiles } = await freshPicked()
    const promise = pickFiles('.json', false)
    dom.focusWindow()
    await vi.advanceTimersByTimeAsync(1000)
    const f = new File(['{}'], 'late.json')
    dom.inputs[0].files = [f]
    dom.inputs[0].fire('change')
    await vi.advanceTimersByTimeAsync(2000)
    expect(await promise).toEqual([f])
  })

  it('cancel을 한 번이라도 봤으면 이후에는 포커스 대체 수단을 쓰지 않아요', async () => {
    const dom = installFakeDom()
    const { pickFiles } = await freshPicked()
    const first = pickFiles('.json', false)
    dom.inputs[0].fire('cancel')
    await first

    let result: File[] | null = null
    void pickFiles('.json', false).then((r) => (result = r))
    dom.focusWindow()
    await vi.advanceTimersByTimeAsync(5000)
    expect(result).toBeNull()
    const f = new File(['{}'], 'b.json')
    dom.inputs[1].files = [f]
    dom.inputs[1].fire('change')
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toEqual([f])
  })
})
