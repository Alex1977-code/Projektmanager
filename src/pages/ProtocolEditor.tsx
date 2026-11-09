import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ListPlus, Loader2, Mail, Plus, Printer, Trash2, UserPlus, X } from 'lucide-react';
import { useStore } from '../store';
import { printOrSave, PRINT_LABEL } from '../utils/files';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Modal';
import { Avatar, Card, EmptyState, Field, Segmented, TaskStatusBadge } from '../components/ui';
import { ProtocolStatusBadge, useTasksById } from '../components/Protocols';
import { ITEM_KIND_LABEL, PROTOCOL_TYPES, type ID, type Participant, type Protocol, type ProtocolItem, type ProtocolItemKind, type Task } from '../types';
import { fmtDate, todayISO } from '../utils/date';
import { classNames } from '../utils/format';
import { itemNumbers, newItemId } from '../utils/protocols';

type SaveState = 'saved' | 'dirty' | 'saving';

function AutoTextarea({ value, onChange, placeholder, onKeyDown, className, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; className?: string; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} value={value} placeholder={placeholder} autoFocus={autoFocus}
    onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />;
}

export function ProtocolEditor() {
  const { id } = useParams();
  const { data, idx, me, update, remove, create, createTasks } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const tasksById = useTasksById();
  const stored = data.protocols.find((p) => p.id === Number(id));
  const [draft, setDraft] = useState<Protocol | null>(stored || null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [extName, setExtName] = useState('');
  const [extCompany, setExtCompany] = useState('');
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { if (!draft && stored) setDraft(stored); }, [stored, draft]);
  useEffect(() => {
    // Sprung zu einem Punkt (#itemId) aus der Offene-Punkte-Liste
    if (!location.hash) return;
    const el = document.getElementById(`item-${location.hash.slice(1)}`);
    el?.scrollIntoView({ block: 'center' });
    el?.classList.add('flash');
  }, [location.hash, draft?.id]);

  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    const { id: pid, projectId: _p, number: _n, createdAt: _c, ...rest } = d;
    void _p; void _n; void _c;
    const ok = await update('protocols', pid, rest);
    setSaveState(dirtyRef.current ? 'dirty' : ok ? 'saved' : 'dirty');
  }, [update]);

  // Änderungen automatisch speichern (verzögert) und beim Verlassen sichern
  const change = (patch: Partial<Protocol>) => {
    setDraft((d) => {
      const next = d ? { ...d, ...patch } : d;
      draftRef.current = next;
      return next;
    });
    dirtyRef.current = true;
    setSaveState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 700);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); save(); }, [save]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); window.clearTimeout(timer.current); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const numbers = useMemo(() => itemNumbers(draft?.items || []), [draft?.items]);

  if (!draft) {
    return <div className="page"><EmptyState title="Protokoll nicht gefunden" action={<Link className="btn" to="/protokolle">Zur Übersicht</Link>} /></div>;
  }
  const project = idx.projectById.get(draft.projectId);
  const author = idx.employeeById.get(draft.authorId || 0);
  const nameOf = (eid: ID) => idx.employeeById.get(eid)?.name;
  const projectTeam = new Set<ID>(data.allocations.filter((a) => a.projectId === draft.projectId).map((a) => a.employeeId));
  const employees = data.employees.filter((e) => e.active).sort((a, b) => Number(projectTeam.has(b.id)) - Number(projectTeam.has(a.id)) || a.name.localeCompare(b.name, 'de'));

  // ---------------------------------------------------------------- Punkte bearbeiten
  const setItems = (items: ProtocolItem[]) => change({ items });
  const patchItem = (iid: string, patch: Partial<ProtocolItem>) => setItems(draft.items.map((it) => (it.id === iid ? { ...it, ...patch } : it)));
  const addItem = (kind: ProtocolItemKind, afterId?: string) => {
    const it: ProtocolItem = { id: newItemId(), kind, text: '', ...(kind === 'A' ? { dueDate: null, assigneeId: null } : {}) };
    const items = [...draft.items];
    const pos = afterId ? items.findIndex((x) => x.id === afterId) + 1 : items.length;
    items.splice(pos, 0, it);
    setItems(items);
    setFocusId(it.id);
  };
  const moveItem = (iid: string, dir: -1 | 1) => {
    const items = [...draft.items];
    const i = items.findIndex((x) => x.id === iid);
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    setItems(items);
  };
  const deleteItem = (iid: string) => setItems(draft.items.filter((x) => x.id !== iid));
  const onItemKey = (e: KeyboardEvent<HTMLTextAreaElement>, it: ProtocolItem) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addItem(it.kind === 'top' ? 'I' : it.kind, it.id);
    }
  };

  const taskPayload = (it: ProtocolItem): Partial<Task> => ({
    projectId: draft.projectId,
    title: it.text.split('\n')[0].slice(0, 140) || 'Aufgabe aus Protokoll',
    description: `${it.text}\n\nAus Protokoll Nr. ${draft.number} vom ${fmtDate(draft.date)} (${draft.title || draft.type}), Punkt ${numbers.get(it.id)}`,
    assigneeId: it.assigneeId ?? null, dueDate: it.dueDate || null, startDate: draft.date <= (it.dueDate || '9') ? draft.date : null,
    status: 'offen', priority: 'mittel',
  });
  const createTask = async (it: ProtocolItem) => {
    if (!it.text.trim()) return toast.error('Bitte zuerst den Inhalt des Punktes eintragen');
    try {
      const t = await create('tasks', taskPayload(it));
      patchItem(it.id, { taskId: t.id });
      toast.success('Aufgabe angelegt und verknüpft');
    } catch { /* gemeldet */ }
  };
  const pending = draft.items.filter((it) => it.kind === 'A' && it.assigneeId && !it.taskId && !it.done && it.text.trim());
  const createAllTasks = async () => {
    try {
      const rows = await createTasks(pending.map(taskPayload));
      const map = new Map(pending.map((it, i) => [it.id, rows[i]?.id]));
      setItems(draft.items.map((it) => (map.has(it.id) ? { ...it, taskId: map.get(it.id) } : it)));
      toast.success(`${rows.length} Aufgaben angelegt`);
    } catch { /* gemeldet */ }
  };

  // ---------------------------------------------------------------- Teilnehmer
  const setParticipants = (participants: Participant[]) => change({ participants });
  const addEmployee = (eid: ID) => {
    if (draft.participants.some((p) => p.employeeId === eid)) return;
    setParticipants([...draft.participants, { employeeId: eid, present: true }]);
  };
  const addExternal = () => {
    if (!extName.trim()) return;
    setParticipants([...draft.participants, { name: extName.trim(), company: extCompany.trim(), present: true }]);
    setExtName('');
    setExtCompany('');
  };

  const mailto = () => {
    const to = draft.participants.map((p) => (p.employeeId ? idx.employeeById.get(p.employeeId)?.email : null)).filter(Boolean).join(',');
    const subject = `${project?.number} – Protokoll Nr. ${draft.number}: ${draft.title || draft.type} vom ${fmtDate(draft.date)}`;
    const body = `Guten Tag,\n\nanbei erhalten Sie das Protokoll Nr. ${draft.number} der ${draft.type} vom ${fmtDate(draft.date)} zum Projekt ${project?.number} ${project?.name}.\n\nEinwände bitten wir innerhalb von 7 Tagen nach Erhalt mitzuteilen.\n\nMit freundlichen Grüßen\n${me?.name || ''}\n${data.settings.companyName}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (draft.status !== 'versendet') change({ status: 'versendet' });
  };

  const del = async () => {
    if (await confirm({ title: 'Protokoll löschen?', message: <>Protokoll Nr. {draft.number} „{draft.title}“ wird endgültig gelöscht. Verknüpfte Aufgaben bleiben erhalten.</>, confirmLabel: 'Löschen', danger: true })) {
      window.clearTimeout(timer.current);
      dirtyRef.current = false;
      if (await remove('protocols', draft.id)) {
        toast.success('Protokoll gelöscht');
        navigate(`/projekte/${draft.projectId}?tab=protokolle`);
      }
    }
  };

  const respValue = (it: ProtocolItem) => (it.assigneeId ? `e${it.assigneeId}` : it.responsible !== undefined && it.responsible !== null ? 'x' : '');

  return (
    <div className="page">
      <div className="no-print page-header">
        <div className="page-header-main">
          <div>
            <h1><span className="proj-dot lg" style={{ background: project?.color || '#64748b' }} />Protokoll Nr. {draft.number} · {draft.title || draft.type}</h1>
            <p className="page-subtitle header-meta">
              <Link to={`/projekte/${draft.projectId}?tab=protokolle`} className="back-link"><ArrowLeft size={14} /> {project?.number} {project?.name}</Link>
              <ProtocolStatusBadge status={draft.status} />
              <span className={classNames('save-state', saveState)}>
                {saveState === 'saving' ? <><Loader2 size={13} className="spin" /> Speichert …</> : saveState === 'dirty' ? 'Ungespeicherte Änderungen' : <><CheckCircle2 size={13} /> Gespeichert</>}
              </span>
            </p>
          </div>
          <div className="page-actions">
            <Segmented value={draft.status} onChange={(v) => change({ status: v })} options={[{ value: 'entwurf', label: 'Entwurf' }, { value: 'versendet', label: 'Versendet' }]} />
            <button className="btn" onClick={mailto} title="E-Mail an interne Teilnehmer vorbereiten"><Mail size={16} /> Verteilen</button>
            <button className="btn" onClick={() => { save(); printOrSave('.protocol-print', `Protokoll-${project?.number}-Nr${draft.number}`, `Protokoll Nr. ${draft.number} – ${project?.number}`).catch((e) => toast.error((e as Error).message)); }}><Printer size={16} /> {PRINT_LABEL}</button>
            <button className="icon-btn" onClick={del} title="Protokoll löschen" aria-label="Protokoll löschen"><Trash2 size={17} /></button>
          </div>
        </div>
      </div>

      <div className="protocol-layout no-print">
        <Card title="Besprechungspunkte" padded={false}
          subtitle="I = Information · F = Festlegung · A = Aufgabe mit Verantwortlichem und Termin · Strg+Enter fügt einen Punkt darunter ein"
          actions={pending.length > 0 ? <button className="btn btn-sm" onClick={createAllTasks}><ListPlus size={14} /> {pending.length} A-Punkte als Aufgaben anlegen</button> : undefined}>
          <div className="pitems">
            {draft.items.length === 0 && <div className="pitems-empty">Noch keine Punkte – beginnen Sie mit einem Tagesordnungspunkt.</div>}
            {draft.items.map((it, i) => {
              const task = it.taskId ? tasksById.get(it.taskId) : undefined;
              const overdue = it.kind === 'A' && it.dueDate && it.dueDate < todayISO() && !it.done && task?.status !== 'erledigt';
              return (
                <div key={it.id} id={`item-${it.id}`} className={classNames('pitem', `pitem-${it.kind}`, it.done && 'done')}>
                  <div className="pitem-num">{numbers.get(it.id)}</div>
                  <div className="pitem-main">
                    {it.kind === 'top' ? (
                      <AutoTextarea className="pitem-text pitem-top-text" value={it.text} placeholder="Tagesordnungspunkt" autoFocus={focusId === it.id}
                        onChange={(v) => patchItem(it.id, { text: v.replace(/\n/g, ' ') })} onKeyDown={(e) => onItemKey(e, it)} />
                    ) : (
                      <>
                        <div className="pitem-row">
                          <select className={`kind-select kind-${it.kind}`} value={it.kind} aria-label="Art"
                            onChange={(e) => patchItem(it.id, { kind: e.target.value as ProtocolItemKind })}>
                            {(['I', 'F', 'A'] as const).map((k) => <option key={k} value={k}>{k} · {ITEM_KIND_LABEL[k]}</option>)}
                          </select>
                          <AutoTextarea className="pitem-text" value={it.text} autoFocus={focusId === it.id}
                            placeholder={it.kind === 'A' ? 'Was ist zu tun?' : it.kind === 'F' ? 'Was wurde festgelegt?' : 'Information'}
                            onChange={(v) => patchItem(it.id, { text: v })} onKeyDown={(e) => onItemKey(e, it)} />
                        </div>
                        {it.kind === 'A' && (
                          <div className="pitem-action">
                            <label>
                              <span>Verantwortlich</span>
                              <select value={respValue(it)} onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'x') patchItem(it.id, { assigneeId: null, responsible: it.responsible || '' });
                                else if (v.startsWith('e')) patchItem(it.id, { assigneeId: Number(v.slice(1)), responsible: null });
                                else patchItem(it.id, { assigneeId: null, responsible: null });
                              }}>
                                <option value="">– offen –</option>
                                <optgroup label="Büro">
                                  {employees.map((e) => <option key={e.id} value={`e${e.id}`}>{e.name}</option>)}
                                </optgroup>
                                <option value="x">Extern (AG, AN, Dritte) …</option>
                              </select>
                            </label>
                            {respValue(it) === 'x' && (
                              <label className="grow-label">
                                <span>Extern</span>
                                <input value={it.responsible || ''} placeholder="z. B. AG (Hr. Dahlmann), AN Stahlbau" onChange={(e) => patchItem(it.id, { responsible: e.target.value })} />
                              </label>
                            )}
                            <label>
                              <span>Termin</span>
                              <input type="date" className={overdue ? 'overdue' : ''} value={it.dueDate || ''} onChange={(e) => patchItem(it.id, { dueDate: e.target.value || null })} />
                            </label>
                            <div className="pitem-status">
                              {task ? (
                                <Link to={`/aufgaben?task=${task.id}`} className="task-link" title="Verknüpfte Aufgabe öffnen"><TaskStatusBadge status={task.status} /></Link>
                              ) : it.assigneeId ? (
                                <button className="btn btn-sm" onClick={() => createTask(it)} title="Als Aufgabe für die verantwortliche Person anlegen"><Plus size={13} /> Aufgabe</button>
                              ) : null}
                              {!task && (
                                <label className="check-inline"><input type="checkbox" checked={!!it.done} onChange={(e) => patchItem(it.id, { done: e.target.checked })} /> erledigt</label>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="pitem-tools">
                    <button className="icon-btn" onClick={() => moveItem(it.id, -1)} disabled={i === 0} aria-label="Nach oben"><ArrowUp size={14} /></button>
                    <button className="icon-btn" onClick={() => moveItem(it.id, 1)} disabled={i === draft.items.length - 1} aria-label="Nach unten"><ArrowDown size={14} /></button>
                    <button className="icon-btn danger" onClick={() => deleteItem(it.id)} aria-label="Punkt löschen"><X size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pitems-add">
            <span className="muted small">Hinzufügen:</span>
            <button className="btn btn-sm" onClick={() => addItem('top')}><Plus size={13} /> TOP</button>
            <button className="btn btn-sm" onClick={() => addItem('I')}><Plus size={13} /> Information</button>
            <button className="btn btn-sm" onClick={() => addItem('F')}><Plus size={13} /> Festlegung</button>
            <button className="btn btn-sm btn-primary" onClick={() => addItem('A')}><Plus size={13} /> Aufgabe</button>
          </div>
        </Card>

        <div className="stack">
          <Card title="Kopfdaten">
            <div className="form-grid">
              <Field label="Besprechungsart">
                <select value={draft.type || ''} onChange={(e) => change({ type: e.target.value })}>
                  {PROTOCOL_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Titel"><input value={draft.title || ''} onChange={(e) => change({ title: e.target.value })} /></Field>
              <Field label="Datum"><input type="date" value={draft.date} onChange={(e) => e.target.value && change({ date: e.target.value })} /></Field>
              <Field label="Uhrzeit"><input type="time" value={draft.time || ''} onChange={(e) => change({ time: e.target.value })} /></Field>
              <Field label="Ort" span={2}><input value={draft.location || ''} onChange={(e) => change({ location: e.target.value })} /></Field>
              <Field label="Nächster Termin"><input type="date" value={draft.nextDate || ''} onChange={(e) => change({ nextDate: e.target.value || null })} /></Field>
              <Field label="Verfasser">
                <select value={draft.authorId ?? ''} onChange={(e) => change({ authorId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">–</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Teilnehmer und Verteiler" subtitle="Häkchen = anwesend · ohne Häkchen = nur Verteiler" padded={false}>
            <ul className="plist">
              {draft.participants.map((p, i) => {
                const e = p.employeeId ? idx.employeeById.get(p.employeeId) : null;
                return (
                  <li key={i}>
                    <input type="checkbox" checked={p.present} aria-label="anwesend"
                      onChange={(ev) => setParticipants(draft.participants.map((x, j) => (j === i ? { ...x, present: ev.target.checked } : x)))} />
                    {e ? <Avatar employee={e} size={26} /> : <span className="avatar avatar-ext" style={{ width: 26, height: 26 }}>{(p.name || '?').replace(/^(Hr\.|Fr\.|Dr\.)\s*/g, '').charAt(0)}</span>}
                    <div className="plist-text">
                      <strong>{e ? e.name : p.name}</strong>
                      <small>{e ? `${e.role} · ${data.settings.companyName}` : p.company || 'extern'}</small>
                    </div>
                    <button className="icon-btn" onClick={() => setParticipants(draft.participants.filter((_, j) => j !== i))} aria-label="Entfernen"><X size={14} /></button>
                  </li>
                );
              })}
            </ul>
            <div className="plist-add">
              <label className="rg-add-select">
                <UserPlus size={14} />
                <select value="" onChange={(e) => e.target.value && addEmployee(Number(e.target.value))}>
                  <option value="">Mitarbeiter hinzufügen …</option>
                  {employees.filter((e) => !draft.participants.some((p) => p.employeeId === e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}{projectTeam.has(e.id) ? ' (Projektteam)' : ''}</option>)}
                </select>
              </label>
              <div className="ext-add">
                <input value={extName} onChange={(e) => setExtName(e.target.value)} placeholder="Externe Person (z. B. Hr. Meyer)" onKeyDown={(e) => e.key === 'Enter' && addExternal()} />
                <input value={extCompany} onChange={(e) => setExtCompany(e.target.value)} placeholder="Firma / Funktion" onKeyDown={(e) => e.key === 'Enter' && addExternal()} />
                <button className="btn btn-sm" onClick={addExternal} disabled={!extName.trim()}><Plus size={13} /></button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------------------- Druckfassung */}
      <article className="print-only protocol-print">
        <header className="pp-head">
          <div><strong>{data.settings.companyName}</strong></div>
          <div className="pp-doc">Besprechungsprotokoll Nr. {draft.number}</div>
        </header>
        <table className="pp-meta">
          <tbody>
            <tr><th>Projekt</th><td>{project?.number} · {project?.name}</td><th>Auftraggeber</th><td>{project?.client}</td></tr>
            <tr><th>Besprechung</th><td>{!draft.title || draft.title === draft.type ? draft.type : draft.title.startsWith(draft.type || '') ? draft.title : `${draft.type} – ${draft.title}`}</td><th>Datum / Zeit</th><td>{fmtDate(draft.date)}{draft.time ? `, ${draft.time} Uhr` : ''}</td></tr>
            <tr><th>Ort</th><td>{draft.location}</td><th>Nächster Termin</th><td>{draft.nextDate ? fmtDate(draft.nextDate) : '–'}</td></tr>
          </tbody>
        </table>
        <h3>Teilnehmer und Verteiler</h3>
        <table className="pp-table">
          <thead><tr><th>Name</th><th>Firma / Funktion</th><th className="c">anwesend</th><th className="c">Verteiler</th></tr></thead>
          <tbody>
            {draft.participants.map((p, i) => {
              const e = p.employeeId ? idx.employeeById.get(p.employeeId) : null;
              return <tr key={i}><td>{e ? `${e.title ? e.title + ' ' : ''}${e.name}` : p.name}</td><td>{e ? `${data.settings.companyName}, ${e.role}` : p.company}</td><td className="c">{p.present ? '×' : ''}</td><td className="c">×</td></tr>;
            })}
          </tbody>
        </table>
        <h3>Besprechungspunkte</h3>
        <table className="pp-table pp-items">
          <thead><tr><th className="nr">Nr.</th><th className="c">Art</th><th>Inhalt</th><th>Verantwortlich</th><th>Termin</th></tr></thead>
          <tbody>
            {draft.items.map((it) => it.kind === 'top' ? (
              <tr key={it.id} className="pp-top"><td className="nr">{numbers.get(it.id)}</td><td colSpan={4}>{it.text}</td></tr>
            ) : (
              <tr key={it.id}>
                <td className="nr">{numbers.get(it.id)}</td>
                <td className="c"><strong>{it.kind}</strong></td>
                <td className="pre">{it.text}{it.kind === 'A' && (it.done || (it.taskId && tasksById.get(it.taskId)?.status === 'erledigt')) ? ' (erledigt)' : ''}</td>
                <td>{it.kind === 'A' ? (it.assigneeId ? nameOf(it.assigneeId) : it.responsible) : ''}</td>
                <td>{it.kind === 'A' && it.dueDate ? fmtDate(it.dueDate) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pp-note">Kennzeichnung: I = Information, F = Festlegung, A = Aufgabe. Einwände gegen dieses Protokoll bitten wir innerhalb von 7 Tagen nach Erhalt schriftlich mitzuteilen; andernfalls gilt es als anerkannt.</p>
        <p className="pp-sign">Aufgestellt: {author?.name || '–'}, {fmtDate(draft.createdAt || draft.date)}</p>
      </article>
    </div>
  );
}
