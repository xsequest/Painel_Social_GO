import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function ready(page) {
  await page.goto('index.html');
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await expect(page.locator('#map-loading-overlay')).toBeHidden();
}
async function openStatistics(page) {
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  await page.locator('#view-estatisticas').click();
  await expect(page.locator('#statistics-container')).toBeVisible();
}

test('region filter composes globally, resets and agrees with the statistical sample', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const current = JSON.parse(await readFile(new URL('../output/info_tabcad.json', import.meta.url), 'utf8'));
  const regions = ['Centro Norte', 'Centro Sudeste', 'Centro-Oeste', 'Nordeste', 'Sudoeste'];
  const regionFilter = page.getByRole('combobox', { name: 'Região', exact: true });
  await expect(regionFilter).toHaveAttribute('id', 'filter-region');
  await expect(regionFilter.locator('option')).toHaveText(['Todas as regiões', ...regions]);
  expect(await regionFilter.locator('option').evaluateAll(options => options.map(option => option.value)))
    .toEqual(['all', ...regions]);
  const map = page.locator('#map .leaflet-overlay-pane');
  for (const region of regions) {
    const expectedLabels = Object.values(current).filter(record => record.macrorregiao_sus === region)
      .map(record => `Selecionar município ${record['município']}`).sort();
    expect(expectedLabels.length).toBeGreaterThan(0);
    await regionFilter.selectOption(region);
    await expect.poll(() => map.locator('path[aria-hidden="false"]')
      .evaluateAll(paths => paths.map(path => path.getAttribute('aria-label')).sort())).toEqual(expectedLabels);
    await expect(map.locator('path[tabindex="0"]')).toHaveCount(expectedLabels.length);
    await expect(map.locator('path[fill-opacity="0.96"]')).toHaveCount(expectedLabels.length);
    await expect(map.locator('path[aria-hidden="true"]')).toHaveCount(246 - expectedLabels.length);
  }
  await page.locator('#btn-reset-filters').click();
  await expect(regionFilter).toHaveValue('all');
  await expect(map.locator('path[aria-hidden="false"]')).toHaveCount(246);
  await expect(map.locator('path[tabindex="0"]')).toHaveCount(246);
  await expect(map.locator('path[fill-opacity="0.96"]')).toHaveCount(246);
  const source = Object.entries(current).filter(([, record]) => record.macrorregiao_sus === 'Centro-Oeste').map(([id]) => id);
  expect(source.length).toBeGreaterThan(1);
  await regionFilter.selectOption('Centro-Oeste');
  await page.locator('#view-tabela').click();
  await expect(page.locator('#table-body tr')).toHaveCount(source.length);
  await page.locator('#filter-search').fill('Abadia');
  await expect(page.locator('#table-body tr')).toHaveCount(1);
  await openStatistics(page);
  await expect(page.locator('#statistics-table-body tr')).toHaveCount(1);
  await expect(page.locator('#statistics-scope')).toContainText('Centro-Oeste · 1 municípios');
  await expect(page.locator('#statistics-correlation-context')).toContainText('indisponível');
  const cells = page.locator('#statistics-table-body tr').first().locator('th, td');
  await expect(cells.nth(0)).toHaveText('Abadia de Goiás');
  await expect(cells.nth(8)).toHaveText('+2.429');
  await expect(cells.nth(12)).toContainText('-23,46');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#statistics-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Pobreza_PBF_Estatisticas_2019_2026.xlsx');
  const bytes = await readFile(await download.path());
  const spreadsheet = await page.evaluate(bytes => {
    const workbook = window.XLSX.read(new Uint8Array(bytes), { type: 'array' });
    return { data: window.XLSX.utils.sheet_to_json(workbook.Sheets['Comparativo 2019-2026']), metadata: window.XLSX.utils.sheet_to_json(workbook.Sheets['Metodologia e filtros']) };
  }, [...bytes]);
  expect(spreadsheet.data).toHaveLength(1);
  expect(spreadsheet.data[0]['Δ PBF (pessoas)']).toBe(2429);
  expect(spreadsheet.data[0]['Região']).toBe('Centro-Oeste');
  expect(spreadsheet.metadata.find(row => row.Campo === 'Região').Valor).toBe('Centro-Oeste');
  await page.locator('#filter-search').fill('Jataí');
  await expect(page.locator('#statistics-empty')).toBeVisible();
  await expect(page.locator('#statistics-content')).toBeHidden();
  await expect(page.locator('#statistics-export')).toBeDisabled();
  await page.locator('#btn-reset-filters').click();
  await expect(regionFilter).toHaveValue('all');
  await expect(page.locator('#filter-search')).toHaveValue('');
  await expect(page.locator('#statistics-table-body tr')).toHaveCount(246);
  await expect(page.locator('#statistics-empty')).toBeHidden();
  expect(errors).toEqual([]);
});

test('statistics availability, chart rankings, sorting and switching views', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#view-estatisticas')).toBeHidden();
  await openStatistics(page);
  await expect(page.locator('#side-panel')).toBeHidden();
  await expect(page.locator('#view-estatisticas')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#statistics-ranking-chart svg g[tabindex]')).toHaveCount(15);
  const waterfall = await page.locator('#statistics-waterfall-chart svg').getAttribute('aria-label');
  expect(waterfall).toContain('pessoas');
  await page.locator('#statistics-metric').selectOption('populationChange');
  await expect(page.locator('#statistics-ranking-chart svg')).toHaveAttribute('aria-label', /variação populacional/);
  await page.locator('#statistics-order').selectOption('decrease');
  const populationLabels = await page.locator('#statistics-ranking-chart g[tabindex]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  expect(populationLabels.every(label => label.includes('-'))).toBe(true);
  await page.locator('#statistics-metric').selectOption('pbfDelta');
  await expect(page.locator('#statistics-ranking-chart svg')).toHaveAttribute('aria-label', /diferença PBF em pessoas/);
  const sort = page.locator('#statistics-table-head button[data-key="populationChange"]');
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(sort).toBeFocused();
  await expect(sort.locator('..')).toHaveAttribute('aria-sort', 'ascending');
  await page.keyboard.press('Enter');
  await expect(sort.locator('..')).toHaveAttribute('aria-sort', 'descending');
  await page.locator('#view-tabela').click();
  await expect(page.locator('#statistics-container')).toBeHidden();
  await expect(page.locator('#side-panel')).toBeVisible();
  await page.locator('#view-estatisticas').click();
  await page.locator('#sel-pob-ind').selectOption('norm_ext');
  await expect(page.locator('#statistics-container')).toBeHidden();
  await expect(page.locator('#view-estatisticas')).toBeHidden();
  await expect(page.locator('#view-mapa')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#tab-prog').click();
  await expect(page.locator('#view-scatter')).toBeVisible();
  await page.locator('#view-scatter').click();
  await page.locator('#filter-region').selectOption('Centro-Oeste');
  await expect(page.locator('#scatter-chart-svg circle[tabindex="0"]').first()).toBeVisible();
  const scope = await page.evaluate(async () => {
    const { State, DataSelectors } = await import('./assets/js/core.js');
    return DataSelectors.getFilteredFeatures(State.getState()).map(f => f.properties.macrorregiao_sus);
  });
  expect(scope.length).toBeGreaterThan(0);
  expect(scope.every(value => value === 'Centro-Oeste')).toBe(true);
});

test('statistics compares both years while respecting the selected filter reference year', async ({ page }) => {
  await ready(page);
  await openStatistics(page);
  await page.locator('#filter-pop').selectOption('lt20k');
  for (const year of ['2019', '2026', 'diff']) {
    const expected = await page.evaluate(async year => {
      const { State, DataSelectors } = await import('./assets/js/core.js');
      State.set('pobPbfAno', year);
      return DataSelectors.getFilteredFeatures(State.getState()).length;
    }, year);
    await expect(page.locator('#statistics-table-body tr')).toHaveCount(expected);
    await expect(page.locator('#statistics-scope')).toContainText(`filtros de status/população: ${year === '2019' ? '2019' : '2026'}`);
    await expect(page.locator('#statistics-table-head')).toContainText('Pobreza PBF 2019');
    await expect(page.locator('#statistics-table-head')).toContainText('Pobreza PBF 2026');
    const firstCode = await page.locator('#statistics-table-body tr').first().getAttribute('data-code');
    const expectedDifference = await page.evaluate(async code => {
      const { geojsonData } = await import('./assets/js/data.js');
      const { Utils, fmtPtbrNum } = await import('./assets/js/core.js');
      return fmtPtbrNum(Utils.getPbfVariacao2026x2019(geojsonData.features.find(feature => feature.id === code).properties));
    }, firstCode);
    await expect(page.locator('#statistics-table-body tr').first().locator('td').last()).toContainText(expectedDifference);
  }
});

test('dumbbell uses open and filled endpoints, directional arrows and separate comparative labels', async ({ page }) => {
  await ready(page);
  await openStatistics(page);
  const chart = page.locator('#statistics-ranking-chart');
  for (const [order, direction] of [['decrease', -1], ['increase', 1]]) {
    await page.locator('#statistics-order').selectOption(order);
    const expected = await page.evaluate(async order => {
      const { geojsonData } = await import('./assets/js/data.js');
      const { buildStatisticsRows, rankStatistics } = await import('./assets/js/statistics-data.js');
      const { fmtPtbrNum } = await import('./assets/js/core.js');
      const row = rankStatistics(buildStatisticsRows(geojsonData.features), 'rateDelta', order)[0];
      return { rates: `${fmtPtbrNum(row.rate2019)} → ${fmtPtbrNum(row.rate2026)}%`, delta: `${row.rateDelta > 0 ? '+' : ''}${fmtPtbrNum(row.rateDelta)} p.p.` };
    }, order);
    const row = chart.locator('g[tabindex]').first();
    await expect(row.locator('.statistics-dumbbell-rates')).toHaveText(expected.rates);
    await expect(row.locator('.statistics-dumbbell-delta')).toHaveText(expected.delta);
    const geometry = await row.evaluate(element => {
      const start = element.querySelector('.statistics-2019'), end = element.querySelector('.statistics-2026');
      const arrow = element.querySelector('.statistics-dumbbell-arrow');
      const points = arrow.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
      const rates = element.querySelector('.statistics-dumbbell-rates').getBBox();
      const delta = element.querySelector('.statistics-dumbbell-delta').getBBox();
      return { start: Number(start.getAttribute('cx')), end: Number(end.getAttribute('cx')), arrowDirection: Math.sign(points[2] - points[0]), startFill: getComputedStyle(start).fill, endFill: getComputedStyle(end).fill, labelGap: delta.x - (rates.x + rates.width) };
    });
    expect(Math.sign(geometry.end - geometry.start)).toBe(direction);
    expect(geometry.arrowDirection).toBe(direction);
    expect(geometry.startFill).not.toBe(geometry.endFill);
    expect(geometry.labelGap).toBeGreaterThan(8);
    await row.focus();
    await expect(page.locator('#statistics-tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.locator('#statistics-metric').selectOption('populationChange');
  await expect(chart.locator('.statistics-dumbbell-rates')).toHaveCount(0);
  await expect(chart.locator('.statistics-dumbbell-arrow')).toHaveCount(0);
});

test('statistical tooltips show detailed values, support hover and keyboard, and dismiss safely', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await openStatistics(page);
  const tooltip = page.locator('#statistics-tooltip');
  const mark = page.locator('#statistics-ranking-chart g[tabindex]').first();
  const name = (await mark.getAttribute('aria-label')).split(':')[0];
  await mark.focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('strong')).toHaveText(name);
  await expect(tooltip.locator('thead')).toContainText('2019');
  await expect(tooltip.locator('thead')).toContainText('2026');
  await expect(tooltip).toContainText('Δ população');
  await expect(tooltip).toContainText('Δ Pobreza PBF');
  await expect(tooltip).toContainText('p.p.');
  await expect(mark).toHaveAttribute('aria-describedby', 'statistics-tooltip');
  await expect(mark.locator('title')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(mark).toBeFocused();
  await page.locator('#statistics-metric').focus();
  await mark.hover({ position: { x: 20, y: 15 } });
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await page.waitForTimeout(220);
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  const total = page.locator('#statistics-waterfall-chart g[tabindex]').last();
  await total.focus();
  await expect(tooltip.locator('strong')).toHaveText('Saldo total');
  await expect(tooltip).toContainText('246 municípios');
  await expect(tooltip).toContainText('Contribuição ao saldo');
  await expect(tooltip).toContainText('Saldo após');
  const point = page.locator('#statistics-correlation-chart g[tabindex]').first();
  await point.focus();
  await expect(tooltip.locator('strong')).toHaveText('Abadia de Goiás');
  await expect(tooltip).toContainText('Centro-Oeste');
  await expect(tooltip).toContainText('4.841');
  await expect(tooltip).toContainText('7.270');
  await expect(tooltip).toContainText('-23,46 p.p.');
  await page.locator('#filter-region').selectOption('Sudoeste');
  await expect(tooltip).toBeHidden();
  expect(errors).toEqual([]);
});

test('95% framing changes only the visible axes and keeps Pearson, table and export sample', async ({ page }) => {
  await ready(page);
  await openStatistics(page);
  const context = await page.locator('#statistics-correlation-context').textContent();
  const firstTableRow = await page.locator('#statistics-table-body tr').first().textContent();
  await expect(page.locator('#statistics-correlation-chart circle[data-code]')).toHaveCount(246);
  await page.locator('#statistics-correlation-frame').selectOption('0.95');
  const expected = await page.evaluate(async () => {
    const { buildStatisticsRows, getCorrelationFrame } = await import('./assets/js/statistics-data.js');
    const { geojsonData } = await import('./assets/js/data.js');
    const points = buildStatisticsRows(geojsonData.features).map(row => ({ x: row.populationChange, y: row.rateDelta }));
    return getCorrelationFrame(points, .95).visible.length;
  });
  expect(expected).toBeLessThan(246);
  expect(expected).toBeGreaterThan(200);
  await expect(page.locator('#statistics-correlation-chart circle[data-code]')).toHaveCount(expected);
  await expect(page.locator('#statistics-correlation-context')).toHaveText(context);
  await expect(page.locator('#statistics-correlation-framing')).toContainText(`${246 - expected} fora do enquadramento`);
  await expect(page.locator('#statistics-table-body tr')).toHaveCount(246);
  await expect(page.locator('#statistics-table-body tr').first()).toHaveText(firstTableRow);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#statistics-export').click();
  const bytes = await readFile(await (await downloadPromise).path());
  const exportedCount = await page.evaluate(bytes => {
    const workbook = window.XLSX.read(new Uint8Array(bytes), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(workbook.Sheets['Comparativo 2019-2026']).length;
  }, [...bytes]);
  expect(exportedCount).toBe(246);
  await page.locator('#statistics-correlation-frame').selectOption('1');
  await expect(page.locator('#statistics-correlation-chart circle[data-code]')).toHaveCount(246);
  await page.locator('#filter-search').fill('Abadia de Goiás');
  await expect(page.locator('#statistics-table-body tr')).toHaveCount(1);
  await page.locator('#statistics-correlation-frame').selectOption('0.95');
  await expect(page.locator('#statistics-correlation-chart circle[data-code]')).toHaveCount(1);
  await expect(page.locator('#statistics-correlation-framing')).toContainText('Amostra menor que 3 pares');
});

test.describe('statistical touch tooltips', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('tap opens a tooltip within the viewport and outside tap dismisses it', async ({ page }) => {
    await ready(page);
    await openStatistics(page);
    const mark = page.locator('#statistics-ranking-chart g[tabindex]').first();
    await mark.scrollIntoViewIfNeeded();
    await mark.tap({ position: { x: 24, y: 15 } });
    const tooltip = page.locator('#statistics-tooltip');
    await expect(tooltip).toBeVisible();
    const bounds = await tooltip.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    expect(bounds.y).toBeGreaterThanOrEqual(12);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(378);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(832);
    await page.touchscreen.tap(3, 3);
    await expect(tooltip).toBeHidden();
  });
});

for (const width of [390, 768, 1366]) {
  test(`statistics fits ${width}px in both themes without horizontal page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await openStatistics(page);
    for (const dark of [false, true]) {
      await page.evaluate(async dark => (await import('./assets/js/core.js')).State.set('isDark', dark), dark);
      await expect(page.locator('#statistics-table-body tr')).toHaveCount(246);
      const dimensions = await page.locator('#statistics-container').evaluate(element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, ownOverflow: element.scrollWidth > element.clientWidth };
      });
      expect(dimensions.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.right).toBeLessThanOrEqual(dimensions.width);
      expect(dimensions.overflow).toBe(false);
      expect(dimensions.ownOverflow).toBe(false);
      await page.locator('#statistics-ranking-chart g[tabindex]').first().focus();
      const tooltip = page.locator('#statistics-tooltip');
      await expect(tooltip).toBeVisible();
      const bounds = await tooltip.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(12);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 12);
      expect(bounds.y).toBeGreaterThanOrEqual(12);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(844 - 12);
      await page.keyboard.press('Escape');
      await page.locator('.statistics-methodology summary').click();
      await expect(page.locator('.statistics-methodology')).toContainText('não explicita seu ano efetivo');
      await page.locator('.statistics-methodology summary').click();
    }
    expect(errors).toEqual([]);
  });
}
