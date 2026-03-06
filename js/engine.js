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
   * contribSchedule: sorted array of { fromYear, monthlyContrib }
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
        // Find the active contribution for this year
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
   */
  function runProjection(inputs) {
    const years = inputs.targetAge - inputs.currentAge;
    if (years <= 0) return null;

    // Pension: personal + employer contributions (pre-tax, no relief needed)
    const totalPensionMonthly = inputs.pensionContrib + inputs.employerContrib;

    // Build life event schedules per pot (sorted by fromYear)
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

    // FIRE number is user-set
    const fireNumber = inputs.fireTarget;

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

    // State pension: if enabled, reduces the effective target after state pension age
    let statePensionAnnual = 0;
    if (inputs.statePensionEnabled) {
      statePensionAnnual = inputs.statePensionAmount;
    }

    // Adjusted FIRE number with state pension
    // State pension covers some annual draw, so you need a smaller pot
    let adjustedFireNumber = fireNumber;
    if (statePensionAnnual > 0) {
      // Reduce target by capitalised value of state pension (at 4% SWR equivalent)
      const statePensionCapital = statePensionAnnual / 0.04;
      adjustedFireNumber = Math.max(0, fireNumber - statePensionCapital);
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
      drawdown: runDrawdown(inputs, combined),
      lifeEvents: sorted.map(e => ({ name: e.name || 'Event', atAge: e.atAge })),
    };
  }

  /**
   * Simulate retirement drawdown from the combined pot.
   * Withdrawals increase with inflation each year.
   * Pot continues to earn returns.
   * State pension reduces the amount drawn from the pot.
   */
  function runDrawdown(inputs, combined) {
    const retireAge = inputs.targetAge;
    const lastYear = combined[combined.length - 1];
    const startingPot = lastYear.totalNominal;
    const inf = inputs.inflation / 100;
    const ret = inputs.drawdownReturn / 100;
    const maxAge = 100;
    const maxYears = maxAge - retireAge;

    let pot = startingPot;
    let withdrawal = inputs.annualWithdrawal;
    let runsOutAge = null;
    const data = [];

    for (let y = 0; y <= maxYears; y++) {
      const age = retireAge + y;
      const realPot = pot / Math.pow(1 + inf, y);
      data.push({ year: y, age, nominal: pot, real: realPot, withdrawal });

      if (y < maxYears) {
        // State pension offsets withdrawal after state pension age
        let effectiveWithdrawal = withdrawal;
        if (inputs.statePensionEnabled && age >= inputs.statePensionAge) {
          // State pension also inflates from retirement start
          const inflatedStatePension = inputs.statePensionAmount * Math.pow(1 + inf, age - retireAge);
          effectiveWithdrawal = Math.max(0, withdrawal - inflatedStatePension);
        }

        // Withdraw then grow
        pot = (pot - effectiveWithdrawal) * (1 + ret);

        if (pot <= 0) {
          pot = 0;
          if (runsOutAge === null) runsOutAge = age + 1;
          // Keep going to fill chart data with zeros
        }

        // Inflate next year's withdrawal
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

  return { runProjection, getInflationHistory };
})();
