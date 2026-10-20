import {
  FLICK_DIRECTIONS,
  FORMAT_VERSION,
  MAX_COLUMNS,
  MAX_GIMMICK_NAME_LENGTH,
  MAX_GIMMICKS,
  MAX_SCROLL_SPEED,
  MIN_COLUMNS,
  MIN_SCROLL_SPEED,
  SLIDE_EASES,
  TRACK_COLOR_PATTERN,
} from './constants';
import { trackErrors } from './tracks';
import {
  freeNoteTick,
  type AnyChart,
  type Chart,
  type EditorData,
  type FlickDirection,
  type FlickMode,
  type FreeChart,
  type FreeGimmick,
  type FreeNote,
  type Marker,
  type Note,
  type SlideEase,
  type SlidePoint,
  type Song,
  type SpeedEase,
  type SpeedPoint,
  type TimingPoint,
  type Track,
} from './types';

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

function readSpeeds(root: Obj, c: Collector): SpeedPoint[] {
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
  return speeds;
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
  if (root.layout !== undefined) {
    return { ok: false, errors: [`${file} › layout: 레인형 채보가 아님 (${JSON.stringify(root.layout)})`] };
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

  const speeds = readSpeeds(root, c);

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

/** 같은 tick에 가로 구간이 겹치면 true (끝이 맞닿는 것은 허용). 슬라이드는 첫 지점으로 본다. */
export function freeNotesOverlap(a: FreeNote, b: FreeNote): boolean {
  if (freeNoteTick(a) !== freeNoteTick(b)) return false;
  const pa = a.type === 'slide' ? a.points[0] : a;
  const pb = b.type === 'slide' ? b.points[0] : b;
  return pa.x < pb.x + pb.width && pb.x < pa.x + pa.width;
}

/** x·width 검사. 문제가 있으면 오류를 남기고 false. */
function checkSpan(raw: Obj, p: string, columns: number | undefined, c: Collector): boolean {
  const before = c.errors.length;
  if (!isNum(raw.x) || raw.x < 0) c.add(`${p}.x`, '0 이상의 숫자여야 함');
  if (!isNum(raw.width) || raw.width <= 0) c.add(`${p}.width`, '0보다 큰 숫자여야 함');
  if (c.errors.length === before && columns !== undefined && (raw.x as number) + (raw.width as number) > columns) {
    c.add(p, `x + width가 칸 수(${columns})를 넘음`);
  }
  return c.errors.length === before;
}

/** 플릭 방향 검사. directional이면 필수, any면 쓰면 안 된다. */
function checkDirection(raw: Obj, p: string, mode: FlickMode | undefined, c: Collector): void {
  if (mode === 'directional') {
    if (!(FLICK_DIRECTIONS as readonly unknown[]).includes(raw.direction)) {
      c.add(`${p}.direction`, `${FLICK_DIRECTIONS.join(', ')} 중 하나여야 함`);
    }
  } else if (mode === 'any' && raw.direction !== undefined) {
    c.add(`${p}.direction`, 'flickMode가 "any"면 방향을 쓰지 않음');
  }
}

function readSlide(
  raw: Obj,
  p: string,
  columns: number | undefined,
  mode: FlickMode | undefined,
  gimmicks: readonly string[] | undefined,
  c: Collector,
): FreeNote | null {
  if (!Array.isArray(raw.points) || raw.points.length < 2) {
    c.add(`${p}.points`, '2개 이상의 배열이어야 함');
    return null;
  }
  const before = c.errors.length;
  const points: SlidePoint[] = [];
  const last = raw.points.length - 1;
  let prevTick = -1;
  raw.points.forEach((rp, j) => {
    const pp = `${p}.points[${j}]`;
    if (!isObj(rp)) {
      c.add(pp, '객체여야 함');
      return;
    }
    const pointBefore = c.errors.length;
    if (!isInt(rp.tick) || rp.tick < 0) {
      c.add(`${pp}.tick`, '0 이상의 정수여야 함');
    } else {
      if (rp.tick <= prevTick) c.add(`${pp}.tick`, `앞 지점(${prevTick})보다 커야 함`);
      prevTick = rp.tick;
    }
    checkSpan(rp, pp, columns, c);
    if (rp.ease !== undefined && !(SLIDE_EASES as readonly unknown[]).includes(rp.ease)) {
      c.add(`${pp}.ease`, `${SLIDE_EASES.join(', ')} 중 하나여야 함`);
    }
    if (rp.hidden !== undefined && rp.hidden !== false) {
      if (rp.hidden !== true) c.add(`${pp}.hidden`, 'true 또는 false여야 함');
      else if (j === 0 || j === last) c.add(`${pp}.hidden`, '중간 지점에만 쓸 수 있음');
    }
    if (c.errors.length > pointBefore) return;
    const point: SlidePoint = { tick: rp.tick as number, x: rp.x as number, width: rp.width as number };
    // 'linear'와 false는 생략형으로
    if (rp.ease !== undefined && rp.ease !== 'linear') point.ease = rp.ease as SlideEase;
    if (rp.hidden === true) point.hidden = true;
    points.push(point);
  });
  if (raw.endFlick !== undefined && typeof raw.endFlick !== 'boolean') c.add(`${p}.endFlick`, 'true 또는 false여야 함');
  if (raw.gimmick !== undefined) {
    // 기믹 슬라이드: 판정이 없으므로 끝 플릭도 없다
    if (typeof raw.gimmick !== 'string') c.add(`${p}.gimmick`, '문자열이어야 함');
    else if (gimmicks && !gimmicks.includes(raw.gimmick)) c.add(`${p}.gimmick`, `gimmicks에 없는 이름 "${raw.gimmick}"`);
    if (raw.endFlick === true) c.add(`${p}.endFlick`, '기믹 슬라이드에는 쓸 수 없음');
  }
  if (raw.endFlick === true) {
    if (raw.gimmick === undefined) checkDirection(raw, p, mode, c);
  } else if (raw.direction !== undefined) c.add(`${p}.direction`, 'endFlick이 true일 때만 쓸 수 있음');
  if (c.errors.length > before) return null;
  const note: FreeNote = { type: 'slide', points };
  if (raw.gimmick !== undefined) note.gimmick = raw.gimmick as string;
  if (raw.endFlick === true) {
    note.endFlick = true;
    if (raw.direction !== undefined) note.direction = raw.direction as FlickDirection;
  }
  return note;
}

/** 기믹 노트가 가리키는 종류 이름 검사. names가 없으면(종류 목록이 잘못됨) 있는지는 보지 않는다. */
function checkGimmickRef(raw: Obj, p: string, names: readonly string[] | undefined, c: Collector): void {
  if (typeof raw.gimmick !== 'string') c.add(`${p}.gimmick`, '문자열이어야 함');
  else if (names && !names.includes(raw.gimmick)) c.add(`${p}.gimmick`, `gimmicks에 없는 이름 "${raw.gimmick}"`);
  if (raw.direction !== undefined) c.add(`${p}.direction`, '플릭에만 쓸 수 있음');
}

function readFreeNote(
  raw: unknown,
  p: string,
  columns: number | undefined,
  mode: FlickMode | undefined,
  gimmicks: readonly string[] | undefined,
  c: Collector,
): FreeNote | null {
  if (!isObj(raw)) {
    c.add(p, '객체여야 함');
    return null;
  }
  if (raw.type === 'slide') return readSlide(raw, p, columns, mode, gimmicks, c);
  const before = c.errors.length;
  if (!isInt(raw.tick) || raw.tick < 0) c.add(`${p}.tick`, '0 이상의 정수여야 함');
  checkSpan(raw, p, columns, c);
  if (raw.type === 'flick') checkDirection(raw, p, mode, c);
  else if (raw.type === 'gimmick') checkGimmickRef(raw, p, gimmicks, c);
  else if (raw.type !== 'tap' && raw.type !== 'trace') {
    c.add(`${p}.type`, '"tap", "trace", "flick", "slide", "gimmick" 중 하나여야 함');
  } else if (raw.direction !== undefined) c.add(`${p}.direction`, '플릭에만 쓸 수 있음');
  if (c.errors.length > before) return null;
  const base = { tick: raw.tick as number, x: raw.x as number, width: raw.width as number };
  if (raw.type === 'gimmick') return { tick: base.tick, type: 'gimmick', gimmick: raw.gimmick as string, x: base.x, width: base.width };
  if (raw.type !== 'flick') return { ...base, type: raw.type as 'tap' | 'trace' };
  return raw.direction === undefined
    ? { ...base, type: 'flick' }
    : { ...base, type: 'flick', direction: raw.direction as FlickDirection };
}

/**
 * 노트 하나가 채보 규칙(칸 범위, 플릭 방향, 슬라이드 지점, 기믹 종류)에 맞는지. 겹침은 보지 않는다. 문제 목록을 돌려준다.
 */
export function freeNoteErrors(
  note: unknown,
  columns: number,
  flickMode: FlickMode,
  gimmicks: readonly FreeGimmick[] = [],
): string[] {
  const c = new Collector('note');
  readFreeNote(note, 'note', columns, flickMode, gimmicks.map(g => g.name), c);
  return c.errors;
}

/** 기믹 종류 이름 하나의 문제 (빈 이름, 앞뒤 공백, 길이). 없으면 null. */
export function gimmickNameError(name: string): string | null {
  if (name.trim() === '') return '비어 있으면 안 됨';
  if (name.trim() !== name) return '앞뒤에 공백이 있으면 안 됨';
  if (name.length > MAX_GIMMICK_NAME_LENGTH) return `${MAX_GIMMICK_NAME_LENGTH}자 이하여야 함`;
  return null;
}

/** 기믹 종류 목록. 문제가 있으면 오류를 남기고 undefined (노트의 이름 검사는 건너뛴다). */
function readGimmicks(root: Obj, c: Collector): FreeGimmick[] | undefined {
  if (root.gimmicks === undefined) return [];
  if (!Array.isArray(root.gimmicks)) {
    c.add('gimmicks', '배열이어야 함');
    return undefined;
  }
  const before = c.errors.length;
  if (root.gimmicks.length > MAX_GIMMICKS) c.add('gimmicks', `${MAX_GIMMICKS}개 이하여야 함`);
  const out: FreeGimmick[] = [];
  root.gimmicks.forEach((raw, i) => {
    const p = `gimmicks[${i}]`;
    if (!isObj(raw)) {
      c.add(p, '객체여야 함');
      return;
    }
    const nameErr = typeof raw.name === 'string' ? gimmickNameError(raw.name) : '문자열이어야 함';
    if (nameErr) c.add(`${p}.name`, nameErr);
    else if (out.some(g => g.name === raw.name)) c.add(`${p}.name`, `이름 "${raw.name}"이 중복됨`);
    if (typeof raw.color !== 'string' || !TRACK_COLOR_PATTERN.test(raw.color)) c.add(`${p}.color`, '#rrggbb 형식이어야 함');
    if (c.errors.length === before) out.push({ name: raw.name as string, color: (raw.color as string).toLowerCase() });
  });
  return c.errors.length > before ? undefined : out;
}

export function validateFreeChart(root: Obj, file: string): ParseResult<FreeChart> {
  const c = new Collector(file);
  checkFormatVersion(root, c);
  if (root.layout !== 'free') c.add('layout', '"free"여야 함');
  const name = str(root, 'name', c);
  const level = num(root, 'level', c);

  let columns: number | undefined;
  if (!isInt(root.columns) || root.columns < MIN_COLUMNS || root.columns > MAX_COLUMNS) {
    c.add('columns', `${MIN_COLUMNS}~${MAX_COLUMNS} 정수여야 함`);
  } else {
    columns = root.columns;
  }
  let flickMode: FlickMode | undefined;
  if (root.flickMode !== 'directional' && root.flickMode !== 'any') c.add('flickMode', '"directional" 또는 "any"여야 함');
  else flickMode = root.flickMode;

  const speeds = readSpeeds(root, c);
  const gimmicks = readGimmicks(root, c);
  const gimmickNames = gimmicks?.map(g => g.name);

  const notes: FreeNote[] = [];
  const noteIndex: number[] = [];
  if (!Array.isArray(root.notes)) {
    c.add('notes', '배열이어야 함');
  } else {
    root.notes.forEach((raw, i) => {
      const note = readFreeNote(raw, `notes[${i}]`, columns, flickMode, gimmickNames, c);
      if (note) {
        notes.push(note);
        noteIndex.push(i);
      }
    });

    // 겹침: 시작 tick별로 묶어 그 안에서 서로 비교
    const byTick = new Map<number, number[]>();
    notes.forEach((n, k) => {
      const list = byTick.get(freeNoteTick(n));
      if (list) list.push(k);
      else byTick.set(freeNoteTick(n), [k]);
    });
    for (const list of byTick.values()) {
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          if (freeNotesOverlap(notes[list[a]], notes[list[b]])) {
            c.add(`notes[${noteIndex[list[b]]}]`, `notes[${noteIndex[list[a]]}]와 겹침`);
          }
        }
      }
    }
  }

  if (c.errors.length > 0 || columns === undefined || flickMode === undefined) return { ok: false, errors: c.errors };
  const value: FreeChart = { formatVersion: FORMAT_VERSION, layout: 'free', name, level, columns, flickMode, notes };
  if (gimmicks && gimmicks.length > 0) value.gimmicks = gimmicks;
  if (speeds.length > 0) value.speeds = speeds;
  return { ok: true, value };
}

/** `layout`을 보고 레인형 또는 자유형으로 검사한다. */
export function validateAnyChart(root: Obj, file: string): ParseResult<AnyChart> {
  return root.layout === undefined ? validateChart(root, file) : validateFreeChart(root, file);
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
