import { describe, expect, it } from 'vitest';
import { acceptanceExamples, annualSummary, checkpoint, validationChecks } from './analysis';
import { defaultInputs, illustrativeInputs } from './defaults';
import { simulate } from './engine';
import { amortStep, depositPeriods, pmt, requiredMonthlySaving, ymToIdx } from './finance';
import { runModel, SCENARIOS } from './scenario';

describe('Section 12 acceptance examples', () => {
  const ex = acceptanceExamples();
  it('reproduces the six funding examples in Section 7', () => {
    expect(ex.funding.map((r) => Math.round(r.need))).toEqual([75600, 88250, 94000, 99750, 102000, 116000]);
    expect(ex.funding.map((r) => Math.round(r.gap))).toEqual([15600, 28250, 34000, 39750, 42000, 56000]);
    expect(Math.round(ex.maxPrice!)).toBe(152174);
  });
  it('reproduces the hypothetical HELOC capacities', () => {
    expect(ex.heloc80).toBe(165000);
    expect(ex.heloc85).toBe(190000);
  });
  it('0% loan over 100 months pays $1,000', () => expect(ex.zeroRatePayment).toBe(1000));
  it('$10,000 HELOC at 12% interest-only accrues $100 and no principal', () => {
    expect(ex.helocInterest).toBeCloseTo(100, 10);
    expect(ex.helocPrincipal).toBe(0);
  });
  it('HELOC cost of the $28,250 gap ≈ $212 / $283', () => {
    expect(Math.round(ex.helocCost9)).toBe(212);
    expect(Math.round(ex.helocCost12)).toBe(283);
  });
  it('15 vs 16 deposit periods', () => {
    expect(depositPeriods(ymToIdx('2026-10'), ymToIdx('2028-02'), 'start')).toBe(15);
    expect(depositPeriods(ymToIdx('2026-10'), ymToIdx('2028-02'), 'end')).toBe(16);
    expect(requiredMonthlySaving(60000, 0, 0, 15)).toBe(4000);
    expect(requiredMonthlySaving(60000, 0, 0, 16)).toBe(3750);
  });
  it('caps the final payment and never goes negative', () => {
    const s = amortStep(300, 0.12, 1000, 500);
    expect(s.ending).toBe(0);
    expect(s.payment).toBeCloseTo(303);
    expect(s.extraPrincipal).toBe(0);
    expect(pmt(1000, 0.12, 0)).toBe(1000);
  });
});

describe('engine', () => {
  it('blocks the engine when mandatory inputs are blank (INPUT REQUIRED, not zero)', () => {
    const run = runModel(defaultInputs());
    expect(run.ready).toBe(false);
    expect(run.sim).toBeNull();
    expect(run.missing.length).toBeGreaterThan(5);
  });

  const inp = illustrativeInputs();
  const run = runModel(inp);
  it('runs with illustrative inputs and all automated checks pass', () => {
    expect(run.ready).toBe(true);
    const checks = validationChecks(inp, run);
    const failed = checks.filter((c) => c.pass === false);
    expect(failed).toEqual([]);
  });
  it('cash rolls forward every month', () => {
    for (const r of run.sim!.rows.filter((x) => x.modeled)) expect(r.cashStart + r.inflows - r.outflows).toBeCloseTo(r.cashEnd, 6);
  });
  it('consumer debt clears by the target date', () => {
    const t = ymToIdx(inp.consumer.targetPayoff);
    expect(run.sim!.rows[t].bal.consumer).toBeLessThan(0.01);
  });
  it('outputs respond to inputs (no hard-coded figures)', () => {
    const a = checkpoint(inp, run.sim!);
    const inp2 = structuredClone(inp);
    inp2.household.discretionaryMonthly = (inp2.household.discretionaryMonthly ?? 0) + 500;
    const b = checkpoint(inp2, runModel(inp2).sim!);
    expect(a.eligibleSaved - b.eligibleSaved).toBeGreaterThan(500 * 10);
  });
  it('HELOC draw alone creates no net worth', () => {
    const i2 = structuredClone(inp);
    i2.heloc.consolidateDebts = true;
    i2.heloc.consolidationMonth = '2026-12';
    i2.heloc.openMonth = '2026-11';
    i2.consumer.enforceTarget = false;
    const s = simulate(i2, {});
    const r = s.rows[ymToIdx('2026-12')];
    expect(r.draws.heloc).toBeGreaterThan(0);
    expect(r.bal.consumer).toBeLessThan(0.01);
    const prev = s.rows[ymToIdx('2026-11')];
    // net worth change equals the month's operating result, not the draw
    expect(Math.abs(r.netWorth - prev.netWorth)).toBeLessThan(r.draws.heloc);
  });
  it('every scenario runs and is reproducible', () => {
    for (const sc of SCENARIOS) {
      const a = runModel(inp, sc.id);
      const b = runModel(inp, sc.id);
      expect(a.sim!.rows[131].cashEnd).toBeCloseTo(b.sim!.rows[131].cashEnd, 8);
    }
  });
  it('annual summary covers 11 years', () => {
    expect(annualSummary(inp, run.sim!)).toHaveLength(11);
  });
});
