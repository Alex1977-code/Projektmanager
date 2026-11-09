import { Fragment, useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import { Modal, useConfirm } from '../components/Modal';
import { Card, EmptyState, Field, PageHeader } from '../components/ui';
import { PERMISSION_GROUPS } from '../../shared/permissions.js';
import type { RoleDef } from '../types';
import { classNames } from '../utils/format';

export function Roles() {
  const { data, can, update, remove, create, authMode } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const roles = data.roles;
  const members = (key: string) => data.employees.filter((e) => e.active && (e.appRole || 'mitarbeiter') === key).length;

  if (!can('roles.edit')) return <div className="page"><EmptyState title="Kein Zugriff" text="Rollen und Rechte verwaltet die Administration." /></div>;

  const toggle = async (role: RoleDef, perm: string) => {
    if (role.key === 'admin') return;
    const has = role.permissions.includes(perm);
    const permissions = has ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    await update('roles', role.id, { permissions });
  };
  const del = async (role: RoleDef) => {
    if (await confirm({ title: `Rolle „${role.name}“ löschen?`, message: 'Die Rolle wird entfernt. Sie darf keiner Person mehr zugewiesen sein.', confirmLabel: 'Löschen', danger: true })) {
      if (await remove('roles', role.id)) toast.success('Rolle gelöscht');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Rollen & Rechte" subtitle="Welche Rolle darf was? Änderungen gelten sofort für alle Personen mit dieser Rolle."
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Neue Rolle</button>} />

      {authMode === 'none' && (
        <p className="tpl-hint">Hinweis: Ohne Anmeldung (Demo / veröffentlichte Version) gelten für alle Personen alle Rechte. Die Rollen wirken, sobald die Anmeldung über Active Directory oder Windows aktiv ist.</p>
      )}

      <Card padded={false} title="Rechte-Matrix" subtitle="Ohne besonderes Recht darf jede Person: Projekte, Termine und Aufgaben ansehen, eigene Projektzeiten und Arbeitszeiten erfassen, eigene Abwesenheiten beantragen.">
        <div className="table-wrap">
          <table className="table perm-table">
            <thead>
              <tr>
                <th>Recht</th>
                {roles.map((r) => (
                  <th key={r.id} className="perm-role">
                    <span>{r.name}</span>
                    <small>{members(r.key)} Person(en)</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => (
                <Fragment key={g.group}>
                  <tr className="perm-group"><td colSpan={roles.length + 1}>{g.group}</td></tr>
                  {g.items.map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      {roles.map((r) => {
                        const on = r.key === 'admin' || r.permissions.includes(key);
                        return (
                          <td key={r.id} className="perm-cell">
                            <label className={classNames('perm-check', on && 'on', r.key === 'admin' && 'locked')} title={r.key === 'admin' ? 'Administration hat immer alle Rechte' : `${label} – ${r.name}`}>
                              <input type="checkbox" checked={on} disabled={r.key === 'admin'} onChange={() => toggle(r, key)} aria-label={`${label} für ${r.name}`} />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="people-grid">
        {roles.map((r) => (
          <article key={r.id} className="person-card readonly role-card">
            <header>
              <div>
                <strong>{r.name}{r.system && <Lock size={12} className="muted" style={{ marginLeft: 6 }} aria-label="Standardrolle" />}</strong>
                <small>{r.key === 'admin' ? 'alle Rechte' : `${r.permissions.length} Rechte`} · {members(r.key)} Person(en)</small>
              </div>
            </header>
            <input className="role-desc" defaultValue={r.description || ''} placeholder="Beschreibung" onBlur={(e) => e.target.value !== (r.description || '') && update('roles', r.id, { description: e.target.value })} aria-label="Beschreibung" />
            <footer>
              <span className="muted small">Schlüssel: <code>{r.key}</code></span>
              <span className="spacer" />
              {!r.system && <button className="icon-btn danger" onClick={() => del(r)} aria-label="Rolle löschen"><Trash2 size={15} /></button>}
            </footer>
          </article>
        ))}
      </div>
      <p className="footnote">
        Zuweisung: unter Team → Mitarbeiter bearbeiten → „Berechtigung“. Mit Active Directory kann die Rolle auch aus AD-Gruppen kommen
        (<code>LDAP_GROUP_ADMIN</code>, <code>LDAP_GROUP_LEITUNG</code>, <code>LDAP_ROLE_GROUPS=controlling=PM-Controlling;extern=PM-Extern</code>).
      </p>
      {adding && <NewRoleDialog onClose={() => setAdding(false)} create={create} roles={roles} />}
    </div>
  );
}

function NewRoleDialog({ onClose, create, roles }: { onClose: () => void; create: ReturnType<typeof useStore>['create']; roles: RoleDef[] }) {
  const [name, setName] = useState('');
  const [copy, setCopy] = useState('mitarbeiter');
  const toast = useToast();
  const submit = async () => {
    if (!name.trim()) return toast.error('Bitte einen Namen angeben');
    const base = roles.find((r) => r.key === copy);
    try {
      await create('roles', { name: name.trim(), description: '', permissions: base ? [...base.permissions] : [] });
      toast.success(`Rolle „${name}“ angelegt`);
      onClose();
    } catch { /* gemeldet */ }
  };
  return (
    <Modal title="Neue Rolle" onClose={onClose} width={460}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={submit}>Anlegen</button></>}>
      <div className="form-grid">
        <Field label="Name" span={2}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bauüberwachung" autoFocus /></Field>
        <Field label="Rechte übernehmen von" span={2}>
          <select value={copy} onChange={(e) => setCopy(e.target.value)}>
            <option value="">– keine Rechte –</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
