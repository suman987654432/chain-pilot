'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const nf = (v: number) =>
  Math.abs(v) >= 1e7
    ? (v / 1e7).toFixed(1) + ' Cr'
    : Math.abs(v) >= 1e5
    ? (v / 1e5).toFixed(1) + ' L'
    : Math.round(v).toLocaleString('en-IN');

// Dynamic Client-Only Recharts components (Zero SSR crash, Zero Hydration error)
export const DemandChart = dynamic(
  () => import('./RechartsComponents').then((m) => m.DemandChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[280px] bg-slate-50/50 rounded-2xl animate-pulse flex items-center justify-center text-xs text-slate-400 font-medium">
        Loading interactive telemetry engine...
      </div>
    ),
  }
);

const NetworkHealthDonut = dynamic(
  () => import('./RechartsComponents').then((m) => m.NetworkHealthDonut),
  {
    ssr: false,
    loading: () => (
      <div className="w-44 h-44 rounded-full border-4 border-slate-100 animate-pulse flex items-center justify-center text-xs text-slate-400" />
    ),
  }
);

export function Legend({
  items,
}: {
  items: [string, string, ('bar' | 'dash' | 'solid')?][];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 text-xs font-semibold text-slate-600">
      {items.map(([color, label, type]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          {type === 'bar' ? (
            <span
              className="w-3 h-3 rounded-sm shadow-2xs"
              style={{ backgroundColor: color }}
            />
          ) : type === 'dash' ? (
            <span
              className="w-3.5 h-0.5 border-t-2 border-dashed"
              style={{ borderColor: color }}
            />
          ) : (
            <span
              className="w-3.5 h-0.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          )}
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}

export function HBars({
  rows,
  format = 'n',
  color = '#3B4FE0',
}: {
  rows: { label: string; value: number; sub?: string }[];
  format?: 'n' | 'inr';
  color?: string;
}) {
  const fmt = (v: number) =>
    format === 'inr'
      ? v >= 1e7
        ? `₹${(v / 1e7).toFixed(2)} Cr`
        : `₹${(v / 1e5).toFixed(1)} L`
      : nf(v);

  const total = rows.reduce((acc, r) => acc + (Number(r.value) || 0), 0) || 1;
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  const plantVal = rows.filter((r) => r.sub?.toLowerCase().includes('plant')).reduce((a, b) => a + b.value, 0);
  const whVal = rows.filter((r) => r.sub?.toLowerCase().includes('warehouse')).reduce((a, b) => a + b.value, 0);
  const depotVal = rows.filter((r) => r.sub?.toLowerCase().includes('depot')).reduce((a, b) => a + b.value, 0);

  const plantPct = Math.round((plantVal / total) * 100);
  const whPct = Math.round((whVal / total) * 100);
  const depotPct = Math.max(1, 100 - plantPct - whPct);

  const FACILITY_NAMES: Record<string, string> = {
    'PLT-BPL': 'Bhopal Central Plant',
    'WH-DEL': 'Delhi Regional Hub',
    'WH-MUM': 'Mumbai Regional Hub',
    'WH-BLR': 'Bengaluru Regional Hub',
    'DEP-PUN': 'Pune Distribution Depot',
  };

  return (
    <div className="space-y-4">
      {/* Tier Split Progress Bar & Chips */}
      <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <span>Tier Capital Allocation</span>
          <span>{fmt(total)}</span>
        </div>
        <div className="h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden flex gap-0.5 p-0.5">
          <div
            title={`Plant: ${fmt(plantVal)} (${plantPct}%)`}
            style={{ width: `${plantPct}%` }}
            className="h-full bg-indigo-600 rounded-l-full"
          />
          <div
            title={`Warehouses: ${fmt(whVal)} (${whPct}%)`}
            style={{ width: `${whPct}%` }}
            className="h-full bg-sky-500"
          />
          <div
            title={`Depots: ${fmt(depotVal)} (${depotPct}%)`}
            style={{ width: `${depotPct}%` }}
            className="h-full bg-amber-500 rounded-r-full"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium pt-1">
          <span className="inline-flex items-center gap-1.5 text-indigo-700 font-bold">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            Plant: {fmt(plantVal)} ({plantPct}%)
          </span>
          <span className="inline-flex items-center gap-1.5 text-sky-700 font-bold">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            WH: {fmt(whVal)} ({whPct}%)
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-700 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Depot: {fmt(depotVal)} ({depotPct}%)
          </span>
        </div>
      </div>

      {/* Ranked Node Rows */}
      <div className="space-y-2">
        {sorted.map((r, i) => {
          const pct = ((r.value / total) * 100).toFixed(1);
          const typeColor =
            r.sub?.toLowerCase() === 'plant'
              ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
              : r.sub?.toLowerCase() === 'warehouse'
              ? 'text-sky-700 bg-sky-50 border-sky-200'
              : 'text-amber-700 bg-amber-50 border-amber-200';

          return (
            <div
              key={r.label}
              className="p-2.5 px-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-2xs transition-all space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 font-mono font-bold text-[10px] flex items-center justify-center">
                    #{i + 1}
                  </span>
                  <span className="font-mono font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    {r.label}
                  </span>
                  <span className="text-slate-600 font-medium truncate max-w-[130px] hidden sm:inline">
                    {FACILITY_NAMES[r.label] || r.label}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${typeColor}`}>
                    {r.sub}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">{pct}%</span>
                  <span className="font-mono font-black text-slate-900 text-xs sm:text-sm">
                    {fmt(r.value)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-indigo-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HEALTH_CONFIG: Record<
  string,
  { label: string; color: string; badge: string; dot: string }
> = {
  HEALTHY: { label: 'Healthy', color: '#10b981', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  EXCESS: { label: 'Excess', color: '#8b5cf6', badge: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  STOCKOUT: { label: 'Stockout', color: '#ef4444', badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  BELOW_SS: { label: 'Below SS', color: '#f97316', badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  REORDER: { label: 'Reorder', color: '#f59e0b', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  NO_DEMAND: { label: 'No Demand', color: '#94a3b8', badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

export function HealthBars({
  rows,
}: {
  rows: { code: string; health: string; n: number }[];
}) {
  const locs = [...new Set(rows.map((r) => r.code))];

  // Global status counts
  const totalsByStatus = Object.keys(HEALTH_CONFIG).reduce((acc, h) => {
    acc[h] = rows.filter((r) => r.health === h).reduce((sum, r) => sum + Number(r.n || 0), 0);
    return acc;
  }, {} as Record<string, number>);

  const grandTotal = Object.values(totalsByStatus).reduce((a, b) => a + b, 0) || 1;

  const pieData = Object.entries(HEALTH_CONFIG)
    .map(([key, meta]) => ({
      name: meta.label,
      value: totalsByStatus[key] || 0,
      color: meta.color,
    }))
    .filter((d) => d.value > 0);

  const FACILITY_META: Record<string, { name: string; type: string }> = {
    'PLT-BPL': { name: 'Bhopal Central Plant', type: 'Plant' },
    'WH-DEL': { name: 'Delhi Regional Hub', type: 'Warehouse' },
    'WH-MUM': { name: 'Mumbai Regional Hub', type: 'Warehouse' },
    'WH-BLR': { name: 'Bengaluru Regional Hub', type: 'Warehouse' },
    'DEP-PUN': { name: 'Pune Distribution Depot', type: 'Depot' },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
      {/* 1. Left: Recharts Donut & Network Summary (4 cols) */}
      <div className="lg:col-span-4 p-4 rounded-2xl bg-slate-50/70 border border-slate-100 flex flex-col items-center justify-center space-y-4">
        <div className="text-center">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Network Health Breakdown
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">Active SKU distribution</p>
        </div>

        <NetworkHealthDonut data={pieData} total={grandTotal} />

        {/* Global Summary Chips */}
        <div className="w-full grid grid-cols-2 gap-2 text-xs">
          {pieData.map((d) => (
            <div
              key={d.name}
              className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-[11px] font-semibold text-slate-600">{d.name}</span>
              </div>
              <span className="font-mono font-black text-slate-900 text-xs">
                {d.value} <span className="text-[10px] text-slate-400 font-normal">({Math.round((d.value / grandTotal) * 100)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Right: Clean Facility Health Matrix (8 cols) */}
      <div className="lg:col-span-8 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
              <th className="pb-2.5 px-3">Facility</th>
              <th className="pb-2.5 px-2 text-center">SKUs</th>
              <th className="pb-2.5 px-3">Health Distribution Bar</th>
              <th className="pb-2.5 px-3 text-right">Assessment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {locs.map((l) => {
              const rs = rows.filter((r) => r.code === l);
              const tot = rs.reduce((a, r) => a + Number(r.n), 0);
              const meta = FACILITY_META[l] || { name: l, type: 'Node' };

              const stockouts = Number(rs.find((r) => r.health === 'STOCKOUT')?.n ?? 0);
              const belowSS = Number(rs.find((r) => r.health === 'BELOW_SS')?.n ?? 0);
              const reorders = Number(rs.find((r) => r.health === 'REORDER')?.n ?? 0);
              const healthy = Number(rs.find((r) => r.health === 'HEALTHY')?.n ?? 0);
              const excess = Number(rs.find((r) => r.health === 'EXCESS')?.n ?? 0);

              return (
                <tr key={l} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                        {l}
                      </span>
                      <div>
                        <div className="font-bold text-slate-800">{meta.name}</div>
                        <span className="text-[10px] text-slate-400 capitalize">({meta.type})</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-2 text-center font-bold font-mono text-slate-700">
                    {tot}
                  </td>

                  <td className="py-3 px-3 min-w-[200px]">
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex gap-0.5 p-0.5 shadow-inner">
                      {Object.entries(HEALTH_CONFIG).map(([h, c]) => {
                        const count = Number(rs.find((r) => r.health === h)?.n ?? 0);
                        if (!count) return null;
                        const pct = (count / (tot || 1)) * 100;
                        return (
                          <div
                            key={h}
                            title={`${c.label}: ${count} SKUs (${pct.toFixed(0)}%)`}
                            className="h-full rounded-full transition-all cursor-pointer"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: c.color,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                      {stockouts > 0 && <span className="text-rose-600 font-bold">{stockouts} out</span>}
                      {belowSS > 0 && <span className="text-orange-600 font-bold">{belowSS} below ss</span>}
                      {healthy > 0 && <span className="text-emerald-600 font-medium">{healthy} healthy</span>}
                      {excess > 0 && <span className="text-purple-600 font-medium">{excess} excess</span>}
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right">
                    {stockouts > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        {stockouts} Stockout
                      </span>
                    ) : belowSS > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-orange-50 text-orange-700 border border-orange-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        {belowSS} Below SS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        100% In-Stock
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProjectionChart({
  grid,
  ss,
}: {
  grid: any[];
  ss: number;
}) {
  const W = 900;
  const H = 180;
  const P = 48;
  const B = 28;

  const vals = grid.map((g) => Number(g.projected));
  const max = Math.max(ss * 1.5, ...vals, 1);
  const min = Math.min(0, ...vals);

  const bw = (W - P - 16) / grid.length;
  const x = (i: number) => P + i * bw + bw / 2;
  const y = (v: number) => H - B - ((v - min) / (max - min || 1)) * (H - B - 16);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[650px] font-sans select-none"
      >
        <line
          x1={P}
          x2={W - 16}
          y1={y(ss)}
          y2={y(ss)}
          stroke="#d97706"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        <text
          x={W - 20}
          y={y(ss) - 6}
          fontSize="11"
          fontWeight="600"
          textAnchor="end"
          fill="#d97706"
        >
          Safety Stock: {Math.round(ss)}
        </text>

        {min < 0 && (
          <line
            x1={P}
            x2={W - 16}
            y1={y(0)}
            y2={y(0)}
            stroke="#ef4444"
            strokeWidth="1.5"
          />
        )}

        {grid.map((g, i) => {
          const val = Number(g.projected);
          const barY = Math.min(y(val), y(0));
          const barH = Math.abs(y(0) - y(val));
          const isUnderSS = val < ss;

          return (
            <rect
              key={i}
              x={x(i) - bw * 0.32}
              y={barY}
              width={bw * 0.64}
              height={Math.max(2, barH)}
              rx="3"
              fill={isUnderSS ? '#f97316' : '#10b981'}
              opacity="0.85"
            >
              <title>{`Week ${g.week}: Projected ${val}`}</title>
            </rect>
          );
        })}

        {grid.map(
          (g, i) =>
            Number(g.planned) > 0 && (
              <text
                key={'p' + i}
                x={x(i)}
                y={y(Number(g.projected)) - 6}
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
                fill="#3B4FE0"
              >
                +{g.planned}
              </text>
            )
        )}

        {grid.map((g, i) => (
          <text
            key={'l' + i}
            x={x(i)}
            y={H - 8}
            fontSize="10"
            textAnchor="middle"
            fill="#64748b"
          >
            {new Date(g.week).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
            })}
          </text>
        ))}

        <text
          x={P - 8}
          y={y(max) + 4}
          fontSize="10"
          textAnchor="end"
          fill="#64748b"
        >
          {nf(max)}
        </text>
        <text
          x={P - 8}
          y={y(min) + 4}
          fontSize="10"
          textAnchor="end"
          fill="#64748b"
        >
          {nf(min)}
        </text>
      </svg>
    </div>
  );
}
