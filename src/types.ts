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

export interface Settings {
  companyName: string;
  hoursPerDay: number;
  currency: string;
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
  summary: Summary;
}

export type Collection = 'employees' | 'projects' | 'phases' | 'milestones' | 'tasks' | 'allocations' | 'costs' | 'protocols';
export type EntityOf<C extends Collection> = Data[C][number];
