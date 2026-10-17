// Month strings are 'YYYY-MM'. The calculation calendar runs Jan 2026 – Dec 2036 (132 periods).
export type Ym = string;

export type InputStatus =
  | 'USER REPORTED'
  | 'TARGET'
  | 'PRIOR DISCUSSION'
  | 'ILLUSTRATIVE'
  | 'INPUT REQUIRED'
  | 'VERIFIED'
  | 'NOT APPLICABLE';

export interface RegisterEntry {
  status: InputStatus;
  source: string;
  owner: string;
  effectiveDate: string;
  verifiedOn: string;
  note?: string;
}

export interface Earner {
  id: string;
  name: string;
  netMonthly: number | null; // take-home, already net of payroll deductions
  grossMonthly: number | null; // qualifying gross income (lender DTI)
}

export interface DatedAmount {
  id: string;
  month: Ym;
  amount: number;
  label: string;
}

export interface RecurringItem {
  id: string;
  label: string;
  amount: number;
  start: Ym;
  end: Ym; // '' = open-ended
}

export interface FixedLoan {
  balance: number | null; // principal as of the opening balance date
  apr: number | null; // decimal
  payment: number | null; // contractual P&I, excluding escrow
  remainingMonths: number | null;
  escrowMonthly: number | null; // paid with the loan; taxes/insurance must not also be entered as opex
}

export interface RentalOps {
  rentMonthly: number | null;
  rentGrowth: number; // annual, applied at each lease anniversary
  leaseStart: Ym;
  vacancyPct: number; // allowance on scheduled rent
  otherIncomeMonthly: number;
  taxesAnnual: number | null;
  insuranceAnnual: number | null;
  taxInsGrowth: number; // annual
  hoaMonthly: number;
  utilitiesMonthly: number;
  mgmtPct: number; // of collected rent
  repairsPct: number; // routine repairs, of collected rent
  capexPct: number; // capital provision, of collected rent (non-cash provision)
  securityDeposit: number; // refundable; restricted cash with matching liability
  value: number | null;
  valueGrowth: number; // effective annual
}

export interface ConsumerDebt {
  id: string;
  name: string;
  balance: number | null;
  apr: number | null; // post-promo / standard APR
  promoApr: number;
  promoEnd: Ym; // '' = no promo
  minPayment: number | null;
  targetPayoff: Ym; // '' = use the global consumer-debt target
}

export type FundingMode = 'cash' | 'heloc';

export interface Acquisition {
  id: string;
  name: string;
  enabled: boolean;
  proposedMonth: Ym;
  minGapAfterPrevious: number; // months after the prior acquisition closes (0 = none)
  price: number | null;
  priceGrowth: number; // annual drift applied if the closing is deferred
  downPct: number;
  closingPct: number; // closing cash as % of price (lender fees, title, prepaids, net of credits)
  initialWork: number;
  leaseUpMonths: number; // months from closing until rent begins
  leaseUpCash: number;
  otherConfirmedFunds: number;
  rate: number | null; // new mortgage note rate (dated lender quote)
  termMonths: number;
  funding: FundingMode;
  helocCap: number; // max draw for this purchase
  landPct: number; // optional tax module
  sellingCostPct: number;
  saleTaxEstimate: number;
  ops: RentalOps;
}

export interface ActualMonth {
  id: string;
  month: Ym;
  netIncome: number;
  livingExpenses: number;
  rentCollected: number;
  propertyExpenses: number;
  debtPayments: number;
  endingCash: number | null;
}

export type YukonPolicy = 'scheduled' | 'accelerated' | 'savingsFirst';
export type ScenarioId = 'custom' | 'A' | 'B' | 'C' | 'D';

export interface StressSettings {
  priceShockPct: number; // ±10%
  valueDeclinePct: number; // immediate decline, then flat
  rentCutPct: number;
  vacancyStressPct: number;
  vacancyEventMonths: number;
  repairsStressPct: number;
  capexStressPct: number;
  majorRepair: number; // dated major repair cash event
  mgmtStressPct: number;
  taxInsStepPct: number;
  mortgageRateShock1: number;
  mortgageRateShock2: number;
  helocShock1: number;
  helocShock2: number;
  incomeLossMonths: number;
  incomeLossEarner: number; // index into earners
  rehabOverrunPct: number;
  leaseUpDelayMonths: number;
  extraTurnoverCost: number;
}

export interface Inputs {
  version: 1;
  control: {
    actualsThrough: Ym; // opening balances are as of the end of this month
    checkpointMonth: Ym;
    checkpointConvention: 'start' | 'end'; // Feb 1 vs month-end
    savingsTarget: number;
    targetIncludesReserves: boolean;
    reportedEquity: number;
    scenario: ScenarioId;
    downsideTest: string; // stress id used by the purchase stress-survival test
    autoDefer: boolean;
  };
  household: {
    earners: Earner[];
    bonuses: DatedAmount[];
    incomeGrowth: number;
    essentialsMonthly: number | null;
    discretionaryMonthly: number | null;
    retirementMonthly: number;
    expenseInflation: number;
    recurring: RecurringItem[];
    oneTime: DatedAmount[];
  };
  cash: {
    openingCash: number | null; // unrestricted
    householdReserveMonths: number;
    rentalReserveMonths: number;
    otherCommittedCash: number;
  };
  home: {
    value: number | null;
    valuationDate: string;
    valueGrowth: number;
    mortgage: FixedLoan;
    otherLiens: number;
  };
  novella: {
    loan: FixedLoan;
    ops: RentalOps;
    capitalWork: DatedAmount[];
  };
  consumer: {
    debts: ConsumerDebt[];
    targetPayoff: Ym;
    enforceTarget: boolean;
    strategy: 'avalanche' | 'snowball';
    extraMonthly: number;
  };
  yukon: {
    loan: FixedLoan;
    policy: YukonPolicy;
    extraMonthly: number;
    lumpSums: DatedAmount[];
    savingsFirstSplitPct: number;
    requirePaidBeforeAcquisition: boolean;
  };
  heloc: {
    enabled: boolean;
    approvedLine: number | null;
    maxCltv: number | null;
    holds: number;
    indexRate: number;
    margin: number;
    floor: number;
    cap: number;
    openMonth: Ym;
    drawEndMonth: Ym;
    repaymentMonths: number;
    interestOnly: boolean;
    minPaymentPct: number;
    originationFee: number;
    annualFee: number;
    householdMaxDraw: number;
    consolidateDebts: boolean;
    consolidationMonth: Ym;
    extraPrincipalMonthly: number;
    targetPayoff: Ym;
    postYukonRepayPct: number;
    freezeMonth: Ym; // '' = never frozen
  };
  homeAddition: {
    enabled: boolean;
    month: Ym;
    cost: number;
    helocPct: number;
    valueAddPct: number;
  };
  acquisitions: Acquisition[];
  policy: {
    dscrBase: number;
    dscrDownside: number;
    downsideRentCutPct: number;
    downsideVacancyPct: number;
    lenderDscrMin: number;
    maxDti: number;
    lenderRentFactor: number;
    stressCashFloor: number;
    requireConsumerCleared: boolean;
    scenarioCGapMonths: number;
    scenarioDDelayMonths: number;
  };
  stress: StressSettings;
  actuals: ActualMonth[];
  register: Record<string, RegisterEntry>;
}
