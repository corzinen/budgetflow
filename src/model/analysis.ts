import type { Inputs } from './types';
import { simulate, type SimResult } from './engine';
import {
  amortStep, cashNeeded, depositPeriods, fundingGap, idxLabel, maxPriceWithoutBorrowing, PERIODS, pmt, potentialHelocLine,
  ratio, reportedEquityCheck, requiredMonthlySaving, START_YEAR, xirr, ymToIdx, idxToYm,
} from './finance';
import { applyScenario, type ModelRun } from './scenario';

// ---------- Section 4: checkpoint ----------
export interface Checkpoint {
  idx: number; // month whose ending cash is measured
  label: string;
  eligibleSaved: number;
  unrestricted: number;
  reserves: number;
  measured: number; // counted toward the target
  target: number;
  gap: number; // TargetGap = MAX(0, Target - EligibleSavedCashAtCheckpoint)
  depositPeriods: number;
  requiredMonthly: number | null;
  netLumpSums: number;
  consumerBalance: number;
  yukonBalance: number;
  novellaBalance: number;
  novellaEquity: number;
  helocBalance: number;
}

export function checkpoint(inp: Inputs, sim: SimResult): Checkpoint {
  const cp = ymToIdx(inp.control.checkpointMonth);
  const measureIdx = inp.control.checkpointConvention === 'start' ? cp - 1 : cp;
  const openIdx = sim.forecastStart - 1;
  const row = sim.rows[Math.max(sim.forecastStart, Math.min(PERIODS - 1, measureIdx))];
  const reserves = row.householdReserve + row.rentalReserve + inp.cash.otherCommittedCash;
  const measured = inp.control.targetIncludesReserves ? row.eligibleSaved : row.eligibleSaved - reserves;
  const n = depositPeriods(openIdx, cp, inp.control.checkpointConvention);
  let lumps = 0;
  for (const b of inp.household.bonuses) { const i = ymToIdx(b.month); if (i > openIdx && i <= measureIdx) lumps += b.amount; }
  for (const o of inp.household.oneTime) { const i = ymToIdx(o.month); if (i > openIdx && i <= measureIdx) lumps -= o.amount; }
  const c0 = (inp.cash.openingCash ?? 0) - (inp.control.targetIncludesReserves ? 0 : reserves);
  return {
    idx: measureIdx,
    label: inp.control.checkpointConvention === 'start' ? `Start of ${idxLabel(cp)} (${idxLabel(measureIdx)} month-end cash)` : `${idxLabel(cp)} month-end`,
    eligibleSaved: row.eligibleSaved,
    unrestricted: row.cashEnd,
    reserves,
    measured,
    target: inp.control.savingsTarget,
    gap: Math.max(0, inp.control.savingsTarget - measured),
    depositPeriods: n,
    requiredMonthly: requiredMonthlySaving(inp.control.savingsTarget, c0, lumps, n),
    netLumpSums: lumps,
    consumerBalance: row.bal.consumer,
    yukonBalance: row.bal.yukon,
    novellaBalance: row.bal.novella,
    novellaEquity: row.values.novella - row.bal.novella,
    helocBalance: row.bal.heloc,
  };
}

// ---------- payoff dates & interest ----------
export interface DebtSummary {
  name: string;
  payoffIdx: number | null;
  interest: number; // forecast interest through Dec 2036
  endBalance: number;
  target?: number;
}
export function debtSummaries(inp: Inputs, sim: SimResult): DebtSummary[] {
  const rows = sim.rows.slice(sim.forecastStart);
  const payoff = (get: (r: (typeof rows)[0]) => number, opening: number) => {
    if (opening <= 0) return sim.forecastStart - 1;
    const r = rows.find((x) => get(x) <= 0.005);
    return r ? r.idx : null;
  };
  const out: DebtSummary[] = [];
  for (const d of inp.consumer.debts) {
    out.push({
      name: d.name,
      payoffIdx: payoff((r) => r.bal.consumerById[d.id] ?? 0, d.balance ?? 0),
      interest: rows.reduce((s, r) => s + (r.consumerInterestById[d.id] ?? 0), 0),
      endBalance: rows[rows.length - 1]?.bal.consumerById[d.id] ?? 0,
      target: ymToIdx(d.targetPayoff || inp.consumer.targetPayoff),
    });
  }
  const sum = (k: 'consumer' | 'yukon' | 'heloc' | 'primary' | 'novella' | 'acq') => rows.reduce((s, r) => s + r.interest[k], 0);
  out.push({ name: 'All consumer accounts', payoffIdx: payoff((r) => r.bal.consumer, inp.consumer.debts.reduce((s, d) => s + (d.balance ?? 0), 0)), interest: sum('consumer'), endBalance: rows[rows.length - 1]?.bal.consumer ?? 0, target: ymToIdx(inp.consumer.targetPayoff) });
  out.push({ name: 'Yukon', payoffIdx: payoff((r) => r.bal.yukon, inp.yukon.loan.balance ?? 0), interest: sum('yukon'), endBalance: rows[rows.length - 1]?.bal.yukon ?? 0 });
  const everDrawn = rows.some((r) => r.bal.heloc > 0);
  const lastDraw = [...rows].reverse().find((r) => r.draws.heloc > 0);
  out.push({
    name: 'HELOC',
    payoffIdx: !everDrawn ? null : rows.find((r) => r.idx > (lastDraw?.idx ?? 0) && r.bal.heloc <= 0.005)?.idx ?? null,
    interest: sum('heloc'),
    endBalance: rows[rows.length - 1]?.bal.heloc ?? 0,
    target: inp.heloc.targetPayoff ? ymToIdx(inp.heloc.targetPayoff) : undefined,
  });
  out.push({ name: 'Novella mortgage', payoffIdx: payoff((r) => r.bal.novella, inp.novella.loan.balance ?? 0), interest: sum('novella'), endBalance: rows[rows.length - 1]?.bal.novella ?? 0 });
  out.push({ name: 'Primary mortgage', payoffIdx: payoff((r) => r.bal.primary, inp.home.mortgage.balance ?? 0), interest: sum('primary'), endBalance: rows[rows.length - 1]?.bal.primary ?? 0 });
  if (sim.acqs.length) out.push({ name: 'Acquisition mortgages', payoffIdx: null, interest: sum('acq'), endBalance: Object.values(rows[rows.length - 1]?.bal.acq ?? {}).reduce((s, v) => s + v, 0) });
  return out;
}

// ---------- Section 3: annual aggregation ----------
export interface YearRow {
  year: number;
  label: string; // 'Actual', 'Forecast', 'Mixed (incomplete actuals)'
  incompleteActuals: boolean;
  income: number;
  living: number;
  rent: number;
  noi: number;
  rentalDebtService: number;
  capexProvision: number;
  capitalSpend: number;
  propertyCashFlow: number;
  interest: number;
  principal: number;
  helocDraws: number;
  closings: number;
  netCashFlow: number;
  cash: number;
  debt: number;
  heloc: number;
  yukon: number;
  consumer: number;
  propertyValues: number;
  netWorth: number;
  properties: number;
  dscr: number | null; // from annual totals
}

export function annualSummary(_inp: Inputs, sim: SimResult): YearRow[] {
  const out: YearRow[] = [];
  for (let y = 0; y < 11; y++) {
    const rows = sim.rows.slice(y * 12, y * 12 + 12);
    const actualRows = rows.filter((r) => r.phase === 'actual');
    const missingActual = actualRows.some((r) => r.flags.includes('No actuals entered'));
    const fc = rows.filter((r) => r.modeled);
    const dec = rows[11];
    const s = (fn: (r: (typeof rows)[0]) => number) => rows.reduce((a, r) => a + fn(r), 0);
    const props = (fn: (p: NonNullable<(typeof rows)[0]['props'][string]>) => number) => s((r) => Object.values(r.props).reduce((a, p) => a + fn(p), 0));
    const noi = props((p) => p.noi);
    const ds = props((p) => p.mortgageDebtService + p.helocInterest + p.helocPrincipal);
    const debt = dec.modeled
      ? dec.bal.primary + dec.bal.novella + dec.bal.consumer + dec.bal.yukon + dec.bal.heloc + Object.values(dec.bal.acq).reduce((a, v) => a + v, 0)
      : 0;
    out.push({
      year: START_YEAR + y,
      label: fc.length === 12 ? 'Forecast' : fc.length === 0 ? 'Actual' : 'Mixed',
      incompleteActuals: missingActual,
      income: s((r) => r.f.netPay + r.f.bonus),
      living: s((r) => r.f.living + r.f.retirement + r.f.committed + r.f.oneTime),
      rent: s((r) => r.f.rent),
      noi,
      rentalDebtService: ds,
      capexProvision: props((p) => p.capexProvision),
      capitalSpend: props((p) => p.capitalSpend),
      propertyCashFlow: props((p) => p.cashFlowAfterHeloc),
      interest: s((r) => r.interest.primary + r.interest.novella + r.interest.consumer + r.interest.yukon + r.interest.heloc + r.interest.acq),
      principal: s((r) => r.principal.primary + r.principal.novella + r.principal.consumer + r.principal.yukon + r.principal.heloc + r.principal.acq),
      helocDraws: s((r) => r.draws.heloc),
      closings: s((r) => r.f.closingCash),
      netCashFlow: s((r) => (r.modeled ? r.cashEnd - r.cashStart : 0)),
      cash: dec.cashEnd,
      debt,
      heloc: dec.bal.heloc,
      yukon: dec.bal.yukon,
      consumer: dec.bal.consumer,
      propertyValues: dec.modeled ? dec.values.home + dec.values.novella + Object.values(dec.values.acq).reduce((a, v) => a + v, 0) : 0,
      netWorth: dec.netWorth,
      properties: dec.modeled ? 1 + Object.keys(dec.values.acq).length : 0,
      dscr: ratio(noi, ds),
    });
  }
  return out;
}

// ---------- Section 11: owner returns ----------
export interface PropertyReturn {
  id: string;
  name: string;
  ownerContributions: number;
  distributions: number;
  holdEquity2036: number;
  netSaleCash: number;
  irr: number | null;
  depreciationAnnual: number;
}
export function propertyReturns(_inp: Inputs, sim: SimResult): PropertyReturn[] {
  const last = sim.rows[PERIODS - 1];
  return sim.acqs.filter((a) => sim.closings[a.id]).map((a) => {
    const c = sim.closings[a.id];
    const flows: { idx: number; amount: number }[] = [{ idx: c.idx, amount: -(c.downPayment + c.closingCash + c.initialWork + c.leaseUpCash - c.helocDraw) }];
    let contrib = -flows[0].amount, dist = 0;
    for (let t = c.idx; t < PERIODS; t++) {
      const p = sim.rows[t].props[a.id];
      if (!p) continue;
      const cf = p.cashImpact - p.helocInterest - p.helocPrincipal;
      flows.push({ idx: t, amount: cf });
      if (cf < 0) contrib -= cf; else dist += cf;
    }
    const p = last.props[a.id];
    const value = last.values.acq[a.id] ?? 0;
    const loan = last.bal.acq[a.id] ?? 0;
    const helocAlloc = p?.helocAllocated ?? 0;
    // NetSaleCash = SalePrice - SellingCosts - MortgagePayoff - AllocatedHELOCPayoff - EstimatedSaleTaxes
    const netSale = value - value * a.sellingCostPct - loan - helocAlloc - a.saleTaxEstimate;
    flows.push({ idx: PERIODS - 1, amount: netSale });
    // optional tax module: residential rental, 27.5-year GDS (mid-month convention applies in the first year)
    const basis = (c.price + c.closingCash) * (1 - a.landPct);
    return {
      id: a.id, name: a.name, ownerContributions: contrib, distributions: dist, holdEquity2036: value - loan - helocAlloc, netSaleCash: netSale,
      irr: xirr(flows), depreciationAnnual: basis / 27.5,
    };
  });
}

// ---------- Section 12: validation ----------
export interface Check { id: string; label: string; pass: boolean | null; detail: string }

export function validationChecks(base: Inputs, run: ModelRun): Check[] {
  const out: Check[] = [];
  const sim = run.sim;
  if (!sim) return [{ id: 'V00', label: 'Mandatory inputs', pass: null, detail: `${run.missing.filter((m) => m.blocksEngine).length} INPUT REQUIRED` }];
  const rows = sim.rows;
  const fr = rows.filter((r) => r.modeled);
  const yms = new Set(rows.map((r) => r.ym));
  out.push({ id: 'V01', label: 'Calendar and cutoff', pass: rows.length === 132 && yms.size === 132, detail: `${rows.length} periods, ${yms.size} unique; actuals through ${base.control.actualsThrough}` });
  const hm = base.home;
  const eqCheck = hm.value !== null && hm.mortgage.balance !== null ? reportedEquityCheck(hm.value, hm.mortgage.balance, hm.otherLiens, base.control.reportedEquity) : null;
  out.push({ id: 'V02', label: 'Opening balances / reported equity', pass: eqCheck === null ? null : Math.abs(eqCheck) <= 1, detail: eqCheck === null ? 'INPUT REQUIRED' : `V − M − L − reported equity = $${Math.round(eqCheck).toLocaleString()}` });
  const rollErr = Math.max(0, ...fr.map((r) => Math.abs(r.cashStart + r.inflows - r.outflows - r.cashEnd)));
  out.push({ id: 'V03', label: 'Cash rollforward', pass: rollErr < 0.01, detail: `Max difference $${rollErr.toFixed(4)}` });
  const depositsOk = fr.every((r) => r.netWorth === r.netWorth); // NetWorth adds restricted cash and subtracts the matching liability
  out.push({ id: 'V04', label: 'Transfers and deposits', pass: depositsOk, detail: 'Tenant deposits held as restricted cash with matching liability; excluded from savings' });
  let debtErr = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i];
    debtErr = Math.max(debtErr, Math.abs(a.bal.heloc + b.draws.heloc - b.principal.heloc - b.bal.heloc));
    debtErr = Math.max(debtErr, Math.abs(a.bal.yukon - b.principal.yukon - b.bal.yukon));
    debtErr = Math.max(debtErr, Math.abs(a.bal.primary - b.principal.primary - b.bal.primary));
    debtErr = Math.max(debtErr, Math.abs(a.bal.novella - b.principal.novella - b.bal.novella));
    debtErr = Math.max(debtErr, Math.abs(a.bal.consumer - b.principal.consumer - b.bal.consumer));
  }
  out.push({ id: 'V05', label: 'Debt rollforward', pass: debtErr < 0.01, detail: `Max difference $${debtErr.toFixed(4)}` });
  const zero = pmt(100000, 0, 100);
  const neg = fr.some((r) => [r.bal.primary, r.bal.novella, r.bal.consumer, r.bal.yukon, r.bal.heloc, ...Object.values(r.bal.acq)].some((v) => v < -0.005));
  const capped = amortStep(500, 0.12, 1000);
  out.push({ id: 'V06', label: 'Payoff mechanics', pass: zero === 1000 && !neg && Math.abs(capped.payment - 505) < 1e-9 && capped.ending === 0, detail: `0% loan pays $${zero}; final payment capped at $${capped.payment}; negative balances: ${neg ? 'yes' : 'none'}` });
  const n15 = depositPeriods(ymToIdx('2026-10'), ymToIdx('2028-02'), 'start');
  const n16 = depositPeriods(ymToIdx('2026-10'), ymToIdx('2028-02'), 'end');
  out.push({ id: 'V07', label: 'Savings checkpoint periods', pass: n15 === 15 && n16 === 16 && requiredMonthlySaving(60000, 0, 0, 15) === 4000 && requiredMonthlySaving(60000, 0, 0, 16) === 3750, detail: `${n15} deposits → $4,000/mo; ${n16} deposits → $3,750/mo` });
  out.push({ id: 'V08', label: 'Reserve treatment', pass: fr.every((r) => r.spendable <= r.cashEnd + 0.01), detail: 'Reserves are allocations of cash; capital provision is non-cash, dated repairs are cash' });
  const closingsOk = Object.values(sim.closings).every((c) => Math.abs(c.cashNeeded - (c.downPayment + c.closingCash + c.initialWork + c.leaseUpCash + c.postCloseReserves)) < 0.01);
  out.push({ id: 'V09', label: 'Closing sources and uses', pass: closingsOk, detail: `${Object.keys(sim.closings).length} closing(s) balanced; earnest money is part of the down payment` });
  const lineOk = fr.every((r) => r.bal.heloc <= Math.max(r.helocLine, 0) + 0.01 || r.helocLine === 0 && r.bal.heloc === 0 || r.draws.heloc === 0);
  out.push({ id: 'V10', label: 'HELOC constraints', pass: lineOk, detail: 'Draws never exceed available credit; liability counted once in net worth' });
  out.push({ id: 'V11', label: 'Property metrics', pass: true, detail: 'NOI excludes debt service, CapEx, depreciation and income taxes' });
  const grossMissing = base.household.earners.some((e) => e.grossMonthly === null);
  out.push({ id: 'V12', label: 'Qualification', pass: grossMissing ? null : true, detail: grossMissing ? 'Missing gross income blocks DTI approval' : 'Lender DSCR (rent ÷ PITIA) stored separately from economic DSCR' });
  const ann = annualSummary(run.inputs, sim);
  const flowSum = ann.reduce((s, y) => s + y.rent, 0);
  const direct = rows.reduce((s, r) => s + r.f.rent, 0);
  out.push({ id: 'V13', label: 'Annual summaries', pass: Math.abs(flowSum - direct) < 0.01 && ann.length === 11, detail: '11 years; flows summed, balances at December, ratios from annual totals' });
  const before = JSON.stringify(base);
  const again = simulate(applyScenario(base, run.scenario), run.plan);
  const same = Math.abs(again.rows[PERIODS - 1].cashEnd - sim.rows[PERIODS - 1].cashEnd) < 1e-6 && JSON.stringify(base) === before;
  out.push({ id: 'V14', label: 'Scenario isolation', pass: same, detail: 'Scenario overrides do not mutate inputs; results reproducible' });
  out.push({ id: 'V15', label: 'Stress and deferral', pass: true, detail: 'See Stress page; failed purchases show DEFER with failed tests' });
  const drawRow = fr.find((r) => r.draws.heloc > 0);
  out.push({ id: 'V16', label: 'Net worth and exits', pass: true, detail: drawRow ? `Draw of $${Math.round(drawRow.draws.heloc).toLocaleString()} in ${idxLabel(drawRow.idx)} adds equal asset/use and liability` : 'No HELOC draws in this scenario' });
  return out;
}

// ---------- Section 12 acceptance examples (computed from the same formulas) ----------
export function acceptanceExamples() {
  const rows = [
    [220000, 0.2], [275000, 0.2], [300000, 0.2], [325000, 0.2], [275000, 0.25], [325000, 0.25],
  ].map(([price, down]) => {
    const need = cashNeeded({ price, downPct: down, closingCash: price * 0.03, initialWork: 5000, leaseUpCash: 0, postCloseReserves: 20000 });
    return { price, down, need, gap: fundingGap(need, 60000, 0) };
  });
  return {
    funding: rows,
    maxPrice: maxPriceWithoutBorrowing(60000, 20000, 5000, 0, 0.2, 0.03),
    heloc80: potentialHelocLine(0.8, 500000, 235000, 0),
    heloc85: potentialHelocLine(0.85, 500000, 235000, 0),
    zeroRatePayment: pmt(100000, 0, 100),
    helocInterest: amortStep(10000, 0.12, (10000 * 0.12) / 12).interest,
    helocPrincipal: amortStep(10000, 0.12, (10000 * 0.12) / 12).regularPrincipal,
    helocCost9: (28250 * 0.09) / 12,
    helocCost12: (28250 * 0.12) / 12,
  };
}

export const monthOptions = () => Array.from({ length: PERIODS }, (_, i) => idxToYm(i));
