import { test, expect } from '@playwright/test';

test.use({ screenshot: 'only-on-failure' });

async function expectPaintAndHover(page, id, name) {
  const canvas = page.locator(`#${id}`);
  await expect(canvas).toHaveAttribute('aria-label', new RegExp(name));
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(() => canvas.evaluate(element => {
    const chart = window.Chart.getChart(element);
    if (!chart || chart.chartArea?.width <= 0 || chart.chartArea?.height <= 0) return 0;
    const pixels = chart.ctx.getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) painted++;
    return painted;
  })).toBeGreaterThan(500);
  const point = await canvas.evaluate(element => window.Chart.getChart(element).getDatasetMeta(0).data[0].getCenterPoint());
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await expect.poll(() => canvas.evaluate(element => window.Chart.getChart(element).tooltip.opacity)).toBeGreaterThan(0);
  const tooltip = await canvas.evaluate(element => {
    const chart = window.Chart.getChart(element);
    return { value: chart.tooltip.dataPoints[0].raw, expected: chart.data.datasets[0].data[0], lines: chart.tooltip.body.flatMap(body => body.lines) };
  });
  expect(tooltip.value).toBe(tooltip.expected);
  expect(tooltip.lines.length).toBeGreaterThan(0);
}

test('municipal canvases paint and respond to hover across map selections', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack));
  await page.goto('index.html');
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await page.locator('#tab-prog').click();
  let instances;

  for (const name of ['Abadiânia', 'Goiânia', 'Anápolis']) {
    const municipality = page.getByRole('button', { name: `Selecionar município ${name}`, exact: true });
    await municipality.focus();
    await municipality.press('Enter');
    await expect(page.locator('#panel-city-name')).toHaveText(name);

    for (const id of ['comparison-chart', 'program-comparison-chart']) await expectPaintAndHover(page, id, name);
    const expected = await page.evaluate(async cityName => {
      const { geojsonData } = await import('./assets/js/data.js');
      const { PROGRAMAS } = await import('./assets/js/core.js');
      const city = geojsonData.features.find(feature => feature.properties.name === cityName).properties;
      return { comparison: city.TODS_Ativo_Beneficios, radar: Object.keys(PROGRAMAS).filter(key => key !== 'TODS').map(key => city[`${key}_Ativo_Beneficios`]) };
    }, name);
    const actual = await page.evaluate(() => ({
      comparison: window.Chart.getChart('comparison-chart').data.datasets[0].data[0],
      radar: window.Chart.getChart('program-comparison-chart').data.datasets[0].data
    }));
    expect(actual).toEqual(expected);
    const ids = await page.evaluate(() => [window.Chart.getChart('comparison-chart').id, window.Chart.getChart('program-comparison-chart').id]);
    if (instances) expect(ids).toEqual(instances);
    instances = ids;
  }
  await page.screenshot({ path: testInfo.outputPath('municipal-charts.png') });
  await page.locator('#tab-pob').click();
  const povertyCity = page.getByRole('button', { name: 'Selecionar município Anápolis', exact: true });
  await povertyCity.focus();
  await povertyCity.press('Enter');
  await expect(page.locator('#panel-city-name')).toHaveText('Anápolis');
  for (const id of ['comparison-chart', 'poverty-pie-chart']) await expectPaintAndHover(page, id, 'Anápolis');
  expect(errors).toEqual([]);
});

test('municipal charts recover after selection while the panel is collapsed', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('index.html');
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await page.locator('#tab-prog').click();
  await page.locator('#btn-close-panel').click();
  for (const name of ['Abadiânia', 'Goiânia']) {
    const municipality = page.getByRole('button', { name: `Selecionar município ${name}`, exact: true });
    await municipality.focus();
    await municipality.press('Enter');
    await expect(page.locator('#collapsed-panel-label')).toHaveText(name);
  }
  expect(await page.evaluate(() => Boolean(window.Chart.getChart('comparison-chart')))).toBe(false);
  await page.locator('#btn-open-panel').click();
  for (const id of ['comparison-chart', 'program-comparison-chart']) await expectPaintAndHover(page, id, 'Goiânia');
  await page.locator('#btn-close-panel').click();
  await page.locator('#btn-open-panel').click();
  for (const id of ['comparison-chart', 'program-comparison-chart']) await expectPaintAndHover(page, id, 'Goiânia');
  expect(errors).toEqual([]);
});

test('poverty charts preserve animation defaults and keep hover after motion changes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('index.html');
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  const municipality = page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true });
  await municipality.focus();
  await municipality.press('Enter');
  for (const motion of ['no-preference', 'reduce', 'no-preference']) {
    await page.emulateMedia({ reducedMotion: motion });
    for (const id of ['comparison-chart', 'poverty-pie-chart']) await expectPaintAndHover(page, id, 'Goiânia');
    const defaults = await page.evaluate(() => Object.keys(window.Chart.defaults.animation));
    expect(defaults).toEqual(expect.arrayContaining(['duration', 'easing', 'fn', 'type']));
  }
  expect(errors).toEqual([]);
});

test('municipal charts paint and update after opening the panel in fullscreen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('index.html');
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await page.locator('#btn-kiosk').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.body)).toBe(true);
  await page.locator('#btn-collapse-sidebar').click();
  await page.locator('#tab-prog').click();
  const firstCity = page.getByRole('button', { name: 'Selecionar município Goiânia', exact: true });
  await firstCity.focus();
  await firstCity.press('Enter');
  await page.locator('#btn-close-panel').click();
  await page.locator('#btn-open-panel').click();
  for (const id of ['comparison-chart', 'program-comparison-chart']) await expectPaintAndHover(page, id, 'Goiânia');
  const secondCity = page.getByRole('button', { name: 'Selecionar município Anápolis', exact: true });
  await secondCity.focus();
  await secondCity.press('Enter');
  for (const id of ['comparison-chart', 'program-comparison-chart']) await expectPaintAndHover(page, id, 'Anápolis');
  await page.locator('#tab-pob').click();
  await secondCity.focus();
  await secondCity.press('Enter');
  for (const id of ['comparison-chart', 'poverty-pie-chart']) await expectPaintAndHover(page, id, 'Anápolis');
  await page.locator('#btn-kiosk').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  for (const id of ['comparison-chart', 'poverty-pie-chart']) await expectPaintAndHover(page, id, 'Anápolis');
  expect(errors).toEqual([]);
});
