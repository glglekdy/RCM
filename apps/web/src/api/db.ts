export const DB_NAME = 'rcm'
export const DB_VERSION = 1

export const QUOTA_MESSAGE = '저장 공간이 부족해요. 쓰지 않는 프로젝트를 ZIP으로 내보내고 지워 주세요'

/** 저장소 네 개를 모두 여기서 만든다: Phase 1 동안 스키마 버전을 올릴 일이 없다 */
function createStores(db: IDBDatabase): void {
  db.createObjectStore('projects', { keyPath: 'id' })
  db.createObjectStore('files', { keyPath: ['projectId', 'name'] })
  db.createObjectStore('settings')
  db.createObjectStore('hitEffects')
}

export function openRcmDb(name: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, DB_VERSION)
    open.onupgradeneeded = () => createStores(open.result)
    open.onsuccess = () => {
      const db = open.result
      // 다른 탭이 버전을 올리려 하면 연결을 닫아 막지 않는다
      db.onversionchange = () => db.close()
      resolve(db)
    }
    open.onerror = () => reject(open.error ?? new Error('저장소를 열 수 없어요'))
    open.onblocked = () => reject(new Error('다른 탭이 저장소를 쓰고 있어요. 그 탭을 닫고 다시 열어 주세요'))
  })
}

/** QuotaExceededError는 안내 문구로 바꾸고, 나머지는 그대로 둔다 */
function friendly(e: unknown): unknown {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError'
    ? new Error(QUOTA_MESSAGE)
    : e
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(friendly(r.error))
  })
}

/**
 * 트랜잭션 하나를 열어 `run`을 실행하고, 트랜잭션이 `complete`된 뒤 `run`의 결과로 resolve한다.
 * `run`이 throw/reject하면 트랜잭션을 취소(`abort`)하고 그 오류로 reject한다.
 * `run` 안에서는 IndexedDB 요청 말고 다른 것을 await하지 않는다 (트랜잭션이 먼저 끝난다).
 */
export function tx<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => T | Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction
    try {
      t = db.transaction(stores, mode)
    } catch (e) {
      reject(friendly(e))
      return
    }
    let result: T
    const fail = (e: unknown): void => {
      reject(friendly(e))
      try {
        t.abort()
      } catch {
        // 이미 끝났다
      }
    }
    t.oncomplete = () => resolve(result)
    // 요청 오류는 트랜잭션을 취소시키므로 `onabort`에서 한 번만 처리한다 (`t.error`는 이때 채워진다)
    t.onabort = () => reject(friendly(t.error ?? new Error('저장하지 못했어요')))
    try {
      const out = run(t)
      if (out instanceof Promise) out.then((v) => (result = v), fail)
      else result = out
    } catch (e) {
      fail(e)
    }
  })
}
