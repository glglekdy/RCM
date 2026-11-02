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
    toast('새 버전이 있어요', {
      sticky: true,
      action: {
        label: '새로고침',
        onClick: () => {
          void applyUpdate({
            save: saveActiveIfDirty,
            update: apply,
            onError: (e) =>
              toast(
                `저장하지 못해서 새로고침하지 않았어요: ${e instanceof Error ? e.message : String(e)}`
              )
          })
        }
      }
    })
  }, [apply, toast])

  return null
}
