export let geojsonData;

export function safeRatio(count, population) {
  return Number.isFinite(count) && count >= 0 && Number.isFinite(population) && population > 0
    ? count / population : null;
}

function validateRecord(record, code, fields, source) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`${source}: municipio ${code} ausente.`);
  for (const field of fields) {
    const value = record[field];
    if (!(field in record) || (value !== null && (!Number.isSafeInteger(value) || value < 0))) {
      throw new Error(`${source}: campo ${field} invalido no municipio ${code}.`);
    }
    if (field.startsWith('populacao_') && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`${source}: populacao invalida no municipio ${code}.`);
    }
  }
}

function validPolygon(polygon) {
  return Array.isArray(polygon) && polygon.length > 0 && polygon.every(ring =>
    Array.isArray(ring) && ring.length >= 4 && ring.every(point =>
      Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)
    && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]);
}

export function buildGeoData(topology, tabcad, historical, programs, converter = globalThis.topojson) {
  if (topology?.type !== 'Topology' || topology.objects?.municipios?.type !== 'GeometryCollection' || !Array.isArray(topology.arcs)) {
    throw new Error('municipios_GO.topojson: estrutura TopoJSON invalida.');
  }
  if (!converter?.feature) throw new Error('Conversor TopoJSON indisponivel.');
  for (const [name, data] of Object.entries({ tabcad, historical, programs })) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${name}: estrutura de registros invalida.`);
  }
  const collection = converter.feature(topology, topology.objects.municipios);
  if (!Array.isArray(collection.features) || !collection.features.length) throw new Error('Nao ha geometrias municipais.');
  const seen = new Set();
  const regularKeys = ['MAES', 'DIGN', 'GPEL', 'GINC', 'CAUT', 'PLPD', 'PPID', 'AFUT', 'TODS']
    .flatMap(program => ['Acumulado', 'Ativo', 'Descredenciado']
      .flatMap(status => ['Beneficios', 'Pessoas', 'Aptos'].map(metric => `${program}_${status}_${metric}`)));
  const plesKeys = ['PLES_Ativo_Beneficios', 'PLES_EDUCACAO INFANTIL', 'PLES_FUNDAMENTAL', 'PLES_MÉDIO', 'PLES_PÓS TÉCNICO', 'PLES_SUPERIOR - GRADUAÇÃO', 'PLES_SUPERIOR - PÓS-GRADUAÇÃO', 'PLES_SUPLETIVO - MÉDIO', 'PLES_TÉCNICO DE NÍVEL MÉDIO'];
  const features = collection.features.map(feature => {
    const original = feature.properties || {};
    const code = String(original.id ?? original.code_muni ?? feature.id ?? '');
    if (!/^52\d{5}$/.test(code) || seen.has(code)) throw new Error(`Codigo municipal invalido ou duplicado: ${code}.`);
    seen.add(code);
    const current = tabcad[code];
    const old = historical[code];
    const social = programs[code];
    validateRecord(current, code, ['populacao_estimada', 'ext_pob', 'pob', 'pob_pbf'], 'info_tabcad.json');
    validateRecord(old, code, ['populacao_estimada_2019', 'pob_pbf_2019'], 'info_2019.json');
    validateRecord(social, code, [...regularKeys, ...plesKeys], 'info_Programas_Sociais.json');
    const name = current['município'] ?? social.municipio ?? original.name_muni ?? original.name;
    if (typeof name !== 'string' || !name.trim()) throw new Error(`Nome municipal ausente: ${code}.`);
    if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error(`Geometria municipal invalida: ${code}.`);
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length || !polygons.every(validPolygon)) throw new Error(`Coordenadas municipais invalidas: ${code}.`);
    const properties = {
      ...original,
      ...Object.fromEntries([...regularKeys, ...plesKeys].map(key => [key, social[key]])),
      id: code, name, description: name,
      população: current.populacao_estimada,
      população_2019: old.populacao_estimada_2019,
      ext_pob: current.ext_pob, pob: current.pob, pob_p1_p2: current.pob_pbf,
      PBF_2019: old.pob_pbf_2019,
      // Internal norm_* fields are ratios (0..1), not min/max normalization.
      norm_ext: safeRatio(current.ext_pob, current.populacao_estimada),
      norm_pob: safeRatio(current.pob, current.populacao_estimada),
      norm_pob_p1_p2: safeRatio(current.pob_pbf, current.populacao_estimada),
      norm_PBF_2019: safeRatio(old.pob_pbf_2019, old.populacao_estimada_2019)
    };
    return { ...feature, id: code, properties };
  });
  for (const [name, data] of Object.entries({ tabcad, historical, programs })) {
    const unmatched = Object.keys(data).filter(code => !seen.has(code));
    if (unmatched.length) throw new Error(`${name}: codigos sem geometria: ${unmatched.join(', ')}.`);
  }
  return { type: 'FeatureCollection', features };
}

export async function loadData() {
  const filenames = ['municipios_GO.topojson', 'info_tabcad.json', 'info_2019.json', 'info_Programas_Sociais.json'];
  const datasets = await Promise.all(filenames.map(async filename => {
    const url = new URL(`../../output/${filename}`, import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}.`);
    try { return await response.json(); }
    catch { throw new Error(`${filename}: JSON invalido.`); }
  }));
  geojsonData = buildGeoData(...datasets);
  return geojsonData;
}
