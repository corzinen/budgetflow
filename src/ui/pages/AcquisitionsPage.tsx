import { useModel } from '../../App';
import { propertyReturns } from '../../model/analysis';
import { blankAcquisition } from '../../model/defaults';
import { idxLabel } from '../../model/finance';
import type { AcqDecision } from '../../model/scenario';
import { NotReady, PageHead } from '../common';
import { Grid, MonthField, NumField, PassBadge, Section, SelectField, TextField, Toggle } from '../fields';
import { pct, usd, x2 } from '../fmt';
import { useStore } from '../store';

export function AcquisitionsPage() {
  const { inputs, set } = useStore();
  const run = useModel();
  const returns = run.sim ? propertyReturns(run.inputs, run.sim) : [];
  return (
    <>
      <PageHead title="Acquisition underwriting" sub="One record per candidate. A purchase proceeds only if every funding, cash-flow, coverage and stress test passes." />
      {run.scenario !== 'custom' && (
        <div className="banner">Scenario {run.scenario} overrides enabled/funding/timing for this view; your entered values below are unchanged.</div>
      )}
      <Section title="Decision rules">
        <Grid cols={4}>
          <Toggle path="control.autoDefer" label="Search later months for the earliest passing date" />
          <SelectField path="control.downsideTest" label="Stress-survival test" options={[{ value: 'combined', label: 'Combined stress' }, { value: 'income-loss', label: 'Income loss' }, { value: 'vacancy-event', label: 'Vacancy event' }, { value: 'heloc-2', label: 'HELOC rate shock' }, { value: 'capex', label: 'Major repair' }]} />
          <NumField path="policy.dscrBase" label="Economic DSCR, base" kind="ratio" />
          <NumField path="policy.dscrDownside" label="Economic DSCR, downside" kind="ratio" />
          <NumField path="policy.downsideRentCutPct" label="Downside rent cut" kind="pct" />
          <NumField path="policy.downsideVacancyPct" label="Downside vacancy" kind="pct" />
          <NumField path="policy.lenderDscrMin" label="Lender DSCR minimum" kind="ratio" />
          <NumField path="policy.maxDti" label="Max household DTI" kind="pct" />
          <NumField path="policy.lenderRentFactor" label="Lender rent factor" kind="pct" />
          <NumField path="policy.stressCashFloor" label="Stress cash floor" />
          <Toggle path="policy.requireConsumerCleared" label="Consumer debt must be cleared first" />
        </Grid>
      </Section>
      {inputs.acquisitions.map((a, i) => {
        const b = `acquisitions.${i}`;
        const d = run.decisions.find((x) => x.acq.id === a.id);
        const ret = returns.find((r) => r.id === a.id);
        return (
          <Section
            key={a.id}
            title={a.name}
            aside={
              <div className="row-gap">
                {d && <span className={'badge badge-' + d.status.toLowerCase().replace(/\s+/g, '-')}>{d.status}{d.closeIdx !== null ? ` · ${idxLabel(d.closeIdx)}` : ''}</span>}
                <button className="btn-icon" title="Remove candidate" onClick={() => confirm(`Remove ${a.name}?`) && set('acquisitions', inputs.acquisitions.filter((x) => x.id !== a.id))}>✕</button>
              </div>
            }
          >
            <div className="two-col tight">
              <div>
                <Grid cols={3}>
                  <TextField path={`${b}.name`} label="Name / address" />
                  <MonthField path={`${b}.proposedMonth`} label="Proposed closing" />
                  <NumField path={`${b}.minGapAfterPrevious`} label="Min months after prior purchase" kind="months" />
                  <NumField path={`${b}.price`} label="Price" required />
                  <NumField path={`${b}.priceGrowth`} label="Price drift if deferred (annual)" kind="pct" />
                  <NumField path={`${b}.downPct`} label="Down payment" kind="pct" />
                  <NumField path={`${b}.closingPct`} label="Closing cash (% of price)" kind="pct" />
                  <NumField path={`${b}.initialWork`} label="Initial work" />
                  <NumField path={`${b}.leaseUpMonths`} label="Lease-up" kind="months" />
                  <NumField path={`${b}.leaseUpCash`} label="Lease-up cash" />
                  <NumField path={`${b}.otherConfirmedFunds`} label="Other confirmed funds" />
                  <NumField path={`${b}.rate`} label="Mortgage rate (dated quote)" kind="pct" required />
                  <NumField path={`${b}.termMonths`} label="Term" kind="months" />
                  <SelectField path={`${b}.funding`} label="Funding" options={[{ value: 'cash', label: 'Cash (savings)' }, { value: 'heloc', label: 'HELOC for the gap' }]} />
                  <NumField path={`${b}.helocCap`} label="HELOC draw cap" />
                </Grid>
                <h4>Operations</h4>
                <Grid cols={3}>
                  <NumField path={`${b}.ops.rentMonthly`} label="Market rent / month" required />
                  <NumField path={`${b}.ops.rentGrowth`} label="Rent growth at renewal" kind="pct" />
                  <NumField path={`${b}.ops.vacancyPct`} label="Vacancy & credit loss" kind="pct" />
                  <NumField path={`${b}.ops.taxesAnnual`} label="Property taxes / yr" required />
                  <NumField path={`${b}.ops.insuranceAnnual`} label="Insurance / yr" required />
                  <NumField path={`${b}.ops.taxInsGrowth`} label="Tax & insurance growth" kind="pct" />
                  <NumField path={`${b}.ops.hoaMonthly`} label="HOA / month" />
                  <NumField path={`${b}.ops.utilitiesMonthly`} label="Owner utilities / month" />
                  <NumField path={`${b}.ops.mgmtPct`} label="Management (% collected)" kind="pct" />
                  <NumField path={`${b}.ops.repairsPct`} label="Routine repairs (% collected)" kind="pct" />
                  <NumField path={`${b}.ops.capexPct`} label="Capital provision (% collected)" kind="pct" />
                  <NumField path={`${b}.ops.otherIncomeMonthly`} label="Other income / month" />
                  <NumField path={`${b}.ops.securityDeposit`} label="Security deposit" />
                  <NumField path={`${b}.ops.valueGrowth`} label="Value growth" kind="pct" />
                  <NumField path={`${b}.sellingCostPct`} label="Selling costs (sale view)" kind="pct" />
                  <NumField path={`${b}.saleTaxEstimate`} label="Est. sale taxes" />
                  <NumField path={`${b}.landPct`} label="Land share (tax module)" kind="pct" />
                </Grid>
                <Toggle path={`${b}.enabled`} label="Include in the Custom scenario" />
              </div>
              <div>{d ? <DecisionPanel d={d} ret={ret} /> : !run.sim ? <NotReady /> : null}</div>
            </div>
          </Section>
        );
      })}
      <button className="btn" onClick={() => set('acquisitions', [...inputs.acquisitions, { ...blankAcquisition(`Rental ${inputs.acquisitions.length + 1}`, inputs.control.checkpointMonth, false), minGapAfterPrevious: 12 }])}>
        + Add candidate
      </button>
    </>
  );
}

function DecisionPanel({ d, ret }: { d: AcqDecision; ret?: ReturnType<typeof propertyReturns>[0] }) {
  const ev = d.atClose ?? d.atProposed;
  if (d.status === 'NOT ENABLED') return <p className="muted">Not included in this scenario.</p>;
  if (d.status === 'INPUT REQUIRED' || !ev) return <p><span className="chip chip-input-required">INPUT REQUIRED</span> Enter price, rate, rent, taxes and insurance to underwrite.</p>;
  const c = ev.sim.closings[d.acq.id];
  const u = ev.underwriting;
  return (
    <div className="decision">
      <h4>{d.status === 'BUY' ? `Passes at ${idxLabel(d.closeIdx!)}` : d.status === 'DEFER' ? `DEFER: fails at ${idxLabel(d.proposedIdx)}, earliest passing ${idxLabel(d.closeIdx!)}` : `No passing month through 2036 (tested from ${idxLabel(d.proposedIdx)})`}</h4>
      {d.failed.length > 0 && (
        <div className="failed">
          <b>Failed at {idxLabel(d.proposedIdx)}:</b>
          {d.failed.map((f) => <div key={f.id} className="small"><PassBadge pass={f.pass} /> {f.label}: {f.detail}</div>)}
        </div>
      )}
      <table className="tbl kv">
        <tbody>
          {ev.tests.map((t) => (
            <tr key={t.id}><td><PassBadge pass={t.pass} /> {t.label}</td><td className="small muted">{t.detail}</td></tr>
          ))}
        </tbody>
      </table>
      {c && (
        <>
          <h4>Closing cash bridge · {idxLabel(c.idx)}{d.atClose ? '' : ' (proposed)'}</h4>
          <table className="tbl kv num">
            <tbody>
              <tr><td>Price</td><td>{usd(c.price)}</td></tr>
              <tr><td>Down payment (incl. earnest money)</td><td>{usd(c.downPayment)}</td></tr>
              <tr><td>Closing cash</td><td>{usd(c.closingCash)}</td></tr>
              <tr><td>Initial work</td><td>{usd(c.initialWork)}</td></tr>
              <tr><td>Lease-up cash</td><td>{usd(c.leaseUpCash)}</td></tr>
              <tr><td>Required post-close reserves (household + all rentals)</td><td>{usd(c.postCloseReserves)}</td></tr>
              <tr className="total"><td>Cash needed</td><td>{usd(c.cashNeeded)}</td></tr>
              <tr><td>Eligible cash (prior month-end)</td><td>{usd(c.eligibleCash)}</td></tr>
              <tr><td>Other confirmed funds</td><td>{usd(c.otherFunds)}</td></tr>
              <tr className="total"><td>Funding gap</td><td>{usd(c.fundingGap)}</td></tr>
              <tr><td>HELOC draw (available {usd(c.helocAvailable)})</td><td>{usd(c.helocDraw)}</td></tr>
              <tr className={c.shortfall > 0.5 ? 'bad' : ''}><td>Unfunded</td><td>{usd(c.shortfall)}</td></tr>
              <tr><td>Loan amount · payment</td><td>{usd(c.loanAmount)} · {usd(c.payment)}/mo</td></tr>
            </tbody>
          </table>
        </>
      )}
      {u && (
        <>
          <h4>Stabilized year (from rent start)</h4>
          <table className="tbl kv num">
            <tbody>
              <tr><td>Potential rent</td><td>{usd(u.potentialRent)}</td></tr>
              <tr><td>Vacancy & credit loss</td><td>{usd(-u.vacancyLoss)}</td></tr>
              <tr><td>Effective income</td><td>{usd(u.effectiveIncome)}</td></tr>
              <tr><td>Operating expenses</td><td>{usd(-u.opex)}</td></tr>
              <tr className="total"><td>NOI</td><td>{usd(u.noi)}</td></tr>
              <tr><td>Mortgage debt service</td><td>{usd(-u.debtService)}</td></tr>
              <tr><td>Capital provision</td><td>{usd(-u.capexProvision)}</td></tr>
              <tr><td>Cash flow before HELOC</td><td>{usd(u.cfBefore)}</td></tr>
              <tr><td>Allocated HELOC service</td><td>{usd(-u.helocService)}</td></tr>
              <tr className="total"><td>Cash flow after HELOC</td><td>{usd(u.cfAfter)}</td></tr>
              <tr><td>Economic DSCR (base / downside)</td><td>{x2(u.economicDscr)} / {x2(u.downsideDscr)}</td></tr>
              <tr><td>Lender DSCR (rent ÷ PITIA)</td><td>{x2(u.lenderDscr)}</td></tr>
              <tr><td>Cap rate · yield on cost</td><td>{pct(u.capRate, 2)} · {pct(u.yieldOnCost, 2)}</td></tr>
              <tr><td>Cash-on-cash (owner cash {usd(u.ownerCash)})</td><td>{pct(u.cashOnCash, 2)}</td></tr>
              <tr><td>Break-even rent / month</td><td>{usd(u.breakEvenRent)}</td></tr>
            </tbody>
          </table>
        </>
      )}
      {ret && (
        <>
          <h4>Through Dec 2036</h4>
          <table className="tbl kv num">
            <tbody>
              <tr><td>Owner contributions / distributions</td><td>{usd(ret.ownerContributions)} / {usd(ret.distributions)}</td></tr>
              <tr><td>Hold view: economic equity (after allocated HELOC)</td><td>{usd(ret.holdEquity2036)}</td></tr>
              <tr><td>Sale view: net sale cash</td><td>{usd(ret.netSaleCash)}</td></tr>
              <tr><td>Owner XIRR (sale view)</td><td>{ret.irr === null ? 'N/A' : pct(ret.irr, 1)}</td></tr>
              <tr><td>Depreciation / yr (27.5-yr GDS, optional tax module)</td><td>{usd(ret.depreciationAnnual)}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
