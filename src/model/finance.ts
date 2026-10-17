import type { Ym } from './types';

// ---------- Calendar ----------
export const START_YEAR = 2026;
export const PERIODS = 132; // Jan 2026 – Dec 2036 inclusive

export function ymToIdx(ym: Ym): number {
  const [y, m] = ym.split('-').map(Number);
  return (y - START_YEAR) * 12 + (m - 1);
}
export function idxToYm(idx: number): Ym {
  const y = START_YEAR + Math.floor(idx / 12);
  const m = (((idx % 12) + 12) % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function ymLabel(ym: Ym): string {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}
export const idxLabel = (idx: number) => ymLabel(idxToYm(idx));
export const yearOf = (idx: number) => START_YEAR + Math.floor(idx / 12);

// ---------- Section 5: fixed-rate amortization ----------
/** Payment = IF(r=0, B/n, B*r/(1-(1+r)^(-n))) with r = annual/12. */
export function pmt(balance: number, annualRate: number, n: number): number {
  if (n <= 0) return balance;
  const r = annualRate / 12;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

export interface AmortStep {
  interest: number;
  regularPrincipal: number;
  extraPrincipal: number;
  payment: number; // regular payment actually made (capped at principal + interest)
  ending: number;
  belowInterest: boolean; // payment < accrued interest (flag)
}

/**
 * Interest[t] = Beginning * r
 * RegularPrincipal = MIN(Beginning, MAX(0, Payment - Interest))
 * ExtraPrincipal = MIN(MAX(0, ExtraRequested), Beginning - RegularPrincipal)
 * Ending = Beginning - RegularPrincipal - ExtraPrincipal
 */
export function amortStep(beginning: number, annualRate: number, payment: number, extraRequested = 0): AmortStep {
  if (beginning <= 0) return { interest: 0, regularPrincipal: 0, extraPrincipal: 0, payment: 0, ending: 0, belowInterest: false };
  const interest = beginning * (annualRate / 12);
  const regularPrincipal = Math.min(beginning, Math.max(0, payment - interest));
  const extraPrincipal = Math.min(Math.max(0, extraRequested), beginning - regularPrincipal);
  const ending = beginning - regularPrincipal - extraPrincipal;
  return {
    interest,
    regularPrincipal,
    extraPrincipal,
    payment: Math.min(payment, interest + regularPrincipal), // final payment capped
    ending: ending < 1e-9 ? 0 : ending,
    belowInterest: payment < interest - 1e-9,
  };
}

// ---------- Section 4: savings ----------
/** RequiredMonthlySaving = MAX(0, (Target - C0 - NetLumpSums) / N) */
export function requiredMonthlySaving(target: number, c0: number, netLumpSums: number, n: number): number | null {
  if (n <= 0) return null;
  return Math.max(0, (target - c0 - netLumpSums) / n);
}
/** Number of month-end deposits between the opening balance month and the checkpoint. */
export function depositPeriods(openingIdx: number, checkpointIdx: number, convention: 'start' | 'end'): number {
  return checkpointIdx - openingIdx - (convention === 'start' ? 1 : 0);
}

// ---------- Section 6: HELOC capacity ----------
/** PotentialTotalHELOCLine = MAX(0, c*V - M - L) */
export const potentialHelocLine = (c: number, v: number, m: number, l: number) => Math.max(0, c * v - m - l);
/** ReportedEquityCheck = V - M - L - ReportedEquity */
export const reportedEquityCheck = (v: number, m: number, l: number, reported: number) => v - m - l - reported;
/** Rate[t] = MIN(Cap, MAX(Floor, Index + Margin)) */
export const helocRate = (index: number, margin: number, floor: number, cap: number) => Math.min(cap, Math.max(floor, index + margin));

// ---------- Section 7: cash needed ----------
export interface CashNeededParts {
  price: number;
  downPct: number;
  closingCash: number;
  initialWork: number;
  leaseUpCash: number;
  postCloseReserves: number;
}
/** CashNeeded = Price*DownPct + ClosingCash + InitialWork + LeaseUpCash + RequiredPostCloseReserves */
export const cashNeeded = (p: CashNeededParts) => p.price * p.downPct + p.closingCash + p.initialWork + p.leaseUpCash + p.postCloseReserves;
/** FundingGap = MAX(0, CashNeeded - EligibleCash - OtherConfirmedFunds) */
export const fundingGap = (needed: number, eligible: number, other: number) => Math.max(0, needed - eligible - other);
/** Max price without borrowing = (Cash - Reserves - Work - LeaseUp) / (DownPct + ClosingPct) */
export const maxPriceWithoutBorrowing = (cash: number, reserves: number, work: number, leaseUp: number, downPct: number, closingPct: number) =>
  downPct + closingPct > 0 ? (cash - reserves - work - leaseUp) / (downPct + closingPct) : null;

// ---------- Section 8: operating and return formulas ----------
export const ratio = (num: number, den: number): number | null => (den === 0 || !isFinite(den) ? null : num / den);

/** BreakEvenRent = (Fixed + DebtService + FixedCapEx - OtherNetIncome) / ((1-vacancy)*(1-variablePct)) */
export function breakEvenRent(fixed: number, debtService: number, fixedCapex: number, otherNetIncome: number, vacancy: number, variablePct: number): number | null {
  const den = (1 - vacancy) * (1 - variablePct);
  if (den <= 0) return null;
  return (fixed + debtService + fixedCapex - otherNetIncome) / den;
}

// ---------- Section 11: XIRR ----------
export function xirr(flows: { idx: number; amount: number }[]): number | null {
  const f = flows.filter((x) => Math.abs(x.amount) > 1e-6);
  if (!f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null;
  const t0 = f[0].idx;
  const npv = (r: number) => f.reduce((s, x) => s + x.amount / Math.pow(1 + r, (x.idx - t0) / 12), 0);
  let lo = -0.99, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fm * flo < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Monthly growth factor for an effective annual rate: (1+g)^(1/12) */
export const monthlyGrowth = (g: number) => Math.pow(1 + g, 1 / 12);
