/**
 * App init — wire up events and run first calculation.
 */
(function () {
  function recalculate() {
    const inputs = FireUI.readInputs();
    const result = FireEngine.runProjection(inputs);
    FireUI.updateResults(result);
  }

  // Expose for dynamically added event inputs
  window._fireRecalc = recalculate;

  // Debounce for smooth slider/input interaction
  let timer = null;
  function debouncedRecalc() {
    clearTimeout(timer);
    timer = setTimeout(recalculate, 80);
  }

  // Bind all inputs
  document.querySelectorAll('input[type="number"], select').forEach(el => {
    el.addEventListener('input', debouncedRecalc);
  });

  // State pension toggle
  const spToggle = document.getElementById('statePensionEnabled');
  spToggle.addEventListener('change', () => {
    FireUI.toggleStatePensionFields(spToggle.checked);
    recalculate();
  });

  // Add life event button
  FireUI.getAddEventBtn().addEventListener('click', () => {
    FireUI.addLifeEvent();
    recalculate();
  });

  // Inflation history toggle
  document.getElementById('toggleInflationHistory').addEventListener('click', function () {
    const panel = document.getElementById('inflationHistoryPanel');
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  // Resize chart on window resize
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(recalculate, 150);
  });

  // Init
  FireUI.populateInflationTable();
  FireUI.toggleStatePensionFields(spToggle.checked);
  recalculate();
})();
