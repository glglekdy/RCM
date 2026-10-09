import { trackForCode } from '@rcm/playfield'

/** 트랙 키를 한 번 누른 기록. 시각은 곡 기준 ms. */
export interface Press {
  track: string
  downMs: number
  upMs: number
}

/** 녹음 중 트랙 키의 누름·뗌을 모은다. 이미 눌린 트랙의 keydown(키 반복)은 무시한다. */
export class Recorder {
  private readonly held = new Map<string, number>()
  private readonly presses: Press[] = []

  /** keymap: 트랙 id → 키 code (키 없는 트랙은 null). */
  constructor(private readonly keymap: ReadonlyMap<string, string | null>) {}

  keyDown(code: string, ms: number): void {
    const track = trackForCode(this.keymap, code)
    if (track === null || this.held.has(track)) return
    this.held.set(track, ms)
  }

  keyUp(code: string, ms: number): void {
    const track = trackForCode(this.keymap, code)
    if (track === null) return
    const downMs = this.held.get(track)
    if (downMs === undefined) return
    this.held.delete(track)
    this.presses.push({ track, downMs, upMs: ms })
  }

  /** 지금 눌려 있는 트랙 id와 누른 시각. */
  pressed(): ReadonlyMap<string, number> {
    return this.held
  }

  /** 눌린 키를 모두 ms에서 뗀 것으로 한다. 창이 포커스를 잃어 keyup이 오지 않을 때 쓴다. */
  releaseAll(ms: number): void {
    for (const [track, downMs] of this.held) this.presses.push({ track, downMs, upMs: ms })
    this.held.clear()
  }

  /** 아직 눌린 키는 endMs에서 뗀 것으로 치고 모든 누름을 누른 순서(같으면 keymap 순서)로 돌려준다. */
  finish(endMs: number): Press[] {
    this.releaseAll(endMs)
    const order = [...this.keymap.keys()]
    return [...this.presses].sort(
      (a, b) => a.downMs - b.downMs || order.indexOf(a.track) - order.indexOf(b.track)
    )
  }
}
