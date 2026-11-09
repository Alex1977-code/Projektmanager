import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; kind: Kind; message: string; action?: ToastAction }
interface ToastApi {
  /** optional mit Schaltfläche, z. B. „Rückgängig“ */
  success: (m: string, action?: ToastAction) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, message: string, action?: ToastAction) => {
    const id = ++counter;
    setItems((l) => [...l.slice(-3), { id, kind, message, action }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : action ? 5500 : 3200);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    success: (m, action) => push('success', m, action),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span>{t.message}</span>
            {t.action && <button className="toast-action" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button>}
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Schließen"><X size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast außerhalb des ToastProvider');
  return c;
}
