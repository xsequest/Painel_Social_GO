import { fmtPtbrInt, PROGRAMAS, PLES_COLUMN_LABELS, State, Utils, MetricSelectors, ColumnSelectors, DataSelectors } from './core.js';
    const TableModule = (function() {
      const thead = document.getElementById('table-head'), 
            tbody = document.getElementById('table-body'), 
            searchInput = document.getElementById('search-input'), 
            btnExport = document.getElementById('btn-export'), 
            tableContainer = document.getElementById('table-container');
      let renderedFeatures = [];

      function renderHeader(columns, sortConfig) {
        thead.innerHTML = columns.map(col => {
          const isSorted = sortConfig.key === col.key;
          const icon = isSorted
            ? `<span class="text-[10px]">${sortConfig.direction === 'asc' ? '▲' : '▼'}</span>`
            : '<span class="opacity-30 text-[10px]">⇅</span>';
          return `<th scope="col" aria-sort="${isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}" data-key="${Utils.escapeHtml(col.key)}" class="p-3.5 font-extrabold hover:bg-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"><button type="button" data-sort-key="${Utils.escapeHtml(col.key)}" class="flex items-center gap-1.5"><span>${Utils.escapeHtml(col.label)}</span>${icon}</button></th>`;
        }).join('');
      }

      function renderBody(features, columns) {
        renderedFeatures = features;
        if (!features.length) { tbody.innerHTML = `<tr><td colspan="${columns.length}" class="p-8 text-center text-slate-400 italic text-base">Nenhum município encontrado.</td></tr>`; return; }
        tbody.innerHTML = features.map((f, i) => {
          const p = f.properties;
          const cells = columns.map(col => {
            const displayVal = col.render(p);
            const cls = col.key === 'name' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300';
            const safeValue = Utils.escapeHtml(displayVal);
            return `<td class="p-3.5 ${cls}">${col.key === 'name' ? `<button type="button" class="text-left underline underline-offset-2">${safeValue}</button>` : safeValue}</td>`;
          }).join('');
          return `<tr data-index="${i}" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">${cells}</tr>`;
        }).join('');
      }

      function sortFeatures(features, columns, sortConfig) {
        const sortCol = columns.find(column => column.key === sortConfig.key);
        if (!sortCol) return features;
        features.sort((a, b) => {
          const aVal = sortCol.getVal(a.properties);
          const bVal = sortCol.getVal(b.properties);

          const aMissing = aVal === null || aVal === undefined || (typeof aVal === 'number' && isNaN(aVal));
          const bMissing = bVal === null || bVal === undefined || (typeof bVal === 'number' && isNaN(bVal));
          if (aMissing || bMissing) {
            if (aMissing && bMissing) return 0;
            return aMissing ? 1 : -1;
          }

          if (typeof aVal === 'string' && typeof bVal === 'string') {
            const comparacao = aVal.localeCompare(bVal, 'pt-BR', { sensitivity: 'base' });
            return sortConfig.direction === 'asc' ? comparacao : -comparacao;
          }
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
        return features;
      }

      function updateTable() {
        const state = State.getState();
        if (state.dataError) return;
        if (state.viewMode !== 'tabela') return;
        const focusedKey = thead.contains(document.activeElement) ? document.activeElement.dataset.sortKey : null;
        const columns = ColumnSelectors.get(state);
        const filtered = sortFeatures(DataSelectors.getFilteredFeatures(state), columns, state.sortConfig);
        renderHeader(columns, state.sortConfig);
        renderBody(filtered, columns);
        if (focusedKey) Array.from(thead.querySelectorAll('[data-sort-key]')).find(button => button.dataset.sortKey === focusedKey)?.focus();
      }

      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th'); if (!th) return;
        const key = th.dataset.key; if (!key) return;
        const curr = State.get('sortConfig');
        State.set('sortConfig', { key, direction: (curr.key === key && curr.direction === 'asc') ? 'desc' : 'asc' });
      });

      searchInput.addEventListener('input', Utils.debounce(e => State.set('searchTerm', e.target.value), 150));
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-index]');
        if (!row) return;
        const feature = renderedFeatures[Number(row.dataset.index)];
        if (feature) State.set('selectedCity', feature.properties);
      });
      State.subscribe('searchTerm', value => { if (searchInput.value !== value) searchInput.value = value; });

      btnExport.addEventListener('click', async () => {
        btnExport.disabled = true;
        try {
        const XLSX = await loadSpreadsheet();
        const state = State.getState();
        const metric = MetricSelectors.get(state);
        const columns = ColumnSelectors.get(state);
        const filtered = sortFeatures(DataSelectors.getFilteredFeatures(state), columns, state.sortConfig);
        const dataToExport = filtered.map(f => {
          const row = {};
          columns.forEach(col => {
            const value = col.getVal(f.properties);
            row[col.label] = value === undefined ? null : value;
          });
          return row;
        });
        const formattedToExport = filtered.map(f => {
          const row = {};
          columns.forEach(col => row[col.label] = col.render(f.properties));
          return row;
        });
         const indicatorLabel = metric.title;
         const scaleMode = '-';
         const populationRangeLabel = state.populationBand === 'custom'
           ? `Personalizada (${state.populationMin === null ? 'sem mínimo' : fmtPtbrInt(state.populationMin)} a ${state.populationMax === null ? 'sem máximo' : fmtPtbrInt(state.populationMax)})`
           : state.populationBand;
         const metadata = [
           { Campo: 'Aba', Valor: state.activeTab },
           { Campo: 'Indicador', Valor: indicatorLabel },
            { Campo: 'Ano do Pobreza PBF', Valor: state.activeTab === 'pob' && state.pobIndicator === 'norm_pob_p1_p2' ? (state.pobPbfAno === 'diff' ? 'Diff 2026-2019' : state.pobPbfAno) : '-' },
          { Campo: 'Programa', Valor: state.activeTab === 'prog' ? PROGRAMAS[state.progPrograma] : '-' },
           { Campo: 'Status do programa', Valor: state.activeTab === 'prog' && state.progPrograma !== 'PLES' ? state.progStatus : '-' },
           { Campo: 'Indicador do Passe Livre Estudantil', Valor: state.activeTab === 'prog' && state.progPrograma === 'PLES' ? (PLES_COLUMN_LABELS[state.progPlesMetrica] || '-') : '-' },
           { Campo: 'Modo da escala', Valor: scaleMode },
           { Campo: 'Busca por município', Valor: state.searchTerm || '-' },
           { Campo: 'Status do indicador', Valor: state.riskFilter },
          { Campo: 'Faixa populacional', Valor: populationRangeLabel },
          { Campo: 'Registros exportados', Valor: filtered.length },
          { Campo: 'Metodologia', Valor: 'Percentuais municipais dos JSON; agregados calculados pela soma dos valores sobre a população com dados válidos. Zero é válido; null é desconhecido. Diferenças em p.p. sem arredondamento intermediário.' },
          { Campo: 'Municípios com indicador válido', Valor: DataSelectors.getTotals(filtered, metric).metricCount },
          { Campo: 'Data da exportação', Valor: new Date().toLocaleString('pt-BR') }
        ];
        const wb = XLSX.utils.book_new();
         XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataToExport), "Dados Numericos");
         XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formattedToExport), "Formatado");
         XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metadata), "Metadados");
         const exportDate = new Date();
         const exportDateLabel = `${exportDate.getFullYear()}-${String(exportDate.getMonth() + 1).padStart(2, '0')}-${String(exportDate.getDate()).padStart(2, '0')}`;
          XLSX.writeFile(wb, `Painel_Goias_${state.activeTab}_${exportDateLabel}.xlsx`);
        } catch (error) {
          window.alert(`Não foi possível exportar: ${error.message}`);
        } finally { btnExport.disabled = false; }
       });

      State.subscribe('viewMode', (mode) => { tableContainer.classList.toggle('hidden', mode !== 'tabela'); if (mode === 'tabela') updateTable(); });
      State.subscribe('pobIndicator', updateTable);
      State.subscribe('activeTab', updateTable); State.subscribe('searchTerm', updateTable); State.subscribe('sortConfig', updateTable); State.subscribe('pobPbfAno', updateTable);
         State.subscribe('riskFilter', updateTable); State.subscribe('populationBand', updateTable); State.subscribe('populationMin', updateTable); State.subscribe('populationMax', updateTable);
       State.subscribe('progPrograma', updateTable); State.subscribe('progStatus', updateTable); State.subscribe('progMetrica', updateTable); State.subscribe('progPlesMetrica', updateTable); State.subscribe('progMetricaModo', updateTable);
      return { updateTable };
    })();

export { TableModule };

let spreadsheetPromise;
function loadSpreadsheet() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!spreadsheetPromise) spreadsheetPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/vendor/xlsx.full.min.js';
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Biblioteca de exportação indisponível.'));
    script.onerror = () => { script.remove(); spreadsheetPromise = null; reject(new Error('Falha ao carregar a biblioteca de exportação.')); };
    document.head.append(script);
  });
  return spreadsheetPromise;
}
