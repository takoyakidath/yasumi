import './style.css';
import {
  addMonths,
  currentMonth,
  firstDay,
  formatMonth,
  formatRange,
  lastDay,
  monthNumber,
  toDateStr,
  weekdayIndex,
  addDays,
  diffDays,
} from './dates';
import {
  addEntry,
  copyRequest,
  countOutOfMonth,
  createRequest,
  entryAt,
  findPrevious,
  monthFit,
  removeEntry,
  totalDays,
  type YasumiRequest,
} from './model';
import { escapeHtml, renderSheet } from './print';
import { createStore, type Layout } from './store';

const store = createStore();
const app = document.querySelector<HTMLDivElement>('#app')!;
const printRoot = document.querySelector<HTMLDivElement>('#print-root')!;

interface UiState {
  /** 表示中の月。シフトの休み希望は翌月分を出すことが多いので翌月から始める。 */
  month: string;
  message?: { kind: 'error' | 'info'; text: string };
  rangeMode: boolean;
  startValue: string;
  endValue: string;
  preview: boolean;
  /** 印刷前の確認が必要な理由（2回目の押下でそのまま印刷） */
  printWarning?: string;
  confirmDelete: boolean;
}

const ui: UiState = {
  month: addMonths(currentMonth(), 1),
  rangeMode: false,
  startValue: '',
  endValue: '',
  preview: false,
  confirmDelete: false,
};

const isPast = (month: string) => month < currentMonth();

function goTo(month: string) {
  ui.month = month;
  ui.message = undefined;
  ui.printWarning = undefined;
  ui.confirmDelete = false;
  ui.startValue = '';
  ui.endValue = '';
  render();
}

function flash(kind: 'error' | 'info', text: string) {
  ui.message = { kind, text };
}

function save(request: YasumiRequest) {
  store.save(request);
  ui.printWarning = undefined;
}

// ---------- 描画 ----------

function render() {
  const settings = store.getSettings();
  const request = store.get(ui.month);
  const previous = findPrevious(store.list(), ui.month);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">休</span>
        <span>休み希望</span>
      </div>
      <label class="name-field">
        <span>氏名</span>
        <input id="name" type="text" autocomplete="name" placeholder="名前を入力" value="${escapeHtml(settings.name)}" />
      </label>
    </header>

    <nav class="month-nav" aria-label="月の切り替え">
      <button class="icon-btn" data-action="prev-month" aria-label="前の月">‹</button>
      <h1 class="month-title">${formatMonth(ui.month)}<span>の休み希望</span></h1>
      <button class="icon-btn" data-action="next-month" aria-label="次の月">›</button>
    </nav>

    <main class="main">
      ${ui.message ? `<p class="toast toast--${ui.message.kind}" role="status">${escapeHtml(ui.message.text)}</p>` : ''}
      ${request ? renderEditor(request, isPast(ui.month)) : renderEmpty(previous)}
      ${renderHistory()}
    </main>
  `;
  bind();
  fitPreview();
}

/** A4（210mm ≒ 793.7px）のプレビューを表示幅に合わせて縮小する */
function fitPreview() {
  const box = app.querySelector<HTMLElement>('.preview');
  if (box) box.style.setProperty('--scale', String(box.clientWidth / 793.7));
}

window.addEventListener('resize', fitPreview);

function renderEmpty(previous: YasumiRequest | undefined): string {
  if (isPast(ui.month)) {
    return `<section class="card empty"><p class="empty-text">この月の休み希望はありません</p></section>`;
  }
  return `
    <section class="card empty">
      <p class="empty-text">まだ作成されていません</p>
      ${
        previous
          ? `
        <button class="btn btn--primary btn--big" data-action="copy" data-id="${previous.id}">
          前回からコピー
          <small>${formatMonth(previous.month)}の内容・${previous.entries.length}件</small>
        </button>
        <ul class="peek">
          ${previous.entries
            .slice(0, 6)
            .map((e) => `<li>${formatRange(e.start, e.end)}</li>`)
            .join('')}
          ${previous.entries.length > 6 ? `<li class="peek-more">ほか${previous.entries.length - 6}件</li>` : ''}
        </ul>`
          : ''
      }
      <button class="btn ${previous ? '' : 'btn--primary btn--big'}" data-action="create">新しく作成</button>
    </section>`;
}

function renderEditor(request: YasumiRequest, readOnly: boolean): string {
  const settings = store.getSettings();
  const outCount = countOutOfMonth(request);
  return `
    <section class="card">
      ${
        readOnly
          ? '<p class="note">提出済みの履歴です。当時の内容を保持するため編集できません。</p>'
          : request.copiedFromMonth && outCount > 0
            ? `<p class="note note--warn">${formatMonth(request.copiedFromMonth)}の内容をコピーしました。<b>前回の日付が${outCount}件</b>残っています。不要な日は × で削除し、${monthNumber(request.month)}月の休みを追加してください。</p>`
            : ''
      }

      ${
        request.entries.length
          ? `<ul class="entries">${request.entries.map((e) => renderEntry(request, e.id, readOnly)).join('')}</ul>`
          : '<p class="muted">休み希望はまだありません</p>'
      }
      <p class="summary">${monthNumber(request.month)}月 合計 ${totalDays(request)}日</p>

      ${readOnly ? '' : renderAddForm(request)}
    </section>

    ${readOnly ? '' : `<section class="card">${renderCalendar(request)}</section>`}

    <section class="card print-panel">
      <div class="seg" role="radiogroup" aria-label="印刷レイアウト">
        ${([4, 2, 1] as Layout[])
          .map(
            (l) =>
              `<button role="radio" aria-checked="${settings.layout === l}" class="seg-btn${settings.layout === l ? ' is-on' : ''}" data-action="layout" data-layout="${l}">A4 ${l === 1 ? '1枚' : `${l}分割`}</button>`,
          )
          .join('')}
      </div>
      ${
        settings.layout > 1
          ? `<label class="check"><input type="checkbox" id="fill" ${settings.fillPage ? 'checked' : ''}/> 空いた枠も同じ内容で埋める</label>`
          : ''
      }
      ${ui.printWarning ? `<p class="note note--warn">${escapeHtml(ui.printWarning)}</p>` : ''}
      <div class="actions">
        <button class="btn" data-action="preview">${ui.preview ? 'プレビューを閉じる' : 'プレビュー'}</button>
        <button class="btn btn--primary" data-action="print">${ui.printWarning ? 'このまま印刷' : '印刷'}</button>
      </div>
      <p class="hint">PDFで保存する場合は、印刷画面の送信先で「PDFに保存」を選んでください。</p>
      ${ui.preview ? `<div class="preview"><div class="preview-scale">${renderSheet(request, { ...settings, name: request.printedName && readOnly ? request.printedName : settings.name })}</div></div>` : ''}
    </section>

    ${
      readOnly
        ? ''
        : `<div class="danger-zone">
            <button class="btn btn--text" data-action="delete">${ui.confirmDelete ? 'もう一度押すと削除します' : 'この月の休み希望を削除'}</button>
          </div>`
    }`;
}

function renderEntry(request: YasumiRequest, id: string, readOnly: boolean): string {
  const e = request.entries.find((x) => x.id === id)!;
  const fit = monthFit(e, request.month);
  const days = diffDays(e.start, e.end) + 1;
  const badge =
    fit === 'out' ? '<span class="badge">前回の日付</span>' : fit === 'partial' ? '<span class="badge">月をまたぐ</span>' : '';
  return `
    <li class="entry${fit === 'out' ? ' entry--out' : ''}">
      <span class="entry-date">${formatRange(e.start, e.end)}</span>
      ${days > 1 ? `<span class="entry-days">${days}日</span>` : ''}
      ${badge}
      ${readOnly ? '' : `<button class="icon-btn icon-btn--del" data-action="remove" data-id="${e.id}" aria-label="${formatRange(e.start, e.end)}を削除">×</button>`}
    </li>`;
}

function renderAddForm(request: YasumiRequest): string {
  const start = ui.startValue || firstDay(request.month);
  return `
    <form class="add-form" id="add-form">
      <div class="add-row">
        <label class="field">
          <span>${ui.rangeMode ? '開始日' : '日付'}</span>
          <input type="date" id="start" value="${start}" required />
        </label>
        ${
          ui.rangeMode
            ? `<span class="tilde">〜</span>
               <label class="field"><span>終了日</span><input type="date" id="end" value="${ui.endValue || start}" min="${start}" required /></label>`
            : ''
        }
      </div>
      <div class="add-row">
        <label class="check"><input type="checkbox" id="range" ${ui.rangeMode ? 'checked' : ''}/> 期間で追加</label>
        <button class="btn btn--primary" type="submit">＋ 休みを追加</button>
      </div>
    </form>`;
}

function renderCalendar(request: YasumiRequest): string {
  const from = firstDay(request.month);
  const to = lastDay(request.month);
  const today = toDateStr(new Date());
  const cells: string[] = [];
  for (let i = 0; i < weekdayIndex(from); i++) cells.push('<span></span>');
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const hit = entryAt(request, d);
    const wd = weekdayIndex(d);
    const cls = [
      'day',
      hit ? 'is-on' : '',
      hit && hit.start !== hit.end ? 'is-range' : '',
      wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '',
      d === today ? 'is-today' : '',
    ]
      .filter(Boolean)
      .join(' ');
    cells.push(
      `<button class="${cls}" data-action="toggle-day" data-date="${d}" aria-pressed="${!!hit}">${Number(d.slice(8))}</button>`,
    );
  }
  return `
    <p class="cal-caption">日付をタップして追加・解除</p>
    <div class="cal">
      ${['日', '月', '火', '水', '木', '金', '土'].map((w, i) => `<span class="cal-wd${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}">${w}</span>`).join('')}
      ${cells.join('')}
    </div>`;
}

function renderHistory(): string {
  const all = store.list();
  if (!all.length) return '';
  return `
    <section class="history">
      <h2>履歴</h2>
      <ul>
        ${all
          .map(
            (r) => `
          <li>
            <button class="history-item${r.month === ui.month ? ' is-current' : ''}" data-action="goto" data-month="${r.month}">
              <span class="history-month">${formatMonth(r.month)}</span>
              <span class="history-meta">${r.entries.length}件・${totalDays(r)}日${r.printedAt ? '・印刷済み' : ''}${r.copiedFromMonth ? `・${monthNumber(r.copiedFromMonth)}月からコピー` : ''}</span>
            </button>
          </li>`,
          )
          .join('')}
      </ul>
    </section>`;
}

// ---------- 操作 ----------

function bind() {
  app.querySelector<HTMLInputElement>('#name')?.addEventListener('input', (ev) => {
    store.saveSettings({ ...store.getSettings(), name: (ev.target as HTMLInputElement).value });
  });
  // 名前の変更をプレビュー・警告に反映するのはフォーカスが外れてから（入力中に再描画しない）
  app.querySelector<HTMLInputElement>('#name')?.addEventListener('change', () => {
    ui.printWarning = undefined;
    render();
  });

  app.querySelector<HTMLInputElement>('#fill')?.addEventListener('change', (ev) => {
    store.saveSettings({ ...store.getSettings(), fillPage: (ev.target as HTMLInputElement).checked });
    render();
  });

  app.querySelector<HTMLInputElement>('#range')?.addEventListener('change', (ev) => {
    ui.rangeMode = (ev.target as HTMLInputElement).checked;
    ui.startValue = app.querySelector<HTMLInputElement>('#start')?.value ?? '';
    render();
  });

  app.querySelector<HTMLInputElement>('#start')?.addEventListener('change', (ev) => {
    ui.startValue = (ev.target as HTMLInputElement).value;
    const end = app.querySelector<HTMLInputElement>('#end');
    if (end) {
      end.min = ui.startValue;
      if (end.value < ui.startValue) end.value = ui.startValue;
    }
  });

  app.querySelector<HTMLFormElement>('#add-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const request = store.get(ui.month);
    if (!request) return;
    const start = app.querySelector<HTMLInputElement>('#start')!.value;
    const end = ui.rangeMode ? app.querySelector<HTMLInputElement>('#end')!.value : start;
    const res = addEntry(request, start, end);
    ui.startValue = start;
    if (res.ok) {
      save(res.request);
      ui.endValue = '';
      flash('info', `${formatRange(start, end)} を追加しました`);
    } else {
      ui.endValue = end;
      flash('error', res.error);
    }
    render();
  });

  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => onAction(el));
  });
}

function onAction(el: HTMLElement) {
  const action = el.dataset.action;
  const request = store.get(ui.month);
  if (action !== 'delete') ui.confirmDelete = false;

  switch (action) {
    case 'prev-month':
      return goTo(addMonths(ui.month, -1));
    case 'next-month':
      return goTo(addMonths(ui.month, 1));
    case 'goto':
      return goTo(el.dataset.month!);

    case 'copy': {
      const source = store.list().find((r) => r.id === el.dataset.id);
      if (!source || request) return;
      save(copyRequest(source, ui.month));
      ui.message = undefined;
      break;
    }
    case 'create':
      if (request) return;
      save(createRequest(ui.month));
      ui.message = undefined;
      break;

    case 'remove': {
      if (!request) return;
      const target = request.entries.find((e) => e.id === el.dataset.id);
      save(removeEntry(request, el.dataset.id!));
      if (target) flash('info', `${formatRange(target.start, target.end)} を削除しました`);
      break;
    }

    case 'toggle-day': {
      if (!request) return;
      const date = el.dataset.date!;
      const hit = entryAt(request, date);
      if (!hit) {
        const res = addEntry(request, date);
        if (res.ok) {
          save(res.request);
          flash('info', `${formatRange(date, date)} を追加しました`);
        } else flash('error', res.error);
      } else if (hit.start === hit.end) {
        save(removeEntry(request, hit.id));
        flash('info', `${formatRange(date, date)} を削除しました`);
      } else {
        flash('error', `${formatRange(hit.start, hit.end)} の期間に含まれています。一覧の × から削除してください`);
      }
      break;
    }

    case 'layout':
      store.saveSettings({ ...store.getSettings(), layout: Number(el.dataset.layout) as Layout });
      break;
    case 'preview':
      ui.preview = !ui.preview;
      break;
    case 'print':
      if (request) return doPrint(request);
      return;

    case 'delete':
      if (!request) return;
      if (!ui.confirmDelete) {
        ui.confirmDelete = true;
        break;
      }
      store.remove(request.id);
      ui.confirmDelete = false;
      flash('info', `${formatMonth(request.month)}の休み希望を削除しました`);
      break;
  }
  render();
}

function doPrint(request: YasumiRequest) {
  const settings = store.getSettings();
  const readOnly = isPast(request.month);

  if (!ui.printWarning && !readOnly) {
    const problems: string[] = [];
    const out = countOutOfMonth(request);
    if (out > 0) problems.push(`${monthNumber(request.month)}月以外の日付が${out}件含まれています。`);
    if (!settings.name.trim()) problems.push('氏名が未入力です。');
    if (!request.entries.length) problems.push('休み希望が1件もありません。');
    if (problems.length) {
      ui.printWarning = `${problems.join('')}このまま印刷しますか？`;
      render();
      return;
    }
  }

  // 過去月の再印刷は、提出当時の名前で印刷する
  const name = readOnly && request.printedName ? request.printedName : settings.name;
  printRoot.innerHTML = renderSheet(request, { ...settings, name });
  if (!readOnly) {
    store.save({ ...request, printedName: name, printedAt: new Date().toISOString() });
  }
  ui.printWarning = undefined;
  render();
  window.print();
}

render();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
