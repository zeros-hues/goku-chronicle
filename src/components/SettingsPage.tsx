'use client';

import { useState } from 'react';
import { CLIENTS, MEMBERS } from '@/lib/data';
import type { View, Client, Member, BillingType } from '@/lib/data';
import { IconPlus, IconEdit, IconCheck, IconX, IconArchive } from './Icons';

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
function ClientsSection({ showToast }: { showToast: (t: string) => void }) {
  const [clients, setClients]         = useState<Client[]>(CLIENTS);
  const [editingProj, setEditing]     = useState<string | null>(null);
  const [projName, setProjName]       = useState('');
  const [editBilling, setEditBilling] = useState<BillingType>('retainer');
  const [addingToClient, setAddingTo] = useState<string | null>(null);
  const [newProjName, setNewProjName] = useState('');
  const [newProjBilling, setNewProjBilling] = useState<BillingType>('retainer');
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientRetainer, setNewClientRetainer] = useState(false);

  function saveProject(clientId: string, projId: string) {
    setClients(prev => prev.map(c =>
      c.id !== clientId ? c : {
        ...c,
        projects: c.projects.map(p => p.id !== projId ? p : { ...p, name: projName, billing: editBilling }),
      }
    ));
    setEditing(null);
    showToast('Project updated');
  }

  function toggleArchiveProject(clientId: string, projId: string) {
    const proj = clients.find(c => c.id === clientId)?.projects.find(p => p.id === projId);
    if (!proj) return;
    const willArchive = !proj.archived;
    setClients(prev => prev.map(c =>
      c.id !== clientId ? c : {
        ...c,
        projects: c.projects.map(p => p.id !== projId ? p : { ...p, archived: !p.archived }),
      }
    ));
    showToast(willArchive ? `${proj.name} archived` : `${proj.name} unarchived`);
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

  function addProject(clientId: string) {
    if (!newProjName.trim()) return;
    const c = clients.find(x => x.id === clientId);
    const billing: BillingType = c?.hasRetainership ? newProjBilling : 'internal';
    const newProj = {
      id: newProjName.toLowerCase().replace(/\s+/g, '-'),
      name: newProjName.trim(),
      color: 'var(--c-autoref)',
      billing,
    };
    setClients(prev => prev.map(cl =>
      cl.id !== clientId ? cl : { ...cl, projects: [...cl.projects, newProj] }
    ));
    setAddingTo(null);
    setNewProjName('');
    showToast(`Project added — ${newProj.name}`);
  }

  function addClient() {
    if (!newClientName.trim()) return;
    const newClient: Client = {
      id: newClientName.toLowerCase().replace(/\s+/g, '-'),
      name: newClientName.trim(),
      type: 'client',
      projects: [],
      hasRetainership: newClientRetainer,
    };
    setClients(prev => [...prev, newClient]);
    setAddingClient(false);
    setNewClientName('');
    setNewClientRetainer(false);
    showToast(`Client "${newClient.name}" added`);
  }

  if (clients.length === 0) {
    return (
      <div className="settings-body">
        <h2>Clients & Projects</h2>
        <p className="lede">Manage the clients and projects that appear in your timesheet.</p>
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
        <button className="btn" onClick={() => setAddingClient(true)}><IconPlus size={14} /> Add client</button>
      </div>
    );
  }

  return (
    <div className="settings-body">
      <h2>Clients & Projects</h2>
      <p className="lede">Manage the clients and projects that appear in your timesheet.</p>

      {clients.map(client => (
        <div key={client.id} className="proj-list-card">
          <div className="proj-list-h">
            <span className="client-name">{client.name}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-fade)' }}>{client.type}</span>
              {client.hasRetainership && (
                <span className="billing-badge retainer" style={{ fontSize: 9 }}>Retainership</span>
              )}
              <button className="btn btn-sm" onClick={() => startAddingProject(client.id)}>
                <IconPlus size={12} /> Add project
              </button>
            </div>
          </div>

          {client.projects.length === 0 && (
            <div style={{ padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-ghost)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
              No projects yet
            </div>
          )}

          {client.projects.map(proj => (
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
                    <button className="btn btn-sm btn-icon" onClick={() => saveProject(client.id, proj.id)}><IconCheck size={13} /></button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(null)}><IconX size={13} /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="name" style={{ opacity: proj.archived ? 0.45 : 1 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: proj.color, display: 'inline-block', flexShrink: 0 }} />
                    {proj.name}
                    {proj.archived && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--ink-ghost)', marginLeft: 6 }}>archived</span>
                    )}
                  </div>
                  <span className={`billing-badge ${proj.billing}`}>{BILLING_LABELS[proj.billing]}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => startEditing(proj.id, proj.name, proj.billing)}
                      title="Edit project">
                      <IconEdit size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => toggleArchiveProject(client.id, proj.id)}
                      title={proj.archived ? 'Unarchive' : 'Archive project'}
                      style={{ opacity: proj.archived ? 0.5 : 0.7 }}
                    >
                      <IconArchive size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

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
                <button className="btn btn-sm btn-icon" onClick={() => addProject(client.id)}><IconCheck size={13} /></button>
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
      ))}

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
            <button className="btn btn-sm" onClick={addClient}><IconCheck size={13} /> Add client</button>
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
function TeamSection({ showToast }: { showToast: (t: string) => void }) {
  const [members, setMembers]   = useState<Member[]>(MEMBERS);
  const [editingId, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editWa, setEditWa]     = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName]   = useState('');
  const [newInit, setNewInit]   = useState('');

  function saveMember(id: string) {
    setMembers(prev => prev.map(m => m.id !== id ? m : { ...m, name: editName, wa: editWa }));
    setEditing(null);
    showToast('Member updated');
  }

  function toggleActive(id: string) {
    setMembers(prev => prev.map(m => m.id !== id ? m : { ...m, active: !m.active }));
    const m = members.find(x => x.id === id);
    showToast(m?.active ? `${m.name} deactivated` : `${m?.name} activated`);
  }

  function addMember() {
    if (!newName.trim() || !newInit.trim()) return;
    const nm: Member = {
      id: newName.toLowerCase().replace(/\s+/g, '-'),
      name: newName.trim(),
      init: newInit.trim().toUpperCase(),
      avatarClass: 'av-0',
      color: 'var(--c-autoref)',
      active: true,
      wa: '',
    };
    setMembers(prev => [...prev, nm]);
    setAddingNew(false);
    setNewName('');
    setNewInit('');
    showToast(`Team member added — ${nm.name}`);
  }

  if (members.length === 0) {
    return (
      <div className="settings-body">
        <h2>Team Members</h2>
        <p className="lede">Active members appear in the timesheet. Inactive members are hidden from new entries.</p>
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
        <button className="btn" onClick={() => setAddingNew(true)}><IconPlus size={14} /> Invite member</button>
      </div>
    );
  }

  return (
    <div className="settings-body">
      <h2>Team Members</h2>
      <p className="lede">Active members appear in the timesheet. Inactive members are hidden from new entries.</p>

      <div className="proj-list-card">
        <div className="team-card">
          {members.map(m => (
            <div key={m.id} className="team-row">
              <div className="av" style={{ background: m.color }}>{m.init.slice(0, 1)}</div>
              {editingId === m.id ? (
                <>
                  <div className="nm" style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '2 / 4' }}>
                    <input className="field-input" value={editName} onChange={e => setEditName(e.target.value)}
                      placeholder="Name" autoFocus style={{ padding: '4px 8px', height: 30, fontSize: 13, maxWidth: 160 }}
                      onKeyDown={e => { if (e.key === 'Enter') saveMember(m.id); if (e.key === 'Escape') setEditing(null); }} />
                    <input className="field-input" value={editWa} onChange={e => setEditWa(e.target.value)}
                      placeholder="+91 98XXX XXXXX" style={{ padding: '4px 8px', height: 30, fontSize: 12, maxWidth: 160 }} />
                  </div>
                  <span />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-icon" onClick={() => saveMember(m.id)}><IconCheck size={13} /></button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(null)}><IconX size={13} /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="nm">
                    {m.name}
                    <span className="init">{m.init}</span>
                  </div>
                  <span className="wa">{m.wa || '—'}</span>
                  <span
                    className={`status-dot${m.active ? '' : ' off'}`}
                    title={m.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleActive(m.id)}
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

      {addingNew ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <input className="field-input" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Full name" autoFocus style={{ maxWidth: 200 }}
            onKeyDown={e => { if (e.key === 'Enter') addMember(); if (e.key === 'Escape') setAddingNew(false); }} />
          <input className="field-input" value={newInit} onChange={e => setNewInit(e.target.value)}
            placeholder="Initials" style={{ maxWidth: 80 }} />
          <button className="btn btn-sm" onClick={addMember}><IconCheck size={13} /> Add</button>
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
function AccountSection({ showToast }: { showToast: (t: string) => void }) {
  const [studioName, setStudioName] = useState('Goku Studio');
  const [email,      setEmail]      = useState('admin@gokustudio.com');
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [pwError,    setPwError]    = useState('');
  const [dirty,      setDirty]      = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPw && !currentPw) { setPwError('Enter your current password'); return; }
    if (newPw && currentPw !== 'chronicle2026') { setPwError('Current password is incorrect'); return; }
    if (newPw && newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    const hadPasswordChange = Boolean(newPw);
    setPwError('');
    setCurrentPw('');
    setNewPw('');
    setDirty(false);
    showToast(hadPasswordChange ? 'Password updated' : 'Settings saved');
  }

  return (
    <div className="settings-body">
      <h2>Account</h2>
      <p className="lede">Studio-wide settings for your Chronicle workspace.</p>

      <div className="proj-list-card" style={{ padding: '22px 24px' }}>
        <form onSubmit={handleSave} onChange={() => setDirty(true)}>
          <div className="input-block">
            <label className="field-label">Studio name</label>
            <input className="field-input" value={studioName} onChange={e => setStudioName(e.target.value)} />
          </div>
          <div className="input-block">
            <label className="field-label">Admin email</label>
            <input type="email" className="field-input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="divider" style={{ margin: '20px 0' }} />

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-fade)', margin: '0 0 14px' }}>
            Change password
          </p>
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

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">
              <IconCheck size={14} /> Save changes
            </button>
            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={() => {
                setStudioName('Goku Studio');
                setEmail('admin@gokustudio.com');
                setCurrentPw('');
                setNewPw('');
                setPwError('');
                setDirty(false);
              }}>Discard</button>
            )}
          </div>
        </form>
      </div>

      <div className="divider" style={{ margin: '24px 0' }} />

      {/* Daily target */}
      <div className="proj-list-card" style={{ padding: '22px 24px', marginBottom: 14 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-fade)', margin: '0 0 14px' }}>
          Work settings
        </p>
        <div className="input-block">
          <label className="field-label">Daily hour target per person</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" className="field-input" defaultValue={8} min={1} max={24}
              style={{ maxWidth: 100 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-fade)' }}>hours / day</span>
          </div>
        </div>
        <button className="btn" onClick={() => showToast('Work settings saved')}><IconCheck size={14} /> Save</button>
      </div>

      <div style={{ marginTop: 8 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-fade)', margin: '0 0 12px' }}>
          Danger zone
        </p>
        <button
          className="btn"
          style={{ color: 'var(--accent)', borderColor: 'color-mix(in oklch, var(--accent) 35%, var(--paper-edge))' }}
          onClick={() => showToast('Delete workspace — contact support to proceed')}
        >
          Delete workspace
        </button>
      </div>
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────── */
interface SettingsPageProps {
  section: Section;
  onNavigate: (v: View) => void;
  showToast: (t: string) => void;
}

export default function SettingsPage({ section, onNavigate, showToast }: SettingsPageProps) {
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

      {section === 'clients' && <ClientsSection showToast={showToast} />}
      {section === 'team'    && <TeamSection    showToast={showToast} />}
      {section === 'account' && <AccountSection showToast={showToast} />}
    </div>
  );
}
