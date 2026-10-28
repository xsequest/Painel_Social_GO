import { geojsonData } from './data.js';
import { fmtPtbrInt, validateGeoData, State, Utils, MetricSelectors, DataSelectors, validateProgramTotalsDryRun } from './core.js';
import './controls.js';
import './scatter.js';
import './table.js';
import './statistics.js';
import './panel.js';
    const HeaderInfoModule = (function() {
      const titleEl = document.getElementById('main-title'), badgeEl = document.getElementById('dynamic-badge');
      function update() {
        const state = State.getState(); if (state.dataError) return;
        const metric = MetricSelectors.get(state);
        const filteredFeatures = DataSelectors.getFilteredFeatures(state);
        const totals = DataSelectors.getTotals(filteredFeatures, metric);
        const denominator = metric.aggregateDenominator(totals);
        const scopeLabel = filteredFeatures.length === geojsonData.features.length ? 'Goiás' : 'Recorte atual';
        titleEl.textContent = metric.title;
        if (state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === 'diff') {
          const variation = DataSelectors.getPbfVariation(filteredFeatures);
          badgeEl.textContent = variation === null
            ? `${scopeLabel}: sem dados suficientes para calcular a diferença`
            : `${metric.label}: ${metric.formatDisplay(variation)} em ${scopeLabel}`;
          return;
        }
        if (filteredFeatures.length && denominator > 0) {
          const pctValue = (totals.totalMetric / denominator) * 100;
          const pct = pctValue.toFixed(2).replace('.', ',');
          badgeEl.textContent = metric.unit === '%'
            ? `${metric.label}: ${pct}% em ${scopeLabel}`
            : `${metric.label}: ${metric.formatValue(Math.round(totals.totalMetric))} em ${scopeLabel} (${pct}% pop.)`;
        } else {
          badgeEl.textContent = filteredFeatures.length ? `${scopeLabel} (${filteredFeatures.length} municípios)` : 'Nenhum município no recorte atual';
        }
      }
        State.subscribe('activeTab', update); 
        State.subscribe('pobIndicator', update); State.subscribe('pobPbfAno', update);
        State.subscribe('progPrograma', update); State.subscribe('progStatus', update); State.subscribe('progMetrica', update); State.subscribe('progPlesMetrica', update); State.subscribe('progMetricaModo', update);
        State.subscribe('searchTerm', update); State.subscribe('riskFilter', update); State.subscribe('regionFilter', update); State.subscribe('populationBand', update); State.subscribe('populationMin', update); State.subscribe('populationMax', update);
       if (!State.get('dataError')) update();
    })();

    // 4.7 Error State
    const ErrorModule = (function() {
      const mainLayout = document.getElementById('main-layout'), header = document.getElementById('app-header');
       State.subscribe('dataError', (err) => {
         if (err) {
           header.style.display = 'none';
           const message = State.get('dataErrorMessage') || 'A estrutura da base de dados não é válida.';
            mainLayout.innerHTML = `<div role="alert" class="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-6 text-center"><div class="border border-red-500 rounded-2xl p-8 max-w-lg shadow-2xl"><h1 class="text-2xl font-bold mb-4">Não foi possível carregar os dados</h1><p class="text-slate-300 text-sm leading-relaxed mb-6">${Utils.escapeHtml(message)}</p><p class="text-xs text-slate-500">Verifique os arquivos da pasta output e os campos esperados para os municípios.</p></div></div>`;
         }
       });
      })();

     // 4.8 Filter Module
     const FilterModule = (function() {
        const inputSearch = document.getElementById('filter-search'), selRisk = document.getElementById('filter-risk'), selPop = document.getElementById('filter-pop'), btnReset = document.getElementById('btn-reset-filters'), customPopFilter = document.getElementById('custom-population-filter'), inputPopMin = document.getElementById('filter-pop-min'), inputPopMax = document.getElementById('filter-pop-max'), customPopError = document.getElementById('custom-population-error');
        const selRegion = document.getElementById('filter-region');
        if (!inputSearch || !selRisk || !selPop || !customPopFilter || !inputPopMin || !inputPopMax || !customPopError) return;

       if (selRegion) {
         const regions = [...new Set((geojsonData?.features || [])
           .map(feature => feature.properties.macrorregiao_sus)
           .filter(value => typeof value === 'string' && value.trim()))]
           .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
         regions.forEach(region => {
           const option = document.createElement('option');
           option.value = region;
           option.textContent = region;
           selRegion.appendChild(option);
         });
         selRegion.value = State.get('regionFilter');
         selRegion.addEventListener('change', e => State.set('regionFilter', e.target.value));
         State.subscribe('regionFilter', value => selRegion.value = value);
       }

      function setCustomPopulationError(message) {
        customPopError.textContent = message || '';
        customPopError.classList.toggle('hidden', !message);
      }

      function readPopulationInput(input) {
        const rawValue = input.value.trim();
        if (!rawValue) return { value: null, invalid: false };
        const value = Utils.parseNum(rawValue);
        return { value, invalid: !/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(rawValue) || value === null || value < 0 || !Number.isSafeInteger(value) };
      }

      function updateCustomPopulationRange() {
        if (State.get('populationBand') !== 'custom') return;
        const minimum = readPopulationInput(inputPopMin);
        const maximum = readPopulationInput(inputPopMax);
        if (minimum.invalid || maximum.invalid) {
          setCustomPopulationError('Informe números inteiros não negativos, como 50.000.');
          return;
        }
        if (minimum.value !== null && maximum.value !== null && minimum.value > maximum.value) {
          setCustomPopulationError('O valor mínimo não pode ser maior que o máximo.');
          return;
        }
        setCustomPopulationError('');
        State.batch({ populationMin: minimum.value, populationMax: maximum.value });
      }

      function syncCustomPopulationVisibility(populationBand) {
        customPopFilter.classList.toggle('hidden', populationBand !== 'custom');
        if (populationBand !== 'custom') setCustomPopulationError('');
      }

      function syncPopulationInput(input, value) {
        if (document.activeElement === input) return;
        input.value = value === null ? '' : fmtPtbrInt(value);
      }

       inputSearch.addEventListener('input', Utils.debounce(e => State.set('searchTerm', e.target.value), 150));
       selRisk.addEventListener('change', e => State.set('riskFilter', e.target.value));
      const updateBounds = Utils.debounce(updateCustomPopulationRange, 150);
      selPop.addEventListener('change', e => {
        updateBounds.cancel();
        inputPopMin.value = State.get('populationMin') === null ? '' : fmtPtbrInt(State.get('populationMin'));
        inputPopMax.value = State.get('populationMax') === null ? '' : fmtPtbrInt(State.get('populationMax'));
        State.set('populationBand', e.target.value);
      });
      inputPopMin.addEventListener('input', updateBounds);
      inputPopMax.addEventListener('input', updateBounds);
      btnReset.addEventListener('click', () => {
        Utils.cancelPendingInputs();
        document.getElementById('search-input').value = '';
        inputSearch.value = ''; inputPopMin.value = ''; inputPopMax.value = '';
        setCustomPopulationError('');
        State.batch({ searchTerm: '', riskFilter: 'all', regionFilter: 'all', populationBand: 'all', populationMin: null, populationMax: null });
      });
       State.subscribe('searchTerm', v => inputSearch.value = v); State.subscribe('riskFilter', v => selRisk.value = v); State.subscribe('populationBand', v => selPop.value = v);
       State.subscribe('populationBand', syncCustomPopulationVisibility);
       State.subscribe('populationMin', value => syncPopulationInput(inputPopMin, value));
       State.subscribe('populationMax', value => syncPopulationInput(inputPopMax, value));
     })();

     // --- INIT ---
    function init() {
      const validation = validateGeoData();
      State.set('dataErrorMessage', validation.message);
      State.set('dataError', !validation.valid);
      if (validation.valid) {
        // A rotina mensal deve chamar window.runProgramTotalsDryRun(expectedTotals) antes de substituir os dados.
        validateProgramTotalsDryRun(geojsonData);
      }
      State.init();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
