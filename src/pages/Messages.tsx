// Internes Nachrichtensystem: Unterhaltungen zwischen Mitarbeitenden, optional mit Verweis auf eine Auswertung o. Ä.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, EyeOff, ExternalLink, Mail, MailOpen, PenSquare, Search, Send } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Avatar, EmptyState, Field, PageHeader } from '../components/ui';
import type { Employee, ID, Message } from '../types';
import { classNames } from '../utils/format';
import { fmtDate, todayISO } from '../utils/date';

const when = (iso: string) => {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return day === todayISO() ? time : `${fmtDate(day)} ${time}`;
};

/** Nachrichten der gewählten Person (ohne ausgeblendete). */
export function useMyMessages() {
  const { data, me } = useStore();
  return useMemo(() => {
    if (!me) return { mine: [] as Message[], unread: 0 };
    const mine = (data.messages || []).filter((m) => (m.fromId === me.id || m.toIds.includes(me.id)) && !(m.hiddenBy || []).includes(me.id));
    return { mine, unread: mine.filter((m) => m.fromId !== me.id && !(m.readBy || []).includes(me.id)).length };
  }, [data.messages, me]);
}

interface Thread { id: ID; messages: Message[]; last: Message; unread: number; people: ID[]; subject: string }

export function Messages() {
  const { idx, me, reload } = useStore();
  const toast = useToast();
  const { mine } = useMyMessages();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [compose, setCompose] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const openId = Number(params.get('n')) || null;

  const threads = useMemo<Thread[]>(() => {
    if (!me) return [];
    const map = new Map<ID, Message[]>();
    for (const m of mine) { const k = m.threadId || m.id; map.set(k, [...(map.get(k) || []), m]); }
    return [...map.entries()].map(([id, list]) => {
      const messages = list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const people = [...new Set(messages.flatMap((m) => [m.fromId, ...m.toIds]))].filter((p) => p !== me.id);
      return { id, messages, last: messages[messages.length - 1], unread: messages.filter((m) => m.fromId !== me.id && !m.readBy.includes(me.id)).length, people, subject: messages[0].subject || '(ohne Betreff)' };
    }).sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [mine, me]);
  const name = (id: ID) => idx.employeeById.get(id)?.name || 'Unbekannt';
  const shown = threads.filter((t) => (!onlyUnread || t.unread > 0) && (!q || `${t.subject} ${t.people.map(name).join(' ')} ${t.messages.map((m) => m.body).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const open = threads.find((t) => t.id === openId) || null;

  // Öffnen markiert als gelesen
  const unreadIds = open && me ? open.messages.filter((m) => m.fromId !== me.id && !m.readBy.includes(me.id)).map((m) => m.id).join(',') : '';
  useEffect(() => {
    if (!unreadIds || !me) return;
    api.post('/api/messages/read', { ids: unreadIds.split(',').map(Number), actorId: me.id }).then(() => reload()).catch(() => {});
  }, [unreadIds, me, reload]);

  if (!me) return <div className="page"><EmptyState title="Kein Mitarbeiterprofil" text="Nachrichten werden zwischen Personen mit Mitarbeiterprofil ausgetauscht." /></div>;

  const act = async (path: string, body: Record<string, unknown>, done?: string) => {
    try { await api.post(path, { ...body, actorId: me.id }); await reload(); if (done) toast.success(done); } catch (e) { toast.error((e as Error).message); }
  };
  const sendReply = async () => {
    if (!open || !reply.trim() || busy) return;
    setBusy(true);
    try {
      await api.post('/api/messages', { actorId: me.id, toIds: open.people, subject: open.subject, body: reply.trim(), threadId: open.id });
      setReply('');
      await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHeader title="Nachrichten" subtitle="Interne Mitteilungen – auch zum Teilen von Auswertungen"
        actions={<button className="btn btn-primary" onClick={() => setCompose(true)}><PenSquare size={16} /> Neue Nachricht</button>} />
      <div className={classNames('msg-layout', open && 'has-open')}>
        <aside className="msg-list">
          <div className="msg-filter">
            <div className="search-input"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nachrichten durchsuchen …" /></div>
            <label className="check-inline"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> nur ungelesene</label>
          </div>
          {shown.length === 0 ? <EmptyState icon={<Mail size={22} />} title={threads.length ? 'Keine Treffer' : 'Noch keine Nachrichten'} text={threads.length ? undefined : 'Schreiben Sie die erste Nachricht an eine Kollegin oder einen Kollegen.'} /> : (
            <ul>
              {shown.map((t) => (
                <li key={t.id}>
                  <button className={classNames('msg-item', t.id === openId && 'active', t.unread > 0 && 'unread')} onClick={() => setParams({ n: String(t.id) }, { replace: true })}>
                    <Avatar employee={idx.employeeById.get(t.last.fromId === me.id ? t.people[0] : t.last.fromId)} size={34} />
                    <span className="msg-item-main">
                      <span className="msg-item-top"><strong>{t.people.slice(0, 2).map((p) => name(p).split(' ')[0]).join(', ')}{t.people.length > 2 ? ` +${t.people.length - 2}` : ''}</strong><time>{when(t.last.createdAt)}</time></span>
                      <span className="msg-item-subject">{t.subject}{t.messages.length > 1 && <em>{t.messages.length}</em>}</span>
                      <span className="msg-item-snippet">{t.last.fromId === me.id ? 'Sie: ' : ''}{t.last.body}</span>
                    </span>
                    {t.unread > 0 && <i className="msg-dot" aria-label={`${t.unread} ungelesen`} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="msg-thread">
          {!open ? <EmptyState icon={<MailOpen size={22} />} title="Unterhaltung wählen" text="Links eine Unterhaltung öffnen oder eine neue Nachricht schreiben." /> : (
            <>
              <header className="msg-thread-head">
                <button className="icon-btn msg-back" onClick={() => setParams({}, { replace: true })} aria-label="Zur Liste"><ArrowLeft size={18} /></button>
                <div>
                  <h3>{open.subject}</h3>
                  <small>mit {open.people.map(name).join(', ')}</small>
                </div>
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={() => { act('/api/messages/read', { ids: open.messages.map((m) => m.id), read: false }); setParams({}, { replace: true }); }} title="Als ungelesen markieren"><Mail size={14} /> Ungelesen</button>
                <button className="btn btn-sm btn-ghost" onClick={() => { act('/api/messages/hide', { ids: open.messages.map((m) => m.id) }, 'Unterhaltung ausgeblendet'); setParams({}, { replace: true }); }} title="Für mich ausblenden"><EyeOff size={14} /> Ausblenden</button>
              </header>
              <div className="msg-body">
                {open.messages.map((m) => {
                  const own = m.fromId === me.id;
                  return (
                    <article key={m.id} className={classNames('msg-bubble', own && 'own')}>
                      {!own && <Avatar employee={idx.employeeById.get(m.fromId)} size={30} />}
                      <div>
                        <header><strong>{own ? 'Sie' : name(m.fromId)}</strong><time>{when(m.createdAt)}</time></header>
                        <p>{m.body}</p>
                        {m.link && <Link to={m.link} className="msg-link"><ExternalLink size={13} /> {m.linkLabel || 'Verweis öffnen'}</Link>}
                        {own && <footer>{m.toIds.every((t) => m.readBy.includes(t)) ? 'gelesen' : m.toIds.some((t) => m.readBy.includes(t)) ? `gelesen von ${m.toIds.filter((t) => m.readBy.includes(t)).length} von ${m.toIds.length}` : 'zugestellt'}</footer>}
                      </div>
                    </article>
                  );
                })}
              </div>
              <footer className="msg-reply">
                <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Antwort an ${open.people.map((p) => name(p).split(' ')[0]).join(', ')} …`} aria-label="Antwort"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }} />
                <button className="btn btn-primary" onClick={sendReply} disabled={!reply.trim() || busy} title="Senden (Strg + Enter)"><Send size={16} /> Senden</button>
              </footer>
            </>
          )}
        </section>
      </div>
      {compose && <ComposeDialog onClose={() => setCompose(false)} onSent={(m) => setParams({ n: String(m.id) }, { replace: true })} />}
    </div>
  );
}

/** Neue Nachricht – auch von anderen Seiten aus (z. B. „Auswertung senden“). */
export function ComposeDialog({ onClose, onSent, defaults }: { onClose: () => void; onSent?: (m: Message) => void; defaults?: { subject?: string; body?: string; link?: string; linkLabel?: string; toIds?: ID[] } }) {
  const { data, me, reload } = useStore();
  const toast = useToast();
  const [to, setTo] = useState<Set<ID>>(new Set(defaults?.toIds || []));
  const [subject, setSubject] = useState(defaults?.subject || '');
  const [body, setBody] = useState(defaults?.body || '');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const people = data.employees.filter((e) => e.active && e.id !== me?.id).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const groups: [string, (e: Employee) => boolean][] = [
    ['Alle', () => true],
    ['Leitung', (e) => ['admin', 'leitung'].includes(e.appRole || '')],
    ...[...new Set(people.map((e) => e.department).filter(Boolean))].slice(0, 4).map((d) => [d as string, (e: Employee) => e.department === d] as [string, (e: Employee) => boolean]),
  ];
  const toggle = (id: ID) => setTo((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pick = (f: (e: Employee) => boolean) => setTo((s) => { const ids = people.filter(f).map((e) => e.id); const allIn = ids.every((i) => s.has(i)); const n = new Set(s); ids.forEach((i) => (allIn ? n.delete(i) : n.add(i))); return n; });
  const send = async () => {
    if (!me) return;
    if (!to.size) return toast.error('Bitte mindestens eine Empfängerin oder einen Empfänger wählen.');
    if (!body.trim()) return toast.error('Die Nachricht ist leer.');
    setBusy(true);
    try {
      const m = await api.post<Message>('/api/messages', { actorId: me.id, toIds: [...to], subject: subject.trim(), body: body.trim(), link: defaults?.link, linkLabel: defaults?.linkLabel });
      await reload();
      toast.success(`Nachricht an ${to.size} Person${to.size > 1 ? 'en' : ''} gesendet`);
      onSent?.(m);
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Neue Nachricht" onClose={onClose} width={620}
      footer={<><span className="muted small" style={{ marginRight: 'auto' }}>{to.size} Empfänger</span><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy} onClick={send}><Send size={15} /> Senden</button></>}>
      <div className="form-grid">
        <div className="field field-span2">
          <span className="field-label">An</span>
          <div className="rcpt-groups">
            {groups.map(([label, f]) => <button key={label} type="button" className="chip-btn" onClick={() => pick(f)}>{label}</button>)}
            <input className="rcpt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Person suchen …" aria-label="Person suchen" />
          </div>
          <div className="rcpt-list">
            {people.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase())).map((e) => (
              <label key={e.id} className={classNames('rcpt', to.has(e.id) && 'on')}>
                <input type="checkbox" checked={to.has(e.id)} onChange={() => toggle(e.id)} />
                <Avatar employee={e} size={22} /> <span>{e.name}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label="Betreff" span={2}><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Worum geht es?" /></Field>
        <Field label="Nachricht" span={2}><textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} autoFocus={!!defaults?.link} /></Field>
        {defaults?.link && <p className="field-span2 msg-attach"><ExternalLink size={14} /> Verweis wird angehängt: <strong>{defaults.linkLabel || defaults.link}</strong></p>}
      </div>
    </Modal>
  );
}
