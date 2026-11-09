// Browser-Backend für die veröffentlichte Version: dieselbe Geschäftslogik wie der Server
// (server/api.js), aber mit In-Memory-Speicher und Synchronisation über die gemeinsame Datenbank.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { handle } from '../../server/api.js';
import { createMemoryStore } from '../../server/memoryStore.js';
import { seed, ensureDefaults } from '../../server/seed.js';
import { SCHEMA } from '../../server/core.js';
import { Sync, type SyncStatus } from './sync';

const TABLES = Object.keys(SCHEMA);
const LOCAL_KEY = 'pm.localdb.v1';
// Geräteübergreifend eindeutige IDs (bleiben unter 2^53)
const idFactory = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

const store: any = createMemoryStore({ idFactory });
const sync = new Sync(store, TABLES);
let readyPromise: Promise<{ empty: boolean; synced: boolean }> | null = null;
let statusListeners: ((s: SyncStatus) => void)[] = [];
sync.onStatus = (s) => statusListeners.forEach((f) => f(s));
sync.onRemoteChange = () => window.dispatchEvent(new Event('pm:data-changed'));

export const onSyncStatus = (f: (s: SyncStatus) => void) => {
  statusListeners.push(f);
  f(sync.status);
  return () => { statusListeners = statusListeners.filter((x) => x !== f); };
};

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const t of TABLES) for (const r of data[t] || []) store.applyRemote(t, r.id, r);
    store.applyRemoteSettings(data.settings || {});
  } catch { /* kein lokaler Stand */ }
}
let saveLocalTimer: number | undefined;
function saveLocal() {
  window.clearTimeout(saveLocalTimer);
  saveLocalTimer = window.setTimeout(() => {
    try {
      const out: Record<string, unknown> = { settings: store.settingsAll() };
      for (const t of TABLES) out[t] = store.allRows(t);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(out));
    } catch { /* Speicher nicht verfügbar */ }
  }, 500);
}

/** Startet die Verbindung (einmalig). */
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const synced = await sync.connect();
      if (!synced) loadLocal();
      const empty = store.allRows('employees').length === 0 && store.allRows('projects').length === 0;
      if (!empty && ensureDefaults(store)) afterWrite();
      return { empty: store.allRows('employees').length === 0 && store.allRows('projects').length === 0, synced };
    })();
  }
  return readyPromise;
}

function afterWrite() {
  if (sync.connected) sync.collectLocalChanges();
  else { store.takeChanges(); saveLocal(); }
}

/** Entspricht einem HTTP-Aufruf an den Server. */
export async function localRequest(method: string, url: string, body?: unknown): Promise<unknown> {
  await ready();
  const u = new URL(url, 'http://local');
  if (u.pathname === '/api/auth/me') return { mode: 'none', user: null, error: null, adminLogin: false };
  const query = Object.fromEntries(u.searchParams);
  try {
    const result = handle(store, method, u.pathname, query, body ? structuredClone(body) : undefined);
    if (method !== 'GET') afterWrite();
    return result === undefined ? null : structuredClone(result);
  } catch (e: any) {
    store.takeChanges(); // fehlgeschlagene Transaktion wurde zurückgerollt
    throw Object.assign(new Error(e?.message || 'Fehler'), { status: e?.status || 500 });
  }
}

/** Legt die Beispieldaten an (alle Termine relativ zu heute). */
export async function seedDemo() {
  await ready();
  store.transaction(() => seed(store));
  afterWrite();
}

/** Löscht den gesamten Datenbestand (alle Geräte). */
export async function resetAll() {
  await ready();
  store.transaction(() => {
    for (const t of TABLES) for (const r of store.allRows(t)) store.remove(t, r.id);
  });
  afterWrite();
}

export const syncBusy = () => sync.busy;
export type { SyncStatus };
