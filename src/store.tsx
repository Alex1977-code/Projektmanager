import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Allocation, Collection, Data, Employee, EntityOf, ID, Settings, Summary, Task } from './types';
import { buildIndex, type Index } from './utils/metrics';
import { useToast } from './components/Toast';
import { useAuth } from './auth';
import type { Role, SessionUser } from './types';

interface Store {
  data: Data;
  idx: Index;
  me: Employee | null;
  setMeId: (id: ID) => void;
  /** angemeldeter Benutzer (null ohne Anmeldung) */
  session: SessionUser | null;
  authMode: 'none' | 'ldap' | 'header';
  role: Role;
  isLead: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
  create: <C extends Collection>(c: C, obj: Partial<EntityOf<C>>) => Promise<EntityOf<C>>;
  update: <C extends Collection>(c: C, id: ID, patch: Partial<EntityOf<C>>) => Promise<EntityOf<C> | undefined>;
  remove: <C extends Collection>(c: C, id: ID) => Promise<boolean>;
  setAllocation: (employeeId: ID, projectId: ID, weekStart: string, hours: number) => Promise<void>;
  createTasks: (list: Partial<Task>[]) => Promise<Task[]>;
  refreshSummary: () => Promise<void>;
  reload: () => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

const ME_KEY = 'pm.currentUserId';

function readMe(): ID | null {
  try {
    const v = localStorage.getItem(ME_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const auth = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeIdState] = useState<ID | null>(readMe);
  const dataRef = useRef<Data | null>(null);
  dataRef.current = data;

  const reload = useCallback(async () => {
    try {
      const d = await api.get<Data>('/api/bootstrap');
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshSummary = useCallback(async () => {
    const summary = await api.get<Summary>('/api/summary');
    setData((d) => (d ? { ...d, summary } : d));
  }, []);

  const fail = useCallback((e: unknown) => {
    toast.error((e as Error).message || 'Aktion fehlgeschlagen');
  }, [toast]);

  const create = useCallback(async <C extends Collection>(c: C, obj: Partial<EntityOf<C>>) => {
    try {
      const row = await api.post<EntityOf<C>>(`/api/${c}`, obj);
      setData((d) => (d ? { ...d, [c]: [...(d[c] as EntityOf<C>[]), row] } : d));
      return row;
    } catch (e) {
      fail(e);
      throw e;
    }
  }, [fail]);

  const update = useCallback(async <C extends Collection>(c: C, id: ID, patch: Partial<EntityOf<C>>) => {
    const before = dataRef.current;
    // optimistisch aktualisieren
    setData((d) => (d ? { ...d, [c]: (d[c] as EntityOf<C>[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d));
    try {
      const row = await api.put<EntityOf<C>>(`/api/${c}/${id}`, patch);
      setData((d) => (d ? { ...d, [c]: (d[c] as EntityOf<C>[]).map((x) => (x.id === id ? row : x)) } : d));
      return row;
    } catch (e) {
      if (before) setData(before);
      fail(e);
      return undefined;
    }
  }, [fail]);

  const remove = useCallback(async <C extends Collection>(c: C, id: ID) => {
    try {
      await api.del(`/api/${c}/${id}`);
      if (c === 'projects' || c === 'phases' || c === 'employees' || c === 'tasks') {
        await reload(); // abhängige Daten wurden serverseitig bereinigt
      } else {
        setData((d) => (d ? { ...d, [c]: (d[c] as EntityOf<C>[]).filter((x) => x.id !== id) } : d));
      }
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }, [fail, reload]);

  const setAllocation = useCallback(async (employeeId: ID, projectId: ID, weekStart: string, hours: number) => {
    const match = (a: Allocation) => a.employeeId === employeeId && a.projectId === projectId && a.weekStart === weekStart;
    const before = dataRef.current;
    setData((d) => {
      if (!d) return d;
      const exists = d.allocations.some(match);
      let allocations: Allocation[];
      if (hours <= 0) allocations = d.allocations.filter((a) => !match(a));
      else if (exists) allocations = d.allocations.map((a) => (match(a) ? { ...a, hours } : a));
      else allocations = [...d.allocations, { id: -Date.now(), employeeId, projectId, weekStart, hours }];
      return { ...d, allocations };
    });
    try {
      const res = await api.post<Allocation | { deleted: ID | null }>('/api/allocations/set', { employeeId, projectId, weekStart, hours });
      if ('id' in res) setData((d) => (d ? { ...d, allocations: d.allocations.map((a) => (match(a) ? res : a)) } : d));
    } catch (e) {
      if (before) setData(before);
      fail(e);
    }
  }, [fail]);

  const createTasks = useCallback(async (list: Partial<Task>[]) => {
    try {
      const rows = await api.post<Task[]>('/api/tasks/batch', list);
      setData((d) => (d ? { ...d, tasks: [...d.tasks, ...rows] } : d));
      return rows;
    } catch (e) {
      fail(e);
      throw e;
    }
  }, [fail]);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    try {
      const settings = await api.put<Settings>('/api/settings', patch);
      setData((d) => (d ? { ...d, settings } : d));
      toast.success('Einstellungen gespeichert');
    } catch (e) {
      fail(e);
    }
  }, [fail, toast]);

  const setMeId = useCallback((id: ID) => {
    setMeIdState(id);
    try {
      localStorage.setItem(ME_KEY, String(id));
    } catch {
      /* Speicher nicht verfügbar – Auswahl gilt nur für diese Sitzung */
    }
  }, []);

  const idx = useMemo(() => (data ? buildIndex(data) : null), [data]);

  const me = useMemo(() => {
    if (!data) return null;
    if (auth.mode !== 'none') return data.employees.find((e) => e.id === auth.user?.employeeId) || null;
    const active = data.employees.filter((e) => e.active);
    return active.find((e) => e.id === meId) || active.find((e) => e.role?.startsWith('Projektleiter')) || active[0] || null;
  }, [data, meId, auth.mode, auth.user]);

  if (error && !data) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <h1>Verbindung zum Server fehlgeschlagen</h1>
          <p>{error}</p>
          <p className="muted">Bitte prüfen Sie, ob der Server läuft (<code>npm run dev</code> bzw. <code>npm start</code>).</p>
          <button className="btn btn-primary" onClick={reload}>Erneut versuchen</button>
        </div>
      </div>
    );
  }
  if (!data || !idx) {
    return (
      <div className="boot-screen">
        <div className="spinner" aria-label="Lädt" />
      </div>
    );
  }

  const role: Role = auth.mode === 'none' ? 'admin' : auth.user?.role || 'mitarbeiter';
  const value: Store = {
    session: auth.user, authMode: auth.mode, role, isLead: role === 'admin' || role === 'leitung', isAdmin: role === 'admin', logout: auth.logout,
    data, idx, me, setMeId, create, update, remove, setAllocation, createTasks, refreshSummary, reload, saveSettings };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore außerhalb des StoreProvider');
  return s;
}
