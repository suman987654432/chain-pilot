'use client';

import React, { useState } from 'react';
import { apiCall, setStoredToken, setCachedSession } from '@/lib/client';
import { Msg, Button } from '@/components/ui';
import { ArrowRight, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await apiCall<{
        token: string;
        user: any;
        org: any;
        orgs: any[];
      }>('/api/auth/login', 'POST', {
        email: email.trim(),
        password,
      });
      if (res?.token) {
        setStoredToken(res.token);
        const session = {
          user: res.user,
          role: res.org?.role,
          org: res.org,
          orgs: res.orgs,
        };
        setCachedSession(session);

        // Role-based landing module
        const role = res.org?.role;
        if (role === 'DRIVER' || role === 'LOGISTICS') {
          window.location.href = '/shipments';
        } else if (role === 'WAREHOUSE') {
          window.location.href = '/stock';
        } else if (role === 'BUYER') {
          window.location.href = '/procurement/pos';
        } else if (role === 'PLANNER') {
          window.location.href = '/planning';
        } else if (role === 'VIEWER') {
          window.location.href = '/stock';
        } else {
          // ADMIN and MANAGER land on Control Tower
          window.location.href = '/';
        }
      }
    } catch (x: any) {
      setErr(x.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-900 via-slate-900 to-indigo-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-indigo to-brand-pink text-white font-black text-2xl shadow-xl shadow-brand-indigo/30 mb-4">
          CP
        </div>
        <h2 className="text-3xl font-black text-white tracking-tight">
          Chain<span className="text-brand-pink">Pilot</span>
        </h2>
        <p className="mt-2 text-sm text-slate-400 font-medium">
          Enterprise Supply Chain Orchestration & Control Tower
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-100">
          <Msg err={err} />

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Corporate Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo focus:bg-white transition-all text-slate-900 font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo focus:bg-white transition-all text-slate-900 font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full py-3 text-sm font-bold shadow-lg shadow-brand-indigo/25"
            >
              {loading ? 'Authenticating...' : 'Sign In to Workspace'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              Protected by multi-tenant role-based access control (RBAC).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
