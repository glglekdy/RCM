import { describe, it, expect } from 'vitest'
import {
  copiedAudioName,
  extOf,
  isAudioFile,
  isChartFileName,
  isCopiedAudioName,
  isProjectFileName,
  isSafeZipEntry
} from '../../../src/shared/project/files'

describe('extOf', () => {
  it('소문자 확장자, 없으면 빈 문자열', () => {
    expect(extOf('C:\\a\\Song.OGG')).toBe('.ogg')
    expect(extOf('a/b.c/noext')).toBe('')
    expect(extOf('noext')).toBe('')
    expect(extOf('x.tar.gz')).toBe('.gz')
  })
})

describe('파일 이름 분류', () => {
  it('음악 파일', () => {
    expect(isAudioFile('a.OGG')).toBe(true)
    expect(isAudioFile('a.mp3')).toBe(true)
    expect(isAudioFile('a.wav')).toBe(true)
    expect(isAudioFile('a.flac')).toBe(false)
  })

  it('채보 파일', () => {
    expect(isChartFileName('hard.chart.json')).toBe(true)
    expect(isChartFileName('HARD.CHART.JSON')).toBe(true)
    expect(isChartFileName('song.json')).toBe(false)
  })

  it('프로젝트 파일: song.json, editor.json, 채보, 음악만', () => {
    for (const ok of ['song.json', 'editor.json', 'a.chart.json', 'a (RCM).ogg']) {
      expect(isProjectFileName(ok)).toBe(true)
    }
    for (const bad of ['readme.txt', 'cover.png', 'Song.json', 'a.exe']) expect(isProjectFileName(bad)).toBe(false)
  })
})

describe('isSafeZipEntry', () => {
  it('프로젝트 폴더 안 경로는 안전', () => {
    expect(isSafeZipEntry('My Song/song.json')).toBe(true)
    expect(isSafeZipEntry('song.json')).toBe(true)
  })

  it('폴더 밖을 가리키는 경로는 거부', () => {
    for (const bad of ['../x', 'a/../../x', '/abs', 'C:/x', 'a\\b']) expect(isSafeZipEntry(bad)).toBe(false)
  })
})

describe('복사한 음악 파일 이름', () => {
  it('원래 이름 뒤에 (RCM)을 붙인다 (경로는 마지막 조각만)', () => {
    expect(copiedAudioName('C:\\m\\봄날.mp3', () => false)).toBe('봄날 (RCM).mp3')
    expect(copiedAudioName('/m/Song.OGG', () => false)).toBe('Song (RCM).ogg')
  })

  it('이미 있으면 번호를 붙이고, 붙어 있던 표시는 떼고 다시 붙인다', () => {
    expect(copiedAudioName('봄날 (RCM).mp3', (n) => n === '봄날 (RCM).mp3')).toBe('봄날 (2) (RCM).mp3')
    expect(copiedAudioName('a.wav', (n) => n === 'a (RCM).wav' || n === 'a (2) (RCM).wav')).toBe('a (3) (RCM).wav')
  })

  it('에디터가 복사한 이름인지: (RCM) 표시와 예전 audio[-n]', () => {
    expect(isCopiedAudioName('audio-2.wav')).toBe(true)
    expect(isCopiedAudioName('audio.ogg')).toBe(true)
    expect(isCopiedAudioName('봄날 (2) (RCM).mp3')).toBe(true)
    expect(isCopiedAudioName('mine.ogg')).toBe(false)
  })
})
