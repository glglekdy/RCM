import { describe, expect, it } from 'vitest'
import { relativeTime } from '../../src/renderer/src/home/relativeTime'

const now = 10 * 86400000

describe('relativeTime', () => {
  it.each([
    [now - 5000, '방금 전'],
    [now - 5 * 60000, '5분 전'],
    [now - 3 * 3600000, '3시간 전'],
    [now - 2 * 86400000, '2일 전']
  ])('%#', (then, text) => expect(relativeTime(then, now)).toBe(text))
})
