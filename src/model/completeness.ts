import type { Inputs } from './types';

export interface MissingInput {
  path: string;
  label: string;
  blocksEngine: boolean; // true: monthly engine cannot run; false: blocks a specific decision only
}

/** Blank mandatory inputs must display INPUT REQUIRED rather than zero or a passing result. */
export function missingInputs(inp: Inputs): MissingInput[] {
  const out: MissingInput[] = [];
  const need = (v: unknown, path: string, label: string, blocksEngine = true) => {
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) out.push({ path, label, blocksEngine });
  };
  need(inp.cash.openingCash, 'cash.openingCash', 'Opening unrestricted cash');
  inp.household.earners.forEach((e, i) => {
    need(e.netMonthly, `household.earners.${i}.netMonthly`, `${e.name}: net monthly pay`);
    need(e.grossMonthly, `household.earners.${i}.grossMonthly`, `${e.name}: gross qualifying income (lender DTI)`, false);
  });
  if (inp.household.earners.length === 0) out.push({ path: 'household.earners', label: 'At least one earner', blocksEngine: true });
  need(inp.household.essentialsMonthly, 'household.essentialsMonthly', 'Essential living expenses');
  need(inp.household.discretionaryMonthly, 'household.discretionaryMonthly', 'Discretionary spending');
  need(inp.home.value, 'home.value', 'Primary home market value');
  const m = inp.home.mortgage;
  need(m.balance, 'home.mortgage.balance', 'Primary mortgage balance');
  need(m.apr, 'home.mortgage.apr', 'Primary mortgage rate');
  need(m.payment, 'home.mortgage.payment', 'Primary mortgage P&I payment');
  need(m.remainingMonths, 'home.mortgage.remainingMonths', 'Primary mortgage remaining installments');
  need(m.escrowMonthly, 'home.mortgage.escrowMonthly', 'Primary mortgage escrow');
  const n = inp.novella.loan;
  need(n.balance, 'novella.loan.balance', 'Novella loan balance');
  need(n.apr, 'novella.loan.apr', 'Novella loan rate');
  need(n.payment, 'novella.loan.payment', 'Novella contractual payment');
  need(n.remainingMonths, 'novella.loan.remainingMonths', 'Novella remaining installments');
  need(n.escrowMonthly, 'novella.loan.escrowMonthly', 'Novella escrow (0 if none)');
  need(inp.novella.ops.rentMonthly, 'novella.ops.rentMonthly', 'Novella contractual rent');
  need(inp.novella.ops.taxesAnnual, 'novella.ops.taxesAnnual', 'Novella property taxes (0 if escrowed)');
  need(inp.novella.ops.insuranceAnnual, 'novella.ops.insuranceAnnual', 'Novella insurance (0 if escrowed)');
  need(inp.novella.ops.value, 'novella.ops.value', 'Novella market value');
  const y = inp.yukon.loan;
  need(y.balance, 'yukon.loan.balance', 'Yukon balance');
  need(y.apr, 'yukon.loan.apr', 'Yukon APR');
  need(y.payment, 'yukon.loan.payment', 'Yukon payment');
  need(y.remainingMonths, 'yukon.loan.remainingMonths', 'Yukon remaining installments');
  inp.consumer.debts.forEach((d, i) => {
    need(d.balance, `consumer.debts.${i}.balance`, `${d.name}: balance`);
    need(d.apr, `consumer.debts.${i}.apr`, `${d.name}: APR`);
    need(d.minPayment, `consumer.debts.${i}.minPayment`, `${d.name}: minimum payment`);
  });
  const usesHeloc =
    inp.heloc.enabled &&
    (inp.heloc.consolidateDebts ||
      (inp.homeAddition.enabled && inp.homeAddition.helocPct > 0) ||
      inp.acquisitions.some((a) => a.enabled && a.funding === 'heloc') ||
      inp.control.scenario === 'B' ||
      inp.control.scenario === 'C');
  if (usesHeloc) need(inp.heloc.approvedLine, 'heloc.approvedLine', 'HELOC approved limit (written lender terms)');
  need(inp.heloc.maxCltv, 'heloc.maxCltv', 'Lender maximum CLTV', false);
  inp.acquisitions.forEach((a, i) => {
    if (!a.enabled && inp.control.scenario !== 'C') return;
    need(a.price, `acquisitions.${i}.price`, `${a.name}: price`, false);
    need(a.rate, `acquisitions.${i}.rate`, `${a.name}: mortgage rate (lender quote)`, false);
    need(a.ops.rentMonthly, `acquisitions.${i}.ops.rentMonthly`, `${a.name}: market rent`, false);
    need(a.ops.taxesAnnual, `acquisitions.${i}.ops.taxesAnnual`, `${a.name}: property taxes`, false);
    need(a.ops.insuranceAnnual, `acquisitions.${i}.ops.insuranceAnnual`, `${a.name}: insurance quote`, false);
  });
  return out;
}

export const acquisitionReady = (inp: Inputs, idx: number) =>
  !missingInputs(inp).some((m) => m.path.startsWith(`acquisitions.${idx}.`));
