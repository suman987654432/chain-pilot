'use client';

import React, { useState } from 'react';
import { apiCall, setStoredToken, setCachedSession, useData } from '@/lib/client';
import { Building2, LogOut, ShieldCheck, MapPin } from 'lucide-react';

export default function Navbar() {
  const { data: me } = useData<any>('/api/auth/me');
  const [switching, setSwitching] = useState(false);

  const orgs = me?.orgs ?? [];
  const currentOrg = me?.org;

  const handleOrgSwitch = async (orgId: number) => {
    try {
      setSwitching(true);
      const res = await apiCall<{ token: string; role: string }>('/api/auth/switch', 'POST', {
        org_id: orgId,
      });
      if (res?.token) {
        setStoredToken(res.token);
        const switchedOrg = orgs.find((o: any) => o.id === orgId);
        setCachedSession({
          ...me,
          role: res.role,
          org: switchedOrg,
        });
      }
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSwitching(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiCall('/api/auth/logout', 'POST');
    } catch (_) {}
    setStoredToken(null);
    window.location.href = '/login';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm backdrop-blur-md bg-white/90">
      {/* Organization Selector */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-brand-indigo border border-indigo-100">
          <Building2 className="w-4 h-4" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block -mb-0.5">
            Active Tenant
          </label>
          <div className="flex items-center gap-2">
            {orgs.length > 1 ? (
              <select
                value={currentOrg?.id ?? ''}
                disabled={switching}
                onChange={(e) => handleOrgSwitch(Number(e.target.value))}
                className="text-xs font-bold text-slate-900 bg-transparent border-0 cursor-pointer focus:ring-0 p-0 pr-4"
              >
                {orgs.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-slate-900">
                {currentOrg?.name ?? 'Loading...'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-4">
        {me && (
          <div className="hidden sm:flex items-center gap-3 pr-2 border-r border-slate-200">
            {me.location && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span>{me.location.code}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-brand-indigo text-xs font-bold tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-indigo" />
              <span>{me.role}</span>
            </span>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-900">{me.user?.name}</div>
              <div className="text-[10px] text-slate-400">{me.user?.email}</div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          title="Sign Out"
          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
