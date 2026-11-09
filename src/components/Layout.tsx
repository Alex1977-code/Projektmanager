import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarRange, ChevronDown, Clock, CornerDownLeft, FolderKanban, LayoutDashboard,
  ListChecks, LogOut, Menu, ShieldCheck, Timer, NotebookPen, Palmtree, Plus, Receipt, Search, Settings, Users, Gauge, X,
  Eye, FileSignature,
} from 'lucide-react';
import { useStore } from '../store';
import { Avatar } from './ui';
import { ROLE_LABEL } from '../types';
import { lazy, Suspense } from 'react';
import { IS_HOSTED } from '../hosted';

const SyncChip = IS_HOSTED ? lazy(() => import('../local/HostedGate').then((m) => ({ default: m.SyncChip }))) : null;
import { TaskForm, ProjectForm } from './forms';
import { classNames } from '../utils/format';
import { todayISO } from '../utils/date';

const NAV = [
  { to: '/', label: 'Cockpit', icon: LayoutDashboard, end: true },
  { to: '/projekte', label: 'Projekte', icon: FolderKanban },
  { to: '/terminplan', label: 'Terminplanung', icon: CalendarRange },
  { to: '/ressourcen', label: 'Ressourcen', icon: Gauge },
  { to: '/aufgaben', label: 'Aufgaben', icon: ListChecks },
  { to: '/protokolle', label: 'Protokolle', icon: NotebookPen },
  { to: '/zeiten', label: 'Projektzeiten', icon: Clock },
  { to: '/arbeitszeit', label: 'Arbeitszeit', icon: Timer },
  { to: '/angebote', label: 'Angebote', icon: FileSignature, perm: 'offers.view' },
  { to: '/controlling', label: 'Kosten & Controlling', icon: BarChart3, perm: 'costs.view' },
  { to: '/rechnungen', label: 'Rechnungen', icon: Receipt, perm: 'invoices.view' },
  { to: '/abwesenheiten', label: 'Abwesenheiten', icon: Palmtree },
  { to: '/team', label: 'Team', icon: Users },
];

export function Layout({ children }: { children: ReactNode }) {
  const { data, me, can, previewRole, setPreviewRole } = useStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [quick, setQuick] = useState<'task' | 'project' | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayISO();

  useEffect(() => setNavOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const myOpen = me ? data.tasks.filter((t) => t.assigneeId === me.id && t.status !== 'erledigt') : [];
  const myOverdue = myOpen.filter((t) => t.dueDate && t.dueDate < today).length;
  const pendingAbs = data.absences.filter((a) => a.status === 'beantragt').length;

  return (
    <div className={classNames('app', navOpen && 'nav-open')}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="34" height="34"><rect width="32" height="32" rx="8" fill="#13335f" /><path d="M5 21h22M8 21V12m16 9V12M8 12l8-5 8 5" stroke="#38bdf8" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 25.5c3 0 3-1.6 5.5-1.6S13 25.5 16 25.5s3-1.6 5.5-1.6 2.5 1.6 5.5 1.6" stroke="#7dd3fc" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
          </div>
          <div className="brand-text">
            <strong>Projektsteuerung</strong>
            <span title={data.settings.companyName}>{data.settings.companyName}</span>
          </div>
          <button className="icon-btn nav-close" onClick={() => setNavOpen(false)} aria-label="Menü schließen"><X size={18} /></button>
        </div>
        <nav className="nav">
          {NAV.filter((n) => !('perm' in n) || can(n.perm as string)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setNavOpen(false)} className={({ isActive }) => classNames('nav-item', isActive && 'active')}>
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.to === '/abwesenheiten' && can('absences.approve') && pendingAbs > 0 && (
                <span className="nav-count" title={`${pendingAbs} offene Anträge`}>{pendingAbs}</span>
              )}
              {n.to === '/aufgaben' && myOpen.length > 0 && (
                <span className={classNames('nav-count', myOverdue > 0 && 'nav-count-alert')} title={`${myOpen.length} offene Aufgaben, davon ${myOverdue} überfällig`}>{myOpen.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-bottom">
          {can('roles.edit') && <NavLink to="/rollen" onClick={() => setNavOpen(false)} className={({ isActive }) => classNames('nav-item', isActive && 'active')}>
            <ShieldCheck size={18} /><span>Rollen &amp; Rechte</span>
          </NavLink>}
          {(can('settings.edit') || can('data.export')) && <NavLink to="/einstellungen" onClick={() => setNavOpen(false)} className={({ isActive }) => classNames('nav-item', isActive && 'active')}>
            <Settings size={18} /><span>Einstellungen</span>
          </NavLink>}
        </div>
      </aside>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn nav-burger" onClick={() => setNavOpen(true)} aria-label="Menü öffnen"><Menu size={20} /></button>
          <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
            <Search size={16} />
            <span>Projekte, Aufgaben, Personen suchen …</span>
            <kbd>Strg K</kbd>
          </button>
          <div className="topbar-actions">
            {SyncChip && <Suspense fallback={null}><SyncChip /></Suspense>}
            <div className="quick-add">
              {can('tasks.edit') && <button className="btn btn-primary btn-sm" onClick={() => setQuick('task')}><Plus size={16} /> Aufgabe</button>}
              {can('projects.edit') && <button className="btn btn-sm" onClick={() => setQuick('project')}><Plus size={16} /> Projekt</button>}
            </div>
            <UserMenu />
          </div>
        </header>
        {previewRole && (
          <div className="preview-bar" role="status">
            <Eye size={16} />
            <span>Vorschau: Sie sehen die Oberfläche wie die Rolle <strong>„{data.roles.find((r) => r.key === previewRole)?.name || previewRole}“</strong>.</span>
            <button className="btn btn-sm" onClick={() => setPreviewRole(null)}>Vorschau beenden</button>
          </div>
        )}
        <main className="content">{children}</main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {quick === 'task' && can('tasks.edit') && <TaskForm defaults={{ assigneeId: me?.id }} onClose={() => setQuick(null)} />}
      {quick === 'project' && <ProjectForm onClose={() => setQuick(null)} onSaved={(p) => navigate(`/projekte/${p.id}`)} />}
    </div>
  );
}

function UserMenu() {
  const { data, me, setMeId, authMode, session, role, logout } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const sorted = [...data.employees].filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <Avatar employee={me} size={32} />
        <span className="user-text">
          <strong>{me?.name || session?.name || 'Benutzer wählen'}</strong>
          <small>{me?.role || ROLE_LABEL[role]}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && authMode !== 'none' && (
        <div className="dropdown">
          <div className="dropdown-head">Angemeldet</div>
          <div className="dropdown-user">
            <strong>{session?.name}</strong>
            <small>{session?.username} · {ROLE_LABEL[role]}</small>
          </div>
          <button className="dropdown-item" onClick={() => { setOpen(false); logout(); }}><LogOut size={16} /> <span><strong>Abmelden</strong></span></button>
        </div>
      )}
      {open && authMode === 'none' && (
        <div className="dropdown" role="listbox">
          <div className="dropdown-head">Angemeldet als …</div>
          <div className="dropdown-scroll">
            {sorted.map((e) => (
              <button key={e.id} role="option" aria-selected={e.id === me?.id} className={classNames('dropdown-item', e.id === me?.id && 'selected')}
                onClick={() => { setMeId(e.id); setOpen(false); }}>
                <Avatar employee={e} size={24} />
                <span><strong>{e.name}</strong><small>{e.role}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Schnellsuche
interface PaletteItem { id: string; group: string; label: string; sub?: string; to: string; color?: string }

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data, idx } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<PaletteItem[]>(() => [
    ...NAV.map((n) => ({ id: `nav${n.to}`, group: 'Navigation', label: n.label, to: n.to })),
    ...data.projects.map((p) => ({ id: `p${p.id}`, group: 'Projekte', label: `${p.number} · ${p.name}`, sub: `${p.client || ''} · ${p.status}`, to: `/projekte/${p.id}`, color: p.color || undefined })),
    ...data.protocols.map((pr) => ({ id: `pr${pr.id}`, group: 'Protokolle', label: `${idx.projectById.get(pr.projectId)?.number || ''} · Nr. ${pr.number} ${pr.title || pr.type}`, sub: `${pr.type} · ${pr.date.split('-').reverse().join('.')}`, to: `/protokolle/${pr.id}` })),
    ...data.employees.map((e) => ({ id: `e${e.id}`, group: 'Team', label: e.name, sub: `${e.role} · ${e.department}`, to: `/team?id=${e.id}` })),
    ...data.tasks.filter((t) => t.status !== 'erledigt').map((t) => ({
      id: `t${t.id}`, group: 'Aufgaben', label: t.title, sub: `${idx.projectById.get(t.projectId)?.number || ''} · ${idx.employeeById.get(t.assigneeId || 0)?.name || 'nicht zugewiesen'}`,
      to: `/aufgaben?task=${t.id}`,
    })),
  ], [data, idx]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = terms.length ? all.filter((i) => terms.every((t) => `${i.label} ${i.sub || ''}`.toLowerCase().includes(t))) : all.filter((i) => i.group !== 'Aufgaben' && i.group !== 'Protokolle');
    return list.slice(0, 40);
  }, [all, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (i: PaletteItem) => {
    navigate(i.to);
    onClose();
  };

  let lastGroup = '';
  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Schnellsuche">
        <div className="palette-input">
          <Search size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen … (z. B. Klappbrücke, Becker, LPH 5)"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter' && results[active]) go(results[active]);
              if (e.key === 'Escape') onClose();
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Keine Treffer für „{q}“</div>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? <div className="palette-group">{r.group}</div> : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {header}
                <button data-i={i} className={classNames('palette-item', i === active && 'active')} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
                  {r.color && <span className="proj-dot" style={{ background: r.color }} />}
                  <span className="palette-text"><strong>{r.label}</strong>{r.sub && <small>{r.sub}</small>}</span>
                  {i === active && <CornerDownLeft size={14} className="muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
