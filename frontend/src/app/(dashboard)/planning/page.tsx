'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, useData } from '@/lib/client';
import { Button, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { ProjectionChart } from '@/components/Charts';
import { Play, CheckSquare, XCircle, Grid, Cpu, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');
const W = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export default function PlanningPage() {
  const { data, reload, error, loading } = useData<any>('/api/planning');
  const [tab, setTab] = useState<'orders' | 'items'>('orders');
  const [sel, setSel] = useState<number[]>([]);
  const [kind, setKind] = useState('');
  const [exOnly, setExOnly] = useState(true);
  const [grid, setGrid] = useState<any>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: g, loading: gLoading } = useData<any>(
    grid
      ? `/api/planning/grid?item_id=${grid.item_id}&location_id=${grid.location_id}`
      : null
  );

  const run = data?.run;
  const orders = (data?.orders ?? []).filter(
    (o: any) => o.status === 'OPEN' && (!kind || o.kind === kind)
  );

  const handleRunMRP = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await apiCall('/api/planning', 'POST');
      setOk(
        `MRP/DRP completed: ${r.planned_orders} planned orders (${r.transfer} transfers, ${r.make} production, ${r.buy} purchase) • ${r.past_due} past due • ${r.exceptions} exceptions`
      );
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (actionPath: string, ids: number[]) => {
    setErr('');
    setOk('');
    setBusy(true);
    try {
      const r = await apiCall(actionPath, 'POST', { ids });
      setOk(
        r.created
          ? `Successfully firmed ${r.created.length} orders: ${r.created.join(', ')}`
          : `Dismissed ${r.dismissed} orders`
      );
      setSel([]);
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              MRP / DRP Planning Engine
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {run ? (
              <span>
                Run as of {new Date(run.run_at).toLocaleString('en-IN')} by{' '}
                <b className="text-slate-700">{run.run_by_name}</b> • 12 weekly planning buckets from {fmtDate(run.start_week)}
              </span>
            ) : (
              '12-week time-phased netting across multi-echelon network and Bills of Materials'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={busy}
            onClick={handleRunMRP}
            className="gap-2 shadow-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{busy ? 'Running Engine...' : 'Run MRP / DRP'}</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} ok={ok} />

      {/* Summary KPI Cards */}
      {run && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Total Proposals
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {run.summary.planned_orders}
            </div>
            <div className="text-xs text-rose-600 font-semibold mt-1">
              {run.summary.past_due} past due release
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Transfers (DRP)
            </span>
            <div className="text-2xl font-black text-brand-pink mt-1">
              {run.summary.transfer}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1">
              Inter-facility replenishment
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Production (MPS)
            </span>
            <div className="text-2xl font-black text-brand-teal mt-1">
              {run.summary.make}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1">
              Plant manufacturing orders
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Purchases (MRP)
            </span>
            <div className="text-2xl font-black text-brand-indigo mt-1">
              {run.summary.buy}
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1">
              Raw materials & traded goods
            </div>
          </div>
        </div>
      )}

      {/* Toolbar Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setTab('orders')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === 'orders'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Planned Orders ({orders.length})
          </button>
          <button
            onClick={() => setTab('items')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === 'items'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Items & Exceptions
          </button>
        </div>

        {tab === 'orders' ? (
          <div className="flex items-center gap-3">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
            >
              <option value="">All Types (BUY / MAKE / TRANSFER)</option>
              <option value="BUY">BUY Only</option>
              <option value="MAKE">MAKE Only</option>
              <option value="TRANSFER">TRANSFER Only</option>
            </select>

            <Button
              variant="secondary"
              size="sm"
              disabled={!sel.length || busy}
              onClick={() => handleAction('/api/planning/dismiss', sel)}
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!sel.length || busy}
              onClick={() => handleAction('/api/planning/convert', sel)}
              className="gap-1.5 shadow-sm"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Firm {sel.length ? `(${sel.length})` : ''} → PR / TO / MO</span>
            </Button>
          </div>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={exOnly}
              onChange={(e) => setExOnly(e.target.checked)}
              className="w-4 h-4 text-brand-indigo rounded focus:ring-brand-indigo"
            />
            <span>Show Exceptions Only</span>
          </label>
        )}
      </div>

      {/* Tab 1: Planned Orders */}
      {tab === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[920px]">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-8 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={
                        orders.length > 0 && sel.length === orders.length
                      }
                      onChange={(e) =>
                        setSel(e.target.checked ? orders.map((o: any) => o.id) : [])
                      }
                      className="w-4 h-4 text-brand-indigo rounded"
                    />
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Type</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Item SKU</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Destination</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Source / Supplier</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Quantity</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Release Date</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Need Date</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Estimated Value</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Grid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {orders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={sel.includes(o.id)}
                        onChange={(e) =>
                          setSel(
                            e.target.checked
                              ? [...sel, o.id]
                              : sel.filter((x) => x !== o.id)
                          )
                        }
                        className="w-4 h-4 text-brand-indigo rounded"
                      />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusBadge s={o.kind} />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                          {o.item_code}
                        </span>
                        <span className="text-slate-800 font-semibold text-xs truncate max-w-[150px]" title={o.item_name}>
                          {o.item_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                        {o.location_code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {o.source_code ??
                        o.supplier ??
                        (o.kind === 'MAKE' ? (
                          <span className="font-semibold text-teal-700">Production</span>
                        ) : (
                          <span className="text-rose-600 font-bold">No Source</span>
                        ))}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {n(o.qty)} <span className="text-[10px] text-slate-400 font-normal">{o.uom}</span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                      <span className={o.past_due ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                        {fmtDate(o.release_date)}
                      </span>
                      {o.past_due && (
                        <span className="badge-status s-EXPEDITE px-1.5 py-0 text-[9px] ml-1.5">
                          Past Due
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">{fmtDate(o.need_date)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {inr(o.value)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setGrid(o)}
                        className="p-1 px-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-brand-indigo transition-colors"
                      >
                        Grid
                      </button>
                    </td>
                  </tr>
                ))}
                {loading && (!orders || orders.length === 0) ? (
                  <TableLoadingRow
                    colSpan={10}
                    text="Loading planning engine orders and requirements..."
                  />
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                      No open planned orders found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Items & Exceptions */}
      {tab === 'items' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[880px]">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Item SKU</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Location</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Source</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">On Hand</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Safety Stock</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">12-Wk Req</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Min Projected</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Exceptions Flagged</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {data?.items
                  .filter((i: any) => !exOnly || i.exceptions.length > 0)
                  .map((i: any) => {
                    const isBelowSS =
                      Number(i.min_projected) < Number(i.safety_stock);
                    return (
                      <tr
                        key={`${i.item_id}:${i.location_id}`}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                              {i.code}
                            </span>
                            <span className="text-slate-800 font-semibold text-xs truncate max-w-[160px]" title={i.name}>
                              {i.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                            {i.location_code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <StatusBadge s={i.source} />
                        </td>
                        <td className="py-2.5 px-3.5 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {n(i.on_hand)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {n(i.safety_stock)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {n(i.total_req)}
                        </td>
                        <td
                          className={`py-2.5 px-3.5 text-right tabular-nums font-bold whitespace-nowrap ${
                            isBelowSS ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {n(i.min_projected)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {i.exceptions.map((exName: string) => (
                              <span
                                key={exName}
                                className={`badge-status s-${exName} text-[9px] px-1.5 py-0`}
                              >
                                {exName.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => setGrid(i)}
                            className="p-1 px-2.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-brand-indigo transition-colors"
                          >
                            Grid
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {loading && (!data?.items || data.items.length === 0) ? (
                  <TableLoadingRow
                    colSpan={9}
                    text="Loading netting exceptions and supply policies..."
                  />
                ) : data?.items && data.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                      No items match current filter criteria.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time-Phased Grid Modal */}
      {grid && gLoading && !g && (
        <Modal
          title="Time-Phased Netting Grid — Loading..."
          onClose={() => setGrid(null)}
          maxWidth="max-w-5xl"
        >
          <div className="py-12 flex items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-indigo" />
            <span className="text-sm font-semibold">Loading time-phased netting calculations...</span>
          </div>
        </Modal>
      )}
      {grid && g && (
        <Modal
          title={`Time-Phased Netting Grid — ${g.code} @ ${g.location_code} (${g.source})`}
          onClose={() => setGrid(null)}
          maxWidth="max-w-5xl"
        >
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs font-medium text-slate-600">
              <div>
                On Hand: <b className="text-slate-900">{n(g.on_hand)}</b> • Safety Stock:{' '}
                <b className="text-slate-900">{n(g.safety_stock)}</b> • Reorder Point:{' '}
                <b className="text-slate-900">{n(g.reorder_point)}</b>
              </div>
              <div className="flex gap-1.5">
                {g.exceptions.map((e: string) => (
                  <span key={e} className={`badge-status s-${e} text-[10px]`}>
                    {e.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>

            {/* Projection Chart */}
            <ProjectionChart grid={g.grid} ss={Number(g.safety_stock)} />

            {/* Matrix Table */}
            <div className="overflow-x-auto border border-slate-100 rounded-xl w-full">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[160px] whitespace-nowrap">Planning Row</th>
                    {g.grid.map((w: any) => (
                      <th key={w.week} className="py-2.5 px-2 text-right whitespace-nowrap font-mono">
                        {W(w.week)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {[
                    ['Gross Requirements', 'gross'],
                    ['Dependent Demand', 'dependent'],
                    ['Scheduled Receipts', 'scheduled'],
                    ['Planned Receipts', 'planned'],
                    ['Projected On Hand', 'projected'],
                    ['Planned Order Release', 'release'],
                  ].map(([label, key]) => (
                    <tr key={key} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">{label}</td>
                      {g.grid.map((w: any) => {
                        const val = Number(w[key]);
                        const isUnder =
                          key === 'projected' && val < Number(g.safety_stock);
                        const isPlan = key === 'planned' && val > 0;
                        const isRel = key === 'release' && val > 0;

                        return (
                          <td
                            key={w.week}
                            className={`py-2.5 px-2 text-right tabular-nums whitespace-nowrap ${
                              isPlan
                                ? 'font-black text-brand-indigo bg-indigo-50/60'
                                : isRel
                                ? 'font-black text-brand-pink bg-pink-50/60'
                                : isUnder
                                ? 'font-black text-rose-600 bg-rose-50/60'
                                : 'text-slate-700'
                            }`}
                          >
                            {val ? n(val) : key === 'projected' ? 0 : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/stock"
                className="text-xs font-bold text-brand-indigo hover:underline"
              >
                Inspect Network Inventory →
              </Link>
              <Button variant="secondary" onClick={() => setGrid(null)}>
                Close Window
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

