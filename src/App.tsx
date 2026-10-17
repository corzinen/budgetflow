import { createContext, useContext, useDeferredValue, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './ui/store';
import { runModel, type ModelRun } from './model/scenario';
import { Dashboard } from './ui/pages/Dashboard';
import { InputsPage } from './ui/pages/InputsPage';
import { DebtPage } from './ui/pages/DebtPage';
import { HelocPage } from './ui/pages/HelocPage';
import { AcquisitionsPage } from './ui/pages/AcquisitionsPage';
import { ScenariosPage } from './ui/pages/ScenariosPage';
import { LedgerPage } from './ui/pages/LedgerPage';
import { ChecksPage } from './ui/pages/ChecksPage';
import { GuidePage } from './ui/pages/GuidePage';

const ModelCtx = createContext<ModelRun | null>(null);
export const useModel = () => {
  const m = useContext(ModelCtx);
  if (!m) throw new Error('model missing');
  return m;
};

const TABS = [
  ['dashboard', 'Dashboard'],
  ['debt', 'Debt payoff'],
  ['heloc', 'HELOC & equity'],
  ['acq', 'Acquisitions'],
  ['scenarios', 'Scenarios & stress'],
  ['ledger', 'Monthly & annual'],
  ['inputs', 'Inputs'],
  ['checks', 'Checks'],
  ['guide', 'Guide & log'],
] as const;
export type TabId = (typeof TABS)[number][0];

const NavCtx = createContext<(t: TabId) => void>(() => {});
export const useNav = () => useContext(NavCtx);

function Shell() {
  const { inputs } = useStore();
  const deferred = useDeferredValue(inputs);
  const run = useMemo(() => runModel(deferred), [deferred]);
  const [tab, setTab] = useState<TabId>(() => {
    try { return (localStorage.getItem('budgetflow.tab') as TabId) || 'dashboard'; } catch { return 'dashboard'; }
  });
  const go = (t: TabId) => {
    setTab(t);
    try { localStorage.setItem('budgetflow.tab', t); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  };
  const stale = deferred !== inputs;
  return (
    <ModelCtx.Provider value={run}>
      <NavCtx.Provider value={go}>
        <div className="app">
          <aside className="nav">
            <div className="brand">
              <span className="logo">◆</span> BudgetFlow
              <div className="brand-sub">Debt payoff & acquisition model · 2026–2036</div>
            </div>
            <nav>
              {TABS.map(([id, label]) => (
                <button key={id} className={'nav-btn' + (tab === id ? ' active' : '')} onClick={() => go(id)}>
                  {label}
                  {id === 'inputs' && run.missing.length > 0 && <span className="nav-count">{run.missing.length}</span>}
                </button>
              ))}
            </nav>
          </aside>
          <main className={'main' + (stale ? ' stale' : '')}>
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'debt' && <DebtPage />}
            {tab === 'heloc' && <HelocPage />}
            {tab === 'acq' && <AcquisitionsPage />}
            {tab === 'scenarios' && <ScenariosPage />}
            {tab === 'ledger' && <LedgerPage />}
            {tab === 'inputs' && <InputsPage />}
            {tab === 'checks' && <ChecksPage />}
            {tab === 'guide' && <GuidePage />}
          </main>
        </div>
      </NavCtx.Provider>
    </ModelCtx.Provider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
