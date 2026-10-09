import type { Chart, EditorData, Song } from './types';
import {
  validateChart,
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

export function parseEditorData(text: string, file = 'editor.json'): ParseResult<EditorData> {
  return parseWith(text, file, validateEditorData);
}
