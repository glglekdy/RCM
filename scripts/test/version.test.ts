import { describe, expect, it } from 'vitest'
import { compareVersions, isValidVersion, tagFor } from '../version.mjs'

describe('version', () => {
  it('버전 형식', () => {
    expect(['0.1.0', '1.2.3', '10.0.11'].every(isValidVersion)).toBe(true)
    expect(['1.2', 'v1.2.3', '01.2.3', '1.2.3-beta', '', '1..3'].some(isValidVersion)).toBe(false)
  })
  it('크기 비교는 숫자로', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1)
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0)
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
  })
  it('태그', () => expect(tagFor('0.1.0')).toBe('v0.1.0'))
})
