/** 입력칸의 임시 글자(draft) 상태. 사용자가 고친 적이 있는지(edited)를 함께 기억한다. */
export interface Draft {
  text: string
  edited: boolean
}

export function initDraft(text: string): Draft {
  return { text, edited: false }
}

export function editDraft(text: string): Draft {
  return { text, edited: true }
}

/** 바깥 값이 바뀌었을 때: 사용자가 고치는 중이 아니면 (포커스 중이어도) 새 값을 보여준다. */
export function syncDraft(d: Draft, text: string): Draft {
  return d.edited ? d : { text, edited: false }
}

/**
 * blur·Enter 때. 사용자가 고쳤고, 올바른 값이며, 현재 값과 다를 때만 commit을 돌려준다.
 * 다음 draft는 항상 현재 값으로 되돌린다 (거부되면 원래 값 복원).
 */
export function commitDraft<T>(
  d: Draft,
  current: T,
  parse: (text: string) => T | null,
  format: (v: T) => string
): { next: Draft; commit: T | null } {
  const parsed = d.edited ? parse(d.text) : null
  const commit = parsed !== null && parsed !== current ? parsed : null
  return { next: initDraft(format(current)), commit }
}

export function parseNumber(text: string, min?: number, max?: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  if (min !== undefined && n < min) return null
  if (max !== undefined && n > max) return null
  return n
}
