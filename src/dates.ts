// 日付は "YYYY-MM-DD"、年月は "YYYY-MM" の文字列で扱う（タイムゾーンのずれを避けるため）。

export type DateStr = string;
export type MonthStr = string;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDate(s)) === s;
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** a から b までの日数差（b - a） */
export function diffDays(a: DateStr, b: DateStr): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function weekday(s: DateStr): string {
  return WEEKDAYS[parseDate(s).getDay()];
}

export function weekdayIndex(s: DateStr): number {
  return parseDate(s).getDay();
}

export function monthOf(s: DateStr): MonthStr {
  return s.slice(0, 7);
}

export function currentMonth(today = new Date()): MonthStr {
  return monthOf(toDateStr(today));
}

export function addMonths(m: MonthStr, n: number): MonthStr {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function firstDay(m: MonthStr): DateStr {
  return `${m}-01`;
}

export function lastDay(m: MonthStr): DateStr {
  return addDays(firstDay(addMonths(m, 1)), -1);
}

export function formatMonth(m: MonthStr): string {
  const [y, mo] = m.split('-').map(Number);
  return `${y}年${mo}月`;
}

export function monthNumber(m: MonthStr): number {
  return Number(m.slice(5, 7));
}

/** 10月5日（月） */
export function formatLong(s: DateStr): string {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日（${weekday(s)}）`;
}

/** 10/5（月） */
export function formatShort(s: DateStr): string {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${weekday(s)}）`;
}

/**
 * 単日・期間を表示用に整形する。
 * 同じ月の期間は終了側の月を省略する: 10月10日（土）〜12日（月）
 */
export function formatRange(start: DateStr, end: DateStr, style: 'long' | 'short' = 'long'): string {
  const fmt = style === 'long' ? formatLong : formatShort;
  if (start === end) return fmt(start);
  if (style === 'long' && monthOf(start) === monthOf(end)) {
    return `${fmt(start)}〜${parseDate(end).getDate()}日（${weekday(end)}）`;
  }
  return `${fmt(start)}〜${fmt(end)}`;
}
