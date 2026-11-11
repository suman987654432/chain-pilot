'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const nf = (v: number) =>
  Math.abs(v) >= 1e7
    ? (v / 1e7).toFixed(1) + ' Cr'
    : Math.abs(v) >= 1e5
    ? (v / 1e5).toFixed(1) + ' L'
    : Math.round(v).toLocaleString('en-IN');

function UnifiedDemandTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  const isForecast = p.isForecast;
  const val = isForecast
    ? p.forecastDemand ?? p.forecast
    : p.actualDemand ?? p.actual;

  return (
    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[200px]">
      <div className="font-bold text-slate-300 pb-1.5 border-b border-slate-800 flex items-center justify-between">
        <span className="text-white text-sm font-black">{label}</span>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
            isForecast
              ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
          }`}
        >
          {isForecast ? 'AI Forecast' : 'Recorded Actual'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-400 font-medium">Demand Volume:</span>
        <span className="font-mono font-black text-white text-sm">
          {Number(val || 0).toLocaleString('en-IN')} units
        </span>
      </div>
      {p.actual != null && p.forecast != null && (
        <div className="pt-1.5 mt-1 border-t border-slate-800 text-[11px] flex items-center justify-between text-slate-300">
          <span className="text-slate-400">Model Variance:</span>
          <span
            className={`font-black ${
              Number(p.actual) >= Number(p.forecast)
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {Number(p.actual) >= Number(p.forecast) ? '+' : ''}
            {(
              ((Number(p.actual) - Number(p.forecast)) / Number(p.forecast)) *
              100
            ).toFixed(1)}
            %
          </span>
        </div>
      )}
    </div>
  );
}

export function DemandChart({
  rows,
  height = 290,
}: {
  rows: {
    label: string;
    actual?: number | null;
    fitted?: number | null;
    forecast?: number | null;
    final?: number | null;
  }[];
  height?: number;
}) {
  const [viewMode, setViewMode] = useState<'area' | 'bar'>('area');

  // Find transition point: last row that had actual demand
  let lastActualIdx = -1;
  rows.forEach((r, i) => {
    if (r.actual != null) lastActualIdx = i;
  });

  const transitionLabel =
    lastActualIdx >= 0 ? rows[lastActualIdx]?.label : null;

  const data = rows.map((r, i) => {
    const act = r.actual != null ? Number(r.actual) : null;
    const fcast =
      r.final != null
        ? Number(r.final)
        : r.forecast != null
        ? Number(r.forecast)
        : null;

    const isAfterActual = lastActualIdx >= 0 && i > lastActualIdx;

    return {
      label: r.label,
      actual: act,
      forecast: fcast,
      isForecast: isAfterActual,
      // Continuous demand for single Area Chart
      actualDemand: i <= lastActualIdx ? act : null,
      forecastDemand:
        i === lastActualIdx
          ? act // bridge the transition seamlessly so there's zero gap!
          : i > lastActualIdx
          ? fcast
          : null,
    };
  });

  return (
    <div className="space-y-3 font-sans w-full min-w-0">
      {/* Chart Mode Switcher Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-3 font-medium flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-indigo-700 font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 shadow-2xs" />
            Actual Sales
          </span>
          <span className="inline-flex items-center gap-1.5 text-pink-700 font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-pink-500 shadow-2xs" />
            Engine Forecast
          </span>
        </div>

        <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('area')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'area'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Continuous Curve
          </button>
          <button
            onClick={() => setViewMode('bar')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'bar'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Unified Bars
          </button>
        </div>
      </div>

      {/* ONE Single Unified Chart */}
      <div className="w-full min-w-0 relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'area' ? (
            <AreaChart
              data={data}
              margin={{ top: 12, right: 12, left: -8, bottom: 4 }}
            >
              <defs>
                <linearGradient id="actualAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f1f5f9"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                dy={6}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={42}
                tickFormatter={(v) => nf(v)}
              />
              <RechartsTooltip content={<UnifiedDemandTooltip />} />
              {transitionLabel && (
                <ReferenceLine
                  x={transitionLabel}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Forecast Horizon →',
                    position: 'top',
                    fill: '#64748b',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}
              {/* Seamless Single Curve: Actual Part */}
              <Area
                type="monotone"
                dataKey="actualDemand"
                name="Actual Sales"
                stroke="#6366f1"
                strokeWidth={3}
                fill="url(#actualAreaGrad)"
                dot={{
                  r: 3.5,
                  fill: '#6366f1',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: '#6366f1',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
              />
              {/* Seamless Single Curve: Forecast Part */}
              <Area
                type="monotone"
                dataKey="forecastDemand"
                name="Engine Forecast"
                stroke="#ec4899"
                strokeWidth={3}
                strokeDasharray="4 4"
                fill="url(#forecastAreaGrad)"
                dot={{
                  r: 4,
                  fill: '#ec4899',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: '#ec4899',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          ) : (
            <BarChart
              data={data}
              margin={{ top: 12, right: 12, left: -8, bottom: 4 }}
            >
              <defs>
                <linearGradient id="barActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#c7d2fe" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="barForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#fbcfe8" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f1f5f9"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                dy={6}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={42}
                tickFormatter={(v) => nf(v)}
              />
              <RechartsTooltip content={<UnifiedDemandTooltip />} />
              {transitionLabel && (
                <ReferenceLine
                  x={transitionLabel}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Forecast Horizon →',
                    position: 'top',
                    fill: '#64748b',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}
              {/* Actual Months: Rendered as unified bars */}
              <Bar
                dataKey="actual"
                name="Actual Sales"
                fill="url(#barActual)"
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
              />
              {/* Forecast Months: Rendered as unified bars */}
              <Bar
                dataKey="forecast"
                name="Engine Forecast"
                fill="url(#barForecast)"
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NetworkHealthDonut({
  data,
  total,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
}) {
  return (
    <div className="relative w-44 h-44 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={74}
            paddingAngle={3}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-black text-slate-900 tracking-tight">
          {total}
        </span>
        <span className="text-[10px] uppercase font-bold text-slate-400">
          Total SKUs
        </span>
      </div>
    </div>
  );
}
