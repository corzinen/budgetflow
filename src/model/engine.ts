import type { Acquisition, Inputs, RentalOps } from './types';
import { amortStep, helocRate, idxToYm, monthlyGrowth, PERIODS, pmt, ymToIdx } from './finance';

/** Engine-level stress parameters. Effects start at anchorIdx; windowed events last their stated months. */
export interface StressParams {
  id: string;
  label: string;
  anchorIdx?: number;
  priceShock?: number;
  valueDecline?: number;
  rentFactor?: number;
  rentGrowthZero?: boolean;
  vacancyPct?: number;
  vacancyEventMonths?: number;
  repairsPct?: number;
  capexPct?: number;
  majorRepair?: number;
  mgmtPct?: number;
  taxInsStep?: number;
  mortgageRateShock?: number;
  helocShock?: number;
  helocFreeze?: boolean;
  incomeLossMonths?: number;
  incomeLossEarner?: number;
  removeBonus?: boolean;
  rehabOverrun?: number;
  leaseUpDelay?: number;
  extraTurnover?: number;
}

export type Plan = Record<string, number | null>; // acquisition id -> closing month index

export interface PropertyMonth {
  scheduledRent: number;
  vacancyLoss: number;
  collected: number;
  otherIncome: number;
  opex: number;
  noi: number;
  capexProvision: number;
  mortgageDebtService: number;
  mortgageInterest: number;
  mortgagePrincipal: number;
  escrow: number;
  helocInterest: number; // allocated
  helocPrincipal: number; // allocated
  capitalSpend: number; // actual dated capital work / repairs
  cashFlowBeforeHeloc: number; // NOI - mortgage debt service - capex provision
  cashFlowAfterHeloc: number;
  cashImpact: number; // actual cash effect on the household ledger
  fixedCosts: number; // for rental reserve: debt service + HELOC service + taxes + insurance + HOA + utilities
  value: number;
  loanBalance: number;
  helocAllocated: number;
}

export interface ClosingInfo {
  id: string;
  idx: number;
  price: number;
  downPayment: number;
  closingCash: number;
  initialWork: number;
  leaseUpCash: number;
  postCloseReserves: number;
  cashNeeded: number;
  eligibleCash: number;
  otherFunds: number;
  fundingGap: number;
  helocDraw: number;
  helocAvailable: number;
  shortfall: number;
  ownerCash: number; // household cash committed (excl. borrowed HELOC funds), incl. initial reserves for this property
  loanAmount: number;
  payment: number;
  rate: number;
  rentStartIdx: number;
  cashAfterClosing: number;
}

export interface Flows {
  netPay: number;
  bonus: number;
  rent: number;
  otherRentalIncome: number;
  helocDraw: number;
  living: number;
  retirement: number;
  committed: number;
  oneTime: number;
  primaryPI: number;
  primaryEscrow: number;
  rentalOpex: number;
  rentalDebt: number;
  rentalEscrow: number;
  capitalWork: number;
  consumerPay: number;
  consumerExtra: number;
  consolidationPayoff: number;
  yukonPay: number;
  yukonExtra: number;
  helocInterest: number;
  helocPrincipal: number;
  helocFees: number;
  closingCash: number;
  homeAddition: number;
}

export interface MonthRow {
  idx: number;
  ym: string;
  phase: 'actual' | 'forecast';
  modeled: boolean;
  cashStart: number;
  cashEnd: number;
  restrictedCash: number;
  inflows: number;
  outflows: number;
  f: Flows;
  bal: { primary: number; novella: number; consumer: number; consumerById: Record<string, number>; yukon: number; heloc: number; acq: Record<string, number> };
  consumerInterestById: Record<string, number>;
  interest: { primary: number; novella: number; consumer: number; yukon: number; heloc: number; acq: number };
  principal: { primary: number; novella: number; consumer: number; yukon: number; heloc: number; acq: number };
  draws: { heloc: number };
  values: { home: number; novella: number; acq: Record<string, number> };
  helocRate: number;
  helocLine: number;
  helocAvailable: number;
  helocTranches: Record<string, number>;
  householdReserve: number;
  rentalReserve: number;
  reserveRequired: number;
  spendable: number;
  eligibleSaved: number;
  netWorth: number;
  cltvDrawn: number;
  cltvCommitted: number;
  surplus: number;
  props: Record<string, PropertyMonth>; // 'novella' + acquisition ids
  flags: string[];
}

export interface SimResult {
  rows: MonthRow[];
  forecastStart: number;
  closings: Record<string, ClosingInfo>;
  acqs: Acquisition[];
  flags: string[];
}

interface RentalCalc extends Omit<PropertyMonth, 'mortgageDebtService' | 'mortgageInterest' | 'mortgagePrincipal' | 'escrow' | 'helocInterest' | 'helocPrincipal' | 'capitalSpend' | 'cashFlowBeforeHeloc' | 'cashFlowAfterHeloc' | 'cashImpact' | 'fixedCosts' | 'value' | 'loanBalance' | 'helocAllocated'> {
  taxes: number;
  insurance: number;
  hoa: number;
  utilities: number;
  variablePct: number;
}

function stressActive(s: StressParams | undefined, idx: number) {
  return !!s && idx >= (s.anchorIdx ?? 0);
}
function inWindow(s: StressParams | undefined, idx: number, months: number | undefined) {
  if (!s || !months) return false;
  const a = s.anchorIdx ?? 0;
  return idx >= a && idx < a + months;
}

/** EffectiveIncome = PotentialRent - VacancyAndCreditLoss + OtherIncome;  NOI = EffectiveIncome - OperatingExpenses */
export function rentalMonth(
  ops: RentalOps,
  idx: number,
  growthBaseIdx: number,
  rentActive: boolean,
  vacant: boolean,
  s: StressParams | undefined,
): RentalCalc {
  const st = stressActive(s, idx) ? s : undefined;
  const leaseYears = Math.max(0, Math.floor((idx - growthBaseIdx) / 12));
  const g = st?.rentGrowthZero ? 0 : ops.rentGrowth;
  const scheduledRent = rentActive ? (ops.rentMonthly ?? 0) * Math.pow(1 + g, leaseYears) * (st?.rentFactor ?? 1) : 0;
  const vacancyPct = st?.vacancyPct ?? ops.vacancyPct;
  // a modeled vacancy event replaces the allowance for the affected months
  const vacancyLoss = vacant ? scheduledRent : scheduledRent * vacancyPct;
  const collected = scheduledRent - vacancyLoss;
  const otherIncome = rentActive ? ops.otherIncomeMonthly : 0;
  const tiFactor = Math.pow(1 + ops.taxInsGrowth, leaseYears) * (1 + (st?.taxInsStep ?? 0));
  const taxes = ((ops.taxesAnnual ?? 0) / 12) * tiFactor;
  const insurance = ((ops.insuranceAnnual ?? 0) / 12) * tiFactor;
  const mgmtPct = st?.mgmtPct ?? ops.mgmtPct;
  const repairsPct = st?.repairsPct ?? ops.repairsPct;
  const capexPct = st?.capexPct ?? ops.capexPct;
  const opex = taxes + insurance + ops.hoaMonthly + ops.utilitiesMonthly + mgmtPct * collected + repairsPct * collected;
  return {
    scheduledRent,
    vacancyLoss,
    collected,
    otherIncome,
    opex,
    noi: collected + otherIncome - opex,
    capexProvision: capexPct * collected,
    taxes,
    insurance,
    hoa: ops.hoaMonthly,
    utilities: ops.utilitiesMonthly,
    variablePct: mgmtPct + repairsPct + capexPct,
  };
}

export function acqPriceAt(a: Acquisition, idx: number, s?: StressParams): number {
  const base = a.price ?? 0;
  const drift = Math.pow(1 + a.priceGrowth, Math.max(0, idx - ymToIdx(a.proposedMonth)) / 12);
  return base * drift * (1 + (s?.priceShock ?? 0));
}

const n0 = (v: number | null | undefined) => v ?? 0;

/** Monthly cash, debt and portfolio engine, Jan 2026 – Dec 2036. */
export function simulate(inp: Inputs, plan: Plan, stress?: StressParams): SimResult {
  const fStart = ymToIdx(inp.control.actualsThrough) + 1;
  const acqs = inp.acquisitions.filter((a) => plan[a.id] !== undefined && plan[a.id] !== null);
  const rows: MonthRow[] = [];
  const closings: Record<string, ClosingInfo> = {};
  const globalFlags: string[] = [];

  // ---- opening state ----
  let cash = n0(inp.cash.openingCash);
  let primary = n0(inp.home.mortgage.balance);
  let primaryRemaining = n0(inp.home.mortgage.remainingMonths);
  let novellaBal = n0(inp.novella.loan.balance);
  let novellaRemaining = n0(inp.novella.loan.remainingMonths);
  let yukon = n0(inp.yukon.loan.balance);
  let yukonRemaining = n0(inp.yukon.loan.remainingMonths);
  const consumer: Record<string, number> = {};
  for (const d of inp.consumer.debts) consumer[d.id] = n0(d.balance);
  let heloc = 0;
  const tranches: Record<string, number> = {};
  let homeValue = n0(inp.home.value);
  let novellaValue = n0(inp.novella.ops.value);
  const acqState: Record<string, { bal: number; payment: number; rate: number; value: number; closeIdx: number; rentStart: number; remaining: number }> = {};
  const restricted = () =>
    inp.novella.ops.securityDeposit + acqs.filter((a) => acqState[a.id]).reduce((s, a) => s + a.ops.securityDeposit, 0);

  const helocOpenIdx = ymToIdx(inp.heloc.openMonth);
  const drawEndIdx = ymToIdx(inp.heloc.drawEndMonth);
  const freezeIdx = inp.heloc.freezeMonth ? ymToIdx(inp.heloc.freezeMonth) : Infinity;
  const line = inp.heloc.enabled ? n0(inp.heloc.approvedLine) : 0;
  const novellaLeaseIdx = inp.novella.ops.leaseStart ? ymToIdx(inp.novella.ops.leaseStart) : fStart;

  for (let t = 0; t < PERIODS; t++) {
    const ym = idxToYm(t);
    const flags: string[] = [];
    const f: Flows = {
      netPay: 0, bonus: 0, rent: 0, otherRentalIncome: 0, helocDraw: 0, living: 0, retirement: 0, committed: 0, oneTime: 0,
      primaryPI: 0, primaryEscrow: 0, rentalOpex: 0, rentalDebt: 0, rentalEscrow: 0, capitalWork: 0, consumerPay: 0,
      consumerExtra: 0, consolidationPayoff: 0, yukonPay: 0, yukonExtra: 0, helocInterest: 0, helocPrincipal: 0, helocFees: 0,
      closingCash: 0, homeAddition: 0,
    };
    const interest = { primary: 0, novella: 0, consumer: 0, yukon: 0, heloc: 0, acq: 0 };
    const principal = { primary: 0, novella: 0, consumer: 0, yukon: 0, heloc: 0, acq: 0 };
    const props: Record<string, PropertyMonth> = {};

    if (t < fStart) {
      // Historical months: verified actuals only; never backfilled with invented figures.
      const a = inp.actuals.find((x) => x.month === ym);
      if (a) {
        f.netPay = a.netIncome;
        f.living = a.livingExpenses;
        f.rent = a.rentCollected;
        f.rentalOpex = a.propertyExpenses;
        f.consumerPay = a.debtPayments;
      } else flags.push('No actuals entered');
      const inflows = f.netPay + f.rent;
      const outflows = f.living + f.rentalOpex + f.consumerPay;
      rows.push({
        idx: t, ym, phase: 'actual', modeled: false, cashStart: 0, cashEnd: a?.endingCash ?? 0, restrictedCash: 0, inflows, outflows, f,
        bal: { primary: 0, novella: 0, consumer: 0, consumerById: {}, yukon: 0, heloc: 0, acq: {} }, consumerInterestById: {}, interest, principal, draws: { heloc: 0 },
        values: { home: 0, novella: 0, acq: {} }, helocRate: 0, helocLine: 0, helocAvailable: 0, helocTranches: {}, householdReserve: 0,
        rentalReserve: 0, reserveRequired: 0, spendable: 0, eligibleSaved: 0, netWorth: 0, cltvDrawn: 0, cltvCommitted: 0, surplus: 0, props, flags,
      });
      continue;
    }

    const yrs = Math.floor((t - fStart) / 12);
    const st = stressActive(stress, t) ? stress : undefined;

    // ---- values: PropertyValue[t] = Prior * (1+g)^(1/12); stress decline is immediate at the anchor ----
    if (t > fStart) {
      homeValue *= monthlyGrowth(st ? 0 : inp.home.valueGrowth);
      novellaValue *= monthlyGrowth(st ? 0 : inp.novella.ops.valueGrowth);
      for (const a of acqs) if (acqState[a.id] && t > acqState[a.id].closeIdx) acqState[a.id].value *= monthlyGrowth(st ? 0 : a.ops.valueGrowth);
    }
    if (stress?.valueDecline && t === (stress.anchorIdx ?? fStart)) {
      const k = 1 - stress.valueDecline;
      homeValue *= k;
      novellaValue *= k;
      for (const a of acqs) if (acqState[a.id]) acqState[a.id].value *= k;
    }

    // Rate[t] = MIN(Cap, MAX(Floor, Index[t] + Margin)); a stress shock moves the index
    const hRate = helocRate(inp.heloc.indexRate + (st?.helocShock ?? 0), inp.heloc.margin, inp.heloc.floor, inp.heloc.cap);
    const frozen = t >= freezeIdx || (!!st?.helocFreeze);
    const helocOpen = inp.heloc.enabled && t >= helocOpenIdx;
    const capLimit = Math.min(line, inp.heloc.householdMaxDraw);
    const available = () => (helocOpen && !frozen && t <= drawEndIdx ? Math.max(0, capLimit - heloc - inp.heloc.holds) : 0);
    let drawsThisMonth = 0;
    const draw = (key: string, amount: number) => {
      const amt = Math.max(0, Math.min(amount, available()));
      if (amt <= 0) return 0;
      heloc += amt;
      tranches[key] = (tranches[key] ?? 0) + amt;
      drawsThisMonth += amt;
      f.helocDraw += amt;
      return amt;
    };

    // ---- household income ----
    inp.household.earners.forEach((e, i) => {
      const lost = inWindow(stress, t, stress?.incomeLossMonths) && i === (stress?.incomeLossEarner ?? 0);
      if (!lost) f.netPay += n0(e.netMonthly) * Math.pow(1 + inp.household.incomeGrowth, yrs);
    });
    if (!(st?.removeBonus)) for (const b of inp.household.bonuses) if (b.month === ym) f.bonus += b.amount;

    // ---- household spending ----
    const infl = Math.pow(1 + inp.household.expenseInflation, yrs);
    f.living = (n0(inp.household.essentialsMonthly) + n0(inp.household.discretionaryMonthly)) * infl;
    f.retirement = inp.household.retirementMonthly;
    for (const r of inp.household.recurring) {
      const s0 = r.start ? ymToIdx(r.start) : 0;
      const e0 = r.end ? ymToIdx(r.end) : Infinity;
      if (t >= s0 && t <= e0) f.committed += r.amount;
    }
    for (const o of inp.household.oneTime) if (o.month === ym) f.oneTime += o.amount;

    // ---- primary mortgage (contractual payment governs) ----
    {
      const pay = primaryRemaining > 0 ? n0(inp.home.mortgage.payment) : primary;
      if (primary > 0 && primaryRemaining <= 0) flags.push('Primary mortgage: maturity/balloon due');
      const s = amortStep(primary, n0(inp.home.mortgage.apr), pay);
      if (s.belowInterest) flags.push('Primary mortgage payment below accrued interest');
      interest.primary = s.interest;
      principal.primary = s.regularPrincipal;
      f.primaryPI = s.payment;
      primary = s.ending;
      if (primaryRemaining > 0) primaryRemaining--;
      f.primaryEscrow = n0(inp.home.mortgage.escrowMonthly) * (1 + (st?.taxInsStep ?? 0));
    }

    // ---- acquisition closings (start of month; uses prior month-end cash only) ----
    let closingNet = 0; // closing outlays less HELOC draws already committed this month
    for (const a of acqs) {
      if (plan[a.id] !== t || acqState[a.id]) continue;
      const shocked = stress && t >= (stress.anchorIdx ?? 0) ? stress : undefined;
      const price = acqPriceAt(a, t, shocked);
      const loanAmount = price * (1 - a.downPct);
      const rateA = n0(a.rate) + (shocked?.mortgageRateShock ?? 0);
      const payment = pmt(loanAmount, rateA, a.termMonths);
      const closingCash = price * a.closingPct;
      const initialWork = a.initialWork * (1 + (shocked?.rehabOverrun ?? 0));
      const outlay = price * a.downPct + closingCash + initialWork + a.leaseUpCash;
      const rentStart = t + a.leaseUpMonths + (shocked?.leaseUpDelay ?? 0);
      // RequiredPostCloseReserves: household + every rental, including this one
      const op = rentalMonth(a.ops, rentStart, rentStart, true, false, undefined);
      const reservesFor = (helocSvc: number) =>
        householdReserveAt(t) + rentalReserveAt(t) + inp.cash.rentalReserveMonths * (payment + helocSvc + op.taxes + op.insurance + op.hoa + op.utilities);
      let post = reservesFor(0);
      let needed = outlay + post;
      const eligible = cash - closingNet; // unrestricted month-start cash; dedicated reserves deducted once via `post`
      let gap = Math.max(0, needed - eligible - a.otherConfirmedFunds);
      const avail = available();
      let drawAmt = 0;
      if (a.funding === 'heloc' && gap > 0) {
        const want = Math.min(gap, a.helocCap, avail);
        // include the allocated HELOC service in this property's reserve requirement
        post = reservesFor((want * hRate) / 12);
        needed = outlay + post;
        gap = Math.max(0, needed - eligible - a.otherConfirmedFunds);
        drawAmt = draw(`acq:${a.id}`, Math.min(gap, a.helocCap));
      }
      f.closingCash += outlay;
      closingNet += outlay - drawAmt;
      acqState[a.id] = { bal: loanAmount, payment, rate: rateA, value: price, closeIdx: t, rentStart, remaining: a.termMonths };
      closings[a.id] = {
        id: a.id, idx: t, price, downPayment: price * a.downPct, closingCash, initialWork, leaseUpCash: a.leaseUpCash,
        postCloseReserves: post, cashNeeded: needed, eligibleCash: eligible, otherFunds: a.otherConfirmedFunds, fundingGap: gap,
        helocDraw: drawAmt, helocAvailable: avail, shortfall: Math.max(0, gap - drawAmt), loanAmount, payment, rate: rateA,
        ownerCash: outlay - drawAmt + inp.cash.rentalReserveMonths * (payment + op.taxes + op.insurance + op.hoa + op.utilities),
        rentStartIdx: rentStart, cashAfterClosing: cash - closingNet,
      };
    }

    // ---- HELOC debt consolidation ----
    if (inp.heloc.enabled && inp.heloc.consolidateDebts && ym === inp.heloc.consolidationMonth) {
      if (!helocOpen) flags.push('Consolidation month is before the HELOC opens');
      const order = consumerOrder(inp, consumer);
      for (const d of order) {
        if (consumer[d.id] <= 0) continue;
        const got = draw(`consolidation:${d.id}`, consumer[d.id]);
        consumer[d.id] -= got;
        principal.consumer += got;
        f.consolidationPayoff += got;
        if (consumer[d.id] > 0.005) flags.push(`Consolidation: insufficient HELOC availability for ${d.name}`);
      }
    }

    // ---- home addition ----
    if (inp.homeAddition.enabled && ym === inp.homeAddition.month && inp.homeAddition.cost > 0) {
      const want = inp.homeAddition.cost * (inp.heloc.enabled ? inp.homeAddition.helocPct : 0);
      draw('home-addition', want);
      f.homeAddition += inp.homeAddition.cost;
      homeValue += inp.homeAddition.cost * inp.homeAddition.valueAddPct;
    }

    // ---- Novella ----
    {
      const vacant = inWindow(stress, t, stress?.vacancyEventMonths);
      const r = rentalMonth(inp.novella.ops, t, novellaLeaseIdx, true, vacant, stress);
      const pay = novellaRemaining > 0 ? n0(inp.novella.loan.payment) : novellaBal;
      if (novellaBal > 0 && novellaRemaining <= 0) flags.push('Novella loan: maturity/balloon due');
      const s = amortStep(novellaBal, n0(inp.novella.loan.apr), pay);
      if (s.belowInterest) flags.push('Novella payment below accrued interest');
      novellaBal = s.ending;
      if (novellaRemaining > 0) novellaRemaining--;
      interest.novella = s.interest;
      principal.novella = s.regularPrincipal;
      const escrow = n0(inp.novella.loan.escrowMonthly) * (1 + (st?.taxInsStep ?? 0));
      let capital = 0;
      for (const c of inp.novella.capitalWork) if (c.month === ym) capital += c.amount;
      if (stress?.majorRepair && t === (stress.anchorIdx ?? fStart)) capital += stress.majorRepair;
      if (stress?.extraTurnover && t === (stress.anchorIdx ?? fStart)) capital += stress.extraTurnover;
      f.rent += r.collected;
      f.otherRentalIncome += r.otherIncome;
      f.rentalOpex += r.opex;
      f.rentalDebt += s.payment;
      f.rentalEscrow += escrow;
      f.capitalWork += capital;
      props.novella = propMonth(r, s.payment, s.interest, s.regularPrincipal, escrow, capital, novellaValue, novellaBal);
    }

    // ---- acquired rentals ----
    for (const a of acqs) {
      const s0 = acqState[a.id];
      if (!s0) continue;
      const active = t >= s0.rentStart;
      const r = rentalMonth(a.ops, t, s0.rentStart, active, false, stress);
      let st2 = { interest: 0, regularPrincipal: 0, payment: 0, ending: s0.bal, extraPrincipal: 0, belowInterest: false };
      if (t > s0.closeIdx) {
        // first payment the month after closing; prepaid interest is inside closing cash
        st2 = amortStep(s0.bal, s0.rate, s0.remaining > 0 ? s0.payment : s0.bal);
        s0.bal = st2.ending;
        if (s0.remaining > 0) s0.remaining--;
      }
      interest.acq += st2.interest;
      principal.acq += st2.regularPrincipal;
      f.rent += r.collected;
      f.otherRentalIncome += r.otherIncome;
      f.rentalOpex += r.opex;
      f.rentalDebt += st2.payment;
      props[a.id] = propMonth(r, st2.payment, st2.interest, st2.regularPrincipal, 0, 0, s0.value, s0.bal);
    }

    // ---- consumer debts: contractual minimum, or the payment that meets the payoff deadline ----
    const consumerInterestById: Record<string, number> = {};
    for (const d of inp.consumer.debts) {
      const bal = consumer[d.id];
      if (bal <= 0) continue;
      const promo = d.promoEnd && t <= ymToIdx(d.promoEnd);
      const apr = promo ? d.promoApr : n0(d.apr);
      const target = ymToIdx(d.targetPayoff || inp.consumer.targetPayoff);
      let pay = n0(d.minPayment);
      if (inp.consumer.enforceTarget) {
        const left = target - t + 1;
        pay = Math.max(pay, left > 0 ? pmt(bal, apr, left) : bal * (1 + apr / 12));
      }
      const s = amortStep(bal, apr, pay);
      if (s.belowInterest) flags.push(`${d.name}: payment below accrued interest`);
      consumer[d.id] = s.ending;
      interest.consumer += s.interest;
      consumerInterestById[d.id] = s.interest;
      principal.consumer += s.regularPrincipal;
      f.consumerPay += s.payment;
      if (t === target && s.ending > 0.005) flags.push(`${d.name}: payoff deadline missed`);
    }

    // ---- Yukon contractual installments ----
    const yukonOpenAtStart = yukon > 0;
    {
      if (yukon > 0) {
        const pay = yukonRemaining > 0 ? n0(inp.yukon.loan.payment) : yukon * (1 + n0(inp.yukon.loan.apr) / 12);
        const s = amortStep(yukon, n0(inp.yukon.loan.apr), pay);
        if (s.belowInterest) flags.push('Yukon payment below accrued interest');
        yukon = s.ending;
        if (yukonRemaining > 0) yukonRemaining--;
        interest.yukon = s.interest;
        principal.yukon = s.regularPrincipal;
        f.yukonPay = s.payment;
      }
    }

    // ---- HELOC service: Interest[t] = (start balance + draws) * rate / 12 (monthly average-balance approximation) ----
    const helocBegin = heloc; // start balance + this month's draws
    const trancheSnap = { ...tranches };
    let helocScheduledPrincipal = 0;
    if (helocOpen) {
      if (t === helocOpenIdx) f.helocFees += inp.heloc.originationFee;
      if (t > helocOpenIdx && (t - helocOpenIdx) % 12 === 0) f.helocFees += inp.heloc.annualFee;
    }
    if (helocBegin > 0) {
      const hi = (helocBegin * hRate) / 12;
      let pay: number;
      const repayEnd = drawEndIdx + inp.heloc.repaymentMonths;
      if (t <= drawEndIdx) {
        pay = inp.heloc.interestOnly ? hi : Math.max(hi, helocBegin * inp.heloc.minPaymentPct);
      } else if (t <= repayEnd) {
        // amortizing conversion; recomputed each month so later rate resets re-amortize the remaining term
        pay = pmt(helocBegin, hRate, repayEnd - t + 1);
      } else {
        pay = helocBegin + hi; // balloon
        flags.push('HELOC: balloon due');
      }
      if (inp.heloc.targetPayoff) {
        const left = ymToIdx(inp.heloc.targetPayoff) - t + 1;
        pay = Math.max(pay, left > 0 ? pmt(helocBegin, hRate, left) : helocBegin + hi);
      }
      const s = amortStep(helocBegin, hRate, pay, inp.heloc.extraPrincipalMonthly);
      f.helocInterest = s.interest;
      f.helocPrincipal = s.regularPrincipal + s.extraPrincipal;
      helocScheduledPrincipal = s.regularPrincipal;
      payHelocPrincipal(s.regularPrincipal + s.extraPrincipal);
      interest.heloc = s.interest;
    }

    // ---- surplus allocation ----
    const rentalReserveNow = rentalReserveAt(t);
    const reserveReq = householdReserveAt(t) + rentalReserveNow + inp.cash.otherCommittedCash;
    const inflows0 = f.netPay + f.bonus + f.rent + f.otherRentalIncome + f.helocDraw;
    const outflows0 =
      f.living + f.retirement + f.committed + f.oneTime + f.primaryPI + f.primaryEscrow + f.rentalOpex + f.rentalDebt + f.rentalEscrow +
      f.capitalWork + f.consumerPay + f.consolidationPayoff + f.yukonPay + f.helocInterest + f.helocPrincipal + f.helocFees +
      f.closingCash + f.homeAddition;
    const cashAfterRequired = cash + inflows0 - outflows0;
    const surplus = Math.max(0, cashAfterRequired - cash);
    let room = Math.max(0, cashAfterRequired - reserveReq);

    const consumerOpenStart = inp.consumer.debts.some((d) => consumer[d.id] > 0.005);
    if (consumerOpenStart && inp.consumer.extraMonthly > 0) {
      let left = Math.min(inp.consumer.extraMonthly, room);
      if (left < inp.consumer.extraMonthly) flags.push('Consumer extra payment reduced: insufficient cash above reserves');
      for (const d of consumerOrder(inp, consumer)) {
        if (left <= 0) break;
        const x = Math.min(left, consumer[d.id]);
        consumer[d.id] -= x;
        principal.consumer += x;
        f.consumerExtra += x;
        left -= x;
      }
      room -= f.consumerExtra;
    }

    if (yukon > 0) {
      let req = 0;
      if (inp.yukon.policy === 'accelerated') {
        if (!consumerOpenStart && !inp.consumer.debts.some((d) => consumer[d.id] > 0.005)) req += inp.yukon.extraMonthly;
        for (const l of inp.yukon.lumpSums) if (l.month === ym) req += l.amount;
      } else if (inp.yukon.policy === 'savingsFirst') {
        const eligibleNow = cashAfterRequired - (inp.control.targetIncludesReserves ? 0 : reserveReq);
        if (eligibleNow >= inp.control.savingsTarget) req += surplus * inp.yukon.savingsFirstSplitPct;
      }
      if (req > 0) {
        const x = Math.min(req, room, yukon);
        if (x + 0.005 < Math.min(req, yukon)) flags.push('Yukon extra principal reduced: unfunded');
        yukon -= x;
        principal.yukon += x;
        f.yukonExtra = x;
        room -= x;
      }
    }
    let helocAlloc = 0;
    if (!yukonOpenAtStart && heloc > 0 && inp.heloc.postYukonRepayPct > 0) {
      // After Yukon payoff: split surplus between HELOC repayment and future acquisitions
      helocAlloc = Math.min(surplus * inp.heloc.postYukonRepayPct, room, heloc);
      if (helocAlloc > 0) {
        payHelocPrincipal(helocAlloc);
        f.helocPrincipal += helocAlloc;
        room -= helocAlloc;
      }
    }
    principal.heloc = f.helocPrincipal;

    const inflows = inflows0;
    const outflows = outflows0 + f.consumerExtra + f.yukonExtra + helocAlloc;
    const cashStart = cash;
    cash = cashStart + inflows - outflows;
    if (cash < -0.5) flags.push('Negative consolidated cash');

    // ---- HELOC allocation to properties (pro-rata by tranche at time of service) ----
    for (const a of acqs) {
      const p = props[a.id];
      if (!p) continue;
      const share = helocBegin > 0 ? (trancheSnap[`acq:${a.id}`] ?? 0) / helocBegin : 0;
      p.helocInterest = f.helocInterest * share;
      p.helocPrincipal = helocScheduledPrincipal * share;
      p.helocAllocated = tranches[`acq:${a.id}`] ?? 0;
      // CashFlowAfterHELOC = CashFlowBeforeHELOC - AllocatedHELOCService
      p.cashFlowAfterHeloc = p.cashFlowBeforeHeloc - p.helocInterest - p.helocPrincipal;
      p.fixedCosts += p.helocInterest + p.helocPrincipal;
    }

    const consumerTotal = Object.values(consumer).reduce((s, v) => s + v, 0);
    const acqBal: Record<string, number> = {};
    const acqVal: Record<string, number> = {};
    for (const a of acqs) if (acqState[a.id]) { acqBal[a.id] = acqState[a.id].bal; acqVal[a.id] = acqState[a.id].value; }
    const allDebt = primary + novellaBal + consumerTotal + yukon + heloc + Object.values(acqBal).reduce((s, v) => s + v, 0);
    const assets = homeValue + novellaValue + Object.values(acqVal).reduce((s, v) => s + v, 0);
    const restrictedCash = restricted();
    const hhRes = householdReserveAt(t);
    const rentalRes = rentalReserveNow;
    const res = hhRes + rentalRes + inp.cash.otherCommittedCash;
    const homeLiens = primary + inp.home.otherLiens;
    rows.push({
      idx: t, ym, phase: 'forecast', modeled: true, cashStart, cashEnd: cash, restrictedCash, inflows, outflows, f,
      bal: { primary, novella: novellaBal, consumer: consumerTotal, consumerById: { ...consumer }, yukon, heloc, acq: acqBal },
      consumerInterestById, interest, principal, draws: { heloc: drawsThisMonth },
      values: { home: homeValue, novella: novellaValue, acq: acqVal },
      helocRate: hRate, helocLine: helocOpen ? capLimit : 0, helocAvailable: available(), helocTranches: { ...tranches },
      householdReserve: hhRes, rentalReserve: rentalRes, reserveRequired: res,
      spendable: Math.max(0, cash - hhRes - rentalRes - inp.cash.otherCommittedCash),
      // Exclude borrowed cash: draws go straight to their use, but a consolidation draw frees cash that
      // would otherwise have repaid debt, so its outstanding balance is not counted as savings progress.
      eligibleSaved: Math.max(0, cash - Object.entries(tranches).reduce((s, [k, v]) => s + (k.startsWith('consolidation:') ? v : 0), 0)),
      // NetWorth = Unrestricted + Restricted + Assets - AllDebt - TenantDepositLiabilities
      netWorth: cash + restrictedCash + assets - allDebt - restrictedCash,
      cltvDrawn: homeValue > 0 ? (homeLiens + heloc) / homeValue : 0,
      cltvCommitted: homeValue > 0 ? (homeLiens + (helocOpen ? capLimit : 0)) / homeValue : 0,
      surplus, props, flags,
    });
  }

  return { rows, forecastStart: fStart, closings, acqs, flags: globalFlags };

  // ---------- helpers (closures over state) ----------
  function payHelocPrincipal(x: number) {
    if (x <= 0 || heloc <= 0) return;
    const total = heloc;
    for (const k of Object.keys(tranches)) tranches[k] -= x * (tranches[k] / total);
    heloc = Math.max(0, heloc - x);
    if (heloc < 1e-6) { heloc = 0; for (const k of Object.keys(tranches)) tranches[k] = 0; }
  }
  function householdReserveAt(t: number) {
    // household essentials: living essentials + primary housing + consumer & Yukon minimums
    const yrs = Math.max(0, Math.floor((t - fStart) / 12));
    const ess = n0(inp.household.essentialsMonthly) * Math.pow(1 + inp.household.expenseInflation, yrs);
    const housing = (primary > 0 ? n0(inp.home.mortgage.payment) : 0) + n0(inp.home.mortgage.escrowMonthly);
    const mins = inp.consumer.debts.reduce((s, d) => s + (consumer[d.id] > 0 ? n0(d.minPayment) : 0), 0) + (yukon > 0 ? n0(inp.yukon.loan.payment) : 0);
    return inp.cash.householdReserveMonths * (ess + housing + mins);
  }
  function rentalReserveAt(t: number) {
    // rental fixed costs: mortgage + allocated HELOC service + taxes + insurance + HOA + unavoidable utilities
    let fixed = 0;
    const nr = rentalMonth(inp.novella.ops, t, novellaLeaseIdx, true, false, undefined);
    fixed += (novellaBal > 0 ? n0(inp.novella.loan.payment) : 0) + n0(inp.novella.loan.escrowMonthly) + nr.taxes + nr.insurance + nr.hoa + nr.utilities;
    for (const a of acqs) {
      const s0 = acqState[a.id];
      if (!s0) continue;
      const r = rentalMonth(a.ops, t, s0.rentStart, true, false, undefined);
      const hs = ((tranches[`acq:${a.id}`] ?? 0) * Math.min(inp.heloc.cap, Math.max(inp.heloc.floor, inp.heloc.indexRate + inp.heloc.margin))) / 12;
      fixed += (s0.bal > 0 ? s0.payment : 0) + hs + r.taxes + r.insurance + r.hoa + r.utilities;
    }
    return inp.cash.rentalReserveMonths * fixed;
  }
}

function propMonth(r: RentalCalc, ds: number, int: number, prin: number, escrow: number, capital: number, value: number, bal: number): PropertyMonth {
  // CashFlowBeforeHELOC = NOI - MortgageDebtService - CapExProvision (escrow is part of debt service when taxes are escrowed)
  const cfb = r.noi - ds - escrow - r.capexProvision;
  return {
    scheduledRent: r.scheduledRent, vacancyLoss: r.vacancyLoss, collected: r.collected, otherIncome: r.otherIncome, opex: r.opex, noi: r.noi,
    capexProvision: r.capexProvision, mortgageDebtService: ds + escrow, mortgageInterest: int, mortgagePrincipal: prin, escrow,
    helocInterest: 0, helocPrincipal: 0, capitalSpend: capital, cashFlowBeforeHeloc: cfb, cashFlowAfterHeloc: cfb,
    cashImpact: r.collected + r.otherIncome - r.opex - ds - escrow - capital,
    fixedCosts: ds + escrow + r.taxes + r.insurance + r.hoa + r.utilities, value, loanBalance: bal, helocAllocated: 0,
  };
}

function consumerOrder(inp: Inputs, bal: Record<string, number>) {
  const ds = [...inp.consumer.debts];
  if (inp.consumer.strategy === 'avalanche') ds.sort((a, b) => n0(b.apr) - n0(a.apr));
  else ds.sort((a, b) => bal[a.id] - bal[b.id]);
  return ds;
}
