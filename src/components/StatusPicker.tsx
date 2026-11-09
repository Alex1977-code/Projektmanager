// Aufgabenstatus mit einem Klick setzen: vier Schritte nebeneinander, der aktuelle ist farbig.
import type { MouseEvent, ReactNode } from 'react';
import { Circle, CircleCheckBig, CirclePlay, ScanEye } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from './Toast';
import { TASK_STATUS, TASK_STATUS_LABEL, type Task, type TaskStatus } from '../types';
import { classNames } from '../utils/format';

const ICON: Record<TaskStatus, (size: number) => ReactNode> = {
  offen: (s) => <Circle size={s} />,
  in_arbeit: (s) => <CirclePlay size={s} />,
  pruefung: (s) => <ScanEye size={s} />,
  erledigt: (s) => <CircleCheckBig size={s} />,
};
const SHORT: Record<TaskStatus, string> = { offen: 'Offen', in_arbeit: 'In Arbeit', pruefung: 'Prüfung', erledigt: 'Erledigt' };
const HINT: Record<TaskStatus, string> = {
  offen: 'Offen – noch nicht begonnen',
  in_arbeit: 'In Bearbeitung',
  pruefung: 'In Prüfung – 4-Augen-Prinzip / Freigabe',
  erledigt: 'Erledigt',
};

/**
 * Statusleiste. `labels`: 'active' = nur der aktuelle Schritt mit Text (Karten, Listen),
 * 'all' = alle beschriftet (Formular), 'none' = nur Symbole (enge Stellen).
 */
export function StatusSteps({ value, onChange, disabled, labels = 'active', className }: { value: TaskStatus; onChange: (s: TaskStatus) => void; disabled?: boolean; labels?: 'active' | 'all' | 'none'; className?: string }) {
  const click = (e: MouseEvent, s: TaskStatus) => {
    e.stopPropagation();
    e.preventDefault();
    if (!disabled && s !== value) onChange(s);
  };
  return (
    <div className={classNames('status-steps', `labels-${labels}`, disabled && 'readonly', className)} role="radiogroup" aria-label="Status"
      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} draggable={false}>
      {TASK_STATUS.map((s) => {
        const active = s === value;
        if (disabled && !active) return null;
        return (
          <button key={s} type="button" role="radio" aria-checked={active} aria-label={TASK_STATUS_LABEL[s]} title={active ? HINT[s] : `Status setzen: ${HINT[s]}`}
            className={classNames('status-step', `s-${s}`, active && 'active')} disabled={disabled} onClick={(e) => click(e, s)}>
            {ICON[s](15)}
            {(labels === 'all' || (labels === 'active' && active)) && <span>{labels === 'all' ? TASK_STATUS_LABEL[s] : SHORT[s]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Statusleiste für eine gespeicherte Aufgabe: ein Klick speichert sofort, mit „Rückgängig“. */
export function TaskStatusPicker({ task, labels = 'active', className }: { task: Task; labels?: 'active' | 'none'; className?: string }) {
  const { update, can } = useStore();
  const toast = useToast();
  const set = async (status: TaskStatus) => {
    const before = task.status;
    const saved = await update('tasks', task.id, { status });
    if (!saved) return;
    toast.success(`„${task.title}“ → ${TASK_STATUS_LABEL[status]}`, { label: 'Rückgängig', onClick: () => { update('tasks', task.id, { status: before }); } });
  };
  return <StatusSteps value={task.status} onChange={set} disabled={!can('tasks.edit')} labels={labels} className={className} />;
}
