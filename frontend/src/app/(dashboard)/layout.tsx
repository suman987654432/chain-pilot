'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { useData, getCachedSession, getStoredToken } from '@/lib/client';
import { Button, LoadingBadge } from '@/components/ui';
import { Lock } from 'lucide-react';

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/': ['ADMIN', 'MANAGER'],
  '/stock': ['ADMIN', 'MANAGER', 'PLANNER', 'WAREHOUSE', 'VIEWER'],
  '/demand': ['ADMIN', 'MANAGER', 'PLANNER'],
  '/planning': ['ADMIN', 'MANAGER', 'PLANNER'],
  '/production': ['ADMIN', 'MANAGER', 'PLANNER', 'WAREHOUSE'],
  '/procurement/prs': ['ADMIN', 'MANAGER', 'PLANNER', 'BUYER', 'WAREHOUSE'],
  '/procurement/rfqs': ['ADMIN', 'MANAGER', 'BUYER'],
  '/procurement/pos': ['ADMIN', 'MANAGER', 'BUYER', 'WAREHOUSE'],
  '/procurement/grns': ['ADMIN', 'MANAGER', 'WAREHOUSE', 'BUYER'],
  '/suppliers/performance': ['ADMIN', 'MANAGER', 'BUYER', 'VIEWER'],
  '/sales': ['ADMIN', 'MANAGER', 'PLANNER', 'LOGISTICS'],
  '/shipments': ['ADMIN', 'MANAGER', 'LOGISTICS', 'DRIVER'],
  '/transfers': ['ADMIN', 'MANAGER', 'PLANNER', 'LOGISTICS', 'WAREHOUSE'],
  '/items': ['ADMIN', 'MANAGER'],
  '/locations': ['ADMIN', 'MANAGER'],
  '/suppliers': ['ADMIN', 'MANAGER'],
  '/customers': ['ADMIN', 'MANAGER'],
  '/transporters': ['ADMIN', 'MANAGER', 'LOGISTICS'],
  '/team': ['ADMIN'],
};

function getRequiredRoles(pathname: string): string[] | null {
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];
  for (const route of Object.keys(ROUTE_PERMISSIONS)) {
    if (route !== '/' && pathname.startsWith(route)) {
      return ROUTE_PERMISSIONS[route];
    }
  }
  return null;
}

function getDefaultRouteForRole(role?: string): string {
  switch (role) {
    case 'ADMIN':
    case 'MANAGER':
      return '/';
    case 'PLANNER':
      return '/planning';
    case 'BUYER':
      return '/procurement/pos';
    case 'WAREHOUSE':
      return '/stock';
    case 'LOGISTICS':
    case 'DRIVER':
      return '/shipments';
    case 'VIEWER':
      return '/stock';
    default:
      return '/login';
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { data: me, loading } = useData<any>('/api/auth/me');

  useEffect(() => {
    setMounted(true);
    const token = getStoredToken();
    if (!token && typeof window !== 'undefined') {
      window.location.replace('/login');
    }
  }, []);

  const cached = mounted ? getCachedSession() : null;
  const role = me?.role || cached?.role;
  const requiredRoles = getRequiredRoles(pathname);
  const isAuthorized = !requiredRoles || (role && requiredRoles.includes(role));

  // If visiting root '/' and user is not an executive role, auto-redirect to their home workspace
  useEffect(() => {
    if (mounted && role && pathname === '/' && !['ADMIN', 'MANAGER'].includes(role)) {
      window.location.replace(getDefaultRouteForRole(role));
    }
  }, [mounted, role, pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
          {!mounted || (loading && !cached) ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
              <LoadingBadge text="Authenticating enterprise workspace..." />
            </div>
          ) : !isAuthorized ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
              <div className="max-w-md w-full bg-white border border-rose-200/80 rounded-3xl p-8 shadow-sm space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 shadow-2xs">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Access Restricted</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    This module requires authorized authority credentials. Your role (<b className="text-slate-800">{role}</b>) does not have clearance to view this workspace.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-700">
                    Authorized Roles: <span className="text-brand-indigo font-bold">{requiredRoles?.join(', ')}</span>
                  </div>
                </div>
                <div className="pt-2">
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    onClick={() => {
                      window.location.replace(getDefaultRouteForRole(role));
                    }}
                  >
                    Return to Authorized Workspace
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
