// Synchronisation des In-Memory-Speichers mit der gemeinsamen Datenbank der veröffentlichten Seite.
//
// Ablage: je Tabelle eine Sammlung „pm_<tabelle>“. Kleine Tabellen speichern eine Zeile je Dokument.
// Zeitbuchungen und Wochenplanung werden je Person und Quartal gebündelt (sonst wüchse die Zahl der
// Dokumente schnell über die Grenze von 25.000). Jedes Dokument hat die Form { rows: { <id>: zeile } }.
// Eingehende Änderungen anderer Geräte werden live übernommen; eigene, noch nicht gespeicherte Zeilen
// haben dabei Vorrang, damit nichts verloren geht.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any> & { id: number };
type MemoryStore = {
  takeChanges(): string[];
  applyRemote(table: string, id: number, row: Row | null): void;
  applyRemoteSettings(obj: Record<string, unknown>): void;
  rawRow(table: string, id: number): Row | null;
  allRows(table: string): Row[];
  settingsAll(): Record<string, unknown>;
};

export type SyncStatus =
  | { state: 'connecting' }
  | { state: 'synced' }
  | { state: 'saving'; pending: number; total?: number }
  | { state: 'local'; reason: string } // keine gemeinsame Datenbank verfügbar
  | { state: 'readonly' }
  | { state: 'error'; message: string };

const quarter = (iso: string) => `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
const BUCKETED: Record<string, (r: Row) => string> = {
  timeEntries: (r) => `${r.employeeId}_${quarter(String(r.date || '0000-01'))}`,
  allocations: (r) => `${r.employeeId}_${quarter(String(r.weekStart || '0000-01'))}`,
};
const bucketOf = (table: string, row: Row) => (BUCKETED[table] ? BUCKETED[table](row) : String(row.id));

export class Sync {
  private db: any = null;
  private store: MemoryStore;
  private tables: string[];
  private rowBucket = new Map<string, string>(); // "tabelle:id" → Dokumentschlüssel
  private dirty = new Map<string, number>(); // "tabelle|schlüssel" → Version
  private pendingRows = new Map<string, Set<number>>(); // ungespeicherte eigene Zeilen je Dokument
  private inFlight = new Set<string>();
  private flushTimer: number | undefined;
  private notifyTimer: number | undefined;
  private version = 0;
  private total = 0;
  private unsubs: (() => void)[] = [];
  status: SyncStatus = { state: 'connecting' };
  onRemoteChange: () => void = () => {};
  onStatus: (s: SyncStatus) => void = () => {};

  constructor(store: MemoryStore, tables: string[]) {
    this.store = store;
    this.tables = tables;
  }

  private setStatus(s: SyncStatus) {
    this.status = s;
    this.onStatus(s);
  }

  /** Verbindet sich mit der gemeinsamen Datenbank und lädt den Bestand. Liefert false ohne Datenbank. */
  async connect(): Promise<boolean> {
    const claude = (window as any).claude;
    this.db = claude?.use ? await claude.use('db').catch(() => null) : null;
    if (!this.db) {
      this.setStatus({ state: 'local', reason: 'Keine gemeinsame Datenbank – Daten bleiben nur in diesem Browser.' });
      return false;
    }
    const pending = new Set([...this.tables, 'settings']);
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 12000);
      const done = (name: string) => {
        pending.delete(name);
        if (!pending.size) { window.clearTimeout(timer); resolve(); }
      };
      for (const table of this.tables) {
        const unsub = this.db.collection(`pm_${table}`).onSnapshot(
          (snap: any) => {
            for (const ch of snap.docChanges()) this.applyBucket(table, ch.doc.id, ch.type === 'removed' ? null : ch.doc.data());
            if (!snap.metadata.fromCache) done(table);
            this.scheduleNotify();
          },
          (e: any) => { this.handleError(e); done(table); },
        );
        this.unsubs.push(unsub);
      }
      const unsubS = this.db.doc('pm_settings/main').onSnapshot(
        (snap: any) => {
          if (snap.exists && !this.dirty.has('settings|main')) this.store.applyRemoteSettings((snap.data()?.settings as Record<string, unknown>) || {});
          if (!snap.metadata.fromCache) done('settings');
          this.scheduleNotify();
        },
        (e: any) => { this.handleError(e); done('settings'); },
      );
      this.unsubs.push(unsubS);
    });
    if (this.status.state === 'connecting') this.setStatus({ state: 'synced' });
    return true;
  }

  private handleError(e: any) {
    if (e?.code === 'revoked' || e?.code === 'not_granted') this.setStatus({ state: 'error', message: 'Der Zugriff auf die gemeinsamen Daten wurde entzogen.' });
    else if (e?.code === 'resource_exhausted') this.setStatus({ state: 'error', message: 'Zu viele gleichzeitige Verbindungen. Bitte Seite neu laden.' });
  }

  get connected() {
    return !!this.db;
  }

  /** Eingehendes Dokument übernehmen (eigene ungespeicherte Zeilen bleiben erhalten). */
  private applyBucket(table: string, key: string, body: any) {
    const protect = this.pendingRows.get(`${table}|${key}`) || new Set<number>();
    const incoming: Record<string, Row> = body?.rows || {};
    const keep = new Set(Object.keys(incoming).map(Number));
    // Zeilen, die zu diesem Dokument gehörten und dort nicht mehr vorkommen, entfernen
    const current = BUCKETED[table]
      ? this.store.allRows(table).filter((r) => this.rowBucket.get(`${table}:${r.id}`) === key || bucketOf(table, r) === key).map((r) => r.id)
      : this.store.rawRow(table, Number(key)) ? [Number(key)] : [];
    for (const id of current) {
      if (!keep.has(id) && !protect.has(id)) {
        this.store.applyRemote(table, id, null);
        this.rowBucket.delete(`${table}:${id}`);
      }
    }
    for (const [idStr, row] of Object.entries(incoming)) {
      const id = Number(idStr);
      if (protect.has(id)) continue;
      this.store.applyRemote(table, id, { ...row, id });
      this.rowBucket.set(`${table}:${id}`, key);
    }
  }

  private scheduleNotify() {
    window.clearTimeout(this.notifyTimer);
    this.notifyTimer = window.setTimeout(() => this.onRemoteChange(), 250);
  }

  /** Nach jeder lokalen Änderung aufrufen: merkt betroffene Dokumente vor und speichert verzögert. */
  collectLocalChanges() {
    const keys = this.store.takeChanges();
    if (!keys.length) return;
    for (const k of keys) {
      const [table, idStr] = k.split(':');
      if (table === 'settings') { this.markDirty('settings', 'main'); continue; }
      const id = Number(idStr);
      const row = this.store.rawRow(table, id);
      const oldKey = this.rowBucket.get(k);
      const newKey = row ? bucketOf(table, row) : oldKey;
      for (const bk of new Set([oldKey, newKey].filter(Boolean) as string[])) {
        this.markDirty(table, bk);
        const pk = `${table}|${bk}`;
        if (!this.pendingRows.has(pk)) this.pendingRows.set(pk, new Set());
        this.pendingRows.get(pk)!.add(id);
      }
      if (row && newKey) this.rowBucket.set(k, newKey);
      else this.rowBucket.delete(k);
    }
    if (!this.db) return;
    this.total = Math.max(this.total, this.dirty.size);
    this.setStatus({ state: 'saving', pending: this.dirty.size, total: this.total });
    window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => this.flush(), 350);
  }

  private markDirty(table: string, key: string) {
    this.dirty.set(`${table}|${key}`, ++this.version);
  }

  private bodyOf(table: string, key: string) {
    if (table === 'settings') return { settings: this.store.settingsAll() };
    const rows: Record<string, Row> = {};
    if (BUCKETED[table]) {
      for (const r of this.store.allRows(table)) if (bucketOf(table, r) === key) rows[r.id] = r;
    } else {
      const r = this.store.rawRow(table, Number(key));
      if (r) rows[r.id] = r;
    }
    return Object.keys(rows).length ? { rows } : null;
  }

  private async flush() {
    if (!this.db) return;
    const CONCURRENCY = 6;
    const work = () => [...this.dirty.entries()].filter(([k]) => !this.inFlight.has(k));
    const runOne = async ([pk, ver]: [string, number]) => {
      this.inFlight.add(pk);
      const [table, key] = pk.split('|');
      const ref = table === 'settings' ? this.db.doc('pm_settings/main') : this.db.collection(`pm_${table}`).doc(key);
      let attempt = 0;
      for (;;) {
        try {
          const body = this.bodyOf(table, key);
          if (body) await ref.set(body);
          else await ref.delete();
          break;
        } catch (e: any) {
          attempt++;
          const code = e?.code;
          if (code === 'invalid_argument') { this.setStatus({ state: 'readonly' }); this.dirty.clear(); this.inFlight.delete(pk); return; }
          if (code === 'quota_exceeded') { this.setStatus({ state: 'error', message: 'Der Speicher der gemeinsamen Datenbank ist voll.' }); this.inFlight.delete(pk); return; }
          if (attempt > 6 || code === 'revoked') { this.setStatus({ state: 'error', message: 'Änderungen konnten nicht gespeichert werden. Bitte Seite neu laden.' }); this.inFlight.delete(pk); return; }
          await new Promise((r) => setTimeout(r, (code === 'resource_exhausted' ? 1500 : 400) * attempt + Math.random() * 300));
        }
      }
      this.inFlight.delete(pk);
      if (this.dirty.get(pk) === ver) {
        this.dirty.delete(pk);
        this.pendingRows.delete(pk);
      }
    };
    let batch = work();
    while (batch.length) {
      const slice = batch.slice(0, CONCURRENCY);
      await Promise.all(slice.map(runOne));
      if (this.status.state === 'readonly' || this.status.state === 'error') return;
      this.setStatus({ state: 'saving', pending: this.dirty.size, total: this.total });
      batch = work();
    }
    if (!this.dirty.size) {
      this.total = 0;
      this.setStatus({ state: 'synced' });
    }
  }

  /** Noch ungespeicherte Änderungen? */
  get busy() {
    return this.dirty.size > 0 || this.inFlight.size > 0;
  }

  disconnect() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}
