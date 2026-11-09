// In-Memory-Speicher mit Änderungsprotokoll – für den Betrieb im Browser.
// Gleiche Schnittstelle wie der SQLite-Speicher (siehe core.js). Jede Änderung wird als
// „tabelle:id“ protokolliert, damit eine Synchronisationsschicht sie weitergeben kann.
import { SCHEMA, pickColumns, rowToObject } from './core.js';

/**
 * @param {{ idFactory?: () => number }} [opts] – eindeutige IDs über Geräte hinweg
 */
export function createMemoryStore(opts = {}) {
  const tables = new Map(Object.keys(SCHEMA).map((t) => [t, new Map()]));
  let settings = {};
  let seq = 0;
  const changes = new Set();
  let journal = null; // Rückgängig-Informationen während einer Transaktion

  const nextId = (table) => {
    if (opts.idFactory) {
      let id;
      do { id = opts.idFactory(); } while (tables.get(table).has(id));
      return id;
    }
    seq = Math.max(seq, ...tables.get(table).keys(), 0) + 1;
    return seq;
  };
  const normalize = (table, id, data) => rowToObject(table, { id, ...pickColumns(table, data) });
  const remember = (table, id) => {
    changes.add(`${table}:${id}`);
    if (journal && !journal.has(`${table}:${id}`)) journal.set(`${table}:${id}`, tables.get(table).get(id) ?? null);
  };
  const clone = (row) => (row ? structuredClone(row) : null);

  const store = {
    kind: 'memory',
    list(table, where = {}) {
      const keys = Object.keys(where).filter((k) => k in SCHEMA[table] || k === 'id');
      const out = [];
      for (const row of tables.get(table).values()) {
        if (keys.every((k) => String(row[k]) === String(where[k]))) out.push(clone(row));
      }
      return out.sort((a, b) => a.id - b.id);
    },
    get(table, id) {
      return clone(tables.get(table).get(Number(id)));
    },
    insert(table, data) {
      const id = data.id !== undefined && data.id !== null ? Number(data.id) : nextId(table);
      remember(table, id);
      tables.get(table).set(id, normalize(table, id, data));
      return store.get(table, id);
    },
    update(table, id, data) {
      const cur = tables.get(table).get(Number(id));
      if (!cur) return null;
      remember(table, Number(id));
      const merged = normalize(table, Number(id), { ...cur, ...data });
      tables.get(table).set(Number(id), merged);
      return clone(merged);
    },
    remove(table, id) {
      if (!tables.get(table).has(Number(id))) return false;
      remember(table, Number(id));
      tables.get(table).delete(Number(id));
      return true;
    },
    transaction(fn) {
      if (journal) return fn();
      journal = new Map();
      const settingsBefore = { ...settings };
      try {
        const r = fn();
        journal = null;
        return r;
      } catch (err) {
        for (const [key, prev] of journal) {
          const [table, id] = key.split(':');
          if (prev) tables.get(table).set(Number(id), prev);
          else tables.get(table).delete(Number(id));
        }
        settings = settingsBefore;
        journal = null;
        throw err;
      }
    },
    settingsAll() {
      return structuredClone(settings);
    },
    settingSet(key, value) {
      settings[key] = structuredClone(value);
      changes.add('settings:main');
    },

    // ---------------------------------------------------- für die Synchronisation
    /** Liefert und leert die seit dem letzten Aufruf geänderten Schlüssel („tabelle:id“). */
    takeChanges() {
      const out = [...changes];
      changes.clear();
      return out;
    },
    /** Zeile direkt setzen/entfernen, ohne Änderungsprotokoll (für eingehende Daten). */
    applyRemote(table, id, row) {
      if (row) tables.get(table).set(Number(id), normalize(table, Number(id), row));
      else tables.get(table).delete(Number(id));
    },
    applyRemoteSettings(obj) {
      settings = structuredClone(obj || {});
    },
    rawRow(table, id) {
      return tables.get(table).get(Number(id)) || null;
    },
    allRows(table) {
      return [...tables.get(table).values()];
    },
    clearAll() {
      for (const t of tables.values()) t.clear();
      settings = {};
    },
  };
  return store;
}
