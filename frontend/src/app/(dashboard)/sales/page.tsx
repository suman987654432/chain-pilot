'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiCall, fmtDate, inr, todayStr, useData } from '@/lib/client';
import { Button, Field, Modal, Msg, StatusBadge, LoadingBadge, TableLoadingRow } from '@/components/ui';
import { ShoppingBag, Plus, Sparkles, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';

const n = (v: any) => Number(v ?? 0).toLocaleString('en-IN');

export default function SalesPage() {
  const [f, setF] = useState({ status: 'OPEN', location_id: '' });
  const queryParams = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as any
  ).toString();

  const { data, reload, error, loading } = useData<any[]>(
    `/api/sos${queryParams ? `?${queryParams}` : ''}`
  );
  const { data: lk } = useData<any>('/api/lookups');

  const [nso, setNso] = useState<any>(null);
  const [atp, setAtp] = useState<Record<number, any>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loc = nso
    ? nso.location_id ||
      lk?.customers.find((c: any) => c.id === nso.customer_id)?.ship_from
    : null;

  const checkATP = async (idx: number, line: any) => {
    if (!line.item_id || !line.qty || !loc) return;
    try {
      const res = await apiCall(
        `/api/atp?item_id=${line.item_id}&location_id=${loc}&qty=${line.qty}`
      );
      setAtp((prev) => ({ ...prev, [idx]: res }));
    } catch (_) {}
  };

  const handleCreateSO = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await apiCall('/api/sos', 'POST', {
        ...nso,
        lines: nso.lines.map((l: any) => ({
          item_id: l.item_id,
          qty: Number(l.qty),
        })),
      });
      setNso(null);
      reload();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Sales Orders
            </h1>
            {loading && <LoadingBadge text="Loading..." />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Customer demand, real-time Available-to-Promise (ATP) checking, stock reservation, and trip dispatch.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            className="px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
          >
            <option value="OPEN">Open (Open, Allocated, Partial)</option>
            <option value="">All Orders</option>
            {['DISPATCHED', 'DELIVERED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            onClick={() => {
              setNso({
                promised_date: todayStr(),
                priority: 3,
                lines: [{ item_id: '', qty: '' }],
              });
              setAtp({});
            }}
            className="gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Sales Order</span>
          </Button>
        </div>
      </div>

      <Msg err={err || error} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[960px]">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">SO Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Order Date</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Customer Name</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Ship Facility</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Promised Delivery</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Ordered Qty</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Allocated</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Shipped</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Delivered</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Value (incl. GST)</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && (!data || data.length === 0) ? (
                <TableLoadingRow
                  colSpan={11}
                  text="Fetching sales order ledger and real-time ATP allocations..."
                />
              ) : data && data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-medium">
                    No sales orders found for current filter.
                  </td>
                </tr>
              ) : (
                data?.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <Link
                        href={`/sales/${s.id}`}
                        className="font-mono font-bold text-brand-indigo hover:underline inline-flex items-center gap-1.5"
                      >
                        <span>{s.so_no}</span>
                      </Link>
                      {s.planned && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 ml-2 inline-block">
                          On Trip
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {fmtDate(s.order_date)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-900">
                      <span className="truncate max-w-[170px] inline-block align-bottom" title={s.customer}>{s.customer}</span>
                      {s.city && (
                        <span className="text-[10px] text-slate-400 font-normal block">
                          {s.city}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                        {s.location_code}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px]">
                      <span className={s.late ? 'text-rose-600 font-bold' : 'text-slate-800'}>
                        {fmtDate(s.promised_date)}
                      </span>
                      {s.late && (
                        <span className="ml-1 text-[9px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 uppercase">
                          Late
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                      {n(s.qty)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-semibold text-brand-indigo">
                      {n(s.allocated)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-semibold text-amber-600">
                      {n(s.shipped)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-bold text-emerald-600">
                      {n(s.delivered)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap tabular-nums font-black text-slate-900">
                      {inr(s.total)}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <StatusBadge s={s.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Sales Order Modal with Real-time ATP */}
      {nso && (
        <Modal
          title="Create Sales Order with Live ATP Check"
          onClose={() => setNso(null)}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreateSO} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer Account *">
                <select
                  required
                  value={nso.customer_id ?? ''}
                  onChange={(e) =>
                    setNso({ ...nso, customer_id: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  <option value="">— Select Customer —</option>
                  {lk?.customers.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} • {c.city}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ship From Facility">
                <select
                  value={nso.location_id ?? ''}
                  onChange={(e) =>
                    setNso({
                      ...nso,
                      location_id: Number(e.target.value) || null,
                    })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo font-medium"
                >
                  <option value="">Customer Default Facility</option>
                  {lk?.locations.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.code} • {l.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Promised Delivery Date *">
                <input
                  type="date"
                  required
                  value={nso.promised_date}
                  onChange={(e) =>
                    setNso({ ...nso, promised_date: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>

              <Field label="Customer PO Number">
                <input
                  type="text"
                  placeholder="e.g. PO/DEL/9021"
                  value={nso.customer_po ?? ''}
                  onChange={(e) =>
                    setNso({ ...nso, customer_po: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-indigo"
                />
              </Field>
            </div>

            {/* Line items with ATP feedback */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sales Items & Live Available-to-Promise
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setNso({
                      ...nso,
                      lines: [...nso.lines, { item_id: '', qty: '' }],
                    })
                  }
                  className="text-xs font-bold text-brand-indigo hover:underline"
                >
                  + Add Item
                </button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {nso.lines.map((l: any, i: number) => {
                  const a = atp[i];
                  return (
                    <div
                      key={i}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <select
                          required
                          value={l.item_id}
                          onChange={(e) => {
                            const ls = [...nso.lines];
                            ls[i] = { ...l, item_id: Number(e.target.value) };
                            setNso({ ...nso, lines: ls });
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-indigo font-medium"
                        >
                          <option value="">— Select Finished / Traded SKU —</option>
                          {lk?.items
                            .filter((x: any) =>
                              ['FINISHED', 'TRADED'].includes(x.type)
                            )
                            .map((x: any) => (
                              <option key={x.id} value={x.id}>
                                {x.code} • {x.name}
                              </option>
                            ))}
                        </select>

                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="Qty"
                          value={l.qty}
                          onChange={(e) => {
                            const ls = [...nso.lines];
                            ls[i] = { ...l, qty: e.target.value };
                            setNso({ ...nso, lines: ls });
                          }}
                          onBlur={() => checkATP(i, l)}
                          className="w-24 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                        />

                        {nso.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setNso({
                                ...nso,
                                lines: nso.lines.filter(
                                  (_: any, j: number) => j !== i
                                ),
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* ATP Result Display */}
                      <div className="text-[11px] font-semibold pl-1">
                        {a ? (
                          a.can_promise_on ? (
                            <span
                              className={
                                a.can_promise_on <= nso.promised_date
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }
                            >
                              ✓ Free stock now: <b>{Number(a.free)}</b>. Can promise delivery on{' '}
                              <b>{fmtDate(a.can_promise_on)}</b>
                            </span>
                          ) : (
                            <span className="text-rose-600">
                              ⚠ Free stock now: <b>{Number(a.free)}</b>. Not covered by confirmed incoming supply.
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">
                            Enter quantity & click out to check live promise date
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setNso(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Booking Order...' : 'Confirm Sales Order'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

