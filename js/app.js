/**
 * App init — wire up events and run first calculation.
 */
(function () {
  function recalculate() {
    const inputs = FireUI.readInputs();
    const result = FireEngine.runProjection(inputs);
    FireUI.updateResults(result);
  }

  // Debounced version for slider/input events
  let timer = null;
  function debouncedRecalc() {
    clearTimeout(timer);
    timer = setTimeout(recalculate, 60);
  }

  window._fireRecalc = debouncedRecalc;

  // Bind static slider pairs (age, withdrawal, inflation, etc.)
  FireUI.bindAllSliders();

  // Create default pots (one of each)
  FireUI.addPot('pension');
  FireUI.addPot('isa');
  FireUI.addPot('other');

  // Wire "Add" buttons for each pot category
  document.querySelectorAll('.btn-add-pot').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      // New pots start with zero balances
      const zeros = { balance: 0, contrib: 0, employer: 0, 'return': 5 };
      const names = { pension: 'Pension ' + (document.querySelectorAll('.pot[data-pot-type="pension"]').length + 1),
                      isa: 'ISA ' + (document.querySelectorAll('.pot[data-pot-type="isa"]').length + 1),
                      other: 'Other ' + (document.querySelectorAll('.pot[data-pot-type="other"]').length + 1) };
      zeros.name = names[type] || 'New Pot';
      FireUI.addPot(type, zeros);
      recalculate();
    });
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

  // Resize
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
