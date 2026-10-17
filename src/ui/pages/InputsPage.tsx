import { useModel } from '../../App';
import { defaultInputs, illustrativeInputs, uid } from '../../model/defaults';
import { pmt } from '../../model/finance';
import type { ActualMonth, DatedAmount, Earner, FixedLoan, RecurringItem } from '../../model/types';
import { PageHead } from '../common';
import { Grid, ListEditor, MonthField, NumField, Section, SelectField, TextField, Toggle } from '../fields';
import { usd } from '../fmt';
import { getAt, useStore } from '../store';

function PaymentCheck({ path }: { path: string }) {
  const { inputs } = useStore();
  const l = getAt(inputs, path) as FixedLoan;
  if (l.balance === null || l.apr === null || l.remainingMonths === null) return null;
  if (l.remainingMonths <= 0) return <p className="small bad">Remaining installments must be greater than zero for an outstanding loan (maturity/balloon).</p>;
  const calc = pmt(l.balance, l.apr, l.remainingMonths);
  const diff = l.payment === null ? null : l.payment - calc;
  return (
    <p className="small muted">
      Formula check: Payment = B·r / (1 − (1+r)^−n) = <b>{usd(calc)}</b>
      {diff !== null && Math.abs(diff) > 1 && <span className="warn"> · contractual differs by {usd(diff)} (contractual payment governs; verify against the note)</span>}
      {l.payment !== null && l.payment < (l.balance * l.apr) / 12 && <span className="bad"> · payment below accrued interest</span>}
    </p>
  );
}

export function InputsPage() {
  const { inputs, replace } = useStore();
  const run = useModel();
  return (
    <>
      <PageHead title="Inputs" sub="Keep inputs separate from formulas. Every figure is editable and every output recalculates." />
      <div className="row-gap">
        <button className="btn" onClick={() => confirm('Replace all inputs with the ILLUSTRATIVE example?') && replace(illustrativeInputs(), 'Loaded illustrative example')}>Load illustrative example</button>
        <button className="btn" onClick={() => confirm('Reset to spec defaults (blank INPUT REQUIRED fields)?') && replace(defaultInputs(), 'Reset to spec defaults')}>Reset to spec defaults</button>
        {run.missing.length > 0 && <span className="chip chip-input-required">{run.missing.length} INPUT REQUIRED</span>}
      </div>

      <Section title="Control and checkpoint">
        <Grid cols={4}>
          <MonthField path="control.actualsThrough" label="Actuals through (opening balance date)" hint="Forecast begins the following month" />
          <MonthField path="control.checkpointMonth" label="Acquisition checkpoint" />
          <SelectField path="control.checkpointConvention" label="Checkpoint day" options={[{ value: 'start', label: 'First of month (prior month-end cash)' }, { value: 'end', label: 'Month-end' }]} />
          <NumField path="control.savingsTarget" label="Savings target" />
          <Toggle path="control.targetIncludesReserves" label="Target is total unrestricted savings (includes reserves)" hint="Off: target is an acquisition fund in addition to reserves" />
          <NumField path="control.reportedEquity" label="Reported home equity" />
        </Grid>
      </Section>

      <Section title="Household budget">
        <ListEditor<Earner>
          path="household.earners"
          addLabel="Add earner"
          make={() => ({ id: uid('earner'), name: `Earner ${inputs.household.earners.length + 1}`, netMonthly: null, grossMonthly: null })}
          render={(_, b) => (
            <Grid cols={3}>
              <TextField path={`${b}.name`} label="Earner" />
              <NumField path={`${b}.netMonthly`} label="Net monthly pay (after payroll deductions)" required />
              <NumField path={`${b}.grossMonthly`} label="Gross qualifying income / month" required hint="Lender DTI only" />
            </Grid>
          )}
        />
        <Grid cols={4}>
          <NumField path="household.essentialsMonthly" label="Essential living expenses / month" required hint="Exclude mortgage & debt payments" />
          <NumField path="household.discretionaryMonthly" label="Discretionary / month" required />
          <NumField path="household.retirementMonthly" label="Retirement not withheld / month" />
          <NumField path="household.incomeGrowth" label="Income growth (default: no raises)" kind="pct" />
          <NumField path="household.expenseInflation" label="Expense inflation" kind="pct" />
        </Grid>
        <div className="two-col tight">
          <div>
            <h4>Bonuses and other cash additions (net)</h4>
            <ListEditor<DatedAmount>
              path="household.bonuses"
              addLabel="Add bonus"
              make={() => ({ id: uid('b'), month: inputs.control.checkpointMonth, amount: 0, label: 'Bonus' })}
              render={(_, b) => (<Grid cols={3}><MonthField path={`${b}.month`} label="Paid" /><NumField path={`${b}.amount`} label="Net amount" /><TextField path={`${b}.label`} label="Note" /></Grid>)}
            />
          </div>
          <div>
            <h4>One-time commitments (travel, remodel, goals)</h4>
            <ListEditor<DatedAmount>
              path="household.oneTime"
              addLabel="Add one-time outflow"
              make={() => ({ id: uid('o'), month: inputs.control.checkpointMonth, amount: 0, label: 'Commitment' })}
              render={(_, b) => (<Grid cols={3}><MonthField path={`${b}.month`} label="Month" /><NumField path={`${b}.amount`} label="Amount" /><TextField path={`${b}.label`} label="Note" /></Grid>)}
            />
          </div>
        </div>
        <h4>Recurring commitments</h4>
        <ListEditor<RecurringItem>
          path="household.recurring"
          addLabel="Add recurring commitment"
          make={() => ({ id: uid('r'), label: 'Commitment', amount: 0, start: inputs.control.actualsThrough, end: '' })}
          render={(_, b) => (<Grid cols={4}><TextField path={`${b}.label`} label="Item" /><NumField path={`${b}.amount`} label="Monthly" /><MonthField path={`${b}.start`} label="From" /><MonthField path={`${b}.end`} label="Through" allowBlank /></Grid>)}
        />
      </Section>

      <div className="two-col">
        <Section title="Cash and reserves">
          <Grid cols={2}>
            <NumField path="cash.openingCash" label="Opening unrestricted cash" required hint="At the actuals-through month-end; excludes tenant deposits" />
            <NumField path="cash.otherCommittedCash" label="Other committed cash" />
            <NumField path="cash.householdReserveMonths" label="Household reserve (months of essentials)" kind="months" />
            <NumField path="cash.rentalReserveMonths" label="Rental reserve (months of fixed costs)" kind="months" />
          </Grid>
          <p className="small muted">SpendableCash = MAX(0, Unrestricted − HouseholdReserve − RentalReserves − OtherCommitted). Household essentials = living essentials + primary housing + consumer & Yukon minimums. Rental fixed costs = mortgage + allocated HELOC + taxes + insurance + HOA + utilities.</p>
        </Section>
        <Section title="Primary residence">
          <Grid cols={3}>
            <NumField path="home.value" label="Market value" required />
            <TextField path="home.valuationDate" label="Valuation date" />
            <NumField path="home.valueGrowth" label="Value growth (default flat)" kind="pct" />
            <NumField path="home.mortgage.balance" label="Mortgage balance" required />
            <NumField path="home.mortgage.apr" label="Note rate" kind="pct" required />
            <NumField path="home.mortgage.payment" label="P&I payment" required />
            <NumField path="home.mortgage.remainingMonths" label="Remaining installments" kind="months" required />
            <NumField path="home.mortgage.escrowMonthly" label="Escrow / month" required />
            <NumField path="home.otherLiens" label="Other liens" />
          </Grid>
          <PaymentCheck path="home.mortgage" />
        </Section>
      </div>

      <Section title="Novella (existing rental)">
        <div className="two-col tight">
          <div>
            <h4>Loan</h4>
            <Grid cols={3}>
              <NumField path="novella.loan.balance" label="Statement balance" required />
              <NumField path="novella.loan.apr" label="Note rate" kind="pct" required />
              <NumField path="novella.loan.payment" label="Contractual P&I (excl. escrow)" required />
              <NumField path="novella.loan.remainingMonths" label="Remaining installments" kind="months" required />
              <NumField path="novella.loan.escrowMonthly" label="Escrow / month (0 if none)" required hint="If escrowed, enter taxes & insurance as 0 below" />
            </Grid>
            <PaymentCheck path="novella.loan" />
            {(inputs.novella.loan.escrowMonthly ?? 0) > 0 && ((inputs.novella.ops.taxesAnnual ?? 0) > 0 || (inputs.novella.ops.insuranceAnnual ?? 0) > 0) && (
              <p className="small warn">Escrow and taxes/insurance are both entered — check they are not counted twice.</p>
            )}
            <h4>Remaining capital work (dated cash)</h4>
            <ListEditor<DatedAmount>
              path="novella.capitalWork"
              addLabel="Add capital work"
              make={() => ({ id: uid('cw'), month: inputs.control.checkpointMonth, amount: 0, label: 'Capital work' })}
              render={(_, b) => (<Grid cols={3}><MonthField path={`${b}.month`} label="Month" /><NumField path={`${b}.amount`} label="Amount" /><TextField path={`${b}.label`} label="Scope" /></Grid>)}
            />
          </div>
          <div>
            <h4>Operations</h4>
            <Grid cols={3}>
              <NumField path="novella.ops.rentMonthly" label="Contractual rent" required />
              <MonthField path="novella.ops.leaseStart" label="Lease start" allowBlank />
              <NumField path="novella.ops.rentGrowth" label="Rent growth at renewal" kind="pct" />
              <NumField path="novella.ops.vacancyPct" label="Vacancy & credit loss" kind="pct" />
              <NumField path="novella.ops.taxesAnnual" label="Taxes / yr" required />
              <NumField path="novella.ops.insuranceAnnual" label="Insurance / yr" required />
              <NumField path="novella.ops.taxInsGrowth" label="Tax & insurance growth" kind="pct" />
              <NumField path="novella.ops.hoaMonthly" label="HOA / month" />
              <NumField path="novella.ops.utilitiesMonthly" label="Utilities / month" />
              <NumField path="novella.ops.mgmtPct" label="Management" kind="pct" />
              <NumField path="novella.ops.repairsPct" label="Routine repairs" kind="pct" />
              <NumField path="novella.ops.capexPct" label="Capital provision" kind="pct" />
              <NumField path="novella.ops.otherIncomeMonthly" label="Other income / month" />
              <NumField path="novella.ops.securityDeposit" label="Security deposit held" />
              <NumField path="novella.ops.value" label="Market value" required />
              <NumField path="novella.ops.valueGrowth" label="Value growth" kind="pct" />
            </Grid>
          </div>
        </div>
      </Section>

      <Section title="Verified actuals (months up to the actuals-through date)">
        <p className="small muted">Historical months contain verified actuals only — missing months are labelled, never backfilled.</p>
        <ListEditor<ActualMonth>
          path="actuals"
          addLabel="Add actual month"
          make={() => ({ id: uid('act'), month: inputs.control.actualsThrough, netIncome: 0, livingExpenses: 0, rentCollected: 0, propertyExpenses: 0, debtPayments: 0, endingCash: null })}
          render={(_, b) => (
            <Grid cols={7}>
              <MonthField path={`${b}.month`} label="Month" />
              <NumField path={`${b}.netIncome`} label="Net income" />
              <NumField path={`${b}.livingExpenses`} label="Living" />
              <NumField path={`${b}.rentCollected`} label="Rent collected" />
              <NumField path={`${b}.propertyExpenses`} label="Property expenses" />
              <NumField path={`${b}.debtPayments`} label="Debt payments" />
              <NumField path={`${b}.endingCash`} label="Ending cash" nullable />
            </Grid>
          )}
        />
      </Section>
    </>
  );
}
