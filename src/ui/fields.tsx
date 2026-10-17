import { useEffect, useState, type ReactNode } from 'react';
import { getAt, useStore } from './store';
import type { InputStatus } from '../model/types';
import { monthOptions } from '../model/analysis';
import { ymLabel } from '../model/finance';

export const STATUSES: InputStatus[] = ['USER REPORTED', 'TARGET', 'PRIOR DISCUSSION', 'ILLUSTRATIVE', 'INPUT REQUIRED', 'VERIFIED', 'NOT APPLICABLE'];

export function statusClass(s: string) {
  return 'chip chip-' + s.toLowerCase().replace(/\s+/g, '-');
}

export function StatusChip({ path, isNull }: { path: string; isNull: boolean }) {
  const { inputs, setRegister } = useStore();
  const entry = inputs.register[path];
  if (isNull) return <span className="chip chip-input-required">INPUT REQUIRED</span>;
  if (!entry) return null;
  return (
    <select
      className={statusClass(entry.status)}
      value={entry.status}
      title={entry.source || 'Input status'}
      onChange={(e) => setRegister(path, { status: e.target.value as InputStatus })}
    >
      {STATUSES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}

type Kind = 'money' | 'pct' | 'number' | 'months' | 'ratio';

const toDisplay = (v: number | null | undefined, kind: Kind) => {
  if (v === null || v === undefined || !isFinite(v)) return '';
  if (kind === 'pct') return String(Math.round(v * 1e6) / 1e4);
  return String(v);
};
const fromDisplay = (s: string, kind: Kind): number | null => {
  const t = s.replace(/[$,%\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!isFinite(n)) return null;
  return kind === 'pct' ? n / 100 : n;
};

export function NumField({
  path, label, kind = 'money', required = false, hint, min, step, nullable,
}: { path: string; label: string; kind?: Kind; required?: boolean; hint?: string; min?: number; step?: number; nullable?: boolean }) {
  const { inputs, set } = useStore();
  const v = getAt(inputs, path) as number | null;
  const [draft, setDraft] = useState(toDisplay(v, kind));
  useEffect(() => {
    if (fromDisplay(draft, kind) !== v) setDraft(toDisplay(v, kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  const isNull = v === null || v === undefined;
  const allowNull = nullable ?? required;
  const prefix = kind === 'money' ? '$' : '';
  const suffix = kind === 'pct' ? '%' : kind === 'months' ? 'mo' : kind === 'ratio' ? 'x' : '';
  return (
    <label className={'field' + (isNull && required ? ' field-missing' : '')}>
      <span className="field-label">
        {label}
        <StatusChip path={path} isNull={isNull && required} />
      </span>
      <span className="field-input">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          inputMode="decimal"
          value={draft}
          placeholder={required ? 'INPUT REQUIRED' : '0'}
          step={step}
          min={min}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = fromDisplay(e.target.value, kind);
            if (n === null && !allowNull) return;
            set(path, n);
          }}
          onBlur={() => {
            if (fromDisplay(draft, kind) === null && !allowNull) setDraft(toDisplay(v, kind));
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function MonthField({ path, label, allowBlank, hint }: { path: string; label: string; allowBlank?: boolean; hint?: string }) {
  const { inputs, set } = useStore();
  const v = (getAt(inputs, path) as string) ?? '';
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={v} onChange={(e) => set(path, e.target.value)}>
        {allowBlank && <option value="">— none —</option>}
        {monthOptions().map((m) => (
          <option key={m} value={m}>{ymLabel(m)}</option>
        ))}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextField({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { inputs, set } = useStore();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={(getAt(inputs, path) as string) ?? ''} onChange={(e) => set(path, e.target.value)} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function SelectField({ path, label, options, hint }: { path: string; label: string; options: { value: string; label: string }[]; hint?: string }) {
  const { inputs, set } = useStore();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={String(getAt(inputs, path))} onChange={(e) => set(path, e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { inputs, set } = useStore();
  const v = !!getAt(inputs, path);
  return (
    <label className="field field-toggle">
      <input type="checkbox" checked={v} onChange={(e) => set(path, e.target.checked)} />
      <span>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Section({ title, children, aside, id }: { title: string; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      <header className="card-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export const Grid = ({ children, cols = 3 }: { children: ReactNode; cols?: number }) => (
  <div className="grid" style={{ ['--cols' as string]: cols }}>{children}</div>
);

/** Editable list of objects stored at `path`. */
export function ListEditor<T extends { id: string }>({
  path, make, render, addLabel, empty,
}: { path: string; make: () => T; render: (item: T, base: string, i: number) => ReactNode; addLabel: string; empty?: string }) {
  const { inputs, set } = useStore();
  const items = (getAt(inputs, path) as T[]) ?? [];
  return (
    <div className="list">
      {items.length === 0 && empty && <p className="muted">{empty}</p>}
      {items.map((it, i) => (
        <div className="list-item" key={it.id}>
          <div className="list-body">{render(it, `${path}.${i}`, i)}</div>
          <button className="btn-icon" title="Remove" onClick={() => set(path, items.filter((x) => x.id !== it.id))}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => set(path, [...items, make()])}>+ {addLabel}</button>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className={'stat' + (tone ? ' stat-' + tone : '')}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function PassBadge({ pass }: { pass: boolean | null }) {
  if (pass === null) return <span className="badge badge-req">INPUT REQUIRED</span>;
  return pass ? <span className="badge badge-pass">PASS</span> : <span className="badge badge-fail">FAIL</span>;
}
