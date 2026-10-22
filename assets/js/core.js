import { geojsonData } from './data.js';
  const numberFormatters = new Map();
  let averageAbsolutePopulationVariationPct = null;
function numberFormatter(decimals) {
  if (!numberFormatters.has(decimals)) numberFormatters.set(decimals, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  return numberFormatters.get(decimals);
}
    function fmtPtbrInt(valor) {
      if (valor === null || valor === undefined || (typeof valor === 'number' && isNaN(valor))) return '-';
      return numberFormatter(0).format(valor);
    }

    function fmtPtbrNum(valor, decimais) {
      if (decimais === undefined) decimais = 2;
      if (valor === null || valor === undefined || (typeof valor === 'number' && isNaN(valor))) return '-';
      return numberFormatter(decimais).format(valor);
    }

    function validateGeoData() {
      if (typeof geojsonData === 'undefined' || geojsonData === null) {
        return { valid: false, message: 'O arquivo de dados não foi localizado.' };
      }
      if (!Array.isArray(geojsonData.features) || geojsonData.features.length === 0) {
        return { valid: false, message: 'A base de dados não contém uma lista válida de municípios.' };
      }

      const invalidFeatureIndex = geojsonData.features.findIndex(feature => {
        const properties = feature && feature.properties;
        if (!properties || properties.name === null || properties.name === undefined || properties.name === '') return true;

        const hasPopulation = Number.isFinite(properties.população) && properties.população > 0;
        const population2019 = properties.população_2019;
        return !hasPopulation || !Number.isFinite(population2019) || population2019 <= 0 || !feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type);
      });

      if (invalidFeatureIndex !== -1) {
        return {
          valid: false,
          message: `A base de dados contém um município sem nome ou sem população válida para 2019 e 2026 (registro ${invalidFeatureIndex + 1}).`
        };
      }
      return { valid: true, message: '' };
    }

    const initialGeoDataValidation = validateGeoData();

    const goiasTotals = (function() {
      let totalPop = 0;
      if (typeof geojsonData !== 'undefined' && Array.isArray(geojsonData.features)) {
        geojsonData.features.forEach(f => {
          const p = f && f.properties;
          if (!p) return;
          totalPop += (typeof p.população === 'number' && !isNaN(p.população)) ? p.população : 0;
        });
      }
      return { totalPopulacao: totalPop };
    })();

    // ==================================================================
    // DICIONÁRIO DE PROGRAMAS E CONSTANTES 
    // ==================================================================
    const PROGRAMAS = {
      TODS: "Todos Programas",
      MAES: "Mães de Goiás",
      AFUT: "Aprendiz do Futuro",
      DIGN: "Dignidade",
      GPEL: "Goiás Por Elas",
      GINC: "Goiás + Inclusivo",
      PLES: "Passe Livre Estudantil",
      CAUT: "Carteira de Identificação do Autista",
      PLPD: "Passe Livre da Pessoa com Deficiência",
      PPID: "Passaporte da Pessoa Idosa"
    };

    const PROGRAM_STATUSES = ['Acumulado', 'Ativo', 'Descredenciado'];
    const PROGRAM_METRICS = ['Beneficios', 'Pessoas'];
    const PLES_COLUMN_KEYS = (function() {
      const keys = new Set();
      if (typeof geojsonData !== 'undefined' && Array.isArray(geojsonData.features)) {
        geojsonData.features.forEach(feature => {
          Object.keys((feature && feature.properties) || {})
            .filter(key => key.startsWith('PLES_'))
            .forEach(key => keys.add(key));
        });
      }
      return Array.from(keys).sort((a, b) => {
        if (a === 'PLES_Ativo_Beneficios') return -1;
        if (b === 'PLES_Ativo_Beneficios') return 1;
        return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
      });
    })();
    function formatPlesColumnLabel(columnKey) {
      const suffix = String(columnKey || '').replace(/^PLES_/, '').replace(/_/g, ' ').trim();
      if (!suffix) return 'Passe Livre Estudantil';
      const label = suffix.toLocaleLowerCase('pt-BR').replace(/(^|[\s-])([a-zà-ú])/g, (match, separator, letter) => `${separator}${letter.toLocaleUpperCase('pt-BR')}`);
      const formattedLabel = label.replace('Educacao', 'Educação').replace('Beneficios', 'Benefícios');
      return formattedLabel.replace(/\bDe\b/g, 'de').replace(/^Ativo Benefícios$/, 'Benefícios (Ativo)');
    }
    const PLES_COLUMN_LABELS = PLES_COLUMN_KEYS.reduce((labels, key) => {
      labels[key] = formatPlesColumnLabel(key);
      return labels;
    }, {});
    function validateProgramTotalsDryRun(data, expectedTotals) {
      const referenceTotals = expectedTotals || (data && (data.stateTotals || data.totals));
      const report = {
        validSchema: true,
        scope: 'todas as features municipais',
        featureCount: 0,
        detected: { programs: [], statuses: [], metrics: [] },
        derivedTotals: {},
        missingValues: [],
        invalidValues: [],
        divergences: [],
        diagnostics: [],
        comparisonStatus: referenceTotals ? 'compared' : 'unavailable'
      };

      if (!data || !Array.isArray(data.features)) {
        report.validSchema = false;
        report.comparisonStatus = 'invalid-schema';
        console.warn('[Auditoria] Dry-run interrompido: features não é um array válido.');
        return report;
      }

      const detectedPrograms = new Set();
      const detectedStatuses = new Set();
      const detectedMetrics = new Set();
      const detailTotals = {};
      const keyPattern = /^([A-Z]+)_(Acumulado|Ativo|Descredenciado)_(Beneficios|Pessoas)$/;

      data.features.forEach((feature, featureIndex) => {
        const properties = feature && feature.properties;
        if (!properties) {
          report.validSchema = false;
          report.invalidValues.push({ featureIndex: featureIndex + 1, reason: 'properties ausente' });
          return;
        }

        const expectedKeys = Object.keys(PROGRAMAS).flatMap(program => program === 'PLES'
          ? PLES_COLUMN_KEYS
          : PROGRAM_STATUSES.flatMap(status => PROGRAM_METRICS.map(metric => `${program}_${status}_${metric}`)));
        expectedKeys.forEach(key => {
          if (!(key in properties)) report.missingValues.push({ featureIndex: featureIndex + 1, key, reason: 'campo omitido' });
        });
        Object.keys(properties).forEach(key => {
          const match = keyPattern.exec(key);
          if (!match) return;

          const [, programa, status, metrica] = match;
          const totalKey = `${programa}_${status}_${metrica}`;
          detectedPrograms.add(programa);
          detectedStatuses.add(status);
          detectedMetrics.add(metrica);
          if (!report.derivedTotals[programa]) report.derivedTotals[programa] = {};
          if (!report.derivedTotals[programa][status]) report.derivedTotals[programa][status] = {};
          if (report.derivedTotals[programa][status][metrica] === undefined) report.derivedTotals[programa][status][metrica] = 0;

          const rawValue = properties[key];
          if (rawValue === null || rawValue === undefined) {
            report.missingValues.push({ featureIndex: featureIndex + 1, key: totalKey });
            return;
          }
          const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
          if (!Number.isFinite(numericValue) || numericValue < 0) {
            report.invalidValues.push({ featureIndex: featureIndex + 1, key: totalKey, value: rawValue });
            return;
          }

          report.derivedTotals[programa][status][metrica] += numericValue;
          if (programa !== 'TODS') {
            if (detailTotals[status] === undefined) detailTotals[status] = {};
            if (detailTotals[status][metrica] === undefined) detailTotals[status][metrica] = 0;
            detailTotals[status][metrica] += numericValue;
          }
        });
      });

      report.featureCount = data.features.length;
      report.detected.programs = Array.from(detectedPrograms).sort();
      report.detected.statuses = Array.from(detectedStatuses).sort((a, b) => PROGRAM_STATUSES.indexOf(a) - PROGRAM_STATUSES.indexOf(b));
      report.detected.metrics = Array.from(detectedMetrics).sort((a, b) => PROGRAM_METRICS.indexOf(a) - PROGRAM_METRICS.indexOf(b));

      function getExpectedTotal(programa, status, metrica) {
        if (!referenceTotals) return undefined;
        const key = `${programa}_${status}_${metrica}`;
        if (referenceTotals[key] !== undefined) return referenceTotals[key];
        if (referenceTotals[programa] && referenceTotals[programa][status]) return referenceTotals[programa][status][metrica];
        return undefined;
      }

      report.detected.programs.forEach(programa => {
        report.detected.statuses.forEach(status => {
          report.detected.metrics.forEach(metrica => {
            const actual = report.derivedTotals[programa]
              && report.derivedTotals[programa][status]
              && report.derivedTotals[programa][status][metrica];
            const expected = getExpectedTotal(programa, status, metrica);
            if (expected === null || expected === undefined) return;
            const numericExpected = typeof expected === 'number' ? expected : Number(expected);
            if (isNaN(numericExpected) || actual === undefined || Math.abs(actual - numericExpected) > 0.000001) {
              report.divergences.push({
                key: `${programa}_${status}_${metrica}`,
                expected: numericExpected,
                actual: actual === undefined ? null : actual,
                difference: actual === undefined ? null : actual - numericExpected
              });
            }
          });
        });
      });

      report.detected.statuses.forEach(status => {
        report.detected.metrics.forEach(metrica => {
          const todsTotal = report.derivedTotals.TODS && report.derivedTotals.TODS[status] && report.derivedTotals.TODS[status][metrica];
          const detailedTotal = detailTotals[status] && detailTotals[status][metrica];
          if (todsTotal !== undefined && detailedTotal !== undefined && Math.abs(todsTotal - detailedTotal) > 0.000001) {
            report.diagnostics.push({
              type: 'TODS_vs_programas_detalhados',
              key: `TODS_${status}_${metrica}`,
              aggregate: todsTotal,
              detailedSum: detailedTotal,
              difference: todsTotal - detailedTotal
            });
          }
        });
      });

      if (report.missingValues.length || report.invalidValues.length || report.divergences.length) {
        console.warn('[Auditoria] Divergências encontradas no dry-run de totais:', report);
      } else {
        console.info('[Auditoria] Dry-run de totais concluído:', report);
      }
      if (!referenceTotals) {
        console.warn('[Auditoria] Comparação com totais estaduais oficiais indisponível: forneça expectedTotals antes da atualização mensal.');
      }
      if (report.diagnostics.length) {
        console.warn('[Auditoria] Divergências diagnósticas TODS versus programas detalhados:', report.diagnostics);
      }
      return report;
    }

    // API de auditoria para ser chamada antes de substituir os dados em cada competência mensal.
    window.runProgramTotalsDryRun = expectedTotals => validateProgramTotalsDryRun(
      typeof geojsonData === 'undefined' ? null : geojsonData,
      expectedTotals
    );

    const PALETAS = {
      RdYlGn_r: ['#06402B', '#a6d96a', '#fee08b', '#fdae61', '#a61027'],
      viridis_r: ['#fde725', '#5ec962', '#21918c', '#3b528b', '#440154'],
      plasma_r: ['#f0f921', '#f89540', '#cc4778', '#7e03a8', '#0d0887'],
      YlOrRd: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#a61027'],
      Oranges: ['#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603'],
     };


    const TITULOS_POB = {
      norm_ext: 'Extrema Pobreza (População Municipal)',
      norm_pob: 'Pobreza (População Municipal)',
      norm_pob_p1_p2: 'Pobreza PBF (População Municipal)',
    };
    const LEGENDAS_POB = { norm_ext: 'Extrema Pobreza', norm_pob: 'Pobreza', norm_pob_p1_p2: 'Pobreza PBF' };
    const MAX_VALUES = { pob: 0.6 };

    const POB_COLUMNS = [
      { key: 'name', label: 'Município', getVal: (p) => p.name, render: (p) => p.name },
      { key: 'população', label: 'População', getVal: (p) => p.população, render: (p) => fmtPtbrInt(p.população) },
      { key: 'ext_pob', label: 'Ext. pobreza', getVal: (p) => p.ext_pob, render: (p) => fmtPtbrInt(p.ext_pob) },
      { key: 'pct_ext_pob', label: '% ext. pob.', getVal: (p) => Utils.calcPctExtPob(p), render: (p) => Utils.fmtPtbrPct(Utils.calcPctExtPob(p)) },
      { key: 'pob', label: 'Pobreza', getVal: (p) => p.pob, render: (p) => fmtPtbrInt(p.pob) },
      { key: 'pct_pob', label: '% pob.', getVal: (p) => Utils.calcPctPob(p), render: (p) => Utils.fmtPtbrPct(Utils.calcPctPob(p)) },
      { key: 'pob_p1_p2', label: 'Pobreza PBF', getVal: (p) => p.pob_p1_p2, render: (p) => fmtPtbrInt(p.pob_p1_p2) },
      { key: 'pct_pob_p1_p2', label: '% Pob. PBF', getVal: (p) => Utils.calcPctPobP1P2(p), render: (p) => Utils.fmtPtbrPct(Utils.calcPctPobP1P2(p)) }
    ];

    // --- STATE ---
    const State = (function() {
      let state = {
        isDark: false, activeTab: 'pob', viewMode: 'mapa',
        pobIndicator: 'norm_ext', pobPalette: 'RdYlGn_r', pobPbfAno: '2026', pobChartMode: 'goias',
        // Estado dos programas sociais
         progPrograma: 'TODS', progStatus: 'Ativo', progMetrica: 'Beneficios', progPlesMetrica: PLES_COLUMN_KEYS[0] || '', progMetricaModo: 'absoluto', progPalette: 'viridis_r',
        
         selectedCity: null, sortConfig: { key: 'name', direction: 'asc' },
        isKiosk: false, dataError: !initialGeoDataValidation.valid, dataErrorMessage: initialGeoDataValidation.message,
          searchTerm: '', riskFilter: 'all', populationBand: 'all', populationMin: null, populationMax: null
      };
      const listeners = new Map();
      const pending = new Map();
      let scheduled = false;
      function notify(key, value) {
        if (listeners.has(key)) listeners.get(key).forEach(cb => pending.set(cb, value));
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const callbacks = Array.from(pending);
          pending.clear();
          callbacks.forEach(([callback, currentValue]) => callback(currentValue, state));
        });
      }
      return {
        getState: () => ({ ...state }),
        get: (key) => state[key],
        set: (key, value) => { if (state[key] !== value) { state[key] = value; notify(key, value); } },
        batch: patch => {
          const changed = Object.keys(patch).filter(key => state[key] !== patch[key]);
          Object.assign(state, patch);
          changed.forEach(key => notify(key, state[key]));
        },
        subscribe: (key, callback) => {
          if (!listeners.has(key)) listeners.set(key, new Set());
          listeners.get(key).add(callback);
          return () => listeners.get(key).delete(callback);
        },
        init: () => { Object.keys(state).forEach(k => notify(k, state[k])); }
      };
    })();

    // --- UTILS ---
    const Utils = {
      escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]),
      pendingDebounces: new Set(),
      cancelPendingInputs: () => Utils.pendingDebounces.forEach(callback => callback.cancel()),
      normalizeStr: value => String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim(),
      parseNum: (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'number') return Number.isFinite(val) ? val : null;
        const text = String(val).trim();
        if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) return null;
        const parsed = Number(text.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
      },
      calcPctSeguro: (numerador, denominador) => {
        if (!Number.isFinite(denominador) || denominador <= 0 || !Number.isFinite(numerador)) return null;
        return (numerador / denominador) * 100;
      },
      calcRatioSeguro: (numerador, denominador) => {
        if (!Number.isFinite(denominador) || denominador <= 0 || !Number.isFinite(numerador)) return null;
        return numerador / denominador;
      },
      calcPctExtPob: p => Utils.calcPctSeguro(p.ext_pob, p.população),
      calcPctPob: p => Utils.calcPctSeguro(p.pob, p.população),
      getPbfPopulation: (p, year) => year === '2019' ? p.população_2019 : p.população,
      getPopulationVariationPct: p => {
        if (!Number.isFinite(p?.população_2019) || p.população_2019 <= 0 || !Number.isFinite(p.população)) return null;
        return ((p.população - p.população_2019) / p.população_2019) * 100;
      },
      getAverageAbsolutePopulationVariationPct: () => {
        if (averageAbsolutePopulationVariationPct !== null) return averageAbsolutePopulationVariationPct;
        const variations = geojsonData.features
          .map(feature => Utils.getPopulationVariationPct(feature.properties))
          .filter(value => value !== null)
          .map(Math.abs);
        averageAbsolutePopulationVariationPct = variations.length
          ? variations.reduce((sum, value) => sum + value, 0) / variations.length
          : 0;
        return averageAbsolutePopulationVariationPct;
      },
      isPopulationVariationAboveAverage: p => {
        const variation = Utils.getPopulationVariationPct(p);
        return variation !== null && Math.abs(variation) > Utils.getAverageAbsolutePopulationVariationPct();
      },
      calcPbfPercentual: (p, year) => Utils.calcPctSeguro(
        year === '2019' ? p.PBF_2019 : p.pob_p1_p2,
        Utils.getPbfPopulation(p, year)
      ),
      calcPctPobP1P2: p => Utils.calcPbfPercentual(p, '2026'),
      getPopulationForState: (p, state) => state.activeTab === 'pob'
        && state.pobIndicator === 'norm_pob_p1_p2'
        && state.pobPbfAno === '2019'
        ? p.população_2019
        : p.população,
      // Variação em pontos percentuais usando a população estimada de cada ano.
      getPbfVariacao2026x2019: p => {
        const v2026 = Utils.calcPbfPercentual(p, '2026');
        const v2019 = Utils.calcPbfPercentual(p, '2019');
        if (v2026 === null || v2019 === null) return null;
        return v2026 - v2019;
      },
      fmtPtbrPct: val => {
        if (val === null || val === undefined || isNaN(val)) return '-';
        return fmtPtbrNum(val, 2) + '%';
      },
      parseValueForSorting: (val) => {
        if (val === null || val === undefined) return -Infinity;
        if (typeof val === 'number') return val;
        return val.toString().toLowerCase();
      },
      // LÓGICA DE CHAVE DINÂMICA
      getProgKey: (programa, status, metrica) => `${programa}_${status}_${metrica}`,
      getPlesColumnValue: (properties, key) => {
        const value = properties ? properties[key] : null;
        return value;
      },
      getSignalStatus: (val, maxVal, inverse) => {
        if (val === null || val === undefined) return { label: 'Sem Dados', color: 'bg-slate-500 text-white', ratio: 0 };
        const ratio = val / maxVal;
        if (inverse) {
          if (ratio <= 0.4) return { label: 'Crítico', color: 'bg-rose-500 text-white animate-pulse-soft', ratio };
          if (ratio <= 0.75) return { label: 'Alerta', color: 'bg-amber-500 text-slate-950', ratio };
          return { label: 'Estável', color: 'bg-emerald-600 text-white', ratio };
        }
        if (ratio > 0.75) return { label: 'Crítico', color: 'bg-rose-500 text-white animate-pulse-soft', ratio };
        if (ratio > 0.4) return { label: 'Alerta', color: 'bg-amber-500 text-slate-950', ratio };
        return { label: 'Estável', color: 'bg-emerald-600 text-white', ratio };
      },
      getSignalTextColorClass: (val, maxVal) => {
        if (val === null || val === undefined) return 'text-slate-400';
        const ratio = val / maxVal;
        if (ratio > 0.75) return 'text-rose-500 font-black';
        if (ratio > 0.4) return 'text-amber-500 font-black';
        return 'text-emerald-600 font-black';
      },
      debounce: (fn, delay) => {
        let timer;
        const callback = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
        callback.cancel = () => clearTimeout(timer);
        Utils.pendingDebounces.add(callback);
        return callback;
      },

      getPercentileMax: (values, fallback) => {
        const numericValues = values
          .filter(value => value !== null && value !== undefined && !isNaN(value))
          .map(Number)
          .sort((a, b) => a - b);
        if (numericValues.length === 0) return fallback;

        // Ignora zeros somente na amostra do percentil; zero continua sendo valor válido.
        const positiveValues = numericValues.filter(value => value > 0);
        const percentileValues = positiveValues.length > 0 ? positiveValues : numericValues;
        const p95Index = Math.min(percentileValues.length - 1, Math.floor(percentileValues.length * 0.95));
        const calcMax = percentileValues[p95Index];
        return calcMax > 0 ? calcMax : fallback;
      },

      // Calcula o teto da escala de cores removendo Outliers (Percentil)
       getDynamicMax: (state) => {
         let values = [];
         const metric = MetricSelectors.get(state);
        
         if (typeof geojsonData !== 'undefined' && Array.isArray(geojsonData.features)) {
           geojsonData.features.forEach(f => {
             const v = Utils.parseNum(metric.value(f.properties));
             if (v !== null && !isNaN(v)) values.push(v);
           });
         }

          return Utils.getPercentileMax(values, state.activeTab === 'pob' ? MAX_VALUES.pob : 1);
        },

      getCriticityMax: (state) => {
        if (state.activeTab !== 'prog') return Utils.getDynamicMax(state);

        const values = [];
        const metric = MetricSelectors.get(state);
        if (typeof geojsonData !== 'undefined' && Array.isArray(geojsonData.features)) {
          geojsonData.features.forEach(f => {
            const value = metric.statusValue(f.properties);
            if (value !== null) values.push(value);
          });
        }
        return Utils.getPercentileMax(values, 1);
      },

      getCriticityDescription: (state, city) => {
        const metric = MetricSelectors.get(state);
        const reference = Utils.getCriticityMax(state);
        const isProgram = state.activeTab === 'prog';
        const isPbfDiff = !isProgram && state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === 'diff';
        const label = isPbfDiff ? 'Pobreza PBF (2026)' : isProgram ? `${PROGRAMAS[state.progPrograma]}: ${metric.label}` : metric.label;
        const lines = [`Criticidade do indicador: ${label}`];
        if (city) {
          const value = metric.statusValue(city);
          lines.push(`${city.name}: ${metric.getStatus(city, reference).label}. Proporção usada: ${value === null || value === undefined ? 'sem dados' : Utils.fmtPtbrPct(value * 100)}.`);
        }
        lines.push(isProgram
          ? 'Usa a métrica dividida pela população municipal, mesmo no modo absoluto. Menor proporção recebe maior criticidade.'
          : 'Maior proporção da população no indicador recebe maior criticidade.');
        lines.push(isProgram
          ? 'Crítico: até 40% da referência. Alerta: acima de 40% até 75%. Estável: acima de 75%.'
          : 'Estável: até 40% da referência. Alerta: acima de 40% até 75%. Crítico: acima de 75%.');
        lines.push(`Referência: ${Utils.fmtPtbrPct(reference * 100)}, calculada pelo percentil 95 dos valores positivos da base completa, ou pelo valor padrão quando indisponível. Os filtros não alteram essa referência.`);
        lines.push('Sem dados: valor ausente. Zero é válido. A classificação é comparativa, não uma avaliação de impacto social.');
        if (isProgram) lines.push('Não confundir com o status cadastral do programa.');
        if (isPbfDiff) lines.push('No modo Diff, o status usa o indicador de 2026, não a diferença em pontos percentuais nem a faixa sem preenchimento do mapa.');
        return lines.join('\n\n');
      },

      // Fica consistente sem quebrar
       isFeatureVisible: (feature, state, maxVal) => {
         const p = feature.properties;
         const normalizedSearchTerm = Utils.normalizeStr(state.searchTerm);
         if (normalizedSearchTerm && !Utils.normalizeStr(p.name).includes(normalizedSearchTerm)) return false;
        if (state.riskFilter !== 'all') {
          const val = MetricSelectors.get(state).statusValue(p);

          let match = false;
          if (state.riskFilter === 'semdados') { if (val === null || val === undefined) match = true; }
          else if (val !== null && val !== undefined) {
            const ratio = val / maxVal;
            if (state.activeTab === 'prog') {
              if (state.riskFilter === 'critico' && ratio <= 0.4) match = true;
              else if (state.riskFilter === 'alerta' && ratio > 0.4 && ratio <= 0.75) match = true;
              else if (state.riskFilter === 'estavel' && ratio > 0.75) match = true;
            } else {
              if (state.riskFilter === 'critico' && ratio > 0.75) match = true;
              else if (state.riskFilter === 'alerta' && ratio > 0.4 && ratio <= 0.75) match = true;
              else if (state.riskFilter === 'estavel' && ratio <= 0.4) match = true;
            }
          }
          if (!match) return false;
        }
        const hasCustomPopulationBounds = state.populationBand === 'custom'
          && (state.populationMin !== null || state.populationMax !== null);
        if (state.populationBand !== 'all' && (state.populationBand !== 'custom' || hasCustomPopulationBounds)) {
          const pop = Utils.parseNum(Utils.getPopulationForState(p, state));
          if (pop === null) return false;
          if (state.populationBand === 'lt20k' && pop >= 20000) return false;
          if (state.populationBand === 'b20k100k' && (pop < 20000 || pop > 100000)) return false;
          if (state.populationBand === 'gt100k' && pop <= 100000) return false;
          if (state.populationBand === 'custom') {
            if (state.populationMin !== null && pop < state.populationMin) return false;
            if (state.populationMax !== null && pop > state.populationMax) return false;
          }
        }
        return true;
      }
    };

    const MetricSelectors = {
      getPovertyMetric: (state) => {
        const definitions = {
          norm_ext: { rawKey: 'ext_pob', label: LEGENDAS_POB.norm_ext, title: TITULOS_POB.norm_ext, display: Utils.calcPctExtPob },
          norm_pob: { rawKey: 'pob', label: LEGENDAS_POB.norm_pob, title: TITULOS_POB.norm_pob, display: Utils.calcPctPob },
          norm_pob_p1_p2: { rawKey: 'pob_p1_p2', label: LEGENDAS_POB.norm_pob_p1_p2, title: TITULOS_POB.norm_pob_p1_p2, display: Utils.calcPctPobP1P2 }
        };
        const definition = definitions[state.pobIndicator];
        // Pobreza PBF: alternância entre a competência atual (2026) e o histórico 2019 (PBF_2019 / norm_PBF_2019).
        const isPbfAnoToggle = state.pobIndicator === 'norm_pob_p1_p2';
        const isPbfDiff = isPbfAnoToggle && state.pobPbfAno === 'diff';
        const pbfAno = isPbfAnoToggle && state.pobPbfAno === '2019' ? '2019' : '2026';
        const usePbf2019 = isPbfAnoToggle && pbfAno === '2019';
        const rawKey = usePbf2019 ? 'PBF_2019' : definition.rawKey;
        const ratioKey = usePbf2019 ? 'norm_PBF_2019' : state.pobIndicator;
        const selectedPopulation = p => usePbf2019 ? p.população_2019 : p.população;
        // No modo "Diff p.p. 2019" os valores base permanecem 2026; a cor do mapa é tratada no módulo do mapa.
        const anoSufixo = isPbfAnoToggle ? (isPbfDiff ? ' - Diff p.p. 2019' : ` (${pbfAno})`) : '';
        return {
          key: state.pobIndicator,
          rawKey,
          label: definition.label + anoSufixo,
          title: definition.title + anoSufixo,
          unit: '%',
          denominator: selectedPopulation,
          rawValue: p => p[rawKey],
          value: p => p[ratioKey],
          statusValue: p => p[ratioKey],
          displayValue: p => isPbfDiff
            ? Utils.getPbfVariacao2026x2019(p)
            : Utils.calcPctSeguro(p[rawKey], selectedPopulation(p)),
          formatValue: value => fmtPtbrInt(value),
          formatDisplay: value => isPbfDiff ? `${fmtPtbrNum(value)} p.p.` : Utils.fmtPtbrPct(value),
          formatScaleValue: value => Utils.fmtPtbrPct(value * 100),
          aggregateDenominator: totals => totals.totalPopulacao,
          getStatus: (p, maxVal) => Utils.getSignalStatus(p[ratioKey], maxVal, false),
          inverseCriticity: false
        };
      },

      getProgramMetric: (state) => {
        const isPles = state.progPrograma === 'PLES';
        const isRelative = state.progMetricaModo === 'percentual';
        const baseMetric = state.progMetrica;
        const key = isPles
          ? (PLES_COLUMN_LABELS[state.progPlesMetrica] ? state.progPlesMetrica : PLES_COLUMN_KEYS[0])
          : Utils.getProgKey(state.progPrograma, state.progStatus, baseMetric);
        const metricLabels = { Beneficios: 'Benefícios', Pessoas: 'Pessoas' };
        const metricLabel = isPles ? (PLES_COLUMN_LABELS[key] || 'Passe Livre Estudantil') : metricLabels[baseMetric];
        return {
          key,
          rawKey: key,
          label: isPles
            ? (isRelative ? `% ${metricLabel} / Pop. Município` : metricLabel)
            : (isRelative ? `% ${metricLabel} / Pop. Município (${state.progStatus})` : `${metricLabel} (${state.progStatus})`),
          title: isPles
            ? `${PROGRAMAS[state.progPrograma]} -> ${isRelative ? `% ${metricLabel} / Pop. Município` : metricLabel}`
            : `${PROGRAMAS[state.progPrograma]} -> ${isRelative ? `% ${metricLabel} / Pop. Município` : metricLabel} -> ${state.progStatus}`,
          unit: isRelative ? '%' : 'quantidade',
          denominator: p => p.população,
          rawValue: p => isPles ? Utils.getPlesColumnValue(p, key) : p[key],
          value: p => {
            const rawValue = isPles ? Utils.getPlesColumnValue(p, key) : p[key];
            return isRelative ? Utils.calcRatioSeguro(rawValue, p.população) : rawValue;
          },
          statusValue: p => {
            const rawValue = isPles ? Utils.getPlesColumnValue(p, key) : p[key];
            return Utils.calcRatioSeguro(rawValue, p.população);
          },
          displayValue: p => {
            const rawValue = isPles ? Utils.getPlesColumnValue(p, key) : p[key];
            return isRelative ? Utils.calcPctSeguro(rawValue, p.população) : rawValue;
          },
          formatValue: value => fmtPtbrInt(value),
          formatDisplay: value => isRelative ? Utils.fmtPtbrPct(value) : fmtPtbrInt(value),
          formatScaleValue: value => isRelative ? Utils.fmtPtbrPct(value * 100) : fmtPtbrInt(value),
          aggregateDenominator: totals => totals.totalPopulacao,
          getStatus: (p, maxVal) => {
            const rawValue = isPles ? Utils.getPlesColumnValue(p, key) : p[key];
            return Utils.getSignalStatus(Utils.calcRatioSeguro(rawValue, p.população), maxVal, true);
          },
          inverseCriticity: true
        };
      },

      get: (state) => {
        if (state.activeTab === 'pob') return MetricSelectors.getPovertyMetric(state);
        return MetricSelectors.getProgramMetric(state);
      }
    };

    const ColumnSelectors = {
      getPovertyColumns: state => {
        if (state.pobIndicator !== 'norm_pob_p1_p2') return POB_COLUMNS;
        const municipality = { key: 'name', label: 'Município', getVal: p => p.name, render: p => p.name };
        const population2019 = { key: 'population2019', label: 'População 2019', getVal: p => p.população_2019, render: p => fmtPtbrInt(p.população_2019) };
        const population2026 = { key: 'population2026', label: 'População 2026', getVal: p => p.população, render: p => fmtPtbrInt(p.população) };
        const pbf2019 = { key: 'pbf2019', label: 'Pobreza PBF 2019', getVal: p => p.PBF_2019, render: p => fmtPtbrInt(p.PBF_2019) };
        const pbf2026 = { key: 'pbf2026', label: 'Pobreza PBF 2026', getVal: p => p.pob_p1_p2, render: p => fmtPtbrInt(p.pob_p1_p2) };
        const pbfPercent2019 = { key: 'pbfPercent2019', label: '% PBF 2019', getVal: p => Utils.calcPbfPercentual(p, '2019'), render: p => Utils.fmtPtbrPct(Utils.calcPbfPercentual(p, '2019')) };
        const pbfPercent2026 = { key: 'pbfPercent2026', label: '% PBF 2026', getVal: p => Utils.calcPbfPercentual(p, '2026'), render: p => Utils.fmtPtbrPct(Utils.calcPbfPercentual(p, '2026')) };
        const pbfDifference = { key: 'pbfDifference', label: 'Diferença 2026-2019 (p.p.)', getVal: p => Utils.getPbfVariacao2026x2019(p), render: p => {
          const value = Utils.getPbfVariacao2026x2019(p);
          return value === null ? '-' : `${value > 0 ? '+' : ''}${fmtPtbrNum(value)}`;
        } };

        if (state.pobPbfAno === '2019') return [municipality, population2019, pbf2019, pbfPercent2019];
        if (state.pobPbfAno === 'diff') return [municipality, population2019, population2026, pbf2019, pbf2026, pbfPercent2019, pbfPercent2026, pbfDifference];
        return [municipality, population2026, pbf2026, pbfPercent2026];
      },
      getPlesColumns: (plesMetrica) => {
        const selectedKey = PLES_COLUMN_LABELS[plesMetrica] ? plesMetrica : PLES_COLUMN_KEYS[0];
        const selectedLabel = PLES_COLUMN_LABELS[selectedKey] || 'Passe Livre Estudantil';
        return [
          { key: 'name', label: 'Município', getVal: p => p.name, render: p => p.name },
          { key: 'população', label: 'População', getVal: p => p.população, render: p => fmtPtbrInt(p.população) },
          { key: 'ples_valor', label: selectedLabel, getVal: p => Utils.getPlesColumnValue(p, selectedKey), render: p => fmtPtbrInt(Utils.getPlesColumnValue(p, selectedKey)) },
          { key: 'ples_percentual', label: '% População', getVal: p => Utils.calcPctSeguro(Utils.getPlesColumnValue(p, selectedKey), p.população), render: p => Utils.fmtPtbrPct(Utils.calcPctSeguro(Utils.getPlesColumnValue(p, selectedKey), p.população)) }
        ];
      },
      getProgramColumns: (progPrograma, progStatus, progPlesMetrica) => {
        if (progPrograma === 'PLES') return ColumnSelectors.getPlesColumns(progPlesMetrica);
        const beneficiosKey = Utils.getProgKey(progPrograma, progStatus, 'Beneficios');
        const pessoasKey = Utils.getProgKey(progPrograma, progStatus, 'Pessoas');
        return [
          { key: 'name', label: 'Município', getVal: p => p.name, render: p => p.name },
          { key: 'população', label: 'População', getVal: p => p.população, render: p => fmtPtbrInt(p.população) },
          { key: 'beneficios', label: 'Benefícios', getVal: p => p[beneficiosKey], render: p => fmtPtbrInt(p[beneficiosKey]) },
          { key: 'pessoas', label: 'Pessoas', getVal: p => p[pessoasKey], render: p => fmtPtbrInt(p[pessoasKey]) },
          { key: 'pct_pessoas', label: '% Pessoas', getVal: p => Utils.calcPctSeguro(p[pessoasKey], p.população), render: p => Utils.fmtPtbrPct(Utils.calcPctSeguro(p[pessoasKey], p.população)) }
        ];
      },
      get: state => state.activeTab === 'pob'
        ? ColumnSelectors.getPovertyColumns(state)
        : ColumnSelectors.getProgramColumns(state.progPrograma, state.progStatus, state.progPlesMetrica)
    };

    const DataSelectors = {
      getFilteredFeatures: (state) => {
        if (state.dataError || typeof geojsonData === 'undefined' || !Array.isArray(geojsonData.features)) return [];
        const maxVal = Utils.getCriticityMax(state);
        return geojsonData.features.filter(feature => Utils.isFeatureVisible(feature, state, maxVal));
      },
      getTotals: (features, metric) => {
        return features.reduce((totals, feature) => {
          const p = feature.properties;
          const population = Utils.parseNum(metric.denominator(p));
          const value = Utils.parseNum(metric.rawValue(p));
          if (population !== null && population > 0) totals.scopePopulation += population;
          if (value !== null && !isNaN(value)) {
            if (population !== null && population > 0) totals.totalPopulacao += population;
            totals.totalMetric += value;
            totals.metricCount += 1;
          }
          return totals;
        }, { totalPopulacao: 0, scopePopulation: 0, totalMetric: 0, metricCount: 0 });
      },
      getPbfVariation: features => {
        const totals = features.reduce((result, feature) => {
           const p = feature.properties;
           if ([p.população_2019, p.população, p.PBF_2019, p.pob_p1_p2].some(value => !Number.isFinite(value))) return result;
          result.population2019 += Utils.parseNum(p.população_2019) || 0;
          result.population2026 += Utils.parseNum(p.população) || 0;
          result.pbf2019 += Utils.parseNum(p.PBF_2019) || 0;
          result.pbf2026 += Utils.parseNum(p.pob_p1_p2) || 0;
          return result;
        }, { population2019: 0, population2026: 0, pbf2019: 0, pbf2026: 0 });
        return Utils.getPbfVariacao2026x2019({
          PBF_2019: totals.pbf2019,
          população_2019: totals.population2019,
          pob_p1_p2: totals.pbf2026,
          população: totals.population2026
        });
      }
    };

export { fmtPtbrInt, fmtPtbrNum, validateGeoData, initialGeoDataValidation, goiasTotals, PROGRAMAS, PROGRAM_STATUSES, PROGRAM_METRICS, PLES_COLUMN_KEYS, PLES_COLUMN_LABELS, PALETAS, TITULOS_POB, LEGENDAS_POB, MAX_VALUES, POB_COLUMNS, State, Utils, MetricSelectors, ColumnSelectors, DataSelectors, validateProgramTotalsDryRun };
