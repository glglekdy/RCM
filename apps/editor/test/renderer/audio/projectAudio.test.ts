import { describe, expect, it } from 'vitest'
import { TimingMap } from '@rcm/core'
import {
  SILENT_MIN_MS,
  projectAudioPath,
  silentDurationMs
} from '../../../src/renderer/src/editor/audio/projectAudio'
import { d0, withNotes } from '../fixtures'

describe('projectAudio', () => {
  it('폴더 경로의 구분자로 음악 경로를 만든다', () => {
    expect(projectAudioPath('C:\\p\\song', 'audio.ogg')).toBe('C:\\p\\song\\audio.ogg')
    expect(projectAudioPath('C:\\p\\', 'audio.ogg')).toBe('C:\\p\\audio.ogg')
    expect(projectAudioPath('/home/p', 'audio-2.mp3')).toBe('/home/p/audio-2.mp3')
  })

  it('음악이 없으면 기본 3분, 노트가 더 뒤면 마지막 노트 끝 + 10초', () => {
    const tm = new TimingMap(d0.song.timing, d0.song.offsetMs)
    expect(silentDurationMs(d0, tm)).toBe(SILENT_MIN_MS)
    // 120 BPM: 1박 = 480 tick = 500ms → 400박 = 200초
    const tap = withNotes(d0, [{ tick: 480 * 400, track: 'Note_1', type: 'tap' }])
    expect(silentDurationMs(tap, tm)).toBe(210_000)
    const hold = withNotes(d0, [{ tick: 0, track: 'Note_1', type: 'hold', endTick: 480 * 500 }])
    expect(silentDurationMs(hold, tm)).toBe(260_000)
  })
})
