import { geojsonData } from './data.js';
import { fmtPtbrInt, fmtPtbrNum, PROGRAMAS, State, Utils, MetricSelectors, DataSelectors } from './core.js';
      const ScatterModule = (function() {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const container = document.getElementById('scatter-container');
        const chartContainer = document.getElementById('scatter-chart-container');
        const chartScroll = document.getElementById('scatter-chart-scroll');
        const svg = document.getElementById('scatter-chart-svg');
        const tooltip = document.getElementById('scatter-tooltip');
        const emptyState = document.getElementById('scatter-empty');
        const context = document.getElementById('scatter-context');
        const municipalitySelect = document.getElementById('scatter-municipio-select');
        const clearButton = document.getElementById('scatter-clear-municipality');
        const tableDetails = document.getElementById('scatter-table-details');
        const tableHead = document.getElementById('scatter-table-head');
        const tableBody = document.getElementById('scatter-table-body');
        const correlationSummary = document.getElementById('scatter-correlation-summary');
         const zoomOutButton = document.getElementById('scatter-zoom-out');
         const zoomResetButton = document.getElementById('scatter-zoom-reset');
         const zoomInButton = document.getElementById('scatter-zoom-in');
         const expandButton = document.getElementById('scatter-expand');
         const dialog = document.getElementById('scatter-dialog');
         const dialogCloseButton = document.getElementById('scatter-dialog-close');
         const dialogClearButton = document.getElementById('scatter-dialog-clear');
         const dialogMunicipalitySelect = document.getElementById('scatter-dialog-municipio-select');
         const dialogTitle = document.getElementById('scatter-dialog-title');
         const dialogContext = document.getElementById('scatter-dialog-context');
         const expandedChartContainer = document.getElementById('scatter-expanded-chart-container');
         const dialogZoomOutButton = document.getElementById('scatter-dialog-zoom-out');
         const dialogZoomResetButton = document.getElementById('scatter-dialog-zoom-reset');
         const dialogZoomInButton = document.getElementById('scatter-dialog-zoom-in');
        const chartWidth = 1100;
        const chartHeight = 620;
        const plotLeft = 92;
        const plotRight = 1060;
        const plotTop = 40;
        const plotBottom = 548;
        const plotWidth = plotRight - plotLeft;
        const plotHeight = plotBottom - plotTop;
        const colors = {
          priority: '#e11d48',
          adequate: '#059669',
          lowCoverage: '#d97706',
          lowVulnerability: '#2563eb',
          grid: '#e2e8f0',
          axis: '#64748b',
          text: '#0f172a',
          muted: '#64748b'
        };
        let selectedMunicipality = '';
        let hoveredMunicipality = '';
         let wasActive = false;
         let scatterSort = { key: 'municipio', direction: 'asc' };
         let zoomLevel = 1;
         let chartHost = chartContainer;
          let scatterDialogOpen = false;
          let tooltipMunicipality = '';
          let tooltipFrame = null;
          let tooltipPosition = null;
          const pointsByMunicipality = new Map();
          let highlightedPoints = new Set();

        function isActive(state) {
           return state.viewMode === 'scatter' && state.activeTab === 'prog';
         }

         function moveChartContent(target) {
           if (!target || chartScroll.parentElement === target) return;
           target.appendChild(chartScroll);
           target.appendChild(tooltip);
           chartHost = target;
         }

         function restoreChartContent() {
           chartContainer.insertBefore(chartScroll, chartContainer.firstChild);
           chartContainer.insertBefore(tooltip, emptyState);
           chartHost = chartContainer;
         }

         function updateDialogContent() {
           if (dialogTitle) dialogTitle.textContent = 'Vulnerabilidade x Cobertura de Benefícios';
           if (dialogContext && context) dialogContext.textContent = context.textContent || 'Visualização ampliada da análise de correlação.';
         }

         function setScatterDialog(isOpen) {
           if (!dialog) return;
           if (isOpen && !isActive(State.getState())) return;
           if (scatterDialogOpen === isOpen) return;

           scatterDialogOpen = isOpen;
           dialog.classList.toggle('hidden', !isOpen);
           dialog.classList.toggle('flex', isOpen);
           dialog.setAttribute('aria-hidden', String(!isOpen));
           if (expandButton) expandButton.setAttribute('aria-expanded', String(isOpen));

           if (isOpen) {
             updateDialogContent();
             moveChartContent(expandedChartContainer);
             window.requestAnimationFrame(() => dialogCloseButton.focus());
           } else {
             const shouldReturnFocus = dialog.contains(document.activeElement);
             hideTooltip();
             restoreChartContent();
             if (shouldReturnFocus) window.requestAnimationFrame(() => expandButton.focus());
           }
         }

        function createSvgElement(tag, attributes) {
          const element = document.createElementNS(SVG_NS, tag);
          Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
          return element;
        }

        function escapeHtml(value) {
          return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          }[character]));
        }

        function getRows(features, state) {
          const metric = MetricSelectors.get(state);
          return features.map(feature => {
            const properties = feature && feature.properties;
            if (!properties) return null;
            const vulnerability = Utils.calcPctExtPob(properties);
            const population = Utils.parseNum(properties.população);
            const rawCoverage = Utils.parseNum(metric.rawValue(properties));
            const coverage = Utils.calcPctSeguro(rawCoverage, population);
            if (vulnerability === null || coverage === null || !Number.isFinite(Number(vulnerability)) || !Number.isFinite(Number(coverage))) return null;
            return { properties, municipio: properties.name, vulnerability: Number(vulnerability), coverage: Number(coverage), coverageCount: rawCoverage };
          }).filter(Boolean);
        }

        function getAverages(rows) {
          if (!rows.length) return { vulnerability: null, coverage: null };
          return {
            vulnerability: rows.reduce((sum, row) => sum + row.vulnerability, 0) / rows.length,
            coverage: rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length
          };
        }

        function getQuadrant(row, averages) {
          const highVulnerability = row.vulnerability >= averages.vulnerability;
          const highCoverage = row.coverage >= averages.coverage;
          if (highVulnerability && !highCoverage) return { key: 'priority', label: 'Alta vulnerabilidade / baixa cobertura', color: colors.priority };
          if (highVulnerability && highCoverage) return { key: 'adequate', label: 'Alta vulnerabilidade / alta cobertura', color: colors.adequate };
          if (!highVulnerability && !highCoverage) return { key: 'lowCoverage', label: 'Baixa vulnerabilidade / baixa cobertura', color: colors.lowCoverage };
          return { key: 'lowVulnerability', label: 'Baixa vulnerabilidade / alta cobertura', color: colors.lowVulnerability };
        }

        function getPearsonCorrelation(rows) {
          if (rows.length < 2) return null;
          const averageVulnerability = rows.reduce((sum, row) => sum + row.vulnerability, 0) / rows.length;
          const averageCoverage = rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length;
          let covariance = 0;
          let vulnerabilityVariance = 0;
          let coverageVariance = 0;
          rows.forEach(row => {
            const vulnerabilityDelta = row.vulnerability - averageVulnerability;
            const coverageDelta = row.coverage - averageCoverage;
            covariance += vulnerabilityDelta * coverageDelta;
            vulnerabilityVariance += vulnerabilityDelta ** 2;
            coverageVariance += coverageDelta ** 2;
          });
          const denominator = Math.sqrt(vulnerabilityVariance * coverageVariance);
          return denominator > 0 ? covariance / denominator : null;
        }

        function formatCorrelation(value) {
          if (value === null || value === undefined || !Number.isFinite(value)) return 'Indisponível';
          return `r = ${fmtPtbrNum(value, 3)}`;
        }

        function formatAxisValue(value, axisMax) {
          const decimals = axisMax >= 10 ? 1 : axisMax >= 0.1 ? 2 : 3;
          return `${fmtPtbrNum(value, decimals)}%`;
        }

        function formatTooltipValue(value) {
          return Utils.fmtPtbrPct(value);
        }

        function getAxisMax(values) {
          const maximum = values.length ? Math.max(...values) : 1;
          if (!Number.isFinite(maximum) || maximum <= 0) return 1;
          const step = maximum >= 20 ? 5 : maximum >= 5 ? 1 : maximum >= 1 ? 0.5 : maximum >= 0.1 ? 0.05 : 0.005;
          return Math.max(step, Math.ceil((maximum * 1.12) / step) * step);
        }

        function scaleX(value, maxValue) {
          return plotLeft + (value / maxValue) * plotWidth;
        }

        function scaleY(value, maxValue) {
          return plotBottom - (value / maxValue) * plotHeight;
        }

        function applyZoom() {
          if (!svg || !chartScroll) return;
          svg.style.width = `${chartWidth}px`;
          svg.style.height = `${chartHeight}px`;
          svg.style.transformOrigin = 'top left';
           svg.style.transform = `scale(${zoomLevel})`;
           chartScroll.style.width = `${chartWidth * zoomLevel}px`;
           chartScroll.style.height = `${chartHeight * zoomLevel}px`;
           [zoomResetButton, dialogZoomResetButton].filter(Boolean).forEach(button => { button.textContent = `${Math.round(zoomLevel * 100)}%`; });
           [zoomOutButton, dialogZoomOutButton].filter(Boolean).forEach(button => { button.disabled = zoomLevel <= 0.75; });
           [zoomInButton, dialogZoomInButton].filter(Boolean).forEach(button => { button.disabled = zoomLevel >= 2.5; });
        }

        function setZoom(nextZoom) {
          zoomLevel = Math.min(2.5, Math.max(0.75, Math.round(nextZoom * 100) / 100));
          applyZoom();
        }

         function renderSelect(rows) {
           const selects = [municipalitySelect, dialogMunicipalitySelect].filter(Boolean);
           if (!selects.length) return;
           const current = selectedMunicipality;
           const municipalities = [...new Map(rows.map(row => [row.municipio, row])).values()]
             .sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR', { sensitivity: 'base' }));
           selects.forEach(select => {
             select.innerHTML = '<option value="">Todos os municípios</option>';
             municipalities.forEach(row => {
               const option = document.createElement('option');
               option.value = row.municipio;
               option.textContent = row.municipio;
               select.appendChild(option);
             });
             const hasCurrent = municipalities.some(row => row.municipio === current);
             select.value = hasCurrent ? current : '';
           });
            if (current && !municipalities.some(row => row.municipio === current)) {
              selects.forEach(select => {
                const option = document.createElement('option');
                option.value = current;
                option.textContent = `${current} (fora do recorte ou sem dados válidos)`;
                select.appendChild(option);
                select.value = current;
              });
            }
        }

         function updateContext(state, averages, rows, allRows) {
           if (!context) return;
           const metric = MetricSelectors.get(state);
           const programLabel = PROGRAMAS[state.progPrograma] || state.progPrograma;
           const scopeLabel = rows.length === allRows.length ? 'todos os municípios' : `${fmtPtbrInt(rows.length)} municípios no recorte atual`;
            context.textContent = `${programLabel}. Eixo X: % Extrema Pobreza. Eixo Y: cobertura percentual de ${metric.label}. Média dos municípios com dados válidos (${fmtPtbrInt(allRows.length)} municípios, sem ponderação populacional): ${formatTooltipValue(averages.vulnerability)} no eixo X e ${formatTooltipValue(averages.coverage)} no eixo Y. Exibindo ${scopeLabel}.`;
           updateDialogContent();
        }

        function renderTable(rows, averages, state) {
          if (!tableHead || !tableBody || !tableDetails) return;
          const metric = MetricSelectors.get(state);
          const correlation = getPearsonCorrelation(rows);
          const columns = [
            { key: 'municipio', label: 'Município', getValue: row => row.municipio },
            { key: 'vulnerabilidade', label: 'Extrema pobreza', getValue: row => row.vulnerability },
            { key: 'cobertura_numero', label: `Cobertura: ${metric.label}`, getValue: row => row.coverageCount },
            { key: 'cobertura_percentual', label: 'Cobertura (%)', getValue: row => row.coverage },
            { key: 'correlacao', label: 'Correlação / quadrante', getValue: row => getQuadrant(row, averages).label }
          ];
          tableHead.innerHTML = `<tr>${columns.map(column => {
            const isSorted = scatterSort.key === column.key;
            const icon = isSorted ? (scatterSort.direction === 'asc' ? '▲' : '▼') : '⇅';
            const iconClass = isSorted ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-30';
            const ariaSort = isSorted ? (scatterSort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
            return `<th aria-sort="${ariaSort}" class="p-0 font-extrabold"><button type="button" data-scatter-sort="${column.key}" aria-label="Ordenar por ${escapeHtml(column.label)}" class="flex w-full items-center gap-1.5 whitespace-nowrap px-4 py-3 text-left transition-colors hover:bg-slate-200 dark:hover:bg-slate-800"><span>${escapeHtml(column.label)}</span><span class="${iconClass} text-[10px]">${icon}</span></button></th>`;
          }).join('')}</tr>`;
          const sortColumn = columns.find(column => column.key === scatterSort.key) || columns[0];
          const sortedRows = rows.slice().sort((a, b) => {
            const aValue = sortColumn.getValue(a);
            const bValue = sortColumn.getValue(b);
            const aMissing = aValue === null || aValue === undefined || (typeof aValue === 'number' && !Number.isFinite(aValue));
            const bMissing = bValue === null || bValue === undefined || (typeof bValue === 'number' && !Number.isFinite(bValue));
            if (aMissing || bMissing) {
              if (aMissing && bMissing) return 0;
              return aMissing ? 1 : -1;
            }
            const comparison = typeof aValue === 'string' && typeof bValue === 'string'
              ? aValue.localeCompare(bValue, 'pt-BR', { sensitivity: 'base' })
              : aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            return scatterSort.direction === 'asc' ? comparison : -comparison;
          });
          tableBody.innerHTML = sortedRows.map(row => {
            const quadrant = getQuadrant(row, averages);
            const isSelected = row.municipio === selectedMunicipality;
            return `<tr data-scatter-municipio="${escapeHtml(row.municipio)}" class="cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}"><td class="px-4 py-3 font-bold text-slate-900 dark:text-white">${escapeHtml(row.municipio)}</td><td class="px-4 py-3 text-slate-600 dark:text-slate-300">${formatTooltipValue(row.vulnerability)}</td><td class="px-4 py-3 text-slate-600 dark:text-slate-300">${fmtPtbrInt(row.coverageCount)}</td><td class="px-4 py-3 text-slate-600 dark:text-slate-300">${formatTooltipValue(row.coverage)}</td><td class="px-4 py-3 font-bold" style="color:${quadrant.color}">${quadrant.label}</td></tr>`;
          }).join('');
          correlationSummary.textContent = `Correlação de Pearson no recorte exibido: ${formatCorrelation(correlation)}. Valores de r próximos de 1 indicam associação positiva; próximos de -1, associação negativa.`;
          tableDetails.classList.remove('hidden');
          tableBody.querySelectorAll('[data-scatter-municipio]').forEach(rowElement => {
             const cell = rowElement.firstElementChild;
             const button = document.createElement('button');
             button.type = 'button';
             button.textContent = rowElement.dataset.scatterMunicipio;
             button.dataset.scatterSelect = rowElement.dataset.scatterMunicipio;
             button.setAttribute('aria-pressed', String(rowElement.dataset.scatterMunicipio === selectedMunicipality));
             cell.replaceChildren(button);
             rowElement.addEventListener('click', () => {
               selectMunicipality(rowElement.dataset.scatterMunicipio, true);
            });
          });
        }

         function showTooltip(event, row, averages) {
           if (!tooltip || !chartHost || !chartScroll) return;
           const quadrant = getQuadrant(row, averages);
           const metric = MetricSelectors.get(State.getState());
           if (tooltipMunicipality !== row.municipio) {
           tooltip.innerHTML = `<strong class="block mb-1">${escapeHtml(row.municipio)}</strong><span class="block">Extrema pobreza: ${formatTooltipValue(row.vulnerability)}</span><span class="block">Cobertura (${escapeHtml(metric.label)}): ${formatTooltipValue(row.coverage)}</span><span class="mt-1 block font-semibold" style="color:${quadrant.color}">${quadrant.label}</span>`;
             tooltipMunicipality = row.municipio;
           }
           tooltip.classList.remove('hidden');
           tooltipPosition = { x: event.clientX, y: event.clientY };
           if (tooltipFrame !== null) return;
           tooltipFrame = requestAnimationFrame(() => {
             tooltipFrame = null;
             const bounds = chartHost.getBoundingClientRect();
              const width = chartHost.clientWidth;
              const height = chartHost.clientHeight;
              tooltip.style.maxWidth = `${width}px`;
              tooltip.style.maxHeight = `${height}px`;
              tooltip.style.overflowY = 'auto';
              const x = Math.max(0, Math.min(tooltipPosition.x - bounds.left - chartHost.clientLeft + 12, width - tooltip.offsetWidth));
             const y = Math.max(0, Math.min(tooltipPosition.y - bounds.top - chartHost.clientTop + 12, height - tooltip.offsetHeight));
             tooltip.style.left = `${chartHost.scrollLeft + x}px`;
             tooltip.style.top = `${chartHost.scrollTop + y}px`;
           });
        }

         function hideTooltip() {
           if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame);
           tooltipFrame = null;
           tooltipMunicipality = '';
          if (tooltip) tooltip.classList.add('hidden');
        }

         function syncSelection() {
           [municipalitySelect, dialogMunicipalitySelect].filter(Boolean).forEach(select => { select.value = selectedMunicipality; });
        }

         function applyPointHighlight() {
           const nextPoints = new Set([selectedMunicipality, hoveredMunicipality].filter(Boolean));
           new Set([...highlightedPoints, ...nextPoints]).forEach(name => {
             const point = pointsByMunicipality.get(name);
             if (!point) return;
            const municipio = point.getAttribute('data-municipio');
            const isSelected = selectedMunicipality && municipio === selectedMunicipality;
            const isHovered = hoveredMunicipality && municipio === hoveredMunicipality;
            point.setAttribute('r', isSelected ? '8' : isHovered ? '6' : '4.5');
            point.setAttribute('stroke', isSelected ? (State.get('isDark') ? '#f8fafc' : '#0f172a') : '#ffffff');
            point.setAttribute('stroke-width', isSelected ? '3' : '1');
              point.setAttribute('opacity', selectedMunicipality && !isSelected ? '0.16' : isHovered ? '1' : '0.78');
             point.setAttribute('aria-pressed', String(Boolean(isSelected)));
           });
           highlightedPoints = nextPoints;
        }

        function selectMunicipality(municipio, updatePanel) {
           if (updatePanel) {
             const feature = geojsonData.features.find(item => item.properties.name === municipio);
            const currentCity = State.get('selectedCity');
            const currentName = currentCity ? currentCity.name : '';
             if (currentName !== (municipio || '')) State.set('selectedCity', feature ? feature.properties : null);
           }
           selectedMunicipality = State.get('selectedCity')?.name || '';
           syncSelection();
        }

         function renderSvg(rows, allRows, averages, state) {
           pointsByMunicipality.clear();
           highlightedPoints.clear();
          svg.innerHTML = '';
          svg.setAttribute('viewBox', `0 0 ${chartWidth} ${chartHeight}`);
           svg.setAttribute('height', chartHeight);
           svg.setAttribute('role', 'group');
          svg.setAttribute('aria-label', 'Correlação entre extrema pobreza e cobertura de benefícios por município');
          svg.style.color = state.isDark ? '#e2e8f0' : colors.text;

          const xMax = getAxisMax(allRows.map(row => row.vulnerability));
          const yMax = getAxisMax(allRows.map(row => row.coverage));
          const xAverage = scaleX(averages.vulnerability, xMax);
          const yAverage = scaleY(averages.coverage, yMax);
          const background = createSvgElement('rect', { x: 0, y: 0, width: chartWidth, height: chartHeight, fill: state.isDark ? '#020617' : '#ffffff', rx: 8 });
          svg.appendChild(background);

          const quadrantFills = [
            { x: plotLeft, y: plotTop, width: xAverage - plotLeft, height: yAverage - plotTop, fill: state.isDark ? '#172554' : '#dbeafe' },
            { x: xAverage, y: plotTop, width: plotRight - xAverage, height: yAverage - plotTop, fill: state.isDark ? '#064e3b' : '#d1fae5' },
            { x: plotLeft, y: yAverage, width: xAverage - plotLeft, height: plotBottom - yAverage, fill: state.isDark ? '#78350f' : '#fef3c7' },
            { x: xAverage, y: yAverage, width: plotRight - xAverage, height: plotBottom - yAverage, fill: state.isDark ? '#4c0519' : '#ffe4e6' }
          ];
          quadrantFills.forEach(fill => svg.appendChild(createSvgElement('rect', { ...fill, opacity: 0.72 })));

          const gridGroup = createSvgElement('g');
          [0, 0.25, 0.5, 0.75, 1].forEach(step => {
            const xValue = xMax * step;
            const x = scaleX(xValue, xMax);
            gridGroup.appendChild(createSvgElement('line', { x1: x, y1: plotTop, x2: x, y2: plotBottom, stroke: state.isDark ? '#1e293b' : colors.grid, 'stroke-width': 1 }));
            const xTick = createSvgElement('text', { x, y: plotBottom + 24, 'text-anchor': 'middle', fill: state.isDark ? '#94a3b8' : colors.muted, 'font-size': 11 });
            xTick.textContent = formatAxisValue(xValue, xMax);
            gridGroup.appendChild(xTick);

            const yValue = yMax * step;
            const y = scaleY(yValue, yMax);
            gridGroup.appendChild(createSvgElement('line', { x1: plotLeft, y1: y, x2: plotRight, y2: y, stroke: state.isDark ? '#1e293b' : colors.grid, 'stroke-width': 1 }));
            const yTick = createSvgElement('text', { x: plotLeft - 12, y: y + 4, 'text-anchor': 'end', fill: state.isDark ? '#94a3b8' : colors.muted, 'font-size': 11 });
            yTick.textContent = formatAxisValue(yValue, yMax);
            gridGroup.appendChild(yTick);
          });
          svg.appendChild(gridGroup);

          const thresholdGroup = createSvgElement('g');
          thresholdGroup.appendChild(createSvgElement('line', { x1: xAverage, y1: plotTop, x2: xAverage, y2: plotBottom, stroke: state.isDark ? '#f8fafc' : '#334155', 'stroke-width': 1.5, 'stroke-dasharray': '7 5', opacity: 0.8 }));
          thresholdGroup.appendChild(createSvgElement('line', { x1: plotLeft, y1: yAverage, x2: plotRight, y2: yAverage, stroke: state.isDark ? '#f8fafc' : '#334155', 'stroke-width': 1.5, 'stroke-dasharray': '7 5', opacity: 0.8 }));
          const xAverageLabel = createSvgElement('text', { x: Math.min(xAverage + 8, plotRight - 150), y: plotTop + 17, fill: state.isDark ? '#f8fafc' : '#334155', 'font-size': 11, 'font-weight': 700 });
           xAverageLabel.textContent = `Média municipal X: ${formatTooltipValue(averages.vulnerability)}`;
          thresholdGroup.appendChild(xAverageLabel);
          const yAverageLabel = createSvgElement('text', { x: plotLeft + 8, y: Math.max(yAverage - 8, plotTop + 14), fill: state.isDark ? '#f8fafc' : '#334155', 'font-size': 11, 'font-weight': 700 });
           yAverageLabel.textContent = `Média municipal Y: ${formatTooltipValue(averages.coverage)}`;
          thresholdGroup.appendChild(yAverageLabel);
          svg.appendChild(thresholdGroup);

          const quadrantLabels = [
            { x: plotLeft + (xAverage - plotLeft) / 2, y: plotTop + 22, title: 'Baixa vulnerabilidade', subtitle: 'Alta cobertura', color: colors.lowVulnerability },
            { x: xAverage + (plotRight - xAverage) / 2, y: plotTop + 22, title: 'Alta vulnerabilidade', subtitle: 'Alta cobertura', color: colors.adequate },
            { x: plotLeft + (xAverage - plotLeft) / 2, y: plotBottom - 28, title: 'Baixa vulnerabilidade', subtitle: 'Baixa cobertura', color: colors.lowCoverage },
            { x: xAverage + (plotRight - xAverage) / 2, y: plotBottom - 28, title: 'Prioridade máxima', subtitle: 'Alta vulnerabilidade / baixa cobertura', color: colors.priority }
          ];
          quadrantLabels.forEach(label => {
            const group = createSvgElement('g', { 'pointer-events': 'none', opacity: 0.72 });
            const title = createSvgElement('text', { x: label.x, y: label.y, 'text-anchor': 'middle', fill: label.color, 'font-size': 13, 'font-weight': 800 });
            title.textContent = label.title;
            const subtitle = createSvgElement('text', { x: label.x, y: label.y + 16, 'text-anchor': 'middle', fill: state.isDark ? '#cbd5e1' : colors.text, 'font-size': 10, 'font-weight': 600 });
            subtitle.textContent = label.subtitle;
            group.appendChild(title);
            group.appendChild(subtitle);
            svg.appendChild(group);
          });

          const axisGroup = createSvgElement('g');
          axisGroup.appendChild(createSvgElement('line', { x1: plotLeft, y1: plotBottom, x2: plotRight, y2: plotBottom, stroke: state.isDark ? '#94a3b8' : colors.axis, 'stroke-width': 1.5 }));
          axisGroup.appendChild(createSvgElement('line', { x1: plotLeft, y1: plotTop, x2: plotLeft, y2: plotBottom, stroke: state.isDark ? '#94a3b8' : colors.axis, 'stroke-width': 1.5 }));
          const xAxisTitle = createSvgElement('text', { x: plotLeft + plotWidth / 2, y: chartHeight - 20, 'text-anchor': 'middle', fill: state.isDark ? '#f8fafc' : colors.text, 'font-size': 13, 'font-weight': 800 });
          xAxisTitle.textContent = '% Extrema Pobreza';
          const yAxisTitle = createSvgElement('text', { x: 18, y: plotTop + plotHeight / 2, transform: `rotate(-90 18 ${plotTop + plotHeight / 2})`, 'text-anchor': 'middle', fill: state.isDark ? '#f8fafc' : colors.text, 'font-size': 13, 'font-weight': 800 });
          yAxisTitle.textContent = '% Cobertura do Programa Social';
          axisGroup.appendChild(xAxisTitle);
          axisGroup.appendChild(yAxisTitle);
          svg.appendChild(axisGroup);

          const pointsGroup = createSvgElement('g');
          rows.forEach(row => {
            const quadrant = getQuadrant(row, averages);
            const isSelected = selectedMunicipality === row.municipio;
            const isHovered = hoveredMunicipality === row.municipio;
            const circle = createSvgElement('circle', {
              cx: scaleX(row.vulnerability, xMax),
              cy: scaleY(row.coverage, yMax),
              r: isSelected ? 8 : isHovered ? 6 : 4.5,
              fill: quadrant.color,
              stroke: isSelected ? (state.isDark ? '#f8fafc' : '#0f172a') : '#ffffff',
              'stroke-width': isSelected ? 3 : 1,
               opacity: selectedMunicipality && !isSelected ? 0.16 : 0.78,
              'data-municipio': row.municipio,
              'data-role': 'point',
              tabindex: 0,
               role: 'button',
               'aria-pressed': isSelected,
              'aria-label': `${row.municipio}, extrema pobreza ${formatTooltipValue(row.vulnerability)}, cobertura ${formatTooltipValue(row.coverage)}, ${quadrant.label}`
            });
            circle.addEventListener('mouseenter', event => { hoveredMunicipality = row.municipio; applyPointHighlight(); showTooltip(event, row, averages); });
            circle.addEventListener('mousemove', event => showTooltip(event, row, averages));
            circle.addEventListener('mouseleave', () => { hoveredMunicipality = ''; applyPointHighlight(); hideTooltip(); });
             const activatePoint = () => {
              hoveredMunicipality = '';
               const nextMunicipality = State.get('selectedCity')?.name === row.municipio ? '' : row.municipio;
               selectMunicipality(nextMunicipality, true);
             };
             circle.addEventListener('click', activatePoint);
            circle.addEventListener('keydown', event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
               activatePoint();
             });
             circle.addEventListener('focus', () => {
               hoveredMunicipality = row.municipio;
               applyPointHighlight();
               const bounds = circle.getBoundingClientRect();
               showTooltip({ clientX: bounds.right, clientY: bounds.top }, row, averages);
             });
             circle.addEventListener('blur', () => { hoveredMunicipality = ''; applyPointHighlight(); hideTooltip(); });
             pointsByMunicipality.set(row.municipio, circle);
            pointsGroup.appendChild(circle);
          });
          svg.appendChild(pointsGroup);
          applyZoom();
        }

         function render() {
           const state = State.getState();
           selectedMunicipality = state.selectedCity?.name || '';
           const focused = document.activeElement;
           const focusPoint = svg.contains(focused) ? focused.getAttribute('data-municipio') : null;
           const focusSort = tableHead.contains(focused) ? focused.dataset.scatterSort : null;
           const focusRow = tableBody.contains(focused) ? focused.dataset.scatterSelect : null;
           hideTooltip();
           hoveredMunicipality = '';
          const active = isActive(state);
          container.classList.toggle('hidden', !active);
          container.classList.toggle('flex', active);
           if (!active) {
             setScatterDialog(false);
             svg.innerHTML = '';
             tableHead.innerHTML = '';
            tableBody.innerHTML = '';
            tableDetails.classList.add('hidden');
            hideTooltip();
            wasActive = false;
            return;
          }

          const filteredFeatures = DataSelectors.getFilteredFeatures(state);
          const allFeatures = typeof geojsonData !== 'undefined' && Array.isArray(geojsonData.features) ? geojsonData.features : [];
          const rows = getRows(filteredFeatures, state);
          const allRows = getRows(allFeatures, state);
          const averages = getAverages(allRows);
          const hasPoints = rows.length > 0 && averages.vulnerability !== null && averages.coverage !== null;
          svg.classList.toggle('hidden', !hasPoints);
          emptyState.classList.toggle('hidden', hasPoints);
          emptyState.classList.toggle('flex', !hasPoints);
           tableDetails.classList.toggle('hidden', !hasPoints);
           if (!hasPoints) {
             setScatterDialog(false);
              renderSelect([]);
              svg.replaceChildren();
              tableHead.replaceChildren();
              tableBody.replaceChildren();
              updateContext(state, averages, rows, allRows);
              if (focusPoint || focusSort || focusRow) (scatterDialogOpen ? dialogMunicipalitySelect : municipalitySelect).focus({ preventScroll: true });
              return;
          }

          renderSelect(rows);
          updateContext(state, averages, rows, allRows);
          renderSvg(rows, allRows, averages, state);
           renderTable(rows, averages, state);
           const focusTarget = focusPoint
             ? pointsByMunicipality.get(focusPoint)
             : focusSort
               ? Array.from(tableHead.querySelectorAll('[data-scatter-sort]')).find(button => button.dataset.scatterSort === focusSort)
               : focusRow
                 ? Array.from(tableBody.querySelectorAll('[data-scatter-select]')).find(button => button.dataset.scatterSelect === focusRow)
                 : null;
           if (focusPoint || focusSort || focusRow) (focusTarget || (scatterDialogOpen ? dialogMunicipalitySelect : municipalitySelect)).focus({ preventScroll: true });
          requestAnimationFrame(() => {
             if (!wasActive && window.innerWidth < 768) container.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            wasActive = true;
          });
        }

          municipalitySelect.addEventListener('change', () => {
            selectMunicipality(municipalitySelect.value, true);
         });
          dialogMunicipalitySelect.addEventListener('change', () => {
            selectMunicipality(dialogMunicipalitySelect.value, true);
         });
         clearButton.addEventListener('click', () => {
           selectMunicipality('', true);
            hideTooltip();
         });
         dialogClearButton.addEventListener('click', () => {
           selectMunicipality('', true);
            hideTooltip();
         });
         [zoomOutButton, dialogZoomOutButton].filter(Boolean).forEach(button => button.addEventListener('click', () => setZoom(zoomLevel - 0.25)));
         [zoomResetButton, dialogZoomResetButton].filter(Boolean).forEach(button => button.addEventListener('click', () => setZoom(1)));
         [zoomInButton, dialogZoomInButton].filter(Boolean).forEach(button => button.addEventListener('click', () => setZoom(zoomLevel + 0.25)));
          [chartContainer, expandedChartContainer].filter(Boolean).forEach(element => element.addEventListener('scroll', hideTooltip, { passive: true }));
        tableHead.addEventListener('click', event => {
          const sortButton = event.target.closest('[data-scatter-sort]');
          if (!sortButton) return;
          const key = sortButton.dataset.scatterSort;
          scatterSort = scatterSort.key === key && scatterSort.direction === 'asc'
            ? { key, direction: 'desc' }
            : { key, direction: 'asc' };
          render();
        });
         expandButton.addEventListener('click', () => setScatterDialog(true));
         dialogCloseButton.addEventListener('click', () => setScatterDialog(false));
         dialog.addEventListener('click', event => { if (event.target === dialog) setScatterDialog(false); });
         document.addEventListener('keydown', event => { if (event.key === 'Escape' && scatterDialogOpen) setScatterDialog(false); });
          ['selectedCity', 'viewMode', 'activeTab', 'isDark', 'progPrograma', 'progStatus', 'progMetrica', 'progPlesMetrica', 'progMetricaModo', 'searchTerm', 'riskFilter', 'regionFilter', 'populationBand', 'populationMin', 'populationMax'].forEach(key => State.subscribe(key, render));
        return { render };
      })();

export { ScatterModule };
