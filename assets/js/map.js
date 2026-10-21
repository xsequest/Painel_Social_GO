import { geojsonData } from './data.js';
import { fmtPtbrInt, fmtPtbrNum, PLES_COLUMN_LABELS, PALETAS, State, Utils, MetricSelectors, DataSelectors } from './core.js';
    const MapModule = (function() {
        let map = null, geoJsonLayer = null, legendControl = null, legendElement = null, tileLayer = null, highlightedLayer = null, renderFrame = null, clickInMunicipality = false, fullStateBounds = null;
        const mapEl = document.getElementById('map'), containerEl = document.getElementById('map-container'), btnResetView = document.getElementById('btn-reset-view'), loadingOverlay = document.getElementById('map-loading-overlay'), mapControlsContainer = document.getElementById('map-controls-legend'), mapZoomControlHost = document.getElementById('map-zoom-control'), mapLegendHost = document.getElementById('map-legend-host'), mapAttributionHost = document.getElementById('map-attribution-host');
       function setLoading(isLoading) {
         if (!loadingOverlay) return;
         loadingOverlay.classList.toggle('hidden', !isLoading);
         loadingOverlay.classList.toggle('flex', isLoading);
         const mainMapArea = loadingOverlay.parentElement;
         if (mainMapArea) mainMapArea.setAttribute('aria-busy', String(isLoading));
       }
       // Escala do modo "Diff p.p. 2019": usa a paleta selecionada em "Paleta de Cores", com domínio simétrico [-teto, +teto].
       // Valores negativos ocupam o lado verde e valores positivos ocupam o lado vermelho da paleta.
       function getPbfDiffScale() {
         const diffs = typeof geojsonData !== 'undefined' && Array.isArray(geojsonData.features)
           ? geojsonData.features
               .map(feature => Utils.getPbfVariacao2026x2019(feature.properties))
               .filter(value => value !== null && !isNaN(value))
               .map(value => Math.abs(value))
           : [];
         const bound = Utils.getPercentileMax(diffs, 10);
         const paletteName = PALETAS[State.get('pobPalette')] ? State.get('pobPalette') : 'RdYlGn_r';
         return { bound, scale: chroma.scale(PALETAS[paletteName]).domain([-bound, bound]) };
        }
        function getPbfDiffColor(pbfDiff, value) {
          if (value === null || value === undefined || isNaN(value)) return '#cccccc';
          const difference = Number(value);
          if (Math.abs(difference) <= 2) return 'transparent';
          return pbfDiff.scale(difference).hex();
       }
       function getLayerElement(layer) {
         return (layer.getElement && layer.getElement()) || layer._path;
       }
        const keyboardPaths = new WeakSet();
        function escapeHtml(value) {
          return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
        }
        function setupKeyboardAccess(layer, properties, isVisible) {
          layer.isVisible = isVisible;
         const path = getLayerElement(layer);
         if (!path) return;
         path.setAttribute('tabindex', isVisible ? '0' : '-1');
         path.setAttribute('role', 'button');
         path.setAttribute('aria-label', `Selecionar município ${properties.name}`);
         path.setAttribute('aria-hidden', String(!isVisible));
          path.setAttribute('aria-pressed', String(isVisible && State.get('selectedCity')?.name === properties.name));
          if (keyboardPaths.has(path)) return;
          keyboardPaths.add(path);
         path.addEventListener('keydown', event => {
           if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
           event.preventDefault();
           event.stopPropagation();
            if (layer.isVisible) State.set('selectedCity', properties);
         });
       }
         function initMap() {
           if (map || !mapEl) return;
           map = L.map(mapEl, { zoomControl: false }).setView([-15.8, -49.8], 6);
           const zoomControl = L.control.zoom({ position: 'bottomright' }).addTo(map);
           mapZoomControlHost.append(zoomControl.getContainer());
           if (map.attributionControl) mapAttributionHost.append(map.attributionControl.getContainer());
           L.DomEvent.disableClickPropagation(mapControlsContainer);
           map.on('click', () => {
             if (clickInMunicipality) { clickInMunicipality = false; return; }
             if (State.get('selectedCity')) State.set('selectedCity', null);
           });
           updateTileLayer(State.get('isDark'));
         }
         function getFitBoundsOptions() {
           const mapBounds = mapEl.getBoundingClientRect();
           const sidebar = document.getElementById('sidebar');
           const sidePanel = document.getElementById('side-panel');
           const panelsVisible = !document.body.classList.contains('kiosk-mode');
           const sidebarBounds = sidebar && panelsVisible ? sidebar.getBoundingClientRect() : null;
           const panelBounds = sidePanel && !sidePanel.classList.contains('hidden') && panelsVisible ? sidePanel.getBoundingClientRect() : null;
           if (window.innerWidth <= 767) {
             return {
               paddingTopLeft: [16, sidebarBounds ? Math.max(16, sidebarBounds.bottom - mapBounds.top + 16) : 16],
               paddingBottomRight: [16, panelBounds ? Math.max(16, mapBounds.bottom - panelBounds.top + 16) : 16],
                maxZoom: State.get('isKiosk') ? 7 : 8,
                animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
             };
           }
            return { padding: [16, 16], maxZoom: State.get('isKiosk') ? 7 : 8, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches };
         }
         function getFullStateBounds() {
           if (fullStateBounds) return fullStateBounds;
            if (geoJsonLayer) fullStateBounds = geoJsonLayer.getBounds();
           return fullStateBounds;
         }
         function fitPresentation() {
           if (!map) return;
           if (State.get('viewMode') !== 'mapa') State.set('viewMode', 'mapa');
           requestAnimationFrame(() => requestAnimationFrame(() => {
             const bounds = getFullStateBounds();
             if (!bounds || !bounds.isValid()) return;
             map.stop();
             map.invalidateSize({ pan: false, debounceMoveend: true });
             map.fitBounds(bounds, { padding: [24, 24], maxZoom: 7, animate: false });
             adjustMapControlsPosition();
           }));
         }
         function refreshAfterPresentation() {
           if (!map) return;
           requestAnimationFrame(() => {
             map.invalidateSize({ pan: false, debounceMoveend: true });
             adjustMapControlsPosition();
           });
         }
         function adjustMapControlsPosition() {
           if (!mapControlsContainer) return;
           mapControlsContainer.style.removeProperty('right');
           mapControlsContainer.style.removeProperty('bottom');
           mapAttributionHost.style.removeProperty('right');
           mapAttributionHost.style.removeProperty('bottom');
           if (containerEl.classList.contains('hidden') || document.body.classList.contains('kiosk-mode')) return;
           const sidePanel = document.getElementById('side-panel');
           if (!sidePanel || sidePanel.classList.contains('hidden')) return;
           const panelBounds = sidePanel.getBoundingClientRect();
           if (window.innerWidth <= 767) {
             mapAttributionHost.style.bottom = `${Math.max(4, window.innerHeight - panelBounds.top + 4)}px`;
             const attributionHeight = mapAttributionHost.getBoundingClientRect().height || 16;
             mapControlsContainer.style.bottom = `${Math.max(16, window.innerHeight - panelBounds.top + attributionHeight + 12)}px`;
             return;
           }
           const controlsBounds = mapControlsContainer.getBoundingClientRect();
           const overlaps = controlsBounds.left < panelBounds.right
             && controlsBounds.right > panelBounds.left
             && controlsBounds.top < panelBounds.bottom
             && controlsBounds.bottom > panelBounds.top;
           if (!overlaps) return;
           mapControlsContainer.style.right = `${Math.max(16, window.innerWidth - panelBounds.left + 12)}px`;
         }
        function updateTileLayer(isDark) {
           if (!map) return;
           // Base neutra, sem a densidade visual do mapa padrão do OpenStreetMap e sem API key.
            if (!tileLayer) tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
              attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap'
           }).addTo(map);
          if (tileLayer.getContainer()) tileLayer.getContainer().style.filter = isDark ? 'brightness(0.6) contrast(0.6)' : 'none';
        }
        function updateLegend(legendTitle, metric, colorScale, colorMax) {
         if (!legendControl) {
           legendControl = L.control({ position: 'bottomright' });
            legendControl.onAdd = () => {
              legendElement = L.DomUtil.create('div', 'legend');
              L.DomEvent.disableClickPropagation(legendElement);
              return legendElement;
            };
              legendControl.addTo(map);
              mapLegendHost.append(legendControl.getContainer());
          }
           if (!legendElement) return;
           const state = State.getState();
            const isProgramTab = state.activeTab === 'prog';
            const hasMetricModeToggle = isProgramTab;
           // Pobreza PBF: alternância de ano (2019/2026) e modo Diff na legenda, no estilo dos botões dos Programas Sociais.
           const isPbfYearMode = state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2';
           const rawPbfAno = State.get('pobPbfAno');
           const activePbfAno = rawPbfAno === '2019' || rawPbfAno === 'diff' ? rawPbfAno : '2026';
            const activeMode = isProgramTab
              ? (state.progMetricaModo === 'percentual' ? 'percentual' : 'absoluto')
              : 'absoluto';
           const modeToggle = hasMetricModeToggle
             ? `<div class="legend-mode-toggle" role="group" aria-label="Modo da métrica">
                 <button type="button" class="legend-mode-button ${activeMode === 'absoluto' ? 'is-active' : ''}" data-metric-mode="absoluto" aria-pressed="${activeMode === 'absoluto'}" title="Exibir valores absolutos">#</button>
                 <button type="button" class="legend-mode-button ${activeMode === 'percentual' ? 'is-active' : ''}" data-metric-mode="percentual" aria-pressed="${activeMode === 'percentual'}" title="Exibir percentual da população municipal">%</button>
               </div>`
             : '';
           const pbfYearToggle = isPbfYearMode
             ? `<div class="legend-mode-toggle is-column" role="group" aria-label="Ano de referência do Pobreza PBF">
                 <div class="legend-mode-row">
                   <button type="button" class="legend-mode-button ${activePbfAno === '2019' ? 'is-active' : ''}" data-pbf-ano="2019" aria-pressed="${activePbfAno === '2019'}" title="Dados de 2019">2019</button>
                   <button type="button" class="legend-mode-button ${activePbfAno === '2026' ? 'is-active' : ''}" data-pbf-ano="2026" aria-pressed="${activePbfAno === '2026'}" title="Dados de 2026 (competência atual)">2026</button>
                 </div>
                 <button type="button" class="legend-mode-button ${activePbfAno === 'diff' ? 'is-active' : ''}" data-pbf-ano="diff" aria-pressed="${activePbfAno === 'diff'}" title="Cor do mapa pela Variação 2026 x 2019 (p.p.)">Diff 2026-2019</button>
               </div>`
             : '';
          const isPbfDiffLegend = isPbfYearMode && activePbfAno === 'diff';
           const focusedButton = legendElement.contains(document.activeElement) ? document.activeElement : null;
           const focusKey = focusedButton?.dataset.metricMode ? 'metricMode' : 'pbfAno';
           const focusValue = focusedButton?.dataset[focusKey];
           legendElement.innerHTML = `${modeToggle}${pbfYearToggle}<strong class="block mb-2 text-sm uppercase tracking-wide">${escapeHtml(legendTitle)}</strong>`;
          if (isPbfDiffLegend) {
            const pbfDiff = getPbfDiffScale();
             [-pbfDiff.bound, -pbfDiff.bound / 2, pbfDiff.bound / 2, pbfDiff.bound].forEach(valor => {
               const displayVal = `${valor > 0 ? '+' : ''}${fmtPtbrNum(valor)} p.p.`;
               legendElement.innerHTML += `<div class="flex items-center mb-1 text-sm"><i style="background:${getPbfDiffColor(pbfDiff, valor)}"></i><span>${displayVal}</span></div>`;
             });
             legendElement.innerHTML += '<div class="flex items-center mb-1 text-sm"><i style="background:transparent;border:1px solid #94a3b8"></i><span>Entre -2 e +2 p.p. (sem preenchimento)</span></div>';
          } else {
            for (let i = 0; i <= 5; i++) {
              const valor = (i / 5) * colorMax;
              const displayVal = metric.formatScaleValue(valor);
              legendElement.innerHTML += `<div class="flex items-center mb-1 text-sm"><i style="background:${colorScale(valor).hex()}"></i><span>${displayVal}</span></div>`;
            }
          }
           if (hasMetricModeToggle) {
             legendElement.querySelectorAll('[data-metric-mode]').forEach(button => {
                button.addEventListener('click', () => State.set('progMetricaModo', button.dataset.metricMode));
             });
           }
            if (isPbfYearMode) {
              legendElement.querySelectorAll('[data-pbf-ano]').forEach(button => {
                button.addEventListener('click', () => State.set('pobPbfAno', button.dataset.pbfAno));
              });
            }
             if (focusValue) (Array.from(legendElement.querySelectorAll('button')).find(button => button.dataset[focusKey] === focusValue) || btnResetView)?.focus({ preventScroll: true });
             requestAnimationFrame(adjustMapControlsPosition);
       }
       function highlightSelectedCity(city, state, maxVal, visibleFeatures) {
         if (!geoJsonLayer) return false;
         if (highlightedLayer) {
           try { geoJsonLayer.resetStyle(highlightedLayer); } catch (e) {}
           const previousPath = getLayerElement(highlightedLayer);
           if (previousPath) previousPath.setAttribute('aria-pressed', 'false');
           highlightedLayer = null;
         }
        if (!city) return false;

        const currentState = state || State.getState();
        const currentMax = maxVal === undefined ? Utils.getCriticityMax(currentState) : maxVal;
        const currentVisibleFeatures = visibleFeatures || new Set(DataSelectors.getFilteredFeatures(currentState));
        let found = false;
        geoJsonLayer.eachLayer(layer => {
          const properties = layer.feature && layer.feature.properties;
          if (properties && properties.name === city.name && currentVisibleFeatures.has(layer.feature)) {
             highlightedLayer = layer;
             found = true;
             const selectedPath = getLayerElement(layer);
             if (selectedPath) selectedPath.setAttribute('aria-pressed', 'true');
              layer.setStyle({ weight: 2.5, color: State.get('isDark') ? '#34d399' : '#FFFFFF', fillOpacity: 1 });
             if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
           }
        });
         return found;
       }
       function centerOnCity(city) {
         if (!map || !geoJsonLayer || !city) return false;

         let cityLayer = null;
         geoJsonLayer.eachLayer(layer => {
           const properties = layer.feature && layer.feature.properties;
           if (!cityLayer && properties && properties.name === city.name) cityLayer = layer;
         });
         if (!cityLayer || typeof cityLayer.getBounds !== 'function') return false;

         const bounds = cityLayer.getBounds();
         if (!bounds || !bounds.isValid()) return false;

         const centerMapOnCity = () => {
           if (!map) return;
           map.invalidateSize();
            map.fitBounds(bounds, { ...getFitBoundsOptions(), maxZoom: 12 });
         };

         if (State.get('viewMode') !== 'mapa') {
           State.set('viewMode', 'mapa');
           setTimeout(centerMapOnCity, 50);
         } else {
           centerMapOnCity();
         }
         return true;
       }
       function updateLayer() {
         if (!map || State.get('viewMode') !== 'mapa' || State.get('dataError') || typeof geojsonData === 'undefined' || !Array.isArray(geojsonData.features)) return;
        setLoading(true);
        if (renderFrame !== null) cancelAnimationFrame(renderFrame);
        renderFrame = requestAnimationFrame(() => {
        renderFrame = null;
          try {
             highlightedLayer = null;
             const state = State.getState(), activeTab = state.activeTab;
             if (state.viewMode !== 'mapa') return;
           const metric = MetricSelectors.get(state);
           const paletteName = state.activeTab === 'pob' ? state.pobPalette : state.progPalette;
         const legendTitle = metric.label;
         const colorMax = Utils.getDynamicMax(state);
         const criticityMax = Utils.getCriticityMax(state);
         const visibleFeatures = new Set(DataSelectors.getFilteredFeatures(state));

           const colorScale = chroma.scale(PALETAS[paletteName]).domain([0, colorMax]);
           const isPbfDiffMode = activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' && state.pobPbfAno === 'diff';
           const pbfDiffData = isPbfDiffMode ? getPbfDiffScale() : null;
         const isDark = state.isDark;
        
          const styleFeature = (feature) => {
            const properties = feature.properties;
             const val = metric.value(properties);
            const isVisible = visibleFeatures.has(feature);
             let fillColor = 'transparent';
            if (isVisible) {
              if (isPbfDiffMode) {
                const diffVal = Utils.getPbfVariacao2026x2019(properties);
                fillColor = getPbfDiffColor(pbfDiffData, diffVal);
              }
              else fillColor = (val === null || val === undefined || isNaN(val)) ? '#cccccc' : colorScale(val).hex();
           }
           return { fillColor, weight: isVisible ? 0.7 : 0.2, color: isDark ? (isVisible ? '#374151' : '#1f2937') : (isVisible ? '#4b5563' : '#e5e7eb'), fillOpacity: isVisible ? 0.8 : 0.1 };
         };
         const isInitialRender = !geoJsonLayer;
         if (!geoJsonLayer) geoJsonLayer = L.geoJSON(geojsonData, {
           onEachFeature: (feature, layer) => {
             const selectCity = () => {
               if (!layer.isVisible) return;
               clickInMunicipality = true;
               State.set('selectedCity', feature.properties);
               setTimeout(() => { clickInMunicipality = false; }, 0);
             };
             layer.on({
               mouseover: () => {
                 if (layer.isVisible && State.get('selectedCity')?.name !== feature.properties.name) layer.setStyle({ weight: 2.5, fillOpacity: 0.95 });
               },
               mouseout: () => {
                 geoJsonLayer.resetStyle(layer);
                 highlightSelectedCity(State.get('selectedCity'));
               },
               click: selectCity
             });
           }
         }).addTo(map);
         geoJsonLayer.options.style = styleFeature;
         geoJsonLayer.setStyle(styleFeature);
           geoJsonLayer.eachLayer(layer => {
             const feature = layer.feature;
             const p = feature.properties;
             setupKeyboardAccess(layer, p, visibleFeatures.has(feature));
            const getSignalClass = (valTest) => Utils.getSignalTextColorClass(valTest, criticityMax);
            if (visibleFeatures.has(feature)) {
              
              let html = `<div class="font-sans text-[20px]"><strong class="block text-[24px] mb-2 border-b border-slate-200 dark:border-slate-700 pb-1">${escapeHtml(p.name)}</strong><div class="space-y-1">`;
              if (activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2') {
                if (state.pobPbfAno === 'diff') {
                  html += `<div><span class="opacity-80">População 2019 / 2026:</span> <strong class="ml-1">${fmtPtbrInt(p.população_2019)} / ${fmtPtbrInt(p.população)}</strong></div>`;
                } else {
                  const populationYear = state.pobPbfAno === '2019' ? '2019' : '2026';
                  html += `<div><span class="opacity-80">População ${populationYear}:</span> <strong class="ml-1">${fmtPtbrInt(Utils.getPbfPopulation(p, populationYear))}</strong></div>`;
                }
              } else {
                html += `<div><span class="opacity-80">População:</span> <strong class="ml-1">${fmtPtbrInt(p.população)}</strong></div>`;
              }
               
               if (activeTab === 'pob') {
                 if (state.pobIndicator === 'norm_pob_p1_p2') {
                    const pbf2019Pct = Utils.calcPbfPercentual(p, '2019');
                   const pbf2026Pct = Utils.calcPctPobP1P2(p);
                   html += `<div><span class="opacity-80">Pob. PBF 2019:</span> <strong class="ml-1">${fmtPtbrInt(p.PBF_2019)} <span class="${getSignalClass(p.norm_PBF_2019)}">(${Utils.fmtPtbrPct(pbf2019Pct)})</span></strong></div>`;
                   html += `<div><span class="opacity-80">Pob. PBF 2026:</span> <strong class="ml-1">${fmtPtbrInt(p.pob_p1_p2)} <span class="${getSignalClass(p.norm_pob_p1_p2)}">(${Utils.fmtPtbrPct(pbf2026Pct)})</span></strong></div>`;
                    const variacaoPbf = Utils.getPbfVariacao2026x2019(p);
                    if (variacaoPbf !== null) {
                       const deltaLabel = `${variacaoPbf > 0 ? '+' : ''}${fmtPtbrNum(variacaoPbf)} p.p.`;
                      const deltaColorClass = variacaoPbf > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : variacaoPbf < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400';
                      html += `<div><span class="opacity-80">Variação 2026 x 2019:</span> <strong class="ml-1 ${deltaColorClass}">${deltaLabel}</strong></div>`;
                    }
                 } else {
                   html += `<div><span class="opacity-80">Ext. pobreza:</span> <strong class="ml-1">${fmtPtbrInt(p.ext_pob)} <span class="${getSignalClass(p.norm_ext)}">(${Utils.fmtPtbrPct(Utils.calcPctExtPob(p))})</span></strong></div>`;
                   html += `<div><span class="opacity-80">Pobreza:</span> <strong class="ml-1">${fmtPtbrInt(p.pob)} <span class="${getSignalClass(p.norm_pob)}">(${Utils.fmtPtbrPct(Utils.calcPctPob(p))})</span></strong></div>`;
                   html += `<div><span class="opacity-80">Pobreza PBF:</span> <strong class="ml-1">${fmtPtbrInt(p.pob_p1_p2)} <span class="${getSignalClass(p.norm_pob_p1_p2)}">(${Utils.fmtPtbrPct(Utils.calcPctPobP1P2(p))})</span></strong></div>`;
                  }
               } else {
                 // TOOLTIP DO MAPA PARA PROG
                 if (state.progPrograma === 'PLES') {
                   const plesValue = metric.rawValue(p);
                   const plesLabel = PLES_COLUMN_LABELS[metric.key] || 'Passe Livre Estudantil';
                    html += `<div><span class="opacity-80">${escapeHtml(plesLabel)}:</span> <strong class="ml-1">${fmtPtbrInt(plesValue)} <span class="text-inherit font-normal">(${Utils.fmtPtbrPct(Utils.calcPctSeguro(plesValue, p.população))})</span></strong></div>`;
                 } else {
                   const progBeneficios = p[Utils.getProgKey(state.progPrograma, state.progStatus, 'Beneficios')];
                   const progPessoas = p[Utils.getProgKey(state.progPrograma, state.progStatus, 'Pessoas')];
                    html += `<div><span class="opacity-80">Benefícios:</span> <strong class="ml-1">${fmtPtbrInt(progBeneficios)}</strong></div>`;
                    html += `<div><span class="opacity-80">Pessoas (Resp. + Grupo Fam.):</span> <strong class="ml-1">${fmtPtbrInt(progPessoas)} <span class="text-inherit font-normal">(${Utils.fmtPtbrPct(Utils.calcPctSeguro(progPessoas, p.população))})</span></strong></div>`;
                 }
               }
              html += `</div></div>`;
               if (layer.getTooltip()) layer.setTooltipContent(html);
               else layer.bindTooltip(html, { sticky: true, direction: 'auto' });
             } else {
               layer.closeTooltip();
               layer.unbindTooltip();
             }
           });
          const focusedPath = document.activeElement;
          if (focusedPath && mapEl.contains(focusedPath) && focusedPath.getAttribute('aria-hidden') === 'true') btnResetView?.focus({ preventScroll: true });
          highlightSelectedCity(state.selectedCity, state, criticityMax, visibleFeatures);
          if (isInitialRender) {
            map.invalidateSize({ pan: false });
            map.fitBounds(geoJsonLayer.getBounds(), { ...getFitBoundsOptions(), animate: false });
          }
          updateLegend(legendTitle, metric, colorScale, colorMax);
        } finally {
          setLoading(false);
        }
        });
      }
         State.subscribe('isDark', () => { updateTileLayer(State.get('isDark')); updateLayer(); }); State.subscribe('activeTab', updateLayer); State.subscribe('pobIndicator', updateLayer); State.subscribe('pobPbfAno', updateLayer); State.subscribe('pobPalette', updateLayer);
        State.subscribe('progPrograma', updateLayer); State.subscribe('progStatus', updateLayer); State.subscribe('progMetrica', updateLayer); State.subscribe('progPlesMetrica', updateLayer); State.subscribe('progMetricaModo', updateLayer); State.subscribe('progPalette', updateLayer);
        State.subscribe('viewMode', () => {
          const mode = State.get('viewMode');
         containerEl.classList.toggle('hidden', mode !== 'mapa');
          if (mode === 'mapa') {
            updateLayer();
            setTimeout(() => { map?.invalidateSize({ pan: false }); adjustMapControlsPosition(); }, 50);
          }
       });
       State.subscribe('searchTerm', updateLayer); State.subscribe('riskFilter', updateLayer); State.subscribe('populationBand', updateLayer); State.subscribe('populationMin', updateLayer); State.subscribe('populationMax', updateLayer);
      if (!State.get('dataError')) initMap();
        if (btnResetView) btnResetView.addEventListener('click', () => { if (map && geoJsonLayer) { try { map.fitBounds(geoJsonLayer.getBounds(), { ...getFitBoundsOptions(), maxZoom: 8 }); } catch(e) {} } });
         window.addEventListener('resize', () => {
          if (!map) return;
          map.invalidateSize({ pan: false, debounceMoveend: true });
          adjustMapControlsPosition();
        });
        State.subscribe('selectedCity', () => {
          if (geoJsonLayer) highlightSelectedCity(State.get('selectedCity'));
         setTimeout(() => {
            if (map) map.invalidateSize({ pan: false, debounceMoveend: true });
            adjustMapControlsPosition();
          }, 50);
        });
        return { initMap, centerOnCity, adjustMapControlsPosition, fitPresentation, refreshAfterPresentation };
     })();

export { MapModule };
