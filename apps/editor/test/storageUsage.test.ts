import { describe, expect, it } from 'vitest'
import { formatUsage, readStorageUsage } from '../src/renderer/src/home/storageUsage'

const MB = 1024 * 1024

describe('formatUsage', () => {
  it('rounds to MB', () => {
    expect(formatUsage(120 * MB)).toBe('사용 중 120MB')
    expect(formatUsage(1.6 * MB)).toBe('사용 중 2MB')
  })
  it('handles under 1MB', () => {
    expect(formatUsage(500_000)).toBe('사용 중 1MB 미만')
  })
})

describe('readStorageUsage', () => {
  it('returns null without storage api', async () => {
    expect(await readStorageUsage({})).toBeNull()
  })
  it('returns null when estimate rejects', async () => {
    expect(await readStorageUsage({ storage: { estimate: () => Promise.reject(new Error('x')) } })).toBeNull()
  })
  it('formats usage', async () => {
    expect(await readStorageUsage({ storage: { estimate: async () => ({ usage: 120 * MB }) } })).toBe('사용 중 120MB')
  })
})
