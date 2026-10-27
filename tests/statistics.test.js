import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildStatisticsRows, summarizeStatistics, pearsonCorrelation, getCorrelationFrame, rankStatistics, buildWaterfall } from '../assets/js/statistics-data.js';

const feature = (id, population2019, population2026, pbf2019, pbf2026) => ({ properties: {
  id, name: id, mesorregiao: 'Centro Goiano', população_2019: population2019, população: population2026, PBF_2019: pbf2019, pob_p1_p2: pbf2026
} });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('statistics separate population, PBF counts, relative variation and percentage points', () => {
  const [row] = buildStatisticsRows([feature('A', 100, 200, 50, 60)]);
  assert.equal(row.mesoregion, 'Centro Goiano');
  assert.equal(row.populationDelta, 100);
  assert.equal(row.populationChange, 100);
  assert.equal(row.pbfDelta, 10);
  close(row.pbfChange, 20);
  assert.equal(row.rate2019, 50);
  assert.equal(row.rate2026, 30);
  assert.equal(row.rateDelta, -20);
});

test('statistics preserve missing values and valid zeros; zero baseline does not imply 0% growth', () => {
  const rows = buildStatisticsRows([feature('A', 100, 100, 0, 10), feature('B', 100, 100, null, 0), feature('C', 100, 100, 0, 0)]);
  assert.equal(rows[0].pbfChange, null);
  assert.equal(rows[0].rateDelta, 10);
  assert.equal(rows[1].pbfDelta, null);
  assert.equal(rows[1].rateDelta, null);
  assert.equal(rows[1].rate2026, 0);
  assert.equal(rows[2].pbfDelta, 0);
  assert.equal(rows[2].pbfChange, null);
  const invalid = buildStatisticsRows([feature('D', 0, Infinity, -1, NaN)])[0];
  for (const key of ['population2019', 'population2026', 'populationChange', 'pbf2019', 'pbf2026', 'rateDelta']) assert.equal(invalid[key], null);
});

test('statistics aggregate on a paired sample using weighted rates instead of municipal averages', () => {
  const rows = buildStatisticsRows([feature('A', 100, 200, 50, 60), feature('B', 900, 1800, 90, 360), feature('C', 1000, 1000, null, 500)]);
  const summary = summarizeStatistics(rows);
  assert.equal(summary.count, 2);
  assert.equal(summary.population2019, 1000);
  assert.equal(summary.population2026, 2000);
  close(summary.rate2019, 14);
  close(summary.rate2026, 21);
  close(summary.rateDelta, 7);
  assert.equal(summary.pbfDelta, 280);
  assert.equal(summarizeStatistics([]).rateDelta, null);
});

test('rankings use magnitude, exclude wrong directions and never change the source order', () => {
  const rows = [{ name: 'A', rateDelta: -9 }, { name: 'B', rateDelta: 3 }, { name: 'C', rateDelta: null }, { name: 'D', rateDelta: 0 }];
  assert.deepEqual(rankStatistics(rows, 'rateDelta').map(row => row.name), ['A', 'B', 'D']);
  assert.deepEqual(rankStatistics(rows, 'rateDelta', 'increase').map(row => row.name), ['B']);
  assert.deepEqual(rankStatistics(rows, 'rateDelta', 'decrease').map(row => row.name), ['A']);
  assert.deepEqual(rows.map(row => row.name), ['A', 'B', 'C', 'D']);
});

test('waterfall includes all municipalities once and reconciles to the net count difference', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ name: String(index), pbfDelta: index % 2 ? index * 7 : -index * 3 }));
  rows.push({ name: 'Missing', pbfDelta: null });
  const steps = buildWaterfall(rows);
  const sum = rows.reduce((total, row) => total + (row.pbfDelta ?? 0), 0);
  assert.equal(steps.length, 8);
  assert.equal(steps.at(-2).label, 'Demais (14)');
  assert.equal(steps.at(-1).end, sum);
  assert.equal(steps.slice(0, -1).reduce((total, step) => total + step.delta, 0), sum);
  for (let index = 1; index < steps.length - 1; index++) assert.equal(steps[index].start, steps[index - 1].end);
});

test('Pearson requires at least three complete pairs and variance on both axes', () => {
  close(pearsonCorrelation([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]), 1);
  close(pearsonCorrelation([{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: -1 }, { x: null, y: 2 }]), -1);
  assert.equal(pearsonCorrelation([{ x: 1, y: 1 }, { x: 2, y: 2 }]), null);
  assert.equal(pearsonCorrelation([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]), null);
});

test('central 95% framing uses interpolated per-axis quantiles and never mutates the sample', () => {
  const points = Array.from({ length: 101 }, (_, index) => ({ x: index, y: -index }));
  const original = structuredClone(points);
  const frame = getCorrelationFrame(points, .95);
  close(frame.x[0], 2.5);
  close(frame.x[1], 97.5);
  close(frame.y[0], -97.5);
  close(frame.y[1], -2.5);
  assert.equal(frame.visible.length, 95);
  assert.equal(frame.outsideCount, 6);
  assert.equal(getCorrelationFrame(points).visible.length, 101);
  close(pearsonCorrelation(points), -1);
  assert.deepEqual(points, original);
});

test('framing handles empty, invalid, small and constant samples without collapsing the axes', () => {
  assert.equal(getCorrelationFrame([]), null);
  assert.equal(getCorrelationFrame([{ x: null, y: 3 }]), null);
  const small = getCorrelationFrame([{ x: -10, y: -5 }, { x: 10, y: 5 }], .95);
  assert.equal(small.coverage, 1);
  assert.equal(small.visible.length, 2);
  for (const coverage of [1, .95]) {
    const constant = getCorrelationFrame([{ x: 0, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 10 }], coverage);
    assert.ok(constant.x[1] > constant.x[0]);
    assert.ok(constant.y[1] > constant.y[0]);
    assert.equal(constant.visible.length, 3);
  }
});

test('actual 2019 and current sources reconcile to municipality and statewide statistics', async () => {
  const current = JSON.parse(await readFile(new URL('../output/info_tabcad.json', import.meta.url)));
  const old = JSON.parse(await readFile(new URL('../output/info_2019.json', import.meta.url)));
  const rows = buildStatisticsRows(Object.entries(current).map(([id, p]) => feature(id, old[id].populacao_estimada_2019, p.populacao_estimada, old[id].pob_pbf_2019, p.pob_pbf)));
  assert.equal(rows.length, 246);
  const abadia = rows.find(row => row.id === '5200050');
  assert.equal(abadia.pbfDelta, 2429);
  close(abadia.rateDelta, 7270 / 22918 * 100 - 4841 / 8773 * 100);
  const summary = summarizeStatistics(rows);
  assert.equal(summary.count, 246);
  assert.equal(buildWaterfall(rows).at(-1).end, summary.pbfDelta);
  assert.ok(Number.isFinite(pearsonCorrelation(rows.map(row => ({ x: row.populationChange, y: row.rateDelta })))));
});
