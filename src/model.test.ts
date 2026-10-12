import { describe, expect, it } from 'vitest';
import { addMonths, formatRange, isValidDate, lastDay, weekday } from './dates';
import {
  addEntry,
  copyRequest,
  countOutOfMonth,
  createRequest,
  findPrevious,
  monthFit,
  removeEntry,
  totalDays,
  type YasumiRequest,
} from './model';
import { createStore, type KeyValue } from './store';

function build(month: string, ranges: [string, string?][]): YasumiRequest {
  let r = createRequest(month);
  for (const [s, e] of ranges) {
    const res = addEntry(r, s, e);
    if (!res.ok) throw new Error(res.error);
    r = res.request;
  }
  return r;
}

function memoryKV(): KeyValue {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('dates', () => {
  it('曜日を自動で求める', () => {
    expect(weekday('2026-10-05')).toBe('月');
    expect(weekday('2026-10-10')).toBe('土');
  });

  it('期間を整形する', () => {
    expect(formatRange('2026-10-05', '2026-10-05')).toBe('10月5日（月）');
    expect(formatRange('2026-10-10', '2026-10-12')).toBe('10月10日（土）〜12日（月）');
    expect(formatRange('2026-10-31', '2026-11-02')).toBe('10月31日（土）〜11月2日（月）');
    expect(formatRange('2026-10-10', '2026-10-12', 'short')).toBe('10/10（土）〜10/12（月）');
  });

  it('月の計算', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(lastDay('2028-02')).toBe('2028-02-29');
  });

  it('存在しない日付を弾く', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('')).toBe(false);
  });
});

describe('addEntry', () => {
  it('日付順に並べる', () => {
    const r = build('2026-10', [['2026-10-20'], ['2026-10-05'], ['2026-10-10', '2026-10-12']]);
    expect(r.entries.map((e) => e.start)).toEqual(['2026-10-05', '2026-10-10', '2026-10-20']);
    expect(totalDays(r)).toBe(5);
  });

  it('重複を弾く', () => {
    const r = build('2026-10', [['2026-10-10', '2026-10-12']]);
    const res = addEntry(r, '2026-10-11');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('重複');
    expect(addEntry(r, '2026-10-09', '2026-10-10').ok).toBe(false);
    expect(addEntry(r, '2026-10-13').ok).toBe(true);
  });

  it('終了日が開始日より前なら弾く', () => {
    expect(addEntry(createRequest('2026-10'), '2026-10-12', '2026-10-10').ok).toBe(false);
  });

  it('元のデータを変更しない', () => {
    const r = build('2026-10', [['2026-10-05']]);
    addEntry(r, '2026-10-06');
    removeEntry(r, r.entries[0].id);
    expect(r.entries).toHaveLength(1);
  });
});

describe('前回コピー', () => {
  it('直近の過去月をコピー元にする', () => {
    const sep = build('2026-09', [['2026-09-01']]);
    const oct = build('2026-10', [['2026-10-05']]);
    const dec = build('2026-12', [['2026-12-01']]);
    expect(findPrevious([sep, dec, oct], '2026-11')?.id).toBe(oct.id);
    expect(findPrevious([sep, oct], '2026-09')).toBeUndefined();
  });

  it('日付をずらさずにそのまま複製する', () => {
    const oct = build('2026-10', [['2026-10-05'], ['2026-10-10', '2026-10-12']]);
    const nov = copyRequest(oct, '2026-11');
    expect(nov.month).toBe('2026-11');
    expect(nov.copiedFromId).toBe(oct.id);
    expect(nov.entries.map((e) => [e.start, e.end])).toEqual([
      ['2026-10-05', '2026-10-05'],
      ['2026-10-10', '2026-10-12'],
    ]);
    expect(countOutOfMonth(nov)).toBe(2);
    expect(totalDays(nov)).toBe(0);
  });

  it('コピー後に編集しても元の月は変わらない（保存を経由しても）', () => {
    const store = createStore(memoryKV());
    store.save(build('2026-10', [['2026-10-05'], ['2026-10-17']]));

    const oct = store.get('2026-10')!;
    let nov = copyRequest(oct, '2026-11');
    expect(nov.id).not.toBe(oct.id);
    expect(nov.entries[0].id).not.toBe(oct.entries[0].id);

    nov = removeEntry(nov, nov.entries[0].id);
    const added = addEntry(nov, '2026-11-03');
    if (!added.ok) throw new Error(added.error);
    store.save(added.request);

    const octAfter = store.get('2026-10')!;
    expect(octAfter.entries.map((e) => e.start)).toEqual(['2026-10-05', '2026-10-17']);
    expect(octAfter.updatedAt).toBe(oct.updatedAt);
    expect(store.get('2026-11')!.entries.map((e) => e.start)).toEqual(['2026-10-17', '2026-11-03']);
  });

  it('ストアから取り出した値を書き換えても保存済みデータは変わらない', () => {
    const store = createStore(memoryKV());
    store.save(build('2026-10', [['2026-10-05']]));
    const r = store.get('2026-10')!;
    r.entries[0].start = '2026-10-31';
    expect(store.get('2026-10')!.entries[0].start).toBe('2026-10-05');
  });
});

describe('monthFit', () => {
  it('対象月外の日付を判定する', () => {
    const e = (start: string, end = start) => ({ id: 'x', start, end });
    expect(monthFit(e('2026-11-05'), '2026-11')).toBe('in');
    expect(monthFit(e('2026-10-05'), '2026-11')).toBe('out');
    expect(monthFit(e('2026-10-31', '2026-11-02'), '2026-11')).toBe('partial');
  });
});
