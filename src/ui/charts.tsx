import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SimResult } from '../model/engine';
import { ymLabel } from '../model/finance';
import { usd, usdK } from './fmt';

const C = {
  cash: 'var(--c1)',
  reserve: 'var(--c4)',
  primary: 'var(--c2)',
  novella: 'var(--c3)',
  consumer: 'var(--c5)',
  yukon: 'var(--c6)',
  heloc: 'var(--c4)',
  acq: 'var(--c7)',
  nw: 'var(--c1)',
};

const axis = { stroke: 'var(--muted)', fontSize: 11 };
const tip = { contentStyle: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }, formatter: (v: number) => usd(v), labelFormatter: (l: string) => ymLabel(l) };

export function CashChart({ sim, marks = [] }: { sim: SimResult; marks?: { ym: string; label: string }[] }) {
  const data = sim.rows.filter((r) => r.modeled).map((r) => ({ ym: r.ym, Cash: r.cashEnd, 'Required reserves': r.reserveRequired }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="ym" tick={axis} tickFormatter={(v: string) => (v.endsWith('-01') ? v.slice(0, 4) : '')} interval={0} />
        <YAxis tick={axis} tickFormatter={usdK} width={56} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {marks.map((m) => (
          <ReferenceLine key={m.ym + m.label} x={m.ym} stroke="var(--muted)" strokeDasharray="4 3" label={{ value: m.label, fontSize: 10, fill: 'var(--muted)', position: 'insideTopLeft' }} />
        ))}
        <Line isAnimationActive={false} type="monotone" dataKey="Cash" stroke={C.cash} dot={false} strokeWidth={2} />
        <Line isAnimationActive={false} type="monotone" dataKey="Required reserves" stroke={C.reserve} dot={false} strokeDasharray="5 4" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DebtChart({ sim }: { sim: SimResult }) {
  const data = sim.rows.filter((r) => r.modeled).map((r) => ({
    ym: r.ym,
    Primary: r.bal.primary,
    Novella: r.bal.novella,
    Consumer: r.bal.consumer,
    Yukon: r.bal.yukon,
    HELOC: r.bal.heloc,
    'New rentals': Object.values(r.bal.acq).reduce((s, v) => s + v, 0),
  }));
  const keys: [string, string][] = [['Primary', C.primary], ['Novella', C.novella], ['New rentals', C.acq], ['HELOC', C.heloc], ['Yukon', C.yukon], ['Consumer', C.consumer]];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="ym" tick={axis} tickFormatter={(v: string) => (v.endsWith('-01') ? v.slice(0, 4) : '')} interval={0} />
        <YAxis tick={axis} tickFormatter={usdK} width={56} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map(([k, c]) => (
          <Area isAnimationActive={false} key={k} type="monotone" dataKey={k} stackId="1" stroke={c} fill={c} fillOpacity={0.55} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SeriesChart({ data, series, height = 240 }: { data: Record<string, number | string>[]; series: { key: string; color: string; dashed?: boolean }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="ym" tick={axis} tickFormatter={(v: string) => (v.endsWith('-01') ? v.slice(0, 4) : '')} interval={0} />
        <YAxis tick={axis} tickFormatter={usdK} width={56} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} dot={false} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
