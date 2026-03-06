/**
 * UI binding — reads inputs, updates DOM with results.
 */
const FireUI = (() => {

  let lifeEvents = [];

  function readInputs() {
    return {
      currentAge: num('currentAge'),
      targetAge: num('targetAge'),
      fireTarget: num('fireTarget'),
      pensionBalance: num('pensionBalance'),
      pensionContrib: num('pensionContrib'),
      employerContrib: num('employerContrib'),
      pensionReturn: num('pensionReturn'),
      isaBalance: num('isaBalance'),
      isaContrib: num('isaContrib'),
      isaReturn: num('isaReturn'),
      otherBalance: num('otherBalance'),
      otherContrib: num('otherContrib'),
      otherReturn: num('otherReturn'),
      statePensionEnabled: document.getElementById('statePensionEnabled').checked,
      statePensionAge: num('statePensionAge'),
      statePensionAmount: num('statePensionAmount'),
      inflation: num('futureInflation'),
      annualWithdrawal: num('annualWithdrawal'),
      drawdownReturn: num('drawdownReturn'),
      lifeEvents: readLifeEvents(),
    };
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
      atAge: num('currentAge') + 2,
      pensionContrib: 0,
      employerContrib: 0,
      isaContrib: 0,
      otherContrib: 0,
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
        <div class="field">
          <label>At Age</label>
          <input type="number" class="event-age" value="${defaults.atAge}" min="18" max="80">
        </div>
        <div class="field">
          <label>Pension Monthly (£)</label>
          <input type="number" class="event-pension" value="${defaults.pensionContrib}" min="0" step="50">
        </div>
        <div class="field">
          <label>Employer Monthly (£)</label>
          <input type="number" class="event-employer" value="${defaults.employerContrib}" min="0" step="50">
        </div>
        <div class="field">
          <label>ISA Monthly (£)</label>
          <input type="number" class="event-isa" value="${defaults.isaContrib}" min="0" step="50">
        </div>
        <div class="field">
          <label>Other Monthly (£)</label>
          <input type="number" class="event-other" value="${defaults.otherContrib}" min="0" step="50">
        </div>
      </div>`;

    container.appendChild(card);

    // Wire up remove button
    card.querySelector('.btn-remove').addEventListener('click', () => {
      card.remove();
      if (typeof window._fireRecalc === 'function') window._fireRecalc();
    });

    // Wire up inputs for live recalc
    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        if (typeof window._fireRecalc === 'function') window._fireRecalc();
      });
    });
  }

  function getAddEventBtn() {
    return document.getElementById('addEventBtn');
  }

  function num(id) {
    return parseFloat(document.getElementById(id).value) || 0;
  }

  function fmt(val) {
    return '£' + Math.round(val).toLocaleString('en-GB');
  }

  function updateResults(result) {
    if (!result) return;

    // FIRE target (user-set)
    const effectiveFireNumber = result.statePensionEnabled
      ? result.adjustedFireNumber : result.fireNumber;
    document.getElementById('fireNumber').textContent = fmt(effectiveFireNumber);

    // Years to FIRE
    if (result.fireYear !== null) {
      document.getElementById('yearsToFire').textContent = result.fireYear;
      document.getElementById('fireAge').textContent = result.currentAge + result.fireYear;
    } else {
      document.getElementById('yearsToFire').textContent = '>' + result.years;
      document.getElementById('fireAge').textContent = 'Not within range';
    }

    // Projected total at retirement age
    const lastYear = result.combined[result.combined.length - 1];
    document.getElementById('projectedTotal').textContent = fmt(lastYear.totalReal);

    // Coast FIRE
    document.getElementById('coastFireAge').textContent =
      result.coastFireAge !== null ? result.coastFireAge : '—';

    // Progress bar
    const progress = Math.min((lastYear.totalReal / effectiveFireNumber) * 100, 100);
    document.getElementById('progressPct').textContent = progress.toFixed(0) + '%';
    document.getElementById('progressFill').style.width = progress + '%';

    // Pot breakdown bars
    updatePotBars(result);

    // Milestones
    updateMilestones(result);

    // Chart
    FireChart.drawChart('fireChart', result);

    // Drawdown
    updateDrawdown(result);
  }

  function updateDrawdown(result) {
    const dd = result.drawdown;
    if (!dd) return;

    document.getElementById('drawdownStartPot').textContent = fmt(dd.startingPotReal);

    if (dd.runsOutAge !== null) {
      document.getElementById('runsOutAge').textContent = 'Age ' + dd.runsOutAge;
      document.getElementById('runsOutAge').style.color = '#f87171';
      document.getElementById('runsOutNote').textContent = 'Consider reducing withdrawals';
    } else {
      document.getElementById('runsOutAge').textContent = '100+';
      document.getElementById('runsOutAge').style.color = '#22c55e';
      document.getElementById('runsOutNote').textContent = 'Your money outlasts you 🎉';
    }

    // Real value of withdrawal at retirement start
    const yearsToRetire = result.targetAge - result.currentAge;
    const inf = result.inflation / 100;
    const realWithdrawal = dd.annualWithdrawal / Math.pow(1 + inf, yearsToRetire);
    document.getElementById('realWithdrawal').textContent = fmt(realWithdrawal);

    FireChart.drawDrawdownChart('drawdownChart', dd, result);
  }

  function updatePotBars(result) {
    const container = document.getElementById('potBars');
    const total = result.pension.real + result.isa.real + result.other.real;
    const maxBar = Math.max(result.pension.real, result.isa.real, result.other.real, 1);

    const pots = [
      { label: 'Pension', value: result.pension.real, cls: 'pension' },
      { label: 'ISA', value: result.isa.real, cls: 'isa' },
      { label: 'Other', value: result.other.real, cls: 'other' },
    ];

    container.innerHTML = pots.map(p => {
      const pct = (p.value / maxBar) * 100;
      return `
        <div class="pot-bar-row">
          <span class="pot-bar-label">${p.label}</span>
          <div class="pot-bar-track">
            <div class="pot-bar-fill ${p.cls}" style="width:${pct}%">${fmt(p.value)}</div>
          </div>
        </div>`;
    }).join('') + `
      <div class="pot-bar-row" style="margin-top:0.3rem">
        <span class="pot-bar-label" style="font-weight:600;color:#e2e8f0">Total</span>
        <span style="font-weight:700;color:#f59e0b;font-size:1.1rem">${fmt(total)}</span>
      </div>`;
  }

  function updateMilestones(result) {
    const list = document.getElementById('milestoneList');
    const milestones = [];

    // 100k milestone
    const hit100k = result.combined.find(d => d.totalReal >= 100000);
    if (hit100k) milestones.push({ icon: '💯', text: `Hit <span>£100k</span> at age <span>${hit100k.age}</span>` });

    // 250k
    const hit250k = result.combined.find(d => d.totalReal >= 250000);
    if (hit250k) milestones.push({ icon: '🎯', text: `Hit <span>£250k</span> at age <span>${hit250k.age}</span>` });

    // 500k
    const hit500k = result.combined.find(d => d.totalReal >= 500000);
    if (hit500k) milestones.push({ icon: '⭐', text: `Hit <span>£500k</span> at age <span>${hit500k.age}</span>` });

    // 1M
    const hit1m = result.combined.find(d => d.totalReal >= 1000000);
    if (hit1m) milestones.push({ icon: '🏆', text: `<span>Millionaire</span> at age <span>${hit1m.age}</span>` });

    // FIRE
    if (result.fireYear !== null) {
      milestones.push({ icon: '🔥', text: `<span>Financially independent</span> at age <span>${result.currentAge + result.fireYear}</span>` });
    }

    // Coast FIRE
    if (result.coastFireAge !== null) {
      milestones.push({ icon: '🏖️', text: `<span>Coast FIRE</span> reached at age <span>${result.coastFireAge}</span>` });
    }

    // State pension
    if (result.statePensionEnabled) {
      milestones.push({ icon: '🏛️', text: `State pension kicks in at age <span>${result.statePensionAge}</span> (${fmt(result.statePensionAnnual)}/yr)` });
    }

    // Life events
    if (result.lifeEvents) {
      result.lifeEvents.forEach(ev => {
        milestones.push({ icon: '⚡', text: `<span>${ev.name}</span> at age <span>${ev.atAge}</span>` });
      });
    }

    list.innerHTML = milestones.map(m =>
      `<div class="milestone-item">
        <span class="milestone-icon">${m.icon}</span>
        <span class="milestone-text">${m.text}</span>
      </div>`
    ).join('');
  }

  function populateInflationTable() {
    const tbody = document.querySelector('#inflationTable tbody');
    const data = FireEngine.getInflationHistory();
    tbody.innerHTML = data.map(d =>
      `<tr><td>${d.year}</td><td>${d.cpi.toFixed(1)}%</td></tr>`
    ).join('');
  }

  function toggleStatePensionFields(enabled) {
    const ageField = document.getElementById('statePensionAgeField');
    const amountField = document.getElementById('statePensionAmountField');
    ageField.style.opacity = enabled ? '1' : '0.4';
    amountField.style.opacity = enabled ? '1' : '0.4';
    ageField.querySelector('input').disabled = !enabled;
    amountField.querySelector('input').disabled = !enabled;
  }

  return { readInputs, updateResults, populateInflationTable, toggleStatePensionFields, addLifeEvent, getAddEventBtn };
})();
