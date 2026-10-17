import type { Acquisition, Inputs, ScenarioId } from './types';
import { simulate, rentalMonth, type Plan, type SimResult, type StressParams } from './engine';
import { breakEvenRent, idxLabel, pmt, PERIODS, ratio, ymToIdx, idxToYm } from './finance';
import { acquisitionReady, missingInputs } from './completeness';

export const SCENARIOS: { id: ScenarioId; name: string; policy: string }[] = [
  { id: 'custom', name: 'Custom', policy: 'Acquisitions exactly as entered on the Inputs page.' },
  { id: 'A', name: 'A · Cash funded', policy: 'One additional rental at or after the checkpoint; no HELOC draw.' },
  { id: 'B', name: 'B · Limited HELOC', policy: 'One additional rental; HELOC draw limited to the verified funding gap and household cap.' },
  { id: 'C', name: 'C · Two staged purchases', policy: 'Two rentals, the second an editable 12–18 months after the first; each underwritten separately.' },
  { id: 'D', name: 'D · Delay and repay', policy: 'Defer the first acquisition 6 or 12 months, cash funded; keep saving and paying the Yukon.' },
];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Scenario overrides never overwrite the stored inputs or actuals (V14). */
export function applyScenario(base: Inputs, id: ScenarioId): Inputs {
  const inp = clone(base);
  if (id === 'custom') return inp;
  const [first, second, ...rest] = inp.acquisitions;
  if (!first) return inp;
  rest.forEach((a) => (a.enabled = false));
  if (second) second.enabled = false;
  first.enabled = true;
  if (id === 'A') first.funding = 'cash';
  if (id === 'B') first.funding = 'heloc';
  if (id === 'C') {
    first.funding = 'heloc';
    if (second) {
      second.enabled = true;
      second.funding = 'heloc';
      second.minGapAfterPrevious = inp.policy.scenarioCGapMonths;
    }
  }
  if (id === 'D') {
    first.funding = 'cash';
    first.proposedMonth = idxToYm(ymToIdx(first.proposedMonth) + inp.policy.scenarioDDelayMonths);
  }
  return inp;
}

export function stressCatalog(inp: Inputs): StressParams[] {
  const s = inp.stress;
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  return [
    { id: 'price-down', label: `Purchase price −${pct(s.priceShockPct)}`, priceShock: -s.priceShockPct },
    { id: 'price-up', label: `Purchase price +${pct(s.priceShockPct)}`, priceShock: s.priceShockPct },
    { id: 'value-decline', label: `Immediate ${pct(s.valueDeclinePct)} value decline, then flat`, valueDecline: s.valueDeclinePct },
    { id: 'rent-flat', label: 'Rent growth 0%', rentGrowthZero: true },
    { id: 'rent-cut', label: `Rent reduction ${pct(s.rentCutPct)}`, rentFactor: 1 - s.rentCutPct },
    { id: 'vacancy', label: `Vacancy ${pct(s.vacancyStressPct)} ongoing`, vacancyPct: s.vacancyStressPct },
    { id: 'vacancy-event', label: `${s.vacancyEventMonths}-month vacancy at Novella`, vacancyEventMonths: s.vacancyEventMonths },
    { id: 'repairs', label: `Routine repairs ${pct(s.repairsStressPct)}`, repairsPct: s.repairsStressPct },
    { id: 'capex', label: `Capital provision ${pct(s.capexStressPct)} + $${s.majorRepair.toLocaleString()} repair`, capexPct: s.capexStressPct, majorRepair: s.majorRepair },
    { id: 'mgmt', label: `Management ${pct(s.mgmtStressPct)}`, mgmtPct: s.mgmtStressPct },
    { id: 'turnover', label: `Extra turnover $${s.extraTurnoverCost.toLocaleString()}`, extraTurnover: s.extraTurnoverCost },
    { id: 'tax-ins', label: `Taxes & insurance +${pct(s.taxInsStepPct)} step`, taxInsStep: s.taxInsStepPct },
    { id: 'mortgage-1', label: `New mortgage rate +${pct(s.mortgageRateShock1)}`, mortgageRateShock: s.mortgageRateShock1 },
    { id: 'mortgage-2', label: `New mortgage rate +${pct(s.mortgageRateShock2)}`, mortgageRateShock: s.mortgageRateShock2 },
    { id: 'heloc-1', label: `HELOC rate +${pct(s.helocShock1)}`, helocShock: s.helocShock1 },
    { id: 'heloc-2', label: `HELOC rate +${pct(s.helocShock2)}`, helocShock: s.helocShock2 },
    { id: 'heloc-freeze', label: 'HELOC line frozen', helocFreeze: true },
    { id: 'income-loss', label: `One income lost ${s.incomeLossMonths} months`, incomeLossMonths: s.incomeLossMonths, incomeLossEarner: s.incomeLossEarner },
    { id: 'bonus', label: 'Bonus removed', removeBonus: true },
    { id: 'rehab', label: `Rehab +${pct(s.rehabOverrunPct)}, lease-up +${s.leaseUpDelayMonths} mo`, rehabOverrun: s.rehabOverrunPct, leaseUpDelay: s.leaseUpDelayMonths },
    {
      id: 'combined',
      label: 'Combined stress',
      rentFactor: 1 - s.rentCutPct,
      vacancyEventMonths: s.vacancyEventMonths,
      majorRepair: s.majorRepair,
      helocShock: s.helocShock2,
      helocFreeze: true,
      incomeLossMonths: s.incomeLossMonths,
      incomeLossEarner: s.incomeLossEarner,
    },
  ];
}

export interface Underwriting {
  potentialRent: number;
  vacancyLoss: number;
  effectiveIncome: number;
  opex: number;
  noi: number;
  debtService: number;
  capexProvision: number;
  helocService: number;
  cfBefore: number;
  cfAfter: number;
  economicDscr: number | null;
  downsideDscr: number | null;
  lenderDscr: number | null;
  capRate: number | null;
  yieldOnCost: number | null;
  cashOnCash: number | null;
  breakEvenRent: number | null;
  ownerCash: number;
}

/** Stabilized first lease year (12 months from rent start), Section 8 formulas. */
export function underwrite(inp: Inputs, a: Acquisition, sim: SimResult): Underwriting | null {
  const c = sim.closings[a.id];
  if (!c) return null;
  const months: number[] = [];
  for (let t = c.rentStartIdx; t < c.rentStartIdx + 12; t++) months.push(t);
  let pr = 0, vac = 0, other = 0, opex = 0, noi = 0, capex = 0, helocSvc = 0;
  let downNoi = 0;
  const debtService = c.payment * 12;
  for (const t of months) {
    const r = rentalMonth(a.ops, t, c.rentStartIdx, true, false, undefined);
    pr += r.scheduledRent;
    vac += r.vacancyLoss;
    other += r.otherIncome;
    opex += r.opex;
    noi += r.noi;
    capex += r.capexProvision;
    const d = rentalMonth(a.ops, t, c.rentStartIdx, true, false, {
      id: 'downside', label: 'downside', rentFactor: 1 - inp.policy.downsideRentCutPct, vacancyPct: inp.policy.downsideVacancyPct,
    });
    downNoi += d.noi;
    const row = sim.rows[Math.min(t, PERIODS - 1)];
    const p = row?.props[a.id];
    // beyond the horizon, carry the last modeled month's allocated HELOC service
    helocSvc += p ? p.helocInterest + p.helocPrincipal : 0;
  }
  if (c.rentStartIdx + 11 >= PERIODS && helocSvc === 0 && c.helocDraw > 0) {
    helocSvc = (c.helocDraw * (inp.heloc.indexRate + inp.heloc.margin));
  }
  const cfBefore = noi - debtService - capex; // CashFlowBeforeHELOC = NOI - MortgageDebtService - CapExProvision
  const cfAfter = cfBefore - helocSvc;
  const r0 = rentalMonth(a.ops, c.rentStartIdx, c.rentStartIdx, true, false, undefined);
  const fixedMonthly = r0.taxes + r0.insurance + r0.hoa + r0.utilities;
  const totalCost = c.price + c.closingCash + c.initialWork;
  return {
    potentialRent: pr,
    vacancyLoss: vac,
    effectiveIncome: pr - vac + other,
    opex,
    noi,
    debtService,
    capexProvision: capex,
    helocService: helocSvc,
    cfBefore,
    cfAfter,
    economicDscr: ratio(noi, debtService + helocSvc), // NOI / (MortgageDebtService + AllocatedHELOCService)
    downsideDscr: ratio(downNoi, debtService + helocSvc),
    lenderDscr: ratio(pr, (c.payment + r0.taxes + r0.insurance + r0.hoa) * 12), // rent / PITIA (lender definition)
    capRate: ratio(noi, c.price),
    yieldOnCost: ratio(noi, totalCost),
    cashOnCash: ratio(cfAfter, c.ownerCash),
    breakEvenRent: breakEvenRent(fixedMonthly, c.payment + helocSvc / 12, 0, other / 12, a.ops.vacancyPct, r0.variablePct),
    ownerCash: c.ownerCash,
  };
}

export interface TestResult {
  id: string;
  label: string;
  pass: boolean | null; // null = INPUT REQUIRED
  detail: string;
}

/** Household debt-to-income at month t using lender rental treatment (factor × rent − PITIA). */
export function dtiAt(inp: Inputs, sim: SimResult, t: number): number | null {
  if (inp.household.earners.some((e) => e.grossMonthly === null)) return null;
  let income = inp.household.earners.reduce((s, e) => s + (e.grossMonthly ?? 0), 0);
  const row = sim.rows[t];
  const prev = sim.rows[Math.max(t - 1, sim.forecastStart)];
  let obligations = (inp.home.mortgage.payment ?? 0) + (inp.home.mortgage.escrowMonthly ?? 0);
  obligations += inp.consumer.debts.reduce((s, d) => s + ((prev.bal.consumerById[d.id] ?? 0) > 0 ? d.minPayment ?? 0 : 0), 0);
  obligations += prev.bal.yukon > 0 ? inp.yukon.loan.payment ?? 0 : 0;
  obligations += row.f.helocInterest + (row.f.helocPrincipal > 0 ? row.f.helocPrincipal : 0);
  const rental = (rent: number, pitia: number) => {
    const net = inp.policy.lenderRentFactor * rent - pitia;
    if (net >= 0) income += net;
    else obligations -= net;
  };
  const nv = row.props.novella;
  if (nv) rental(nv.scheduledRent, nv.mortgageDebtService + (inp.novella.ops.taxesAnnual ?? 0) / 12 + (inp.novella.ops.insuranceAnnual ?? 0) / 12 + inp.novella.ops.hoaMonthly);
  for (const a of sim.acqs) {
    const c = sim.closings[a.id];
    if (!c || t < c.idx) continue;
    const r = rentalMonth(a.ops, Math.max(t, c.rentStartIdx), c.rentStartIdx, true, false, undefined);
    rental(r.scheduledRent, c.payment + r.taxes + r.insurance + r.hoa);
  }
  return ratio(obligations, income);
}

export interface Evaluation {
  idx: number;
  pass: boolean;
  tests: TestResult[];
  sim: SimResult;
  underwriting: Underwriting | null;
}

export function evaluatePurchase(inp: Inputs, plan: Plan, a: Acquisition, t: number, downside: StressParams | undefined): Evaluation {
  const p2 = { ...plan, [a.id]: t };
  const sim = simulate(inp, p2);
  const c = sim.closings[a.id];
  const tests: TestResult[] = [];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const ai = inp.acquisitions.findIndex((x) => x.id === a.id);
  const ready = acquisitionReady(inp, ai);
  tests.push({ id: 'inputs', label: 'Required inputs complete', pass: ready ? true : null, detail: ready ? 'All candidate inputs entered' : 'INPUT REQUIRED: price, rate, rent, taxes, insurance' });

  const window = sim.rows.slice(t, Math.min(PERIODS, t + 12));
  const minCash = Math.min(...window.map((r) => r.cashEnd));
  const shortfall = c ? c.shortfall : 0;
  tests.push({
    id: 'cash',
    label: 'Cash at closing',
    pass: !!c && shortfall <= 0.5 && minCash >= -0.5,
    detail: c
      ? `Needed ${fmt(c.cashNeeded)} (incl. ${fmt(c.postCloseReserves)} reserves); eligible ${fmt(c.eligibleCash)}; gap ${fmt(c.fundingGap)}; HELOC ${fmt(c.helocDraw)}; unfunded ${fmt(shortfall)}`
      : 'No closing modeled',
  });
  if (a.funding === 'heloc' && c && c.fundingGap > 0) {
    const limit = Math.min(a.helocCap, c.helocAvailable);
    tests.push({
      id: 'heloc',
      label: 'HELOC draw within limits',
      pass: inp.heloc.approvedLine === null ? null : c.fundingGap <= limit + 0.5,
      detail: inp.heloc.approvedLine === null ? 'INPUT REQUIRED: approved HELOC limit' : `Gap ${fmt(c.fundingGap)} vs. allowed ${fmt(limit)} (cap ${fmt(a.helocCap)}, available ${fmt(c.helocAvailable)})`,
    });
  }
  const prior = sim.rows[Math.max(t - 1, sim.forecastStart)];
  const consumerBal = t - 1 < sim.forecastStart ? inp.consumer.debts.reduce((s, d) => s + (d.balance ?? 0), 0) : prior.bal.consumer;
  if (inp.policy.requireConsumerCleared)
    tests.push({ id: 'consumer', label: 'Consumer debt cleared', pass: consumerBal <= 0.5, detail: `Balance before closing ${fmt(consumerBal)}` });
  if (inp.yukon.requirePaidBeforeAcquisition) {
    const yb = t - 1 < sim.forecastStart ? inp.yukon.loan.balance ?? 0 : prior.bal.yukon;
    tests.push({ id: 'yukon', label: 'Yukon paid off', pass: yb <= 0.5, detail: `Yukon balance ${fmt(yb)}` });
  }
  const missed = sim.rows.slice(sim.forecastStart, t).some((r) => r.flags.some((f) => f.includes('deadline missed') || f.includes('Negative consolidated')));
  tests.push({ id: 'suspend', label: 'No missed deadline or cash shortfall beforehand', pass: !missed, detail: missed ? 'Eligibility suspended until resolved' : 'None' });

  const uw = underwrite(inp, a, sim);
  if (uw) {
    tests.push({ id: 'cf', label: 'Positive stabilized cash flow after HELOC', pass: uw.cfAfter > 0, detail: `${fmt(uw.cfAfter)} / yr after capital provision & allocated HELOC` });
    tests.push({ id: 'dscr', label: `Economic DSCR ≥ ${inp.policy.dscrBase.toFixed(2)}x base`, pass: uw.economicDscr === null ? null : uw.economicDscr >= inp.policy.dscrBase, detail: uw.economicDscr === null ? 'N/A' : `${uw.economicDscr.toFixed(2)}x` });
    tests.push({ id: 'dscr-down', label: `Economic DSCR ≥ ${inp.policy.dscrDownside.toFixed(2)}x downside`, pass: uw.downsideDscr === null ? null : uw.downsideDscr >= inp.policy.dscrDownside, detail: uw.downsideDscr === null ? 'N/A' : `${uw.downsideDscr.toFixed(2)}x` });
    tests.push({ id: 'lender-dscr', label: `Lender DSCR ≥ ${inp.policy.lenderDscrMin.toFixed(2)}x`, pass: uw.lenderDscr === null ? null : uw.lenderDscr >= inp.policy.lenderDscrMin, detail: uw.lenderDscr === null ? 'N/A' : `${uw.lenderDscr.toFixed(2)}x (rent ÷ PITIA)` });
  }
  const dti = dtiAt(inp, sim, t);
  tests.push({ id: 'dti', label: `Household DTI ≤ ${(inp.policy.maxDti * 100).toFixed(0)}%`, pass: dti === null ? null : dti <= inp.policy.maxDti, detail: dti === null ? 'INPUT REQUIRED: gross qualifying income' : `${(dti * 100).toFixed(1)}%` });

  const basePass = tests.every((x) => x.pass === true);
  if (downside && basePass) {
    const ss = simulate(inp, p2, { ...downside, anchorIdx: t });
    const w2 = ss.rows.slice(t, Math.min(PERIODS, t + 12));
    const m2 = Math.min(...w2.map((r) => r.cashEnd));
    const breach = Math.max(0, ...w2.map((r) => r.reserveRequired - r.cashEnd));
    tests.push({
      id: 'stress',
      label: `Stress survival (${downside.label}, 12 mo)`,
      pass: m2 >= inp.policy.stressCashFloor,
      detail: `Minimum cash ${fmt(m2)} vs floor ${fmt(inp.policy.stressCashFloor)}; max reserve deficit ${fmt(breach)}`,
    });
  } else if (downside) {
    tests.push({ id: 'stress', label: `Stress survival (${downside.label}, 12 mo)`, pass: false, detail: 'Not run: base tests failed' });
  }
  return { idx: t, pass: tests.every((x) => x.pass === true), tests, sim, underwriting: uw };
}

export type DecisionStatus = 'BUY' | 'DEFER' | 'NO FEASIBLE DATE' | 'INPUT REQUIRED' | 'NOT ENABLED';
export interface AcqDecision {
  acq: Acquisition;
  status: DecisionStatus;
  proposedIdx: number;
  closeIdx: number | null;
  atProposed: Evaluation | null;
  atClose: Evaluation | null;
  failed: TestResult[];
}

export interface ModelRun {
  inputs: Inputs; // scenario-applied
  scenario: ScenarioId;
  ready: boolean;
  missing: ReturnType<typeof missingInputs>;
  plan: Plan;
  decisions: AcqDecision[];
  sim: SimResult | null;
}

/** Purchase scheduling: test the proposed month; on failure show DEFER and search later months for the earliest passing date. */
export function runModel(base: Inputs, scenario: ScenarioId = base.control.scenario, globalStress?: StressParams): ModelRun {
  const inp = applyScenario(base, scenario);
  const missing = missingInputs(inp);
  const ready = !missing.some((m) => m.blocksEngine);
  if (!ready) return { inputs: inp, scenario, ready, missing, plan: {}, decisions: [], sim: null };
  const downside = stressCatalog(inp).find((s) => s.id === inp.control.downsideTest);
  const plan: Plan = {};
  const decisions: AcqDecision[] = [];
  const fStart = ymToIdx(inp.control.actualsThrough) + 1;
  let prevClose: number | null = null;
  const sim0 = (p: Plan) => simulate(inp, p, globalStress);
  const evalAt = (a: Acquisition, t: number) => (globalStress ? evaluateStressed(inp, plan, a, t, downside, globalStress) : evaluatePurchase(inp, plan, a, t, downside));

  inp.acquisitions.forEach((a, i) => {
    const proposed = Math.max(fStart, ymToIdx(a.proposedMonth));
    if (!a.enabled) {
      decisions.push({ acq: a, status: 'NOT ENABLED', proposedIdx: proposed, closeIdx: null, atProposed: null, atClose: null, failed: [] });
      return;
    }
    if (!acquisitionReady(inp, i)) {
      decisions.push({ acq: a, status: 'INPUT REQUIRED', proposedIdx: proposed, closeIdx: null, atProposed: null, atClose: null, failed: [] });
      return;
    }
    const start = prevClose !== null && a.minGapAfterPrevious > 0 ? Math.max(proposed, prevClose + a.minGapAfterPrevious) : proposed;
    const first = evalAt(a, start);
    if (first.pass) {
      plan[a.id] = start;
      prevClose = start;
      decisions.push({ acq: a, status: 'BUY', proposedIdx: start, closeIdx: start, atProposed: first, atClose: first, failed: [] });
      return;
    }
    const failed = first.tests.filter((x) => x.pass !== true);
    let found: Evaluation | null = null;
    if (inp.control.autoDefer) {
      for (let t = start + 1; t < PERIODS; t++) {
        const ev = evalAt(a, t);
        if (ev.pass) { found = ev; break; }
      }
    }
    if (found) {
      plan[a.id] = found.idx;
      prevClose = found.idx;
    }
    decisions.push({ acq: a, status: found ? 'DEFER' : 'NO FEASIBLE DATE', proposedIdx: start, closeIdx: found?.idx ?? null, atProposed: first, atClose: found, failed });
  });
  return { inputs: inp, scenario, ready, missing, plan, decisions, sim: sim0(plan) };
}

function evaluateStressed(inp: Inputs, plan: Plan, a: Acquisition, t: number, downside: StressParams | undefined, g: StressParams): Evaluation {
  // Under a global stress, closings are tested against the stressed base case
  const ev = evaluatePurchase(inp, plan, a, t, downside);
  const ss = simulate(inp, { ...plan, [a.id]: t }, g);
  const c = ss.closings[a.id];
  const w = ss.rows.slice(t, Math.min(PERIODS, t + 12));
  const ok = !!c && c.shortfall <= 0.5 && Math.min(...w.map((r) => r.cashEnd)) >= -0.5;
  const tests = [...ev.tests, { id: 'global-stress', label: `Cash under ${g.label}`, pass: ok, detail: ok ? 'Funded' : 'Unfunded under stress' }];
  return { ...ev, tests, pass: ev.pass && ok };
}

export const fmtIdx = idxLabel;
export { pmt };
