import type { MonthStr } from './dates';
import type { YasumiRequest } from './model';

export type Layout = 1 | 2 | 4;

export interface Settings {
  name: string;
  layout: Layout;
  /** 分割した残りの枠も同じ内容で埋める */
  fillPage: boolean;
}

interface Data {
  version: 1;
  settings: Settings;
  requests: YasumiRequest[];
}

const KEY = 'yasumi:v1';

const DEFAULT_SETTINGS: Settings = { name: '', layout: 4, fillPage: false };

/**
 * 保存先の抽象。今は localStorage だが、IndexedDB 等に差し替えられるようにしておく。
 * 読み書きは常にコピーを返すので、画面側で値を書き換えても保存済みの履歴には影響しない。
 */
export interface Store {
  getSettings(): Settings;
  saveSettings(settings: Settings): void;
  list(): YasumiRequest[];
  get(month: MonthStr): YasumiRequest | undefined;
  save(request: YasumiRequest): void;
  remove(id: string): void;
}

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createStore(kv: KeyValue = localStorage): Store {
  const load = (): Data => {
    try {
      const raw = kv.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as Data;
        return { ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
      }
    } catch {
      // 壊れたデータは無視して初期状態から始める
    }
    return { version: 1, settings: { ...DEFAULT_SETTINGS }, requests: [] };
  };

  let data = load();
  const persist = () => kv.setItem(KEY, JSON.stringify(data));
  const clone = <T>(v: T): T => structuredClone(v);

  return {
    getSettings: () => clone(data.settings),
    saveSettings(settings) {
      data = { ...data, settings: clone(settings) };
      persist();
    },
    list: () => clone([...data.requests].sort((a, b) => (a.month < b.month ? 1 : -1))),
    get: (month) => {
      const r = data.requests.find((x) => x.month === month);
      return r && clone(r);
    },
    save(request) {
      const others = data.requests.filter((r) => r.id !== request.id && r.month !== request.month);
      data = { ...data, requests: [...others, clone(request)] };
      persist();
    },
    remove(id) {
      data = { ...data, requests: data.requests.filter((r) => r.id !== id) };
      persist();
    },
  };
}
