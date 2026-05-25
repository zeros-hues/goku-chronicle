'use client';

import { useState, useEffect } from 'react';
import type { View, Client, Member, BillingType } from '@/lib/data';
import * as api from '@/lib/api';
import { IconPlus, IconEdit, IconCheck, IconX } from './Icons';

type Section = Extract<View, 'clients' | 'team' | 'account'>;

const NAV: { id: Section; label: string }[] = [
  { id: 'clients', label: 'Clients & Projects' },
  { id: 'team',    label: 'Team Members'       },
  { id: 'account', label: 'Account'            },
];

const BILLING_LABELS: Record<BillingType, string> = {
  retainer: 'Retainer',
  out:      'Out of retainer',
  internal: 'Internal',
};

/* ── Clients & Projects ───────────────────────────────────── */
function ClientsSection({
  showToast,
  onClientsChange,
}: {
  showToast: (t: string) => void;
  onClientsChange: (clients: Client[]) => void;
}) {
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [editingProj, setEditing]     = useState<string | null>(null);
  const [projName, setProjName]       = useState('');
  const [editBilling, setEditBilling] = useState<BillingType>('retainer');
  const [addingToClient, setAddingTo] = useState<string | null>(null);
  const [newProjName, setNewProjName] = useState('');
  const [newProjBilling, setNewProjBilling] = useState<BillingType>('retainer');
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientRetainer, setNewClientRetainer] = useState(false);
  const [saving, setSaving]           = useState(false);

  async function load() {
    setError(false);
    setLoading(true);
    try {
      const data = await api.fetchClients();
      setClients(data);
      onClientsChange(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function saveProject(clientId: string, projId: string) {
    if (saving) return;
    setSaving(true);
    try {
      await api.updateProject(projId, projName, editBilling);
      const updated = await api.fetchClients();
      setClients(updated);
      onClientsChange(updated);
      setEditing(null);
      showToast('Project updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update project');
    } finally {
      setSaving(false);
    }
  }

  async function archiveProject(projId: string, projName: string) {
    try {
      await api.archiveProject(projId);
      const updated = await api.fetchClients();
      setClients(updated);
      onClientsChange(updated);
      showToast(`${projName} archived`);
    } catch {
      showToast('Failed to archive project');
    }
  }

  function startEditing(projId: string, name: string, billing: BillingType) {
    setEditing(projId);
    setProjName(name);
    setEditBilling(billing);
  }

  function startAddingProject(clientId: string) {
    const c = clients.find(x => x.id === clientId);
    setAddingTo(clientId);
    setNewProjName('');
    setNewProjBilling(c?.hasRetainership ? 'retainer' : 'internal');
  }

  async function addProject(clientId: string) {
    if (!newProjName.trim() || saving) return;
    const c = clients.find(x => x.id === clientId);
    const billing: BillingType = c?.hasRetainership ? newProjBilling : 'internal';
    // Check for duplicate project name under same client
    const existing = c?.projects.find(p => p.name.toLowerCase() === newProjName.trim().toLowerCase());
    if (existing) {
      showToast(`Project "${newProjName.trim()}" already exists under ${c?.name}`);
      return;
    }
    setSaving(true);
    try {
      await api.createProject(clientId, newProjName.trim(), billing);
      const updated = await api.fetchClients();
      setClients(updated);
      onClientsChange(updated);
      setAddingTo(null);
      setNewProjName('');
      showToast(`Project added — ${newProjName.trim()}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add project');
    } finally {
      setSaving(false);
    }
  }

  async function addClient() {
    if (!newClientName.trim() || saving) return;
    setSaving(true);
    try {
      await api.createClient(newClientName.trim(), newClientRetainer);
      const updated = await api.fetchClients();
      setClients(updated);
      onClientsChange(updated);
      setAddingClient(false);
      setNewClientName('');
      setNewClientRetainer(false);
      showToast(`Client "${newClientName.trim()}" added`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add client');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-body">
        <h2>Clients &amp; Projects</h2>
        <div style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '40px 0' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-body">
        <h2>Clients &amp; Projects</h2>
        <div style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '40px 0' }}>
          Failed to load clients.
        </div>
        <button className="btn" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="settings-body">
      <h2>Clients &amp; Projects</h2>
      <p className="lede">Manage the clients and projects that appear in your timesheet.</p>

      {clients.length === 0 && !addingClient && (
        <div className="empty" style={{ padding: '60px 24px' }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="empty-illustration" style={{ margin: '0 auto 18px', display: 'block' }}>
            <rect x="8" y="16" width="36" height="40" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <rect x="16" y="8" width="36" height="40" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4"/>
            <line x1="16" y1="28" x2="36" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3"/>
            <line x1="16" y1="36" x2="30" y2="36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3"/>
            <circle cx="50" cy="50" r="10" fill="var(--paper)" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="50" y1="46" x2="50" y2="54" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="46" y1="50" x2="54" y2="50" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <h3>No clients yet</h3>
          <p>Add your first client to start assigning projects.</p>
        </div>
      )}

      {clients.map(client => {
        const activeProjects  = client.projects.filter(p => !p.archivedAt);
        const archivedProjects = client.projects.filter(p => p.archivedAt);
        return (
          <div key={client.id} className="proj-list-card">
            <div className="proj-list-h">
              <span className="client-name">{client.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-fade)' }}>
                  {client.hasRetainership ? 'client' : 'internal'}
                </span>
                {client.hasRetainership && (
                  <span className="billing-badge retainer" style={{ fontSize: 9 }}>Retainership</span>
                )}
                <button className="btn btn-sm" onClick={() => startAddingProject(client.id)}>
                  <IconPlus size={12} /> Add project
                </button>
              </div>
            </div>

            {activeProjects.length === 0 && archivedProjects.length === 0 && (
              <div style={{ padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-ghost)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                No projects yet
              </div>
            )}

            {activeProjects.map(proj => (
              <div key={proj.id} className="proj-list-row">
                {editingProj === proj.id ? (
                  <>
                    <div className="name">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: proj.color, display: 'inline-block', flexShrink: 0 }} />
                      <input
                        className="field-input"
                        value={projName}
                        onChange={e => setProjName(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveProject(client.id, proj.id); if (e.key === 'Escape') setEditing(null); }}
                        style={{ padding: '4px 8px', height: 30, fontSize: 13 }}
                      />
                    </div>
                    {client.hasRetainership ? (
                      <div className="toggle-group" style={{ padding: 2 }}>
                        {(['retainer', 'out', 'internal'] as BillingType[]).map(b => (
                          <button key={b} className={editBilling === b ? 'active' : ''} onClick={() => setEditBilling(b)}>
                            {BILLING_LABELS[b]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="billing-badge internal">Internal</span>
                    )}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-icon" onClick={() => saveProject(client.id, proj.id)} disabled={saving}><IconCheck size={13} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(null)}><IconX size={13} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="name">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: proj.color, display: 'inline-block', flexShrink: 0 }} />
                      {proj.name}
                    </div>
                    <span className={`billing-badge ${proj.billing}`}>{BILLING_LABELS[proj.billing]}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => startEditing(proj.id, proj.name, proj.billing)}>
                        <IconEdit size={13} />
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, color: 'var(--ink-fade)' }}
                        onClick={() => archiveProject(proj.id, proj.name)}>
                        Archive
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {archivedProjects.length > 0 && (
              <div style={{ borderTop: '1px dashed var(--paper-rule)', padding: '8px 18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-ghost)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 6 }}>
                  Archived
                </div>
                {archivedProjects.map(proj => (
                  <div key={proj.id} className="proj-list-row" style={{ opacity: 0.45 }}>
                    <div className="name">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: proj.color, display: 'inline-block', flexShrink: 0 }} />
                      {proj.name}
                    </div>
                    <span className={`billing-badge ${proj.billing}`}>{BILLING_LABELS[proj.billing]}</span>
                    <button className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10 }}
                      onClick={() => archiveProject(proj.id, proj.name)}>
                      Unarchive
                    </button>
                  </div>
                ))}
              </div>
            )}

            {addingToClient === client.id && (
              <div style={{ padding: '12px 18px', borderTop: '1px dashed var(--paper-rule)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: client.hasRetainership ? 10 : 0 }}>
                  <input
                    className="field-input"
                    value={newProjName}
                    onChange={e => setNewProjName(e.target.value)}
                    placeholder="Project name"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') addProject(client.id); if (e.key === 'Escape') setAddingTo(null); }}
                    style={{ padding: '6px 10px', fontSize: 13 }}
                  />
                  <button className="btn btn-sm btn-icon" onClick={() => addProject(client.id)} disabled={saving}><IconCheck size={13} /></button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setAddingTo(null)}><IconX size={13} /></button>
                </div>
                {client.hasRetainership && (
                  <div className="toggle-group" style={{ padding: 2 }}>
                    {(['retainer', 'out', 'internal'] as BillingType[]).map(b => (
                      <button key={b} className={newProjBilling === b ? 'active' : ''} onClick={() => setNewProjBilling(b)}>
                        {BILLING_LABELS[b]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {addingClient ? (
        <div className="proj-list-card" style={{ padding: '16px 18px', marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              className="field-input"
              value={newClientName}
              onChange={e => setNewClientName(e.target.value)}
              placeholder="Client name"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addClient(); if (e.key === 'Escape') setAddingClient(false); }}
              style={{ maxWidth: 280 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span className="field-label" style={{ margin: 0 }}>Has retainership?</span>
            <div className="toggle-group" style={{ padding: 2 }}>
              <button className={!newClientRetainer ? 'active' : ''} onClick={() => setNewClientRetainer(false)}>No</button>
              <button className={newClientRetainer ? 'active' : ''} onClick={() => setNewClientRetainer(true)}>Yes</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={addClient} disabled={saving}><IconCheck size={13} /> Add client</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAddingClient(false); setNewClientRetainer(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 4 }} onClick={() => setAddingClient(true)}>
          <IconPlus size={14} /> Add client
        </button>
      )}
    </div>
  );
}

/* ── Team Members ─────────────────────────────────────────── */
function TeamSection({
  showToast,
  onMembersChange,
}: {
  showToast: (t: string) => void;
  onMembersChange: (members: Member[]) => void;
}) {
  const [members, setMembers]     = useState<Member[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [editingId, setEditing]   = useState<string | null>(null);
  const [editName, setEditName]   = useState('');
  const [editWa, setEditWa]       = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName]     = useState('');
  const [newInit, setNewInit]     = useState('');
  const [saving, setSaving]       = useState(false);

  async function load() {
    setError(false);
    setLoading(true);
    try {
      const data = await api.fetchMembers();
      setMembers(data);
      onMembersChange(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function saveMember(id: string, index: number) {
    if (saving) return;
    setSaving(true);
    try {
      const m = members.find(x => x.id === id);
      await api.updateMember(id, { name: editName, whatsappNumber: editWa || undefined }, index);
      const updated = await api.fetchMembers();
      setMembers(updated);
      onMembersChange(updated);
      setEditing(null);
      showToast(`${editName || m?.name} updated`);
    } catch {
      showToast('Failed to update member');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, index: number) {
    const m = members.find(x => x.id === id);
    if (!m) return;
    try {
      await api.deactivateMember(id, !m.active, index);
      const updated = await api.fetchMembers();
      setMembers(updated);
      onMembersChange(updated);
      showToast(m.active ? `${m.name} deactivated` : `${m.name} activated`);
    } catch {
      showToast('Failed to update member');
    }
  }

  async function addMember() {
    if (!newName.trim() || !newInit.trim() || saving) return;
    setSaving(true);
    try {
      await api.createMember(newName.trim(), newInit.trim().toUpperCase());
      const updated = await api.fetchMembers();
      setMembers(updated);
      onMembersChange(updated);
      setAddingNew(false);
      setNewName('');
      setNewInit('');
      showToast(`Team member added — ${newName.trim()}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-body">
        <h2>Team Members</h2>
        <div style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '40px 0' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-body">
        <h2>Team Members</h2>
        <div style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '40px 0' }}>
          Failed to load team members.
        </div>
        <button className="btn" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="settings-body">
      <h2>Team Members</h2>
      <p className="lede">Active members appear in the timesheet. Inactive members are hidden from new entries.</p>

      {members.length === 0 && !addingNew && (
        <div className="empty" style={{ padding: '60px 24px' }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="empty-illustration" style={{ margin: '0 auto 18px', display: 'block' }}>
            <circle cx="28" cy="22" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M8 54c0-11 9-18 20-18s20 7 20 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <circle cx="50" cy="50" r="10" fill="var(--paper)" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="50" y1="46" x2="50" y2="54" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="46" y1="50" x2="54" y2="50" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <h3>No team members yet</h3>
          <p>Invite team members to start tracking individual hours.</p>
        </div>
      )}

      {members.length > 0 && (
        <div className="proj-list-card">
          <div className="team-card">
            {members.map((m, index) => (
              <div key={m.id} className="team-row">
                <div className="av" style={{ background: m.color }}>{m.init.slice(0, 1)}</div>
                {editingId === m.id ? (
                  <>
                    <div className="nm" style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '2 / 4' }}>
                      <input className="field-input" value={editName} onChange={e => setEditName(e.target.value)}
                        placeholder="Name" autoFocus style={{ padding: '4px 8px', height: 30, fontSize: 13, maxWidth: 160 }}
                        onKeyDown={e => { if (e.key === 'Enter') saveMember(m.id, index); if (e.key === 'Escape') setEditing(null); }} />
                      <input className="field-input" value={editWa} onChange={e => setEditWa(e.target.value)}
                        placeholder="+91 98XXX XXXXX" style={{ padding: '4px 8px', height: 30, fontSize: 12, maxWidth: 160 }} />
                    </div>
                    <span />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-icon" onClick={() => saveMember(m.id, index)} disabled={saving}><IconCheck size={13} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(null)}><IconX size={13} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="nm" style={{ opacity: m.active ? 1 : 0.5 }}>
                      {m.name}
                      <span className="init">{m.init}</span>
                    </div>
                    <span className="wa" style={{ opacity: m.active ? 1 : 0.5 }}>{m.wa || '—'}</span>
                    <span
                      className={`status-dot${m.active ? '' : ' off'}`}
                      title={m.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleActive(m.id, index)}
                    />
                    <button className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => { setEditing(m.id); setEditName(m.name); setEditWa(m.wa); }}>
                      <IconEdit size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {addingNew ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <input className="field-input" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Full name" autoFocus style={{ maxWidth: 200 }}
            onKeyDown={e => { if (e.key === 'Enter') addMember(); if (e.key === 'Escape') setAddingNew(false); }} />
          <input className="field-input" value={newInit} onChange={e => setNewInit(e.target.value)}
            placeholder="Initials" style={{ maxWidth: 80 }} />
          <button className="btn btn-sm" onClick={addMember} disabled={saving}><IconCheck size={13} /> Add</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingNew(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 4 }} onClick={() => setAddingNew(true)}>
          <IconPlus size={14} /> Invite member
        </button>
      )}
    </div>
  );
}

/* ── Account ──────────────────────────────────────────────── */
function AccountSection({
  showToast,
  onHolidaysChange,
}: {
  showToast: (t: string) => void;
  onHolidaysChange: (holidays: Record<string, string>) => void;
}) {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [hoursTarget, setHoursTarget] = useState(8);
  const [overtimeThreshold, setOvertimeThreshold] = useState(8);
  const [holidays, setHolidays]     = useState<{ id: string; date: string; label: string | null }[]>([]);

  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [pwError, setPwError]       = useState('');
  const [pwSaving, setPwSaving]     = useState(false);

  const [newHolDate, setNewHolDate] = useState('');
  const [newHolLabel, setNewHolLabel] = useState('');
  const [holSaving, setHolSaving]   = useState(false);
  const [workSaving, setWorkSaving] = useState(false);

  async function load() {
    setError(false);
    setLoading(true);
    try {
      const account = await api.fetchAccount();
      setHoursTarget(account.hoursTarget);
      setOvertimeThreshold(account.overtimeThreshold);
      setHolidays(account.holidays);
      const hmap: Record<string, string> = {};
      for (const h of account.holidays) hmap[h.date.slice(0, 10)] = h.label ?? '';
      onHolidaysChange(hmap);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw) { setPwError('Enter your current password'); return; }
    if (!newPw) { setPwError('Enter a new password'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      await api.changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setPwError('');
      showToast('Password updated');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  }

  async function saveWorkSettings() {
    setWorkSaving(true);
    try {
      await api.updateAccount({ hoursTarget, overtimeThreshold });
      showToast('Work settings saved');
    } catch {
      showToast('Failed to save work settings');
    } finally {
      setWorkSaving(false);
    }
  }

  async function addHoliday() {
    if (!newHolDate || holSaving) return;
    setHolSaving(true);
    try {
      const h = await api.addHoliday(newHolDate, newHolLabel);
      const updated = [...holidays, h];
      setHolidays(updated);
      const hmap: Record<string, string> = {};
      for (const hol of updated) hmap[hol.date.slice(0, 10)] = hol.label ?? '';
      onHolidaysChange(hmap);
      setNewHolDate('');
      setNewHolLabel('');
      showToast('Holiday added');
    } catch {
      showToast('Failed to add holiday');
    } finally {
      setHolSaving(false);
    }
  }

  async function removeHoliday(id: string) {
    try {
      await api.removeHoliday(id);
      const updated = holidays.filter(h => h.id !== id);
      setHolidays(updated);
      const hmap: Record<string, string> = {};
      for (const hol of updated) hmap[hol.date.slice(0, 10)] = hol.label ?? '';
      onHolidaysChange(hmap);
      showToast('Holiday removed');
    } catch {
      showToast('Failed to remove holiday');
    }
  }

  if (loading) {
    return (
      <div className="settings-body">
        <h2>Account</h2>
        <div style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '40px 0' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-body">
        <h2>Account</h2>
        <div style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '40px 0' }}>
          Failed to load account settings.
        </div>
        <button className="btn" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="settings-body">
      <h2>Account</h2>
      <p className="lede">Studio-wide settings for your Chronicle workspace.</p>

      {/* Change password */}
      <div className="proj-list-card" style={{ padding: '22px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-fade)', margin: '0 0 14px' }}>
          Change password
        </p>
        <form onSubmit={handlePasswordChange}>
          <div className="input-block">
            <label className="field-label">Current password</label>
            <input type="password" className="field-input" placeholder="••••••••"
              value={currentPw} onChange={e => { setCurrentPw(e.target.value); setPwError(''); }} />
          </div>
          <div className="input-block">
            <label className="field-label">New password</label>
            <input type="password" className="field-input" placeholder="••••••••"
              value={newPw} onChange={e => { setNewPw(e.target.value); setPwError(''); }} />
          </div>
          {pwError && (
            <div style={{ color: 'var(--accent)', fontSize: 12.5, marginBottom: 12, marginTop: -8 }}>{pwError}</div>
          )}
          <button type="submit" className="btn btn-primary" disabled={pwSaving}>
            <IconCheck size={14} /> {pwSaving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>

      <div className="divider" style={{ margin: '24px 0' }} />

      {/* Work settings */}
      <div className="proj-list-card" style={{ padding: '22px 24px', marginBottom: 14 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-fade)', margin: '0 0 14px' }}>
          Work settings
        </p>
        <div className="input-block">
          <label className="field-label">Daily hour target per person</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" className="field-input" value={hoursTarget} min={1} max={24}
              style={{ maxWidth: 100 }}
              onChange={e => setHoursTarget(Number(e.target.value))} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-fade)' }}>hours / day</span>
          </div>
        </div>
        <div className="input-block">
          <label className="field-label">Overtime threshold</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" className="field-input" value={overtimeThreshold} min={1} max={24}
              style={{ maxWidth: 100 }}
              onChange={e => setOvertimeThreshold(Number(e.target.value))} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-fade)' }}>hours / day</span>
          </div>
        </div>
        <button className="btn" onClick={saveWorkSettings} disabled={workSaving}>
          <IconCheck size={14} /> {workSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="divider" style={{ margin: '24px 0' }} />

      {/* Holidays */}
      <div className="proj-list-card" style={{ padding: '22px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-fade)', margin: '0 0 14px' }}>
          Public holidays
        </p>
        {holidays.length === 0 ? (
          <p style={{ color: 'var(--ink-fade)', fontSize: 13, margin: '0 0 16px' }}>No holidays added yet.</p>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {holidays.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--paper-rule)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-fade)' }}>
                  {h.date.slice(0, 10)}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{h.label || '—'}</span>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--accent)' }}
                  onClick={() => removeHoliday(h.id)}>
                  <IconX size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" className="field-input" value={newHolDate} onChange={e => setNewHolDate(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, maxWidth: 160 }} />
          <input className="field-input" value={newHolLabel} onChange={e => setNewHolLabel(e.target.value)}
            placeholder="Label (e.g. Republic Day)" style={{ maxWidth: 220 }} />
          <button className="btn btn-sm" onClick={addHoliday} disabled={!newHolDate || holSaving}>
            <IconPlus size={12} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────── */
interface SettingsPageProps {
  section: Section;
  onNavigate: (v: View) => void;
  showToast: (t: string) => void;
  onClientsChange: (clients: Client[]) => void;
  onMembersChange: (members: Member[]) => void;
  onHolidaysChange: (holidays: Record<string, string>) => void;
}

export default function SettingsPage({ section, onNavigate, showToast, onClientsChange, onMembersChange, onHolidaysChange }: SettingsPageProps) {
  return (
    <div className="settings">
      <nav className="settings-nav">
        {NAV.map(n => (
          <div
            key={n.id}
            className={'item' + (section === n.id ? ' active' : '')}
            role="button" tabIndex={0}
            onClick={() => onNavigate(n.id)}
            onKeyDown={e => e.key === 'Enter' && onNavigate(n.id)}
          >
            {n.label}
          </div>
        ))}
      </nav>

      {section === 'clients' && <ClientsSection showToast={showToast} onClientsChange={onClientsChange} />}
      {section === 'team'    && <TeamSection    showToast={showToast} onMembersChange={onMembersChange} />}
      {section === 'account' && <AccountSection showToast={showToast} onHolidaysChange={onHolidaysChange} />}
    </div>
  );
}
