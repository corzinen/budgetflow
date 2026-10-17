import { useRef, useState } from 'react';
import { PageHead } from '../common';
import { Section, STATUSES, statusClass } from '../fields';
import { useStore } from '../store';
import type { InputStatus, Inputs } from '../../model/types';

export function GuidePage() {
  const { inputs, setRegister, log, versions, saveVersion, deleteVersion, replace } = useStore();
  const [label, setLabel] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(inputs, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budgetflow-inputs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Inputs;
      if (data.version !== 1 || !data.control) throw new Error('Not a BudgetFlow inputs file');
      replace(data, `Imported ${f.name}`);
    } catch (e) {
      alert(String(e));
    }
  };
  return (
    <>
      <PageHead title="Guide, register & change log" />
      <Section title="How to use this model">
        <ol className="guide">
          <li><b>Enter actuals.</b> Set “Actuals through” to the last closed month and enter opening balances as of that month-end. Add verified monthly actuals for earlier months; missing months are labelled, never invented.</li>
          <li><b>Plan the debt payoff.</b> On Debt payoff, enter each consumer account and the deadline. The engine pays MAX(minimum, payment needed to clear by the deadline) and flags a missed deadline. Compare Yukon policies and HELOC consolidation.</li>
          <li><b>Choose a scenario.</b> The selector at the top of each page switches between Custom and the four Section 7 scenarios without changing your inputs.</li>
          <li><b>Change an acquisition date.</b> Edit “Proposed closing” on Acquisitions. If any test fails the candidate shows DEFER with the failed tests, and the earliest passing month is found automatically.</li>
          <li><b>Read failure flags.</b> INPUT REQUIRED means a mandatory figure is blank. FAIL lists the formula result against the threshold. Engine flags (payment below interest, negative cash, balloon due) appear on the Dashboard and Monthly ledger.</li>
          <li><b>Update debt terms.</b> Enter the contractual payment; the formula check shows the amortizing payment for comparison. HELOC terms (index, margin, floor, cap, draw end, repayment) come from written lender terms.</li>
          <li><b>Cadence.</b> Update actuals monthly, reforecast quarterly and after material changes, and save a dated version before each purchase decision.</li>
        </ol>
        <p className="small muted">Conventions: US dollars, nominal; annual rates stored as decimals; property growth is effective annual ((1+g)^(1/12) monthly); closings occur on the 1st of the month and use prior month-end cash; first mortgage payment the month after closing (prepaid interest in closing cash); HELOC interest uses a labelled monthly average-balance approximation. Results are pre-tax; the tax module shows depreciation only. This model does not establish loan eligibility, future prices or an approved budget.</p>
      </Section>

      <Section title="Saved versions & files">
        <div className="row-gap">
          <input placeholder="Version label (e.g. Pre-offer review)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { saveVersion(label || 'Snapshot'); setLabel(''); }}>Save version</button>
          <button className="btn" onClick={exportJson}>Export inputs (JSON)</button>
          <button className="btn" onClick={() => file.current?.click()}>Import inputs</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        {versions.length > 0 && (
          <table className="tbl">
            <thead><tr><th>Saved</th><th>Label</th><th /></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{new Date(v.ts).toLocaleString()}</td><td>{v.label}</td>
                  <td className="row-gap">
                    <button className="btn" onClick={() => confirm(`Restore “${v.label}”?`) && replace(v.inputs, `Restored version: ${v.label}`)}>Restore</button>
                    <button className="btn-icon" onClick={() => deleteVersion(v.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="small muted">Data is stored only in this browser. Keep account numbers out of exported files you share.</p>
      </Section>

      <Section title="Input register">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Input</th><th>Status</th><th>Source</th><th>Owner</th><th>Effective date</th><th>Last verified</th></tr></thead>
            <tbody>
              {Object.entries(inputs.register).sort().map(([k, r]) => (
                <tr key={k}>
                  <td className="mono small">{k}</td>
                  <td>
                    <select className={statusClass(r.status)} value={r.status} onChange={(e) => setRegister(k, { status: e.target.value as InputStatus })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input value={r.source} onChange={(e) => setRegister(k, { source: e.target.value })} /></td>
                  <td><input value={r.owner} onChange={(e) => setRegister(k, { owner: e.target.value })} /></td>
                  <td><input type="date" value={r.effectiveDate} onChange={(e) => setRegister(k, { effectiveDate: e.target.value })} /></td>
                  <td><input type="date" value={r.verifiedOn} onChange={(e) => setRegister(k, { verifiedOn: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Change log">
        {log.length === 0 ? <p className="muted">No changes yet.</p> : (
          <div className="scroll-x tall">
            <table className="tbl">
              <thead><tr><th>When</th><th>Field</th><th>Previous</th><th>New</th></tr></thead>
              <tbody>
                {log.slice(0, 300).map((e, i) => (
                  <tr key={i}><td className="small">{new Date(e.ts).toLocaleString()}</td><td className="mono small">{e.path}</td><td>{String(e.prev ?? '—')}</td><td>{String(e.next ?? '—')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
