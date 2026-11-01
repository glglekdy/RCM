import type { EditorState } from '../state/store'

export const LONG_PRESS_MS = 500
export const SLOP_PX = 8

export type PointerKind = 'mouse' | 'pen' | 'touch'

export interface GesturePointer {
  id: number
  kind: PointerKind
  x: number
  y: number
  /** 0 왼쪽(손가락), 2 오른쪽 */
  button: number
  shift: boolean
}

export type GestureEffect =
  | { type: 'tool-down'; p: GesturePointer }
  | { type: 'tool-move'; p: GesturePointer }
  | { type: 'tool-up'; p: GesturePointer }
  | { type: 'tool-cancel' }
  /** 손가락이 아래로 움직인 px (위로는 음수) */
  | { type: 'pan'; dy: number }
  /** pxPerMs에 곱할 배율과 고정할 y */
  | { type: 'zoom'; scale: number; anchorY: number }
  /** 이동 도구로 움직이지 않고 짧게 누름 */
  | { type: 'tap'; x: number; y: number }
  | { type: 'long-press'; x: number; y: number }

export interface GestureRouter {
  down(p: GesturePointer, tool: EditorState['tool'] | 'pan'): GestureEffect[]
  move(p: GesturePointer): GestureEffect[]
  up(p: GesturePointer): GestureEffect[]
  /** pointercancel, 포인터 붙잡기를 잃음 */
  cancel(id: number): GestureEffect[]
  /** 터치로 누른 지 LONG_PRESS_MS 뒤에 연결 코드가 부른다. 아직 길게 누르기로 볼 수 있으면 효과를 낸다 */
  longPress(id: number): GestureEffect[]
  /** 누르고 있는 포인터가 있다 */
  readonly active: boolean
  /** 마지막으로 누른 포인터가 터치가 아니면 true. 터치 길게 누르기가 보내는 contextmenu를 막는 데 쓴다 */
  allowsContextMenu(): boolean
}

type Mode =
  /** 포인터를 도구로 넘기는 중 */
  | 'tool'
  /** 이동 도구로 눌렀고 아직 8px 안쪽: 떼면 탭 */
  | 'pan-pending'
  | 'panning'
  | 'pinch'
  /** 핀치 중 한 손가락을 뗀 뒤: 남은 손가락은 뗄 때까지 아무것도 내지 않는다 */
  | 'pinch-rest'
  /** 길게 누르기를 낸 뒤: 뗄 때까지 아무것도 내지 않는다 */
  | 'consumed'

interface Tracked {
  kind: PointerKind
  startX: number
  startY: number
  x: number
  y: number
}

export function createGestureRouter(): GestureRouter {
  const pointers = new Map<number, Tracked>()
  let mode: Mode | 'idle' = 'idle'
  let lastKind: PointerKind = 'mouse'
  /** 도구로 넘기는 중(select)에 8px 넘게 움직였는가 */
  let moved = false
  /** 이 누름이 길게 누르기를 낼 수 있는가 (터치의 select / pan) */
  let longPressable = false
  /** panning: 직전에 낸 y */
  let lastPanY = 0
  /** pinch: 직전 중심 y와 거리 */
  let pinchCy = 0
  let pinchDist = 0

  const reset = () => {
    pointers.clear()
    mode = 'idle'
    moved = false
    longPressable = false
  }

  const pinchMetrics = (): { cy: number; dist: number } => {
    const [a, b] = [...pointers.values()]
    return { cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  const exceedsSlop = (t: Tracked) => Math.hypot(t.x - t.startX, t.y - t.startY) > SLOP_PX

  const startPinch = () => {
    mode = 'pinch'
    longPressable = false
    ;({ cy: pinchCy, dist: pinchDist } = pinchMetrics())
  }

  return {
    down(p, tool) {
      lastKind = p.kind
      const tracked: Tracked = { kind: p.kind, startX: p.x, startY: p.y, x: p.x, y: p.y }

      if (mode === 'idle') {
        pointers.set(p.id, tracked)
        moved = false
        const isTouch = p.kind === 'touch'
        if (tool === 'pan' && (isTouch || p.button === 0)) {
          mode = 'pan-pending'
          longPressable = isTouch
          return []
        }
        mode = 'tool'
        longPressable = isTouch && tool === 'select'
        return [{ type: 'tool-down', p }]
      }

      // 이미 누른 중: 터치 둘째 손가락만 받는다
      if (p.kind !== 'touch' || pointers.has(p.id)) return []
      if (mode === 'pinch' || mode === 'consumed') return []
      const [first] = pointers.values()
      if (first.kind !== 'touch') return []
      const wasTool = mode === 'tool'
      pointers.set(p.id, tracked)
      startPinch()
      return wasTool ? [{ type: 'tool-cancel' }] : []
    },

    move(p) {
      const t = pointers.get(p.id)
      if (!t) return []
      t.x = p.x
      t.y = p.y
      switch (mode) {
        case 'tool':
          if (exceedsSlop(t)) moved = true
          return [{ type: 'tool-move', p }]
        case 'pan-pending':
          if (!exceedsSlop(t)) return []
          mode = 'panning'
          lastPanY = t.startY
          // falls through
        case 'panning': {
          const dy = t.y - lastPanY
          lastPanY = t.y
          return [{ type: 'pan', dy }]
        }
        case 'pinch': {
          const { cy, dist } = pinchMetrics()
          const effects: GestureEffect[] = [{ type: 'pan', dy: cy - pinchCy }]
          if (dist >= 1 && pinchDist >= 1) effects.push({ type: 'zoom', scale: dist / pinchDist, anchorY: cy })
          pinchCy = cy
          pinchDist = dist
          return effects
        }
        default:
          return []
      }
    },

    up(p) {
      const t = pointers.get(p.id)
      if (!t) return []
      pointers.delete(p.id)
      let effects: GestureEffect[] = []
      if (mode === 'tool') effects = [{ type: 'tool-up', p }]
      else if (mode === 'pan-pending') effects = [{ type: 'tap', x: p.x, y: p.y }]
      if (mode === 'pinch') mode = 'pinch-rest'
      if (pointers.size === 0) reset()
      return effects
    },

    cancel(id) {
      if (!pointers.has(id)) return []
      pointers.delete(id)
      const effects: GestureEffect[] = mode === 'tool' ? [{ type: 'tool-cancel' }] : []
      if (mode === 'pinch') mode = 'pinch-rest'
      if (pointers.size === 0) reset()
      return effects
    },

    longPress(id) {
      const t = pointers.get(id)
      if (!t || !longPressable || t.kind !== 'touch') return []
      if (mode === 'tool' && !moved) {
        mode = 'consumed'
        longPressable = false
        return [{ type: 'tool-cancel' }, { type: 'long-press', x: t.x, y: t.y }]
      }
      if (mode === 'pan-pending') {
        mode = 'consumed'
        longPressable = false
        return [{ type: 'long-press', x: t.x, y: t.y }]
      }
      return []
    },

    get active() {
      return pointers.size > 0
    },

    allowsContextMenu() {
      return lastKind !== 'touch'
    }
  }
}
