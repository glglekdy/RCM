import type { JudgeEvent } from './judge';
import type { PlayState } from './playState';

/** state별 레인 수와 아직 누르지 않은 첫 노트 위치 (매 프레임 전체를 훑지 않도록) */
const progress = new WeakMap<PlayState, { lanes: number; next: number }>();

/**
 * 자동 플레이 한 프레임: 끝난 롱노트는 끝 시각에 떼고, 시각이 된 노트는 노트 시각 그대로 누른다.
 * 노트 시각에 누르므로 모두 PERFECT. `state.update(now)`보다 먼저 부른다.
 */
export function autoplayStep(state: PlayState, now: number): JudgeEvent[] {
  const notes = state.notes;
  let p = progress.get(state);
  if (!p) {
    p = { lanes: notes.reduce((max, n) => Math.max(max, n.lane + 1), 0), next: 0 };
    progress.set(state, p);
  }
  const events: JudgeEvent[] = [];
  for (let lane = 0; lane < p.lanes; lane++) {
    const held = state.heldNote(lane);
    const endMs = held >= 0 ? notes[held].endMs : undefined;
    if (endMs !== undefined && endMs <= now) events.push(...state.release(lane, endMs));
  }
  while (p.next < notes.length && notes[p.next].startMs <= now) {
    const n = notes[p.next++];
    if (n.headJudged) continue;
    // A frame can skip past a long note's end and the next same-lane note together, so release the long note first
    const held = state.heldNote(n.lane);
    const endMs = held >= 0 ? notes[held].endMs : undefined;
    if (endMs !== undefined && endMs <= n.startMs) events.push(...state.release(n.lane, endMs));
    events.push(...state.press(n.lane, n.startMs));
  }
  return events;
}
