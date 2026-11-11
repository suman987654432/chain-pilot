'use client';

import React, { useState } from 'react';
import { apiCall, setStoredToken, setCachedSession, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { ShieldCheck, UserPlus, Lock, AlertCircle, Building2, Plus, ArrowRightLeft, Check, RefreshCw, Edit2, Trash2 } from 'lucide-react';

const ROLES_INFO: Record<string, { title: string; desc: string }> = {
  ADMIN: {
    title: 'Director / Executive Administrator',
    desc: 'Unrestricted enterprise privileges; approves POs above ₹10,00,000; configures tenant memberships.',
  },
  MANAGER: {
    title: 'Head of Supply Chain Management (SCM)',
    desc: 'Approves purchase requisitions and POs up to ₹10,00,000 (never own document); master setups.',
  },
  PLANNER: {
    title: 'Demand & Supply Planner',
    desc: 'Runs statistical forecasting, records promotional overrides, executes MRP/DRP, firms proposals, releases MOs.',
  },
  BUYER: {
    title: 'Procurement Specialist',
    desc: 'Invites competitive RFQs, inputs quotes, awards contracts, raises POs (releases up to ₹1,00,000 automatically).',
  },
  WAREHOUSE: {
    title: 'Plant / Warehouse Stores Officer',
    desc: 'Performs GRNs, receives inbound transfers, conducts stock adjustments — strictly restricted to assigned facility.',
  },
  LOGISTICS: {
    title: 'Logistics & Dispatch Controller',
    desc: 'Books sales orders, reserves free stock, consolidates multi-order delivery trips, enters statutory E-Way Bills.',
  },
  DRIVER: {
    title: 'Fleet Delivery Driver',
    desc: 'Mobile App operator: inspects assigned delivery stops, captures customer receiver name, remarks, and photo POD.',
  },
  VIEWER: {
    title: 'Internal Auditor / Observer',
    desc: 'Read-only visibility across control tower, financial inventory valuations, and audit movement ledgers.',
  },
};

export default function TeamPage() {
  const { data, reload, error, loading } = useData<any[]>('/api/members');
  const { data: me } = useData<any>('/api/auth/me');
  const { data: lk } = useData<any>('/api/lookups');

  const [m, setM] = useState<any>(null);
  const [editMember, setEditMember] = useState<any>(null);
  const [delMember, setDelMember] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // New Company Modal State
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: '',
    gstin: '',
    state_code: '',
    address: '',
  });
  const [orgError, setOrgError] = useState('');
  const [orgBusy, setOrgBusy] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  const isAdmin = me?.role === 'ADMIN';
  const orgs = me?.orgs ?? [];
  const currentOrgId = me?.org?.id;

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await apiCall('/api/members', 'POST', {
        ...m,
        password: m.password || undefined,
        name: m.name || undefined,
      });
      setM(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;
    setErr('');
    setBusy(true);
    try {
      await apiCall(`/api/members/${editMember.id}`, 'PUT', {
        name: editMember.name?.trim() || undefined,
        role: editMember.role,
        location_id: editMember.location_id || null,
        password: editMember.password?.trim() || undefined,
      });
      setEditMember(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!delMember) return;
    setErr('');
    setBusy(true);
    try {
      await apiCall(`/api/members/${delMember.id}`, 'DELETE');
      setDelMember(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgError('');
    setOrgBusy(true);
    try {
      const res = await apiCall<{ ok: boolean; org: any; token: string }>(
        '/api/organizations',
        'POST',
        newOrg
      );
      if (res?.token) {
        setStoredToken(res.token);
        setCachedSession({
          ...me,
          role: 'ADMIN',
          org: res.org,
        });
        window.location.reload();
      }
    } catch (x: any) {
      setOrgError(x.message || 'Failed to create company');
    } finally {
      setOrgBusy(false);
    }
  };

  const handleSwitchOrg = async (targetOrgId: number) => {
    if (targetOrgId === currentOrgId) return;
    try {
      setSwitchingId(targetOrgId);
      const res = await apiCall<{ token: string; role: string }>('/api/auth/switch', 'POST', {
        org_id: targetOrgId,
      });
      if (res?.token) {
        setStoredToken(res.token);
        const switchedOrg = orgs.find((o: any) => o.id === targetOrgId);
        setCachedSession({
          ...me,
          role: res.role,
          org: switchedOrg,
        });
        window.location.reload();
      }
    } catch (x: any) {
      alert(x.message || 'Failed to switch company');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Team & Company Governance
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage multi-tenant enterprise companies, user role authorities, and facility-restricted execution boundaries.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowAddOrg(true)}
              className="gap-2 shadow-sm"
            >
              <Building2 className="w-4 h-4 text-brand-indigo" />
              <span>New Company</span>
            </Button>
            <Button
              variant="primary"
              onClick={() => setM({ role: 'PLANNER' })}
              className="gap-2 shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Member</span>
            </Button>
          </div>
        )}
      </div>

      <Msg err={err || error} />

      {/* Multi-Tenant Companies / Organizations Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-indigo">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Connected Companies (Multi-Tenant Entities)
              </h3>
              <p className="text-xs text-slate-500">
                Each company operates with complete data isolation (own stock, orders, network & billing).
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddOrg(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-indigo hover:text-brand-indigo-dark bg-indigo-50 hover:bg-indigo-100/70 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Company</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((o: any) => {
            const isActive = o.id === currentOrgId;
            return (
              <div
                key={o.id}
                className={`p-4 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-gradient-to-br from-indigo-50/80 to-white border-brand-indigo/60 shadow-sm ring-1 ring-brand-indigo/30'
                    : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 truncate">
                      {o.name}
                    </h4>
                    <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">
                      Your Role: <span className="text-brand-indigo font-bold">{o.role}</span>
                    </span>
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSwitchOrg(o.id)}
                      disabled={switchingId === o.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-brand-indigo hover:text-brand-indigo text-slate-600 text-[11px] font-semibold transition-all shadow-2xs"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>{switchingId === o.id ? 'Switching...' : 'Switch'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full min-w-0">
        {/* Members Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full min-w-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Active Members in {me?.org?.name ?? 'Company'} ({data?.length ?? 0})
            </h3>
            {isAdmin && (
              <button
                onClick={() => setM({ role: 'PLANNER' })}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-indigo hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Add Member</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[580px]">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5 whitespace-nowrap">Member Name</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Email</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Role</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Assigned Location</th>
                  {isAdmin && <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {data?.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <b className="text-slate-900">{u.name}</b>
                      {u.phone && <span className="text-[10px] text-slate-400 ml-1.5">{u.phone}</span>}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600">
                      {u.email}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <StatusBadge s={u.role} />
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {u.location_code ? (
                        <span className="font-semibold text-slate-800">
                          {u.location_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">All Facilities</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setEditMember({
                                id: u.id,
                                name: u.name,
                                email: u.email,
                                role: u.role,
                                location_id: u.location_id,
                                password: '',
                              })
                            }
                            className="p-1.5 rounded-lg border border-slate-200/80 bg-white hover:bg-indigo-50 text-slate-600 hover:text-brand-indigo hover:border-indigo-200 transition-colors shadow-2xs"
                            title="Edit Member Access & Location"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {u.id !== me?.id && (
                            <button
                              type="button"
                              onClick={() => setDelMember(u)}
                              className="p-1.5 rounded-lg border border-slate-200/80 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-2xs"
                              title="Revoke Member Access"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {loading && (!data || data.length === 0) ? (
                  <TableLoadingRow
                    colSpan={isAdmin ? 5 : 4}
                    text="Fetching organization members and role permissions..."
                  />
                ) : data && data.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="py-12 text-center text-slate-400 font-medium">
                      No team members found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Segregation of Duties Matrix */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-indigo" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Role Authority Boundaries
            </h3>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {Object.entries(ROLES_INFO).map(([key, info]) => (
              <div
                key={key}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{info.title}</span>
                  <StatusBadge s={key} />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {info.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-slate-600 space-y-1">
            <b className="text-brand-indigo block">Guaranteed Integrity:</b>
            <p>
              Enforced at database and API layers. Self-approval of PRs or POs is blocked by check constraints; warehouse users cannot transact outside their designated facility.
            </p>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      {m && (
        <Modal title="Add Organization Member" onClose={() => setM(null)} maxWidth="max-w-md">
          <form onSubmit={handleSaveMember} className="space-y-4">
            <Msg err={err} />
            <Field label="Email Address *">
              <input
                type="email"
                required
                placeholder="user@scm.local"
                value={m.email ?? ''}
                onChange={(e) => setM({ ...m, email: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
              />
            </Field>

            <Field label="Full Name">
              <input
                type="text"
                placeholder="e.g. Suman Kumar"
                value={m.name ?? ''}
                onChange={(e) => setM({ ...m, name: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <Field label="Password (Min 8 Characters)">
              <input
                type="password"
                placeholder="••••••••"
                value={m.password ?? ''}
                onChange={(e) => setM({ ...m, password: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <Field label="Assigned Role *">
              <select
                required
                value={m.role}
                onChange={(e) => setM({ ...m, role: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-semibold text-slate-800"
              >
                {Object.keys(ROLES_INFO).map((r) => (
                  <option key={r} value={r}>
                    {r} — {ROLES_INFO[r].title}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Designated Home Location">
              <select
                value={m.location_id ?? ''}
                onChange={(e) =>
                  setM({
                    ...m,
                    location_id: Number(e.target.value) || null,
                  })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
              >
                <option value="">All Locations (Global Access)</option>
                {lk?.locations.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.code} • {l.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setM(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Add Member'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Member Dialog */}
      {editMember && (
        <Modal
          title={`Edit Member: ${editMember.email}`}
          onClose={() => setEditMember(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleUpdateMember} className="space-y-4">
            <Msg err={err} />
            <Field label="Full Name">
              <input
                type="text"
                placeholder="e.g. Suman Kumar"
                value={editMember.name ?? ''}
                onChange={(e) => setEditMember({ ...editMember, name: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
              />
            </Field>

            <Field label="New Password (Leave blank to keep unchanged)">
              <input
                type="password"
                placeholder="••••••••"
                value={editMember.password ?? ''}
                onChange={(e) => setEditMember({ ...editMember, password: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <Field label="Assigned Role *">
              <select
                required
                value={editMember.role}
                onChange={(e) => setEditMember({ ...editMember, role: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-semibold text-slate-800"
              >
                {Object.keys(ROLES_INFO).map((r) => (
                  <option key={r} value={r}>
                    {r} — {ROLES_INFO[r].title}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Designated Home Location">
              <select
                value={editMember.location_id ?? ''}
                onChange={(e) =>
                  setEditMember({
                    ...editMember,
                    location_id: Number(e.target.value) || null,
                  })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
              >
                <option value="">All Locations (Global Access)</option>
                {lk?.locations.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.code} • {l.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setEditMember(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Update Member'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Member Confirmation Modal */}
      {delMember && (
        <Modal
          title="Revoke Member Access"
          onClose={() => setDelMember(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <Msg err={err} />
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to remove <b className="text-slate-900">{delMember.name || delMember.email}</b> ({delMember.email}) from <span className="font-semibold text-brand-indigo">{me?.org?.name || 'this organization'}</span>?
            </p>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed">
              <b>Warning:</b> This user will immediately lose access to all modules, orders, and data for this company. Historical transactions and audit logs will remain intact.
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setDelMember(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteMember} disabled={busy}>
                {busy ? 'Removing...' : 'Remove Member'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add New Company Modal */}
      {showAddOrg && (
        <Modal
          title="Add New Company (Multi-Tenant Entity)"
          onClose={() => setShowAddOrg(false)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <Msg err={orgError} />

            <Field label="Company Legal Name *">
              <input
                type="text"
                required
                placeholder="e.g. Surya Electronics Pvt Ltd"
                value={newOrg.name}
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo font-medium text-slate-900"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="GSTIN (15 Characters)">
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 27AAKCS4821M1Z5"
                  value={newOrg.gstin}
                  onChange={(e) =>
                    setNewOrg({ ...newOrg, gstin: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo font-mono text-slate-900"
                />
              </Field>

              <Field label="State Code (2 Digits)">
                <input
                  type="text"
                  maxLength={2}
                  placeholder="e.g. 27 (MH), 07 (DL)"
                  value={newOrg.state_code}
                  onChange={(e) => setNewOrg({ ...newOrg, state_code: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo font-mono text-slate-900"
                />
              </Field>
            </div>

            <Field label="Registered Office Address">
              <textarea
                rows={2}
                placeholder="Plot / Street, Industrial Area, City, Pin Code"
                value={newOrg.address}
                onChange={(e) => setNewOrg({ ...newOrg, address: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo text-slate-900"
              />
            </Field>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAddOrg(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={orgBusy}>
                {orgBusy ? 'Creating...' : 'Create Company & Switch'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
