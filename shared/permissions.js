// Zugriffsrechte und Standardrollen (gemeinsam für Server und Oberfläche).
// Ohne besonderes Recht darf jede angemeldete Person: Projekte, Termine und Aufgaben ansehen,
// eigene Zeiten und Arbeitszeiten erfassen, eigene Abwesenheiten beantragen.

export const PERMISSION_GROUPS = [
  {
    group: 'Projekte',
    items: [
      ['projects.edit', 'Projekte anlegen und Stammdaten bearbeiten'],
      ['projects.delete', 'Projekte löschen'],
      ['schedule.edit', 'Terminplan, Leistungsphasen und Meilensteine ändern'],
      ['tasks.edit', 'Aufgaben anlegen, zuweisen und bearbeiten'],
      ['protocols.edit', 'Protokolle anlegen und bearbeiten'],
    ],
  },
  {
    group: 'Ressourcen & Personal',
    items: [
      ['resources.edit', 'Ressourcenplanung (Wochenstunden) ändern'],
      ['employees.edit', 'Mitarbeiterdaten bearbeiten und Rollen zuweisen'],
      ['absences.approve', 'Abwesenheiten genehmigen und für andere eintragen'],
      ['absences.details', 'Abwesenheitsgründe anderer sehen (z. B. Krankheit)'],
    ],
  },
  {
    group: 'Zeiterfassung',
    items: [
      ['time.all', 'Projektzeiten und Arbeitszeiten anderer einsehen und erfassen'],
      ['worktime.approve', 'Arbeitszeiten freigeben und abgeschlossene Monate wieder öffnen'],
      ['abacus.export', 'Daten an Abacus übergeben (Export)'],
    ],
  },
  {
    group: 'Finanzen',
    items: [
      ['costs.view', 'Kosten, Controlling und Stundensätze einsehen'],
      ['costs.edit', 'Fremdkosten erfassen'],
      ['offers.view', 'Angebote und Arbeitspaket-Controlling einsehen'],
      ['offers.edit', 'Angebote erstellen, versenden und beauftragen'],
      ['invoices.view', 'Rechnungen einsehen'],
      ['invoices.edit', 'Rechnungen erstellen, stellen und stornieren'],
    ],
  },
  {
    group: 'Verwaltung',
    items: [
      ['settings.edit', 'Einstellungen und Schnittstellen konfigurieren'],
      ['roles.edit', 'Rollen und Rechte verwalten'],
      ['data.export', 'Gesamtdatenexport (Datensicherung)'],
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k));
export const PERMISSION_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items));

export const DEFAULT_ROLES = [
  { key: 'admin', name: 'Administration', description: 'Alle Rechte. Kann nicht eingeschränkt werden.', permissions: ALL_PERMISSIONS, system: true },
  {
    key: 'leitung', name: 'Projektleitung', description: 'Steuert Projekte, Termine, Personal und Rechnungen.', system: true,
    permissions: ['projects.edit', 'schedule.edit', 'tasks.edit', 'protocols.edit', 'resources.edit', 'absences.approve', 'absences.details', 'time.all', 'worktime.approve', 'costs.view', 'costs.edit', 'offers.view', 'offers.edit', 'invoices.view', 'invoices.edit'],
  },
  {
    key: 'controlling', name: 'Controlling / Buchhaltung', description: 'Finanzen, Arbeitszeitfreigabe und Abacus-Übergabe.', system: false,
    permissions: ['tasks.edit', 'protocols.edit', 'absences.approve', 'absences.details', 'time.all', 'worktime.approve', 'abacus.export', 'costs.view', 'costs.edit', 'offers.view', 'offers.edit', 'invoices.view', 'invoices.edit'],
  },
  { key: 'mitarbeiter', name: 'Mitarbeiter/in', description: 'Bearbeitet Aufgaben und Protokolle, erfasst eigene Zeiten.', system: true, permissions: ['tasks.edit', 'protocols.edit'] },
  { key: 'extern', name: 'Werkstudent/in / Extern', description: 'Sieht Projekte, erfasst nur eigene Zeiten.', system: false, permissions: [] },
];

/** Rechte eines Benutzers aus der Rollenliste ermitteln. */
export function permissionsFor(roleKey, roles) {
  if (roleKey === 'admin') return [...ALL_PERMISSIONS];
  const r = (roles || []).find((x) => x.key === roleKey) || DEFAULT_ROLES.find((x) => x.key === roleKey);
  return r ? r.permissions.filter((p) => ALL_PERMISSIONS.includes(p)) : [];
}
