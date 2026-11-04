import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('index.html');
  await expect(page.locator('#map .leaflet-overlay-pane path')).toHaveCount(246);
  await expect(page.locator('#map-loading-overlay')).toBeHidden();
}

async function metricNodes(page) {
  return page.evaluate(async () => {
    const { geojsonData } = await import('./assets/js/data.js');
    const { MetricSelectors, State } = await import('./assets/js/core.js');
    const state = State.getState(), metric = MetricSelectors.get(state);
    return Array.from(document.querySelectorAll('#map path[role="button"][aria-hidden="false"]'), path => {
      const name = path.getAttribute('aria-label').replace('Selecionar município ', '');
      const feature = geojsonData.features.find(feature => feature.properties.name === name);
      const box = path.getBBox();
      return { name, x: box.x + box.width / 2, y: box.y + box.height / 2, radius: (box.width + box.height) / 4, value: Math.abs(metric.rawValue(feature.properties) ?? 0) };
    });
  });
}

function proportionalError(nodes) {
  const largest = nodes.reduce((a, b) => a.value > b.value ? a : b);
  const scale = largest.value ? largest.radius / Math.sqrt(largest.value) : 0;
  return Math.max(...nodes.map(node => Math.abs(node.radius - Math.sqrt(node.value) * scale)));
}

async function pathShape(locator) {
  return locator.evaluate(path => {
    const coordinates = path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
    return coordinates.map((coordinate, i) => coordinate - coordinates[i % 2]);
  });
}

test('indicator cartogram is reversible and keeps filters, colors and keyboard selection', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const toggle = page.locator('#btn-cartogram');
  expect(await toggle.evaluate(element => element.previousElementSibling.id)).toBe('btn-reset-view');
  const polygon = page.getByRole('button', { name: 'Selecionar município Abadia de Goiás', exact: true });
  const original = await polygon.getAttribute('d');
  const originalShape = await pathShape(polygon);
  const color = await polygon.getAttribute('fill');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(polygon).not.toHaveAttribute('d', original);
  await expect(polygon).toHaveAttribute('fill', color);
  await expect(page.locator('#cartogram-description')).toContainText('Extrema Pobreza');
  await polygon.focus();
  await page.keyboard.press('Enter');
  await expect(polygon).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#filter-search').fill('Abadia');
  await expect(page.locator('#map path[aria-hidden="false"]')).toHaveCount(3);
  await toggle.click();
  await page.locator('#btn-reset-view').click();
  await expect.poll(() => pathShape(polygon)).toEqual(originalShape);
  await expect(polygon).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('animation handles rapid reversal and changes indicator and reference year', async ({ page }) => {
  await ready(page);
  const toggle = page.locator('#btn-cartogram');
  await toggle.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.click();
  await page.locator('#sel-pob-ind').selectOption('norm_pob_p1_p2');
  const polygon = page.getByRole('button', { name: 'Selecionar município Abadia de Goiás', exact: true });
  await expect(page.locator('#cartogram-description')).toContainText('(2026)');
  await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
  const currentShape = await polygon.getAttribute('d');
  await page.locator('[data-pbf-ano="2019"]').click();
  await expect(page.locator('#cartogram-description')).toContainText('(2019)');
  await expect(polygon).not.toHaveAttribute('d', currentShape);
  await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
  await page.locator('[data-pbf-ano="diff"]').click();
  await expect(page.locator('#cartogram-description')).toContainText('valor bruto de 2026');
  await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
});

test('completed animation produces indicator-proportional circles without overlaps', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate(() => {
    window.cartogramPhases = [];
    new MutationObserver(records => {
      records.forEach(record => {
        if (record.attributeName === 'data-cartogram-phase') window.cartogramPhases.push(record.oldValue);
      });
    }).observe(document.getElementById('map'), { attributes: true, attributeOldValue: true, attributeFilter: ['data-cartogram-phase'] });
  });
  await page.locator('#btn-cartogram').click();
  await expect(page.locator('#map')).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => window.cartogramPhases)).toEqual(expect.arrayContaining(['morph', 'settling']));
  await expect(page.locator('#map')).toHaveAttribute('data-cartogram-phase', 'circles');
  await expect(page.locator('#cartogram-phase')).toHaveText('Círculos geográficos proporcionais ao indicador');
  await expect.poll(async () => page.locator('#map path[role="button"]').evaluateAll(paths => paths.every(path => {
    const box = path.getBBox();
    return Math.abs(box.width - box.height) <= 2;
  }))).toBe(true);
  const nodes = await metricNodes(page);
  expect(proportionalError(nodes)).toBeLessThan(1.5);
  let maximumOverlap = 0;
  nodes.forEach((node, i) => {
    nodes.slice(i + 1).forEach(other => {
      maximumOverlap = Math.max(maximumOverlap, node.radius + other.radius - Math.hypot(node.x - other.x, node.y - other.y));
    });
  });
  expect(maximumOverlap).toBeLessThanOrEqual(2);
  await expect(page.locator('.cartogram-group-label')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('cartogram.png') });
});

test('filtered cartogram excludes hidden territories from collisions and handles an empty cut', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('#btn-cartogram').click();
  await page.locator('#filter-search').fill('Abadia');
  await expect(page.locator('#map path[aria-hidden="false"]')).toHaveCount(3);
  await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
  await expect(page.locator('#map path[aria-hidden="true"]').first()).toHaveAttribute('fill-opacity', '0');
  await page.locator('#filter-search').fill('municipio-inexistente');
  await expect(page.locator('#map path[aria-hidden="false"]')).toHaveCount(0);
  await expect(page.locator('.cartogram-group-label')).toHaveCount(0);
  await page.locator('#btn-reset-view').click();
  await page.locator('#btn-cartogram').click();
  await expect(page.locator('#map')).toHaveAttribute('data-cartogram-phase', 'territories');
});

test('Anapolis circle area represents 2091 extreme-poverty records, not its population percentage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('#btn-cartogram').click();
  await expect(page.locator('#cartogram-description')).toContainText('Extrema Pobreza (valor bruto)');
  const nodes = await metricNodes(page);
  expect(nodes.find(node => node.name === 'Anápolis').value).toBe(2091);
  expect(proportionalError(nodes)).toBeLessThan(1.5);
});

test('the largest indicator stays at its geographic centroid, without grid or group markers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const name = await page.evaluate(async () => {
    const { geojsonData } = await import('./assets/js/data.js');
    const { MetricSelectors, State } = await import('./assets/js/core.js');
    const metric = MetricSelectors.get(State.getState());
    // Freeze the camera so the geographic centroid can be compared in SVG pixels.
    L.Map.prototype.fitBounds = function() { return this; };
    return geojsonData.features.reduce((a, b) => metric.rawValue(a.properties) > metric.rawValue(b.properties) ? a : b).properties.name;
  });
  const polygon = page.getByRole('button', { name: `Selecionar município ${name}`, exact: true });
  const centroid = await polygon.evaluate(path => {
    let area = 0, x = 0, y = 0;
    for (const ring of path.getAttribute('d').match(/M[^z]+z/g)) {
      const points = ring.match(/-?\d+(?:\.\d+)?/g).map(Number);
      for (let i = 0; i < points.length; i += 2) {
        const next = (i + 2) % points.length;
        const cross = points[i] * points[next + 1] - points[next] * points[i + 1];
        area += cross;
        x += (points[i] + points[next]) * cross;
        y += (points[i + 1] + points[next + 1]) * cross;
      }
    }
    return { x: x / (3 * area), y: y / (3 * area) };
  });
  await page.locator('#btn-cartogram').click();
  const center = await polygon.evaluate(path => {
    const box = path.getBBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  expect(Math.hypot(center.x - centroid.x, center.y - centroid.y)).toBeLessThan(2);
  await expect(page.locator('#map .leaflet-marker-icon')).toHaveCount(0);
});

test('social program circle areas use raw values regardless of #/% color mode', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('#tab-prog').click();
  await page.locator('#btn-cartogram').click();
  const polygon = page.getByRole('button', { name: 'Selecionar município Abadia de Goiás', exact: true });
  for (const program of ['TODS', 'MAES', 'PLES']) {
    await page.locator('#sel-prog-programa').selectOption(program);
    for (const mode of ['absoluto', 'percentual']) {
      await page.locator(`[data-metric-mode="${mode}"]`).click();
      await expect(page.locator('#cartogram-description')).toContainText(mode === 'absoluto' ? 'modo #' : 'modo %');
      await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
    }
  }
  await page.locator('#sel-prog-programa').selectOption('TODS');
  await page.locator('[data-metric-mode="absoluto"]').click();
  await expect(page.locator('#cartogram-description')).toContainText('modo #');
  await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
  const shape = await polygon.getAttribute('d');
  await page.locator('[data-metric-mode="percentual"]').click();
  await expect(page.locator('#cartogram-description')).toContainText('modo %');
  await expect(polygon).toHaveAttribute('d', shape);
  await page.locator('#sel-prog-metrica').selectOption('Pessoas');
  await expect(page.locator('#cartogram-description')).toContainText('Pessoas');
  await expect.poll(async () => proportionalError(await metricNodes(page))).toBeLessThan(1.5);
});

for (const width of [390, 768]) {
  test(`cartogram control fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    await page.locator('#btn-cartogram').click();
    const bounds = await page.locator('#btn-cartogram').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  });
}
