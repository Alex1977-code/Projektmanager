export type ID = number;

export interface Employee {
  id: ID;
  name: string;
  short: string;
  title: string | null;
  role: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  hourlyRate: number | null;
  weeklyHours: number | null;
  skills: string[];
  color: string | null;
  active: boolean;
  login: string | null;
  appRole: Role | null;
  vacationDays: number | null;
  personnelNo: string | null;
}

export type Role = string;
export const ROLE_LABEL: Record<string, string> = { admin: 'Administration', leitung: 'Projektleitung', controlling: 'Controlling / Buchhaltung', mitarbeiter: 'Mitarbeiter/in', extern: 'Werkstudent/in / Extern' };

export interface RoleDef {
  id: ID;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  system: boolean;
  sort: number | null;
}

export interface Worktime {
  id: ID;
  employeeId: ID;
  date: string;
  start: string | null;
  end: string | null;
  breakMin: number | null;
  location: string | null;
  note: string | null;
}

export type MonthStatus = 'offen' | 'eingereicht' | 'freigegeben';
export interface WorktimeMonth {
  id: ID;
  employeeId: ID;
  month: string;
  status: MonthStatus;
  submittedAt: string | null;
  approvedBy: ID | null;
  approvedAt: string | null;
  exportedAt: string | null;
  note: string | null;
}

export interface AbacusColumn { key: string; header: string }
export interface AbacusConfig {
  mandant: string;
  separator: string;
  decimal: string;
  dateFormat: string;
  encoding: string;
  onlyApproved: boolean;
  defaultServiceType: string;
  serviceTypes: Record<string, string>;
  absenceCodes: Record<string, string>;
  leistungColumns: AbacusColumn[];
  arbeitszeitColumns: AbacusColumn[];
}

export const PROJECT_STATUS = ['Akquise', 'Beauftragt', 'In Bearbeitung', 'Pausiert', 'Abgeschlossen'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const PROJECT_TYPES = ['Schleuse', 'Wehr', 'Sperrwerk', 'Klappbrücke', 'Hubbrücke', 'Drehbrücke', 'Gutachten / Prüfung', 'Sonstiges'] as const;

export const PRIORITIES = ['hoch', 'mittel', 'niedrig'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Project {
  id: ID;
  number: string | null;
  name: string;
  client: string | null;
  type: string | null;
  location: string | null;
  leadId: ID | null;
  status: ProjectStatus;
  priority: Priority | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  description: string | null;
  color: string | null;
  extNo: string | null;
}

export interface Phase {
  id: ID;
  projectId: ID;
  code: string | null;
  name: string;
  startDate: string;
  endDate: string;
  budget: number | null;
  plannedHours: number | null;
  progress: number | null;
  sort: number | null;
}

export interface Milestone {
  id: ID;
  projectId: ID;
  name: string;
  date: string;
  done: boolean;
}

export const TASK_STATUS = ['offen', 'in_arbeit', 'pruefung', 'erledigt'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Bearbeitung',
  pruefung: 'In Prüfung',
  erledigt: 'Erledigt',
};

export interface Task {
  id: ID;
  projectId: ID;
  phaseId: ID | null;
  title: string;
  description: string | null;
  assigneeId: ID | null;
  status: TaskStatus;
  priority: Priority | null;
  estimatedHours: number | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
  sort: number | null;
  workPackageId?: ID | null;
}

export interface Allocation {
  id: ID;
  employeeId: ID;
  projectId: ID;
  weekStart: string;
  hours: number;
}

export interface TimeEntry {
  id: ID;
  employeeId: ID;
  projectId: ID;
  phaseId: ID | null;
  taskId: ID | null;
  workPackageId?: ID | null;
  date: string;
  hours: number;
  note: string | null;
}

export const COST_CATEGORIES = ['Fremdleistung', 'Prüfingenieur', 'Vermessung', 'Prüfung & Versuche', 'Reisekosten', 'Software / Lizenzen', 'Sonstiges'] as const;

export interface CostItem {
  id: ID;
  projectId: ID;
  phaseId: ID | null;
  date: string | null;
  category: string | null;
  description: string | null;
  amount: number;
  status: 'geplant' | 'angefallen';
}

export const PROTOCOL_TYPES = ['Planungsbesprechung', 'Baubesprechung', 'Jour fixe', 'Werksabnahme / FAT', 'Abnahme', 'Ortstermin', 'Interne Besprechung', 'Telefonnotiz'] as const;

/** top = Tagesordnungspunkt, I = Information, F = Festlegung, A = Aufgabe */
export type ProtocolItemKind = 'top' | 'I' | 'F' | 'A';
export const ITEM_KIND_LABEL: Record<ProtocolItemKind, string> = { top: 'TOP', I: 'Information', F: 'Festlegung', A: 'Aufgabe' };

export interface ProtocolItem {
  id: string;
  kind: ProtocolItemKind;
  text: string;
  assigneeId?: ID | null;
  responsible?: string | null; // externe Verantwortliche (z. B. „AG“, „AN Stahlbau“)
  dueDate?: string | null;
  taskId?: ID | null;
  done?: boolean;
  carriedFrom?: string | null; // ID des Punktes im Vorgängerprotokoll
}

export interface Participant {
  employeeId?: ID | null;
  name?: string;
  company?: string;
  present: boolean;
}

export interface Protocol {
  id: ID;
  projectId: ID;
  number: number;
  title: string | null;
  type: string | null;
  date: string;
  time: string | null;
  location: string | null;
  status: 'entwurf' | 'versendet';
  participants: Participant[];
  items: ProtocolItem[];
  nextDate: string | null;
  authorId: ID | null;
  createdAt: string | null;
}

export const ABSENCE_TYPES = ['Urlaub', 'Krankheit', 'Fortbildung', 'Gleitzeit', 'Sonderurlaub', 'Sonstiges'] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export interface Absence {
  id: ID;
  employeeId: ID | null; // null = alle (Betriebsruhe)
  type: AbsenceType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: 'beantragt' | 'genehmigt' | 'abgelehnt';
  note: string | null;
  createdBy: ID | null;
  decidedBy: ID | null;
}

export interface InvoiceLine {
  key: string;
  phaseId?: ID | null;
  label: string;
  fee: number;
  percent: number;
  amount?: number;
}

export type InvoiceStatus = 'entwurf' | 'gestellt' | 'bezahlt' | 'storniert';

export interface Invoice {
  id: ID;
  projectId: ID;
  number: number;
  invoiceNo: string | null;
  type: 'Abschlagsrechnung' | 'Schlussrechnung' | 'Teilschlussrechnung';
  date: string;
  periodEnd: string | null;
  lines: InvoiceLine[];
  nkPct: number;
  vatPct: number;
  performance: number;
  nk: number;
  cumulative: number;
  previousNet: number;
  net: number;
  vat: number;
  gross: number;
  status: InvoiceStatus;
  dueDate: string | null;
  paidDate: string | null;
  paidAmount: number | null;
  note: string | null;
  createdBy: ID | null;
}

export interface Settings {
  companyName: string;
  hoursPerDay: number;
  currency: string;
  state: string;
  companyAddress: string;
  bankDetails: string;
  taxId: string;
  nkPct: number;
  vatPct: number;
  paymentDays: number;
  abacus: AbacusConfig;
  companyPhone: string;
  companyEmail: string;
  companyWeb: string;
  managingDirectors: string;
  registerInfo: string;
  taxNumber: string;
  bankName: string;
  skontoPct: number;
  skontoDays: number;
  invoiceNoFormat: string;
  offerNoFormat: string;
  invoiceIntro: string;
  invoiceClosing: string;
  offerIntro: string;
  offerClosing: string;
  offerValidDays: number;
  offerRates: { label: string; rate: number }[];
  docFrame: DocFrame;
}

/** Standardrahmen für Angebote und Rechnungen (Maße in mm) */
export interface DocFrame {
  mode: 'generated' | 'image';
  accent: string;
  topFirst: number;
  topNext: number;
  bottom: number;
  left: number;
  right: number;
  foldMarks: boolean;
}

export interface Asset { id: ID; key: 'frameFirst' | 'frameNext' | 'logo'; name: string; mime: string; data: string; updatedAt: string }

export type OfferStatus = 'entwurf' | 'versendet' | 'beauftragt' | 'abgelehnt';
export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = { entwurf: 'Entwurf', versendet: 'Versendet', beauftragt: 'Beauftragt', abgelehnt: 'Abgelehnt' };

/** Angebotsposition = angebotene Leistung */
export interface OfferPosition {
  key: string;
  title: string;
  description: string;
  phaseCode: string;
  mode: 'pauschal' | 'aufwand';
  hours: number;
  rate: number;
  amount: number;
  optional: boolean;
}

export interface Offer {
  id: ID;
  projectId: ID;
  offerNo: string | null;
  revision: number;
  title: string;
  recipient: string;
  contact: string;
  date: string;
  validUntil: string | null;
  status: OfferStatus;
  intro: string;
  closing: string;
  positions: OfferPosition[];
  nkPct: number;
  discountPct: number;
  vatPct: number;
  subtotal: number;
  optionalTotal: number;
  nk: number;
  discount: number;
  net: number;
  vat: number;
  gross: number;
  hours: number;
  sentAt: string | null;
  decidedAt: string | null;
  note: string | null;
  createdBy: ID | null;
}

export const WP_STATUS = ['geplant', 'aktiv', 'abgeschlossen'] as const;
export type WpStatus = (typeof WP_STATUS)[number];
export const WP_STATUS_LABEL: Record<WpStatus, string> = { geplant: 'Geplant', aktiv: 'In Arbeit', abgeschlossen: 'Abgeschlossen' };

export interface WorkPackage {
  id: ID;
  projectId: ID;
  offerId: ID | null;
  positionKey: string | null;
  code: string;
  title: string;
  description: string | null;
  phaseId: ID | null;
  responsibleId: ID | null;
  plannedHours: number;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  status: WpStatus;
  progress: number;
  sort: number;
}

export interface SessionUser {
  employeeId: ID | null;
  role: Role;
  username: string;
  name: string;
}

export interface SummaryRow {
  projectId: ID;
  phaseId?: ID | null;
  employeeId?: ID;
  hours: number;
  cost: number;
}

export interface Summary {
  byPhase: SummaryRow[];
  byEmployee: SummaryRow[];
  byTask: { taskId: ID; hours: number }[];
  byWorkPackage: { workPackageId: ID; hours: number; cost: number }[];
}

export interface Data {
  settings: Settings;
  employees: Employee[];
  projects: Project[];
  phases: Phase[];
  milestones: Milestone[];
  tasks: Task[];
  allocations: Allocation[];
  costs: CostItem[];
  protocols: Protocol[];
  absences: Absence[];
  invoices: Invoice[];
  offers: Offer[];
  workPackages: WorkPackage[];
  assets: Asset[];
  roles: RoleDef[];
  worktimeMonths: WorktimeMonth[];
  me: { employeeId: ID | null; role: string; permissions: string[] };
  summary: Summary;
}

export type Collection = 'employees' | 'projects' | 'phases' | 'milestones' | 'tasks' | 'allocations' | 'costs' | 'protocols' | 'absences' | 'invoices' | 'roles' | 'worktimeMonths' | 'offers' | 'workPackages';
export type EntityOf<C extends Collection> = Data[C][number];
