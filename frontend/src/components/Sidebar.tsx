'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData, getCachedSession, setCachedSession } from '@/lib/client';
import {
  LayoutDashboard,
  Boxes,
  TrendingUp,
  Cpu,
  Factory,
  FileText,
  FileCheck2,
  PackagePlus,
  Award,
  ShoppingCart,
  Truck,
  ArrowLeftRight,
  Layers,
  MapPin,
  Building2,
  Users2,
  Car,
  Shield,
  ChevronRight,
  User,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        href: '/',
        label: 'Control Tower',
        icon: LayoutDashboard,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        href: '/stock',
        label: 'Network Inventory',
        icon: Boxes,
        roles: ['ADMIN', 'MANAGER', 'PLANNER', 'WAREHOUSE', 'VIEWER'],
      },
    ],
  },
  {
    title: 'Plan',
    items: [
      {
        href: '/demand',
        label: 'Demand Forecast',
        icon: TrendingUp,
        roles: ['ADMIN', 'MANAGER', 'PLANNER'],
      },
      {
        href: '/planning',
        label: 'MRP / DRP Planning',
        icon: Cpu,
        roles: ['ADMIN', 'MANAGER', 'PLANNER'],
      },
      {
        href: '/production',
        label: 'Production Orders',
        icon: Factory,
        roles: ['ADMIN', 'MANAGER', 'PLANNER', 'WAREHOUSE'],
      },
    ],
  },
  {
    title: 'Source',
    items: [
      {
        href: '/procurement/prs',
        label: 'Requisitions',
        icon: FileText,
        roles: ['ADMIN', 'MANAGER', 'PLANNER', 'BUYER', 'WAREHOUSE'],
      },
      {
        href: '/procurement/rfqs',
        label: 'RFQ & Quotes',
        icon: FileCheck2,
        roles: ['ADMIN', 'MANAGER', 'BUYER'],
      },
      {
        href: '/procurement/pos',
        label: 'Purchase Orders',
        icon: ShoppingCart,
        roles: ['ADMIN', 'MANAGER', 'BUYER', 'WAREHOUSE'],
      },
      {
        href: '/procurement/grns',
        label: 'Goods Receipts',
        icon: PackagePlus,
        roles: ['ADMIN', 'MANAGER', 'WAREHOUSE', 'BUYER'],
      },
      {
        href: '/suppliers/performance',
        label: 'Supplier Scorecard',
        icon: Award,
        roles: ['ADMIN', 'MANAGER', 'BUYER', 'VIEWER'],
      },
    ],
  },
  {
    title: 'Deliver',
    items: [
      {
        href: '/sales',
        label: 'Sales Orders',
        icon: ShoppingCart,
        roles: ['ADMIN', 'MANAGER', 'PLANNER', 'LOGISTICS'],
      },
      {
        href: '/shipments',
        label: 'Trips & Delivery',
        icon: Truck,
        roles: ['ADMIN', 'MANAGER', 'LOGISTICS', 'DRIVER'],
      },
      {
        href: '/transfers',
        label: 'Inter-Location Transfers',
        icon: ArrowLeftRight,
        roles: ['ADMIN', 'MANAGER', 'PLANNER', 'LOGISTICS', 'WAREHOUSE'],
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        href: '/items',
        label: 'Items & BOM',
        icon: Layers,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        href: '/locations',
        label: 'Network & DRP',
        icon: MapPin,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        href: '/suppliers',
        label: 'Suppliers',
        icon: Building2,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        href: '/customers',
        label: 'Customers',
        icon: Users2,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        href: '/transporters',
        label: 'Transport & Fleet',
        icon: Car,
        roles: ['ADMIN', 'MANAGER', 'LOGISTICS'],
      },
      {
        href: '/team',
        label: 'Team & Roles',
        icon: Shield,
        roles: ['ADMIN'],
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { data: me } = useData<any>('/api/auth/me');

  useEffect(() => {
    setMounted(true);
    if (me) {
      setCachedSession(me);
    }
  }, [me]);

  // Synchronously use cached role on client once mounted
  const cached = mounted ? getCachedSession() : null;
  const currentRole = me?.role || cached?.role || null;
  const activeProfile = me || cached;

  const visibleGroups =
    mounted && currentRole
      ? navGroups
          .map((g) => ({
            ...g,
            items: g.items.filter((item) => !item.roles || item.roles.includes(currentRole)),
          }))
          .filter((g) => g.items.length > 0)
      : [];

  return (
    <aside className="w-64 bg-navy-900 text-slate-300 flex flex-col h-screen sticky top-0 overflow-y-auto border-r border-navy-800 shadow-xl z-20">
      {/* Brand Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-navy-800/80 bg-navy-900/60">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-indigo to-brand-pink flex items-center justify-center text-white font-black text-lg shadow-md">
          CP
        </div>
        <div>
          <span className="text-xl font-black text-white tracking-tight">
            Chain<span className="text-brand-pink">Pilot</span>
          </span>
          <p className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">
            SCM Orchestration
          </p>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 py-4 px-3 space-y-6">
        {!mounted ? (
          <div className="space-y-4 px-2 py-4 animate-pulse">
            <div className="h-3 bg-navy-800 rounded w-20 mb-3" />
            <div className="space-y-2">
              <div className="h-9 bg-navy-800/60 rounded-xl w-full" />
              <div className="h-9 bg-navy-800/60 rounded-xl w-full" />
              <div className="h-9 bg-navy-800/60 rounded-xl w-full" />
            </div>
          </div>
        ) : (
          visibleGroups.map((g) => (
            <div key={g.title} className="space-y-1">
              <h6 className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400/90">
                {g.title}
              </h6>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                        isActive
                          ? 'bg-brand-indigo text-white shadow-md shadow-brand-indigo/30'
                          : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                            isActive ? 'text-white' : 'text-slate-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* User Scope & Facility Footer */}
      <div className="p-3.5 border-t border-navy-800/80 bg-navy-950/70">
        {mounted && activeProfile ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-800 border border-navy-700 flex items-center justify-center text-brand-pink font-bold text-xs">
              {activeProfile.user?.name ? activeProfile.user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {activeProfile.user?.name ?? 'User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-semibold text-brand-pink uppercase tracking-wider bg-brand-pink/10 px-1.5 py-0.5 rounded">
                  {activeProfile.role}
                </span>
                {activeProfile.location ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded truncate">
                    <MapPin className="w-2.5 h-2.5" />
                    <span>{activeProfile.location.code}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                    Global
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-8 bg-navy-800/40 rounded-lg animate-pulse" />
        )}
      </div>
    </aside>
  );
}
