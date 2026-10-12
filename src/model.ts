import {
  type DateStr,
  type MonthStr,
  diffDays,
  firstDay,
  formatRange,
  isValidDate,
  lastDay,
} from './dates';

/** 休み希望の1件（単日なら start === end） */
export interface DayOff {
  id: string;
  start: DateStr;
  end: DateStr;
}

/** ある月の休み希望。1か月につき1件。 */
export interface YasumiRequest {
  id: string;
  month: MonthStr;
  entries: DayOff[];
  /** コピー元の休み希望 id（前回コピーで作成した場合） */
  copiedFromId?: string;
  copiedFromMonth?: MonthStr;
  /** 最後に印刷したときの名前（提出当時の記録） */
  printedName?: string;
  printedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 1件の期間として登録できる最大日数 */
export const MAX_RANGE_DAYS = 62;

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRequest(month: MonthStr, now = new Date()): YasumiRequest {
  const ts = now.toISOString();
  return { id: newId(), month, entries: [], createdAt: ts, updatedAt: ts };
}

/**
 * 前回の休み希望を新しい月の休み希望として複製する。
 *
 * - 日付は一切ずらさない（ユーザーの意図を推測した自動変更はしない）
 * - id・配列・各要素をすべて新しく作るので、コピー後に編集しても元の履歴は変わらない
 */
export function copyRequest(source: YasumiRequest, month: MonthStr, now = new Date()): YasumiRequest {
  const ts = now.toISOString();
  return {
    id: newId(),
    month,
    entries: source.entries.map((e) => ({ id: newId(), start: e.start, end: e.end })),
    copiedFromId: source.id,
    copiedFromMonth: source.month,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** month より前で一番新しい休み希望（「前回」） */
export function findPrevious(requests: YasumiRequest[], month: MonthStr): YasumiRequest | undefined {
  return requests
    .filter((r) => r.month < month && r.entries.length > 0)
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0];
}

export function sortEntries(entries: DayOff[]): DayOff[] {
  return [...entries].sort((a, b) => (a.start === b.start ? (a.end < b.end ? -1 : 1) : a.start < b.start ? -1 : 1));
}

function overlaps(a: { start: DateStr; end: DateStr }, b: { start: DateStr; end: DateStr }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export type AddResult = { ok: true; request: YasumiRequest } | { ok: false; error: string };

/** 日付（または期間）を追加する。重複・不正な日付はエラーを返す。元の request は変更しない。 */
export function addEntry(request: YasumiRequest, start: DateStr, end: DateStr = start, now = new Date()): AddResult {
  if (!isValidDate(start) || !isValidDate(end)) return { ok: false, error: '日付を正しく入力してください' };
  if (end < start) return { ok: false, error: '終了日は開始日より後にしてください' };
  if (diffDays(start, end) + 1 > MAX_RANGE_DAYS) {
    return { ok: false, error: `期間は${MAX_RANGE_DAYS}日以内にしてください` };
  }
  const dup = request.entries.find((e) => overlaps(e, { start, end }));
  if (dup) {
    return { ok: false, error: `${formatRange(dup.start, dup.end)} と重複しています` };
  }
  return {
    ok: true,
    request: {
      ...request,
      entries: sortEntries([...request.entries, { id: newId(), start, end }]),
      updatedAt: now.toISOString(),
    },
  };
}

export function removeEntry(request: YasumiRequest, entryId: string, now = new Date()): YasumiRequest {
  return {
    ...request,
    entries: request.entries.filter((e) => e.id !== entryId),
    updatedAt: now.toISOString(),
  };
}

/** 指定日を含む休み */
export function entryAt(request: YasumiRequest, date: DateStr): DayOff | undefined {
  return request.entries.find((e) => e.start <= date && date <= e.end);
}

export type MonthFit = 'in' | 'partial' | 'out';

/** 休みが対象月に収まっているか（前回コピーで残った他の月の日付を見分ける） */
export function monthFit(entry: DayOff, month: MonthStr): MonthFit {
  const from = firstDay(month);
  const to = lastDay(month);
  if (entry.start >= from && entry.end <= to) return 'in';
  if (overlaps(entry, { start: from, end: to })) return 'partial';
  return 'out';
}

export function countOutOfMonth(request: YasumiRequest): number {
  return request.entries.filter((e) => monthFit(e, request.month) !== 'in').length;
}

/** 対象月に含まれる休みの日数（前回コピーで残った他の月の日付は数えない） */
export function totalDays(request: YasumiRequest): number {
  const from = firstDay(request.month);
  const to = lastDay(request.month);
  return request.entries.reduce((n, e) => {
    const s = e.start < from ? from : e.start;
    const t = e.end > to ? to : e.end;
    return s <= t ? n + diffDays(s, t) + 1 : n;
  }, 0);
}

/**
 * 休みの候補。将来の「曜日パターンコピー」や「Google Calendar 連携」は
 * この形で候補を返し、ユーザーが確認してから addEntry で登録する（自動登録はしない）。
 */
export interface Candidate {
  start: DateStr;
  end: DateStr;
  label?: string;
}

export interface CandidateSource {
  name: string;
  suggest(month: MonthStr, context: { previous?: YasumiRequest }): Promise<Candidate[]>;
}
