import { State, DataSelectors, Utils, fmtPtbrInt, fmtPtbrNum } from './core.js';
import { loadSpreadsheet } from './table.js';
import { buildStatisticsRows, summarizeStatistics, pearsonCorrelation, getCorrelationFrame, rankStatistics, buildWaterfall } from './statistics-data.js';

const container = document.getElementById('statistics-container');
const metricSelect = document.getElementById('statistics-metric');
const orderSelect = document.getElementById('statistics-order');
const frameSelect = document.getElementById('statistics-correlation-frame');
const tooltip = document.getElementById('statistics-tooltip');
const head = document.getElementById('statistics-table-head');
const body = document.getElementById('statistics-table-body');
const exportButton = document.getElementById('statistics-export');
const escape = Utils.escapeHtml;
const signed = (value, unit = '', decimals = 2) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmtPtbrNum(value, decimals)}${unit}` : '–';
const number = value => Number.isFinite(value) ? fmtPtbrInt(value) : '–';
const percent = value => Number.isFinite(value) ? `${fmtPtbrNum(value)}%` : '–';
const columns = [
  ['name', 'Município', String], ['mesoregion', 'Mesorregião', String],
  ['population2019', 'População 2019', number], ['population2026', 'População 2026*', number],
  ['populationDelta', 'Δ população (pessoas)', value => signed(value, '', 0)], ['populationChange', 'Δ população (%)', value => signed(value, '%')],
  ['pbf2019', 'Pobreza PBF 2019', number], ['pbf2026', 'Pobreza PBF 2026', number],
  ['pbfDelta', 'Δ PBF (pessoas)', value => signed(value, '', 0)], ['pbfChange', 'Δ PBF (%)', value => signed(value, '%')],
  ['rate2019', 'Taxa PBF 2019 (%)', percent], ['rate2026', 'Taxa PBF 2026 (%)', percent],
  ['rateDelta', 'Δ taxa PBF (p.p.)', value => signed(value, ' p.p.')]
];
let rows = [], sort = { key: 'rateDelta', direction: 'asc' };
let tooltipMark = null, tooltipCloseTimer;

function tooltipPairs(pairs) {
  return `<dl>${pairs.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
}

function municipalityTooltip(row, extra = []) {
  return `<strong>${escape(row.name)}</strong><span class="statistics-tooltip-region">${escape(row.mesoregion)}</span>
    <table><thead><tr><th scope="col">Indicador</th><th scope="col">2019</th><th scope="col">2026</th></tr></thead><tbody>
      <tr><th scope="row">População*</th><td>${number(row.population2019)}</td><td>${number(row.population2026)}</td></tr>
      <tr><th scope="row">Pobreza PBF</th><td>${number(row.pbf2019)}</td><td>${number(row.pbf2026)}</td></tr>
      <tr><th scope="row">Taxa PBF</th><td>${percent(row.rate2019)}</td><td>${percent(row.rate2026)}</td></tr>
    </tbody></table>${tooltipPairs([
      ['Δ população', `${signed(row.populationChange, '%')} (${signed(row.populationDelta, ' pessoas', 0)})`],
      ['Δ Pobreza PBF', `${signed(row.pbfDelta, ' pessoas', 0)} (${signed(row.pbfChange, '%')})`],
      ['Δ taxa PBF', signed(row.rateDelta, ' p.p.')], ...extra
    ])}<small>* População estimada conforme a base do painel. Δ = 2026 − 2019.</small>`;
}

function hideTooltip() {
  clearTimeout(tooltipCloseTimer);
  tooltip.hidePopover();
  tooltipMark?.removeAttribute('aria-describedby');
  tooltipMark?.classList.remove('statistics-tooltip-active');
  tooltipMark = null;
}

function positionTooltip(point) {
  if (!tooltipMark) return;
  const bounds = tooltipMark.getBoundingClientRect();
  const anchor = point || { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const box = tooltip.getBoundingClientRect();
  const margin = 12, gap = 14;
  const left = anchor.x + gap + box.width <= innerWidth - margin ? anchor.x + gap : anchor.x - box.width - gap;
  const top = anchor.y + gap + box.height <= innerHeight - margin ? anchor.y + gap : anchor.y - box.height - gap;
  tooltip.style.left = `${Math.max(margin, Math.min(left, innerWidth - box.width - margin))}px`;
  tooltip.style.top = `${Math.max(margin, Math.min(top, innerHeight - box.height - margin))}px`;
}

function showTooltip(mark, point) {
  clearTimeout(tooltipCloseTimer);
  if (tooltipMark !== mark) {
    tooltipMark?.removeAttribute('aria-describedby');
    tooltipMark?.classList.remove('statistics-tooltip-active');
    tooltipMark = mark;
    tooltip.innerHTML = mark.dataset.statisticsTooltip;
    mark.setAttribute('aria-describedby', tooltip.id);
    mark.classList.add('statistics-tooltip-active');
  }
  tooltip.showPopover();
  positionTooltip(point);
}

function scheduleTooltipHide() {
  clearTimeout(tooltipCloseTimer);
  tooltipCloseTimer = setTimeout(() => {
    if (!tooltip.matches(':hover') && document.activeElement !== tooltipMark) hideTooltip();
  }, 160);
}

function sortedRows() {
  return [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const result = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y;
    return (sort.direction === 'asc' ? result : -result) || a.name.localeCompare(b.name, 'pt-BR');
  });
}

function renderTable() {
  const focused = head.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  head.innerHTML = columns.map(([key, label]) => `<th scope="col" aria-sort="${sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}"><button type="button" data-key="${key}">${escape(label)} <span aria-hidden="true">${sort.key === key ? sort.direction === 'asc' ? '▲' : '▼' : '↕'}</span></button></th>`).join('');
  body.innerHTML = sortedRows().map(row => `<tr data-code="${escape(row.id)}">${columns.map(([key, , format]) => `<${key === 'name' ? 'th scope="row"' : 'td'}>${escape(format(row[key]))}</${key === 'name' ? 'th' : 'td'}>`).join('')}</tr>`).join('');
  if (focused) head.querySelector(`[data-key="${focused}"]`)?.focus();
}

const svgText = (x, y, text, className = '', anchor = 'start') => `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}">${escape(text)}</text>`;
const line = (x1, y1, x2, y2, className = 'statistics-gridline') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>`;
function svg(width, height, title, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escape(title)}">${content}</svg>`;
}
function focusMark(label, content, details) {
  return `<g tabindex="0" role="img" aria-label="${escape(label)}" data-statistics-tooltip="${escape(details)}">${content}</g>`;
}
function domain(values) {
  let minimum = Math.min(0, ...values), maximum = Math.max(0, ...values);
  if (minimum === maximum) maximum = minimum + 1;
  const padding = (maximum - minimum || 1) * .08;
  if (minimum < 0) minimum -= padding;
  maximum += padding;
  return [minimum, maximum];
}
function horizontalAxis(minimum, maximum, left, right, bottom, top, format) {
  const scale = value => left + (value - minimum) / (maximum - minimum) * (right - left);
  let content = '';
  for (let i = 0; i <= 4; i++) {
    const value = minimum + (maximum - minimum) * i / 4;
    const x = scale(value);
    content += line(x, top, x, bottom) + svgText(x, bottom + 22, format(value), '', 'middle');
  }
  if (minimum < 0 && maximum >= 0) content += line(scale(0), top, scale(0), bottom, 'statistics-zero');
  return { scale, content };
}

function renderRanking() {
  hideTooltip();
  const key = metricSelect.value;
  const ranked = rankStatistics(rows, key, orderSelect.value);
  const host = document.getElementById('statistics-ranking-chart');
  if (!ranked.length) { host.innerHTML = '<p class="statistics-note">Nenhum município com dados para esta medida e direção de variação.</p>'; return; }
  const dumbbell = key === 'rateDelta';
  const width = 880, top = 34, bottom = top + ranked.length * 32, height = bottom + 52;
  const values = dumbbell ? ranked.flatMap(row => [row.rate2019, row.rate2026]) : ranked.map(row => row[key]);
  const [minimum, maximum] = domain(values);
  const format = value => key === 'pbfDelta' ? fmtPtbrInt(value) : `${fmtPtbrNum(value, 1)}${dumbbell || key === 'populationChange' ? '%' : ''}`;
  const axis = horizontalAxis(minimum, maximum, 200, width - (dumbbell ? 292 : 112), bottom, top - 8, format);
  let content = axis.content;
  content += svgText(12, 15, 'Município');
  if (dumbbell) content += svgText(width - 120, 15, 'Taxa PBF: 2019 → 2026 (%)', '', 'end');
  content += svgText(width - 10, 15, dumbbell ? 'Δ (p.p.)' : key === 'pbfDelta' ? 'Δ pessoas' : 'Δ população (%)', '', 'end');
  for (const [index, row] of ranked.entries()) {
    const y = top + index * 32 + 12;
    const value = row[key], color = value > 0 ? 'statistics-increase' : 'statistics-decrease';
    const details = dumbbell
      ? `${row.name}: taxa PBF 2019 ${percent(row.rate2019)}, 2026 ${percent(row.rate2026)}; diferença ${signed(value, ' p.p.')}`
      : `${row.name}: ${key === 'pbfDelta' ? 'diferença PBF' : 'variação populacional'} ${signed(value, key === 'pbfDelta' ? ' pessoas' : '%', key === 'pbfDelta' ? 0 : 2)}`;
    let marks = `<rect x="0" y="${y - 15}" width="${width}" height="30" class="statistics-hitbox"/>`
      + svgText(12, y + 4, row.name.length > 27 ? `${row.name.slice(0, 26)}…` : row.name, 'statistics-city');
    if (dumbbell) {
      const start = axis.scale(row.rate2019), end = axis.scale(row.rate2026);
      const direction = Math.sign(end - start), distance = Math.abs(end - start);
      const dumbbellColor = value > 0 ? 'statistics-dumbbell-increase' : value < 0 ? 'statistics-dumbbell-decrease' : 'statistics-dumbbell-neutral';
      if (distance > 13) {
        const tip = end - direction * 7;
        marks += line(start + direction * 6, y, tip, y, `statistics-dumbbell-line ${dumbbellColor}`);
        // Very short changes keep their endpoints without an overlapping arrowhead.
        if (distance >= 22) marks += `<path d="M ${tip - direction * 6} ${y - 3} L ${tip} ${y} L ${tip - direction * 6} ${y + 3} Z" class="statistics-dumbbell-arrow ${dumbbellColor}"/>`;
      }
      marks += `<circle cx="${start}" cy="${y}" r="5.5" class="statistics-2019"/><circle cx="${end}" cy="${y}" r="5.5" class="statistics-2026"/>`;
      marks += svgText(width - 120, y + 4, `${fmtPtbrNum(row.rate2019)} → ${fmtPtbrNum(row.rate2026)}%`, `statistics-dumbbell-label statistics-dumbbell-rates ${dumbbellColor}`, 'end');
      marks += svgText(width - 10, y + 4, signed(value, ' p.p.'), `statistics-dumbbell-label statistics-dumbbell-delta ${dumbbellColor}`, 'end');
    } else {
      const x = axis.scale(Math.min(0, value));
      marks += `<rect x="${x}" y="${y - 7}" width="${Math.max(1, Math.abs(axis.scale(value) - axis.scale(0)))}" height="14" rx="2" class="${color}"/>`;
      marks += svgText(width - 10, y + 4, signed(value, '', key === 'pbfDelta' ? 0 : 2), color, 'end');
    }
    content += focusMark(details, marks, municipalityTooltip(row));
  }
  host.innerHTML = (dumbbell ? '<p class="statistics-legend"><span class="statistics-dot statistics-2019"></span>2019 <span class="statistics-dot statistics-2026"></span>2026 <span>Seta: 2019 → 2026 · redução em verde, aumento em âmbar</span></p>' : '')
    + svg(width, height, dumbbell ? 'Comparação das taxas PBF de 2019 e 2026 por município, ordenada pela variação' : `Ranking de ${key === 'pbfDelta' ? 'diferença PBF em pessoas' : 'variação populacional em porcentagem'}`, content);
}

function renderWaterfall() {
  hideTooltip();
  const host = document.getElementById('statistics-waterfall-chart');
  if (!rows.some(row => row.pbfDelta !== null)) { host.innerHTML = '<p class="statistics-note">Sem pares válidos de PBF para calcular o saldo.</p>'; return; }
  const steps = buildWaterfall(rows);
  const width = 680, top = 28, bottom = top + steps.length * 38;
  const [minimum, maximum] = domain(steps.flatMap(step => [step.start, step.end]));
  const axis = horizontalAxis(minimum, maximum, 182, width - 90, bottom, top - 8, value => fmtPtbrInt(value));
  let content = axis.content;
  steps.forEach((step, index) => {
    const y = top + index * 38 + 12;
    if (index && !step.total) content += line(axis.scale(step.start), y - 31, axis.scale(step.start), y, 'statistics-waterfall-connector');
    const color = step.total ? 'statistics-total' : step.delta > 0 ? 'statistics-increase' : 'statistics-decrease';
    const extra = [
      ['Contribuição ao saldo', signed(step.delta, ' pessoas', 0)],
      ['Saldo antes', signed(step.start, ' pessoas', 0)],
      ['Saldo após', signed(step.end, ' pessoas', 0)]
    ];
    const row = step.id ? rows.find(row => row.id === step.id) : null;
    const details = row ? municipalityTooltip(row, extra) : `<strong>${escape(step.label)}</strong><span class="statistics-tooltip-region">${number(step.count)} municípios com pares válidos de PBF</span>${tooltipPairs(extra)}<small>Contribuições em pessoas, não em pontos percentuais. Saldo acumulado das diferenças 2026 − 2019.</small>`;
    content += focusMark(`${step.label}: ${signed(step.delta, ' pessoas', 0)}; saldo acumulado ${number(step.end)} pessoas`,
      `<rect x="0" y="${y - 17}" width="${width}" height="34" class="statistics-hitbox"/>`
      + svgText(8, y + 4, step.label.length > 23 ? `${step.label.slice(0, 22)}…` : step.label, 'statistics-city')
      + `<rect x="${axis.scale(Math.min(step.start, step.end))}" y="${y - 8}" width="${Math.max(1, Math.abs(axis.scale(step.end) - axis.scale(step.start)))}" height="16" rx="2" class="${color}"/>`
      + svgText(width - 8, y + 4, signed(step.delta, '', 0), color, 'end'), details);
  });
  host.innerHTML = svg(width, bottom + 44, 'Waterfall das contribuições municipais à diferença PBF em pessoas, entre 2019 e 2026', content);
}

function renderCorrelation() {
  hideTooltip();
  const points = rows.filter(row => Number.isFinite(row.populationChange) && Number.isFinite(row.rateDelta))
    .map(row => ({ x: row.populationChange, y: row.rateDelta, row }));
  const correlation = pearsonCorrelation(points);
  document.getElementById('statistics-correlation-context').textContent = `Pearson r = ${correlation === null ? 'indisponível (mínimo de 3 pares e variância nos dois eixos)' : fmtPtbrNum(correlation, 3)} · n = ${points.length} municípios · sem ponderação populacional.`;
  const host = document.getElementById('statistics-correlation-chart');
  const framingNote = document.getElementById('statistics-correlation-framing');
  const frame = getCorrelationFrame(points, Number(frameSelect.value));
  framingNote.textContent = !frame ? '' : frame.coverage < 1
    ? `Enquadramento 0,95: percentis 2,5 a 97,5 de cada eixo. ${frame.visible.length} pontos visíveis; ${frame.outsideCount} fora do enquadramento. Pearson, tabela e exportação mantêm todos os ${points.length} municípios do recorte.`
    : `${points.length} pontos visíveis. ${frameSelect.value === '0.95' ? 'Amostra menor que 3 pares: usando o enquadramento completo. ' : ''}O enquadramento altera apenas os eixos, não a amostra de Pearson.`;
  if (!points.length) { host.innerHTML = '<p class="statistics-note">Sem pares válidos para o gráfico.</p>'; return; }
  const width = 640, height = 380, left = 64, right = width - 24, top = 28, bottom = height - 65;
  const [minX, maxX] = frame.x;
  const [minY, maxY] = frame.y;
  const axis = horizontalAxis(minX, maxX, left, right, bottom, top, value => `${fmtPtbrNum(value, 1)}%`);
  const y = value => bottom - (value - minY) / (maxY - minY) * (bottom - top);
  let content = axis.content;
  for (let i = 0; i <= 4; i++) {
    const value = minY + (maxY - minY) * i / 4;
    content += line(left, y(value), right, y(value)) + svgText(left - 10, y(value) + 4, fmtPtbrNum(value, 1), '', 'end');
  }
  if (minY <= 0 && maxY >= 0) content += line(left, y(0), right, y(0), 'statistics-zero');
  content += svgText(left, 15, 'Δ taxa PBF (p.p.)') + svgText((left + right) / 2, height - 12, 'Variação da população (%)', '', 'middle');
  content += frame.visible.map(({ x, y: valueY, row }) => focusMark(`${row.name}: população ${signed(row.populationChange, '%')}; taxa PBF ${signed(row.rateDelta, ' p.p.')}`,
    `<circle cx="${axis.scale(x)}" cy="${y(valueY)}" r="9" class="statistics-hitbox"/><circle data-code="${escape(row.id)}" cx="${axis.scale(x)}" cy="${y(valueY)}" r="4.5" class="statistics-point ${row.rateDelta > 0 ? 'statistics-increase' : 'statistics-decrease'}"/>`, municipalityTooltip(row))).join('');
  host.innerHTML = svg(width, height, 'Correlação municipal entre variação da população em porcentagem e diferença da taxa PBF em pontos percentuais', content);
}

function render() {
  hideTooltip();
  const state = State.getState();
  const active = state.viewMode === 'estatisticas' && state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2';
  container.classList.toggle('hidden', !active);
  if (!active || state.dataError) return;
  rows = buildStatisticsRows(DataSelectors.getFilteredFeatures(state));
  const summary = summarizeStatistics(rows);
  const reference = state.pobPbfAno === '2019' ? '2019' : '2026';
  document.getElementById('statistics-scope').textContent = `${state.mesoregionFilter && state.mesoregionFilter !== 'all' ? state.mesoregionFilter : 'Goiás'} · ${rows.length} municípios no recorte · ${summary.count} com comparação completa · filtros de status/população: ${reference}`;
  const decreasing = rows.filter(row => Number.isFinite(row.rateDelta) && row.rateDelta < 0).length;
  const increasing = rows.filter(row => Number.isFinite(row.rateDelta) && row.rateDelta > 0).length;
  const unchanged = rows.filter(row => row.rateDelta === 0).length;
  document.getElementById('statistics-summary').innerHTML = [
    ['População no recorte pareado', signed(summary.populationChange, '%'), `${number(summary.population2019)} → ${number(summary.population2026)} · Δ ${signed(summary.populationDelta, ' pessoas', 0)}`],
    ['Pobreza PBF no recorte pareado', signed(summary.pbfDelta, '', 0), `${number(summary.pbf2019)} → ${number(summary.pbf2026)} pessoas · ${signed(summary.pbfChange, '%')}`],
    ['Taxa PBF agregada', signed(summary.rateDelta, ' p.p.'), `${percent(summary.rate2019)} → ${percent(summary.rate2026)}`],
    ['Municípios por variação da taxa', `${decreasing} / ${increasing} / ${unchanged}`, 'Redução / aumento / sem variação']
  ].map(([label, value, note]) => `<div><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></div>`).join('');
  document.getElementById('statistics-empty').classList.toggle('hidden', rows.length > 0);
  document.getElementById('statistics-content').classList.toggle('hidden', !rows.length);
  exportButton.disabled = !rows.length;
  renderRanking();
  renderWaterfall();
  renderCorrelation();
  renderTable();
}

metricSelect.addEventListener('change', renderRanking);
orderSelect.addEventListener('change', renderRanking);
frameSelect.addEventListener('change', renderCorrelation);
container.addEventListener('pointerover', event => {
  const mark = event.target.closest('[data-statistics-tooltip]');
  // Scrolling under a stationary pointer must not replace a keyboard tooltip.
  if (document.activeElement?.matches('[data-statistics-tooltip]') && document.activeElement !== mark) return;
  if (mark && !mark.contains(event.relatedTarget)) showTooltip(mark, { x: event.clientX, y: event.clientY });
});
container.addEventListener('pointermove', event => {
  const mark = event.target.closest('[data-statistics-tooltip]');
  if (mark && event.pointerType === 'mouse' && mark !== tooltipMark) showTooltip(mark, { x: event.clientX, y: event.clientY });
  else if (tooltipMark && event.pointerType === 'mouse' && tooltipMark.contains(event.target) && tooltip.matches(':popover-open')) positionTooltip({ x: event.clientX, y: event.clientY });
});
container.addEventListener('pointerout', event => {
  if (tooltipMark?.contains(event.target) && !tooltipMark.contains(event.relatedTarget)) scheduleTooltipHide();
});
container.addEventListener('focusin', event => {
  const mark = event.target.closest('[data-statistics-tooltip]');
  if (mark) showTooltip(mark);
});
container.addEventListener('focusout', event => {
  if (tooltipMark?.contains(event.target)) scheduleTooltipHide();
});
container.addEventListener('click', event => {
  const mark = event.target.closest('[data-statistics-tooltip]');
  if (mark) showTooltip(mark);
});
tooltip.addEventListener('pointerenter', () => clearTimeout(tooltipCloseTimer));
tooltip.addEventListener('pointerleave', scheduleTooltipHide);
document.addEventListener('pointerdown', event => {
  if (tooltipMark && !tooltipMark.contains(event.target) && !tooltip.contains(event.target)) hideTooltip();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && tooltipMark) hideTooltip(); });
document.addEventListener('scroll', event => {
  if (tooltip.contains(event.target)) return;
  // Keyboard focus can scroll a chart into view after focusin opens its tooltip.
  if (tooltipMark && document.activeElement === tooltipMark) {
    positionTooltip();
    return;
  }
  hideTooltip();
}, true);
window.addEventListener('resize', () => {
  if (tooltipMark && document.activeElement === tooltipMark) positionTooltip();
  else hideTooltip();
});
head.addEventListener('click', event => {
  const key = event.target.closest('button[data-key]')?.dataset.key;
  if (!key) return;
  sort = { key, direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc' };
  renderTable();
});
exportButton.addEventListener('click', async () => {
  // Snapshot the displayed selection before the lazy library finishes loading.
  const data = sortedRows().map(row => Object.fromEntries(columns.map(([key, label]) => [label, row[key]])));
  const state = State.getState();
  const count = rows.length;
  exportButton.disabled = true;
  try {
    const XLSX = await loadSpreadsheet();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Comparativo 2019-2026');
    const metadata = [
      ['Indicador', 'Pobreza PBF: pessoas por faixa de renda, não beneficiários do Bolsa Família'],
      ['Fontes', 'info_2019.json; info_tabcad.json (CadÚnico agosto/2026)'],
      ['População 2026*', 'População estimada da base atual; o arquivo não explicita seu ano efetivo de referência'],
      ['Mesorregião', state.mesoregionFilter === 'all' ? 'Todas' : state.mesoregionFilter],
      ['Busca por município', state.searchTerm], ['Status do indicador', state.riskFilter],
      ['Faixa populacional', state.populationBand], ['População mínima', state.populationMin], ['População máxima', state.populationMax],
      ['Ano aplicado aos filtros', state.pobPbfAno === '2019' ? '2019' : '2026'], ['Municípios', count],
      ['Cálculos', 'Δ = 2026 − 2019; variação (%) = (2026 / 2019 − 1) × 100; taxa = pessoas / população do ano × 100; diferença de taxa em p.p.'],
      ['Ausências', 'Célula vazia = sem dado ou base zero para variação relativa; zero é valor válido'],
      ['Comparabilidade', 'Dois retratos, não série anual. Mudanças cadastrais, de renda e de estimativa populacional podem afetar a comparação. Correlação não implica causalidade.'],
      ['Data da exportação', new Date().toLocaleString('pt-BR')]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Campo', 'Valor'], ...metadata]), 'Metodologia e filtros');
    XLSX.writeFile(workbook, 'Pobreza_PBF_Estatisticas_2019_2026.xlsx');
  } catch (error) {
    window.alert(`Não foi possível exportar: ${error.message}`);
  } finally { exportButton.disabled = !rows.length; }
});

['viewMode', 'activeTab', 'pobIndicator', 'pobPbfAno', 'searchTerm', 'mesoregionFilter', 'riskFilter', 'populationBand', 'populationMin', 'populationMax'].forEach(key => State.subscribe(key, render));
