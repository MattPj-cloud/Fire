/**
 * UI binding — reads inputs, updates DOM with results.
 * Handles slider↔number syncing, dynamic savings pots, and result rendering.
 */
const FireUI = (() => {

  let potCounter = 0; // unique ID for each pot card

  /**
   * Sync a range slider and its paired number input within a container.
   */
  function syncPair(range, num) {
      function fire() {
        if (typeof window._fireRecalc === 'function') window._fireRecalc();
      }
      range.addEventListener('input', () => { num.value = range.value; fire(); });
      range.addEventListener('change', () => { num.value = range.value; fire(); });
      num.addEventListener('input', () => {
        const v = parseFloat(num.value) || 0;
        range.value = Math.min(Math.max(v, parseFloat(range.min)), parseFloat(range.max));
        fire();
      });
      num.addEventListener('change', () => {
        const v = parseFloat(num.value) || 0;
        range.value = Math.min(Math.max(v, parseFloat(range.min)), parseFloat(range.max));
        fire();
      });
    }


  /** Bind a slider pair by ID convention: range "foo", number "fooNum" */
  function syncSliderPair(rangeId) {
    const range = document.getElementById(rangeId);
    const num = document.getElementById(rangeId + 'Num');
    if (range && num) syncPair(range, num);
  }

  /** Bind all static (non-pot) slider pairs */
  function bindAllSliders() {
    ['currentAge', 'targetAge', 'annualWithdrawal', 'drawdownReturn',
     'statePensionAge', 'statePensionAmount', 'futureInflation'
    ].forEach(syncSliderPair);
  }

  /** Wire up all slider pairs inside a DOM element */
  function bindSlidersIn(el) {
    el.querySelectorAll('.slider-row').forEach(row => {
      const range = row.querySelector('input[type="range"]');
      const num = row.querySelector('input.num-input');
      if (range && num) syncPair(range, num);
    });
  }


  // ── Dynamic Savings Pots ──

  const POT_TEMPLATES = {
    pension: {
      defaultName: 'Workplace Pension',
      fields: [
        { label: 'Current Balance (£)', key: 'balance', min: 0, max: 500000, step: 1000, val: 45000, numMax: 2000000 },
        { label: 'Your Monthly Contribution (£)', key: 'contrib', min: 0, max: 3000, step: 25, val: 500, numMax: 10000 },
        { label: 'Employer Monthly (£)', key: 'employer', min: 0, max: 3000, step: 25, val: 250, numMax: 10000 },
        { label: 'Expected Return (%)', key: 'return', min: 0, max: 15, step: 0.5, val: 7, numMax: 20 },
      ],
    },
    isa: {
      defaultName: 'Stocks & Shares ISA',
      fields: [
        { label: 'Current Balance (£)', key: 'balance', min: 0, max: 500000, step: 1000, val: 20000, numMax: 2000000 },
        { label: 'Monthly Contribution (£)', key: 'contrib', min: 0, max: 1700, step: 25, val: 400, numMax: 5000 },
        { label: 'Expected Return (%)', key: 'return', min: 0, max: 15, step: 0.5, val: 6, numMax: 20 },
      ],
    },
    other: {
      defaultName: 'Savings Account',
      fields: [
        { label: 'Current Balance (£)', key: 'balance', min: 0, max: 500000, step: 1000, val: 10000, numMax: 2000000 },
        { label: 'Monthly Contribution (£)', key: 'contrib', min: 0, max: 3000, step: 25, val: 200, numMax: 10000 },
        { label: 'Expected Return (%)', key: 'return', min: 0, max: 15, step: 0.5, val: 4, numMax: 20 },
      ],
    },
  };

  function addPot(type, values) {
    const tpl = POT_TEMPLATES[type];
    if (!tpl) return;
    potCounter++;
    const id = potCounter;
    const listEl = document.getElementById(type + 'List');

    const card = document.createElement('div');
    card.className = 'pot';
    card.dataset.potType = type;
    card.dataset.potId = id;

    const name = (values && values.name) || tpl.defaultName;

    let fieldsHTML = '';
    tpl.fields.forEach(f => {
      const v = (values && values[f.key] !== undefined) ? values[f.key] : f.val;
      fieldsHTML += `
        <div class="field">
          <label>${f.label}</label>
          <div class="slider-row">
            <input type="range" class="pot-${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}">
            <input type="number" class="num-input pot-${f.key}-num" min="${f.min}" max="${f.numMax}" step="${f.step}" value="${v}">
          </div>
        </div>`;
    });

    card.innerHTML = `
      <div class="pot-header">
        <input type="text" class="pot-name" value="${name}" placeholder="${tpl.defaultName}">
        <button type="button" class="btn-remove" aria-label="Remove pot">✕</button>
      </div>
      <div class="form-grid">${fieldsHTML}</div>`;

    listEl.appendChild(card);

    // Wire remove
    card.querySelector('.btn-remove').addEventListener('click', () => {
      card.remove();
      if (typeof window._fireRecalc === 'function') window._fireRecalc();
    });

    // Wire sliders
    bindSlidersIn(card);

    // Wire name input for recalc (not strictly needed but keeps things consistent)
    card.querySelector('.pot-name').addEventListener('input', () => {
      if (typeof window._fireRecalc === 'function') window._fireRecalc();
    });

    return card;
  }

  /** Read all pots of a given type from the DOM */
  function readPots(type) {
    const cards = document.querySelectorAll(`.pot[data-pot-type="${type}"]`);
    const pots = [];
    cards.forEach(card => {
      const pot = { name: card.querySelector('.pot-name').value };
      const tpl = POT_TEMPLATES[type];
      tpl.fields.forEach(f => {
        const range = card.querySelector('.pot-' + f.key);
        pot[f.key] = parseFloat(range.value) || 0;
      });
      pots.push(pot);
    });
    return pots;
  }


  // ── Inputs ──

  function readInputs() {
    const pensions = readPots('pension');
    const isas = readPots('isa');
    const others = readPots('other');

    // Aggregate per category for the engine (keeps the interface stable)
    return {
      currentAge: val('currentAge'),
      targetAge: val('targetAge'),
      // Aggregated pension: sum balances & contribs, weighted-average return
      pensionBalance: pensions.reduce((s, p) => s + p.balance, 0),
      pensionContrib: pensions.reduce((s, p) => s + p.contrib, 0),
      employerContrib: pensions.reduce((s, p) => s + (p.employer || 0), 0),
      pensionReturn: weightedReturn(pensions),
      // Aggregated ISA
      isaBalance: isas.reduce((s, p) => s + p.balance, 0),
      isaContrib: isas.reduce((s, p) => s + p.contrib, 0),
      isaReturn: weightedReturn(isas),
      // Aggregated Other
      otherBalance: others.reduce((s, p) => s + p.balance, 0),
      otherContrib: others.reduce((s, p) => s + p.contrib, 0),
      otherReturn: weightedReturn(others),
      // Rest
      statePensionEnabled: document.getElementById('statePensionEnabled').checked,
      statePensionAge: val('statePensionAge'),
      statePensionAmount: val('statePensionAmount'),
      inflation: val('futureInflation'),
      annualWithdrawal: val('annualWithdrawal'),
      drawdownReturn: val('drawdownReturn'),
      lifeEvents: readLifeEvents(),
      // Pass individual pots for detailed breakdown
      _pensions: pensions,
      _isas: isas,
      _others: others,
    };
  }

  /** Weighted average return by balance. Falls back to simple average if all balances are 0. */
  function weightedReturn(pots) {
    if (pots.length === 0) return 0;
    const totalBal = pots.reduce((s, p) => s + p.balance, 0);
    if (totalBal === 0) {
      return pots.reduce((s, p) => s + (p['return'] || 0), 0) / pots.length;
    }
    return pots.reduce((s, p) => s + (p['return'] || 0) * p.balance, 0) / totalBal;
  }

  function readLifeEvents() {
    const cards = document.querySelectorAll('.event-card');
    const events = [];
    cards.forEach(card => {
      events.push({
        name: card.querySelector('.event-name').value,
        atAge: parseFloat(card.querySelector('.event-age').value) || 0,
        pensionContrib: parseFloat(card.querySelector('.event-pension').value) || 0,
        employerContrib: parseFloat(card.querySelector('.event-employer').value) || 0,
        isaContrib: parseFloat(card.querySelector('.event-isa').value) || 0,
        otherContrib: parseFloat(card.querySelector('.event-other').value) || 0,
      });
    });
    return events;
  }

  function addLifeEvent(data) {
    const defaults = data || {
      name: 'Redundancy',
      atAge: val('currentAge') + 2,
      pensionContrib: 0, employerContrib: 0, isaContrib: 0, otherContrib: 0,
    };

    const container = document.getElementById('eventsList');
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <div class="event-header">
        <input type="text" class="event-name" value="${defaults.name}" placeholder="Event name">
        <button type="button" class="btn-remove" aria-label="Remove event">✕ Remove</button>
      </div>
      <div class="form-grid">
        <div class="field"><label>At Age</label><input type="number" class="event-age" value="${defaults.atAge}" min="18" max="80"></div>
        <div class="field"><label>Pension Monthly (£)</label><input type="number" class="event-pension" value="${defaults.pensionContrib}" min="0" step="50"></div>
        <div class="field"><label>Employer Monthly (£)</label><input type="number" class="event-employer" value="${defaults.employerContrib}" min="0" step="50"></div>
        <div class="field"><label>ISA Monthly (£)</label><input type="number" class="event-isa" value="${defaults.isaContrib}" min="0" step="50"></div>
        <div class="field"><label>Other Monthly (£)</label><input type="number" class="event-other" value="${defaults.otherContrib}" min="0" step="50"></div>
      </div>`;
    container.appendChild(card);

    card.querySelector('.btn-remove').addEventListener('click', () => {
      card.remove();
      if (typeof window._fireRecalc === 'function') window._fireRecalc();
    });
    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        if (typeof window._fireRecalc === 'function') window._fireRecalc();
      });
    });
  }

  function getAddEventBtn() { return document.getElementById('addEventBtn'); }

  function val(id) {
    const el = document.getElementById(id);
    return parseFloat(el.value) || 0;
  }

  function fmt(v) { return '£' + Math.round(v).toLocaleString('en-GB'); }


  // ── Results ──

  function updateResults(result) {
    if (!result) return;

    const effectiveFireNumber = result.statePensionEnabled
      ? result.adjustedFireNumber : result.fireNumber;

    // Headline
    const headlineEl = document.getElementById('headlineText');
    if (result.fireYear !== null) {
      const fireAge = result.currentAge + result.fireYear;
      const cls = result.fireYear <= 10 ? 'good' : result.fireYear <= 20 ? 'warn' : 'bad';
      headlineEl.innerHTML = `You could be financially independent at age <span class="${cls}">${fireAge}</span>, ` +
        `needing a pot of <span class="${cls}">${fmt(effectiveFireNumber)}</span> to withdraw ` +
        `<span>${fmt(result.drawdown.annualWithdrawal)}</span>/yr.`;
    } else {
      headlineEl.innerHTML = `At your current savings rate, you <span class="bad">won't reach FIRE</span> by age ${result.targetAge}. ` +
        `Try increasing contributions or reducing your withdrawal target.`;
    }

    document.getElementById('fireNumber').textContent = fmt(effectiveFireNumber);

    if (result.fireYear !== null) {
      document.getElementById('yearsToFire').textContent = result.fireYear;
      document.getElementById('fireAge').textContent = result.currentAge + result.fireYear;
    } else {
      document.getElementById('yearsToFire').textContent = '>' + result.years;
      document.getElementById('fireAge').textContent = 'Not within range';
    }

    const lastYear = result.combined[result.combined.length - 1];
    document.getElementById('projectedTotal').textContent = fmt(lastYear.totalReal);

    const dd = result.drawdown;
    if (dd.runsOutAge !== null) {
      document.getElementById('runsOutAge').textContent = 'Age ' + dd.runsOutAge;
      document.getElementById('runsOutAge').style.color = '#f87171';
      document.getElementById('runsOutNote').textContent = 'Consider reducing withdrawals';
    } else {
      document.getElementById('runsOutAge').textContent = '100+';
      document.getElementById('runsOutAge').style.color = '#22c55e';
      document.getElementById('runsOutNote').textContent = 'Your money outlasts you 🎉';
    }

    updateWhatIf(result);
    updatePotBars(result);
    updateMilestones(result);
    FireChart.drawChart('fireChart', result);
    FireChart.drawDrawdownChart('drawdownChart', dd, result);
  }

  function updateWhatIf(result) {
    const container = document.getElementById('whatIf');
    if (!result.whatIf || result.whatIf.length === 0) { container.innerHTML = ''; return; }

    const currentFireYear = result.fireYear;
    const currentRunsOut = result.drawdown.runsOutAge;

    const items = result.whatIf.map(w => {
      const parts = [];
      if (w.fireAge !== null && currentFireYear !== null) {
        const diff = (result.currentAge + currentFireYear) - w.fireAge;
        if (diff > 0) parts.push(`retire <span>${diff} year${diff > 1 ? 's' : ''} earlier</span> (age ${w.fireAge})`);
      } else if (w.fireAge !== null && currentFireYear === null) {
        parts.push(`could reach FIRE at age <span>${w.fireAge}</span>`);
      }
      if (w.runsOutAge === null && currentRunsOut !== null) {
        parts.push(`money <span>never runs out</span>`);
      } else if (w.runsOutAge !== null && currentRunsOut !== null && w.runsOutAge > currentRunsOut) {
        const extra = w.runsOutAge - currentRunsOut;
        parts.push(`money lasts <span>${extra} extra year${extra > 1 ? 's' : ''}</span>`);
      }
      if (parts.length === 0) return '';
      return `<div class="what-if-item">💡 Withdraw ${fmt(w.reducedWithdrawal)}/yr instead (${fmt(w.delta)} less): ${parts.join(' and ')}</div>`;
    }).filter(Boolean);

    container.innerHTML = items.join('');
  }


  function updatePotBars(result) {
    const container = document.getElementById('potBars');
    const maxBar = Math.max(result.pension.real, result.isa.real, result.other.real, 1);
    const total = result.pension.real + result.isa.real + result.other.real;

    const pots = [
      { label: 'Pension', value: result.pension.real, cls: 'pension' },
      { label: 'ISA', value: result.isa.real, cls: 'isa' },
      { label: 'Other', value: result.other.real, cls: 'other' },
    ];

    container.innerHTML = pots.map(p => {
      const pct = (p.value / maxBar) * 100;
      return `<div class="pot-bar-row">
          <span class="pot-bar-label">${p.label}</span>
          <div class="pot-bar-track"><div class="pot-bar-fill ${p.cls}" style="width:${pct}%">${fmt(p.value)}</div></div>
        </div>`;
    }).join('') + `<div class="pot-bar-row" style="margin-top:0.3rem">
        <span class="pot-bar-label" style="font-weight:600;color:#e2e8f0">Total</span>
        <span style="font-weight:700;color:#f59e0b;font-size:1.1rem">${fmt(total)}</span>
      </div>`;
  }

  function updateMilestones(result) {
    const list = document.getElementById('milestoneList');
    const milestones = [];

    const hit100k = result.combined.find(d => d.totalReal >= 100000);
    if (hit100k) milestones.push({ icon: '💯', text: `Hit <span>£100k</span> at age <span>${hit100k.age}</span>` });
    const hit250k = result.combined.find(d => d.totalReal >= 250000);
    if (hit250k) milestones.push({ icon: '🎯', text: `Hit <span>£250k</span> at age <span>${hit250k.age}</span>` });
    const hit500k = result.combined.find(d => d.totalReal >= 500000);
    if (hit500k) milestones.push({ icon: '⭐', text: `Hit <span>£500k</span> at age <span>${hit500k.age}</span>` });
    const hit1m = result.combined.find(d => d.totalReal >= 1000000);
    if (hit1m) milestones.push({ icon: '🏆', text: `<span>Millionaire</span> at age <span>${hit1m.age}</span>` });
    if (result.fireYear !== null) milestones.push({ icon: '🔥', text: `<span>Financially independent</span> at age <span>${result.currentAge + result.fireYear}</span>` });
    if (result.coastFireAge !== null) milestones.push({ icon: '🏖️', text: `<span>Coast FIRE</span> reached at age <span>${result.coastFireAge}</span>` });
    if (result.statePensionEnabled) milestones.push({ icon: '🏛️', text: `State pension kicks in at age <span>${result.statePensionAge}</span> (${fmt(result.statePensionAnnual)}/yr)` });
    if (result.lifeEvents) result.lifeEvents.forEach(ev => milestones.push({ icon: '⚡', text: `<span>${ev.name}</span> at age <span>${ev.atAge}</span>` }));

    list.innerHTML = milestones.map(m =>
      `<div class="milestone-item"><span class="milestone-icon">${m.icon}</span><span class="milestone-text">${m.text}</span></div>`
    ).join('');
  }

  function populateInflationTable() {
    const tbody = document.querySelector('#inflationTable tbody');
    const data = FireEngine.getInflationHistory();
    tbody.innerHTML = data.map(d => `<tr><td>${d.year}</td><td>${d.cpi.toFixed(1)}%</td></tr>`).join('');
  }

  function toggleStatePensionFields(enabled) {
    const ageField = document.getElementById('statePensionAgeField');
    const amountField = document.getElementById('statePensionAmountField');
    ageField.style.opacity = enabled ? '1' : '0.4';
    amountField.style.opacity = enabled ? '1' : '0.4';
    ageField.querySelectorAll('input').forEach(i => i.disabled = !enabled);
    amountField.querySelectorAll('input').forEach(i => i.disabled = !enabled);
  }

  return {
    readInputs, updateResults, populateInflationTable, toggleStatePensionFields,
    addLifeEvent, getAddEventBtn, bindAllSliders, addPot,
  };
})();
