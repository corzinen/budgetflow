import { useMemo } from 'react';
import { useModel } from '../../App';
import { checkpoint, debtSummaries } from '../../model/analysis';
import { helocRate, idxLabel, potentialHelocLine, reportedEquityCheck } from '../../model/finance';
import { runModel } from '../../model/scenario';
import type { Inputs } from '../../model/types';
import { SeriesChart } from '../charts';
import { NotReady, PageHead } from '../common';
import { Grid, MonthField, NumField, Section, Stat, Toggle } from '../fields';
import { pct, usd } from '../fmt';
import { useStore } from '../store';

const clone = (x: Inputs): Inputs => JSON.parse(JSON.stringify(x));

export function HelocPage() {
  const { inputs } = useStore();
  const run = useModel();
  const h = inputs.heloc;
  const V = inputs.home.value, M = inputs.home.mortgage.balance, L = inputs.home.otherLiens;
  const ready = V !== null && M !== null;
  const eq = ready ? V! - M! - L : null;
  const cltv = h.maxCltv;
  const potential = ready && cltv !== null ? potentialHelocLine(cltv, V!, M!, L) : null;
  const rate0 = helocRate(h.indexRate, h.margin, h.floor, h.cap);
  return (
    <>
      <PageHead title="HELOC & home equity" sub="Free cash from home equity for debt consolidation, a home addition or an investment property — with the home as collateral." />
      <div className="stats">
        <Stat label="Equity (V − M − L)" value={eq === null ? 'INPUT REQUIRED' : usd(eq)} sub={eq === null ? '' : `Reported ${usd(inputs.control.reportedEquity)} · difference ${usd(reportedEquityCheck(V!, M!, L, inputs.control.reportedEquity))}`} tone={eq !== null && Math.abs(eq - inputs.control.reportedEquity) <= 1 ? 'good' : 'warn'} />
        <Stat label={`Potential line at ${cltv === null ? '?' : pct(cltv, 0)} CLTV`} value={potential === null ? 'INPUT REQUIRED' : usd(potential)} sub="MAX(0, c·V − M − L). Not an approval." />
        <Stat label="Approved line used by the model" value={h.approvedLine === null ? 'INPUT REQUIRED' : usd(Math.min(h.approvedLine, h.householdMaxDraw))} sub={`Approved ${usd(h.approvedLine)} · household cap ${usd(h.householdMaxDraw)}`} />
        <Stat label="Current rate" value={pct(rate0, 2)} sub={`MIN(cap, MAX(floor, index + margin)); +${pct(inputs.stress.helocShock2, 0)} shock → ${pct(helocRate(h.indexRate + inputs.stress.helocShock2, h.margin, h.floor, h.cap), 2)}`} />
      </div>
      <div className="two-col">
        <Section title="Home and line terms">
          <Grid cols={3}>
            <NumField path="home.value" label="Home market value (V)" required />
            <TextField2 />
            <NumField path="home.otherLiens" label="Other liens (L)" />
            <NumField path="heloc.maxCltv" label="Lender max CLTV (c)" kind="pct" required />
            <NumField path="heloc.approvedLine" label="Approved limit" required hint="From written lender terms" />
            <NumField path="heloc.householdMaxDraw" label="Household max HELOC balance" />
            <NumField path="heloc.holds" label="Holds / reductions" />
            <NumField path="heloc.indexRate" label="Index (e.g. prime)" kind="pct" />
            <NumField path="heloc.margin" label="Margin" kind="pct" />
            <NumField path="heloc.floor" label="Floor" kind="pct" />
            <NumField path="heloc.cap" label="Cap" kind="pct" />
            <NumField path="heloc.originationFee" label="Origination fee" />
            <NumField path="heloc.annualFee" label="Annual fee" />
            <MonthField path="heloc.openMonth" label="Line opens" />
            <MonthField path="heloc.drawEndMonth" label="Draw period ends" />
            <NumField path="heloc.repaymentMonths" label="Repayment period" kind="months" />
            <NumField path="heloc.minPaymentPct" label="Min payment % of balance (if not IO)" kind="pct" />
            <MonthField path="heloc.freezeMonth" label="Line frozen from" allowBlank />
          </Grid>
          <Toggle path="heloc.enabled" label="HELOC available in this plan" />
          <Toggle path="heloc.interestOnly" label="Interest-only during the draw period" hint="Converts to an amortizing payment over the repayment period, recalculated at each rate reset" />
        </Section>
        <Section title="Uses and repayment plan">
          <h4>1 · Debt consolidation</h4>
          <Toggle path="heloc.consolidateDebts" label="Pay off all consumer accounts with a HELOC draw" />
          <Grid cols={2}><MonthField path="heloc.consolidationMonth" label="Consolidation month" /></Grid>
          <h4>2 · Home addition</h4>
          <Toggle path="homeAddition.enabled" label="Include a home addition" />
          <Grid cols={4}>
            <MonthField path="homeAddition.month" label="Month" />
            <NumField path="homeAddition.cost" label="Cost" />
            <NumField path="homeAddition.helocPct" label="% funded by HELOC" kind="pct" />
            <NumField path="homeAddition.valueAddPct" label="Value added (% of cost)" kind="pct" />
          </Grid>
          <h4>3 · Investment property</h4>
          <p className="small muted">Set each candidate's funding to “HELOC” and its draw cap on Acquisitions. Draws are limited to the verified funding gap.</p>
          <h4>Repayment</h4>
          <Grid cols={3}>
            <NumField path="heloc.extraPrincipalMonthly" label="Extra principal / month" />
            <MonthField path="heloc.targetPayoff" label="Target HELOC payoff" allowBlank />
            <NumField path="heloc.postYukonRepayPct" label="After Yukon payoff: % of surplus to HELOC" kind="pct" hint="Remainder builds acquisition savings" />
          </Grid>
        </Section>
      </div>
      {run.sim ? <HelocOutputs base={inputs} /> : <NotReady />}
    </>
  );
}

function TextField2() {
  return <NumField path="home.mortgage.balance" label="First mortgage balance (M)" required />;
}

function HelocOutputs({ base }: { base: Inputs }) {
  const run = useModel();
  const sim = run.sim!;
  const fr = sim.rows.filter((r) => r.modeled);
  const purposes = new Map<string, { draws: number; first: number }>();
  for (const r of fr) {
    if (!r.draws.heloc) continue;
    const prev = sim.rows[r.idx - 1]?.helocTranches ?? {};
    for (const [k, v] of Object.entries(r.helocTranches)) {
      const d = v - (prev[k] ?? 0);
      if (d > 0.5) {
        const p = purposes.get(k) ?? { draws: 0, first: r.idx };
        p.draws += d;
        purposes.set(k, p);
      }
    }
  }
  const nameOf = (k: string) => {
    if (k === 'home-addition') return 'Home addition';
    if (k.startsWith('consolidation:')) return 'Consolidation · ' + (run.inputs.consumer.debts.find((d) => d.id === k.split(':')[1])?.name ?? 'account');
    if (k.startsWith('acq:')) return 'Acquisition · ' + (run.inputs.acquisitions.find((a) => a.id === k.split(':')[1])?.name ?? 'property');
    return k;
  };
  const last = sim.rows[131];
  const options = useMemo(() => {
    const mk = (label: string, f: (i: Inputs) => void) => {
      const i = clone(base);
      f(i);
      const r = runModel(i);
      if (!r.sim) return { label, sim: null as null };
      const rows = r.sim.rows.filter((x) => x.modeled);
      const ds = debtSummaries(r.inputs, r.sim);
      const first = r.decisions.find((d) => d.closeIdx !== null);
      return {
        label,
        sim: r.sim,
        minCash: Math.min(...rows.map((x) => x.cashEnd)),
        cp: checkpoint(r.inputs, r.sim).measured,
        peak: Math.max(...rows.map((x) => x.bal.heloc)),
        interest: ds.find((d) => d.name === 'HELOC')!.interest,
        first: first?.closeIdx ?? null,
        firstName: first?.acq.name,
        cltv: Math.max(...rows.map((x) => x.cltvDrawn)),
        nw: r.sim.rows[131].netWorth,
      };
    };
    const cost = base.homeAddition.cost;
    return [
      mk('No HELOC use', (i) => { i.heloc.consolidateDebts = false; i.homeAddition.enabled = false; i.acquisitions.forEach((a) => (a.funding = 'cash')); i.control.scenario = 'custom'; }),
      mk(`Home addition ${usd(cost)} · cash`, (i) => { i.homeAddition.enabled = true; i.homeAddition.helocPct = 0; i.acquisitions.forEach((a) => (a.funding = 'cash')); i.control.scenario = 'custom'; }),
      mk(`Home addition ${usd(cost)} · HELOC`, (i) => { i.homeAddition.enabled = true; i.homeAddition.helocPct = 1; i.acquisitions.forEach((a) => (a.funding = 'cash')); i.control.scenario = 'custom'; }),
      mk('Investment property · HELOC (scenario B)', (i) => { i.homeAddition.enabled = false; i.control.scenario = 'B'; }),
      mk('Two staged purchases · HELOC (scenario C)', (i) => { i.homeAddition.enabled = false; i.control.scenario = 'C'; }),
    ];
  }, [base]);

  const chart = fr.map((r) => ({ ym: r.ym, Balance: r.bal.heloc, Available: r.helocAvailable }));
  const years = Array.from({ length: 11 }, (_, y) => {
    const rows = sim.rows.slice(y * 12, y * 12 + 12).filter((r) => r.modeled);
    if (!rows.length) return null;
    const d = rows[rows.length - 1];
    return {
      year: 2026 + y,
      draws: rows.reduce((s, r) => s + r.draws.heloc, 0),
      interest: rows.reduce((s, r) => s + r.f.helocInterest, 0),
      principal: rows.reduce((s, r) => s + r.f.helocPrincipal, 0),
      fees: rows.reduce((s, r) => s + r.f.helocFees, 0),
      end: d.bal.heloc,
      rate: d.helocRate,
      avail: d.helocAvailable,
      cltvD: d.cltvDrawn,
      cltvC: d.cltvCommitted,
    };
  }).filter(Boolean);

  return (
    <>
      <Section title="Funding options: how much cash the HELOC frees and what it costs">
        <p className="small muted">Same opening data for every option. A draw preserves cash by creating debt; it does not raise savings or net worth at origination.</p>
        <table className="tbl">
          <thead><tr><th>Option</th><th>Min cash</th><th>Savings at checkpoint</th><th>Peak HELOC</th><th>HELOC interest</th><th>Max drawn CLTV</th><th>First acquisition</th><th>Net worth 2036</th></tr></thead>
          <tbody>
            {options.map((o) => o.sim ? (
              <tr key={o.label}>
                <td>{o.label}</td>
                <td className={o.minCash! < 0 ? 'bad' : ''}>{usd(o.minCash)}</td>
                <td>{usd(o.cp)}</td>
                <td>{usd(o.peak)}</td>
                <td>{usd(o.interest)}</td>
                <td>{pct(o.cltv)}</td>
                <td>{o.first === null ? 'None' : `${o.firstName} · ${idxLabel(o.first!)}`}</td>
                <td>{usd(o.nw)}</td>
              </tr>
            ) : (
              <tr key={o.label}><td>{o.label}</td><td colSpan={7}>INPUT REQUIRED</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="two-col">
        <Section title="Draws by use (selected scenario)">
          {purposes.size === 0 ? <p className="muted">No HELOC draws in this scenario.</p> : (
            <table className="tbl">
              <thead><tr><th>Use</th><th>First draw</th><th>Drawn</th><th>Allocated balance Dec 2036</th></tr></thead>
              <tbody>
                {[...purposes.entries()].map(([k, v]) => (
                  <tr key={k}><td>{nameOf(k)}</td><td>{idxLabel(v.first)}</td><td>{usd(v.draws)}</td><td>{usd(last.helocTranches[k] ?? 0)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small muted">Interest is accrued on start balance plus same-month draws (labelled monthly average-balance approximation). The liability is counted once in net worth; its cost is allocated to each benefiting property.</p>
        </Section>
        <Section title="Balance and availability">
          <SeriesChart data={chart} series={[{ key: 'Balance', color: 'var(--c4)' }, { key: 'Available', color: 'var(--c1)', dashed: true }]} />
        </Section>
      </div>
      <Section title="Annual HELOC schedule">
        <table className="tbl num">
          <thead><tr><th>Year</th><th>Draws</th><th>Interest</th><th>Principal</th><th>Fees</th><th>Dec balance</th><th>Rate</th><th>Available</th><th>CLTV drawn</th><th>CLTV committed</th></tr></thead>
          <tbody>
            {years.map((y) => y && (
              <tr key={y.year}><td>{y.year}</td><td>{usd(y.draws)}</td><td>{usd(y.interest)}</td><td>{usd(y.principal)}</td><td>{usd(y.fees)}</td><td>{usd(y.end)}</td><td>{pct(y.rate, 2)}</td><td>{usd(y.avail)}</td><td>{pct(y.cltvD)}</td><td>{pct(y.cltvC)}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
