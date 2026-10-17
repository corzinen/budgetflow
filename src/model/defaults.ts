import type { Acquisition, Inputs, RegisterEntry, RentalOps, InputStatus } from './types';

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const reg = (status: InputStatus, source: string, owner = 'Household', note = ''): RegisterEntry => ({
  status,
  source,
  owner,
  effectiveDate: '',
  verifiedOn: '',
  note,
});

export function blankOps(): RentalOps {
  return {
    rentMonthly: null,
    rentGrowth: 0.02,
    leaseStart: '',
    vacancyPct: 0.05,
    otherIncomeMonthly: 0,
    taxesAnnual: null,
    insuranceAnnual: null,
    taxInsGrowth: 0.03,
    hoaMonthly: 0,
    utilitiesMonthly: 0,
    mgmtPct: 0.08,
    repairsPct: 0.05,
    capexPct: 0.05,
    securityDeposit: 0,
    value: null,
    valueGrowth: 0,
  };
}

export function blankAcquisition(name: string, proposedMonth: string, enabled: boolean): Acquisition {
  return {
    id: uid('acq'),
    name,
    enabled,
    proposedMonth,
    minGapAfterPrevious: 0,
    price: null,
    priceGrowth: 0,
    downPct: 0.2,
    closingPct: 0.03,
    initialWork: 5000,
    leaseUpMonths: 1,
    leaseUpCash: 0,
    otherConfirmedFunds: 0,
    rate: null,
    termMonths: 360,
    funding: 'cash',
    helocCap: 0,
    landPct: 0.2,
    sellingCostPct: 0.07,
    saleTaxEstimate: 0,
    ops: blankOps(),
  };
}

/**
 * Spec defaults. Mandatory figures that the household has not supplied are null and render as
 * INPUT REQUIRED. Values here are only those stated in the requirements (targets, prior discussion,
 * and the provisional Section 9 assumptions) and every one is editable.
 */
export function defaultInputs(): Inputs {
  return {
    version: 1,
    control: {
      actualsThrough: '2026-10',
      checkpointMonth: '2028-02',
      checkpointConvention: 'start',
      savingsTarget: 60000,
      targetIncludesReserves: true,
      reportedEquity: 265000,
      scenario: 'custom',
      downsideTest: 'combined',
      autoDefer: true,
    },
    household: {
      earners: [{ id: uid('earner'), name: 'Earner 1', netMonthly: null, grossMonthly: null }],
      bonuses: [],
      incomeGrowth: 0,
      essentialsMonthly: null,
      discretionaryMonthly: null,
      retirementMonthly: 0,
      expenseInflation: 0,
      recurring: [],
      oneTime: [],
    },
    cash: { openingCash: null, householdReserveMonths: 6, rentalReserveMonths: 6, otherCommittedCash: 0 },
    home: {
      value: null,
      valuationDate: '',
      valueGrowth: 0,
      mortgage: { balance: null, apr: 0.0225, payment: null, remainingMonths: null, escrowMonthly: null },
      otherLiens: 0,
    },
    novella: {
      loan: { balance: null, apr: null, payment: null, remainingMonths: null, escrowMonthly: null },
      ops: blankOps(),
      capitalWork: [],
    },
    consumer: { debts: [], targetPayoff: '2028-01', enforceTarget: true, strategy: 'avalanche', extraMonthly: 0 },
    yukon: {
      loan: { balance: null, apr: null, payment: null, remainingMonths: null, escrowMonthly: 0 },
      policy: 'savingsFirst',
      extraMonthly: 0,
      lumpSums: [],
      savingsFirstSplitPct: 0.5,
      requirePaidBeforeAcquisition: false,
    },
    heloc: {
      enabled: true,
      approvedLine: null,
      maxCltv: null,
      holds: 0,
      indexRate: 0.075,
      margin: 0.005,
      floor: 0.04,
      cap: 0.18,
      openMonth: '2026-12',
      drawEndMonth: '2036-12',
      repaymentMonths: 240,
      interestOnly: true,
      minPaymentPct: 0,
      originationFee: 0,
      annualFee: 0,
      householdMaxDraw: 60000,
      consolidateDebts: false,
      consolidationMonth: '2026-12',
      extraPrincipalMonthly: 0,
      targetPayoff: '',
      postYukonRepayPct: 0.5,
      freezeMonth: '',
    },
    homeAddition: { enabled: false, month: '2029-06', cost: 0, helocPct: 1, valueAddPct: 0.6 },
    acquisitions: [
      { ...blankAcquisition('Rental 1', '2028-02', true), funding: 'cash' },
      { ...blankAcquisition('Rental 2', '2029-02', false), minGapAfterPrevious: 12, funding: 'heloc' },
    ],
    policy: {
      dscrBase: 1.25,
      dscrDownside: 1.0,
      downsideRentCutPct: 0.1,
      downsideVacancyPct: 0.1,
      lenderDscrMin: 1.0,
      maxDti: 0.45,
      lenderRentFactor: 0.75,
      stressCashFloor: 0,
      requireConsumerCleared: true,
      scenarioCGapMonths: 12,
      scenarioDDelayMonths: 6,
    },
    stress: {
      priceShockPct: 0.1,
      valueDeclinePct: 0.15,
      rentCutPct: 0.1,
      vacancyStressPct: 0.1,
      vacancyEventMonths: 3,
      repairsStressPct: 0.08,
      capexStressPct: 0.1,
      majorRepair: 20000,
      mgmtStressPct: 0.1,
      taxInsStepPct: 0.2,
      mortgageRateShock1: 0.01,
      mortgageRateShock2: 0.02,
      helocShock1: 0.02,
      helocShock2: 0.03,
      incomeLossMonths: 6,
      incomeLossEarner: 0,
      rehabOverrunPct: 0.2,
      leaseUpDelayMonths: 3,
      extraTurnoverCost: 3000,
    },
    actuals: [],
    register: {
      'control.savingsTarget': reg('TARGET', 'User statement [1]; confirm reserve inclusion and exact day'),
      'control.checkpointMonth': reg('TARGET', 'User statement [1]'),
      'control.reportedEquity': reg('USER REPORTED', 'User statement [1]; overrides earlier $325k–$375k estimates'),
      'home.mortgage.apr': reg('PRIOR DISCUSSION', 'Previous assistant mention; verify against the note'),
      'consumer.targetPayoff': reg('TARGET', 'Eliminate other consumer debt by the Feb 2028 checkpoint'),
      'policy.dscrBase': reg('ILLUSTRATIVE', 'Section 8 proposed planning requirement'),
      'cash.householdReserveMonths': reg('ILLUSTRATIVE', 'Section 9 base reserve policy'),
      'cash.rentalReserveMonths': reg('ILLUSTRATIVE', 'Section 9 base reserve policy'),
    },
  };
}

/**
 * Illustrative household used only to demonstrate model mechanics. Every figure is labelled
 * ILLUSTRATIVE; outputs are not decision-ready until replaced with statements.
 */
export function illustrativeInputs(): Inputs {
  const d = defaultInputs();
  const ill = (source = 'Illustrative example – replace with statement') => reg('ILLUSTRATIVE', source);
  const r1 = d.acquisitions[0];
  const r2 = d.acquisitions[1];
  const acqOps = (): RentalOps => ({
    ...blankOps(),
    rentMonthly: 2450,
    taxesAnnual: 3300,
    insuranceAnnual: 1500,
    securityDeposit: 2400,
  });
  const out: Inputs = {
    ...d,
    household: {
      ...d.household,
      earners: [
        { id: uid('earner'), name: 'Earner 1', netMonthly: 6800, grossMonthly: 9500 },
        { id: uid('earner'), name: 'Earner 2', netMonthly: 4200, grossMonthly: 5800 },
      ],
      bonuses: [
        { id: uid('b'), month: '2027-03', amount: 6000, label: 'Annual bonus (net)' },
        { id: uid('b'), month: '2028-03', amount: 6000, label: 'Annual bonus (net)' },
      ],
      essentialsMonthly: 4300,
      discretionaryMonthly: 1100,
      oneTime: [{ id: uid('o'), month: '2027-07', amount: 4000, label: 'Family travel' }],
    },
    cash: { ...d.cash, openingCash: 18000 },
    home: {
      ...d.home,
      value: 500000,
      valuationDate: '2026-10-01',
      mortgage: { balance: 235000, apr: 0.0225, payment: 1217, remainingMonths: 240, escrowMonthly: 560 },
    },
    novella: {
      loan: { balance: 172000, apr: 0.0375, payment: 931, remainingMonths: 276, escrowMonthly: 0 },
      ops: { ...blankOps(), rentMonthly: 2100, leaseStart: '2026-06', taxesAnnual: 3000, insuranceAnnual: 1400, securityDeposit: 2100, value: 255000 },
      capitalWork: [{ id: uid('cw'), month: '2026-12', amount: 4000, label: 'Remaining remodel commitment' }],
    },
    consumer: {
      ...d.consumer,
      debts: [
        { id: uid('cd'), name: 'Credit card', balance: 7800, apr: 0.229, promoApr: 0, promoEnd: '', minPayment: 235, targetPayoff: '' },
        { id: uid('cd'), name: 'SoFi personal loan', balance: 12400, apr: 0.11, promoApr: 0, promoEnd: '', minPayment: 410, targetPayoff: '' },
      ],
    },
    yukon: { ...d.yukon, extraMonthly: 600, loan: { balance: 41000, apr: 0.069, payment: 833, remainingMonths: 58, escrowMonthly: 0 } },
    heloc: { ...d.heloc, approvedLine: 165000, maxCltv: 0.8 },
    homeAddition: { ...d.homeAddition, cost: 80000 },
    acquisitions: [
      { ...r1, price: 235000, rate: 0.065, ops: acqOps(), helocCap: 40000 },
      { ...r2, price: 235000, rate: 0.065, ops: acqOps(), helocCap: 40000 },
    ],
  };
  const keys = [
    'cash.openingCash', 'household.essentialsMonthly', 'household.discretionaryMonthly', 'home.value',
    'home.mortgage.balance', 'home.mortgage.payment', 'home.mortgage.remainingMonths', 'home.mortgage.escrowMonthly',
    'novella.loan.balance', 'novella.loan.apr', 'novella.loan.payment', 'novella.loan.remainingMonths',
    'novella.ops.rentMonthly', 'novella.ops.value', 'yukon.loan.balance', 'yukon.loan.apr', 'yukon.loan.payment',
    'yukon.loan.remainingMonths', 'heloc.approvedLine', 'heloc.maxCltv',
  ];
  out.register = { ...d.register };
  for (const k of keys) out.register[k] = ill();
  return out;
}
