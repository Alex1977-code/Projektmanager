import type { ID, Participant, Protocol, ProtocolItem, Task } from '../types';

export const newItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Nummerierung: TOPs 1, 2, 3 … – Punkte darunter 1.1, 1.2 … */
export function itemNumbers(items: ProtocolItem[]): Map<string, string> {
  const m = new Map<string, string>();
  let top = 0;
  let sub = 0;
  for (const it of items) {
    if (it.kind === 'top') {
      top += 1;
      sub = 0;
      m.set(it.id, String(top));
    } else {
      sub += 1;
      m.set(it.id, top ? `${top}.${sub}` : String(sub));
    }
  }
  return m;
}

export function isItemOpen(it: ProtocolItem, tasksById: Map<ID, Task>): boolean {
  if (it.kind !== 'A' || it.done) return false;
  if (it.taskId) {
    const t = tasksById.get(it.taskId);
    if (t) return t.status !== 'erledigt';
  }
  return true;
}

export interface OpenPoint { protocol: Protocol; item: ProtocolItem; label: string }

/** Offene A-Punkte; in Folgeprotokolle übernommene Punkte zählen nur in der neuesten Fassung. */
export function openPoints(protocols: Protocol[], tasksById: Map<ID, Task>): OpenPoint[] {
  const superseded = new Set<string>();
  for (const p of protocols) for (const it of p.items) if (it.carriedFrom) superseded.add(it.carriedFrom);
  const out: OpenPoint[] = [];
  for (const p of protocols) {
    const nums = itemNumbers(p.items);
    for (const it of p.items) {
      if (superseded.has(it.id) || !isItemOpen(it, tasksById)) continue;
      out.push({ protocol: p, item: it, label: nums.get(it.id) || '' });
    }
  }
  return out.sort((a, b) => (a.item.dueDate || '9').localeCompare(b.item.dueDate || '9'));
}

const AGENDA: Record<string, string[]> = {
  Planungsbesprechung: ['Protokoll der letzten Besprechung', 'Stand der Planung', 'Technische Klärungen', 'Termine', 'Verschiedenes'],
  Baubesprechung: ['Protokoll der letzten Besprechung', 'Bauablauf und Termine', 'Technische Klärungen', 'Qualität und Mängel', 'Nachträge und Kosten', 'Arbeitssicherheit', 'Verschiedenes'],
  'Jour fixe': ['Aktueller Stand', 'Termine', 'Verschiedenes'],
  'Werksabnahme / FAT': ['Prüfumfang und Prüfgrundlagen', 'Prüfergebnisse', 'Mängel und Restpunkte', 'Freigabe'],
  Abnahme: ['Abnahmegegenstand', 'Festgestellte Mängel', 'Restleistungen', 'Abnahmeerklärung und Vorbehalte', 'Gewährleistung'],
  Ortstermin: ['Anlass', 'Feststellungen vor Ort', 'Vereinbarungen'],
  'Interne Besprechung': ['Stand', 'Aufgabenverteilung', 'Termine'],
  Telefonnotiz: ['Gesprächsinhalt'],
};

/** Startinhalt eines neuen Protokolls: Tagesordnung + optional offene Punkte des Vorgängers. */
export function initialItems(type: string, previous: Protocol | null, carry: boolean, tasksById: Map<ID, Task>): ProtocolItem[] {
  const items: ProtocolItem[] = [];
  const open = previous && carry ? previous.items.filter((it) => isItemOpen(it, tasksById)) : [];
  if (open.length && previous) {
    items.push({ id: newItemId(), kind: 'top', text: `Offene Punkte aus Protokoll Nr. ${previous.number}` });
    for (const it of open) items.push({ ...it, id: newItemId(), carriedFrom: it.id, done: false });
  }
  for (const t of AGENDA[type] || AGENDA.Planungsbesprechung) {
    if (open.length && t === 'Protokoll der letzten Besprechung') continue;
    items.push({ id: newItemId(), kind: 'top', text: t });
  }
  return items;
}

export function participantName(p: Participant, nameOf: (id: ID) => string | undefined) {
  return p.employeeId ? nameOf(p.employeeId) || 'unbekannt' : p.name || '';
}
