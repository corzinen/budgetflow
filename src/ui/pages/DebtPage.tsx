import { useMemo } from 'react';
import { useModel } from '../../App';
import { checkpoint, debtSummaries } from '../../model/analysis';
import { uid } from '../../model/defaults';
import { idxLabel, pmt, ymToIdx } from '../../model/finance';
import { runModel } from '../../model/scenario';
import type { ConsumerDebt, DatedAmount, Inputs, YukonPolicy } from '../../model/types';
import { SeriesChart } from '../charts';
import { NotReady, PageHead } from '../common';
import { Grid, ListEditor, MonthField, NumField, Section, SelectField, TextField, Toggle } from '../fields';
import { usd } from '../fmt';
import { useStore } from '../store';

const clone = (x: Inputs): Inputs => JSON.parse(JSON.stringify(x));

export function DebtPage() {
  const run = useModel();
  const { inputs } = useStore();
  return (
    <>
      <PageHead title="Debt consolidation & payoff" sub="Clear consumer debt by a set date, then compare Yukon payoff policies and HELOC consolidation." />
      <DebtInputs />
      {run.sim ? <DebtOutputs base={inputs} /> : <NotReady />}
    </>
  );
}

function DebtInputs() {
  const { inputs } = useStore();
  const fs = ymToIdx(inputs.control.actualsThrough) + 1;
  return (
    <div className="two-col">
      <Section title="Consumer accounts (excluding Yukon)">
        <Grid cols={4}>
          <MonthField path="consumer.targetPayoff" label="Pay off all consumer debt by" hint="Default: before the Feb 2028 checkpoint" />
          <SelectField path="consumer.strategy" label="Extra-payment order" options={[{ value: 'avalanche', label: 'Avalanche (highest APR first)' }, { value: 'snowball', label: 'Snowball (smallest balance first)' }]} />
          <NumField path="consumer.extraMonthly" label="Extra monthly toward consumer debt" />
          <Toggle path="consumer.enforceTarget" label="Pay what is needed to hit each deadline" hint="Payment = MAX(minimum, PMT to target)" />
        </Grid>
        <ListEditor<ConsumerDebt>
          path="consumer.debts"
          addLabel="Add consumer account"
          empty="No consumer accounts entered. Add each card or loan with its statement balance."
          make={() => ({ id: uid('cd'), name: 'New account', balance: null, apr: null, promoApr: 0, promoEnd: '', minPayment: null, targetPayoff: '' })}
          render={(d, b) => {
            const bal = d.balance ?? 0;
            const target = ymToIdx(d.targetPayoff || inputs.consumer.targetPayoff);
            const n = target - fs + 1;
            const req = d.apr !== null && n > 0 ? pmt(bal, d.promoEnd && ymToIdx(d.promoEnd) >= fs ? d.promoApr : d.apr, n) : null;
            return (
              <>
                <Grid cols={4}>
                  <TextField path={`${b}.name`} label="Account" />
                  <NumField path={`${b}.balance`} label="Statement balance" required />
                  <NumField path={`${b}.apr`} label="APR (standard / post-promo)" kind="pct" required />
                  <NumField path={`${b}.minPayment`} label="Minimum payment" required />
                  <NumField path={`${b}.promoApr`} label="Promo APR" kind="pct" />
                  <MonthField path={`${b}.promoEnd`} label="Promo expires" allowBlank />
                  <MonthField path={`${b}.targetPayoff`} label="Account-specific deadline" allowBlank hint="Blank = global target" />
                </Grid>
                <p className="small muted">Payment needed from {idxLabel(fs)} to clear by {idxLabel(target)} ({n} payments): <b>{req === null ? 'INPUT REQUIRED' : usd(req)}</b>/mo</p>
              </>
            );
          }}
        />
      </Section>
      <Section title="Yukon loan">
        <Grid cols={4}>
          <NumField path="yukon.loan.balance" label="Balance" required />
          <NumField path="yukon.loan.apr" label="APR" kind="pct" required />
          <NumField path="yukon.loan.payment" label="Contractual payment" required />
          <NumField path="yukon.loan.remainingMonths" label="Remaining installments" kind="months" required />
        </Grid>
        <Grid cols={3}>
          <SelectField
            path="yukon.policy"
            label="Payoff policy"
            options={[
              { value: 'scheduled', label: 'Scheduled – contractual only' },
              { value: 'accelerated', label: 'Accelerated – extra after consumer debt clears' },
              { value: 'savingsFirst', label: 'Savings first – then split surplus' },
            ]}
          />
          <NumField path="yukon.extraMonthly" label="Accelerated: extra / month" />
          <NumField path="yukon.savingsFirstSplitPct" label="Savings first: % of surplus to Yukon" kind="pct" />
        </Grid>
        <Toggle path="yukon.requirePaidBeforeAcquisition" label="Yukon must be paid off before the first new rental" />
        <h4>Dated lump sums (accelerated policy)</h4>
        <ListEditor<DatedAmount>
          path="yukon.lumpSums"
          addLabel="Add lump sum"
          make={() => ({ id: uid('ls'), month: inputs.control.checkpointMonth, amount: 0, label: 'Lump sum' })}
          render={(_, b) => (
            <Grid cols={3}>
              <MonthField path={`${b}.month`} label="Month" />
              <NumField path={`${b}.amount`} label="Amount" />
              <TextField path={`${b}.label`} label="Note" />
            </Grid>
          )}
        />
      </Section>
    </div>
  );
}

function DebtOutputs({ base }: { base: Inputs }) {
  const run = useModel();
  const sim = run.sim!;
  const debts = debtSummaries(run.inputs, sim);
  const fs = sim.forecastStart;

  const compare = useMemo(() => {
    const policies: YukonPolicy[] = ['scheduled', 'accelerated', 'savingsFirst'];
    const pol = policies.map((p) => {
      const i = clone(base);
      i.yukon.policy = p;
      const r = runModel(i);
      if (!r.sim) return null;
      const ds = debtSummaries(r.inputs, r.sim);
      const y = ds.find((d) => d.name === 'Yukon')!;
      const cp = checkpoint(r.inputs, r.sim);
      const first = r.decisions.find((d) => d.closeIdx !== null);
      return { p, payoff: y.payoffIdx, interest: y.interest, cp: cp.measured, first: first?.closeIdx ?? null, nw: r.sim.rows[131].netWorth };
    });
    const cons = [false, true].map((on) => {
      const i = clone(base);
      i.heloc.consolidateDebts = on;
      const r = runModel(i);
      if (!r.sim) return null;
      const ds = debtSummaries(r.inputs, r.sim);
      const c = ds.find((d) => d.name === 'All consumer accounts')!;
      const h = ds.find((d) => d.name === 'HELOC')!;
      const cp = checkpoint(r.inputs, r.sim);
      const consRow = r.sim.rows.find((x) => x.f.consolidationPayoff > 0);
      const notOpen = on && r.sim.rows.some((x) => x.flags.includes('Consolidation month is before the HELOC opens'));
      return { on, notOpen, payoff: c.payoffIdx, helocPayoff: h.payoffIdx, consumerInterest: c.interest, helocInterest: h.interest, cp: cp.measured, drawn: consRow?.f.consolidationPayoff ?? 0, helocEnd: r.sim.rows[131].bal.heloc, nw: r.sim.rows[131].netWorth, ready: !!r.sim };
    });
    return { pol, cons };
  }, [base]);

  const chart = sim.rows.filter((r) => r.modeled).map((r) => {
    const o: Record<string, number | string> = { ym: r.ym, Yukon: r.bal.yukon, HELOC: r.bal.heloc };
    for (const d of run.inputs.consumer.debts) o[d.name] = r.bal.consumerById[d.id] ?? 0;
    return o;
  });
  const colors = ['var(--c5)', 'var(--c2)', 'var(--c3)', 'var(--c7)', 'var(--c1)'];

  return (
    <>
      <div className="two-col">
        <Section title="Payoff schedule">
          <table className="tbl">
            <thead><tr><th>Debt</th><th>Payoff</th><th>Deadline</th><th>Forecast interest</th><th>Dec 2036 balance</th></tr></thead>
            <tbody>
              {debts.map((d) => {
                const late = d.target !== undefined && (d.payoffIdx === null || d.payoffIdx > d.target);
                return (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td>{d.payoffIdx === null ? 'Beyond 2036' : d.payoffIdx < fs ? 'Paid' : idxLabel(d.payoffIdx)}</td>
                    <td>{d.target !== undefined ? <span className={late ? 'bad' : 'good'}>{idxLabel(d.target)} {late ? '✗' : '✓'}</span> : '—'}</td>
                    <td>{isNaN(d.interest) ? '—' : usd(d.interest)}</td>
                    <td>{usd(d.endBalance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">A freed payment is redirected from the following month under the allocation rule; it is never counted as both extra principal and savings.</p>
        </Section>
        <Section title="Consumer, Yukon and HELOC balances">
          <SeriesChart
            data={chart.slice(0, 72)}
            series={[...run.inputs.consumer.debts.map((d, i) => ({ key: d.name, color: colors[i % colors.length] })), { key: 'Yukon', color: 'var(--c6)' }, { key: 'HELOC', color: 'var(--c4)', dashed: true }]}
          />
        </Section>
      </div>
      <Section title="Yukon policy comparison">
        <table className="tbl">
          <thead><tr><th>Policy</th><th>Yukon payoff</th><th>Yukon interest</th><th>Savings at checkpoint</th><th>First acquisition</th><th>Net worth 2036</th></tr></thead>
          <tbody>
            {compare.pol.map((r) => r && (
              <tr key={r.p} className={r.p === run.inputs.yukon.policy ? 'sel' : ''}>
                <td>{r.p === 'scheduled' ? 'Scheduled payoff' : r.p === 'accelerated' ? `Accelerated (+${usd(base.yukon.extraMonthly)}/mo after consumer debt)` : `Savings first (${Math.round(base.yukon.savingsFirstSplitPct * 100)}% of surplus once target met)`}</td>
                <td>{r.payoff === null ? 'Beyond 2036' : idxLabel(r.payoff)}</td>
                <td>{usd(r.interest)}</td>
                <td>{usd(r.cp)}</td>
                <td>{r.first === null ? 'None' : idxLabel(r.first)}</td>
                <td>{usd(r.nw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Consolidate consumer debt with the HELOC?">
        <p className="small muted">
          Draws the HELOC in {idxLabel(ymToIdx(base.heloc.consolidationMonth))} to pay off every consumer account (set the month and enable on HELOC & equity).
          The debt is moved onto the primary home as collateral, so it is not removed; compare total interest and when the HELOC is repaid.
        </p>
        <table className="tbl">
          <thead><tr><th>Option</th><th>Consumer debt cleared</th><th>Consumer interest</th><th>HELOC interest</th><th>Amount consolidated</th><th>HELOC repaid</th><th>Savings at checkpoint</th><th>HELOC Dec 2036</th><th>Net worth 2036</th></tr></thead>
          <tbody>
            {compare.cons.map((r) => r ? (
              <tr key={String(r.on)} className={r.on === base.heloc.consolidateDebts ? 'sel' : ''}>
                <td>{r.on ? 'Consolidate via HELOC' : 'Pay directly'}{r.notOpen && <div className="small bad">Consolidation month is before the HELOC opens</div>}</td>
                <td>{r.payoff === null ? 'Beyond 2036' : idxLabel(r.payoff)}</td>
                <td>{usd(r.consumerInterest)}</td>
                <td>{usd(r.helocInterest)}</td>
                <td>{usd(r.drawn)}</td>
                <td>{r.drawn === 0 ? '—' : r.helocPayoff === null ? 'Beyond 2036' : idxLabel(r.helocPayoff)}</td>
                <td>{usd(r.cp)}</td>
                <td>{usd(r.helocEnd)}</td>
                <td>{usd(r.nw)}</td>
              </tr>
            ) : (
              <tr key="na"><td colSpan={9}>INPUT REQUIRED: HELOC approved limit</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
