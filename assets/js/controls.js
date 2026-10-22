import { State, PLES_COLUMN_KEYS, PLES_COLUMN_LABELS } from './core.js';
import { MapModule } from './map.js';
    const HeaderModule = (function() {
      const btnDark = document.getElementById('btn-dark-toggle'), iconSun = document.getElementById('icon-sun'), iconMoon = document.getElementById('icon-moon'), btnKiosk = document.getElementById('btn-kiosk'), htmlEl = document.documentElement;
      function render(isDark) {
        btnDark.setAttribute('aria-pressed', String(isDark));
        if (isDark) { htmlEl.classList.add('dark'); iconSun.classList.remove('hidden'); iconMoon.classList.add('hidden'); }
        else { htmlEl.classList.remove('dark'); iconSun.classList.add('hidden'); iconMoon.classList.remove('hidden'); }
      }
      function renderKiosk(isKiosk) {
        document.body.classList.toggle('kiosk-mode', isKiosk);
        btnKiosk.setAttribute('aria-pressed', String(isKiosk));
        btnKiosk.innerHTML = isKiosk
          ? '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>'
          : '<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        btnKiosk.setAttribute('aria-label', isKiosk ? 'Sair do modo apresentação' : 'Modo apresentação');
        btnKiosk.title = isKiosk ? 'Sair do modo apresentação' : 'Modo apresentação (Tela Cheia)';
      }
      State.subscribe('isDark', render);
      State.subscribe('isKiosk', renderKiosk);
      btnDark.addEventListener('click', () => State.set('isDark', !State.get('isDark')));
      const fullscreenSupported = typeof document.body.requestFullscreen === 'function' && document.fullscreenEnabled === true;
      btnKiosk.disabled = !fullscreenSupported;
      let fullscreenPending = false;
      btnKiosk.addEventListener('click', async () => {
        if (!fullscreenSupported || fullscreenPending) return;
        fullscreenPending = true;
        try {
          if (State.get('isKiosk')) {
            if (document.fullscreenElement === document.body) {
              if (typeof document.exitFullscreen !== 'function') throw new Error('Fullscreen exit unavailable');
              await document.exitFullscreen();
            }
            State.set('isKiosk', false);
            renderKiosk(false);
            MapModule.refreshAfterPresentation();
          } else {
            await document.body.requestFullscreen();
            if (document.fullscreenElement !== document.body) return;
            State.set('viewMode', 'mapa');
            State.set('isKiosk', true);
            renderKiosk(true);
            MapModule.fitPresentation();
            window.dispatchEvent(new Event('resize'));
          }
        } catch {
          State.set('isKiosk', document.fullscreenElement === document.body);
          window.alert('Não foi possível alterar a tela cheia. Use Escape para sair ou verifique as permissões do navegador.');
        } finally {
          fullscreenPending = false;
        }
      });
      document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement !== document.body && State.get('isKiosk')) {
          State.set('isKiosk', false);
          renderKiosk(false);
          MapModule.refreshAfterPresentation();
        }
      });
      render(State.get('isDark'));
      renderKiosk(State.get('isKiosk'));
      if (!fullscreenSupported) btnKiosk.title = 'Tela cheia indisponível neste navegador ou contexto';
    })();

    // Sidebar Controls
    const SidebarModule = (function() {
      const tabs = { pob: document.getElementById('tab-pob'), prog: document.getElementById('tab-prog') };
      const panels = { pob: document.getElementById('panel-pob'), prog: document.getElementById('panel-prog') };
      const viewBtns = { mapa: document.getElementById('view-mapa'), tabela: document.getElementById('view-tabela'), scatter: document.getElementById('view-scatter') };
      const sidebar = document.getElementById('sidebar'), collapseSidebarButton = document.getElementById('btn-collapse-sidebar');
      
       const selPobInd = document.getElementById('sel-pob-ind'), selPobPal = document.getElementById('sel-pob-pal');
         const selProgProg = document.getElementById('sel-prog-programa'), selProgStatus = document.getElementById('sel-prog-status'), selProgMetrica = document.getElementById('sel-prog-metrica'), selProgPlesMetrica = document.getElementById('sel-prog-ples-metrica'), selProgPal = document.getElementById('sel-prog-pal');
         const progStatusControl = document.getElementById('prog-status-control'), progMetricaControl = document.getElementById('prog-metrica-control'), progPlesMetricaControl = document.getElementById('prog-ples-metrica-control');

       function syncPovertyIndicatorDescription() {
         const selectedOption = selPobInd.options[selPobInd.selectedIndex];
         selPobInd.title = selectedOption ? selectedOption.title : '';
       }
       function setSidebarCollapsed(isCollapsed) {
         sidebar.classList.toggle('sidebar-collapsed', isCollapsed);
         const label = isCollapsed ? 'Reabrir configurações' : 'Recolher configurações';
         collapseSidebarButton.textContent = isCollapsed ? '+' : '−';
         collapseSidebarButton.setAttribute('aria-expanded', String(!isCollapsed));
         collapseSidebarButton.setAttribute('aria-label', label);
         collapseSidebarButton.title = label;
       }
      function updateActiveTab(activeTab) {
        Object.keys(tabs).forEach(k => { 
          const a = k === activeTab; 
          tabs[k].classList.toggle('bg-white', a); 
          tabs[k].classList.toggle('dark:bg-slate-950', a); 
          tabs[k].classList.toggle('shadow', a); 
          tabs[k].classList.toggle('text-emerald-600', a); 
          tabs[k].classList.toggle('dark:text-emerald-400', a); 
          tabs[k].classList.toggle('text-slate-600', !a); 
          tabs[k].classList.toggle('dark:text-slate-400', !a); 
           tabs[k].setAttribute('aria-selected', a); 
           tabs[k].tabIndex = a ? 0 : -1;
           panels[k].classList.toggle('hidden', !a); 
        });
      }
       function updateViewMode(mode) {
         document.body.dataset.viewMode = mode;
         Object.keys(viewBtns).forEach(k => { const a = k === mode; viewBtns[k].classList.toggle('bg-white', a); viewBtns[k].classList.toggle('dark:bg-slate-900', a); viewBtns[k].classList.toggle('shadow', a); viewBtns[k].classList.toggle('text-emerald-600', a); viewBtns[k].classList.toggle('dark:text-emerald-400', a); viewBtns[k].classList.toggle('text-slate-500', !a); viewBtns[k].setAttribute('aria-pressed', a); });
       }
         function updateScatterVisibility(activeTab) {
          const isProgramMode = activeTab === 'prog';
          viewBtns.scatter.classList.toggle('hidden', !isProgramMode);
          viewBtns.scatter.classList.toggle('flex', isProgramMode);
          if (!isProgramMode && State.get('viewMode') === 'scatter') State.set('viewMode', 'mapa');
        }
          function updateProgramControls(programa) {
           const isPles = programa === 'PLES';
           if (progStatusControl) progStatusControl.classList.toggle('hidden', isPles);
           if (progMetricaControl) progMetricaControl.classList.toggle('hidden', isPles);
           if (progPlesMetricaControl) progPlesMetricaControl.classList.toggle('hidden', !isPles);

           if (selProgPlesMetrica) {
             const current = State.get('progPlesMetrica');
             selProgPlesMetrica.replaceChildren(...PLES_COLUMN_KEYS.map(key => new Option(PLES_COLUMN_LABELS[key], key)));
             const selectedKey = PLES_COLUMN_LABELS[current] ? current : (PLES_COLUMN_KEYS[0] || '');
             selProgPlesMetrica.value = selectedKey;
             if (selectedKey !== current) State.set('progPlesMetrica', selectedKey);
           }

           const isCAUT = programa === 'CAUT';
           Array.from(selProgStatus.options).forEach(option => { option.hidden = isCAUT && option.value !== 'Ativo'; });
           if (isCAUT && State.get('progStatus') !== 'Ativo') State.set('progStatus', 'Ativo');
         }
      // Reset de município ao trocar aba
        State.subscribe('activeTab', (val) => { updateActiveTab(val); updateScatterVisibility(val); State.set('selectedCity', null); });
       State.subscribe('viewMode', updateViewMode);
       State.subscribe('isKiosk', setSidebarCollapsed);
      
       State.subscribe('pobIndicator', v => { selPobInd.value = v; syncPovertyIndicatorDescription(); }); State.subscribe('pobPalette', v => selPobPal.value = v);
       State.subscribe('progPrograma', v => { selProgProg.value = v; updateProgramControls(v); }); State.subscribe('progStatus', v => selProgStatus.value = v); State.subscribe('progMetrica', v => selProgMetrica.value = v); State.subscribe('progPlesMetrica', v => { if (selProgPlesMetrica) selProgPlesMetrica.value = v; }); State.subscribe('progPalette', v => selProgPal.value = v);
      
      tabs.pob.addEventListener('click', () => State.set('activeTab', 'pob')); 
       tabs.prog.addEventListener('click', () => State.set('activeTab', 'prog'));
        Object.values(tabs).forEach((button, index) => button.addEventListener('keydown', event => {
         const keys = Object.keys(tabs);
         let next;
         if (event.key === 'ArrowRight') next = keys[(index + 1) % keys.length];
         else if (event.key === 'ArrowLeft') next = keys[(index + keys.length - 1) % keys.length];
         else if (event.key === 'Home') next = keys[0];
         else if (event.key === 'End') next = keys[keys.length - 1];
         else return;
         event.preventDefault();
         State.set('activeTab', next);
         tabs[next].focus();
       }));
       collapseSidebarButton.addEventListener('click', () => {
         setSidebarCollapsed(!sidebar.classList.contains('sidebar-collapsed'));
         window.dispatchEvent(new Event('resize'));
       });
        viewBtns.mapa.addEventListener('click', () => State.set('viewMode', 'mapa')); 
        viewBtns.tabela.addEventListener('click', () => State.set('viewMode', 'tabela'));
        viewBtns.scatter.addEventListener('click', () => State.set('viewMode', 'scatter'));
      
       selPobInd.addEventListener('change', e => State.set('pobIndicator', e.target.value)); 
      selPobPal.addEventListener('change', e => State.set('pobPalette', e.target.value));
       selProgProg.addEventListener('change', e => {
         State.set('progPrograma', e.target.value);
       });
       selProgStatus.addEventListener('change', e => State.set('progStatus', e.target.value));
       selProgMetrica.addEventListener('change', e => State.set('progMetrica', e.target.value));
       if (selProgPlesMetrica) selProgPlesMetrica.addEventListener('change', e => State.set('progPlesMetrica', e.target.value));
       selProgPal.addEventListener('change', e => State.set('progPalette', e.target.value));
        updateProgramControls(State.get('progPrograma'));
        updateActiveTab(State.get('activeTab'));
        updateScatterVisibility(State.get('activeTab'));
        updateViewMode(State.get('viewMode'));
        selPobInd.value = State.get('pobIndicator');
        selPobPal.value = State.get('pobPalette');
        selProgProg.value = State.get('progPrograma');
        selProgStatus.value = State.get('progStatus');
        selProgMetrica.value = State.get('progMetrica');
        selProgPal.value = State.get('progPalette');
        syncPovertyIndicatorDescription();
     })();

export { HeaderModule, SidebarModule };
