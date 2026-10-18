import type { AnyChart, Chart, EditorData, FreeChart, Song } from './types';
import {
  validateAnyChart,
  validateChart,
  validateFreeChart,
  validateEditorData,
  validateSong,
  type ParseResult,
} from './validate';

function parseWith<T>(
  text: string,
  file: string,
  validate: (root: Record<string, unknown>, file: string) => ParseResult<T>,
): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: [`${file}: JSON 형식이 올바르지 않음`] };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: [`${file}: 최상위 값이 객체여야 함`] };
  }
  return validate(json as Record<string, unknown>, file);
}

export function parseSong(text: string, file = 'song.json'): ParseResult<Song> {
  return parseWith(text, file, validateSong);
}

export function parseChart(text: string, file: string): ParseResult<Chart> {
  return parseWith(text, file, validateChart);
}

export function parseFreeChart(text: string, file: string): ParseResult<FreeChart> {
  return parseWith(text, file, validateFreeChart);
}

/** 레인형·자유형 어느 쪽이든 읽는다. 구분은 `isFreeChart`로. */
export function parseAnyChart(text: string, file: string): ParseResult<AnyChart> {
  return parseWith(text, file, validateAnyChart);
}

export function parseEditorData(text: string, file = 'editor.json'): ParseResult<EditorData> {
  return parseWith(text, file, validateEditorData);
}
