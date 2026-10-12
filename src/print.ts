import { formatMonth, formatRange, monthNumber, toDateStr, formatShort } from './dates';
import { monthFit, totalDays, type YasumiRequest } from './model';
import type { Layout } from './store';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function slip(request: YasumiRequest, name: string, layout: Layout, issuedOn: string): string {
  const many = request.entries.length > (layout === 4 ? 8 : layout === 2 ? 10 : 20);
  const items = request.entries
    .map((e) => {
      const mark = monthFit(e, request.month) === 'in' ? '' : ' slip-item--other';
      return `<li class="slip-item${mark}">${formatRange(e.start, e.end, 'short')}</li>`;
    })
    .join('');
  return `
    <section class="slip">
      <header class="slip-head">
        <h1 class="slip-title">休み希望</h1>
        <p class="slip-month">${formatMonth(request.month)}分</p>
      </header>
      <p class="slip-name"><span>氏名</span><span class="slip-name-value">${escapeHtml(name) || '&nbsp;'}</span></p>
      ${
        request.entries.length
          ? `<ol class="slip-list${many ? ' slip-list--cols' : ''}">${items}</ol>`
          : '<p class="slip-empty">休み希望なし</p>'
      }
      <footer class="slip-foot">
        <span>${monthNumber(request.month)}月 計 ${totalDays(request)}日</span>
        <span>提出日 ${issuedOn}</span>
      </footer>
    </section>`;
}

/** A4 1枚分の HTML。layout 分割した枠に休み希望を配置する。 */
export function renderSheet(
  request: YasumiRequest,
  opts: { name: string; layout: Layout; fillPage: boolean; today?: Date },
): string {
  const issuedOn = formatShort(toDateStr(opts.today ?? new Date()));
  const one = slip(request, opts.name, opts.layout, issuedOn);
  const cells = Array.from({ length: opts.layout }, (_, i) =>
    i === 0 || opts.fillPage ? `<div class="cell">${one}</div>` : '<div class="cell cell--blank"></div>',
  ).join('');
  return `<div class="sheet sheet--${opts.layout}">${cells}</div>`;
}
