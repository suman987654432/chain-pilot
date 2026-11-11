'use client';

import React, { useState, useMemo } from 'react';
import { apiCall, fmtDate, inr, useData, useDebounce } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, TableLoadingRow } from '@/components/ui';
import {
  Search,
  SlidersHorizontal,
  AlertCircle,
  History,
  Boxes,
  ShieldAlert,
  Truck,
  RotateCcw,
  CheckCircle2,
  Layers,
  X,
  RefreshCw,
} from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');

export default function StockPage() {
  const { data: me } = useData<any>('/api/auth/me');

  // Filter & Search states
  const [locationId, setLocationId] = useState<string>('');
  const [itemType, setItemType] = useState<string>(''); // Default '' (All) so all 16 SKUs (FG, Components, Packing) show
  const [searchInput, setSearchInput] = useState<string>('');
  const [healthFilter, setHealthFilter] = useState<string>('');

  // 300ms debounce on search input to prevent network spam and race conditions
  const debouncedQ = useDebounce(searchInput.trim(), 300);

  const isLocationLocked = me?.role === 'WAREHOUSE' && !!me?.locationId;

  React.useEffect(() => {
    if (me?.locationId && !locationId) {
      setLocationId(String(me.locationId));
    }
  }, [me?.locationId, locationId]);

  // Construct query params for server fetch (debounced search, location, item classification)
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (locationId) p.set('location_id', locationId);
    if (itemType) p.set('type', itemType);
    if (debouncedQ) p.set('q', debouncedQ);
    return p.toString();
  }, [locationId, itemType, debouncedQ]);

  const { data, reload, error, loading } = useData<any[]>(
    `/api/stock${queryParams ? `?${queryParams}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [led, setLed] = useState<any>(null);
  const [adj, setAdj] = useState<any>(null);
  const [adjErr, setAdjErr] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);

  const { data: mv, loading: mvLoading } = useData<any[]>(
    led
      ? `/api/stock/moves?item_id=${led.item_id}&location_id=${led.location_id}`
      : null
  );

  const allRows = useMemo(() => data ?? [], [data]);

  // Instant client-side health filter on the returned dataset
  const rows = useMemo(() => {
    if (!healthFilter) return allRows;
    return allRows.filter((r) => r.health === healthFilter);
  }, [allRows, healthFilter]);

  // Executive KPI calculations based on current table view
  const totalValue = useMemo(() => {
    return rows.reduce((acc, r) => acc + Number(r.on_hand) * Number(r.avg_cost), 0);
  }, [rows]);

  const totalOnHandUnits = useMemo(() => {
    return rows.reduce((acc, r) => acc + Number(r.on_hand), 0);
  }, [rows]);

  const totalReservedUnits = useMemo(() => {
    return rows.reduce((acc, r) => acc + Number(r.reserved), 0);
  }, [rows]);

  const totalInTransitUnits = useMemo(() => {
    return rows.reduce((acc, r) => acc + Number(r.in_transit), 0);
  }, [rows]);

  // Health distribution counts across current server-filtered scope
  const healthCounts = useMemo(() => {
    return {
      ALL: allRows.length,
      STOCKOUT: allRows.filter((r) => r.health === 'STOCKOUT').length,
      BELOW_SS: allRows.filter((r) => r.health === 'BELOW_SS').length,
      REORDER: allRows.filter((r) => r.health === 'REORDER').length,
      HEALTHY: allRows.filter((r) => r.health === 'HEALTHY').length,
      EXCESS: allRows.filter((r) => r.health === 'EXCESS').length,
      NO_DEMAND: allRows.filter((r) => r.health === 'NO_DEMAND').length,
    };
  }, [allRows]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjErr('');
    setAdjBusy(true);
    try {
      await apiCall('/api/stock/adjust', 'POST', {
        ...adj,
        qty: Number(adj.qty),
      });
      setAdj(null);
      reload();
    } catch (err: any) {
      setAdjErr(err.message);
    } finally {
      setAdjBusy(false);
    }
  };

  const resetFilters = () => {
    setLocationId(isLocationLocked && me?.locationId ? String(me.locationId) : '');
    setItemType('');
    setSearchInput('');
    setHealthFilter('');
  };

  const hasActiveFilters = Boolean(
    (locationId && !isLocationLocked) || itemType || searchInput || healthFilter
  );

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Network Inventory
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-brand-indigo border border-indigo-100 uppercase tracking-wider">
              Stock Ledger & Health
            </span>
            {loading && (
              <span className="text-[11px] font-bold text-brand-indigo bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-brand-indigo" />
                <span>Loading...</span>
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time multi-echelon on-hand, reservations, in-transit pipeline, and dynamic days-of-cover.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setAdj({ qty: '' })}
            className="gap-2 shadow-xs border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-xs">Stock Adjustment</span>
          </Button>
        </div>
      </div>

      <Msg err={error} />

      {/* 2. Executive KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Valuation */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Valuation</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-brand-indigo">
              <Boxes className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-slate-900 tracking-tight">
              {inr(totalValue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
              Moving-average landed cost
            </div>
          </div>
        </div>

        {/* On-Hand Units */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">On-Hand Inventory</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-slate-900 tracking-tight">
              {n(totalOnHandUnits)} <span className="text-xs font-semibold text-slate-400">units</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
              Across <b className="text-slate-700 font-bold">{rows.length}</b> stocking points
            </div>
          </div>
        </div>

        {/* Hard Reserved / ATP */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Committed / Free ATP</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-slate-900 tracking-tight">
              {n(totalOnHandUnits - totalReservedUnits)}{' '}
              <span className="text-xs font-bold text-emerald-600">free</span>
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-semibold">
              {n(totalReservedUnits)} units hard-allocated to SOs
            </div>
          </div>
        </div>

        {/* Pipeline & At Risk */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pipeline & Risk</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="text-rose-600 font-black">
                {healthCounts.STOCKOUT + healthCounts.BELOW_SS}
              </span>
              <span className="text-xs font-semibold text-slate-400">at risk</span>
            </div>
            <div className="text-[11px] text-sky-700 mt-0.5 font-semibold flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 inline" />
              <span>{n(totalInTransitUnits)} units in-transit pipeline</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar & Health Tabs */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        {/* Health Quick-Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Health View:
          </span>

          <button
            type="button"
            onClick={() => setHealthFilter('')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              !healthFilter
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            All Stock ({healthCounts.ALL})
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter('STOCKOUT')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              healthFilter === 'STOCKOUT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span>Stockout ({healthCounts.STOCKOUT})</span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter('BELOW_SS')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
              healthFilter === 'BELOW_SS'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
            }`}
          >
            Below SS ({healthCounts.BELOW_SS})
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter('REORDER')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
              healthFilter === 'REORDER'
                ? 'bg-yellow-600 text-white shadow-xs'
                : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 border border-yellow-200/60'
            }`}
          >
            Reorder ({healthCounts.REORDER})
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter('HEALTHY')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
              healthFilter === 'HEALTHY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
            }`}
          >
            Healthy ({healthCounts.HEALTHY})
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter('EXCESS')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
              healthFilter === 'EXCESS'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/60'
            }`}
          >
            Excess ({healthCounts.EXCESS})
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter('NO_DEMAND')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
              healthFilter === 'NO_DEMAND'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            No Demand ({healthCounts.NO_DEMAND})
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto text-xs font-bold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Detailed Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Facility Location */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Facility Node {isLocationLocked && <span className="text-amber-600 font-bold">(Locked)</span>}
            </label>
            <select
              value={locationId}
              disabled={isLocationLocked}
              onChange={(e) => setLocationId(e.target.value)}
              className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo font-semibold text-slate-800 ${
                isLocationLocked ? 'opacity-80 bg-amber-50 border-amber-200 cursor-not-allowed text-amber-900' : ''
              }`}
            >
              {!isLocationLocked && <option value="">All Network Facilities (5 Nodes)</option>}
              {lk?.locations?.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.code} • {l.name} ({l.type})
                </option>
              ))}
            </select>
          </div>

          {/* Item Classification */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Item Classification
            </label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo font-semibold text-slate-800"
            >
              <option value="">All Classifications (FG, Raw, Pack)</option>
              <option value="FINISHED">Finished Goods (FG)</option>
              <option value="COMPONENT">Raw Materials & Components</option>
              <option value="PACKING">Packaging Materials</option>
              <option value="TRADED">Traded Items</option>
            </select>
          </div>

          {/* Search SKU / Description with Debounce */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Search Item Code or Description
              </label>
              {searchInput !== debouncedQ && (
                <span className="text-[10px] text-brand-indigo font-medium flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>typing...</span>
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by code (e.g. LED-9W, FAN-900, CAP-450) or description..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-indigo font-medium text-slate-800"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. High-Density, Clean Single-Line Network Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{rows.length}</span>
            <span>stocking nodes matching filter criteria</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-400 italic">Click any row to inspect immutable double-entry ledger</span>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            Total Landed Value: <b className="text-slate-900 font-bold ml-1">{inr(totalValue)}</b>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Item / SKU</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Facility</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Class</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">On Hand</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Reserved</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Free ATP</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">In-Transit</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">On Order</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Safety Stk</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Reorder Pt</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Velocity</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Cover</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Valuation</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Health</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.map((r) => {
                const isCoverCritical = r.days_cover != null && Number(r.days_cover) <= 0;
                const isCoverWarning = r.days_cover != null && Number(r.days_cover) > 0 && Number(r.days_cover) < 15;

                return (
                  <tr
                    key={`${r.item_id}:${r.location_id}`}
                    onClick={() => setLed(r)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                  >
                    {/* Item SKU & Name on ONE line */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100/90 px-1.5 py-0.5 rounded text-[11px] border border-slate-200/70 whitespace-nowrap">
                          {r.code}
                        </span>
                        <span
                          className="font-semibold text-slate-800 text-xs truncate max-w-[220px]"
                          title={r.name}
                        >
                          {r.name}
                        </span>
                      </div>
                    </td>

                    {/* Facility Badge */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 whitespace-nowrap">
                        {r.location_code}
                      </span>
                    </td>

                    {/* Class ABC/XYZ */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {r.abc ? (
                        <div className="flex items-center gap-1">
                          <span className={`badge-status s-${r.abc} px-1.5 text-[10px]`}>
                            {r.abc}
                          </span>
                          <span className={`badge-status s-${r.xyz} px-1.5 text-[10px]`}>
                            {r.xyz}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* On Hand */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                      {n(r.on_hand)}
                    </td>

                    {/* Reserved */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums">
                      {Number(r.reserved) > 0 ? (
                        <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
                          {n(r.reserved)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">0</span>
                      )}
                    </td>

                    {/* Free ATP */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold">
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                        {n(r.free)}
                      </span>
                    </td>

                    {/* In Transit */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums">
                      {Number(r.in_transit) > 0 ? (
                        <span className="text-sky-700 font-bold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/60">
                          {n(r.in_transit)}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* On Order */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums">
                      {Number(r.on_order) > 0 ? (
                        <span className="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/60">
                          {n(r.on_order)}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Safety Stock */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums text-slate-500 font-mono text-[11px]">
                      {n(r.safety_stock)}
                    </td>

                    {/* Reorder Point */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums text-slate-500 font-mono text-[11px]">
                      {n(r.reorder_point)}
                    </td>

                    {/* Daily Demand */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums text-slate-600 font-mono text-[11px]">
                      {Number(r.avg_daily_demand).toFixed(1)} /d
                    </td>

                    {/* Days Cover */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-semibold">
                      {r.days_cover != null ? (
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                            isCoverCritical
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : isCoverWarning
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                          }`}
                        >
                          {r.days_cover} d
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Landed Valuation */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                      {inr(Number(r.on_hand) * Number(r.avg_cost))}
                    </td>

                    {/* Health Status */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <StatusBadge s={r.health} />
                    </td>

                    {/* Ledger Action Link */}
                    <td className="py-2.5 px-2 text-center whitespace-nowrap text-slate-400 group-hover:text-brand-indigo transition-colors">
                      <History className="w-3.5 h-3.5 inline" />
                    </td>
                  </tr>
                );
              })}
              {loading && (!rows || rows.length === 0) ? (
                <TableLoadingRow
                  colSpan={15}
                  text="Scanning network inventory balances and days-of-cover..."
                />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400 font-medium">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-600">No inventory items match the current filters.</p>
                      <p className="text-xs text-slate-400">Try clearing the search query or resetting filters.</p>
                      {hasActiveFilters && (
                        <div className="pt-2">
                          <Button variant="secondary" size="sm" onClick={resetFilters}>
                            Reset All Filters
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Immutable Stock Ledger Modal */}
      {led && (
        <Modal
          title={`Double-Entry Stock Ledger — ${led.code} @ ${led.location_code}`}
          onClose={() => setLed(null)}
          maxWidth="max-w-5xl"
        >
          <div className="space-y-4">
            {/* Header Item Summary */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-200">
                  {led.code}
                </span>
                <span className="font-bold text-slate-800 text-sm">{led.name}</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/50 font-mono text-[11px] font-bold">
                  {led.location_code}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span>
                  Physical On-Hand: <b className="text-slate-900">{n(led.on_hand)}</b>
                </span>
                <span>
                  Reserved: <b className="text-amber-700">{n(led.reserved)}</b>
                </span>
                <span>
                  Free ATP:{' '}
                  <b className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                    {n(led.free)}
                  </b>
                </span>
                <span>
                  Landed Cost: <b className="text-slate-900">{inr(led.avg_cost, 2)}</b>
                </span>
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <div className="overflow-x-auto border border-slate-200/80 rounded-xl shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Date</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Movement Type</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Reference Doc</th>
                    <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Movement Qty</th>
                    <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Balance Post-Move</th>
                    <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Landed Cost</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">Posted By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {mv?.map((m) => {
                    const isPositive = Number(m.qty) > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                          {fmtDate(m.move_date)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              m.type === 'RECEIPT' || m.type === 'TRANSFER_IN' || m.type === 'PROD_OUTPUT'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                                : m.type === 'DISPATCH' || m.type === 'TRANSFER_OUT' || m.type === 'PROD_CONSUMPTION'
                                ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-900 font-semibold">{m.ref_no}</span>
                            {m.note && (
                              <span className="text-[11px] text-slate-400 italic truncate max-w-[200px]" title={m.note}>
                                ({m.note})
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold ${
                            isPositive ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isPositive ? `+${n(m.qty)}` : n(m.qty)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-black text-slate-900">
                          {n(m.balance)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums text-slate-600 font-mono text-[11px]">
                          {inr(m.unit_cost, 2)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500 text-[11px]">
                          {m.user_name || 'System Worker'}
                        </td>
                      </tr>
                    );
                  })}
                  {mvLoading && (!mv || mv.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin text-brand-indigo" />
                          <span>Loading ledger movements...</span>
                        </div>
                      </td>
                    </tr>
                  ) : mv && mv.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No movement transactions found for this SKU.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                Audit Trail: Movements are immutable append-only records with FIFO/moving-average costing.
              </span>
              <Button variant="secondary" onClick={() => setLed(null)}>
                Close Ledger
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Manual Stock Adjustment Dialog */}
      {adj && (
        <Modal
          title="Manual Physical Stock Adjustment"
          onClose={() => setAdj(null)}
          maxWidth="max-w-lg"
        >
          <Msg err={adjErr} />
          <form onSubmit={handleAdjust} className="space-y-4">
            <Field label="Target Facility Node *">
              <select
                required
                value={adj.location_id ?? ''}
                onChange={(e) =>
                  setAdj({ ...adj, location_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium text-slate-800"
              >
                <option value="">— Select Facility —</option>
                {lk?.locations?.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.code} • {l.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Item SKU *">
              <select
                required
                value={adj.item_id ?? ''}
                onChange={(e) =>
                  setAdj({ ...adj, item_id: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium text-slate-800"
              >
                <option value="">— Select SKU —</option>
                {lk?.items?.map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.code} • {i.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quantity Adjustment (+ Found Physical / − Lost Scrap) *">
              <input
                type="number"
                step="any"
                required
                placeholder="e.g. +10 or -5"
                value={adj.qty}
                onChange={(e) => setAdj({ ...adj, qty: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium text-slate-800"
              />
            </Field>

            <Field label="Audit Reason / Physical Cycle Count Reference *">
              <textarea
                required
                rows={2}
                placeholder="Cycle count reconciliation, physical audit discrepancy, transit damage..."
                value={adj.reason ?? ''}
                onChange={(e) => setAdj({ ...adj, reason: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium text-slate-800"
              />
            </Field>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
              <span>
                Movements are permanent. Adjustments post an immutable <code className="font-mono font-bold">ADJUSTMENT</code> record to the ledger.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setAdj(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={adjBusy}>
                {adjBusy ? 'Posting Move...' : 'Post Adjustment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
