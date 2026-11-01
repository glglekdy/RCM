import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openRcmDb, req, tx } from '../src/api/db'

let n = 0
const freshDb = () => openRcmDb(`db-${++n}`)

describe('openRcmDb', () => {
  it('저장소 네 개를 만들어요', async () => {
    const db = await freshDb()
    expect([...db.objectStoreNames].sort()).toEqual(['files', 'hitEffects', 'projects', 'settings'])
    expect(db.version).toBe(1)
  })
})

describe('tx', () => {
  it('완료된 뒤에 결과를 돌려줘요', async () => {
    const db = await freshDb()
    await tx(db, ['settings'], 'readwrite', (t) => {
      t.objectStore('settings').put(7, 'a')
    })
    const v = await tx(db, ['settings'], 'readonly', (t) => req(t.objectStore('settings').get('a')))
    expect(v).toBe(7)
  })

  it('안에서 throw하면 같은 트랜잭션의 put이 남지 않아요', async () => {
    const db = await freshDb()
    await expect(
      tx(db, ['settings'], 'readwrite', async (t) => {
        t.objectStore('settings').put(1, 'x')
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    const v = await tx(db, ['settings'], 'readonly', (t) => req(t.objectStore('settings').get('x')))
    expect(v).toBeUndefined()
  })

  it('기다리지 않은 요청이 실패해도 진짜 오류로 reject해요', async () => {
    const db = await freshDb()
    await tx(db, ['projects'], 'readwrite', (t) => {
      t.objectStore('projects').add({ id: 'a' })
    })
    const err = await tx(db, ['projects'], 'readwrite', (t) => {
      t.objectStore('projects').add({ id: 'a' })
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).toBe('ConstraintError')
  })

  it('트랜잭션이 QuotaExceededError로 취소되면 안내 문구로 reject해요', async () => {
    // fake-indexeddb로는 저장 공간 부족을 만들 수 없어서, 취소된 트랜잭션을 흉내 낸 가짜 db를 쓴다
    const fake = {
      transaction: () => {
        const t: { error: unknown; onabort?: () => void } = { error: null }
        queueMicrotask(() => {
          t.error = new DOMException('full', 'QuotaExceededError')
          t.onabort?.()
        })
        return t
      }
    } as unknown as IDBDatabase
    await expect(tx(fake, ['settings'], 'readwrite', () => {})).rejects.toThrow(
      '저장 공간이 부족해요. 쓰지 않는 프로젝트를 ZIP으로 내보내고 지워 주세요'
    )
  })

  it('QuotaExceededError는 안내 문구로 바꿔요', async () => {
    const db = await freshDb()
    await expect(
      tx(db, ['settings'], 'readwrite', () => {
        throw new DOMException('full', 'QuotaExceededError')
      })
    ).rejects.toThrow('저장 공간이 부족해요. 쓰지 않는 프로젝트를 ZIP으로 내보내고 지워 주세요')
  })
})
