import { useModel, useNav } from '../App';
import { illustrativeInputs } from '../model/defaults';
import { SCENARIOS } from '../model/scenario';
import { useStore } from './store';
import { statusClass } from './fields';

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  const { inputs, set } = useStore();
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <label className="scenario-pick">
        <span>Scenario</span>
        <select value={inputs.control.scenario} onChange={(e) => set('control.scenario', e.target.value)}>
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function NotReady() {
  const run = useModel();
  const { replace } = useStore();
  const go = useNav();
  const blocking = run.missing.filter((m) => m.blocksEngine);
  return (
    <section className="card notice">
      <h3>INPUT REQUIRED — the monthly engine needs {blocking.length} more input{blocking.length === 1 ? '' : 's'}</h3>
      <p className="muted">
        Blank mandatory inputs are shown as INPUT REQUIRED rather than zero or a passing result. Enter them on the Inputs, Debt payoff
        and HELOC pages, or load a clearly labelled illustrative household to explore how the model works.
      </p>
      <ul className="missing-list">
        {blocking.map((m) => (
          <li key={m.path}><span className="chip chip-input-required">INPUT REQUIRED</span> {m.label}</li>
        ))}
      </ul>
      <div className="row-gap">
        <button className="btn btn-primary" onClick={() => go('inputs')}>Enter inputs</button>
        <button
          className="btn"
          onClick={() => {
            if (confirm('Replace current inputs with the ILLUSTRATIVE example? (Save a version first on Guide & log if needed.)'))
              replace(illustrativeInputs(), 'Loaded illustrative example');
          }}
        >
          Load illustrative example
        </button>
      </div>
    </section>
  );
}

/** Banner reminding that results are not decision-ready while any input is unverified. */
export function ReadinessBanner() {
  const { inputs } = useStore();
  const run = useModel();
  const statuses = Object.values(inputs.register).map((r) => r.status);
  const illustrative = statuses.filter((s) => s === 'ILLUSTRATIVE').length;
  const prior = statuses.filter((s) => s === 'PRIOR DISCUSSION').length;
  const missing = run.missing.length;
  if (!illustrative && !prior && !missing) return <div className="banner banner-ok">All registered inputs are sourced. Lender terms must still be verified before purchase.</div>;
  return (
    <div className="banner">
      <strong>Not decision-ready.</strong>{' '}
      {missing > 0 && <span className={statusClass('INPUT REQUIRED')}>{missing} INPUT REQUIRED</span>}{' '}
      {illustrative > 0 && <span className={statusClass('ILLUSTRATIVE')}>{illustrative} ILLUSTRATIVE</span>}{' '}
      {prior > 0 && <span className={statusClass('PRIOR DISCUSSION')}>{prior} PRIOR DISCUSSION</span>}{' '}
      Replace with statements and household-approved settings before relying on an acquisition result.
    </div>
  );
}
