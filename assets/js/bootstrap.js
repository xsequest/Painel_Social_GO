function showError(error) {
  console.error('[Inicializacao]', error);
  const main = document.getElementById('main-layout');
  main.replaceChildren();
  const section = document.createElement('section');
  section.setAttribute('role', 'alert');
  section.style.cssText = 'margin:auto;padding:2rem;max-width:48rem;font:16px/1.6 system-ui';
  const title = document.createElement('h1');
  title.textContent = 'Nao foi possivel inicializar o Painel Goias';
  const message = document.createElement('p');
  message.textContent = error.message;
  const help = document.createElement('p');
  help.textContent = 'Abra esta pasta em um servidor HTTP local: npm start. Acesse http://localhost:8080/mapa_calor_v0.10.21.html. Verifique se assets e output acompanham o HTML.';
  section.append(title, message, help);
  main.append(section);
}

function installModalAccessibility() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
  const main = document.getElementById('main-layout');
  let activeDialog = null;
  const reconcile = () => {
    activeDialog = dialogs.find(dialog => !dialog.classList.contains('hidden')) || null;
    main.inert = Boolean(activeDialog);
    dialogs.forEach(dialog => { dialog.inert = Boolean(activeDialog && activeDialog !== dialog); });
  };
  dialogs.forEach(dialog => new MutationObserver(reconcile).observe(dialog, { attributes: true, attributeFilter: ['class'] }));
  document.addEventListener('keydown', event => {
    reconcile();
    if (event.key !== 'Tab' || !activeDialog) return;
    const focusable = Array.from(activeDialog.querySelectorAll('button, select, input, a[href], [tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.disabled && !element.closest('[inert]') && element.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); activeDialog.tabIndex = -1; activeDialog.focus(); return; }
    const index = focusable.indexOf(document.activeElement);
    if (index < 0 || (!event.shiftKey && index === focusable.length - 1) || (event.shiftKey && index === 0)) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  }, true);
  reconcile();
}

try {
  if (location.protocol === 'file:') throw new Error('O carregamento dos arquivos JSON requer HTTP, nao file://.');
  const dependencies = { Leaflet: window.L, chroma: window.chroma, 'Chart.js': window.Chart, TopoJSON: window.topojson };
  const missing = Object.entries(dependencies).filter(([, dependency]) => !dependency).map(([name]) => name);
  if (missing.length) throw new Error(`Bibliotecas locais indisponiveis: ${missing.join(', ')}. Execute npm install e npm run build.`);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => { window.Chart.defaults.animation = motion.matches ? false : { duration: 500 }; };
  syncMotion();
  motion.addEventListener('change', syncMotion);
  const { loadData } = await import('./data.js');
  await loadData();
  installModalAccessibility();
  await import('./app.js');
} catch (error) { showError(error); }
