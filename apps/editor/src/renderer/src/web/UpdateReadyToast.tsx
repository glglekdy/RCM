import { useEffect, useRef } from 'react'
import { saveActiveIfDirty } from '../editor/activeSave'
import { useToast } from '../ui'
import { applyUpdate, useUpdateReady } from './pwaStore'

/** 새 버전이 준비되면 한 번만 알린다. 저장한 뒤에만 새로고침한다 */
export function UpdateReadyToast() {
  const apply = useUpdateReady()
  const toast = useToast()
  const shown = useRef(false)

  useEffect(() => {
    if (!apply || shown.current) return
    shown.current = true
    const show = (): void => {
      toast('새 버전이 있어요', {
        sticky: true,
        action: {
          label: '새로고침',
          onClick: () => {
            void applyUpdate({
              save: saveActiveIfDirty,
              update: apply,
              onError: (e) => {
                toast(
                  `저장하지 못해서 새로고침하지 않았어요: ${e instanceof Error ? e.message : String(e)}`
                )
                // 다시 시도할 수 있게 알림을 다시 띄운다
                show()
              }
            })
          }
        }
      })
    }
    show()
  }, [apply, toast])

  return null
}
