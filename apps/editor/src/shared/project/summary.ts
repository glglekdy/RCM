import { isFreeChart, parseAnyChart, parseSong } from '@rcm/core'
import type { RecentProject } from '../api'

/** song.json과 채보들의 요약 (최근 목록용). song을 못 읽으면 throw, 못 읽는 채보는 건너뛴다. */
export function summarizeProjectFiles(
  songText: string,
  charts: { file: string; text: string }[]
): { title: string; artist: string; charts: RecentProject['charts'] } {
  const song = parseSong(songText)
  if (!song.ok) throw new Error('invalid song')
  const out: RecentProject['charts'] = []
  for (const c of charts) {
    const parsed = parseAnyChart(c.text, c.file)
    if (!parsed.ok) continue
    const chart = parsed.value
    out.push(
      isFreeChart(chart)
        ? { name: chart.name, trackCount: 0, columns: chart.columns }
        : { name: chart.name, trackCount: chart.tracks.length }
    )
  }
  return { title: song.value.title, artist: song.value.artist, charts: out }
}
