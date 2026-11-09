// Angebote (angebotene Leistungen), Arbeitspakete und Druckvorlagen-Dateien.
import { list, get, insert, update, remove, transaction, getSettings, updateWhere } from './core.js';
import { ApiError } from './errors.js';
import { migrateAccounting } from './accounting.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/**
 * Nächste Nummer eines Nummernkreises, z. B. „RE-{JJJJ}-{NNN}“ → RE-2026-014.
 * Gezählt wird je Jahr; kommt kein Jahr im Format vor, läuft die Nummer durch.
 */
export function nextNumber(format, date, existing) {
  const fmt = /\{N+\}/.test(format || '') ? format : `${format || ''}{NNN}`;
  const year = String(date || today()).slice(0, 4);
  const digits = fmt.match(/\{(N+)\}/)[1].length;
  const fill = (s) => s.replace(/\{JJJJ\}/g, year).replace(/\{JJ\}/g, year.slice(2));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [head, tail] = fmt.split(/\{N+\}/);
  const re = new RegExp(`^${esc(fill(head))}(\\d+)${esc(fill(tail || ''))}$`);
  let max = 0;
  for (const n of existing) { const m = re.exec(String(n || '')); if (m) max = Math.max(max, Number(m[1])); }
  return `${fill(head)}${String(max + 1).padStart(digits, '0')}${fill(tail || '')}`;
}

/** Summen eines Angebots. Bedarfspositionen (optional) zählen nicht zur Angebotssumme. */
export function computeOffer(o) {
  const positions = (Array.isArray(o.positions) ? o.positions : []).map((p, i) => {
    const mode = p.mode === 'aufwand' ? 'aufwand' : 'pauschal';
    const hours = Math.max(0, num(p.hours));
    const rate = Math.max(0, num(p.rate));
    const amount = mode === 'aufwand' ? r2(hours * rate) : r2(p.amount);
    return {
      key: String(p.key || `p${i + 1}`), title: String(p.title || ''), description: String(p.description || ''),
      phaseCode: String(p.phaseCode || ''), mode, hours, rate, amount, optional: !!p.optional,
    };
  });
  const firm = positions.filter((p) => !p.optional);
  const subtotal = r2(firm.reduce((s, p) => s + p.amount, 0));
  const optionalTotal = r2(positions.filter((p) => p.optional).reduce((s, p) => s + p.amount, 0));
  const nkPct = num(o.nkPct);
  const discountPct = num(o.discountPct);
  const vatPct = num(o.vatPct);
  const nk = r2((subtotal * nkPct) / 100);
  const discount = r2(((subtotal + nk) * discountPct) / 100);
  const net = r2(subtotal + nk - discount);
  const vat = r2((net * vatPct) / 100);
  return { positions, nkPct, discountPct, vatPct, subtotal, optionalTotal, nk, discount, net, vat, gross: r2(net + vat), hours: r2(firm.reduce((s, p) => s + p.hours, 0)) };
}

const OFFER_STATUS = ['entwurf', 'versendet', 'beauftragt', 'abgelehnt'];
const FROZEN_EDITABLE = ['status', 'note', 'decidedAt', 'validUntil'];

export function handleOffers(db, method, idOrAction, body, user, validate, can) {
  if (!can('offers.view')) throw new ApiError(403, 'Keine Berechtigung, Angebote einzusehen.');
  const id = idOrAction && /^\d+$/.test(String(idOrAction)) ? Number(idOrAction) : null;
  if (method === 'GET') {
    if (!id) return list(db, 'offers');
    const row = get(db, 'offers', id);
    if (!row) throw new ApiError(404, 'Angebot nicht gefunden');
    return row;
  }
  if (!can('offers.edit')) throw new ApiError(403, 'Keine Berechtigung, Angebote zu bearbeiten.');
  const settings = getSettings(db);

  // Beauftragung: Status setzen, Arbeitspakete aus den Positionen anlegen, Projekt übernehmen
  if (method === 'POST' && idOrAction === 'accept') {
    const offer = get(db, 'offers', Number(body?.id));
    if (!offer) throw new ApiError(404, 'Angebot nicht gefunden');
    if (offer.status === 'entwurf') throw new ApiError(409, 'Das Angebot wurde noch nicht versendet.');
    return transaction(db, () => {
      const saved = update(db, 'offers', offer.id, { status: 'beauftragt', decidedAt: body.decidedAt || today() });
      const project = get(db, 'projects', offer.projectId);
      const created = [];
      if (body.createWorkPackages !== false) {
        const phases = list(db, 'phases', { projectId: offer.projectId });
        const existing = list(db, 'workPackages', { projectId: offer.projectId });
        let n = existing.length;
        for (const p of offer.positions || []) {
          if (p.optional && !body.includeOptional) continue;
          if (existing.some((w) => w.offerId === offer.id && w.positionKey === p.key)) continue;
          n += 1;
          const phase = phases.find((ph) => ph.code && ph.code === p.phaseCode);
          created.push(insert(db, 'workPackages', {
            projectId: offer.projectId, offerId: offer.id, positionKey: p.key, code: `AP ${n}`, title: p.title, description: p.description,
            phaseId: phase?.id ?? null, responsibleId: project?.leadId ?? null, plannedHours: p.hours || 0, budget: p.amount || 0,
            startDate: phase?.startDate ?? null, endDate: phase?.endDate ?? null, status: 'geplant', progress: 0, sort: n,
          }));
        }
      }
      let projectPatch = null;
      if (project) {
        projectPatch = {};
        if (body.setBudget) projectPatch.budget = offer.net;
        if (project.status === 'Akquise') projectPatch.status = 'Beauftragt';
        if (Object.keys(projectPatch).length) update(db, 'projects', project.id, projectPatch);
      }
      return { offer: saved, workPackages: created, project: projectPatch };
    });
  }

  if (method === 'POST' && !idOrAction) {
    validate('offers', body, false);
    const base = {
      revision: 0, title: '', recipient: '', contact: '', intro: settings.offerIntro, closing: settings.offerClosing,
      nkPct: settings.nkPct, discountPct: 0, vatPct: settings.vatPct, note: '', positions: [],
      validUntil: addDays(body.date, Number(settings.offerValidDays) || 60),
      ...body, status: 'entwurf', offerNo: null, sentAt: null, decidedAt: null, createdBy: user.employeeId ?? body.createdBy ?? null,
    };
    return insert(db, 'offers', { ...base, ...computeOffer(base) });
  }

  if (!id) throw new ApiError(405, 'Methode nicht erlaubt');
  const current = get(db, 'offers', id);
  if (!current) throw new ApiError(404, 'Angebot nicht gefunden');

  if (method === 'PUT' || method === 'PATCH') {
    if (body.status && !OFFER_STATUS.includes(body.status)) throw new ApiError(400, 'Unbekannter Status');
    if (current.status !== 'entwurf') {
      // versendete Angebote sind festgeschrieben – Änderungen über „Neue Fassung“
      const patch = Object.fromEntries(Object.entries(body).filter(([k]) => FROZEN_EDITABLE.includes(k)));
      if (patch.status === 'entwurf') throw new ApiError(409, 'Ein versendetes Angebot kann nicht zurück in den Entwurf. Bitte eine neue Fassung anlegen.');
      if (patch.status && patch.status !== current.status && patch.status !== 'versendet' && !patch.decidedAt) patch.decidedAt = today();
      if (patch.status === 'versendet') patch.decidedAt = null;
      return update(db, 'offers', id, patch);
    }
    const merged = { ...current, ...body };
    const patch = { ...body, ...computeOffer(merged) };
    if (body.status === 'versendet') {
      if (!merged.positions?.length) throw new ApiError(400, 'Das Angebot enthält noch keine Positionen.');
      patch.offerNo = current.offerNo || nextNumber(settings.offerNoFormat, merged.date, list(db, 'offers').map((o) => o.offerNo));
      patch.sentAt = today();
    } else if (body.status && body.status !== 'entwurf') {
      throw new ApiError(409, 'Das Angebot muss zuerst versendet werden.');
    }
    return update(db, 'offers', id, patch);
  }

  if (method === 'DELETE') {
    if (current.status !== 'entwurf' && current.status !== 'abgelehnt') throw new ApiError(409, 'Versendete und beauftragte Angebote können nicht gelöscht werden.');
    return transaction(db, () => {
      updateWhere(db, 'workPackages', (w) => w.offerId === id, { offerId: null, positionKey: null });
      remove(db, 'offers', id);
      return { deleted: true };
    });
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

/** Arbeitspakete: lesen dürfen alle, ändern mit Projektrecht. */
export function handleWorkPackages(db, method, id, query, body, validate, can) {
  if (method === 'GET') {
    if (id) { const row = get(db, 'workPackages', id); if (!row) throw new ApiError(404, 'Arbeitspaket nicht gefunden'); return row; }
    return list(db, 'workPackages', query.projectId ? { projectId: Number(query.projectId) } : {});
  }
  if (!can('projects.edit')) throw new ApiError(403, 'Keine Berechtigung, Arbeitspakete zu bearbeiten.');
  if (method === 'POST' && !id) {
    validate('workPackages', body, false);
    const siblings = list(db, 'workPackages', { projectId: Number(body.projectId) });
    const n = siblings.length + 1;
    return insert(db, 'workPackages', { status: 'geplant', progress: 0, plannedHours: 0, budget: 0, code: `AP ${n}`, sort: Math.max(0, ...siblings.map((w) => w.sort || 0)) + 1, ...body });
  }
  if (!id || !get(db, 'workPackages', id)) throw new ApiError(404, 'Arbeitspaket nicht gefunden');
  if (method === 'PUT' || method === 'PATCH') {
    const patch = { ...body };
    if (patch.progress !== undefined) patch.progress = Math.max(0, Math.min(100, num(patch.progress)));
    if (patch.progress === 100 && !patch.status) patch.status = 'abgeschlossen';
    return update(db, 'workPackages', id, patch);
  }
  if (method === 'DELETE') {
    return transaction(db, () => {
      for (const t of ['tasks', 'timeEntries']) updateWhere(db, t, (r) => r.workPackageId === id, { workPackageId: null });
      remove(db, 'workPackages', id);
      return { deleted: true };
    });
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

/** Dateien der Druckvorlage (Briefbogen). Je Schlüssel genau ein Eintrag. */
const ASSET_KEYS = ['frameFirst', 'frameNext', 'logo'];
export function handleAssets(db, method, key, body, can) {
  if (method === 'GET') return list(db, 'assets');
  if (!can('settings.edit')) throw new ApiError(403, 'Keine Berechtigung, Druckvorlagen zu ändern.');
  if (!ASSET_KEYS.includes(key)) throw new ApiError(400, 'Unbekannte Vorlagendatei');
  const rows = list(db, 'assets').filter((a) => a.key === key);
  if (method === 'PUT' || method === 'POST') {
    const data = String(body?.data || '');
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data)) throw new ApiError(400, 'Bitte ein Bild (PNG oder JPEG) hochladen.');
    if (data.length > 240000) throw new ApiError(413, 'Das Bild ist zu groß (max. ca. 175 KB nach Verkleinerung).');
    return transaction(db, () => {
      for (const r of rows.slice(1)) remove(db, 'assets', r.id);
      const row = { key, name: String(body.name || key).slice(0, 120), mime: data.slice(5, data.indexOf(';')), data, updatedAt: new Date().toISOString() };
      return rows[0] ? update(db, 'assets', rows[0].id, row) : insert(db, 'assets', row);
    });
  }
  if (method === 'DELETE') {
    for (const r of rows) remove(db, 'assets', r.id);
    return { deleted: true };
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

/** Einmalige Anpassung bestehender Datenbanken: neue Rechte an die Standardrollen geben. */
export function migrateData(db) {
  const level = Number(getSettings(db).dataLevel) || 0;
  if (level >= 2) return false;
  if (level < 1) {
    for (const r of list(db, 'roles')) {
      if ((r.key === 'leitung' || r.key === 'controlling') && Array.isArray(r.permissions) && r.permissions.includes('invoices.view') && !r.permissions.includes('offers.view')) {
        update(db, 'roles', r.id, { permissions: [...r.permissions, 'offers.view', 'offers.edit'] });
      }
    }
  }
  migrateAccounting(db);
  db.settingSet('dataLevel', 2);
  return true;
}
