import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as topojson from 'topojson-client';
import { buildGeoData, safeRatio, loadData } from '../assets/js/data.js';

const names = ['municipios_GO.topojson', 'info_tabcad.json', 'info_2019.json', 'info_Programas_Sociais.json'];
const datasets = await Promise.all(names.map(async name => JSON.parse(await readFile(new URL(`../output/${name}`, import.meta.url), 'utf8'))));
globalThis.topojson = topojson;
globalThis.window = {};
globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) });
await loadData();
const { State, Utils, DataSelectors, MetricSelectors, ColumnSelectors } = await import('../assets/js/core.js');
const collection = buildGeoData(...datasets, topojson);

test('joins all 246 municipalities by IBGE code and derives ratios from JSON', () => {
  assert.equal(collection.features.length, 246);
  assert.equal(new Set(collection.features.map(feature => feature.id)).size, 246);
  for (const feature of collection.features) {
    const p = feature.properties;
    const current = datasets[1][feature.id];
    const old = datasets[2][feature.id];
    assert.equal(p.norm_ext, current.ext_pob / current.populacao_estimada);
    assert.equal(p.norm_pob_p1_p2, current.pob_pbf / current.populacao_estimada);
    assert.equal(p.norm_PBF_2019, old.pob_pbf_2019 / old.populacao_estimada_2019);
    assert.equal(p.TODS_Ativo_Pessoas, datasets[3][feature.id].TODS_Ativo_Pessoas);
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
  }
});

test('missing, malformed and duplicate data fail before rendering', () => {
  const bad = structuredClone(datasets);
  delete bad[3]['5200050'].MAES_Ativo_Beneficios;
  assert.throws(() => buildGeoData(...bad, topojson), /MAES_Ativo_Beneficios/);
  const badPopulation = structuredClone(datasets);
  badPopulation[1]['5200050'].populacao_estimada = 0;
  assert.throws(() => buildGeoData(...badPopulation, topojson), /populacao/);
  const badGeometry = structuredClone(datasets);
  badGeometry[0].objects.municipios.geometries.push(badGeometry[0].objects.municipios.geometries[0]);
  assert.throws(() => buildGeoData(...badGeometry, topojson), /duplicado/);
});

test('zero is not unknown and percentages keep full calculation precision', () => {
  assert.equal(safeRatio(0, 100), 0);
  assert.equal(safeRatio(null, 100), null);
  assert.equal(Utils.getPlesColumnValue({ PLES_Ativo_Beneficios: 0 }, 'PLES_Ativo_Beneficios'), 0);
  const variation = Utils.getPbfVariacao2026x2019({ PBF_2019: 1, população_2019: 6, pob_p1_p2: 1, população: 3 });
  assert.equal(Utils.fmtPtbrPct(variation), '16,67%');
});

test('poverty map scale follows the selected indicator distribution', () => {
  const extState = { activeTab: 'pob', pobIndicator: 'norm_ext', pobPbfAno: '2026' };
  const povertyState = { activeTab: 'pob', pobIndicator: 'norm_pob', pobPbfAno: '2026' };
  const extMax = Utils.getDynamicMax(extState);
  const povertyMax = Utils.getDynamicMax(povertyState);

  assert.notEqual(extMax, povertyMax);
  for (const [state, max] of [[extState, extMax], [povertyState, povertyMax]]) {
    const metric = MetricSelectors.get(state);
    const values = collection.features.map(feature => metric.value(feature.properties));
    assert.equal(max, Utils.getPercentileMax(values, 0.6));
  }
});

test('aggregates use only compatible known populations and a paired historical sample', () => {
  const metric = MetricSelectors.get({ activeTab: 'pob', pobIndicator: 'norm_ext' });
  const features = [{ properties: { população: 100, ext_pob: 10 } }, { properties: { população: 900, ext_pob: null } }];
  const totals = DataSelectors.getTotals(features, metric);
  assert.equal(totals.totalMetric / totals.totalPopulacao, 0.1);
  assert.equal(totals.scopePopulation, 1000);
  assert.equal(totals.metricCount, 1);
  assert.equal(DataSelectors.getPbfVariation(features), null);
});

test('indicator columns change consistently and unsafe numeric input is rejected', () => {
  const oldColumns = ColumnSelectors.get({ activeTab: 'pob', pobIndicator: 'norm_pob_p1_p2', pobPbfAno: '2019' });
  assert.ok(oldColumns.some(column => column.key === 'population2019'));
  for (const text of ['50000abc', '50.000abc', '1.5', 'Infinity', '1e5']) assert.equal(Utils.parseNum(text), null);
  assert.equal(Utils.parseNum('50.000'), 50000);
});

test('criticity help describes the same reference, direction and status used by filters', () => {
  const poverty = { activeTab: 'pob', pobIndicator: 'norm_pob_p1_p2', pobPbfAno: 'diff', searchTerm: '', riskFilter: 'all', populationBand: 'all' };
  const program = { activeTab: 'prog', progPrograma: 'MAES', progStatus: 'Ativo', progMetrica: 'Beneficios', progMetricaModo: 'absoluto' };
  for (const state of [poverty, program, { ...program, progMetricaModo: 'percentual' }, { ...program, progPrograma: 'PLES', progPlesMetrica: 'PLES_Ativo_Beneficios' }]) {
    const city = collection.features[0].properties;
    const metric = MetricSelectors.get(state);
    const reference = Utils.getCriticityMax(state);
    const help = Utils.getCriticityDescription(state, city);
    assert.ok(help.includes(metric.getStatus(city, reference).label));
    assert.ok(help.includes(Utils.fmtPtbrPct(metric.statusValue(city) * 100)));
    assert.ok(help.includes(Utils.fmtPtbrPct(reference * 100)));
    assert.ok(help.includes(state.activeTab === 'prog' ? 'Menor proporção' : 'Maior proporção'));
  }
  assert.match(Utils.getCriticityDescription(poverty), /status usa o indicador de 2026, não a diferença/);
  assert.equal(Utils.getCriticityDescription(program), Utils.getCriticityDescription({ ...program, searchTerm: 'Anápolis', populationBand: 'gt100k', riskFilter: 'critico' }));
  const zeroCity = { name: 'Zero', população: 100, norm_pob_p1_p2: 0, MAES_Ativo_Beneficios: 0 };
  assert.match(Utils.getCriticityDescription(poverty, zeroCity), /Zero: Estável/);
  assert.match(Utils.getCriticityDescription(program, zeroCity), /Zero: Crítico/);
  assert.match(Utils.getCriticityDescription(program, { ...zeroCity, MAES_Ativo_Beneficios: null }), /Proporção usada: sem dados/);
});

test('population variation warning includes above-average growth and decline', () => {
  const meanVariation = Utils.getAverageAbsolutePopulationVariationPct();
  assert.ok(meanVariation > 0);
  assert.equal(Utils.getPopulationVariationPct({ população_2019: 100, população: 125 }), 25);
  assert.equal(Utils.isPopulationVariationAboveAverage({ população_2019: 100, população: 0 }), true);
  assert.equal(Utils.isPopulationVariationAboveAverage({ população_2019: 100, população: 1000 }), true);
  assert.equal(Utils.isPopulationVariationAboveAverage({ população_2019: 100, população: 100 + meanVariation / 2 }), false);
  assert.equal(Utils.isPopulationVariationAboveAverage({ população_2019: 100, população: null }), false);
});

test('state batches expose a final snapshot and call shared renders once', async () => {
  let count = 0;
  const render = () => { count++; assert.equal(State.get('populationMin'), 10); assert.equal(State.get('populationMax'), 20); };
  const cancelMin = State.subscribe('populationMin', render);
  const cancelMax = State.subscribe('populationMax', render);
  State.batch({ populationMin: 10, populationMax: 20 });
  await Promise.resolve();
  assert.equal(count, 1);
  cancelMin(); cancelMax();
});

test('cancelled debounce cannot reapply stale input after reset', async () => {
  let value = '';
  const update = Utils.debounce(text => { value = text; }, 10);
  update('stale');
  Utils.cancelPendingInputs();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(value, '');
});
