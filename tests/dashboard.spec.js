import { test, expect } from '@playwright/test';

const route = '/mapa_calor_v0.10.21.html';
async function ready(page) {
  await page.goto(route);
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await expect(page.locator('#map-loading-overlay')).toBeHidden();
}

test('loads local data, keeps geometry and camera, updates indicator table, exports lazily', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.locator('.leaflet-control-zoom-in').click();
  await expect(page.locator('#map')).not.toHaveClass(/leaflet-zoom-anim/);
  const camera = await page.locator('#map .leaflet-map-pane').evaluate(element => element.style.transform);
  await page.evaluate(() => { window.firstPolygon = document.querySelector('#map .leaflet-overlay-pane path'); });
  await page.locator('#sel-pob-pal').selectOption('viridis_r');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.evaluate(() => window.firstPolygon === document.querySelector('#map .leaflet-overlay-pane path'))).toBe(true);
  expect(await page.locator('#map .leaflet-map-pane').evaluate(element => element.style.transform)).toBe(camera);
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  await page.locator('#view-tabela').click();
  await expect(page.locator('#table-head')).toContainText('Pobreza PBF 2026');
  await expect(page.locator('#table-body tr')).toHaveCount(246);
  expect(await page.evaluate(() => Boolean(window.XLSX))).toBe(false);
  const download = page.waitForEvent('download');
  await page.locator('#btn-export').click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  expect(errors).toEqual([]);
});

test('reset cancels search and population timers; malformed inputs do not filter', async ({ page }) => {
  await ready(page);
  await page.locator('#filter-search').fill('Goiania');
  await page.locator('#btn-reset-filters').click();
  await expect.poll(() => page.evaluate(async () => (await import('/assets/js/core.js')).State.get('searchTerm'))).toBe('');
  await page.locator('#filter-pop').selectOption('custom');
  await page.locator('#filter-pop-min').fill('50000abc');
  await expect(page.locator('#custom-population-error')).toBeVisible();
  await page.locator('#filter-pop-min').fill('50.000');
  await page.locator('#btn-reset-filters').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(async () => (await import('/assets/js/core.js')).State.get('populationBand'))).toBe('all');
  await expect(page.locator('#filter-pop-min')).toHaveValue('');
});

test('table controls work by keyboard and sort focus survives rendering', async ({ page }) => {
  await ready(page);
  await page.locator('#view-tabela').click();
  const sort = page.locator('#table-head button').first();
  await sort.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#table-head th').first()).toHaveAttribute('aria-sort', 'descending');
  await expect(sort).toBeFocused();
  await page.locator('#table-body button').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#panel-city-name')).not.toHaveText('Goiás');
});

test('program correlation selection agrees with panel and modal traps focus', async ({ page }) => {
  await ready(page);
  await page.locator('#tab-prog').click();
  await page.locator('#view-scatter').click();
  const point = page.locator('#scatter-chart-svg circle[tabindex="0"]').first();
  await expect(point).toBeVisible();
  await point.focus();
  await page.keyboard.press('Enter');
  const selected = await page.evaluate(async () => (await import('/assets/js/core.js')).State.get('selectedCity').name);
  await expect(page.locator('#panel-city-name')).toHaveText(selected);
  await page.locator('#scatter-expand').click();
  await expect(page.locator('#scatter-dialog')).toBeVisible();
  expect(await page.locator('#main-layout').evaluate(element => element.inert)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('#scatter-dialog')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#scatter-dialog')).toBeHidden();
  await expect(page.locator('#scatter-expand')).toBeFocused();
});

for (const width of [360, 390, 768, 1024, 1366]) {
  test(`table usable at ${width}px without page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await ready(page);
    await page.locator('#view-tabela').click();
    const dimensions = await page.locator('#table-container').evaluate(element => ({ width: element.clientWidth - parseFloat(getComputedStyle(element).paddingLeft) - parseFloat(getComputedStyle(element).paddingRight), page: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(dimensions.width).toBeGreaterThan(200);
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test('diagnoses missing data safely', async ({ page }) => {
  await page.route('**/output/info_tabcad.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto(route);
  await expect(page.getByRole('alert')).toContainText('info_tabcad.json: HTTP 404');
});

test('all social indicators agree with filtered table and numeric export', async ({ page }) => {
  await ready(page);
  await page.locator('#view-tabela').click();
  await page.locator('#filter-risk').selectOption('critico');
  for (const indicator of ['norm_ext', 'norm_pob', 'norm_pob_p1_p2']) {
    await page.locator('#sel-pob-ind').selectOption(indicator);
    const expected = await page.evaluate(async () => {
      const { State, DataSelectors, ColumnSelectors } = await import('/assets/js/core.js');
      const state = State.getState();
      return { count: DataSelectors.getFilteredFeatures(state).length, labels: ColumnSelectors.get(state).map(column => column.label) };
    });
    await expect(page.locator('#table-body tr[data-index]')).toHaveCount(expected.count);
    for (const label of expected.labels) await expect(page.locator('#table-head')).toContainText(label);
  }
  await page.locator('#filter-risk').selectOption('all');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export').click();
  const { readFile } = await import('node:fs/promises');
  const bytes = Array.from(await readFile(await (await downloadPromise).path()));
  const exported = await page.evaluate(bytes => {
    const workbook = window.XLSX.read(Uint8Array.from(bytes), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(workbook.Sheets['Dados Numericos']);
  }, bytes);
  expect(exported).toHaveLength(246);
  const abadia = exported.find(row => row['Município'] === 'Abadia de Goiás');
  expect(abadia['Pobreza PBF 2026']).toBe(7270);
  expect(abadia['% PBF 2026']).toBeCloseTo(100 * 7270 / 22918, 10);
});

test('selection changed while correlation is hidden is restored from shared state', async ({ page }) => {
  await ready(page);
  await page.locator('#tab-prog').click();
  await page.locator('#view-scatter').click();
  await page.locator('#scatter-municipio-select').selectOption({ label: 'Abadia de Goiás' });
  await page.locator('#view-mapa').click();
  await page.evaluate(async () => {
    const { State } = await import('/assets/js/core.js');
    const { geojsonData } = await import('/assets/js/data.js');
    State.set('selectedCity', geojsonData.features.find(feature => feature.properties.name === 'Abadiânia').properties);
  });
  await page.locator('#view-scatter').click();
  await expect(page.locator('#scatter-municipio-select option:checked')).toContainText('Abadiânia');
  await expect(page.locator('#panel-city-name')).toHaveText('Abadiânia');
});

test('radar PLES does not inherit hidden status/metric and dialog restores focus', async ({ page }) => {
  await ready(page);
  await page.locator('#tab-prog').click();
  await page.locator('#sel-prog-status').selectOption('Acumulado');
  await page.locator('#sel-prog-metrica').selectOption('Pessoas');
  await page.locator('#sel-prog-programa').selectOption('PLES');
  await page.evaluate(async () => {
    const { State } = await import('/assets/js/core.js');
    const { geojsonData } = await import('/assets/js/data.js');
    State.set('selectedCity', geojsonData.features.find(feature => feature.id === '5200050').properties);
  });
  await expect(page.locator('#program-comparison-chart')).toBeVisible();
  const values = await page.evaluate(() => {
    const chart = window.Chart.getChart('program-comparison-chart');
    return { labels: chart.data.labels, data: chart.data.datasets[0].data };
  });
  expect(values.data.every(value => value === null || Number.isFinite(value))).toBe(true);
  expect(values.data.some(value => value !== null && value > 0)).toBe(true);
  await page.locator('#btn-radar-expand').click();
  await expect(page.locator('#radar-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#radar-dialog')).toBeHidden();
  await expect(page.locator('#btn-radar-expand')).toBeFocused();
});

test('theme refreshes chart colors and reduced motion disables animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.evaluate(async () => {
    const { State } = await import('/assets/js/core.js');
    const { geojsonData } = await import('/assets/js/data.js');
    State.set('selectedCity', geojsonData.features[0].properties);
  });
  await page.locator('#btn-dark-toggle').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const animation = await page.evaluate(() => window.Chart.getChart('comparison-chart')?.options.animation);
  expect(animation).toBe(false);
});

test('blocked export dependency does not break other features', async ({ page }) => {
  await page.route('**/xlsx.full.min.js', route => route.abort());
  await ready(page);
  await page.locator('#view-tabela').click();
  const dialogPromise = page.waitForEvent('dialog');
  await page.locator('#btn-export').click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('Não foi possível exportar');
  await dialog.dismiss();
  await expect(page.locator('#btn-export')).toBeEnabled();
  await expect(page.locator('#table-body tr')).toHaveCount(246);
});

test('missing core library has a specific initialization diagnostic', async ({ page }) => {
  await page.route('**/assets/vendor/chroma.min.js', route => route.abort());
  await page.goto(route);
  await expect(page.getByRole('alert')).toContainText('chroma');
});

test('leaving custom population reconciles discarded edits with applied limits', async ({ page }) => {
  await ready(page);
  await page.locator('#filter-pop').selectOption('custom');
  await page.locator('#filter-pop-min').fill('10.000');
  await expect.poll(() => page.evaluate(async () => (await import('/assets/js/core.js')).State.get('populationMin'))).toBe(10000);
  await page.locator('#filter-pop-min').fill('50.000');
  await page.locator('#filter-pop').selectOption('all');
  await page.locator('#filter-pop').selectOption('custom');
  await expect(page.locator('#filter-pop-min')).toHaveValue('10.000');
  await page.waitForTimeout(200);
  expect(await page.evaluate(async () => (await import('/assets/js/core.js')).State.get('populationMin'))).toBe(10000);
});

test('unknown indicator never becomes a zero statewide; population stays visible', async ({ page }) => {
  await page.route('**/output/info_tabcad.json', async route => {
    const response = await route.fetch();
    const json = await response.json();
    Object.values(json).forEach(record => { record.ext_pob = null; });
    await route.fulfill({ json });
  });
  await ready(page);
  await expect(page.locator('#panel-overview-grid .overview-card').first()).toContainText('População');
  const totalPopulation = await page.evaluate(async () => (await import('/assets/js/data.js')).geojsonData.features.reduce((sum, feature) => sum + feature.properties.população, 0));
  await expect(page.locator('#panel-overview-grid .overview-card').first()).toContainText(new Intl.NumberFormat('pt-BR').format(totalPopulation));
  await page.evaluate(async () => {
    const { State } = await import('/assets/js/core.js');
    const { geojsonData } = await import('/assets/js/data.js');
    State.set('selectedCity', geojsonData.features[0].properties);
  });
  await expect.poll(() => page.evaluate(() => window.Chart.getChart('comparison-chart')?.data.datasets[0].data)).toEqual([null, null]);
  await expect(page.locator('#collapsed-population')).toContainText('22.918');
});

test('fullscreen control is disabled when the browser has no support', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }); });
  await ready(page);
  await expect(page.locator('#btn-kiosk')).toBeDisabled();
});
