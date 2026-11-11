'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useData, getCachedSession } from '@/lib/client';
import { ControlTowerData } from '@/lib/types';
import { DemandChart, HBars, HealthBars, Legend } from '@/components/Charts';
import { StatusBadge, Button, LoadingBadge, TableLoadingRow } from '@/components/ui';
import {
  AlertTriangle,
  Clock,
  TrendingUp,
  Truck,
  DollarSign,
  Package,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  Activity,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Building2,
  Flame,
  BarChart3,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');
const L = (v: number) =>
  v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : `₹${(v / 1e5).toFixed(1)} L`;

const PctBadge = ({
  val,
  good,
  ok,
}: {
  val: number | null;
  good: number;
  ok: number;
}) => {
  if (val == null) return <span className="text-slate-400 font-semibold">—</span>;
  const isGood = val >= good;
  const isOk = val >= ok;
  const colorClass = isGood
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : isOk
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-black border ${colorClass}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isGood ? 'bg-emerald-500' : isOk ? 'bg-amber-500' : 'bg-rose-500'
          }`}
      />
      {val}%
    </span>
  );
};

export default function ControlTowerPage() {
  const [mounted, setMounted] = React.useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data: me } = useData<any>('/api/auth/me');

  React.useEffect(() => {
    setMounted(true);
    const cached = getCachedSession();
    const role = me?.role || cached?.role;
    if (role && role !== 'ADMIN' && role !== 'MANAGER') {
      if (role === 'DRIVER' || role === 'LOGISTICS') {
        window.location.replace('/shipments');
      } else if (role === 'WAREHOUSE') {
        window.location.replace('/stock');
      } else if (role === 'BUYER') {
        window.location.replace('/procurement/pos');
      } else if (role === 'PLANNER') {
        window.location.replace('/planning');
      } else {
        window.location.replace('/stock');
      }
    }
  }, [me?.role]);

  const cached = mounted ? getCachedSession() : null;
  const role = me?.role || cached?.role;
  const isExecutiveRole = role === 'ADMIN' || role === 'MANAGER';

  const {
    data: d,
    error,
    loading,
    reload,
  } = useData<ControlTowerData>(
    mounted && isExecutiveRole ? '/api/reports/control-tower' : null
  );

  const handleManualReload = async () => {
    setRefreshing(true);
    await reload();
    setTimeout(() => setRefreshing(false), 600);
  };

  if (!mounted || !isExecutiveRole || (loading && !d)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo animate-pulse">
            <Activity className="w-6 h-6 animate-spin text-brand-indigo" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-indigo opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-indigo" />
          </span>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-800">
            {!isExecutiveRole && mounted
              ? 'Redirecting to your assigned workspace...'
              : 'Synchronizing Supply Chain Telemetry...'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Connecting multi-echelon network nodes</p>
        </div>
      </div>
    );
  }

  if (error || !d) {
    return (
      <div className="p-8 bg-white border border-rose-200 rounded-3xl shadow-sm text-center max-w-lg mx-auto my-12 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Telemetry Feed Offline</h3>
        <p className="text-xs text-slate-500 leading-relaxed">{error || 'Could not fetch Control Tower report'}</p>
        <Button variant="secondary" onClick={() => reload()} className="gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Connection</span>
        </Button>
      </div>
    );
  }

  const ex = (d.planning?.exceptions ?? []) as { ex: string; n: number }[];
  const pastDueCount = Number(d.planning?.past_due ?? 0);
  const latePOsCount = Number(d.procurement?.late_pos ?? 0);

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* 1. HERO EXECUTIVE HEADER (LUMINOUS EXECUTIVE THEME)          */}
      {/* ============================================================== */}
      <div className="relative overflow-hidden bg-white/95 rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xs">
        {/* Soft ambient background glow (light and clean) */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-100/40 via-purple-50/30 to-pink-50/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-10 w-72 h-72 rounded-full bg-blue-50/40 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Network Synchronized
              </span>
              {loading && <LoadingBadge text="Synchronizing..." />}
              <span className="text-xs text-slate-500 font-semibold">
                • <span className="text-slate-800 font-bold">{d.org}</span> • Live As of {d.as_of}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Supply Chain <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-indigo via-indigo-600 to-brand-pink">Control Tower</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-2xl leading-relaxed">
              Unified multi-echelon visibility across Bhopal Manufacturing Plant, Regional Warehouses, and Customer Distribution Channels.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleManualReload}
              disabled={refreshing}
              title="Refresh Telemetry"
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200/90 transition-colors shadow-2xs"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-pink' : ''}`} />
            </button>

            <Link href="/planning">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200/90 transition-all hover:border-slate-300 shadow-2xs">
                <SlidersHorizontal className="w-3.5 h-3.5 text-brand-indigo" />
                <span>Run MRP/DRP</span>
              </button>
            </Link>

            <Link href="/procurement/pos?status=PENDING_APPROVAL">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-indigo to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold shadow-sm shadow-brand-indigo/25 transition-all hover:scale-102">
                <span>PO Approvals</span>
                <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[11px] flex items-center justify-center font-black">
                  {d.procurement.pending_approval}
                </span>
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. OPERATIONAL EXCEPTION ALERT BANNERS                         */}
      {/* ============================================================== */}
      {(pastDueCount > 0 || latePOsCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pastDueCount > 0 && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-white border border-rose-200/80 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {pastDueCount} Planned Order(s) Past Release
                    </span>
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                      Urgent
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supply will stock out downstream unless converted to PO/MO now.
                  </p>
                </div>
              </div>
              <Link
                href="/planning"
                className="text-xs font-bold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 group whitespace-nowrap pl-2"
              >
                <span>Firm Orders</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}

          {latePOsCount > 0 && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-white border border-amber-200/80 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {latePOsCount} Purchase Order(s) Overdue
                    </span>
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      Late Vendor
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Incoming components past promise date. Expedite with suppliers.
                  </p>
                </div>
              </div>
              <Link
                href="/procurement/pos?status=RECEIVABLE"
                className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1 group whitespace-nowrap pl-2"
              >
                <span>Chase Vendors</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. 8 PRIMARY EXECUTIVE KPI CARDS                               */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Customer OTIF */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-indigo to-indigo-400" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Customer OTIF (30d)</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-brand-indigo flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {d.otif.pct != null ? `${d.otif.pct}%` : '—'}
            </span>
            <PctBadge val={d.otif.pct} good={95} ok={85} />
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            <b className="text-slate-800">{d.otif.otif}</b> of {d.otif.stops} dispatches on-time & in-full
          </div>
        </div>

        {/* Order Fill Rate */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Order Fill Rate</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {d.fill_rate != null ? `${d.fill_rate}%` : '—'}
            </span>
            <PctBadge val={d.fill_rate} good={97} ok={90} />
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            <b className="text-slate-800">{n(d.logistics.open_orders)}</b> open orders •{' '}
            <span className={d.logistics.late_orders > 0 ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {n(d.logistics.late_orders)} late
            </span>
          </div>
        </div>

        {/* Forecast Accuracy */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-pink to-pink-400" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Forecast Accuracy</span>
            <div className="w-7 h-7 rounded-lg bg-pink-50 text-brand-pink flex items-center justify-center group-hover:scale-110 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {d.forecast.accuracy != null ? `${d.forecast.accuracy}%` : '—'}
            </span>
            <PctBadge val={d.forecast.accuracy} good={85} ok={70} />
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            1 − WMAPE • <b className="text-slate-800">{d.forecast.overrides}</b> manual override(s)
          </div>
        </div>

        {/* Supplier OTIF */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-amber-300" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Supplier OTIF</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {d.supplier_otif != null ? `${d.supplier_otif}%` : '—'}
            </span>
            <PctBadge val={d.supplier_otif} good={90} ok={75} />
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            <b className="text-slate-800">{d.procurement.open_pos}</b> open POs • {L(d.procurement.open_value)}
          </div>
        </div>

        {/* Network Inventory Valuation */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Network Inventory</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {L(d.inventory.value)}
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            Velocity: <b className="text-slate-800">{d.inventory.turns ?? '—'} turns/yr</b> • Road: {L(d.inventory.in_transit_value)}
          </div>
        </div>

        {/* Trips On Road */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 to-cyan-400" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Fleet Dispatches</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>{n(d.logistics.in_transit)}</span>
            <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">
              Active Trips
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            {n(d.logistics.planned)} planned • {n(d.logistics.delayed)} delayed
          </div>
        </div>

        {/* Freight Spend (30d) */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-400" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Freight (30 Days)</span>
            <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            ₹{n(Math.round(Number(d.logistics.freight_30d)))}
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            Rate: <b className="text-slate-800">₹{(Number(d.logistics.freight_30d) / Math.max(1, Number(d.logistics.kg_30d))).toFixed(2)} / kg</b> ({n(Math.round(Number(d.logistics.kg_30d)))} kg)
          </div>
        </div>

        {/* Buying Pipeline */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-pink-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Buying Pipeline</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>{n(d.procurement.prs_to_approve)}</span>
            <span className="text-xs text-slate-400 font-semibold">PRs queued</span>
          </div>
          <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 font-medium">
            {n(d.procurement.open_rfqs)} active RFQs • {n(d.procurement.pending_approval)} PO approvals
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. VISUAL TELEMETRY: DEMAND TREND & CAPITAL VALUATION          */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Demand Forecasting Chart (7 cols) */}
        <div className="lg:col-span-7 p-4 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4 min-w-0">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Network Demand — Actual vs Forecast
            </h3>
            <p className="text-xs text-slate-400">Monthly statistical baseline + promotional overrides</p>
          </div>
          <DemandChart
            rows={d.trend.map((t) => ({
              label: t.label,
              actual: Number(t.actual) || null,
              final: t.forecast != null ? Math.round(Number(t.forecast)) : null,
            }))}
            height={290}
          />
        </div>

        {/* Capital Valuation per Node (5 cols) */}
        <div className="lg:col-span-5 p-4 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Capital Valuation per Node
                </h3>
                <p className="text-xs text-slate-400">Inventory capital across plants, warehouses & depots</p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-indigo-50 text-brand-indigo border border-indigo-200/80 shadow-2xs">
                {L(d.inventory.value)} Total
              </span>
            </div>

            <div className="pt-4">
              <HBars
                rows={d.inventory.by_location.map((l) => ({
                  label: l.code,
                  sub: l.type.toLowerCase(),
                  value: Number(l.value),
                }))}
                format="inr"
                color="#3B4FE0"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-medium">
            <span>Active Echelons: <b className="text-slate-800">{d.inventory.by_location.length} Facilities</b></span>
            <span>In-Transit: <b className="text-slate-800">{L(d.inventory.in_transit_value)}</b></span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. STOCK HEALTH BY FACILITY (FULL WIDTH HIGH-IMPACT CARD)      */}
      {/* ============================================================== */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Stock Health by Facility
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                Multi-Echelon Health Distribution
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Stockout, Reorder, Healthy, and Excess distribution across all network facilities
            </p>
          </div>
          <Link
            href="/stock"
            className="text-xs font-bold text-brand-indigo hover:text-brand-pink transition-colors inline-flex items-center gap-1"
          >
            <span>Full Stock Ledger</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <HealthBars
          rows={d.health.map((h) => ({
            code: h.code,
            health: h.health,
            n: Number(h.n),
          }))}
        />
      </div>

      {/* ============================================================== */}
      {/* 6. RUN-OUT RISK MONITOR & SUPPLIER SCORECARDS                  */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Run-Out Risk Table */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Run-Out Risk Monitor
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200 shadow-2xs">
                  Cover &lt; Lead Time
                </span>
              </div>
              <p className="text-xs text-slate-400">High velocity SKUs requiring immediate planned PO/MO release</p>
            </div>
            <Link
              href="/stock"
              className="text-xs font-bold text-brand-indigo hover:text-brand-pink transition-colors inline-flex items-center gap-1"
            >
              <span>Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3 whitespace-nowrap">Item / SKU</th>
                    <th className="py-3 px-3 whitespace-nowrap">Facility</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">On Hand</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Daily Velocity</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Cover</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {refreshing ? (
                    <TableLoadingRow
                      colSpan={6}
                      text="Recalculating network SKU lead times and run-out risks..."
                    />
                  ) : d.risk.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                        No critical run-out or stockout risks detected. All SKUs healthy.
                      </td>
                    </tr>
                  ) : (
                    d.risk.map((r, i) => {
                      const isRisk = Number(r.days_cover ?? 0) < Number(r.lead_days);
                      return (
                        <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                                {r.code}
                              </span>
                              <span className="text-xs text-slate-700 font-medium truncate max-w-[180px]" title={r.name}>
                                {r.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-[11px] whitespace-nowrap px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                              {r.location_code}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                            <span
                              className={`font-mono font-bold ${
                                Number(r.on_hand) === 0
                                  ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200'
                                  : 'text-slate-800'
                              }`}
                            >
                              {n(r.on_hand)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-slate-600 font-mono whitespace-nowrap">
                            {Number(r.avg_daily_demand).toFixed(1)} /d
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-black shadow-2xs ${
                                isRisk
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isRisk ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                                }`}
                              />
                              {r.days_cover ?? 0} d
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-slate-500 font-mono whitespace-nowrap">
                            {r.lead_days} d
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Supplier Scorecards & Planning Engine Exceptions */}
                        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <div>
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                  Supplier Delivery Reliability
                                </h3>
                                <p className="text-xs text-slate-400">On-Time In-Full (OTIF) and Quality assurance from receipts</p>
                              </div>
                              <Link
                                href="/suppliers/performance"
                                className="text-xs font-bold text-brand-indigo hover:text-brand-pink transition-colors inline-flex items-center gap-1"
                              >
                                <span>Scorecards</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>

                            <div className="overflow-x-auto pt-1">
                              <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50/90 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                                    <tr>
                                      <th className="py-3 px-3 whitespace-nowrap">Vendor</th>
                                      <th className="py-3 px-3 whitespace-nowrap">Status</th>
                                      <th className="py-3 px-3 text-right whitespace-nowrap">Due Lines</th>
                                      <th className="py-3 px-3 text-right whitespace-nowrap">OTIF</th>
                                      <th className="py-3 px-3 text-right whitespace-nowrap">Quality</th>
                                      <th className="py-3 px-3 text-right whitespace-nowrap">Late POs</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium">
                                    {refreshing ? (
                                      <TableLoadingRow
                                        colSpan={6}
                                        text="Updating supplier delivery reliability and OTIF..."
                                      />
                                    ) : d.suppliers.filter((x) => Number(x.lines_due) || Number(x.late_open_pos)).length === 0 ? (
                                      <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                                          No active supplier delivery exceptions or open due lines.
                                        </td>
                                      </tr>
                                    ) : (
                                      d.suppliers
                                        .filter((x) => Number(x.lines_due) || Number(x.late_open_pos))
                                        .map((x) => (
                                          <tr key={x.supplier_id} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">{x.name}</td>
                                            <td className="py-3 px-3 whitespace-nowrap">
                                              {x.status?.toUpperCase() === 'APPROVED' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                  Approved
                                                </span>
                                              ) : x.status?.toUpperCase() === 'CONDITIONAL' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                  Conditional
                                                </span>
                                              ) : (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                  {x.status}
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-3 px-3 text-right tabular-nums font-mono font-bold text-slate-700 whitespace-nowrap">
                                              {x.lines_due}
                                            </td>
                                            <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                                              <PctBadge val={x.otif_pct} good={90} ok={75} />
                                            </td>
                                            <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                                              <PctBadge val={x.quality_pct} good={99} ok={97} />
                                            </td>
                                            <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                                              {Number(x.late_open_pos) > 0 ? (
                                                <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                                  {x.late_open_pos} late
                                                </span>
                                              ) : (
                                                <span className="font-mono text-slate-400 font-medium">0</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))
                                    )}
                                  </tbody>
                                                        </table>
                                                      </div>
                                                    </div>

                                                    {/* Planning Engine Exceptions */}
                                                    <div className="pt-4 border-t border-slate-100 space-y-2.5">
                                                      <div className="flex items-center justify-between">
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                                          Planning Engine Exceptions
                                                        </h4>
                                                        {d.planning && (
                                                          <span className="text-[11px] text-slate-400 font-medium">
                                                            {d.planning.open_planned} open proposals • Run{' '}
                                                            {new Date(d.planning.run_at).toLocaleDateString('en-IN')}
                                                          </span>
                                                        )}
                                                      </div>

                                                      {ex.length ? (
                                                        <div className="flex flex-wrap gap-2">
                                                          {ex.map((e) => {
                                                            const isStockout = e.ex.includes('STOCKOUT');
                                                            const isExcess = e.ex.includes('EXCESS');
                                                            const isLate = e.ex.includes('LATE') || e.ex.includes('BELOW_SS');
                                                            const isExpedite = e.ex.includes('EXPEDITE');

                                                            const badgeStyle = isStockout
                                                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                              : isExcess
                                                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                : isLate
                                                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                  : isExpedite
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-slate-50 text-slate-700 border-slate-200';

                                                            const pillStyle = isStockout
                                                              ? 'bg-rose-600 text-white'
                                                              : isExcess
                                                                ? 'bg-purple-600 text-white'
                                                                : isLate
                                                                  ? 'bg-amber-600 text-white'
                                                                  : isExpedite
                                                                    ? 'bg-blue-600 text-white'
                                                                    : 'bg-slate-200 text-slate-700';

                                                            return (
                                                              <span
                                                                key={e.ex}
                                                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-bold border ${badgeStyle} shadow-2xs whitespace-nowrap`}
                                                              >
                                                                <span>{e.ex.replace(/_/g, ' ')}</span>
                                                                <span
                                                                  className={`px-2 py-0.5 rounded-md font-mono font-black text-[11px] ${pillStyle}`}
                                                                >
                                                                  {e.n}
                                                                </span>
                                                              </span>
                                                            );
                                                          })}
                                                        </div>
                                                      ) : (
                                                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 text-slate-500 text-xs">
                                                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                          <span>Zero exceptions in latest MRP/DRP calculation run.</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
            </div>
                                            );
}
