import { FORMAT_VERSION, MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from './constants';
import { trackErrors } from './tracks';
import type { Chart, EditorData, Marker, Note, Song, SpeedEase, SpeedPoint, TimingPoint, Track } from './types';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 같은 트랙이고 `[tick, endTick ?? tick]` 구간이 (끝 포함) 겹치면 true. */
export function notesOverlap(a: Note, b: Note): boolean {
  if (a.track !== b.track) return false;
  const aEnd = a.type === 'hold' ? a.endTick : a.tick;
  const bEnd = b.type === 'hold' ? b.endTick : b.tick;
  return a.tick <= bEnd && b.tick <= aEnd;
}

class Collector {
  readonly errors: string[] = [];
  constructor(private readonly file: string) {}
  add(path: string, reason: string): void {
    this.errors.push(`${this.file} › ${path}: ${reason}`);
  }
}

function checkFormatVersion(root: Obj, c: Collector): void {
  if (root.formatVersion !== FORMAT_VERSION) {
    c.add('formatVersion', `지원하지 않는 버전 (${JSON.stringify(root.formatVersion)}, ${FORMAT_VERSION}만 지원)`);
  }
}

function str(root: Obj, key: string, c: Collector): string {
  const v = root[key];
  if (typeof v !== 'string') {
    c.add(key, '문자열이어야 함');
    return '';
  }
  return v;
}

function num(root: Obj, key: string, c: Collector): number {
  const v = root[key];
  if (!isNum(v)) {
    c.add(key, '숫자여야 함');
    return 0;
  }
  return v;
}

export function validateSong(root: Obj, file: string): ParseResult<Song> {
  const c = new Collector(file);
  checkFormatVersion(root, c);
  const title = str(root, 'title', c);
  const artist = str(root, 'artist', c);
  const audio = str(root, 'audio', c);
  const offsetMs = num(root, 'offsetMs', c);
  const previewStartMs = num(root, 'previewStartMs', c);

  const timing: TimingPoint[] = [];
  const rawTiming = root.timing;
  if (!Array.isArray(rawTiming) || rawTiming.length === 0) {
    c.add('timing', '비어 있지 않은 배열이어야 함');
  } else {
    let prevTick = -1;
    rawTiming.forEach((raw, i) => {
      const p = `timing[${i}]`;
      if (!isObj(raw)) {
        c.add(p, '객체여야 함');
        return;
      }
      const point: TimingPoint = { tick: 0, bpm: 0 };
      if (!isInt(raw.tick) || raw.tick < 0) {
        c.add(p, 'tick은 0 이상의 정수여야 함');
      } else {
        point.tick = raw.tick;
        if (i === 0 && raw.tick !== 0) c.add(p, '첫 항목의 tick은 0이어야 함');
        else if (i > 0 && raw.tick <= prevTick) c.add(p, `tick이 앞 항목(${prevTick})보다 커야 함`);
        prevTick = raw.tick;
      }
      if (!isNum(raw.bpm) || raw.bpm <= 0) c.add(p, 'bpm은 0보다 큰 숫자여야 함');
      else point.bpm = raw.bpm;
      if (raw.beatsPerMeasure !== undefined) {
        if (!isInt(raw.beatsPerMeasure) || raw.beatsPerMeasure < 1 || raw.beatsPerMeasure > 16) {
          c.add(p, 'beatsPerMeasure는 1~16 정수여야 함');
        } else {
          point.beatsPerMeasure = raw.beatsPerMeasure;
        }
      }
      timing.push(point);
    });
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  return { ok: true, value: { formatVersion: FORMAT_VERSION, title, artist, audio, offsetMs, previewStartMs, timing } };
}

export function validateChart(root: Obj, file: string): ParseResult<Chart> {
  if (
    root.lanes !== undefined ||
    (Array.isArray(root.notes) && root.notes.some((n) => isObj(n) && n.lane !== undefined))
  ) {
    return { ok: false, errors: [`${file}: 예전 포맷은 지원하지 않아요`] };
  }
  const c = new Collector(file);
  checkFormatVersion(root, c);
  const name = str(root, 'name', c);
  const level = num(root, 'level', c);

  const tracks: Track[] = [];
  const trackProblems = trackErrors(root.tracks, `${file} › tracks`);
  c.errors.push(...trackProblems);
  if (trackProblems.length === 0) {
    for (const raw of root.tracks as Obj[]) {
      const t: Track = { id: raw.id as string };
      if (raw.color !== undefined) t.color = raw.color as string;
      // 'play'는 생략형으로, 예전 width는 버린다
      if (raw.kind === 'gimmick') t.kind = 'gimmick';
      tracks.push(t);
    }
  }
  const trackIds = new Set(tracks.map((t) => t.id));

  const speeds: SpeedPoint[] = [];
  if (root.speeds !== undefined) {
    if (!Array.isArray(root.speeds)) {
      c.add('speeds', '배열이어야 함');
    } else {
      let prevTick = -1;
      root.speeds.forEach((raw, i) => {
        const p = `speeds[${i}]`;
        if (!isObj(raw)) {
          c.add(p, '객체여야 함');
          return;
        }
        const before = c.errors.length;
        if (!isInt(raw.tick) || raw.tick < 0) {
          c.add(`${p}.tick`, '0 이상의 정수여야 함');
        } else {
          if (raw.tick <= prevTick) c.add(`${p}.tick`, `앞 항목(${prevTick})보다 커야 함`);
          prevTick = raw.tick;
        }
        if (!isNum(raw.speed) || raw.speed < MIN_SCROLL_SPEED || raw.speed > MAX_SCROLL_SPEED) {
          c.add(`${p}.speed`, `${MIN_SCROLL_SPEED}~${MAX_SCROLL_SPEED} 사이여야 함`);
        }
        if (raw.ease !== undefined && raw.ease !== 'instant' && raw.ease !== 'linear') {
          c.add(`${p}.ease`, '"instant" 또는 "linear"여야 함');
        }
        if (c.errors.length > before) return;
        const point: SpeedPoint = { tick: raw.tick as number, speed: raw.speed as number };
        if (raw.ease !== undefined) point.ease = raw.ease as SpeedEase;
        speeds.push(point);
      });
    }
  }

  const notes: Note[] = [];
  const noteIndex: number[] = [];
  if (!Array.isArray(root.notes)) {
    c.add('notes', '배열이어야 함');
  } else {
    root.notes.forEach((raw, i) => {
      const p = `notes[${i}]`;
      if (!isObj(raw)) {
        c.add(p, '객체여야 함');
        return;
      }
      const before = c.errors.length;
      if (!isInt(raw.tick) || raw.tick < 0) c.add(p, 'tick은 0 이상의 정수여야 함');
      if (typeof raw.track !== 'string') c.add(`${p}.track`, '문자열이어야 함');
      else if (trackProblems.length === 0 && !trackIds.has(raw.track)) {
        c.add(`${p}.track`, `'${raw.track}' 트랙이 없음`);
      }
      if (raw.type !== 'tap' && raw.type !== 'hold') c.add(p, 'type은 "tap" 또는 "hold"여야 함');
      else if (raw.type === 'hold') {
        if (!isInt(raw.endTick)) c.add(p, 'hold의 endTick은 정수여야 함');
        else if (isInt(raw.tick) && raw.endTick <= raw.tick) c.add(p, 'endTick은 tick보다 커야 함');
      }
      if (c.errors.length > before) return;
      notes.push(
        raw.type === 'hold'
          ? { tick: raw.tick as number, track: raw.track as string, type: 'hold', endTick: raw.endTick as number }
          : { tick: raw.tick as number, track: raw.track as string, type: 'tap' },
      );
      noteIndex.push(i);
    });

    // 겹침: 트랙별로 tick 정렬 후 인접한 노트끼리 비교
    const byTrack = new Map<string, number[]>();
    notes.forEach((n, k) => {
      const list = byTrack.get(n.track);
      if (list) list.push(k);
      else byTrack.set(n.track, [k]);
    });
    for (const list of byTrack.values()) {
      list.sort((a, b) => notes[a].tick - notes[b].tick || noteIndex[a] - noteIndex[b]);
      for (let j = 1; j < list.length; j++) {
        const prev = list[j - 1];
        const cur = list[j];
        if (notesOverlap(notes[prev], notes[cur])) {
          const [first, second] = [noteIndex[prev], noteIndex[cur]].sort((x, y) => x - y);
          c.add(`notes[${second}]`, `트랙 ${notes[cur].track}에서 notes[${first}]와 겹침`);
        }
      }
    }
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  const value: Chart = { formatVersion: FORMAT_VERSION, name, level, tracks, notes };
  if (speeds.length > 0) value.speeds = speeds;
  return { ok: true, value };
}

export function validateEditorData(root: Obj, file: string): ParseResult<EditorData> {
  const c = new Collector(file);
  checkFormatVersion(root, c);
  const markers: Marker[] = [];
  if (root.markers !== undefined) {
    if (!Array.isArray(root.markers)) {
      c.add('markers', '배열이어야 함');
    } else {
      root.markers.forEach((raw, i) => {
        const p = `markers[${i}]`;
        if (!isObj(raw)) c.add(p, '객체여야 함');
        else if (!isNum(raw.ms)) c.add(p, 'ms는 숫자여야 함');
        else if (raw.label !== undefined && typeof raw.label !== 'string') c.add(p, 'label은 문자열이어야 함');
        else markers.push({ ms: raw.ms, label: (raw.label as string | undefined) ?? '' });
      });
    }
  }
  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  // 손으로 고친 파일도 ms 순으로 (같은 ms는 원래 순서: sort는 안정 정렬)
  markers.sort((a, b) => a.ms - b.ms);
  return { ok: true, value: { formatVersion: FORMAT_VERSION, markers } };
}
