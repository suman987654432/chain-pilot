'use client';

import React, { useState } from 'react';
import { apiCall, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { DemandChart, Legend } from '@/components/Charts';
import { Play, TrendingUp, Sparkles, AlertCircle, Edit3, RefreshCw } from 'lucide-react';

const M = (p: string) =>
  new Date(p + 'T00:00:00').toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  });

function Spark({ vals }: { vals: number[] }) {
  const max = Math.max(1, ...vals);
  return (
    <svg width="84" height="20" className="inline-block">
      {vals.map((v, i) => (
        <rect
          key={i}
          x={i * 7}
          y={20 - (v / max) * 18}
          width="5"
          height={(v / max) * 18}
          rx="1"
          fill="#c7d2fe"
        />
      ))}
    </svg>
  );
}

export default function DemandPage() {
  const [loc, setLoc] = useState('');
  const { data, reload, error, loading } = useData<any>(
    `/api/demand/forecast${loc ? `?location_id=${loc}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [sel, setSel] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: det, reload: rd, loading: detLoading } = useData<any>(
    sel
      ? `/api/demand/detail?item_id=${sel.item_id}&location_id=${sel.location_id}`
      : null
  );

  const months: string[] = data?.rows?.[0]?.fc?.map((f: any) => f.period) ?? [];

  const handleRunForecast = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await apiCall('/api/demand/forecast', 'POST');
      setOk(
        `Forecast refreshed for ${res.forecasted} item × location series. Safety stock & ROP policies updated.`
      );
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiCall('/api/demand/override', 'POST', {
        item_id: sel.item_id,
        location_id: sel.location_id,
        period: ov.period,
        qty: ov.qty === '' ? null : Number(ov.qty),
        note: ov.note,
      });
      setOv(null);
      rd();
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Demand Forecast Workbench
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Automated model selection (SMA3, SES, Holt, Seasonal) via holdout MAPE minimization.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium text-slate-800"
          >
            <option value="">All Locations</option>
            {lk?.locations.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.code} • {l.name}
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            disabled={busy}
            onClick={handleRunForecast}
            className="gap-2 shadow-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{busy ? 'Running Models...' : 'Run Forecast'}</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[980px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Item SKU</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Location</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">12M History</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Best Model</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">MAPE</th>
                {months.map((m) => (
                  <th key={m} className="py-2.5 px-3 text-right whitespace-nowrap font-mono">
                    {M(m)}
                  </th>
                ))}
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Safety Stock</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">ROP</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {data?.rows.map((r: any) => {
                const isSelected =
                  sel?.item_id === r.item_id &&
                  sel?.location_id === r.location_id;

                return (
                  <tr
                    key={`${r.item_id}:${r.location_id}`}
                    onClick={() => setSel(r)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                          {r.code}
                        </span>
                        <span className="text-slate-800 font-semibold text-xs truncate max-w-[160px]" title={r.name}>
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                        {r.location_code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <Spark vals={(r.hist ?? []).map((h: any) => Number(h.qty))} />
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {r.method ?? '—'}
                      </span>
                    </td>
                    <td
                      className={`py-2.5 px-3.5 text-right tabular-nums whitespace-nowrap font-bold ${
                        Number(r.mape) > 25 ? 'text-amber-600' : 'text-slate-700'
                      }`}
                    >
                      {r.mape != null ? `${Number(r.mape).toFixed(1)}%` : '—'}
                    </td>
                    {months.map((m, i) => {
                      const f = r.fc?.[i];
                      const isOverridden = f?.override != null;
                      return (
                        <td
                          key={m}
                          title={f?.note ?? ''}
                          className={`py-2.5 px-3 text-right tabular-nums whitespace-nowrap ${
                            isOverridden
                              ? 'font-black text-brand-pink bg-pink-50/70 border border-pink-200/50 rounded'
                              : 'text-slate-700 font-medium'
                          }`}
                        >
                          {isOverridden ? f.override : f?.system ?? 0}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3.5 text-right tabular-nums whitespace-nowrap font-semibold text-slate-900">
                      {Number(r.safety_stock)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right tabular-nums whitespace-nowrap font-semibold text-slate-900">
                      {Number(r.reorder_point)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {r.abc && (
                        <div className="flex items-center gap-1 font-mono">
                          <span className={`badge-status s-${r.abc} px-1.5 text-[10px]`}>
                            {r.abc}
                          </span>
                          <span className={`badge-status s-${r.xyz} px-1.5 text-[10px]`}>
                            {r.xyz}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {loading && (!data?.rows || data.rows.length === 0) ? (
                <TableLoadingRow
                  colSpan={9 + months.length}
                  text="Calculating statistical models and loading demand history..."
                />
              ) : data?.rows && data.rows.length === 0 ? (
                <tr>
                  <td colSpan={9 + months.length} className="py-12 text-center text-slate-400 font-medium">
                    No demand forecast series found for this location
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Item Detail Chart & Parameters */}
      {sel && detLoading && !det && (
        <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center gap-2 text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin text-brand-indigo" />
          <span className="text-xs font-semibold">Loading demand series details...</span>
        </div>
      )}
      {sel && det && (
        <div className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4 min-w-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {det.code} • {det.name}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-brand-indigo font-bold border border-indigo-100 font-mono">
                  @{det.location_code}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>Winning Model: <b className="text-slate-800">{det.model.method}</b></span>
                <span>•</span>
                <span>Back-test MAPE: <b className="text-slate-800">{det.model.mape ?? '—'}%</b></span>
                <span>•</span>
                <span>Error σ: <b className="text-slate-800">{det.model.rmse}/mo</b></span>
                <span>•</span>
                <span>Service Level: <b className="text-slate-800">{Number(det.service_level)}%</b></span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Legend
                items={[
                  ['#c7d2fe', 'Actual', 'bar'],
                  ['#94a3b8', 'Fitted', 'dash'],
                  ['#3B4FE0', 'Statistical', 'dash'],
                  ['#E91E7B', 'Final Forecast', 'solid'],
                ]}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setOv({
                    period: det.forecast[1]?.period ?? det.forecast[0]?.period,
                    qty: '',
                    note: '',
                  })
                }
                className="gap-1.5 text-brand-pink border-pink-200 hover:bg-pink-50 text-xs font-semibold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Override</span>
              </Button>
            </div>
          </div>

          <DemandChart
            rows={[
              ...det.history
                .filter((h: any) => h.period < data.current)
                .map((h: any) => ({
                  label: M(h.period),
                  actual: Number(h.qty),
                  fitted: h.fitted != null ? Math.round(h.fitted) : null,
                })),
              ...det.forecast.map((f: any) => ({
                label: M(f.period),
                actual: det.history.find((h: any) => h.period === f.period)
                  ? Number(
                      det.history.find((h: any) => h.period === f.period).qty
                    )
                  : null,
                forecast: Number(f.system_qty),
                final: Number(f.override_qty ?? f.system_qty),
              })),
            ]}
            height={260}
          />
        </div>
      )}

      {/* Override Dialog */}
      {ov && det && (
        <Modal
          title={`Override Demand Forecast — ${det.code} @ ${det.location_code}`}
          onClose={() => setOv(null)}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveOverride} className="space-y-4">
            <Field label="Month to Override *">
              <select
                required
                value={ov.period}
                onChange={(e) => setOv({ ...ov, period: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              >
                {det.forecast.map((f: any) => (
                  <option key={f.period} value={f.period}>
                    {M(f.period)} — Statistical {Number(f.system_qty)}
                    {f.override_qty != null ? ` (Current Override: ${Number(f.override_qty)})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="New Demand Quantity (Leave blank to remove override)">
              <input
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={ov.qty}
                onChange={(e) => setOv({ ...ov, qty: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <Field label="Business Justification (Required if setting value) *">
              <input
                type="text"
                placeholder="Dealer pre-season scheme, marketing push, export order..."
                value={ov.note}
                onChange={(e) => setOv({ ...ov, note: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setOv(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Apply Override
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

