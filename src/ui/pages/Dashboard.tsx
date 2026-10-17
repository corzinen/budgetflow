import { useModel, useNav } from '../../App';
import { checkpoint, debtSummaries } from '../../model/analysis';
import { idxLabel, PERIODS, ymToIdx } from '../../model/finance';
import { SCENARIOS } from '../../model/scenario';
import { CashChart, DebtChart } from '../charts';
import { NotReady, PageHead, ReadinessBanner } from '../common';
import { PassBadge, Section, Stat } from '../fields';
import { usd } from '../fmt';

export function Dashboard() {
  const run = useModel();
  const go = useNav();
  const sc = SCENARIOS.find((s) => s.id === run.scenario)!;
  if (!run.sim) {
    return (
      <>
        <PageHead title="Decision dashboard" sub="Plan consumer-debt payoff by a set date, then test when an acquisition is affordable." />
        <NotReady />
      </>
    );
  }
  const sim = run.sim;
  const inp = run.inputs;
  const cp = checkpoint(inp, sim);
  const debts = debtSummaries(inp, sim);
  const consumer = debts.find((d) => d.name === 'All consumer accounts')!;
  const yukon = debts.find((d) => d.name === 'Yukon')!;
  const helocD = debts.find((d) => d.name === 'HELOC')!;
  const last = sim.rows[PERIODS - 1];
  const fr = sim.rows.filter((r) => r.modeled);
  const next12 = fr.slice(0, 12);
  const min12 = Math.min(...next12.map((r) => r.cashEnd));
  const consumerOnTime = consumer.payoffIdx !== null && consumer.target !== undefined && consumer.payoffIdx <= consumer.target;
  const firstBuy = run.decisions.find((d) => d.closeIdx !== null);
  const marks = [
    { ym: inp.control.checkpointMonth, label: 'Checkpoint' },
    ...run.decisions.filter((d) => d.closeIdx !== null).map((d) => ({ ym: sim.rows[d.closeIdx!].ym, label: d.acq.name })),
  ];
  const flagged = fr.filter((r) => r.flags.length);
  return (
    <>
      <PageHead title="Decision dashboard" sub={`${sc.name}: ${sc.policy}`} />
      <ReadinessBanner />
      <div className="stats">
        <Stat
          label={`Savings at checkpoint · ${cp.label}`}
          value={usd(cp.measured)}
          sub={<>Target {usd(cp.target)} {inp.control.targetIncludesReserves ? '(incl. reserves)' : '(excl. reserves)'} · gap <b>{usd(cp.gap)}</b></>}
          tone={cp.gap <= 0 ? 'good' : 'warn'}
        />
        <Stat
          label="Required monthly saving (simplified)"
          value={cp.requiredMonthly === null ? 'N/A' : usd(cp.requiredMonthly)}
          sub={`${cp.depositPeriods} deposits; net lump sums ${usd(cp.netLumpSums)}`}
        />
        <Stat
          label="Consumer debt cleared"
          value={consumer.payoffIdx === null ? 'Not by 2036' : idxLabel(consumer.payoffIdx)}
          sub={`Target ${idxLabel(consumer.target ?? 0)} · interest ${usd(consumer.interest)}`}
          tone={consumerOnTime ? 'good' : 'bad'}
        />
        <Stat label="Yukon payoff" value={yukon.payoffIdx === null ? 'Not by 2036' : idxLabel(yukon.payoffIdx)} sub={`Policy: ${inp.yukon.policy} · interest ${usd(yukon.interest)}`} />
        <Stat
          label="Next feasible purchase"
          value={firstBuy ? idxLabel(firstBuy.closeIdx!) : run.decisions.some((d) => d.status === 'INPUT REQUIRED') ? 'INPUT REQUIRED' : 'None through 2036'}
          sub={firstBuy ? `${firstBuy.acq.name} · ${firstBuy.status}` : 'See Acquisitions for failed tests'}
          tone={firstBuy ? (firstBuy.status === 'BUY' ? 'good' : 'warn') : 'bad'}
        />
        <Stat label="Minimum cash, next 12 months" value={usd(min12)} sub={`Reserve requirement now ${usd(fr[0].reserveRequired)}`} tone={min12 >= fr[0].reserveRequired ? 'good' : min12 >= 0 ? 'warn' : 'bad'} />
        <Stat label="HELOC balance · Dec 2036" value={usd(last.bal.heloc)} sub={helocD.payoffIdx ? `Repaid ${idxLabel(helocD.payoffIdx)}` : `Interest ${usd(helocD.interest)}`} />
        <Stat label="Modeled net worth · Dec 2036" value={usd(last.netWorth)} sub={`${1 + Object.keys(last.values.acq).length} rental(s); excludes retirement & vehicles`} />
      </div>

      <div className="two-col">
        <Section title="Cash vs. required reserves">
          <CashChart sim={sim} marks={marks} />
        </Section>
        <Section title="Debt balances">
          <DebtChart sim={sim} />
        </Section>
      </div>

      <Section title="Acquisition decisions" aside={<button className="btn" onClick={() => go('acq')}>Open underwriting →</button>}>
        <table className="tbl">
          <thead>
            <tr><th>Property</th><th>Status</th><th>Proposed</th><th>Earliest qualifying</th><th>Funding</th><th>Failed tests at proposed date</th></tr>
          </thead>
          <tbody>
            {run.decisions.map((d) => (
              <tr key={d.acq.id}>
                <td>{d.acq.name}</td>
                <td><span className={'badge badge-' + d.status.toLowerCase().replace(/\s+/g, '-')}>{d.status}</span></td>
                <td>{idxLabel(d.proposedIdx)}</td>
                <td>{d.closeIdx !== null ? idxLabel(d.closeIdx) : '—'}</td>
                <td>{d.acq.funding === 'heloc' ? 'HELOC-assisted' : 'Cash'}</td>
                <td className="small">
                  {d.failed.length === 0 ? '—' : d.failed.map((f) => (
                    <div key={f.id}><PassBadge pass={f.pass} /> {f.label}: <span className="muted">{f.detail}</span></div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="two-col">
        <Section title="February checkpoint bridge">
          <table className="tbl kv">
            <tbody>
              <tr><td>Unrestricted cash (excludes tenant deposits)</td><td>{usd(cp.unrestricted)}</td></tr>
              <tr><td>Less: cash freed by outstanding HELOC consolidation</td><td>{usd(cp.eligibleSaved - cp.unrestricted)}</td></tr>
              <tr><td>Eligible saved cash</td><td>{usd(cp.eligibleSaved)}</td></tr>
              <tr><td>Required reserves (household + rental + committed)</td><td>{usd(cp.reserves)}</td></tr>
              <tr><td>Counted toward target</td><td>{usd(cp.measured)}</td></tr>
              <tr><td>TargetGap = MAX(0, target − eligible)</td><td><b>{usd(cp.gap)}</b></td></tr>
              <tr><td>Consumer debt / Yukon at checkpoint</td><td>{usd(cp.consumerBalance)} / {usd(cp.yukonBalance)}</td></tr>
              <tr><td>Novella balance / equity</td><td>{usd(cp.novellaBalance)} / {usd(cp.novellaEquity)}</td></tr>
              <tr><td>HELOC balance</td><td>{usd(cp.helocBalance)}</td></tr>
            </tbody>
          </table>
        </Section>
        <Section title="Error and warning flags">
          {flagged.length === 0 ? (
            <p className="muted">No engine flags in the forecast.</p>
          ) : (
            <ul className="flags">
              {flagged.slice(0, 14).map((r) => (
                <li key={r.idx}><b>{idxLabel(r.idx)}</b> {r.flags.join('; ')}</li>
              ))}
              {flagged.length > 14 && <li className="muted">…{flagged.length - 14} more months on Monthly & annual</li>}
            </ul>
          )}
          <p className="small muted">Checkpoint: {idxLabel(ymToIdx(inp.control.checkpointMonth))}. Forecast begins {idxLabel(sim.forecastStart)}.</p>
        </Section>
      </div>
    </>
  );
}
