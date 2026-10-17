import { useMemo, useState } from 'react';
import { useModel } from '../../App';
import { checkpoint, debtSummaries } from '../../model/analysis';
import { simulate } from '../../model/engine';
import { idxLabel, PERIODS, ymToIdx } from '../../model/finance';
import { runModel, SCENARIOS, stressCatalog } from '../../model/scenario';
import { NotReady, PageHead } from '../common';
import { Grid, MonthField, NumField, Section } from '../fields';
import { usd } from '../fmt';
import { useStore } from '../store';

export function ScenariosPage() {
  const { inputs } = useStore();
  const run = useModel();
  const comparison = useMemo(
    () =>
      SCENARIOS.map((s) => {
        const r = runModel(inputs, s.id);
        if (!r.sim) return { s, r: null };
        const fr = r.sim.rows.filter((x) => x.modeled);
        const ds = debtSummaries(r.inputs, r.sim);
        const last = r.sim.rows[PERIODS - 1];
        return {
          s,
          r,
          cp: checkpoint(r.inputs, r.sim),
          minCash: Math.min(...fr.map((x) => x.cashEnd)),
          buys: r.decisions.filter((d) => d.closeIdx !== null),
          yukon: ds.find((d) => d.name === 'Yukon')!,
          helocInt: ds.find((d) => d.name === 'HELOC')!.interest,
          totalInt: fr.reduce((a, x) => a + x.interest.consumer + x.interest.yukon + x.interest.heloc + x.interest.acq, 0),
          last,
          propCF: fr.reduce((a, x) => a + Object.values(x.props).reduce((b, p) => b + p.cashFlowAfterHeloc, 0), 0),
        };
      }),
    [inputs],
  );
  return (
    <>
      <PageHead title="Scenarios & stress" sub="Cash-funded vs. HELOC vs. delay — same opening data, acquisition assumptions and measurement dates." />
      <Section title="Scenario settings">
        <Grid cols={4}>
          <NumField path="policy.scenarioCGapMonths" label="C: months between purchases (12–18)" kind="months" />
          <NumField path="policy.scenarioDDelayMonths" label="D: delay first purchase (6 or 12)" kind="months" />
        </Grid>
      </Section>
      {!run.sim ? <NotReady /> : (
        <Section title="Scenario comparison">
          <div className="scroll-x">
            <table className="tbl num">
              <thead>
                <tr><th>Measure</th>{comparison.map((c) => <th key={c.s.id} className={c.s.id === run.scenario ? 'sel' : ''}>{c.s.name}</th>)}</tr>
              </thead>
              <tbody>
                <Row label="Savings at checkpoint" cells={comparison.map((c) => (c.r ? usd(c.cp!.measured) : '—'))} />
                <Row label="Checkpoint gap" cells={comparison.map((c) => (c.r ? usd(c.cp!.gap) : '—'))} />
                <Row label="Purchases (month)" cells={comparison.map((c) => (c.r ? (c.buys!.length ? c.buys!.map((d) => `${d.acq.name}: ${idxLabel(d.closeIdx!)}`).join(', ') : 'None feasible') : '—'))} />
                <Row label="Minimum cash" cells={comparison.map((c) => (c.r ? usd(c.minCash) : '—'))} />
                <Row label="Yukon payoff" cells={comparison.map((c) => (c.r ? (c.yukon!.payoffIdx === null ? 'Beyond 2036' : idxLabel(c.yukon!.payoffIdx)) : '—'))} />
                <Row label="Debt interest (consumer, Yukon, HELOC, new loans)" cells={comparison.map((c) => (c.r ? usd(c.totalInt) : '—'))} />
                <Row label="HELOC interest" cells={comparison.map((c) => (c.r ? usd(c.helocInt) : '—'))} />
                <Row label="HELOC balance Dec 2036" cells={comparison.map((c) => (c.r ? usd(c.last!.bal.heloc) : '—'))} />
                <Row label="Property cash flow after HELOC (cum.)" cells={comparison.map((c) => (c.r ? usd(c.propCF) : '—'))} />
                <Row label="Cash Dec 2036" cells={comparison.map((c) => (c.r ? usd(c.last!.cashEnd) : '—'))} />
                <Row label="Modeled net worth Dec 2036" cells={comparison.map((c) => (c.r ? usd(c.last!.netWorth) : '—'))} />
              </tbody>
            </table>
          </div>
        </Section>
      )}
      <StressSection />
    </>
  );
}

const Row = ({ label, cells }: { label: string; cells: string[] }) => (
  <tr><td>{label}</td>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
);

function StressSection() {
  const run = useModel();
  const firstClose = run.decisions.find((d) => d.closeIdx !== null)?.closeIdx;
  const [anchor, setAnchor] = useState<string>('');
  const [deferral, setDeferral] = useState<Record<string, string> | null>(null);
  const anchorIdx = anchor ? ymToIdx(anchor) : firstClose ?? ymToIdx(run.inputs.control.checkpointMonth);
  const results = useMemo(() => {
    if (!run.sim) return [];
    return [{ id: 'base', label: 'Base case' } as const, ...stressCatalog(run.inputs)].map((st) => {
      const sim = st.id === 'base' ? run.sim! : simulate(run.inputs, run.plan, { ...st, anchorIdx });
      const w = sim.rows.filter((r) => r.modeled && r.idx >= anchorIdx);
      const w12 = w.slice(0, 12);
      const min = Math.min(...w12.map((r) => r.cashEnd));
      const minRow = w12.find((r) => r.cashEnd === min)!;
      const deficit = Math.max(0, ...w12.map((r) => r.reserveRequired - r.cashEnd));
      const burn = minRow ? minRow.f.living + minRow.f.primaryPI + minRow.f.primaryEscrow + minRow.f.consumerPay + minRow.f.yukonPay + minRow.f.rentalDebt + minRow.f.rentalEscrow + minRow.f.rentalOpex + minRow.f.helocInterest : 0;
      const support = w12.reduce((s, r) => s + Object.values(r.props).reduce((a, p) => a + Math.min(0, p.cashImpact - p.helocInterest - p.helocPrincipal), 0), 0);
      return { id: st.id, label: st.label, min, deficit, runway: burn > 0 ? Math.max(0, min) / burn : null, support: -support, lowest: Math.min(...w.map((r) => r.cashEnd)) };
    });
  }, [run, anchorIdx]);
  const runDeferral = () => {
    const out: Record<string, string> = {};
    for (const st of stressCatalog(run.inputs)) {
      const r = runModel(run.inputs, 'custom', { ...st, anchorIdx });
      out[st.id] = r.decisions.filter((d) => d.status !== 'NOT ENABLED').map((d) => `${d.acq.name}: ${d.closeIdx !== null ? idxLabel(d.closeIdx) : 'none'}`).join(', ');
    }
    setDeferral(out);
  };
  return (
    <>
      <Section title="Stress settings (Section 9 provisional assumptions — editable)">
        <Grid cols={5}>
          <NumField path="stress.priceShockPct" label="Price ±" kind="pct" />
          <NumField path="stress.valueDeclinePct" label="Value decline" kind="pct" />
          <NumField path="stress.rentCutPct" label="Rent reduction" kind="pct" />
          <NumField path="stress.vacancyStressPct" label="Vacancy (ongoing)" kind="pct" />
          <NumField path="stress.vacancyEventMonths" label="Vacancy event" kind="months" />
          <NumField path="stress.repairsStressPct" label="Routine repairs" kind="pct" />
          <NumField path="stress.capexStressPct" label="Capital provision" kind="pct" />
          <NumField path="stress.majorRepair" label="Major repair" />
          <NumField path="stress.mgmtStressPct" label="Management" kind="pct" />
          <NumField path="stress.extraTurnoverCost" label="Extra turnover cost" />
          <NumField path="stress.taxInsStepPct" label="Tax & insurance step" kind="pct" />
          <NumField path="stress.mortgageRateShock1" label="Mortgage rate +1" kind="pct" />
          <NumField path="stress.mortgageRateShock2" label="Mortgage rate +2" kind="pct" />
          <NumField path="stress.helocShock1" label="HELOC rate +" kind="pct" />
          <NumField path="stress.helocShock2" label="HELOC rate ++" kind="pct" />
          <NumField path="stress.incomeLossMonths" label="Income loss" kind="months" />
          <NumField path="stress.incomeLossEarner" label="Earner # lost (0 = first)" kind="number" />
          <NumField path="stress.rehabOverrunPct" label="Rehab overrun" kind="pct" />
          <NumField path="stress.leaseUpDelayMonths" label="Lease-up delay" kind="months" />
        </Grid>
      </Section>
      {run.sim && (
        <Section
          title={`Stress results · ${run.scenario === 'custom' ? 'Custom' : 'Scenario ' + run.scenario}, starting ${idxLabel(anchorIdx)}`}
          aside={
            <div className="row-gap">
              <label className="inline">Shock starts <select value={anchor} onChange={(e) => setAnchor(e.target.value)}>
                <option value="">{firstClose !== undefined ? 'First purchase' : 'Checkpoint'}</option>
                {run.sim.rows.filter((r) => r.modeled).map((r) => <option key={r.ym} value={r.ym}>{idxLabel(r.idx)}</option>)}
              </select></label>
              <button className="btn" onClick={runDeferral}>Test purchase timing under each stress</button>
            </div>
          }
        >
          <p className="small muted">Purchase dates are held fixed to show liquidity impact. Reserve transfers do not reduce consolidated cash; the capital provision is not double-counted with dated repairs.</p>
          <div className="scroll-x">
            <table className="tbl num">
              <thead><tr><th>Test</th><th>Min cash (12 mo)</th><th>Reserve deficit</th><th>Runway (months)</th><th>Household support to rentals</th><th>Lowest cash to 2036</th>{deferral && <th>Purchases under stress</th>}</tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className={r.id === 'combined' ? 'sel' : ''}>
                    <td>{r.label}</td>
                    <td className={r.min < 0 ? 'bad' : ''}>{usd(r.min)}</td>
                    <td className={r.deficit > 0 ? 'warn' : ''}>{usd(r.deficit)}</td>
                    <td>{r.runway === null ? 'N/A' : r.runway.toFixed(1)}</td>
                    <td>{usd(r.support)}</td>
                    <td className={r.lowest < 0 ? 'bad' : ''}>{usd(r.lowest)}</td>
                    {deferral && <td className="small">{r.id === 'base' ? run.decisions.filter((d) => d.status !== 'NOT ENABLED').map((d) => `${d.acq.name}: ${d.closeIdx !== null ? idxLabel(d.closeIdx) : 'none'}`).join(', ') : deferral[r.id]}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      <Section title="Stress month helpers">
        <Grid cols={3}><MonthField path="heloc.freezeMonth" label="Model a HELOC freeze from (base case)" allowBlank /></Grid>
      </Section>
    </>
  );
}
