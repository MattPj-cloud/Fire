/**
 * Canvas chart renderer for FIRE projections.
 */
const FireChart = (() => {

  const COLORS = {
    pension: '#3b82f6',
    isa: '#22c55e',
    other: '#a855f7',
    fireLine: '#ef4444',
    grid: 'rgba(255,255,255,0.06)',
    label: '#94a3b8',
    text: '#e2e8f0',
    statePension: '#f59e0b',
  };

  function drawChart(canvasId, result) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !result) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 25, right: 20, bottom: 35, left: 65 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const data = result.combined;
    const years = result.years;

    // Find max value for scale
    let maxVal = 0;
    for (const d of data) {
      const total = d.pension.real + d.isa.real + d.other.real;
      if (total > maxVal) maxVal = total;
    }
    maxVal = Math.max(maxVal, result.fireNumber) * 1.1;

    ctx.clearRect(0, 0, w, h);

    function toX(year) { return pad.left + (year / years) * plotW; }
    function toY(val) { return pad.top + plotH - (val / maxVal) * plotH; }

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridCount = 5;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridCount; i++) {
      const val = (maxVal / gridCount) * i;
      const gy = toY(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText('£' + formatK(val), pad.left - 8, gy + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const step = years <= 10 ? 1 : years <= 20 ? 2 : 5;
    for (let y = 0; y <= years; y += step) {
      const x = toX(y);
      ctx.fillStyle = COLORS.label;
      ctx.fillText('Age ' + (result.currentAge + y), x, h - 8);
    }

    // Stacked area: other (bottom), isa (middle), pension (top)
    // Draw in reverse order so pension is on top visually
    drawStackedArea(ctx, data, toX, toY, plotH, pad);

    // FIRE number line
    const fireTarget = result.fireNumber;
    const adjustedTarget = result.adjustedFireNumber;

    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;

    // Main FIRE line
    ctx.strokeStyle = COLORS.fireLine;
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(fireTarget));
    ctx.lineTo(w - pad.right, toY(fireTarget));
    ctx.stroke();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.fireLine;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('FIRE Target: £' + formatK(fireTarget), pad.left + 4, toY(fireTarget) - 6);

    // Adjusted FIRE line (with state pension)
    if (result.statePensionEnabled && adjustedTarget < fireTarget) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = COLORS.statePension;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, toY(adjustedTarget));
      ctx.lineTo(w - pad.right, toY(adjustedTarget));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.statePension;
      ctx.font = '10px system-ui';
      ctx.fillText('With State Pension: £' + formatK(adjustedTarget), pad.left + 4, toY(adjustedTarget) - 5);
    }

    // FIRE year marker
    if (result.fireYear !== null && result.fireYear <= years) {
      const fx = toX(result.fireYear);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(fx, pad.top);
      ctx.lineTo(fx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🔥 FIRE!', fx, pad.top - 6);
    }

    // Legend
    drawLegend(ctx, w, pad);
  }

  function drawStackedArea(ctx, data, toX, toY, plotH, pad) {
    const layers = [
      { key: 'other', color: COLORS.other },
      { key: 'isa', color: COLORS.isa },
      { key: 'pension', color: COLORS.pension },
    ];

    // Build cumulative stacks
    const stacks = data.map((d, i) => {
      const o = d.other.real;
      const is = d.isa.real;
      const p = d.pension.real;
      return [o, o + is, o + is + p];
    });

    // Draw from bottom to top
    for (let l = layers.length - 1; l >= 0; l--) {
      const topVals = stacks.map(s => s[l]);
      const bottomVals = l > 0 ? stacks.map(s => s[l - 1]) : stacks.map(() => 0);

      ctx.beginPath();
      ctx.moveTo(toX(0), toY(topVals[0]));
      for (let i = 1; i < data.length; i++) {
        ctx.lineTo(toX(data[i].year), toY(topVals[i]));
      }
      for (let i = data.length - 1; i >= 0; i--) {
        ctx.lineTo(toX(data[i].year), toY(bottomVals[i]));
      }
      ctx.closePath();
      ctx.fillStyle = layers[l].color + '55';
      ctx.fill();

      // Line on top
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(topVals[0]));
      for (let i = 1; i < data.length; i++) {
        ctx.lineTo(toX(data[i].year), toY(topVals[i]));
      }
      ctx.strokeStyle = layers[l].color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawLegend(ctx, w, pad) {
    const items = [
      { label: 'Pension', color: COLORS.pension },
      { label: 'ISA', color: COLORS.isa },
      { label: 'Other', color: COLORS.other },
    ];
    ctx.font = '10px system-ui';
    let x = w - pad.right;
    ctx.textAlign = 'right';
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const tw = ctx.measureText(item.label).width;
      ctx.fillStyle = item.color;
      ctx.fillRect(x - tw - 14, pad.top - 2, 10, 10);
      ctx.fillStyle = COLORS.label;
      ctx.fillText(item.label, x, pad.top + 7);
      x -= tw + 24;
    }
  }

  function formatK(val) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
    return Math.round(val).toString();
  }

  function drawDrawdownChart(canvasId, drawdown, result) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !drawdown) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 20, right: 20, bottom: 35, left: 65 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const data = drawdown.data;
    const totalYears = data.length - 1;

    let maxVal = 0;
    for (const d of data) {
      if (d.real > maxVal) maxVal = d.real;
    }
    maxVal = maxVal * 1.1 || 1;

    ctx.clearRect(0, 0, w, h);

    function toX(year) { return pad.left + (year / totalYears) * plotW; }
    function toY(val) { return pad.top + plotH - (val / maxVal) * plotH; }

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridCount = 4;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridCount; i++) {
      const val = (maxVal / gridCount) * i;
      const gy = toY(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText('£' + formatK(val), pad.left - 8, gy + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const step = totalYears <= 20 ? 5 : 10;
    for (let y = 0; y <= totalYears; y += step) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText('Age ' + data[y].age, toX(y), h - 8);
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, '#3b82f655');
    gradient.addColorStop(1, '#3b82f605');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].real));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(i), toY(Math.max(0, data[i].real)));
    }
    ctx.lineTo(toX(totalYears), pad.top + plotH);
    ctx.lineTo(toX(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line — green while pot > 0, red when depleted
    let lastPositiveIdx = data.length - 1;
    for (let i = 0; i < data.length; i++) {
      if (data[i].nominal <= 0) { lastPositiveIdx = i; break; }
    }

    // Green portion
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0].real));
    for (let i = 1; i <= lastPositiveIdx; i++) {
      ctx.lineTo(toX(i), toY(Math.max(0, data[i].real)));
    }
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Red portion (if any)
    if (lastPositiveIdx < data.length - 1) {
      ctx.beginPath();
      ctx.moveTo(toX(lastPositiveIdx), toY(0));
      for (let i = lastPositiveIdx; i < data.length; i++) {
        ctx.lineTo(toX(i), toY(0));
      }
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // "Runs out" marker
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('💸 Runs out age ' + data[lastPositiveIdx].age, toX(lastPositiveIdx), pad.top + plotH - 14);
    }

    // State pension age marker
    if (result.statePensionEnabled) {
      const spYear = result.statePensionAge - drawdown.retireAge;
      if (spYear > 0 && spYear < totalYears) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = COLORS.statePension;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toX(spYear), pad.top);
        ctx.lineTo(toX(spYear), pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.statePension;
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('State pension starts', toX(spYear), pad.top - 5);
      }
    }

    // Zero line
    ctx.strokeStyle = 'rgba(239,68,68,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(0));
    ctx.lineTo(w - pad.right, toY(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCashflowChart(canvasId, cashflow, targetIncome) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !cashflow || cashflow.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 25, right: 20, bottom: 35, left: 65 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const totalYears = cashflow.length - 1;

    // Find max value for scale
    let maxVal = 0;
    for (const row of cashflow) {
      if (row.totalIncome > maxVal) maxVal = row.totalIncome;
    }
    maxVal = Math.max(maxVal, targetIncome) * 1.15;

    ctx.clearRect(0, 0, w, h);

    function toX(i) { return pad.left + (i / totalYears) * plotW; }
    function toY(val) { return pad.top + plotH - (val / maxVal) * plotH; }

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const val = (maxVal / gridCount) * i;
      const gy = toY(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText('£' + formatK(val), pad.left - 8, gy + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const step = totalYears <= 20 ? 5 : 10;
    for (let i = 0; i <= totalYears; i += step) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText('Age ' + cashflow[i].age, toX(i), h - 8);
    }

    // Stacked areas: DC (bottom), DB (middle), State Pension (top)
    const layers = [
      { key: 'dcWithdrawal', color: '#3b82f6' },
      { key: 'dbIncome', color: '#22c55e' },
      { key: 'spIncome', color: '#f59e0b' },
    ];

    // Build cumulative stacks
    const stacks = cashflow.map(row => {
      const dc = row.dcWithdrawal;
      const db = row.dbIncome;
      const sp = row.spIncome;
      return [dc, dc + db, dc + db + sp];
    });

    // Draw from top to bottom so lower layers paint over
    for (let l = layers.length - 1; l >= 0; l--) {
      const topVals = stacks.map(s => s[l]);
      const bottomVals = l > 0 ? stacks.map(s => s[l - 1]) : stacks.map(() => 0);

      ctx.beginPath();
      ctx.moveTo(toX(0), toY(topVals[0]));
      for (let i = 1; i < cashflow.length; i++) {
        ctx.lineTo(toX(i), toY(topVals[i]));
      }
      for (let i = cashflow.length - 1; i >= 0; i--) {
        ctx.lineTo(toX(i), toY(bottomVals[i]));
      }
      ctx.closePath();
      ctx.fillStyle = layers[l].color + '55';
      ctx.fill();

      // Line on top
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(topVals[0]));
      for (let i = 1; i < cashflow.length; i++) {
        ctx.lineTo(toX(i), toY(topVals[i]));
      }
      ctx.strokeStyle = layers[l].color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Target income reference line
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(targetIncome));
    ctx.lineTo(w - pad.right, toY(targetIncome));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Target: £' + formatK(targetIncome) + '/yr', pad.left + 4, toY(targetIncome) - 6);

    // Legend
    const legendItems = [
      { label: 'DC Pot', color: '#3b82f6' },
      { label: 'DB Pension', color: '#22c55e' },
      { label: 'State Pension', color: '#f59e0b' },
    ];
    ctx.font = '10px system-ui';
    let lx = w - pad.right;
    ctx.textAlign = 'right';
    for (let i = legendItems.length - 1; i >= 0; i--) {
      const item = legendItems[i];
      const tw = ctx.measureText(item.label).width;
      ctx.fillStyle = item.color;
      ctx.fillRect(lx - tw - 14, pad.top - 2, 10, 10);
      ctx.fillStyle = COLORS.label;
      ctx.fillText(item.label, lx, pad.top + 7);
      lx -= tw + 24;
    }
  }

  return { drawChart, drawDrawdownChart, drawCashflowChart };
})();
