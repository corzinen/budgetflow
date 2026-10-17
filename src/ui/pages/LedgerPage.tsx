import { useState } from 'react';
import { useModel } from '../../App';
import { annualSummary } from '../../model/analysis';
import { idxLabel } from '../../model/finance';
import { NotReady, PageHead } from '../common';
import { Section } from '../fields';
import { usd, x2 } from '../fmt';

export function LedgerPage() {
  const run = useModel();
  const [view, setView] = useState<'annual' | 'monthly' | 'property'>('annual');
  if (!run.sim) return (<><PageHead title="Monthly & annual" /><NotReady /></>);
  const sim = run.sim;
  const years = annualSummary(run.inputs, sim);
  const propIds = ['novella', ...sim.acqs.filter((a) => sim.closings[a.id]).map((a) => a.id)];
  const propName = (id: string) => (id === 'novella' ? 'Novella' : sim.acqs.find((a) => a.id === id)?.name ?? id);
  return (
    <>
      <PageHead title="Monthly & annual" sub="132 monthly periods, Jan 2026 – Dec 2036. Flows sum by year; balances use December; ratios recompute from annual totals." />
      <div className="tabs">
        {(['annual', 'monthly', 'property'] as const).map((v) => (
          <button key={v} className={'tab' + (view === v ? ' active' : '')} onClick={() => setView(v)}>
            {v === 'annual' ? 'Annual summary' : v === 'monthly' ? 'Monthly ledger' : 'Property results'}
          </button>
        ))}
      </div>
      {view === 'annual' && (
        <Section title="Annual summary">
          <div className="scroll-x">
            <table className="tbl num">
              <thead>
                <tr><th>Year</th><th>Basis</th><th>Net income</th><th>Living</th><th>Rent</th><th>NOI</th><th>Rental debt svc</th><th>DSCR</th><th>Property CF</th><th>Interest</th><th>Principal</th><th>HELOC draws</th><th>Closings</th><th>Dec cash</th><th>Consumer</th><th>Yukon</th><th>HELOC</th><th>All debt</th><th>Property values</th><th>Net worth</th></tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="small">{y.label}{y.incompleteActuals && <span className="chip chip-input-required">incomplete actuals</span>}</td>
                    <td>{usd(y.income)}</td><td>{usd(y.living)}</td><td>{usd(y.rent)}</td><td>{usd(y.noi)}</td><td>{usd(y.rentalDebtService)}</td><td>{x2(y.dscr)}</td>
                    <td>{usd(y.propertyCashFlow)}</td><td>{usd(y.interest)}</td><td>{usd(y.principal)}</td><td>{usd(y.helocDraws)}</td><td>{usd(y.closings)}</td>
                    <td>{usd(y.cash)}</td><td>{usd(y.consumer)}</td><td>{usd(y.yukon)}</td><td>{usd(y.heloc)}</td><td>{usd(y.debt)}</td><td>{usd(y.propertyValues)}</td><td>{usd(y.netWorth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Modeled net worth = cash + restricted cash + home & rental values − all debt − tenant-deposit liabilities. Retirement assets and vehicles are excluded unless supplied.</p>
        </Section>
      )}
      {view === 'monthly' && (
        <Section title="Monthly ledger">
          <div className="scroll-x tall">
            <table className="tbl num sticky">
              <thead>
                <tr><th>Month</th><th>Cash start</th><th>Pay + bonus</th><th>Rent</th><th>HELOC draw</th><th>Living</th><th>Primary PITI</th><th>Rental opex + debt</th><th>Capital work</th><th>Consumer</th><th>Yukon</th><th>HELOC svc</th><th>Closings / addition</th><th>Cash end</th><th>Reserves req.</th><th>Spendable</th><th>Consumer bal</th><th>Yukon bal</th><th>HELOC bal</th><th>Net worth</th><th>Flags</th></tr>
              </thead>
              <tbody>
                {sim.rows.map((r) => r.modeled ? (
                  <tr key={r.idx} className={r.cashEnd < 0 ? 'bad' : ''}>
                    <td>{idxLabel(r.idx)}</td>
                    <td>{usd(r.cashStart)}</td>
                    <td>{usd(r.f.netPay + r.f.bonus)}</td>
                    <td>{usd(r.f.rent + r.f.otherRentalIncome)}</td>
                    <td>{usd(r.f.helocDraw)}</td>
                    <td>{usd(r.f.living + r.f.retirement + r.f.committed + r.f.oneTime)}</td>
                    <td>{usd(r.f.primaryPI + r.f.primaryEscrow)}</td>
                    <td>{usd(r.f.rentalOpex + r.f.rentalDebt + r.f.rentalEscrow)}</td>
                    <td>{usd(r.f.capitalWork)}</td>
                    <td>{usd(r.f.consumerPay + r.f.consumerExtra + r.f.consolidationPayoff)}</td>
                    <td>{usd(r.f.yukonPay + r.f.yukonExtra)}</td>
                    <td>{usd(r.f.helocInterest + r.f.helocPrincipal + r.f.helocFees)}</td>
                    <td>{usd(r.f.closingCash + r.f.homeAddition)}</td>
                    <td><b>{usd(r.cashEnd)}</b></td>
                    <td>{usd(r.reserveRequired)}</td>
                    <td>{usd(r.spendable)}</td>
                    <td>{usd(r.bal.consumer)}</td>
                    <td>{usd(r.bal.yukon)}</td>
                    <td>{usd(r.bal.heloc)}</td>
                    <td>{usd(r.netWorth)}</td>
                    <td className="small">{r.flags.join('; ')}</td>
                  </tr>
                ) : (
                  <tr key={r.idx} className="actual">
                    <td>{idxLabel(r.idx)}</td>
                    <td colSpan={20} className="small muted">Actual period{r.flags.length ? ' — ' + r.flags.join('; ') : `: income ${usd(r.f.netPay)}, living ${usd(r.f.living)}, rent ${usd(r.f.rent)}, ending cash ${usd(r.cashEnd)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {view === 'property' && propIds.map((id) => (
        <Section key={id} title={`${propName(id)} · annual property results`}>
          <div className="scroll-x">
            <table className="tbl num">
              <thead><tr><th>Year</th><th>Rent collected</th><th>Opex</th><th>NOI</th><th>Debt service</th><th>Capital provision</th><th>Actual capital spend</th><th>CF before HELOC</th><th>Allocated HELOC</th><th>CF after HELOC</th><th>Household subsidy</th><th>Dec value</th><th>Dec loan</th><th>Equity</th></tr></thead>
              <tbody>
                {Array.from({ length: 11 }, (_, y) => {
                  const rows = sim.rows.slice(y * 12, y * 12 + 12).filter((r) => r.props[id]);
                  if (!rows.length) return null;
                  const s = (fn: (p: (typeof rows)[0]['props'][string]) => number) => rows.reduce((a, r) => a + fn(r.props[id]), 0);
                  const dec = rows[rows.length - 1].props[id];
                  return (
                    <tr key={y}>
                      <td>{2026 + y}</td><td>{usd(s((p) => p.collected))}</td><td>{usd(s((p) => p.opex))}</td><td>{usd(s((p) => p.noi))}</td>
                      <td>{usd(s((p) => p.mortgageDebtService))}</td><td>{usd(s((p) => p.capexProvision))}</td><td>{usd(s((p) => p.capitalSpend))}</td>
                      <td>{usd(s((p) => p.cashFlowBeforeHeloc))}</td><td>{usd(s((p) => p.helocInterest + p.helocPrincipal))}</td><td>{usd(s((p) => p.cashFlowAfterHeloc))}</td>
                      <td>{usd(-s((p) => Math.min(0, p.cashImpact - p.helocInterest - p.helocPrincipal)))}</td>
                      <td>{usd(dec.value)}</td><td>{usd(dec.loanBalance)}</td><td>{usd(dec.value - dec.loanBalance - dec.helocAllocated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </>
  );
}
