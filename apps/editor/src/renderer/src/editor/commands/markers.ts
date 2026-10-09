import type { Marker } from '@rcm/core'
import type { ProjectDoc } from '../state/doc'
import { msToY, type TimelineView } from '../timeline/view'

function withMarkers(doc: ProjectDoc, markers: Marker[]): ProjectDoc {
  return { ...doc, editorData: { ...doc.editorData, markers } }
}

/** ms 오름차순 위치에 라벨 없는 마커를 넣는다. */
export function addMarker(doc: ProjectDoc, ms: number): ProjectDoc {
  const markers = doc.editorData.markers
  let at = markers.findIndex((m) => m.ms > ms)
  if (at < 0) at = markers.length
  return withMarkers(doc, [...markers.slice(0, at), { ms, label: '' }, ...markers.slice(at)])
}

export function removeMarker(doc: ProjectDoc, index: number): ProjectDoc | null {
  const markers = doc.editorData.markers
  if (!Number.isInteger(index) || index < 0 || index >= markers.length) return null
  return withMarkers(
    doc,
    markers.filter((_, i) => i !== index)
  )
}

export function renameMarker(doc: ProjectDoc, index: number, label: string): ProjectDoc | null {
  const markers = doc.editorData.markers
  if (!Number.isInteger(index) || index < 0 || index >= markers.length) return null
  return withMarkers(
    doc,
    markers.map((m, i) => (i === index ? { ...m, label } : m))
  )
}

/** 현재 위치에서 1ms보다 멀리 있는 다음(1)/이전(-1) 마커 시각. 없으면 null. */
export function neighborMarkerMs(markers: Marker[], ms: number, dir: 1 | -1): number | null {
  if (dir === 1) return markers.find((m) => m.ms > ms + 1)?.ms ?? null
  for (let i = markers.length - 1; i >= 0; i--) if (markers[i].ms < ms - 1) return markers[i].ms
  return null
}

/** 화면 y에 있는 마커의 index. 없으면 -1. */
export function markerAtY(
  markers: Marker[],
  view: TimelineView,
  y: number,
  tolerancePx = 4
): number {
  let best = -1
  let bestDist = Infinity
  markers.forEach((m, i) => {
    const d = Math.abs(msToY(view, m.ms) - y)
    if (d <= tolerancePx && d < bestDist) {
      best = i
      bestDist = d
    }
  })
  return best
}
