import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ScrollMap, TimingMap, type Chart, type SpeedPoint, type TimingPoint } from '@rcm/core'
import { PlayState } from '@rcm/playfield'

/**
 * docs/CHART_FORMAT_GUIDE.md는 배포판의 `AI 가이드` 메뉴로 사용자에게 그대로 전달된다.
 * 사용자에게는 저장소도 비공개 패키지(@rcm/*)도 없으므로, 문서는 그것을 가리키지 않고
 * 문서 안의 참고 구현이 실제 구현과 같게 동작해야 한다.
 */
// Windows CI는 core.autocrlf로 CRLF 체크아웃을 하므로 줄바꿈을 맞춘 뒤 코드 블록을 찾는다
const guide = readFileSync(resolve(__dirname, '../../../../docs/CHART_FORMAT_GUIDE.md'), 'utf8').replace(
  /\r\n/g,
  '\n'
)

/** 문서의 ```ts 블록 중 `export`가 있는 것(참고 구현)만 이어 붙인다. 사용 예 블록은 뺀다. */
function referenceSource(): string {
  const blocks = [...guide.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1])
  return blocks.filter((b) => /^export /m.test(b)).join('\n')
}

describe('CHART_FORMAT_GUIDE.md', () => {
  it('배포판 사용자가 볼 수 없는 저장소 경로나 비공개 패키지를 가리키지 않는다', () => {
    for (const ref of ['@rcm/', 'packages/', 'apps/editor', 'docs/superpowers', '.ts`']) {
      expect(guide, ref).not.toContain(ref)
    }
  })

  describe('참고 구현이 실제 구현과 같게 동작한다', () => {
    let dir: string
    let ref: {
      TimingMap: new (timing: TimingPoint[], offsetMs: number) => TimingMap
      ScrollMap: new (speeds: SpeedPoint[] | undefined, tm: TimingMap) => ScrollMap
      PlayState: new (chart: Chart, tm: TimingMap, fromMs: number) => PlayState
    }

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'rcm-guide-'))
      const file = join(dir, 'reference.ts')
      writeFileSync(file, referenceSource())
      ref = await import(/* @vite-ignore */ file)
    })

    afterAll(() => rmSync(dir, { recursive: true, force: true }))

    const timing: TimingPoint[] = [
      { tick: 0, bpm: 150, beatsPerMeasure: 4 },
      { tick: 1920, bpm: 75 },
      { tick: 4800, bpm: 200 }
    ]

    it('TimingMap: 문서 검산값과 실제 구현', () => {
      const doc = new ref.TimingMap(
        [
          { tick: 0, bpm: 120 },
          { tick: 1920, bpm: 60 }
        ],
        0
      )
      expect([480, 1920, 2400].map((t) => doc.tickToMs(t))).toEqual([500, 2000, 3000])

      const a = new ref.TimingMap(timing, 120)
      const b = new TimingMap(timing, 120)
      for (const tick of [-480, 0, 100, 1920, 2500, 4800, 9000]) {
        expect(a.tickToMs(tick)).toBeCloseTo(b.tickToMs(tick), 9)
      }
      for (const ms of [-500, 0, 120, 1000, 3000, 6000, 20000]) {
        expect(a.msToTick(ms)).toBeCloseTo(b.msToTick(ms), 9)
      }
    })

    it('ScrollMap: 문서 검산값과 실제 구현', () => {
      const tm0 = new ref.TimingMap([{ tick: 0, bpm: 120 }], 0)
      const cases: [SpeedPoint[], number, number][] = [
        [[{ tick: 960, speed: 2 }], 1500, 2000],
        [[{ tick: 960, speed: 1 }, { tick: 1920, speed: 3, ease: 'linear' }], 1500, 1750],
        [[{ tick: 960, speed: 1 }, { tick: 1920, speed: 3, ease: 'linear' }], 2000, 3000],
        [[{ tick: 960, speed: 0 }, { tick: 1440, speed: 1 }], 1200, 1000],
        [[{ tick: 960, speed: 0 }, { tick: 1440, speed: 1 }], 1700, 1200]
      ]
      for (const [speeds, t, s] of cases) {
        expect(new ref.ScrollMap(speeds, tm0).positionAt(t)).toBeCloseTo(s, 9)
      }

      const speeds: SpeedPoint[] = [
        { tick: 480, speed: 1.5, ease: 'linear' },
        { tick: 1920, speed: 0 },
        { tick: 2400, speed: 2 },
        { tick: 5000, speed: 0.5, ease: 'linear' }
      ]
      const a = new ref.ScrollMap(speeds, new ref.TimingMap(timing, 120))
      const b = new ScrollMap(speeds, new TimingMap(timing, 120))
      for (let ms = -500; ms < 10000; ms += 137) {
        expect(a.positionAt(ms)).toBeCloseTo(b.positionAt(ms), 9)
        expect(a.speedAt(ms)).toBeCloseTo(b.speedAt(ms), 9)
      }
    })

    it('PlayState: 같은 입력에 같은 판정', () => {
      const chart: Chart = {
        formatVersion: 1,
        name: 'T',
        level: 1,
        tracks: [{ id: 'Note_1' }, { id: 'Note_2' }, { id: 'Saw', kind: 'gimmick' }],
        notes: [
          { tick: 480, track: 'Note_1', type: 'tap' },
          { tick: 480, track: 'Saw', type: 'tap' },
          { tick: 1920, track: 'Saw', type: 'hold', endTick: 2400 },
          { tick: 960, track: 'Note_2', type: 'hold', endTick: 1920 },
          { tick: 1440, track: 'Note_1', type: 'tap' },
          { tick: 2400, track: 'Note_1', type: 'hold', endTick: 2880 },
          { tick: 2880, track: 'Note_2', type: 'tap' },
          { tick: 3840, track: 'Note_2', type: 'tap' }
        ]
      }
      // 120 BPM: 노트 시각 500 / 1000~2000(hold) / 1500 / 2500~3000(hold) / 3000 / 4000 ms
      const inputs: ['press' | 'release' | 'update', number, number][] = [
        ['press', 0, 300], // 창 밖: 무시
        ['press', 0, 510], // PERFECT
        ['press', 1, 1060], // GREAT, 롱노트 누르는 중
        ['press', 0, 1590], // GOOD
        ['release', 1, 1850], // 일찍 뗌: 꼬리 MISS
        ['press', 0, 2500], // PERFECT, 롱노트 누르는 중
        ['update', 0, 3000], // 끝까지 누름: 꼬리 PERFECT
        ['release', 0, 3010],
        ['update', 0, 3200], // 3000ms 노트 놓침: MISS
        ['press', 2, 500], // 기믹 레인: 판정 없음
        ['update', 0, 2600], // 기믹 롱노트가 지나가도 판정 없음
        ['press', 1, 4000], // PERFECT
        ['update', 0, 5000]
      ]
      const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)
      const run = (s: PlayState) => {
        const events = inputs.map(([kind, lane, ms]) =>
          kind === 'update' ? s.update(ms) : s[kind](lane, ms)
        )
        return { events, combo: s.combo, maxCombo: s.maxCombo, counts: s.counts }
      }
      const expected = run(new PlayState(chart, tm, 0))
      expect(run(new ref.PlayState(chart, new ref.TimingMap([{ tick: 0, bpm: 120 }], 0), 0))).toEqual(expected)
      expect(expected.counts).toEqual({ perfect: 4, great: 1, good: 1, miss: 2 })
    })
  })
})
