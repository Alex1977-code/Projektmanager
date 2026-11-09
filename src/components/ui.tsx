import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import type { Employee, Priority, ProjectStatus, TaskStatus } from '../types';
import { TASK_STATUS_LABEL } from '../types';
import { AMPEL_LABEL, type Ampel } from '../utils/metrics';
import { classNames, clamp, initials } from '../utils/format';

export function Avatar({ employee, size = 28, title }: { employee?: Employee | null; size?: number; title?: string }) {
  if (!employee) {
    return <span className="avatar avatar-empty" style={{ width: size, height: size, fontSize: size * 0.4 }} title="Nicht zugewiesen">?</span>;
  }
  return (
    <span
      className="avatar"
      title={title ?? employee.name}
      style={{ width: size, height: size, fontSize: size * 0.38, background: employee.color || '#475569' }}
    >
      {employee.short || initials(employee.name)}
    </span>
  );
}

export function AvatarStack({ employees, max = 4 }: { employees: Employee[]; max?: number }) {
  const shown = employees.slice(0, max);
  const rest = employees.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((e) => <Avatar key={e.id} employee={e} size={26} />)}
      {rest > 0 && <span className="avatar avatar-more" style={{ width: 26, height: 26 }}>+{rest}</span>}
    </span>
  );
}

const STATUS_TONE: Record<ProjectStatus, string> = {
  Akquise: 'violet',
  Beauftragt: 'cyan',
  'In Bearbeitung': 'blue',
  Pausiert: 'amber',
  Abgeschlossen: 'slate',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status] || 'slate'}`}>{status}</span>;
}

const TASK_TONE: Record<TaskStatus, string> = { offen: 'slate', in_arbeit: 'blue', pruefung: 'amber', erledigt: 'green' };
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge-${TASK_TONE[status]}`}>{TASK_STATUS_LABEL[status]}</span>;
}

export function PriorityTag({ priority }: { priority?: Priority | null }) {
  if (!priority) return null;
  return (
    <span className={`prio prio-${priority}`} title={`Priorität: ${priority}`}>
      <span className="prio-bars" aria-hidden><i /><i /><i /></span>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

/** Ampel mit Symbol + Text (Farbe nie allein bedeutungstragend). */
export function AmpelBadge({ value, label, compact }: { value: Ampel; label?: string; compact?: boolean }) {
  const Icon = value === 'good' ? CheckCircle2 : value === 'warn' ? AlertTriangle : value === 'bad' ? AlertOctagon : MinusCircle;
  const text = label ?? AMPEL_LABEL[value];
  return (
    <span className={classNames('ampel', `ampel-${value}`, compact && 'ampel-compact')} title={text}>
      <Icon size={compact ? 15 : 14} aria-hidden />
      {!compact && <span>{text}</span>}
      {compact && <span className="sr-only">{text}</span>}
    </span>
  );
}

export function ProgressBar({ value, tone, height = 6, marker, label }: { value: number; tone?: 'auto' | 'blue' | 'green' | 'amber' | 'red'; height?: number; marker?: number; label?: string }) {
  const v = clamp(value, 0, 1);
  let t = tone || 'blue';
  if (tone === 'auto') t = value > 1 ? 'red' : value > 0.9 ? 'amber' : 'blue';
  return (
    <div className="progress" style={{ height }} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`progress-fill progress-${t}`} style={{ width: `${v * 100}%` }} />
      {marker !== undefined && <div className="progress-marker" style={{ left: `${clamp(marker, 0, 1) * 100}%` }} title="Soll-Stand heute" />}
    </div>
  );
}

export function Kpi({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  return (
    <div className={classNames('kpi', tone && `kpi-${tone}`)}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={classNames('card', className)}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'card-body' : 'card-flush'}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Field({ label, children, hint, span }: { label: string; children: ReactNode; hint?: string; span?: 1 | 2 }) {
  return (
    <label className={classNames('field', span === 2 && 'field-span2')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
