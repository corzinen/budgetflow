import { useModel } from '../../App';
import { acceptanceExamples, validationChecks } from '../../model/analysis';
import { PageHead } from '../common';
import { PassBadge, Section } from '../fields';
import { pct, usd } from '../fmt';
import { useStore } from '../store';

export function ChecksPage() {
  const run = useModel();
  const { inputs } = useStore();
  const checks = validationChecks(inputs, run);
  const ex = acceptanceExamples();
  const spec = [
    [75600, 15600], [88250, 28250], [94000, 34000], [99750, 39750], [102000, 42000], [116000, 56000],
  ];
  return (
    <>
      <PageHead title="Checks" sub="Section 12 validation and acceptance tests. Missing-data and formula errors are never suppressed with a zero." />
      <div className="two-col">
        <Section title="Validation tests (live)">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Test</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}><td>{c.id}</td><td>{c.label}</td><td><PassBadge pass={c.pass} /></td><td className="small muted">{c.detail}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Required inputs">
          {run.missing.length === 0 ? <p className="good">All mandatory inputs entered.</p> : (
            <ul className="missing-list">
              {run.missing.map((m) => (
                <li key={m.path}><span className="chip chip-input-required">INPUT REQUIRED</span> {m.label}{!m.blocksEngine && <span className="muted small"> · blocks decisions only</span>}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Acceptance examples — recomputed with the model's own formulas">
        <p className="small muted">Section 7 illustration: closing cash 3% of price, initial work $5,000, post-closing reserves $20,000, lease-up $0, eligible cash $60,000.</p>
        <table className="tbl num">
          <thead><tr><th>Price</th><th>Down</th><th>Total cash needed</th><th>Gap above $60k</th><th>Spec</th><th>Result</th></tr></thead>
          <tbody>
            {ex.funding.map((r, i) => {
              const ok = Math.round(r.need) === spec[i][0] && Math.round(r.gap) === spec[i][1];
              return <tr key={i}><td>{usd(r.price)}</td><td>{pct(r.down, 0)}</td><td>{usd(r.need)}</td><td>{usd(r.gap)}</td><td>{usd(spec[i][0])} / {usd(spec[i][1])}</td><td><PassBadge pass={ok} /></td></tr>;
            })}
            <tr><td colSpan={3}>Max price without borrowing = (60,000 − 20,000 − 5,000) / (20% + 3%)</td><td>{usd(ex.maxPrice)}</td><td>≈ $152,174</td><td><PassBadge pass={Math.round(ex.maxPrice ?? 0) === 152174} /></td></tr>
            <tr><td colSpan={3}>Potential HELOC line, V $500k, M $235k, 80% CLTV</td><td>{usd(ex.heloc80)}</td><td>$165,000</td><td><PassBadge pass={ex.heloc80 === 165000} /></td></tr>
            <tr><td colSpan={3}>Potential HELOC line at 85% CLTV</td><td>{usd(ex.heloc85)}</td><td>$190,000</td><td><PassBadge pass={ex.heloc85 === 190000} /></td></tr>
            <tr><td colSpan={3}>$100,000 at 0% over 100 months</td><td>{usd(ex.zeroRatePayment)}</td><td>$1,000</td><td><PassBadge pass={ex.zeroRatePayment === 1000} /></td></tr>
            <tr><td colSpan={3}>$10,000 HELOC, one month at 12%, interest-only</td><td>{usd(ex.helocInterest)} interest · {usd(ex.helocPrincipal)} principal</td><td>$100 / $0</td><td><PassBadge pass={Math.abs(ex.helocInterest - 100) < 1e-9 && ex.helocPrincipal === 0} /></td></tr>
            <tr><td colSpan={3}>$28,250 gap at 9% / 12% interest-only</td><td>{usd(ex.helocCost9)} / {usd(ex.helocCost12)}</td><td>≈ $212 / $283</td><td><PassBadge pass={Math.round(ex.helocCost9) === 212 && Math.round(ex.helocCost12) === 283} /></td></tr>
          </tbody>
        </table>
      </Section>
    </>
  );
}
