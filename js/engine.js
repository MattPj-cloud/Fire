/**
 * FIRE Calculator Engine
 * All projection and calculation logic lives here.
 */
const FireEngine = (() => {

  // UK CPI inflation history (annual average %)
  const UK_INFLATION = [
    { year: 2024, cpi: 2.5 }, { year: 2023, cpi: 7.3 }, { year: 2022, cpi: 9.1 },
    { year: 2021, cpi: 2.6 }, { year: 2020, cpi: 0.9 }, { year: 2019, cpi: 1.8 },
    { year: 2018, cpi: 2.5 }, { year: 2017, cpi: 2.7 }, { year: 2016, cpi: 0.7 },
    { year: 2015, cpi: 0.0 }, { year: 2014, cpi: 1.5 }, { year: 2013, cpi: 2.6 },
    { year: 2012, cpi: 2.8 }, { year: 2011, cpi: 4.5 }, { year: 2010, cpi: 3.3 },
    { year: 2009, cpi: 2.2 }, { year: 2008, cpi: 3.6 }, { year: 2007, cpi: 2.3 },
    { year: 2006, cpi: 2.3 }, { year: 2005, cpi: 2.1 }, { year: 2004, cpi: 1.3 },
    { year: 2003, cpi: 1.4 }, { year: 2002, cpi: 1.3 }, { year: 2001, cpi: 1.2 },
    { year: 2000, cpi: 0.8 },
  ];

  function getInflationHistory() {
    return UK_INFLATION;
  }

  /**
   * Project a single pot forward year by year, with contribution changes at life events.
   */
  function projectPot(balance, baseMonthlyContrib, annualReturn, years, inflation, events) {
    const data = [];
    let nominal = balance;
    const r = annualReturn / 100;
    const inf = inflation / 100;

    for (let y = 0; y <= years; y++) {
      const realValue = nominal / Math.pow(1 + inf, y);
      data.push({ year: y, nominal, real: realValue });
      if (y < years) {
        let contrib = baseMonthlyContrib;
        for (const ev of events) {
          if (y >= ev.fromYear) contrib = ev.monthlyContrib;
        }
        nominal = (nominal + contrib * 12) * (1 + r);
      }
    }
    return data;
  }


  /**
   * Full FIRE projection combining all pots.
   * FIRE number is now CALCULATED from annual withdrawal using 4% SWR.
   */
  function runProjection(inputs) {
    const years = inputs.targetAge - inputs.currentAge;
    if (years <= 0) return null;

    // FIRE number = annual withdrawal / 4% safe withdrawal rate
    const fireNumber = inputs.annualWithdrawal / 0.04;

    const totalPensionMonthly = inputs.pensionContrib + inputs.employerContrib;

    // Build life event schedules per pot
    const lifeEvents = inputs.lifeEvents || [];
    const sorted = lifeEvents.slice().sort((a, b) => a.atAge - b.atAge);

    const pensionEvents = sorted.map(e => ({
      fromYear: e.atAge - inputs.currentAge,
      monthlyContrib: e.pensionContrib + e.employerContrib,
    }));
    const isaEvents = sorted.map(e => ({
      fromYear: e.atAge - inputs.currentAge,
      monthlyContrib: e.isaContrib,
    }));
    const otherEvents = sorted.map(e => ({
      fromYear: e.atAge - inputs.currentAge,
      monthlyContrib: e.otherContrib,
    }));

    const pension = projectPot(inputs.pensionBalance, totalPensionMonthly, inputs.pensionReturn, years, inputs.inflation, pensionEvents);
    const isa = projectPot(inputs.isaBalance, inputs.isaContrib, inputs.isaReturn, years, inputs.inflation, isaEvents);
    const other = projectPot(inputs.otherBalance, inputs.otherContrib, inputs.otherReturn, years, inputs.inflation, otherEvents);

    // Combined totals per year
    const combined = [];
    for (let y = 0; y <= years; y++) {
      combined.push({
        year: y,
        age: inputs.currentAge + y,
        pension: pension[y],
        isa: isa[y],
        other: other[y],
        totalNominal: pension[y].nominal + isa[y].nominal + other[y].nominal,
        totalReal: pension[y].real + isa[y].real + other[y].real,
      });
    }

    const inf = inputs.inflation / 100;

    // Find FIRE year (when total real value hits the target)
    let fireYear = null;
    for (let y = 0; y <= years; y++) {
      if (combined[y].totalReal >= fireNumber) {
        fireYear = y;
        break;
      }
    }

    // Coast FIRE: what age can you stop contributing and still reach fireNumber by age 60?
    const coastTargetAge = 60;
    const avgReturn = (inputs.pensionReturn + inputs.isaReturn + inputs.otherReturn) / 3 / 100;
    let coastFireAge = null;
    for (let y = 0; y <= years; y++) {
      const age = inputs.currentAge + y;
      const yearsToCoastTarget = coastTargetAge - age;
      if (yearsToCoastTarget <= 0) break;
      const nominalFireNumber = fireNumber * Math.pow(1 + inf, coastTargetAge - inputs.currentAge);
      const neededNow = nominalFireNumber / Math.pow(1 + avgReturn, yearsToCoastTarget);
      if (combined[y].totalNominal >= neededNow) {
        coastFireAge = age;
        break;
      }
    }

    // State pension adjustment
    let statePensionAnnual = 0;
    if (inputs.statePensionEnabled) {
      statePensionAnnual = inputs.statePensionAmount;
    }

    let adjustedFireNumber = fireNumber;
    if (statePensionAnnual > 0) {
      const statePensionCapital = statePensionAnnual / 0.04;
      adjustedFireNumber = Math.max(0, fireNumber - statePensionCapital);
    }

    // DB pension adjustment: reduce FIRE number by capital equivalent of DB income
    const dbPensions = Array.isArray(inputs.dbPensions) ? inputs.dbPensions : [];
    let totalDBIncome = 0;
    for (const db of dbPensions) {
      if (db.startAge <= inputs.targetAge) {
        totalDBIncome += calculateDBIncome(db);
      }
    }
    if (totalDBIncome > 0) {
      adjustedFireNumber = Math.max(0, adjustedFireNumber - totalDBIncome / 0.04);
    }

    // Recalculate FIRE year with state pension adjustment
    let adjustedFireYear = fireYear;
    if (inputs.statePensionEnabled) {
      adjustedFireYear = null;
      for (let y = 0; y <= years; y++) {
        const age = inputs.currentAge + y;
        const target = (age >= inputs.statePensionAge) ? adjustedFireNumber : fireNumber;
        if (combined[y].totalReal >= target) {
          adjustedFireYear = y;
          break;
        }
      }
    }

    // Drawdown
    const drawdown = runDrawdown(inputs, combined);

    // What-if scenarios
    const whatIf = calculateWhatIfs(inputs, combined, fireNumber);

    // Cashflow timeline and bridge solver
    const lastYear = combined[combined.length - 1];
    const cashflow = buildCashflow(inputs, lastYear.totalNominal);
    const bridge = solveBridge(inputs, cashflow);

    return {
      years,
      combined,
      pension: pension[years],
      isa: isa[years],
      other: other[years],
      fireNumber,
      adjustedFireNumber,
      fireYear: inputs.statePensionEnabled ? adjustedFireYear : fireYear,
      coastFireAge,
      statePensionAnnual,
      statePensionEnabled: inputs.statePensionEnabled,
      statePensionAge: inputs.statePensionAge,
      currentAge: inputs.currentAge,
      targetAge: inputs.targetAge,
      inflation: inputs.inflation,
      drawdown,
      whatIf,
      lifeEvents: sorted.map(e => ({ name: e.name || 'Event', atAge: e.atAge })),
      cashflow,
      bridge,
      dbPensions,
    };
  }


  /**
   * What-if sensitivity calculations.
   * Shows impact of reducing withdrawal by £5k and £10k.
   */
  function calculateWhatIfs(inputs, combined, fireNumber) {
    const results = [];
    const deltas = [5000, 10000];

    for (const delta of deltas) {
      const reducedWithdrawal = inputs.annualWithdrawal - delta;
      if (reducedWithdrawal <= 0) continue;

      const reducedFireNumber = reducedWithdrawal / 0.04;
      const effectiveTarget = inputs.statePensionEnabled
        ? Math.max(0, reducedFireNumber - (inputs.statePensionAmount / 0.04))
        : reducedFireNumber;

      // Find when they'd hit this lower target
      let newFireYear = null;
      for (let y = 0; y <= combined.length - 1; y++) {
        const age = inputs.currentAge + y;
        const target = (inputs.statePensionEnabled && age >= inputs.statePensionAge)
          ? effectiveTarget : reducedFireNumber;
        if (combined[y].totalReal >= target) {
          newFireYear = y;
          break;
        }
      }

      // Also run a quick drawdown to see when money runs out
      const ddInputs = Object.assign({}, inputs, { annualWithdrawal: reducedWithdrawal });
      const dd = runDrawdown(ddInputs, combined);

      results.push({
        delta,
        reducedWithdrawal,
        fireYear: newFireYear,
        fireAge: newFireYear !== null ? inputs.currentAge + newFireYear : null,
        runsOutAge: dd.runsOutAge,
      });
    }

    return results;
  }

  /**
   * Simulate retirement drawdown from the combined pot.
   */
  function runDrawdown(inputs, combined) {
    const retireAge = inputs.targetAge;
    const lastYear = combined[combined.length - 1];
    const startingPot = lastYear.totalNominal;
    const inf = inputs.inflation / 100;
    const ret = inputs.drawdownReturn / 100;
    const maxAge = 100;
    const maxYears = maxAge - retireAge;
    const dbPensions = Array.isArray(inputs.dbPensions) ? inputs.dbPensions : [];

    let pot = startingPot;
    let withdrawal = inputs.annualWithdrawal;
    let runsOutAge = null;
    const data = [];

    for (let y = 0; y <= maxYears; y++) {
      const age = retireAge + y;
      const realPot = pot / Math.pow(1 + inf, y);
      data.push({ year: y, age, nominal: pot, real: realPot, withdrawal });

      if (y < maxYears) {
        // Sum active DB pension income at this age
        let dbIncome = 0;
        for (const db of dbPensions) {
          if (age >= db.startAge) {
            dbIncome += calculateDBIncome(db);
          }
        }

        let effectiveWithdrawal = withdrawal;
        let inflatedStatePension = 0;
        if (inputs.statePensionEnabled && age >= inputs.statePensionAge) {
          inflatedStatePension = inputs.statePensionAmount * Math.pow(1 + inf, age - retireAge);
        }
        effectiveWithdrawal = Math.max(0, withdrawal - dbIncome - inflatedStatePension);

        pot = (pot - effectiveWithdrawal) * (1 + ret);

        if (pot <= 0) {
          pot = 0;
          if (runsOutAge === null) runsOutAge = age + 1;
        }

        withdrawal *= (1 + inf);
      }
    }

    return {
      data,
      startingPot,
      startingPotReal: startingPot / Math.pow(1 + inf, inputs.targetAge - inputs.currentAge),
      runsOutAge,
      annualWithdrawal: inputs.annualWithdrawal,
      retireAge,
    };
  }

  /**
   * Calculate annual income from a Defined Benefit pension.
   * Handles the "double hit": fewer accrual years + early retirement reduction.
   * @param {Object} db - DB pension object
   * @returns {number} Annual DB pension income
   */
  function calculateDBIncome(db) {
    const accrualFraction = db.accrualRate === 0 ? 0 : 1 / db.accrualRate;
    const totalAccrued = db.accrued + (db.salary * accrualFraction * db.yearsToWork);
    if (db.startAge >= db.npa) return totalAccrued;
    const yearsEarly = db.npa - db.startAge;
    const multiplier = Math.max(0.3, 1 - (yearsEarly * db.reductionRate / 100));
    return totalAccrued * multiplier;
  }

  /**
   * Build a year-by-year cashflow timeline from retirement age to 100.
   * @param {Object} inputs - Full inputs object with targetAge, annualWithdrawal, inflation, drawdownReturn, dbPensions, statePension fields
   * @param {number} dcStartPot - DC pot value at retirement
   * @returns {Array} Array of cashflow row objects
   */
  function buildCashflow(inputs, dcStartPot) {
    const rows = [];
    const retireAge = inputs.targetAge;
    const inf = inputs.inflation / 100;
    const drawdownReturn = inputs.drawdownReturn / 100;
    const dbPensions = Array.isArray(inputs.dbPensions) ? inputs.dbPensions : [];
    let dcPot = dcStartPot || 0;

    for (let age = retireAge; age <= 100; age++) {
      const year = age - retireAge;

      // Sum DB income from all DB pensions active at this age
      let dbIncome = 0;
      for (const db of dbPensions) {
        if (age >= db.startAge) {
          dbIncome += calculateDBIncome(db);
        }
      }

      // State pension
      const spIncome = (inputs.statePensionEnabled && age >= inputs.statePensionAge)
        ? inputs.statePensionAmount : 0;

      // Inflate target income from retirement
      const targetIncome = inputs.annualWithdrawal * Math.pow(1 + inf, year);

      // DC gap: shortfall between target and guaranteed income
      const dcGap = Math.max(0, targetIncome - dbIncome - spIncome);
      const dcWithdrawal = Math.min(dcGap, Math.max(0, dcPot));

      // Withdraw then apply growth
      dcPot = (Math.max(0, dcPot - dcWithdrawal)) * (1 + drawdownReturn);

      const totalIncome = dbIncome + spIncome + dcWithdrawal;

      rows.push({ age, dbIncome, spIncome, dcWithdrawal, totalIncome, dcPotRemaining: dcPot });
    }
    return rows;
  }

  /**
   * Calculate the monthly contribution needed to accumulate a target amount.
   * Uses the future value of annuity formula.
   * @param {number} target - Target amount to accumulate
   * @param {number} annualReturn - Annual return rate (e.g. 0.07 for 7%)
   * @param {number} years - Number of years to contribute
   * @returns {number} Required monthly contribution
   */
  function calculateMonthlyContrib(target, annualReturn, years) {
    if (years <= 0) return target; // need it all now as a lump sum
    const r = annualReturn / 12;
    if (r === 0) return target / (years * 12);
    const n = years * 12;
    return target * r / (Math.pow(1 + r, n) - 1);
  }

  /**
   * Solve the bridge funding gap between retirement and when DB/State pensions start.
   * @param {Object} inputs - Full inputs object
   * @param {Array} cashflow - Cashflow rows from buildCashflow
   * @returns {Object} { required, bridgePot, monthlyContrib, bridgeYears }
   */
  function solveBridge(inputs, cashflow) {
    const retireAge = inputs.targetAge;
    const dbPensions = Array.isArray(inputs.dbPensions) ? inputs.dbPensions : [];

    // Find the latest pension start age (max of all DB startAges and statePensionAge if enabled)
    const pensionStartAges = dbPensions.map(db => db.startAge);
    if (inputs.statePensionEnabled) {
      pensionStartAges.push(inputs.statePensionAge);
    }

    // If no pensions at all, no bridge needed
    if (pensionStartAges.length === 0) {
      return { required: false, bridgePot: 0, monthlyContrib: 0, bridgeYears: 0 };
    }

    const lastGapAge = Math.max(...pensionStartAges);
    const bridgeYears = Math.max(0, lastGapAge - retireAge);

    if (bridgeYears === 0) {
      return { required: false, bridgePot: 0, monthlyContrib: 0, bridgeYears: 0 };
    }

    // Sum the DC gaps during bridge years, discounted back to retirement
    const drawdownReturn = inputs.drawdownReturn / 100;
    let bridgePot = 0;
    for (const row of cashflow) {
      if (row.age >= lastGapAge) break;
      const yearsFromRetirement = row.age - retireAge;
      bridgePot += row.dcWithdrawal / Math.pow(1 + drawdownReturn, yearsFromRetirement);
    }

    // Monthly contribution needed during working years
    const workingYears = inputs.targetAge - inputs.currentAge;
    const avgReturn = inputs.pensionReturn / 100;
    const monthlyContrib = calculateMonthlyContrib(bridgePot, avgReturn, workingYears);

    return { required: true, bridgePot, monthlyContrib, bridgeYears };
  }

  return { runProjection, getInflationHistory, calculateDBIncome, buildCashflow, solveBridge };
})();
