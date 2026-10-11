import greetings from './greetings.json'

export const DEFAULT_GREETING = 'RCM 채보 에디터'

/** 문구 목록에서 하나를 고른다. 문구가 둘 이상이면 바로 전 문구는 피한다. 쓸 문구가 없으면 기본 문구. */
export function pickGreeting(list: unknown, previous: string | null, random: () => number = Math.random): string {
  const usable = Array.isArray(list)
    ? list.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim())
    : []
  if (usable.length === 0) return DEFAULT_GREETING
  const pool = usable.length > 1 ? usable.filter((s) => s !== previous) : usable
  const from = pool.length > 0 ? pool : usable
  return from[Math.min(Math.floor(random() * from.length), from.length - 1)]
}

let last: string | null = null

/** 홈 화면에 들어올 때마다 `greetings.json`에서 문구 하나를 무작위로 고른다. */
export function nextGreeting(): string {
  last = pickGreeting(greetings, last)
  return last
}
