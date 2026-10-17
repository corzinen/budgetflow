import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Inputs, RegisterEntry } from '../model/types';
import { defaultInputs } from '../model/defaults';

const KEY = 'budgetflow.model.v1';
const LOG_KEY = 'budgetflow.changelog.v1';
const VER_KEY = 'budgetflow.versions.v1';

export interface ChangeEntry { ts: string; path: string; prev: unknown; next: unknown }
export interface Version { id: string; ts: string; label: string; inputs: Inputs }

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function getAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}
function setAtPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root: unknown = Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) };
  let cur = root as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const nxt = cur[keys[i]];
    cur[keys[i]] = Array.isArray(nxt) ? [...nxt] : { ...(nxt as object) };
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return root as T;
}

interface Store {
  inputs: Inputs;
  set: (path: string, value: unknown) => void;
  replace: (next: Inputs, label: string) => void;
  setRegister: (path: string, patch: Partial<RegisterEntry>) => void;
  log: ChangeEntry[];
  versions: Version[];
  saveVersion: (label: string) => void;
  deleteVersion: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<Inputs>(() => ({ ...defaultInputs(), ...load<Partial<Inputs>>(KEY, {}) }) as Inputs);
  const [log, setLog] = useState<ChangeEntry[]>(() => load(LOG_KEY, []));
  const [versions, setVersions] = useState<Version[]>(() => load(VER_KEY, []));

  useEffect(() => save(KEY, inputs), [inputs]);
  useEffect(() => save(LOG_KEY, log.slice(0, 500)), [log]);
  useEffect(() => save(VER_KEY, versions), [versions]);

  const set = useCallback((path: string, value: unknown) => {
    setInputs((cur) => {
      const prev = getAt(cur, path);
      if (JSON.stringify(prev) === JSON.stringify(value)) return cur;
      // only log scalar edits; list add/remove are logged by path with a summary
      const summarize = (v: unknown) => (Array.isArray(v) ? `[${v.length} items]` : v);
      setLog((l) => [{ ts: new Date().toISOString(), path, prev: summarize(prev), next: summarize(value) }, ...l]);
      return setAtPath(cur, path, value);
    });
  }, []);

  const replace = useCallback((next: Inputs, label: string) => {
    setInputs(next);
    setLog((l) => [{ ts: new Date().toISOString(), path: '(all inputs)', prev: '', next: label }, ...l]);
  }, []);

  const setRegister = useCallback((path: string, patch: Partial<RegisterEntry>) => {
    setInputs((cur) => {
      const prev = cur.register[path] ?? { status: 'INPUT REQUIRED', source: '', owner: 'Household', effectiveDate: '', verifiedOn: '' };
      return { ...cur, register: { ...cur.register, [path]: { ...prev, ...patch } } };
    });
  }, []);

  const saveVersion = useCallback((label: string) => {
    setVersions((v) => [{ id: crypto.randomUUID(), ts: new Date().toISOString(), label, inputs }, ...v]);
  }, [inputs]);
  const deleteVersion = useCallback((id: string) => setVersions((v) => v.filter((x) => x.id !== id)), []);

  const value = useMemo(
    () => ({ inputs, set, replace, setRegister, log, versions, saveVersion, deleteVersion }),
    [inputs, set, replace, setRegister, log, versions, saveVersion, deleteVersion],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
