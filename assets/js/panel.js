import { geojsonData } from './data.js';
import { fmtPtbrInt, fmtPtbrNum, PROGRAMAS, PLES_COLUMN_LABELS, PALETAS, MAX_VALUES, State, Utils, MetricSelectors, DataSelectors } from './core.js';
import { MapModule } from './map.js';
      const PanelModule = (function() {
          const panel = document.getElementById('side-panel'), closeBtn = document.getElementById('btn-close-panel'), centerBtn = document.getElementById('btn-center-city'), centerCityStatus = document.getElementById('center-city-status'), cityNameEl = document.getElementById('panel-city-name'), gridMain = document.getElementById('panel-grid-main'), chartTitle = document.getElementById('chart-title'), chartCanvas = document.getElementById('comparison-chart'), chartContainer = document.getElementById('chart-container'), pobChartModeToggle = document.getElementById('pob-chart-mode-toggle'), pobGoiasBtn = document.getElementById('pob-chart-goias'), pobCompara2019Btn = document.getElementById('pob-chart-comparativo-2019'), povertyPieSection = document.getElementById('panel-poverty-pie-section'), povertyPieCanvas = document.getElementById('poverty-pie-chart'), radarSection = document.getElementById('panel-radar-section'), radarCanvas = document.getElementById('program-comparison-chart'), radarContainer = document.getElementById('radar-container'), radarExpandBtn = document.getElementById('btn-radar-expand'), radarDialog = document.getElementById('radar-dialog'), radarDialogCloseBtn = document.getElementById('btn-close-radar'), radarDialogTitle = document.getElementById('radar-dialog-title'), radarDialogContext = document.getElementById('radar-dialog-context'), radarExpandedContainer = document.getElementById('radar-expanded-container');
        const panelSubtitle = document.getElementById('panel-subtitle'), openPanelBtn = document.getElementById('btn-open-panel'), collapsedLabel = document.getElementById('collapsed-panel-label'), collapsedSelectedIndicator = document.getElementById('collapsed-selected-indicator'), collapsedPopulation = document.getElementById('collapsed-population'), collapsedIndicatorCount = document.getElementById('collapsed-indicator-count'), collapsedIndicatorPercent = document.getElementById('collapsed-indicator-percent'), rankingHighButton = document.getElementById('panel-ranking-high'), rankingLowButton = document.getElementById('panel-ranking-low'), overviewSection = document.getElementById('panel-overview-section'), overviewGrid = document.getElementById('panel-overview-grid'), overviewRanking = document.getElementById('panel-overview-ranking'), overviewRankingTitle = document.getElementById('panel-overview-ranking-title'), cityDetails = document.getElementById('panel-city-details');
        
         let chartInstance = null, chartType = null, chartContext = null, povertyPieChartInstance = null, radarChartInstance = null, chartFrame = null, radarDialogOpen = false, isPanelCollapsed = false, overviewRankDirection = 'high';

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const safeHtml = (strings, ...values) => strings.reduce((html, part, index) => html + part + (index < values.length
          ? String(values[index] ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])) : ''), '');

        function prepareChart(canvas, config, title) {
          const color = State.get('isDark') ? '#e2e8f0' : '#334155';
          config.options.color = color;
          if (reducedMotion.matches) config.options.animation = false;
          Object.values(config.options.scales || {}).forEach(scale => {
            scale.ticks = { ...scale.ticks, color };
            if (scale.title) scale.title.color = color;
            if (scale.pointLabels) scale.pointLabels.color = color;
            if (scale.grid) scale.grid.color = State.get('isDark') ? 'rgba(148,163,184,.25)' : 'rgba(100,116,139,.2)';
          });
          const legend = config.options.plugins?.legend;
          if (legend) legend.labels = { ...legend.labels, color };
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', title);
        }

        function getRadarContext(state) {
          // PLES never inherits status/metric controls that are hidden in its mode.
          const radarState = state.progPrograma === 'PLES'
            ? { ...state, progPrograma: 'TODS', progStatus: 'Ativo', progMetrica: 'Beneficios' } : state;
          const plesKey = state.progPrograma === 'PLES' ? MetricSelectors.get({ ...state, activeTab: 'prog' }).key : 'PLES_Ativo_Beneficios';
          const metric = MetricSelectors.get({ ...radarState, activeTab: 'prog' });
          const label = `${metric.label}. PLES: ${PLES_COLUMN_LABELS[plesKey] || plesKey} (${plesKey}).`;
          return { radarState, plesKey, metric, label };
        }

        function getSelectedIndicatorLabel(state, metric) {
          if (state.activeTab !== 'prog') return metric.label;
          return `${PROGRAMAS[state.progPrograma] || 'Programas Sociais'} · ${metric.label}`;
        }

        function updateCollapsedPanelLabel(city, state) {
          const metric = MetricSelectors.get(state);
          const features = city ? [{ properties: city }] : DataSelectors.getFilteredFeatures(state);
          const totals = DataSelectors.getTotals(features, metric);
          const population = metric.aggregateDenominator(totals);
          const isPbfDiff = state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === 'diff';
          const percentage = totals.metricCount && population > 0 ? (totals.totalMetric / population) * 100 : null;
          const indicatorValue = isPbfDiff ? DataSelectors.getPbfVariation(features) : percentage;
          const selectedIndicator = getSelectedIndicatorLabel(state, metric);
          collapsedLabel.textContent = city ? city.name : selectedIndicator;
          collapsedLabel.title = collapsedLabel.textContent;
          collapsedSelectedIndicator.textContent = city ? selectedIndicator : '';
          collapsedSelectedIndicator.title = selectedIndicator;
          collapsedSelectedIndicator.classList.toggle('hidden', !city);
          collapsedPopulation.textContent = `População: ${fmtPtbrInt(totals.scopePopulation)}`;
          collapsedPopulation.title = collapsedPopulation.textContent;
          collapsedIndicatorCount.textContent = totals.metricCount ? fmtPtbrInt(totals.totalMetric) : 'Sem dados';
          collapsedIndicatorCount.title = `Contagem geral do indicador: ${collapsedIndicatorCount.textContent}`;
          collapsedIndicatorPercent.textContent = indicatorValue === null
            ? 'Sem dados'
            : isPbfDiff ? metric.formatDisplay(indicatorValue) : Utils.fmtPtbrPct(indicatorValue);
          collapsedIndicatorPercent.title = `${isPbfDiff ? 'Variação do indicador' : 'Percentual do indicador'}: ${collapsedIndicatorPercent.textContent}`;
        }

        function syncOverviewRankingToggle() {
          [[rankingHighButton, 'high'], [rankingLowButton, 'low']].forEach(([button, direction]) => {
            const isActive = overviewRankDirection === direction;
            button.setAttribute('aria-pressed', String(isActive));
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('dark:bg-slate-900', isActive);
            button.classList.toggle('shadow', isActive);
            button.classList.toggle('text-emerald-600', isActive);
            button.classList.toggle('dark:text-emerald-400', isActive);
            button.classList.toggle('text-slate-500', !isActive);
            button.classList.toggle('dark:text-slate-400', !isActive);
          });
        }

        function setOverviewRankingDirection(direction) {
          overviewRankDirection = direction;
          syncOverviewRankingToggle();
          if (!State.get('selectedCity')) renderOverview(State.getState());
        }

        function renderOverview(state) {
          const features = DataSelectors.getFilteredFeatures(state);
          const metric = MetricSelectors.get(state);
          const totals = DataSelectors.getTotals(features, metric);
          const denominator = metric.aggregateDenominator(totals);
          const selectedProgram = PROGRAMAS[state.progPrograma] || 'Programas Sociais';
          const isPbfDiff = state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === 'diff';
          const percentageValue = totals.metricCount && denominator > 0 ? (totals.totalMetric / denominator) * 100 : null;
          const indicatorValue = isPbfDiff ? DataSelectors.getPbfVariation(features) : percentageValue;
          cityNameEl.textContent = 'Goiás';
          const scope = features.length === geojsonData.features.length
            ? `${fmtPtbrInt(features.length)} municípios`
            : `${fmtPtbrInt(features.length)} de ${fmtPtbrInt(geojsonData.features.length)} municípios`;
          panelSubtitle.textContent = state.activeTab === 'prog' ? `${selectedProgram} · ${scope}` : scope;

          const makeCard = (label, value, detail) => {
            const card = document.createElement('div');
            card.className = 'overview-card';
            const labelElement = document.createElement('span');
            labelElement.textContent = label;
            const valueElement = document.createElement('strong');
            valueElement.textContent = value;
            card.append(labelElement, valueElement);
            if (detail) {
              const detailElement = document.createElement('span');
              detailElement.className = 'mt-1';
              detailElement.textContent = detail;
              card.appendChild(detailElement);
            }
            return card;
          };
          overviewGrid.replaceChildren(
            makeCard('População', fmtPtbrInt(totals.scopePopulation)),
            makeCard('Quantidade absoluta', totals.metricCount ? fmtPtbrInt(totals.totalMetric) : 'Sem dados', isPbfDiff ? 'Total do PBF em 2026' : metric.label),
            makeCard(isPbfDiff ? 'Variação do indicador' : 'Percentual do indicador', indicatorValue === null ? 'Sem dados' : isPbfDiff ? metric.formatDisplay(indicatorValue) : Utils.fmtPtbrPct(indicatorValue))
          );

          const isRankingHigh = overviewRankDirection === 'high';
          overviewRankingTitle.textContent = isPbfDiff ? 'Variação (p.p.)' : 'Valores do indicador';
          const ranked = features.map(feature => {
            const properties = feature.properties;
            const value = metric.displayValue(properties);
            return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : { name: properties.name, value: Number(value), properties };
          }).filter(Boolean).sort((a, b) => isRankingHigh ? b.value - a.value : a.value - b.value).slice(0, 5);
          if (!ranked.length) {
            const empty = document.createElement('p');
            empty.className = 'text-xs text-slate-400 dark:text-slate-500';
            empty.textContent = 'Não há valores válidos no recorte atual.';
            overviewRanking.replaceChildren(empty);
            return;
          }
          const maximum = Math.max(...ranked.map(row => Math.abs(row.value)), 0.0001);
          overviewRanking.replaceChildren(...ranked.map(row => {
            const item = document.createElement('div');
            const name = document.createElement('button');
            name.type = 'button';
            name.className = 'overview-rank-name';
            name.textContent = row.name;
            name.title = row.name;
            name.setAttribute('aria-label', `Exibir ${row.name} no mapa`);
            name.addEventListener('click', () => {
              if (State.get('viewMode') !== 'mapa') State.set('viewMode', 'mapa');
              State.set('selectedCity', row.properties);
              window.requestAnimationFrame(() => window.requestAnimationFrame(() => MapModule.centerOnCity(row.properties)));
            });
            const value = document.createElement('strong');
            value.className = 'overview-rank-value';
            value.textContent = metric.formatDisplay(row.value);
            const track = document.createElement('span');
            track.className = 'overview-rank-track';
            const bar = document.createElement('i');
            bar.style.width = `${Math.max(1, Math.min(100, Math.abs(row.value) / maximum * 100))}%`;
            if (isPbfDiff) bar.style.background = row.value > 0 ? '#f43f5e' : '#10b981';
            track.appendChild(bar);
            item.append(name, value, track);
            return item;
          }));
        }

        function destroyComparisonChart() {
          if (chartInstance) chartInstance.destroy();
          chartInstance = null;
          chartType = null;
          chartContext = null;
        }

        function moveRadarCanvas(target) {
          if (!target || !radarCanvas || radarCanvas.parentElement === target) return;
          target.appendChild(radarCanvas);
          window.requestAnimationFrame(() => radarChartInstance?.resize());
        }

         function updateRadarDialogContent(city, state) {
           if (!city || !radarDialogTitle || !radarDialogContext) return;
            const { label } = getRadarContext(state);
          radarDialogTitle.textContent = `Composição dos Programas Sociais - ${city.name}`;
           radarDialogContext.textContent = `${label} Visualização ampliada do município selecionado.`;
        }

        function setRadarDialog(isOpen) {
          if (!radarDialog) return;
          if (isOpen && !State.get('selectedCity')) return;
          if (radarDialogOpen === isOpen) return;

          radarDialogOpen = isOpen;
          radarDialog.classList.toggle('hidden', !isOpen);
          radarDialog.classList.toggle('flex', isOpen);
          radarDialog.setAttribute('aria-hidden', String(!isOpen));
          radarExpandBtn.setAttribute('aria-expanded', String(isOpen));

          if (isOpen) {
            moveRadarCanvas(radarExpandedContainer);
            window.requestAnimationFrame(() => radarDialogCloseBtn.focus());
          } else {
            const shouldReturnFocus = radarDialog.contains(document.activeElement);
            moveRadarCanvas(radarContainer);
            if (shouldReturnFocus) window.requestAnimationFrame(() => radarExpandBtn.focus());
          }
        }

        function syncPovertyChartControls(state) {
          const isPbfCompare = state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2';
          if (pobChartModeToggle) pobChartModeToggle.classList.toggle('hidden', !isPbfCompare);
          chartTitle.textContent = 'Comparativo com Goiás';
          if (!isPbfCompare) return;
          chartTitle.textContent = 'Comparativo';
          const isGoiasMode = state.pobChartMode !== 'comparativo2019';
          [
            [pobGoiasBtn, isGoiasMode],
            [pobCompara2019Btn, !isGoiasMode]
          ].forEach(([button, active]) => {
            if (!button) return;
            button.classList.toggle('bg-white', active);
            button.classList.toggle('dark:bg-slate-900', active);
            button.classList.toggle('shadow', active);
            button.classList.toggle('text-emerald-600', active);
            button.classList.toggle('dark:text-emerald-400', active);
            button.classList.toggle('text-slate-500', !active);
            button.classList.toggle('dark:text-slate-400', !active);
            button.setAttribute('aria-pressed', String(active));
          });
        }

        function renderPanel(city) {
            if (chartFrame !== null) {
              cancelAnimationFrame(chartFrame);
              chartFrame = null;
            }
            const state = State.getState(), activeTab = state.activeTab;
            const showPovertyPie = activeTab === 'pob' && !(state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === '2019');
            panel.classList.remove('hidden');
            panel.classList.toggle('is-collapsed', isPanelCollapsed);
            closeBtn.setAttribute('aria-expanded', String(!isPanelCollapsed));
            closeBtn.setAttribute('aria-label', isPanelCollapsed ? 'Painel de informações recolhido' : 'Recolher painel de informações');
            closeBtn.title = isPanelCollapsed ? 'Painel recolhido' : 'Recolher painel';
            openPanelBtn.setAttribute('aria-expanded', String(!isPanelCollapsed));
            povertyPieSection.classList.toggle('hidden', !showPovertyPie);
            radarSection.classList.toggle('hidden', activeTab !== 'prog');
            if (activeTab !== 'prog') setRadarDialog(false);
            syncPovertyChartControls(state);
            updateCollapsedPanelLabel(city, state);
            centerBtn.classList.toggle('hidden', !city);
            centerBtn.classList.toggle('flex', Boolean(city));
            centerCityStatus.classList.toggle('hidden', !city);
            overviewSection.classList.toggle('hidden', Boolean(city));
            cityDetails.classList.toggle('hidden', !city);
            requestAnimationFrame(MapModule.adjustMapControlsPosition);
            if (!city) {
              setRadarDialog(false);
               if (povertyPieChartInstance) { povertyPieChartInstance.destroy(); povertyPieChartInstance = null; }
               destroyComparisonChart();
               if (radarChartInstance) { radarChartInstance.destroy(); radarChartInstance = null; }
                 renderOverview(state);
               return;
           }
        
        const metric = MetricSelectors.get(state);
          const maxVal = Utils.getCriticityMax(state);

          cityNameEl.textContent = city.name;
          panelSubtitle.textContent = city.id ? String(city.id) : 'Código IBGE indisponível';
          centerBtn.title = `Centralizar ${city.name} no mapa`;
          if (activeTab === 'prog') updateRadarDialogContent(city, state);
         const status = metric.getStatus(city, maxVal);
         centerCityStatus.textContent = status.label;
         centerCityStatus.className = `mt-1 inline-flex w-fit shrink-0 self-start rounded-full border border-transparent px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${status.color}`;
         centerBtn.setAttribute('aria-label', `Localizar ${city.name}, código ${city.id || 'indisponível'}, status ${status.label}, no mapa`);
        
          // Cards para pobreza; Pobreza PBF exibe os dois anos e a variação em p.p.
          if (activeTab === 'pob') {
            const maxPobVal = MAX_VALUES.pob;
            if (state.pobIndicator === 'norm_pob_p1_p2') {
              const pbf2019Pct = Utils.calcPbfPercentual(city, '2019');
              const pbf2026Pct = Utils.calcPbfPercentual(city, '2026');
              const pbfVariation = Utils.getPbfVariacao2026x2019(city);
              const populationLabel = state.pobPbfAno === '2019'
                ? 'População 2019'
                : state.pobPbfAno === 'diff'
                  ? 'População 2019 / 2026'
                  : 'População 2026';
              const populationValue = state.pobPbfAno === 'diff'
                ? `${fmtPtbrInt(city.população_2019)} / ${fmtPtbrInt(city.população)}`
                : fmtPtbrInt(Utils.getPbfPopulation(city, state.pobPbfAno));
              const pbfVariationLabel = pbfVariation === null
                ? '-'
                : `${pbfVariation > 0 ? '+' : ''}${fmtPtbrNum(pbfVariation)} p.p.`;
              const pbfVariationColor = pbfVariation === null
                ? 'text-slate-400'
                : pbfVariation > 0
                  ? 'text-rose-500 font-black'
                  : pbfVariation < 0
                    ? 'text-emerald-600 font-black'
                    : 'text-slate-600 dark:text-slate-400';
              const pbf2019Color = Utils.getSignalTextColorClass(city.norm_PBF_2019, maxPobVal);
              const pbf2026Color = Utils.getSignalTextColorClass(city.norm_pob_p1_p2, maxPobVal);

              gridMain.innerHTML = safeHtml`
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">${populationLabel}</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${populationValue}</strong>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Diferença 2026-2019</span>
                  <strong class="text-base ${pbfVariationColor}">${pbfVariationLabel}</strong>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Pobreza PBF 2019</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.PBF_2019)}</strong>
                  <span class="text-xs block ${pbf2019Color} font-semibold mt-0.5">(${Utils.fmtPtbrPct(pbf2019Pct)})</span>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Pobreza PBF 2026</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.pob_p1_p2)}</strong>
                  <span class="text-xs block ${pbf2026Color} font-semibold mt-0.5">(${Utils.fmtPtbrPct(pbf2026Pct)})</span>
                </div>
              `;
            } else {
              const corExt = Utils.getSignalTextColorClass(city.norm_ext, maxPobVal);
              const corPob = Utils.getSignalTextColorClass(city.norm_pob, maxPobVal);
              const corPbf = Utils.getSignalTextColorClass(city.norm_pob_p1_p2, maxPobVal);

              gridMain.innerHTML = safeHtml`
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">População</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.população)}</strong>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Extrema Pobreza</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.ext_pob)}</strong>
                  <span class="text-xs block ${corExt} font-semibold mt-0.5">(${Utils.fmtPtbrPct(Utils.calcPctExtPob(city))})</span>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Pobreza</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.pob)}</strong>
                  <span class="text-xs block ${corPob} font-semibold mt-0.5">(${Utils.fmtPtbrPct(Utils.calcPctPob(city))})</span>
                </div>
                <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Pobreza PBF</span>
                  <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.pob_p1_p2)}</strong>
                  <span class="text-xs block ${corPbf} font-semibold mt-0.5">(${Utils.fmtPtbrPct(Utils.calcPctPobP1P2(city))})</span>
                </div>
              `;
            }
          
          } else {
           // Cards para Programas Sociais GO
           if (state.progPrograma === 'PLES') {
             const plesValue = metric.rawValue(city);
             const plesLabel = PLES_COLUMN_LABELS[metric.key] || 'Passe Livre Estudantil';
              gridMain.innerHTML = safeHtml`
               <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 text-center">
                 <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">População</span>
                 <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.população)}</strong>
               </div>
               <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 text-center">
                 <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">${plesLabel}</span>
                 <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(plesValue)}</strong>
                 <span class="text-xs block text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">${Utils.fmtPtbrPct(Utils.calcPctSeguro(plesValue, city.população))} pop. mun.</span>
               </div>
             `;
           } else {
              const progBeneficios = city[Utils.getProgKey(state.progPrograma, state.progStatus, 'Beneficios')];
              const progPessoas = city[Utils.getProgKey(state.progPrograma, state.progStatus, 'Pessoas')];

             gridMain.innerHTML = safeHtml`
               <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 text-center">
                 <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">População</span>
                 <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(city.população)}</strong>
               </div>
               <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 text-center">
                 <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Benefícios (${state.progStatus})</span>
                 <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(progBeneficios)}</strong>
                 <span class="text-xs block text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">${Utils.fmtPtbrPct(Utils.calcPctSeguro(progBeneficios, city.população))} pop. mun.</span>
               </div>
               <div class="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 text-center">
                 <span class="text-xs text-slate-500 dark:text-slate-400 block mb-1">Pessoas (${state.progStatus})</span>
                 <strong class="text-base text-slate-800 dark:text-slate-200">${fmtPtbrInt(progPessoas)}</strong>
                 <span class="text-xs block text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">${Utils.fmtPtbrPct(Utils.calcPctSeguro(progPessoas, city.população))} pop. mun.</span>
               </div>
             `;
           }
          
         }

          // Wait for layout; collapsed parents cannot provide usable chart dimensions.
          if (!isPanelCollapsed && !state.isKiosk) chartFrame = requestAnimationFrame(() => {
            chartFrame = null;
            if (chartContainer.clientWidth <= 0 || chartContainer.clientHeight <= 0) return;
            renderChart(city, metric, activeTab, maxVal);
            if (showPovertyPie) {
              renderPovertyPieChart(city);
            } else if (povertyPieChartInstance) {
              povertyPieChartInstance.destroy();
              povertyPieChartInstance = null;
            }
            if (activeTab === 'prog') renderRadarChart(city, state);
          });
        }

        function renderChartConfig(config) {
          prepareChart(chartCanvas, config, `${chartTitle.textContent} - ${cityNameEl.textContent}`);
         if (chartInstance && chartType !== config.type) destroyComparisonChart();
          if (chartInstance) {
            chartInstance.resize();
            chartInstance.data = config.data;
           chartInstance.options = config.options;
           chartInstance.update();
         } else {
           chartInstance = new Chart(chartCanvas, config);
         }
         chartType = config.type;
       }

         // Pobreza PBF: barras comparando o percentual municipal de 2026 com o de 2019.
       function renderPbfComparativo2019Chart(city, state) {
         if (chartContainer) chartContainer.style.height = '220px';
         const v2026 = Utils.calcPbfPercentual(city, '2026');
         const v2019 = Utils.calcPbfPercentual(city, '2019');
         const data = [v2026, v2019];
         const numericData = data.filter(value => value !== null && !isNaN(value));
         const dataMax = numericData.length ? Math.max(...numericData) : 0;
         const palette = chroma.scale(PALETAS[State.get('pobPalette')]).domain([0, MAX_VALUES.pob]);
          renderChartConfig({
           type: 'bar',
           data: {
             labels: ['2026', '2019'],
             datasets: [{
               label: '% Pobreza PBF / População Municipal',
               data,
               backgroundColor: [palette(v2026 === null ? 0 : v2026 / 100).hex(), '#94a3b8'],
               borderRadius: 6,
               barThickness: 40,
               maxBarThickness: 50
             }]
           },
            options: {
              indexAxis: 'y', responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', axis: 'y', intersect: false },
              plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', axis: 'y', intersect: false, callbacks: { label: ctx => `${ctx.label}: ${Utils.fmtPtbrPct(ctx.raw)}` } } },
             scales: {
               x: { beginAtZero: true, max: Math.max(dataMax * 1.2, 10), title: { display: true, text: '% da População Municipal', font: { size: 12, weight: 'bold' } }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: value => Utils.fmtPtbrPct(value), font: { size: 11 } } },
               y: { grid: { display: false }, ticks: { font: { size: 12, weight: 'bold' } } }
             },
             animation: { duration: 500, easing: 'easeOutQuart' }
           }
         });
       }

     // GRAFICO COMPARATIVO ADAPTADO PARA PROG
         function renderChart(city, metric, activeTab, maxVal) {
          const state = State.getState();
            const nextChartContext = activeTab === 'pob'
              ? `pob:${state.pobIndicator}:${state.pobPbfAno}:${state.pobChartMode === 'comparativo2019' ? 'comparativo2019' : 'goias'}`
             : activeTab;
         if (chartInstance && chartContext !== nextChartContext) destroyComparisonChart();
          if (activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' && state.pobChartMode === 'comparativo2019') {
            renderPbfComparativo2019Chart(city, state);
            chartContext = nextChartContext;
            return;
          }
          if (chartContainer) chartContainer.style.height = '220px';
         const isProgramTab = activeTab === 'prog';
         const isRelativeProgramMetric = state.progMetricaModo === 'percentual';
         const baseProgramMetric = state.progMetrica;
         const programMetricLabel = state.progPrograma === 'PLES'
           ? (PLES_COLUMN_LABELS[metric.key] || 'Passe Livre Estudantil')
            : ({ Beneficios: 'Benefícios', Pessoas: 'Pessoas' }[baseProgramMetric]);
         const totals = DataSelectors.getTotals(geojsonData.features, metric);
          const isPbfDiff = activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === 'diff';
          const cityValue = isPbfDiff ? Utils.getPbfVariacao2026x2019(city) : metric.displayValue(city);
         const aggregateDenominator = metric.aggregateDenominator(totals);
          const stateValue = isPbfDiff
             ? DataSelectors.getPbfVariation(geojsonData.features)
             : totals.metricCount === 0 ? null : isProgramTab
           ? (isRelativeProgramMetric
             ? (aggregateDenominator > 0 ? (totals.totalMetric / aggregateDenominator) * 100 : null)
             : totals.totalMetric)
            : metric.unit === '%'
              ? (aggregateDenominator > 0 ? (totals.totalMetric / aggregateDenominator) * 100 : null)
              : totals.totalMetric;
          const indicatorLabel = isProgramTab
            ? (state.progPrograma === 'PLES'
              ? metric.label
              : isRelativeProgramMetric
                ? `% ${programMetricLabel} / População (${state.progStatus})`
                : `${programMetricLabel} (${state.progStatus})`)
            : metric.label;
          const formatChartValue = isProgramTab && isRelativeProgramMetric ? Utils.fmtPtbrPct : isProgramTab ? fmtPtbrInt : metric.formatDisplay;
        const cityValColorTarget = metric.statusValue(city);
        const colors = [chroma.scale(PALETAS[activeTab === 'pob' ? State.get('pobPalette') : State.get('progPalette')]).domain([0, maxVal])(cityValColorTarget).hex(), '#64748b'];
        
          const labels = [city.name, 'Estado de Goiás'], data = [cityValue, stateValue];
         const numericData = data.filter(value => value !== null && value !== undefined && !isNaN(value));
         const dataMax = numericData.length ? Math.max(...numericData) : 0;
         const config = {
          type: 'bar',
          data: { labels, datasets: [{ label: indicatorLabel, data, backgroundColor: colors, borderRadius: 6, barThickness: 40, maxBarThickness: 50 }] },
           options: {
             indexAxis: 'y', responsive: true, maintainAspectRatio: false,
             interaction: { mode: 'index', axis: 'y', intersect: false },
             plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', axis: 'y', intersect: false, callbacks: { label: ctx => `${ctx.dataset.label}: ${formatChartValue(ctx.raw)}` } } },
            scales: {
               x: { beginAtZero: true, max: Math.max(dataMax * 1.2, 10), title: { display: true, text: indicatorLabel, font: { size: 12, weight: 'bold' } }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
              y: { grid: { display: false }, ticks: { font: { size: 12, weight: 'bold' } } }
            },
            animation: { duration: 500, easing: 'easeOutQuart' }
          }
        };
          renderChartConfig(config);
         chartContext = nextChartContext;
       }

        function renderPovertyPieChart(city) {
          const values = [Utils.parseNum(city.ext_pob), Utils.parseNum(city.pob)];
         const total = values.reduce((sum, value) => sum + (value === null ? 0 : value), 0);
         const pieConfig = {
           type: 'pie',
           data: {
              labels: ['Extrema pobreza', 'Pobreza'],
             datasets: [{
               data: values,
                backgroundColor: ['#1b7b42', '#9fd8a6'],
               borderColor: State.get('isDark') ? '#1e293b' : '#ffffff',
               borderWidth: 0,
               hoverOffset: 6
             }]
           },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'nearest', intersect: false },
              plugins: {
               legend: {
                 display: true,
                 position: 'bottom',
                 labels: { font: { size: 12, weight: 'bold' }, padding: 16 }
                },
                tooltip: {
                  enabled: true,
                  mode: 'nearest',
                  intersect: false,
                  callbacks: {
                   label: context => {
                     if (context.raw === null || context.raw === undefined) return `${context.label}: Sem dados`;
                     const value = Number(context.raw);
                     const percentage = total > 0 ? (value / total) * 100 : 0;
                     return `${context.label}: ${fmtPtbrInt(value)} (${fmtPtbrNum(percentage)}%)`;
                   }
                 }
               }
             },
             animation: { duration: 500, easing: 'easeOutQuart' }
           }
         };
          prepareChart(povertyPieCanvas, pieConfig, `Composição da pobreza PBF - ${city.name}`);
          if (povertyPieChartInstance) {
            povertyPieChartInstance.resize();
           povertyPieChartInstance.data = pieConfig.data;
           povertyPieChartInstance.options = pieConfig.options;
           povertyPieChartInstance.update();
          } else {
            povertyPieChartInstance = new Chart(povertyPieCanvas, pieConfig);
          }
        }

        const radarLabelTooltipPlugin = {
          id: 'radar-label-tooltip',
          afterEvent(chart, args) {
            const event = args.event;
            if (event.type === 'mouseout') {
              if (chart.$radarLabelTooltip) {
                chart.$radarLabelTooltip = null;
                args.changed = true;
              }
              return;
            }
            if (event.type !== 'mousemove') return;

            const scale = chart.scales.r;
            const labels = chart.data.labels || [];
            if (!scale || !labels.length) return;

            const pointLabelOptions = scale.options.pointLabels || {};
            const fontSize = typeof pointLabelOptions.font?.size === 'number' ? pointLabelOptions.font.size : 12;
            const labelRadius = scale.drawingArea + (pointLabelOptions.padding || 5) + fontSize;
            const hitRadius = Math.max(22, fontSize + 10);
            let hoveredIndex = -1;

            labels.some((label, index) => {
              const position = scale.getPointPosition(index, labelRadius);
              const distance = Math.hypot(event.x - position.x, event.y - position.y);
              if (distance <= hitRadius) {
                hoveredIndex = index;
                return true;
              }
              return false;
            });

            const previous = chart.$radarLabelTooltip;
            const next = hoveredIndex === -1 ? null : { index: hoveredIndex, x: event.x, y: event.y };
            const changed = !previous || !next
              ? previous !== next
              : previous.index !== next.index || previous.x !== next.x || previous.y !== next.y;

            if (changed) {
              chart.$radarLabelTooltip = next;
              args.changed = true;
            }
          },
          afterDraw(chart) {
            const tooltip = chart.$radarLabelTooltip;
            if (!tooltip) return;

            const labelKey = chart.data.labels && chart.data.labels[tooltip.index];
            const fullName = PROGRAMAS[labelKey] || labelKey;
            if (!fullName) return;

            const ctx = chart.ctx;
            const paddingX = 10;
            const paddingY = 7;
            const lineHeight = 15;
            const maxTextWidth = Math.min(260, chart.width - (paddingX * 2) - 8);
            const words = fullName.split(' ');
            const lines = [];
            let currentLine = '';

            ctx.save();
            ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
            words.forEach(word => {
              const candidate = currentLine ? `${currentLine} ${word}` : word;
              if (currentLine && ctx.measureText(candidate).width > maxTextWidth) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = candidate;
              }
            });
            if (currentLine) lines.push(currentLine);

            const textWidth = Math.min(maxTextWidth, Math.max(...lines.map(line => ctx.measureText(line).width)));
            const boxWidth = textWidth + (paddingX * 2);
            const boxHeight = (lines.length * lineHeight) + (paddingY * 2) - 2;
            let boxX = tooltip.x + 12;
            let boxY = tooltip.y - boxHeight - 12;
            if (boxX + boxWidth > chart.width - 4) boxX = chart.width - boxWidth - 4;
            if (boxX < 4) boxX = 4;
            if (boxY < 4) boxY = tooltip.y + 12;
            if (boxY + boxHeight > chart.height - 4) boxY = chart.height - boxHeight - 4;

            const isDark = State.get('isDark');
            const radius = 7;
            ctx.beginPath();
            ctx.moveTo(boxX + radius, boxY);
            ctx.lineTo(boxX + boxWidth - radius, boxY);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
            ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
            ctx.lineTo(boxX + radius, boxY + boxHeight);
            ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
            ctx.lineTo(boxX, boxY + radius);
            ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
            ctx.closePath();
            ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
            ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1';
            ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.stroke();
            ctx.fillStyle = isDark ? '#f8fafc' : '#1e293b';
            lines.forEach((line, index) => ctx.fillText(line, boxX + paddingX, boxY + paddingY + lineHeight * (index + 0.8)));
            ctx.restore();
          }
        };

        function renderRadarChart(city, state) {
        const { radarState, plesKey, metric, label } = getRadarContext(state);
        const isRelative = state.progMetricaModo === 'percentual';
        const baseMetric = radarState.progMetrica;
        const labels = Object.keys(PROGRAMAS).filter(programa => programa !== 'TODS');
        const data = labels.map(programa => {
          const programKey = programa === 'PLES' ? plesKey : Utils.getProgKey(programa, radarState.progStatus, baseMetric);
          const rawValue = programa === 'PLES'
            ? Utils.getPlesColumnValue(city, programKey)
            : city[programKey];
          if (rawValue === null || rawValue === undefined) return null;
          const numericValue = Number(rawValue);
          if (!Number.isFinite(numericValue)) return null;
           return isRelative ? Utils.calcPctSeguro(numericValue, city.população) : numericValue;
        });
        const validValues = data.filter(value => value !== null);
        const maxValue = validValues.length ? Math.max(...validValues) : 0;
        const scaleMax = maxValue > 0 ? maxValue * 1.15 : 1;
        const radarConfig = {
          type: 'radar',
          data: {
            labels,
            datasets: [{
              label,
              data,
              backgroundColor: 'rgba(16, 185, 129, 0.22)',
              borderColor: '#10b981',
              pointBackgroundColor: '#10b981',
              pointBorderColor: '#ffffff',
              pointHoverBackgroundColor: '#ffffff',
              pointHoverBorderColor: '#10b981',
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointHitRadius: 18
            }]
          },
           plugins: [radarLabelTooltipPlugin],
           options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { enabled: true, mode: 'nearest', intersect: false, callbacks: { label: ctx => `${ctx.label}: ${metric.formatDisplay(ctx.raw)}` } }
            },
            scales: {
              r: {
                beginAtZero: true,
                max: scaleMax,
                ticks: {
                  backdropColor: 'transparent',
                  callback: value => metric.formatDisplay(value),
                  font: { size: 10 }
                },
                pointLabels: { font: { size: 11, weight: 'bold' } },
                grid: { color: 'rgba(100, 116, 139, 0.25)' },
                angleLines: { color: 'rgba(100, 116, 139, 0.25)' }
              }
            },
            animation: { duration: 500, easing: 'easeOutQuart' }
          }
         };
           prepareChart(radarCanvas, radarConfig, `Composição dos programas sociais - ${city.name}`);
           if (radarChartInstance) {
            radarChartInstance.resize();
           radarChartInstance.$radarLabelTooltip = null;
           radarChartInstance.data = radarConfig.data;
          radarChartInstance.options = radarConfig.options;
          radarChartInstance.update();
         } else {
           radarChartInstance = new Chart(radarCanvas, radarConfig);
         }
        }

        if (pobGoiasBtn) pobGoiasBtn.addEventListener('click', () => State.set('pobChartMode', 'goias'));
        if (pobCompara2019Btn) pobCompara2019Btn.addEventListener('click', () => State.set('pobChartMode', 'comparativo2019'));
        rankingHighButton.addEventListener('click', () => setOverviewRankingDirection('high'));
        rankingLowButton.addEventListener('click', () => setOverviewRankingDirection('low'));
        radarExpandBtn.addEventListener('click', () => setRadarDialog(true));
        radarDialogCloseBtn.addEventListener('click', () => setRadarDialog(false));
        radarDialog.addEventListener('click', event => { if (event.target === radarDialog) setRadarDialog(false); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && radarDialogOpen) setRadarDialog(false); });
        closeBtn.addEventListener('click', () => {
          isPanelCollapsed = true;
          renderPanel(State.get('selectedCity'));
          window.dispatchEvent(new Event('resize'));
          openPanelBtn.focus();
        });
        openPanelBtn.addEventListener('click', () => {
          isPanelCollapsed = false;
          renderPanel(State.get('selectedCity'));
          window.dispatchEvent(new Event('resize'));
          closeBtn.focus();
        });
        centerBtn.addEventListener('click', () => MapModule.centerOnCity(State.get('selectedCity')));
        const refreshPanel = () => renderPanel(State.get('selectedCity'));
        let previousSelectedCity = State.get('selectedCity');
        State.subscribe('selectedCity', city => {
          if (previousSelectedCity && !city) isPanelCollapsed = false;
          previousSelectedCity = city;
          refreshPanel();
        });
         State.subscribe('isKiosk', isKiosk => {
           isPanelCollapsed = isKiosk && Boolean(State.get('selectedCity'));
           renderPanel(State.get('selectedCity'));
           window.dispatchEvent(new Event('resize'));
         });
        State.subscribe('viewMode', refreshPanel);
        ['isDark', 'isKiosk', 'pobPalette', 'progPalette', 'activeTab', 'pobIndicator', 'pobPbfAno', 'pobChartMode', 'progPrograma', 'progStatus', 'progMetrica', 'progPlesMetrica', 'progMetricaModo', 'searchTerm', 'riskFilter', 'populationBand', 'populationMin', 'populationMax'].forEach(key => State.subscribe(key, refreshPanel));
        reducedMotion.addEventListener('change', refreshPanel);
        syncOverviewRankingToggle();
        refreshPanel();
      return { renderPanel };
    })();

export { PanelModule };
