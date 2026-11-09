// Kennzahlen für Projektcontrolling (Earned-Value-Methode, vereinfachtes Modell).
import type { CostItem, Data, Employee, ID, Invoice, Milestone, Phase, Project, Task, WorkPackage } from '../types';
import { buildCapacityIndex, type CapacityIndex } from './capacity';
import { clamp, groupBy, sum } from './format';
import { diffDays, todayISO } from './date';

export type Ampel = 'good' | 'warn' | 'bad' | 'none';

export interface Index {
  employeeById: Map<ID, Employee>;
  projectById: Map<ID, Project>;
  phaseById: Map<ID, Phase>;
  phasesByProject: Map<ID, Phase[]>;
  tasksByProject: Map<ID, Task[]>;
  milestonesByProject: Map<ID, Milestone[]>;
  costsByProject: Map<ID, CostItem[]>;
  actualByPhase: Map<string, { hours: number; cost: number }>;
  actualByProject: Map<ID, { hours: number; cost: number }>;
  actualByTask: Map<ID, number>;
  cap: CapacityIndex;
  invoicesByProject: Map<ID, Invoice[]>;
  /** Ist-Stunden und -Kosten je Arbeitspaket */
  actualByWp: Map<ID, { hours: number; cost: number }>;
  wpByProject: Map<ID, WorkPackage[]>;
}

export const phaseKey = (projectId: ID, phaseId: ID | null | undefined) => `${projectId}:${phaseId ?? '-'}`;

export function buildIndex(data: Data): Index {
  const actualByPhase = new Map<string, { hours: number; cost: number }>();
  const actualByProject = new Map<ID, { hours: number; cost: number }>();
  for (const r of data.summary.byPhase) {
    actualByPhase.set(phaseKey(r.projectId, r.phaseId), { hours: r.hours, cost: r.cost });
    const p = actualByProject.get(r.projectId) || { hours: 0, cost: 0 };
    p.hours += r.hours;
    p.cost += r.cost;
    actualByProject.set(r.projectId, p);
  }
  const phasesByProject = groupBy(data.phases, (p) => p.projectId);
  for (const list of phasesByProject.values()) list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.startDate.localeCompare(b.startDate));
  const milestonesByProject = groupBy(data.milestones, (m) => m.projectId);
  for (const list of milestonesByProject.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return {
    employeeById: new Map(data.employees.map((e) => [e.id, e])),
    projectById: new Map(data.projects.map((p) => [p.id, p])),
    phaseById: new Map(data.phases.map((p) => [p.id, p])),
    phasesByProject,
    tasksByProject: groupBy(data.tasks, (t) => t.projectId),
    milestonesByProject,
    costsByProject: groupBy(data.costs, (c) => c.projectId),
    actualByPhase,
    actualByProject,
    actualByTask: new Map(data.summary.byTask.map((r) => [r.taskId, r.hours])),
    cap: buildCapacityIndex(data.absences, data.settings.state || 'HB'),
    invoicesByProject: groupBy([...data.invoices].sort((a, b) => a.number - b.number), (i) => i.projectId),
    actualByWp: new Map((data.summary.byWorkPackage || []).map((r) => [r.workPackageId, { hours: r.hours, cost: r.cost }])),
    wpByProject: groupBy([...(data.workPackages || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), (w) => w.projectId),
  };
}

export interface CostMetrics {
  budget: number;
  plannedHours: number;
  actualHours: number;
  laborCost: number;
  extCost: number;
  extCostPlanned: number;
  actualCost: number;
  progress: number; // Fertigstellungsgrad 0..1
  earnedValue: number;
  cpi: number | null; // Kosteneffizienz (EV / AC)
  eac: number; // Prognose Gesamtkosten
  variance: number; // Budget - Prognose
  budgetUsed: number; // AC / Budget
}

function costMetrics(budget: number, plannedHours: number, progress: number, actual: { hours: number; cost: number } | undefined, costs: CostItem[]): CostMetrics {
  const laborCost = actual?.cost || 0;
  const extCost = sum(costs.filter((c) => c.status === 'angefallen'), (c) => c.amount);
  const extCostPlanned = sum(costs.filter((c) => c.status === 'geplant'), (c) => c.amount);
  const actualCost = laborCost + extCost;
  const earnedValue = budget * progress;
  const cpi = actualCost > 0 && earnedValue > 0 ? earnedValue / actualCost : null;
  let eac: number;
  if (progress >= 1) eac = actualCost;
  else if (cpi && progress >= 0.05) eac = actualCost + (budget - earnedValue) / cpi;
  else eac = Math.max(budget, actualCost + extCostPlanned);
  return {
    budget, plannedHours, actualHours: actual?.hours || 0, laborCost, extCost, extCostPlanned, actualCost,
    progress, earnedValue, cpi, eac, variance: budget - eac, budgetUsed: budget > 0 ? actualCost / budget : 0,
  };
}

/** Plan-Fertigstellung zum Stichtag (linear über die Phasendauer). */
export function plannedProgressOfPhase(ph: Phase, today = todayISO()): number {
  if (today < ph.startDate) return 0;
  if (today >= ph.endDate) return 1;
  return clamp(diffDays(ph.startDate, today) / Math.max(1, diffDays(ph.startDate, ph.endDate)), 0, 1);
}

export interface ProjectMetrics extends CostMetrics {
  plannedProgress: number;
  scheduleDelta: number; // Ist- minus Plan-Fertigstellung
  costStatus: Ampel;
  scheduleStatus: Ampel;
  overall: Ampel;
  tasksTotal: number;
  tasksDone: number;
  tasksOpen: number;
  tasksOverdue: number;
  nextMilestone: Milestone | null;
  overdueMilestones: number;
}

const worst = (...a: Ampel[]): Ampel => (a.includes('bad') ? 'bad' : a.includes('warn') ? 'warn' : a.includes('good') ? 'good' : 'none');

export function projectMetrics(p: Project, idx: Index, today = todayISO()): ProjectMetrics {
  const phases = idx.phasesByProject.get(p.id) || [];
  const tasks = idx.tasksByProject.get(p.id) || [];
  const milestones = idx.milestonesByProject.get(p.id) || [];
  const costs = idx.costsByProject.get(p.id) || [];
  const phaseBudget = sum(phases, (ph) => ph.budget);
  const weight = (ph: Phase) => (phaseBudget > 0 ? (ph.budget || 0) / phaseBudget : 1 / phases.length);
  let progress = phases.length ? sum(phases, (ph) => weight(ph) * ((ph.progress || 0) / 100)) : 0;
  if (!phases.length && tasks.length) progress = tasks.filter((t) => t.status === 'erledigt').length / tasks.length;
  if (p.status === 'Abgeschlossen') progress = 1;
  const plannedProgress = phases.length ? sum(phases, (ph) => weight(ph) * plannedProgressOfPhase(ph, today)) : 0;
  const budget = p.budget || phaseBudget || 0;
  const cm = costMetrics(budget, sum(phases, (ph) => ph.plannedHours), progress, idx.actualByProject.get(p.id), costs);

  const tasksDone = tasks.filter((t) => t.status === 'erledigt').length;
  const tasksOverdue = tasks.filter((t) => t.status !== 'erledigt' && t.dueDate && t.dueDate < today).length;
  const openMs = milestones.filter((m) => !m.done);
  const overdueMilestones = openMs.filter((m) => m.date < today).length;
  const nextMilestone = openMs.find((m) => m.date >= today) || null;

  const active = p.status === 'In Bearbeitung' || p.status === 'Beauftragt';
  const scheduleDelta = progress - plannedProgress;
  let scheduleStatus: Ampel = 'none';
  if (active && plannedProgress > 0) {
    scheduleStatus = scheduleDelta >= -0.05 ? 'good' : scheduleDelta >= -0.12 ? 'warn' : 'bad';
    if (overdueMilestones > 0 && scheduleStatus === 'good') scheduleStatus = 'warn';
  }
  let costStatus: Ampel = 'none';
  if (p.status !== 'Akquise' && cm.actualCost > 0) {
    const ratio = cm.eac / Math.max(1, budget);
    costStatus = ratio <= 1.0 ? 'good' : ratio <= 1.08 ? 'warn' : 'bad';
  }
  return {
    ...cm, plannedProgress, scheduleDelta, costStatus, scheduleStatus, overall: worst(costStatus, scheduleStatus),
    tasksTotal: tasks.length, tasksDone, tasksOpen: tasks.length - tasksDone, tasksOverdue, nextMilestone, overdueMilestones,
  };
}

export function phaseMetrics(ph: Phase, idx: Index): CostMetrics & { plannedProgress: number } {
  const costs = (idx.costsByProject.get(ph.projectId) || []).filter((c) => c.phaseId === ph.id);
  return {
    ...costMetrics(ph.budget || 0, ph.plannedHours || 0, (ph.progress || 0) / 100, idx.actualByPhase.get(phaseKey(ph.projectId, ph.id)), costs),
    plannedProgress: plannedProgressOfPhase(ph),
  };
}

export const AMPEL_LABEL: Record<Ampel, string> = { good: 'Im Plan', warn: 'Beobachten', bad: 'Kritisch', none: 'Keine Bewertung' };

export const isActiveProject = (p: Project) => p.status === 'In Bearbeitung' || p.status === 'Beauftragt';
