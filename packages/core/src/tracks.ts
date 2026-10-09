import { MAX_TRACKS, MIN_TRACKS, TRACK_COLOR_PATTERN, TRACK_ID_PATTERN } from './constants';
import type { Note, Track } from './types';

export function isValidTrackId(id: string): boolean {
  return TRACK_ID_PATTERN.test(id);
}

const WIDTHS: readonly unknown[] = ['narrow', 'normal', 'wide'];

/** 트랙 목록 검사. 메시지는 `${prefix}[i].필드: 이유` 형태. */
export function trackErrors(tracks: unknown, prefix: string): string[] {
  if (!Array.isArray(tracks)) return [`${prefix}: 배열이어야 함`];
  const errors: string[] = [];
  if (tracks.length < MIN_TRACKS || tracks.length > MAX_TRACKS) {
    errors.push(`${prefix}: ${MIN_TRACKS}~${MAX_TRACKS}개여야 함 (${tracks.length}개)`);
  }
  const seen = new Set<string>();
  tracks.forEach((raw, i) => {
    const p = `${prefix}[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`${p}: 객체여야 함`);
      return;
    }
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== 'string' || !isValidTrackId(t.id)) {
      errors.push(`${p}.id: 영문, 숫자, _, - 1~32자여야 함`);
    } else if (seen.has(t.id)) {
      errors.push(`${p}.id: '${t.id}'가 중복됨`);
    } else {
      seen.add(t.id);
    }
    if (t.color !== undefined && (typeof t.color !== 'string' || !TRACK_COLOR_PATTERN.test(t.color))) {
      errors.push(`${p}.color: #rrggbb 형식이어야 함`);
    }
    if (t.width !== undefined && !WIDTHS.includes(t.width)) {
      errors.push(`${p}.width: narrow, normal, wide 중 하나여야 함`);
    }
  });
  return errors;
}

/** `Note_1`~`Note_n` 기본 트랙. */
export function basicTracks(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => ({ id: `Note_${i + 1}` }));
}

/** `prefix + N` 중 N이 1부터 비어 있는 가장 작은 id. */
export function nextTrackId(tracks: readonly Track[], prefix = 'Note_'): string {
  const used = new Set(tracks.map((t) => t.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function trackIndex(tracks: readonly Track[], id: string): number {
  return tracks.findIndex((t) => t.id === id);
}

/** tick 오름차순, 같은 tick이면 트랙 순서. */
export function compareNotes(tracks: readonly Track[]): (a: Note, b: Note) => number {
  const order = new Map(tracks.map((t, i) => [t.id, i]));
  return (a, b) => a.tick - b.tick || (order.get(a.track) ?? -1) - (order.get(b.track) ?? -1);
}
