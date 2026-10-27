// Keep calculations independent of the DOM and avoid intermediate rounding.
const validCount = value => Number.isFinite(value) && value >= 0;
const difference = (current, previous) => validCount(current) && validCount(previous) ? current - previous : null;
const rate = (count, population) => validCount(count) && Number.isFinite(population) && population > 0 ? count / population * 100 : null;
const change = (current, previous) => validCount(current) && Number.isFinite(previous) && previous > 0 ? (current / previous - 1) * 100 : null;

export function buildStatisticsRows(features) {
  return features.map(({ properties: p }) => {
    const population2019 = Number.isFinite(p.população_2019) && p.população_2019 > 0 ? p.população_2019 : null;
    const population2026 = Number.isFinite(p.população) && p.população > 0 ? p.população : null;
    const pbf2019 = validCount(p.PBF_2019) ? p.PBF_2019 : null;
    const pbf2026 = validCount(p.pob_p1_p2) ? p.pob_p1_p2 : null;
    const rate2019 = rate(pbf2019, population2019);
    const rate2026 = rate(pbf2026, population2026);
    return {
      id: p.id, name: p.name, mesoregion: p.mesorregiao || 'Não informada',
      population2019, population2026,
      populationDelta: difference(population2026, population2019),
      populationChange: change(population2026, population2019),
      pbf2019, pbf2026, pbfDelta: difference(pbf2026, pbf2019), pbfChange: change(pbf2026, pbf2019),
      rate2019, rate2026, rateDelta: rate2019 !== null && rate2026 !== null ? rate2026 - rate2019 : null
    };
  });
}

export function pearsonCorrelation(points) {
  const valid = points.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 3) return null;
  const meanX = valid.reduce((sum, p) => sum + p.x, 0) / valid.length;
  const meanY = valid.reduce((sum, p) => sum + p.y, 0) / valid.length;
  let covariance = 0, varianceX = 0, varianceY = 0;
  for (const { x, y } of valid) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (!varianceX || !varianceY) return null;
  return Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
}

export function getCorrelationFrame(points, coverage = 1) {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!valid.length) return null;
  const fraction = valid.length >= 3 && Number.isFinite(coverage) && coverage > 0 && coverage < 1 ? coverage : 1;
  function bounds(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const quantile = fraction => {
      const index = (sorted.length - 1) * fraction;
      const lower = Math.floor(index), upper = Math.ceil(index);
      return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    };
    let minimum = fraction === 1 ? Math.min(0, sorted[0]) : quantile((1 - fraction) / 2);
    let maximum = fraction === 1 ? Math.max(0, sorted.at(-1)) : quantile(1 - (1 - fraction) / 2);
    if (minimum === maximum) {
      const padding = Math.max(1, Math.abs(minimum) * .05);
      minimum -= padding;
      maximum += padding;
    } else if (fraction === 1) {
      const padding = (maximum - minimum) * .08;
      if (minimum < 0) minimum -= padding;
      maximum += padding;
    }
    return [minimum, maximum];
  }
  const x = bounds(valid.map(point => point.x)), y = bounds(valid.map(point => point.y));
  const visible = valid.filter(point => point.x >= x[0] && point.x <= x[1] && point.y >= y[0] && point.y <= y[1]);
  return { x, y, coverage: fraction, visible, outsideCount: valid.length - visible.length };
}

export function summarizeStatistics(rows) {
  const paired = rows.filter(row => [row.population2019, row.population2026, row.pbf2019, row.pbf2026].every(Number.isFinite));
  if (!paired.length) return { count: 0, populationChange: null, populationDelta: null, pbfDelta: null, pbfChange: null, rate2019: null, rate2026: null, rateDelta: null };
  const totals = paired.reduce((sum, row) => {
    for (const key of ['population2019', 'population2026', 'pbf2019', 'pbf2026']) sum[key] += row[key];
    return sum;
  }, { population2019: 0, population2026: 0, pbf2019: 0, pbf2026: 0 });
  const rate2019 = rate(totals.pbf2019, totals.population2019);
  const rate2026 = rate(totals.pbf2026, totals.population2026);
  return { ...totals, count: paired.length, populationDelta: totals.population2026 - totals.population2019,
    populationChange: change(totals.population2026, totals.population2019),
    pbfDelta: totals.pbf2026 - totals.pbf2019, pbfChange: change(totals.pbf2026, totals.pbf2019),
    rate2019, rate2026, rateDelta: rate2026 - rate2019 };
}

export function rankStatistics(rows, key, order = 'absolute', limit = 15) {
  return rows.filter(row => Number.isFinite(row[key]) && (order === 'increase' ? row[key] > 0 : order === 'decrease' ? row[key] < 0 : true))
    .sort((a, b) => (order === 'absolute' ? Math.abs(b[key]) - Math.abs(a[key]) : order === 'decrease' ? a[key] - b[key] : b[key] - a[key])
      || a.name.localeCompare(b.name, 'pt-BR')).slice(0, limit);
}

export function buildWaterfall(rows, limit = 6) {
  const valid = rows.filter(row => Number.isFinite(row.pbfDelta));
  const largest = rankStatistics(valid, 'pbfDelta', 'absolute', limit);
  const included = new Set(largest);
  const rest = valid.filter(row => !included.has(row));
  const contributions = largest.map(row => ({ label: row.name, id: row.id, count: 1, delta: row.pbfDelta }));
  if (rest.length) contributions.push({ label: `Demais (${rest.length})`, count: rest.length, delta: rest.reduce((sum, row) => sum + row.pbfDelta, 0) });
  let running = 0;
  const steps = contributions.map(item => {
    const start = running;
    running += item.delta;
    return { ...item, start, end: running };
  });
  return [...steps, { label: 'Saldo total', count: valid.length, delta: running, start: 0, end: running, total: true }];
}
