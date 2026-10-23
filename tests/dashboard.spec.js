import { test, expect } from '@playwright/test';

const route = 'index.html';
async function ready(page) {
  await page.goto(route);
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await expect(page.locator('#map-loading-overlay')).toBeHidden();
}

test('loads local data, keeps geometry and camera, updates indicator table, exports lazily', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.locator('.leaflet-control-zoom')).toHaveCount(0);
  await page.locator('#map').focus();
  await page.keyboard.press('Equal');
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
  await expect.poll(() => page.evaluate(async () => (await import('./assets/js/core.js')).State.get('searchTerm'))).toBe('');
  await page.locator('#filter-pop').selectOption('custom');
  await page.locator('#filter-pop-min').fill('50000abc');
  await expect(page.locator('#custom-population-error')).toBeVisible();
  await page.locator('#filter-pop-min').fill('50.000');
  await page.locator('#btn-reset-filters').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).State.get('populationBand'))).toBe('all');
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
  const selected = await page.evaluate(async () => (await import('./assets/js/core.js')).State.get('selectedCity').name);
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
      const { State, DataSelectors, ColumnSelectors } = await import('./assets/js/core.js');
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

test('poverty map legend rescales when the selected indicator changes', async ({ page }) => {
  await ready(page);
  const legendValues = page.locator('#map-legend-host .legend > div.flex');
  const extLegendMax = await legendValues.last().innerText();

  await page.locator('#sel-pob-ind').selectOption('norm_pob');
  await expect(page.locator('#map-legend-host .legend > strong')).toContainText('Pobreza');
  await expect.poll(() => legendValues.last().innerText()).not.toBe(extLegendMax);

  const expectedMax = await page.evaluate(async () => {
    const { State, MetricSelectors, Utils } = await import('./assets/js/core.js');
    const state = State.getState();
    return MetricSelectors.get(state).formatScaleValue(Utils.getDynamicMax(state));
  });
  await expect(legendValues.last()).toHaveText(expectedMax);
});

test('selection changed while correlation is hidden is restored from shared state', async ({ page }) => {
  await ready(page);
  await page.locator('#tab-prog').click();
  await page.locator('#view-scatter').click();
  await page.locator('#scatter-municipio-select').selectOption({ label: 'Abadia de Goiás' });
  await page.locator('#view-mapa').click();
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
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
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    State.set('selectedCity', geojsonData.features.find(feature => feature.id === '5200050').properties);
  });
  await expect(page.locator('#program-comparison-chart')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.Chart.getChart('program-comparison-chart')))).toBe(true);
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

test('charts omit the data table option and keep hover tooltips interactive', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    State.set('selectedCity', geojsonData.features.find(feature => feature.properties.name === 'Abadiânia').properties);
  });

  const canvas = page.locator('#comparison-chart');
  await expect(canvas).toBeVisible();
  await expect(page.getByText('Consultar todos os dados do gráfico')).toHaveCount(0);
  await expect(page.locator('.chart-data')).toHaveCount(0);

  const point = await canvas.evaluate(element => {
    const chart = window.Chart.getChart(element);
    const { x, y } = chart.getDatasetMeta(0).data[0].getCenterPoint();
    return { x, y, tooltipEnabled: chart.options.plugins.tooltip.enabled !== false };
  });
  expect(point.tooltipEnabled).toBe(true);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await expect.poll(() => canvas.evaluate(element => window.Chart.getChart(element).tooltip.opacity)).toBeGreaterThan(0);
  const rowPosition = await canvas.evaluate(element => {
    const chart = window.Chart.getChart(element);
    const { y } = chart.getDatasetMeta(0).data[0].getCenterPoint();
    return { x: chart.chartArea.left + 4, y };
  });
  await page.mouse.move(box.x + rowPosition.x, box.y + rowPosition.y);
  await expect.poll(() => canvas.evaluate(element => window.Chart.getChart(element).tooltip.opacity)).toBeGreaterThan(0);
});

test('selected municipality shows charts and selected indicator in collapsed panel', async ({ page }) => {
  await ready(page);
  await page.locator('#tab-prog').click();
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    State.set('selectedCity', geojsonData.features.find(feature => feature.properties.name === 'Abadiânia').properties);
  });

  const comparison = page.locator('#comparison-chart');
  const radar = page.locator('#program-comparison-chart');
  await expect(comparison).toBeVisible();
  await expect(radar).toBeVisible();
  const chartPositions = await page.evaluate(() => {
    const details = document.querySelector('#panel-city-details');
    const dataTitle = details.querySelector('h5').getBoundingClientRect();
    const comparisonRect = document.querySelector('#comparison-chart').getBoundingClientRect();
    const radarRect = document.querySelector('#program-comparison-chart').getBoundingClientRect();
    return { dataTitleTop: dataTitle.top, comparisonTop: comparisonRect.top, comparisonHeight: comparisonRect.height, radarHeight: radarRect.height };
  });
  expect(chartPositions.dataTitleTop).toBeLessThan(chartPositions.comparisonTop);
  expect(chartPositions.comparisonHeight).toBeGreaterThan(0);
  expect(chartPositions.radarHeight).toBeGreaterThan(0);

  const radarPoint = await radar.evaluate(element => {
    const chart = window.Chart.getChart(element);
    const index = chart.data.datasets[0].data.findIndex(value => Number.isFinite(value));
    const { x, y } = chart.getDatasetMeta(0).data[index].getCenterPoint();
    return { x, y };
  });
  await radar.scrollIntoViewIfNeeded();
  const radarBox = await radar.boundingBox();
  await page.mouse.move(radarBox.x + radarPoint.x, radarBox.y + radarPoint.y);
  await expect.poll(() => radar.evaluate(element => window.Chart.getChart(element).tooltip.opacity)).toBeGreaterThan(0);

  await page.locator('#btn-close-panel').click();
  await expect(page.locator('#collapsed-panel-label')).toHaveText('Abadiânia');
  await expect(page.locator('#collapsed-selected-indicator')).toContainText('Benefícios');
  await expect(page.locator('#panel-methodology')).toHaveCount(0);
  const fillOpacity = await page.locator('#map .leaflet-overlay-pane path').first().evaluate(path => Number(path.getAttribute('fill-opacity')));
  expect(fillOpacity).toBeGreaterThanOrEqual(0.95);
});

test('municipal charts redraw after selecting a different city on a narrow panel', async ({ page }) => {
  await page.setViewportSize({ width: 366, height: 542 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('#tab-prog').click();

  const selectCity = name => page.evaluate(async cityName => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    const feature = geojsonData.features.find(item => item.properties.name === cityName);
    State.set('selectedCity', feature.properties);
  }, name);
  const snapshot = () => page.evaluate(() => {
    const comparison = window.Chart.getChart('comparison-chart');
    const radar = window.Chart.getChart('program-comparison-chart');
    return {
      comparisonLabels: comparison.data.labels,
      comparisonValue: comparison.data.datasets[0].data[0],
      comparisonImage: comparison.toBase64Image(),
      comparisonArea: { width: comparison.chartArea.width, height: comparison.chartArea.height },
      radarValues: radar.data.datasets[0].data,
      radarImage: radar.toBase64Image(),
      radarArea: { width: radar.chartArea.width, height: radar.chartArea.height }
    };
  });

  await selectCity('Abadiânia');
  await expect(page.locator('#panel-city-name')).toHaveText('Abadiânia');
  await expect.poll(() => page.evaluate(() => Boolean(window.Chart.getChart('comparison-chart') && window.Chart.getChart('program-comparison-chart')))).toBe(true);
  const first = await snapshot();

  await selectCity('Goiânia');
  await expect(page.locator('#panel-city-name')).toHaveText('Goiânia');
  await expect.poll(() => page.evaluate(() => window.Chart.getChart('comparison-chart')?.data.labels[0])).toBe('Goiânia');
  const second = await snapshot();

  expect(second.comparisonValue).not.toBe(first.comparisonValue);
  expect(second.comparisonImage).not.toBe(first.comparisonImage);
  expect(second.radarValues).not.toEqual(first.radarValues);
  expect(second.radarImage).not.toBe(first.radarImage);
  for (const area of [second.comparisonArea, second.radarArea]) {
    expect(area.width).toBeGreaterThan(0);
    expect(area.height).toBeGreaterThan(0);
  }
});

test('Pobreza PBF city panel combines enrolment and rate above the population card', async ({ page }) => {
  await ready(page);
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  const city = await page.evaluate(async () => {
    const { State, Utils } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    const properties = geojsonData.features.find(feature => feature.properties.name === 'Goiânia').properties;
    State.set('selectedCity', properties);
    return {
      rate2019: Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(properties.norm_PBF_2019 * 100) + '%',
      rate2026: Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(properties.norm_pob_p1_p2 * 100) + '%',
      count2019: Intl.NumberFormat('pt-BR').format(properties.PBF_2019),
      count2026: Intl.NumberFormat('pt-BR').format(properties.pob_p1_p2),
      population2019: Intl.NumberFormat('pt-BR').format(properties.população_2019),
      population2026: Intl.NumberFormat('pt-BR').format(properties.população),
      rateDifference: properties.norm_pob_p1_p2 * 100 - properties.norm_PBF_2019 * 100,
      populationVariationPct: Utils.getPopulationVariationPct(properties),
      populationVariationAboveAverage: Utils.isPopulationVariationAboveAverage(properties)
    };
  });
  const cards = page.locator('#panel-grid-main .pbf-comparison-card');
  await expect(cards).toHaveCount(2);
  const enrolledCard = cards.nth(0), populationCard = cards.nth(1);
  await expect(enrolledCard).toContainText('Inscritos em Pob. PBF');
  await expect(enrolledCard.locator('.pbf-year-2019')).toContainText(city.count2019);
  await expect(enrolledCard.locator('.pbf-year-2019')).toContainText(city.rate2019);
  await expect(enrolledCard.locator('.pbf-year-2019')).not.toContainText('Taxa');
  await expect(enrolledCard.locator('.pbf-year-2026')).toContainText(city.count2026);
  await expect(enrolledCard.locator('.pbf-year-2026')).toContainText(city.rate2026);
  await expect(enrolledCard.locator('.pbf-year-2026')).not.toContainText('Taxa');
  await expect(enrolledCard.locator('.pbf-year-2019 .pbf-year-secondary')).toHaveClass(/text-(emerald|rose|amber)/);
  await expect(enrolledCard.locator('.pbf-year-2026 .pbf-year-secondary')).toHaveClass(/text-(emerald|rose|amber)/);
  const expectedRateDifference = `${city.rateDifference > 0 ? '↑ +' : city.rateDifference < 0 ? '↓ −' : '→ '}${Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(city.rateDifference))} p.p.`;
  await expect(enrolledCard.locator('.pbf-comparison-difference strong')).toHaveText(expectedRateDifference);
  await expect(populationCard).toContainText('População Municipal');
  await expect(populationCard.locator('.pbf-year-2019')).toContainText(city.population2019);
  await expect(populationCard.locator('.pbf-year-2026')).toContainText(city.population2026);
  await expect(populationCard.locator('.pbf-comparison-difference')).toContainText('pessoas');
  await expect(populationCard.locator('.pbf-comparison-difference strong')).not.toHaveClass(/text-(rose|emerald)/);
  const populationPct = `${city.populationVariationPct > 0 ? '+' : city.populationVariationPct < 0 ? '−' : ''}${Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(city.populationVariationPct))}%`;
  const populationPctNote = populationCard.locator('.pbf-difference-note');
  await expect(populationPctNote).toHaveText(populationPct);
  if (city.populationVariationAboveAverage) await expect(populationPctNote).toHaveClass(/is-above-average/);
  else await expect(populationPctNote).not.toHaveClass(/is-above-average/);
  const positions = await Promise.all([enrolledCard, populationCard].map(card => card.boundingBox()));
  expect(Math.abs(positions[0].x - positions[1].x)).toBeLessThan(2);
  expect(Math.abs(positions[0].width - positions[1].width)).toBeLessThan(2);
  expect(positions[1].y).toBeGreaterThan(positions[0].y);
  const yearStyles = await page.evaluate(() => ({
    secondary: getComputedStyle(document.querySelector('.pbf-year-2019 strong')).color,
    primary: getComputedStyle(document.querySelector('.pbf-year-2026 strong')).fontWeight
  }));
  expect(yearStyles.primary).toBe('900');
  expect(yearStyles.secondary).not.toBe('rgb(30, 41, 59)');
  const titleSize = await enrolledCard.locator('.pbf-comparison-title').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(titleSize).toBeGreaterThanOrEqual(15);
  const contentSizes = await enrolledCard.evaluate(element => [
    parseFloat(getComputedStyle(element.querySelector('.pbf-year-2019 strong')).fontSize),
    parseFloat(getComputedStyle(element.querySelector('.pbf-year-2026 strong')).fontSize),
    parseFloat(getComputedStyle(element.querySelector('.pbf-year-secondary')).fontSize)
  ]);
  expect(contentSizes).toEqual([17, 21, 12]);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePositions = await Promise.all([enrolledCard, populationCard].map(card => card.boundingBox()));
  expect(Math.abs(mobilePositions[0].x - mobilePositions[1].x)).toBeLessThan(2);
  expect(Math.abs(mobilePositions[0].width - mobilePositions[1].width)).toBeLessThan(2);
  expect(mobilePositions[1].y).toBeGreaterThan(mobilePositions[0].y);
});

test('population percentage is highlighted for above-average increase and decrease', async ({ page }) => {
  await ready(page);
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  const setPopulation = population2026 => page.evaluate(async value => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    const city = geojsonData.features.find(feature => feature.properties.name === 'Goiânia').properties;
    State.set('selectedCity', { ...city, população_2019: 100000, população: value });
  }, population2026);
  await setPopulation(1);
  const note = page.locator('#panel-grid-main .pbf-comparison-card').nth(1).locator('.pbf-difference-note');
  await expect(note).toHaveText('−100,00%');
  await expect(note).toHaveClass(/is-above-average/);
  await setPopulation(100000000);
  await expect(note).toHaveText('+99.900,00%');
  await expect(note).toHaveClass(/is-above-average/);
});

test('large population decline and growth warnings appear in all PBF year modes', async ({ page }) => {
  await ready(page);
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  const cityPath = page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true });
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    const properties = geojsonData.features.find(feature => feature.properties.name === 'Goiânia').properties;
    properties.população_2019 = 100000;
    properties.população = 1;
  });
  const mapTooltip = page.locator('.leaflet-tooltip');
  for (const year of ['2019', '2026', 'diff']) {
    await page.evaluate(async selectedYear => (await import('./assets/js/core.js')).State.set('pobPbfAno', selectedYear), year);
    await expect.poll(async () => page.evaluate(async () => (await import('./assets/js/core.js')).State.get('pobPbfAno'))).toBe(year);
    await page.mouse.move(0, 0);
    await cityPath.hover();
    await expect(mapTooltip).toContainText('Queda populacional acentuada (-100,00%)');
    await expect(mapTooltip).not.toContainText('acima da média estadual');
  }
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    geojsonData.features.find(feature => feature.properties.name === 'Goiânia').properties.população = 100000000;
    State.set('pobPbfAno', '2026');
  });
  await page.mouse.move(0, 0);
  await cityPath.hover();
  await expect(mapTooltip).toContainText('Crescimento populacional acentuado (+');
  await expect(mapTooltip).not.toContainText('acima da média estadual');
  await page.locator('#sel-pob-ind').selectOption('norm_ext');
  await page.mouse.move(0, 0);
  await cityPath.hover();
  await expect(mapTooltip).not.toContainText('Crescimento populacional acentuado');
});

test('theme refreshes chart colors and reduced motion disables animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
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
  await expect.poll(() => page.evaluate(async () => (await import('./assets/js/core.js')).State.get('populationMin'))).toBe(10000);
  await page.locator('#filter-pop-min').fill('50.000');
  await page.locator('#filter-pop').selectOption('all');
  await page.locator('#filter-pop').selectOption('custom');
  await expect(page.locator('#filter-pop-min')).toHaveValue('10.000');
  await page.waitForTimeout(200);
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).State.get('populationMin'))).toBe(10000);
});

test('unknown indicator never becomes a zero statewide; population stays visible without valid-population detail', async ({ page }) => {
  await page.route('**/output/info_tabcad.json', async route => {
    const response = await route.fetch();
    const json = await response.json();
    Object.values(json).forEach(record => { record.ext_pob = null; });
    await route.fulfill({ json });
  });
  await ready(page);
  await expect(page.locator('#panel-overview-grid .overview-card').first()).toContainText('População');
  await expect(page.locator('#panel-overview-grid')).not.toContainText('População com indicador válido');
  const totalPopulation = await page.evaluate(async () => (await import('./assets/js/data.js')).geojsonData.features.reduce((sum, feature) => sum + feature.properties.população, 0));
  await expect(page.locator('#panel-overview-grid .overview-card').first()).toContainText(new Intl.NumberFormat('pt-BR').format(totalPopulation));
  await page.evaluate(async () => {
    const { State } = await import('./assets/js/core.js');
    const { geojsonData } = await import('./assets/js/data.js');
    State.set('selectedCity', geojsonData.features[0].properties);
  });
  await expect.poll(() => page.evaluate(() => window.Chart.getChart('comparison-chart')?.data.datasets[0].data)).toEqual([null, null]);
  await expect(page.locator('#collapsed-population')).toContainText('22.918');
});

test('overview municipality names select and locate the city on the map', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#side-panel')).not.toHaveClass(/is-collapsed/);
  const cityButton = page.locator('#panel-overview-ranking .overview-rank-name').first();
  const cityName = await cityButton.textContent();
  await cityButton.click();
  await expect(page.locator('#panel-city-name')).toHaveText(cityName);
  await expect(page.locator('#map .leaflet-overlay-pane path[aria-pressed="true"]')).toHaveAttribute('aria-label', `Selecionar município ${cityName}`);
});

test('absolute quantity card puts the selected indicator above the number', async ({ page }) => {
  await ready(page);
  const card = page.locator('#panel-overview-grid .overview-card').nth(1);
  await expect(card.locator(':scope > :first-child')).toHaveText('Extrema Pobreza');
  await expect(card.locator(':scope > :last-child')).toHaveText('Quantidade absoluta');
  await expect(card.locator(':scope > :nth-child(2)')).toHaveJSProperty('tagName', 'STRONG');
  await page.locator('#tab-prog').click();
  await page.locator('#sel-prog-programa').selectOption('MAES');
  await expect(card.locator(':scope > :first-child')).toContainText('Mães de Goiás');
  await expect(card.locator(':scope > :last-child')).toHaveText('Quantidade absoluta');
  await page.locator('#tab-pob').click();
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  await page.locator('[data-pbf-ano="diff"]').click();
  await expect(card.locator(':scope > :first-child')).toHaveText('Total do PBF em 2026');
  await expect(card.locator(':scope > :last-child')).toHaveText('Quantidade absoluta');
});

test('dark map uses near-white municipality borders and preserves selected outlines', async ({ page }) => {
  await ready(page);
  const city = page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true });
  await expect(city).toHaveAttribute('stroke', '#4b5563');
  await page.locator('#btn-dark-toggle').click();
  await expect(city).toHaveAttribute('stroke', '#fafaf9');
  await city.focus();
  await city.press('Enter');
  await expect(city).toHaveAttribute('stroke', '#34d399');
  await page.evaluate(async () => (await import('./assets/js/core.js')).State.set('selectedCity', null));
  await expect(city).toHaveAttribute('stroke', '#fafaf9');
  await page.locator('#filter-search').fill('Anápolis');
  await expect(page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true, includeHidden: true })).toHaveAttribute('stroke', '#fafaf9');
  await page.locator('#btn-reset-filters').click();
  await page.locator('#btn-dark-toggle').click();
  await expect(city).toHaveAttribute('stroke', '#4b5563');
});

test('criticity help supports keyboard and contextual explanations in both panels', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#center-city-status')).toBeHidden();
  const help = page.locator('#filter-risk-help');
  const tooltip = page.locator('#criticity-tooltip');
  await help.scrollIntoViewIfNeeded();
  await help.focus();
  await expect(tooltip).toBeVisible();
  await expect(help).toHaveAttribute('aria-describedby', 'criticity-tooltip');
  await expect(tooltip).toContainText('Maior proporção');
  await expect(tooltip).toContainText('percentil 95');
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(help).toBeFocused();
  await help.hover();
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await help.click();
  await expect(tooltip).toBeVisible();
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  await page.locator('[data-pbf-ano="diff"]').click();
  await help.click();
  await expect(tooltip).toContainText('status usa o indicador de 2026, não a diferença');
  await page.locator('#tab-prog').click();
  await help.click();
  await expect(tooltip).toContainText('Menor proporção');
  await expect(tooltip).toContainText('mesmo no modo absoluto');
  const city = page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true });
  await city.focus();
  await city.press('Enter');
  const status = page.locator('#center-city-status');
  expect(await status.evaluate(element => getComputedStyle(element, '::after').content)).toBe('none');
  await status.focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Goiânia:');
  await expect(tooltip).toContainText(`Goiânia: ${await status.textContent()}`);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
});

test.describe('mobile criticity help', () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 800 } });

  test('tooltip fits the viewport and opens with touch in fullscreen', async ({ page }) => {
    await ready(page);
    await page.locator('#filter-risk-help').tap();
    const tooltip = page.locator('#criticity-tooltip');
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    await page.locator('#sidebar-top h1').tap();
    await expect(tooltip).toBeHidden();
    await page.locator('#btn-kiosk').tap();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.body)).toBe(true);
    await page.locator('#btn-collapse-sidebar').tap();
    await page.locator('#filter-risk-help').tap();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Criticidade do indicador');
  });
});

test('fullscreen keeps panels visible and collapses them for a selected municipality', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#side-panel')).toBeVisible();
  await expect(page.locator('#side-panel')).not.toHaveClass(/is-collapsed/);
  const city = page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true });
  await city.focus();
  await city.press('Enter');
  await page.locator('#btn-kiosk').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.body)).toBe(true);
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#sidebar')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('#side-panel')).toBeVisible();
  await expect(page.locator('#side-panel')).toHaveClass(/is-collapsed/);
  await page.evaluate(async () => (await import('./assets/js/core.js')).State.set('selectedCity', null));
  await expect(page.locator('#side-panel')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('#btn-close-panel')).toBeVisible();
  await page.locator('#btn-kiosk').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('#side-panel')).not.toHaveClass(/is-collapsed/);
});

test('fullscreen control is disabled when the browser has no support', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }); });
  await ready(page);
  await expect(page.locator('#btn-kiosk')).toBeDisabled();
});
