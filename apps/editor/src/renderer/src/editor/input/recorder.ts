import { laneForCode } from '@rcm/playfield'

/** 레인 키를 한 번 누른 기록. 시각은 곡 기준 ms. */
export interface Press {
  lane: number
  downMs: number
  upMs: number
}

/** 녹음 중 레인 키의 누름·뗌을 모은다. 이미 눌린 레인의 keydown(키 반복)은 무시한다. */
export class Recorder {
  private readonly held = new Map<number, number>()
  private readonly presses: Press[] = []

  constructor(private readonly lanes: number) {}

  keyDown(code: string, ms: number): void {
    const lane = laneForCode(this.lanes, code)
    if (lane === null || this.held.has(lane)) return
    this.held.set(lane, ms)
  }

  keyUp(code: string, ms: number): void {
    const lane = laneForCode(this.lanes, code)
    if (lane === null) return
    const downMs = this.held.get(lane)
    if (downMs === undefined) return
    this.held.delete(lane)
    this.presses.push({ lane, downMs, upMs: ms })
  }

  /** 지금 눌려 있는 레인과 누른 시각. */
  pressed(): ReadonlyMap<number, number> {
    return this.held
  }

  /** 눌린 키를 모두 ms에서 뗀 것으로 한다. 창이 포커스를 잃어 keyup이 오지 않을 때 쓴다. */
  releaseAll(ms: number): void {
    for (const [lane, downMs] of this.held) this.presses.push({ lane, downMs, upMs: ms })
    this.held.clear()
  }

  /** 아직 눌린 키는 endMs에서 뗀 것으로 치고 모든 누름을 누른 순서로 돌려준다. */
  finish(endMs: number): Press[] {
    this.releaseAll(endMs)
    return [...this.presses].sort((a, b) => a.downMs - b.downMs || a.lane - b.lane)
  }
}
